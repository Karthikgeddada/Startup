"""Runner tests (Phase 4) — dispatch queue, runner API auth, and the local
sandbox of curvin-runner itself.

API tests run against the TestClient with the same SQLite test DB; a real
claim/report loop runs in a background thread (a second TestClient instance)
so dispatch_tool's bounded wait is exercised end to end. The offline sandbox
tests import curvin-runner's single-file client directly.
"""
from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

import pytest
from sqlalchemy import select

from app.agent import orchestrator
from app.agent.gateway import CompletionResult, ModelGateway, ModelRole, ToolCallRequest, Usage
from app.agent.runner_dispatch import dispatch_tool, enqueue_job
from app.core.database import Base, SessionLocal, engine
from app.main import create_app
from app.models import AgentRun, Conversation, Message, RunnerJob, RunEvent, User

RUNNER_DIR = Path(__file__).resolve().parents[2] / "curvin-runner"
if str(RUNNER_DIR) not in sys.path:
    sys.path.insert(0, str(RUNNER_DIR))

import curvin_runner  # noqa: E402  (single-file client, stdlib only)


@pytest.fixture(autouse=True)
def _fresh_schema():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture()
def fast_runner_settings(monkeypatch):
    """Fast poll + short timeout so tests don't wait real-world durations."""
    fake = type(
        "FastSettings",
        (),
        {
            "runner_online_window_seconds": 30.0,
            "runner_job_timeout_seconds": 3.0,
            "runner_poll_interval_seconds": 0.02,
        },
    )()
    monkeypatch.setattr("app.agent.runner_dispatch.get_settings", lambda: fake)
    return fake


def _seed_run(goal: str = "Read the config", user_id: str = "user_dev") -> tuple[str, str]:
    """Persist user + conversation + message + CREATED run; (run_id, user_id).

    Default user is the dev placeholder — the same identity the register
    endpoint defaults to, so seeded runs and registered runners match.
    """
    with SessionLocal() as db:
        if db.get(User, user_id) is None:
            db.add(User(id=user_id, name="Test", email=f"{user_id}@example.dev"))
        conversation = Conversation(user_id=user_id, title="Runner test")
        db.add(conversation)
        db.flush()
        db.add(Message(conversation_id=conversation.id, role="user", content=goal))
        run = AgentRun(user_id=user_id, conversation_id=conversation.id, goal=goal, status="created")
        db.add(run)
        db.commit()
        return run.id, user_id


def _register_runner(client, *, name: str = "test-mac", user_id: str | None = None) -> dict:
    headers = {"X-User-Id": user_id} if user_id else {}
    response = client.post(
        "/api/v1/runners/register", json={"name": name, "platform": "macOS 15"}, headers=headers
    )
    assert response.status_code == 201
    return response.json()


def _run_events(run_id: str) -> list[RunEvent]:
    with SessionLocal() as db:
        return list(
            db.scalars(
                select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.seq)
            ).all()
        )


class _SimulatedRunner(threading.Thread):
    """A background 'curvin-runner' that claims one job and reports a result."""

    def __init__(self, runner: dict, report: dict, max_wait: float = 5.0):
        super().__init__(daemon=True)
        self.runner = runner
        self.report = report
        self.max_wait = max_wait
        self.claimed: dict | None = None

    def run(self) -> None:
        from fastapi.testclient import TestClient

        headers = {"Authorization": f"Bearer {self.runner['token']}"}
        deadline = time.monotonic() + self.max_wait
        with TestClient(create_app()) as runner_client:
            while time.monotonic() < deadline:
                response = runner_client.post(
                    f"/api/v1/runners/{self.runner['id']}/jobs/claim", headers=headers
                )
                job = response.json().get("job")
                if job is not None:
                    self.claimed = job
                    runner_client.post(
                        f"/api/v1/runners/{self.runner['id']}/jobs/{job['id']}/result",
                        json=self.report,
                        headers=headers,
                    )
                    return
                time.sleep(0.02)


# ------------------------------------------------------------------- API


def test_register_lists_runner_online(client):
    registered = _register_runner(client)
    assert registered["token"]
    listed = client.get("/api/v1/runners").json()
    assert len(listed) == 1
    assert listed[0]["id"] == registered["id"]
    assert listed[0]["status"] == "online"
    # The token never appears in listings.
    assert "token" not in listed[0]


def test_runner_endpoints_require_token(client):
    registered = _register_runner(client)
    runner_id = registered["id"]

    assert client.post(f"/api/v1/runners/{runner_id}/jobs/claim").status_code == 401
    bad = {"Authorization": "Bearer not-the-token"}
    assert client.post(
        f"/api/v1/runners/{runner_id}/jobs/claim", headers=bad
    ).status_code == 401
    assert client.post(
        f"/api/v1/runners/{runner_id}/heartbeat", headers=bad
    ).status_code == 401
    good = {"Authorization": f"Bearer {registered['token']}"}
    assert client.post(
        f"/api/v1/runners/{runner_id}/heartbeat", headers=good
    ).status_code == 200


