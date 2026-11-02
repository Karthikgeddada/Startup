"""Orchestrator tests (Phase 3) — the autonomous loop, driven by a scripted
FakeGateway instead of any network. Every test verifies the *persisted*
outcome (run status, run_tasks, events, messages) — never just a return value.

The FakeGateway is a real ModelGateway implementation: it answers in scripted
order and enforces the same budget semantics that matter here (it raises
BudgetExceededError when scripted to, exercising the loop's failure path).
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.agent import orchestrator
from app.agent.gateway import (
    BudgetExceededError,
    CompletionResult,
    EmbeddingResult,
    GatewayError,
    ModelGateway,
    ModelRole,
    StreamEvent,
    ToolCallRequest,
    ToolSpec,
    Usage,
)
from app.agent.gateway.base import ProviderError
from app.core.database import Base, SessionLocal, engine
from app.models import AgentRun, Approval, Conversation, Message, RunEvent, RunTask, User


@pytest.fixture(autouse=True)
def _fresh_schema():
    """Fresh database per test (the `client` fixture only covers API tests)."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


# ------------------------------------------------------------------ fakes


def _result(
    content: str | None = None,
    tool_calls: list[ToolCallRequest] | None = None,
) -> CompletionResult:
    return CompletionResult(
        content=content,
        tool_calls=tool_calls or [],
        finish_reason="stop",
        usage=Usage(prompt_tokens=10, completion_tokens=5),
        model="fake-model",
    )


class FakeGateway(ModelGateway):
    """Scripted gateway: complete() pops the next scripted response or error."""

    def __init__(self, script: list):
        # Each entry: CompletionResult | Exception instance (to be raised).
        self.script = list(script)
        self.calls: list[tuple[str, ModelRole]] = []

    def complete(self, messages, *, role=ModelRole.CODE, tools=None, temperature=None):
        self.calls.append((str(len(self.calls)), role))
        if not self.script:
            raise AssertionError("FakeGateway script exhausted")
        nxt = self.script.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt

    def stream(self, messages, *, role=ModelRole.CODE, tools=None, temperature=None):
        raise NotImplementedError

    def embed(self, texts, *, role=ModelRole.EMBEDDING):
        raise NotImplementedError


# ----------------------------------------------------------------- helpers


def _seed_run(goal: str = "Build a small widget") -> str:
    """Persist a user, conversation, user message, and a CREATED run."""
    with SessionLocal() as db:
        user = User(id="user_test", name="Test", email="test@example.dev")
        db.add(user)
        conversation = Conversation(user_id=user.id, title="Test conversation")
        db.add(conversation)
        db.flush()
        message = Message(
            conversation_id=conversation.id, role="user", content=goal
        )
        db.add(message)
        run = AgentRun(
            user_id=user.id, conversation_id=conversation.id, goal=goal, status="created"
        )
        db.add(run)
        db.commit()
        return run.id


def _run_row(run_id: str) -> AgentRun:
    with SessionLocal() as db:
        run = db.get(AgentRun, run_id)
        assert run is not None
        db.refresh(run)
        return run


def _events(run_id: str) -> list[RunEvent]:
    with SessionLocal() as db:
        return list(
            db.scalars(
                select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.seq)
            ).all()
        )


def _event_types(run_id: str) -> list[str]:
    return [e.type for e in _events(run_id)]


def _drive_with(gateway: FakeGateway, run_id: str, *, resume: bool = False) -> None:
    """Inject the fake gateway and run the same entry the router schedules."""
    saved = orchestrator.build_gateway
    orchestrator.build_gateway = lambda: gateway
    try:
        if resume:
            orchestrator.resume_run(run_id)
        else:
            orchestrator.orchestrate_run(run_id)
    finally:
        orchestrator.build_gateway = saved


# ------------------------------------------------------------------- tests


def test_unconfigured_gateway_leaves_run_created(client):
    """Phase 1 behaviour preserved: no LLM settings → no fabricated progress."""
    conversation = client.post(
        "/api/v1/conversations", json={"title": "No gateway"}
    ).json()
    sent = client.post(
        f"/api/v1/conversations/{conversation['id']}/messages",
        json={"content": "Do a thing without any model configured"},
    ).json()

    run_id = sent["run"]["id"]
    run = _run_row(run_id)
    assert run.status == "created"  # untouched — nothing ran

    events = _events(run_id)
    assert [e.type for e in events] == ["run_created"]
    with SessionLocal() as db:
        assert db.scalars(
            select(RunTask).where(RunTask.run_id == run_id)
        ).all() == []


