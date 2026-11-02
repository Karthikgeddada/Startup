"""Phase 5/6/7 tests — context & memory, evidence-based task completion,
and the extras endpoints backing the real frontend service contracts.

As everywhere else: persisted outcomes are verified, never return values
alone; and nothing is asserted that would depend on live LLM access.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.agent import orchestrator
from app.agent.context import (
    compact_history,
    project_file_context,
    record_file_facts,
)
from app.agent.gateway import (
    CompletionResult,
    ModelGateway,
    ModelRole,
    ToolCallRequest,
    ToolSpec,
    Usage,
)
from app.agent.tools import READ, Tool, register
from app.core.database import SessionLocal
from app.models import (
    AgentRun,
    Conversation,
    Message,
    Project,
    ProjectFile,
    RunEvent,
    RunTask,
    User,
)


@pytest.fixture(autouse=True)
def _fresh_schema(client):  # client fixture drops/creates per test already
    yield


def _seed(
    *, project: bool = False, goal: str = "Inspect the project files"
) -> tuple[str, str | None]:
    """Seed user/project/conversation/message/run; return (run_id, project_id)."""
    with SessionLocal() as db:
        user_id = "user_dev"
        if db.get(User, user_id) is None:
            db.add(User(id=user_id, name="Dev", email="dev@example.dev"))
        project_id = None
        if project:
            project = Project(
                user_id=user_id,
                name="Demo Project",
                description="test project",
                status="active",
            )
            db.add(project)
            db.flush()
            project_id = project.id
        conversation = Conversation(user_id=user_id, title="Context test", project_id=project_id)
        db.add(conversation)
        db.flush()
        db.add(Message(conversation_id=conversation.id, role="user", content=goal))
        run = AgentRun(
            user_id=user_id,
            conversation_id=conversation.id,
            project_id=project_id,
            goal=goal,
            status="created",
        )
        db.add(run)
        db.commit()
        return run.id, project_id


def _run_messages(conversation_id: str) -> list[Message]:
    with SessionLocal() as db:
        return list(
            db.scalars(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.created_at, Message.id)
            ).all()
        )


def _run_events(run_id: str) -> list[RunEvent]:
    with SessionLocal() as db:
        return list(
            db.scalars(
                select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.seq)
            ).all()
        )


# ------------------------------------------------------------- Phase 5: memory


def test_compact_history_digests_old_messages(client):
    run_id, _ = _seed()
    with SessionLocal() as db:
        conversation_id = db.get(AgentRun, run_id).conversation_id
        for i in range(8):
            db.add(Message(conversation_id=conversation_id, role="user", content=f"question {i} " + "x" * 100))
            db.add(
                Message(
                    conversation_id=conversation_id,
                    role="agent",
                    status="completed",
                    blocks=[{"kind": "text", "id": f"b{i}", "content": f"answer {i} " + "y" * 100}],
                )
            )
        db.commit()

    messages = compact_history(db=SessionLocal(), conversation_id=conversation_id, window=4)

    digest = [m for m in messages if m["role"] == "system" and "compacted" in m["content"]]
    assert len(digest) == 1
    assert "13 messages, compacted" in digest[0]["content"]
    assert "question 0" in digest[0]["content"]  # truncated, not dropped
    # Recent window keeps verbatim roles/content (last: agent answer 7).
    tail = [m for m in messages if m["role"] in ("user", "assistant")]
    assert tail[-1]["role"] == "assistant" and tail[-1]["content"].startswith("answer 7")
    assert tail[-2]["role"] == "user" and tail[-2]["content"] == "question 7 " + "x" * 100


def test_compact_history_short_conversation_no_digest(client):
    run_id, _ = _seed()
    with SessionLocal() as db:
        conversation_id = db.get(AgentRun, run_id).conversation_id
    messages = compact_history(db=SessionLocal(), conversation_id=conversation_id)
    assert [m["role"] for m in messages] == ["user"]
    assert not any("compacted" in m["content"] for m in messages)


# -------------------------------------------------- Phase 5: project file index


def test_record_file_facts_from_real_outcomes(client):
    run_id, project_id = _seed(project=True)
    assert project_id is not None
    db = SessionLocal()

    # fs_list outcome (as curvin-runner reports it) fills the index.
    touched = record_file_facts(
        db,
        project_id=project_id,
        tool="fs_list",
        arguments={"path": ""},
        outcome={
            "ok": True,
            "result": {
                "entries": [
                    {"path": "src", "type": "dir", "sizeBytes": None},
                    {"path": "src/app.py", "type": "file", "sizeBytes": 120},
                ]
            },
        },
    )
    assert set(touched) == {"src", "src/app.py"}

    # fs_write updates an existing row's size instead of duplicating it.
    record_file_facts(
        db,
        project_id=project_id,
        tool="fs_write",
        arguments={"path": "src/app.py", "content": "x" * 50},
        outcome={"ok": True, "result": {"path": "src/app.py", "bytes": 50}},
    )

    rows = db.scalars(select(ProjectFile).where(ProjectFile.project_id == project_id)).all()
    assert {(r.path, r.type) for r in rows} == {("src", "dir"), ("src/app.py", "file")}
    app_py = next(r for r in rows if r.path == "src/app.py")
    assert app_py.size_bytes == 50

    # Failed outcomes and unknown tools change nothing.
    before = len(rows)
    assert (
        record_file_facts(
            db,
            project_id=project_id,
            tool="fs_write",
            arguments={"path": "nope.txt"},
            outcome={"ok": False, "error": "runner_timeout"},
        )
        == []
    )
    assert len(db.scalars(select(ProjectFile).where(ProjectFile.project_id == project_id)).all()) == before
    db.close()

    # The index feeds the run context (system message with the listing).
    ctx = project_file_context(SessionLocal(), project_id)
    assert ctx is not None and ctx["role"] == "system"
    assert "src/app.py" in ctx["content"]
    # No files → no context message at all.
    assert project_file_context(SessionLocal(), None) is None


# ------------------------------------- Phase 6: evidence-based task completion


class _Scripted(ModelGateway):
    def __init__(self, script):
        self.script = list(script)

    def complete(self, messages, *, role=ModelRole.CODE, tools=None, temperature=None):
        return self.script.pop(0)

    def stream(self, *a, **k):
        raise NotImplementedError

    def embed(self, *a, **k):
        raise NotImplementedError


def _text(content: str) -> CompletionResult:
    return CompletionResult(
        content=content, tool_calls=[], finish_reason="stop", usage=Usage(5, 5), model="fake"
    )


def _call(name: str, arguments: dict) -> CompletionResult:
    return CompletionResult(
        content=None,
        tool_calls=[ToolCallRequest(id=f"call_{name}", name=name, arguments=arguments)],
        finish_reason="tool_calls",
        usage=Usage(5, 5),
        model="fake",
    )


def _drive(gateway, run_id: str) -> None:
    saved = orchestrator.build_gateway
    orchestrator.build_gateway = lambda: gateway
    try:
        orchestrator.orchestrate_run(run_id)
    finally:
        orchestrator.build_gateway = saved


def test_successful_tool_completes_step_with_evidence(client):
    run_id, _ = _seed(goal="Map the code")
    register(
        Tool(
            spec=ToolSpec(
                name="probe_ok",
                description="successful probe",
                parameters_schema={"type": "object", "properties": {"path": {"type": "string"}}},
            ),
            permission=READ,
            handler=lambda arguments: {"summary": f"probed {arguments.get('path')}"},
        )
    )

    _drive(
        _Scripted(
            [
                _text('{"steps": ["Map the code", "Draft the change"]}'),
                _call("probe_ok", {"path": "src/app.py"}),
                _text("Done mapping."),
            ]
        ),
        run_id,
    )

    with SessionLocal() as db:
        run = db.get(AgentRun, run_id)
        assert run.status == "completed"
        tasks = db.scalars(
            select(RunTask).where(RunTask.run_id == run_id).order_by(RunTask.position)
        ).all()
        # Step 1 completed BY EVIDENCE (a genuinely successful tool); step 2 started.
        assert [t.status for t in tasks] == ["done", "in_progress"]

    events = _run_events(run_id)
    completed = [e for e in events if e.type == "task_completed"]
    assert len(completed) == 1
    assert completed[0].payload["evidence"]["tool"] == "probe_ok"
    started = [e for e in events if e.type == "task_started"]
    assert len(started) == 2  # plan start + next-step start


def test_failed_tool_completes_nothing(client):
    run_id, _ = _seed(goal="Map the code")
    register(
        Tool(
            spec=ToolSpec(
                name="probe_fail",
                description="failing probe",
                parameters_schema={"type": "object", "properties": {}},
            ),
            permission=READ,
            handler=lambda arguments: {"ok": False, "error": "boom"},
        )
    )

    _drive(
        _Scripted(
            [
                _text('{"steps": ["Map the code", "Draft the change"]}'),
                _call("probe_fail", {}),
                _text("I could not probe — reporting honestly."),
            ]
        ),
        run_id,
    )

    with SessionLocal() as db:
        run = db.get(AgentRun, run_id)
        assert run.status == "completed"
        tasks = db.scalars(
            select(RunTask).where(RunTask.run_id == run_id).order_by(RunTask.position)
        ).all()
        # No successful execution → no evidence → nothing completed.
        assert [t.status for t in tasks] == ["in_progress", "pending"]
    assert [e for e in _run_events(run_id) if e.type == "task_completed"] == []


# ------------------------------------------------- Phase 7: extras endpoints


def test_me_activity_templates_github_honest(client):
    run_id, project_id = _seed(project=True, goal="Build the thing")

    me = client.get("/api/v1/me").json()
    assert me["id"] == "user_dev" and me["email"]

    activity = client.get("/api/v1/activity?limit=5").json()
    assert any(item["id"] == run_id and item["projectId"] == project_id for item in activity)
    assert all("—" in item["description"] for item in activity)  # goal — status

    templates = client.get("/api/v1/templates").json()
    assert len(templates) >= 3
    assert all(t["id"] and t["stack"] for t in templates)

    # No GITHUB_TOKEN configured → honest empty list, not fabricated repos.
    assert client.get("/api/v1/github/repositories").json() == []


def test_recents_and_search_real_rows_only(client):
    run_id, project_id = _seed(project=True, goal="Inspect the project files")

    recents = client.get("/api/v1/recents").json()
    types = {item["type"] for item in recents}
    assert types <= {"project", "conversation"} and types  # only real rows
    assert any(item["projectId"] == project_id for item in recents)
    assert all(item["href"].startswith("/workspace?") for item in recents)

    # Search finds the project by name; empty query terms 404 honestly.
    results = client.get("/api/v1/search?q=Demo").json()
    assert any(r["category"] == "projects" for r in results)
    assert client.get("/api/v1/search?q=zzz-no-match").status_code == 404

    # After runner-verified file facts, files are searchable too.
    db = SessionLocal()
    record_file_facts(
        db,
        project_id=project_id,
        tool="fs_write",
        arguments={"path": "src/widget.tsx"},
        outcome={"ok": True, "result": {"bytes": 10}},
    )
    db.close()
    results = client.get("/api/v1/search?q=widget").json()
    assert any(r["category"] == "files" and r["title"] == "src/widget.tsx" for r in results)