def test_claim_report_lifecycle(client):
    run_id, user_id = _seed_run()
    registered = _register_runner(client)
    headers = {"Authorization": f"Bearer {registered['token']}"}

    with SessionLocal() as db:
        job = enqueue_job(
            db, user_id=user_id, run_id=run_id, tool="fs_read", arguments={"path": "a.txt"}
        )
        job_id = job.id

    claimed = client.post(
        f"/api/v1/runners/{registered['id']}/jobs/claim", headers=headers
    ).json()["job"]
    assert claimed is not None and claimed["id"] == job_id
    assert claimed["tool"] == "fs_read"

    # Only one runner may hold a queued job: a second claim finds nothing.
    assert client.post(
        f"/api/v1/runners/{registered['id']}/jobs/claim", headers=headers
    ).json()["job"] is None

    report = client.post(
        f"/api/v1/runners/{registered['id']}/jobs/{job_id}/result",
        json={"status": "succeeded", "result": {"content": "file body"}},
        headers=headers,
    )
    assert report.status_code == 200

    with SessionLocal() as db:
        row = db.get(RunnerJob, job_id)
        assert row.status == "succeeded"
        assert row.result["content"] == "file body"
        assert row.completed_at is not None

    # Double reporting is rejected.
    assert client.post(
        f"/api/v1/runners/{registered['id']}/jobs/{job_id}/result",
        json={"status": "failed", "error": "x"},
        headers=headers,
    ).status_code == 409


def test_runner_cannot_claim_other_users_jobs(client):
    run_id, user_id = _seed_run(user_id="user_a")
    attacker = _register_runner(client, name="attacker", user_id="user_b")

    with SessionLocal() as db:
        enqueue_job(
            db, user_id=user_id, run_id=run_id, tool="fs_read", arguments={"path": "x"}
        )

    headers = {"Authorization": f"Bearer {attacker['token']}"}
    assert client.post(
        f"/api/v1/runners/{attacker['id']}/jobs/claim", headers=headers
    ).json()["job"] is None


# -------------------------------------------------------------- dispatch


def test_dispatch_without_runner_is_honest(client, fast_runner_settings):
    run_id, user_id = _seed_run()
    outcome = dispatch_tool(
        SessionLocal(), user_id=user_id, run_id=run_id, tool="fs_read", arguments={"path": "a"}
    )
    assert outcome["ok"] is False
    assert outcome["error"] == "runner_unavailable"
    with SessionLocal() as db:
        assert db.scalars(select(RunnerJob)).all() == []  # nothing queued


def test_dispatch_full_flow_with_claiming_runner(client, fast_runner_settings):
    run_id, user_id = _seed_run()
    registered = _register_runner(client)

    runner = _SimulatedRunner(
        registered, {"status": "succeeded", "result": {"content": "hello from the mac"}}
    )
    runner.start()

    outcome = dispatch_tool(
        SessionLocal(),
        user_id=user_id,
        run_id=run_id,
        tool="fs_read",
        arguments={"path": "notes.txt"},
    )
    runner.join(timeout=5)

    assert outcome["ok"] is True
    assert outcome["content"] == "hello from the mac"
    assert runner.claimed is not None
    assert runner.claimed["tool"] == "fs_read"
    assert "tool_dispatched" in [e.type for e in _run_events(run_id)]


def test_dispatch_timeout_when_runner_never_claims(client, fast_runner_settings, monkeypatch):
    run_id, user_id = _seed_run()
    _register_runner(client)  # online, but nobody claims
    monkeypatch.setattr(
        "app.agent.runner_dispatch.get_settings",
        lambda: type(
            "Tight",
            (),
            {
                "runner_online_window_seconds": 30.0,
                "runner_job_timeout_seconds": 0.2,
                "runner_poll_interval_seconds": 0.02,
            },
        )(),
    )

    outcome = dispatch_tool(
        SessionLocal(), user_id=user_id, run_id=run_id, tool="fs_list", arguments={"path": ""}
    )
    assert outcome["ok"] is False
    assert outcome["error"] == "runner_timeout"
    with SessionLocal() as db:
        jobs = db.scalars(select(RunnerJob)).all()
        assert len(jobs) == 1
        assert jobs[0].status == "failed"
        assert "timed out" in jobs[0].error


# ------------------------------------------------- orchestrator integration