def test_happy_path_plan_tool_answer_completed():
    """plan → run → tool (honest runner_unavailable) → final answer."""
    run_id = _seed_run()
    gateway = FakeGateway(
        [
            _result('{"steps": ["Map the metrics surface", "Build the widget"]}'),
            _result(
                tool_calls=[
                    ToolCallRequest(
                        id="call_1", name="fs_list", arguments={"path": "src"}
                    )
                ]
            ),
            _result("Widget done — the runner is not deployed, so no files were changed."),
        ]
    )
    _drive_with(gateway, run_id)

    run = _run_row(run_id)
    assert run.status == "completed"

    # Plan persisted as run_tasks, first step in_progress (never auto-done).
    with SessionLocal() as db:
        tasks = list(
            db.scalars(
                select(RunTask).where(RunTask.run_id == run_id).order_by(RunTask.position)
            ).all()
        )
        assert [t.description for t in tasks] == [
            "Map the metrics surface",
            "Build the widget",
        ]
        assert tasks[0].status == "in_progress"
        assert tasks[1].status == "pending"

        agent_messages = list(
            db.scalars(
                select(Message).where(
                    Message.run_id == run_id, Message.role == "agent"
                )
            ).all()
        )
        assert len(agent_messages) == 1
        blocks = agent_messages[0].blocks
        assert blocks[0]["kind"] == "text"
        assert "runner is not deployed" in blocks[0]["content"]
        kinds = [b["kind"] for b in blocks]
        assert kinds == ["text", "plan", "tool"]
        tool_block = blocks[2]
        assert tool_block["name"] == "fs_list"
        assert tool_block["status"] == "failed"  # honest runner_unavailable

    types = _event_types(run_id)
    for expected in (
        "planning_started",
        "plan_generated",
        "run_status_changed",  # created → planning
        "task_started",
        "tool_invoked",
        "tool_result",
        "llm_usage",
        "run_completed",
    ):
        assert expected in types, f"missing event {expected} in {types}"

    # The tool result honestly reports runner_unavailable.
    tool_results = [e for e in _events(run_id) if e.type == "tool_result"]
    assert tool_results[0].payload["ok"] is False
    assert tool_results[0].payload["outcome"]["error"] == "runner_unavailable"


def test_write_tool_pauses_for_approval_and_resumes():
    """Write tools gate BEFORE execution; approval resumes the loop."""
    run_id = _seed_run("Write a README")
    gateway = FakeGateway(
        [
            _result('{"steps": ["Draft the README"]}'),
            _result(
                tool_calls=[
                    ToolCallRequest(
                        id="call_w",
                        name="fs_write",
                        arguments={"path": "README.md", "content": "hello"},
                    )
                ]
            ),
            # After approval the loop replays context; the model answers.
            _result("Approved — proceeding with the write (runner still pending)."),
        ]
    )
    _drive_with(gateway, run_id)

    # Paused exactly at the gate.
    run = _run_row(run_id)
    assert run.status == "waiting_for_approval"
    with SessionLocal() as db:
        approvals = list(
            db.scalars(select(Approval).where(Approval.run_id == run_id)).all()
        )
        assert len(approvals) == 1
        assert approvals[0].status == "pending"
        approval_id = approvals[0].id

    types = _event_types(run_id)
    assert "approval_required" in types
    assert "tool_result" not in types  # nothing executed before approval

    # User approves (the same persisted steps the approvals router performs).
    from app.agent.events import set_run_status
    from app.agent.state import RunStatus

    with SessionLocal() as db:
        approval = db.get(Approval, approval_id)
        approval.status = "approved"
        db.add(approval)
        db.commit()
    with SessionLocal() as db:
        set_run_status(db, run_id, RunStatus.RUNNING, reason="approval granted")

    _drive_with(gateway, run_id, resume=True)

    run = _run_row(run_id)
    assert run.status == "completed"
    types = _event_types(run_id)
    assert "tool_result" not in types  # fs_write still not executed (no runner)
    with SessionLocal() as db:
        agent_message = db.scalar(
            select(Message).where(Message.run_id == run_id, Message.role == "agent")
        )
        assert agent_message is not None
        assert agent_message.blocks[0]["kind"] == "text"


def test_reject_leaves_run_cancelled_after_pause():
    """A rejected gate cancels the paused run (mirrors the approvals router)."""
    from app.agent.events import set_run_status
    from app.agent.state import RunStatus

    run_id = _seed_run("Touch a file")
    gateway = FakeGateway(
        [
            _result('{"steps": ["Write the file"]}'),
            _result(
                tool_calls=[
                    ToolCallRequest(
                        id="call_x", name="fs_write", arguments={"path": "x.txt", "content": ""}
                    )
                ]
            ),
        ]
    )
    _drive_with(gateway, run_id)
    assert _run_row(run_id).status == "waiting_for_approval"

    with SessionLocal() as db:
        approval = db.scalar(select(Approval).where(Approval.run_id == run_id))
        approval.status = "rejected"
        db.add(approval)
        db.commit()
    with SessionLocal() as db:
        set_run_status(db, run_id, RunStatus.CANCELLED, reason="approval rejected")

    assert _run_row(run_id).status == "cancelled"
    assert "tool_result" not in _event_types(run_id)


def test_budget_exhaustion_fails_the_run():
    """A BudgetExceededError surfaces as a persisted failed run + error event."""
    run_id = _seed_run()
    gateway = FakeGateway(
        [
            _result('{"steps": ["Only step"]}'),
            BudgetExceededError("LLM token budget exceeded (10 tokens)"),
        ]
    )
    _drive_with(gateway, run_id)

    run = _run_row(run_id)
    assert run.status == "failed"
    assert "budget" in (run.error or "").lower()
    types = _event_types(run_id)
    assert "error_occurred" in types


def test_provider_error_fails_the_run():
    """Provider (non-retryable) errors fail the run honestly."""
    run_id = _seed_run()
    gateway = FakeGateway(
        [
            _result('{"steps": ["Only step"]}'),
            ProviderError(401, "invalid api key"),
        ]
    )
    _drive_with(gateway, run_id)

    run = _run_row(run_id)
    assert run.status == "failed"
    assert "401" in (run.error or "")


def test_iteration_bound_fails_the_run(monkeypatch):
    """A model that only ever requests tools hits the iteration cap → failed."""
    run_id = _seed_run()
    gateway = FakeGateway(
        [_result('{"steps": ["Step"]}')]
        + [
            _result(
                tool_calls=[
                    ToolCallRequest(
                        id=f"call_{i}", name="fs_read", arguments={"path": f"f{i}"}
                    )
                ]
            )
            for i in range(50)
        ]
    )
    monkeypatch.setattr(
        "app.agent.orchestrator.get_settings",
        lambda: type(
            "S",
            (),
            {"agent_max_llm_calls": 3, "agent_max_total_tokens": 10_000},
        )(),
    )
    _drive_with(gateway, run_id)

    run = _run_row(run_id)
    assert run.status == "failed"
    assert "iterations" in (run.error or "")


def test_planner_falls_back_to_goal_step():
    """Unparseable planning output degrades to a single honest step."""
    from app.agent.planner import generate_plan

    class ExplodingGateway(FakeGateway):
        def complete(self, messages, *, role=ModelRole.CODE, tools=None, temperature=None):
            raise GatewayError("provider down")

    steps = generate_plan(ExplodingGateway([]), "Build the thing anyway")
    assert steps == ["Build the thing anyway"]


def test_planner_parses_fenced_and_dirty_json():
    from app.agent.planner import _parse_steps

    fenced = '```json\n{"steps": ["a", "b"]}\n```'
    assert _parse_steps(fenced) == ["a", "b"]
    with_prose = 'Sure! {"steps": ["x"]} — hope that helps'
    assert _parse_steps(with_prose) == ["x"]
    assert _parse_steps("no json at all") == []
    assert _parse_steps('{"steps": []}') == []