class _ScriptedGateway(ModelGateway):
    def __init__(self, script):
        self.script = list(script)

    def complete(self, messages, *, role=ModelRole.CODE, tools=None, temperature=None):
        item = self.script.pop(0)
        return CompletionResult(
            content=item,
            tool_calls=[],
            finish_reason="stop",
            usage=Usage(10, 5),
            model="fake",
        )

    def stream(self, *a, **k):
        raise NotImplementedError

    def embed(self, *a, **k):
        raise NotImplementedError


def test_orchestrator_end_to_end_with_runner(client, fast_runner_settings):
    """plan → fs_read (dispatched, executed by the 'mac') → final → completed."""
    run_id, user_id = _seed_run(goal="Read notes.txt and summarise")
    registered = _register_runner(client)

    runner = _SimulatedRunner(
        registered, {"status": "succeeded", "result": {"content": "the notes"}}
    )
    runner.start()

    gateway = _ScriptedGateway(
        [
            '{"steps": ["Read the file"]}',
            "",  # first CODE call: no content, requests the tool
        ]
    )
    gateway_script_calls = []

    # Patch complete() to return a tool call on the first CODE invocation.
    original_complete = gateway.complete

    def scripted_complete(messages, *, role=ModelRole.CODE, tools=None, temperature=None):
        if role is ModelRole.CODE and not gateway_script_calls:
            gateway_script_calls.append("tool")
            return CompletionResult(
                content=None,
                tool_calls=[
                    ToolCallRequest(id="call_r", name="fs_read", arguments={"path": "notes.txt"})
                ],
                finish_reason="tool_calls",
                usage=Usage(10, 5),
                model="fake",
            )
        return original_complete(messages, role=role, tools=tools, temperature=temperature)

    gateway.complete = scripted_complete

    saved = orchestrator.build_gateway
    orchestrator.build_gateway = lambda: gateway
    try:
        # Plan step consumes script[0]; CODE consumes the tool call; final needs
        # one more answer — make the scripted gateway produce it lazily.
        gateway.script = ['{"steps": ["Read the file"]}', "The notes say: deploy on Friday."]
        orchestrator.orchestrate_run(run_id)
    finally:
        orchestrator.build_gateway = saved
    runner.join(timeout=5)

    with SessionLocal() as db:
        run = db.get(AgentRun, run_id)
        assert run.status == "completed"
        agent_message = db.scalar(
            select(Message).where(Message.run_id == run_id, Message.role == "agent")
        )
        assert agent_message is not None
        tool_blocks = [b for b in agent_message.blocks if b["kind"] == "tool"]
        assert tool_blocks[0]["name"] == "fs_read"
        assert tool_blocks[0]["status"] == "succeeded"

    types = [e.type for e in _run_events(run_id)]
    assert "tool_dispatched" in types
    tool_results = [e for e in _run_events(run_id) if e.type == "tool_result"]
    assert tool_results[0].payload["ok"] is True


# ----------------------------------------------------- sandbox (offline)


def test_runner_sandbox_path_jail(tmp_path):
    root = tmp_path / "projects"
    root.mkdir()

    # In-root writes/reads/list round trip.
    report = curvin_runner.execute_tool_local(
        root, "fs_write", {"path": "a/notes.txt", "content": "hi"}
    )
    assert report["status"] == "succeeded"
    report = curvin_runner.execute_tool_local(root, "fs_read", {"path": "a/notes.txt"})
    assert report["result"]["content"] == "hi"
    report = curvin_runner.execute_tool_local(root, "fs_list", {"path": "a"})
    assert report["result"]["entries"][0]["path"] == "a/notes.txt"

    # Escapes are rejected, never executed.
    for escape in ("../outside.txt", "/etc/passwd", "a/../../outside.txt", "~/x"):
        report = curvin_runner.execute_tool_local(root, "fs_read", {"path": escape})
        assert report["status"] == "failed"
        assert "sandbox violation" in report["error"]


def test_runner_sandbox_terminal_and_unknown_tool(tmp_path):
    root = tmp_path / "projects"
    root.mkdir()

    report = curvin_runner.execute_tool_local(root, "terminal", {"command": "echo runner-ok"})
    assert report["status"] == "succeeded"
    assert report["result"]["exitCode"] == 0
    assert "runner-ok" in report["result"]["stdout"]

    report = curvin_runner.execute_tool_local(root, "no_such_tool", {})
    assert report["status"] == "failed"
    assert "unknown tool" in report["error"]


def test_runner_output_truncation(tmp_path):
    root = tmp_path / "projects"
    root.mkdir()
    (root / "big.txt").write_text("x" * (curvin_runner.OUTPUT_CAP_BYTES + 1000))
    report = curvin_runner.execute_tool_local(root, "fs_read", {"path": "big.txt"})
    assert report["status"] == "succeeded"
    assert report["result"]["truncated"] is True
    assert len(report["result"]["content"]) <= curvin_runner.OUTPUT_CAP_BYTES
