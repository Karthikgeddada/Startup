"""Runner-backed tool dispatch (Phase 4) — queue → curvin-runner → result.

The orchestrator hands runner-backed tools (fs/terminal/git) to this module
instead of executing anything on the backend. Honesty rules:
- No online runner → `runner_unavailable`; nothing is queued or executed.
- A job no runner claims within the timeout → the job is marked failed and
  the outcome is `runner_timeout` — never an invented result.
- Runner-reported failures surface verbatim as `runner_error`.
"""
from __future__ import annotations

import time
from datetime import timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.events import emit_event
from app.core.config import get_settings
from app.models import Runner, RunnerJob, utcnow


def has_online_runner(db: Session, user_id: str) -> bool:
    """True if any of the user's runners heartbeated inside the window."""
    window = get_settings().runner_online_window_seconds
    now = utcnow()
    runners = db.scalars(select(Runner).where(Runner.user_id == user_id)).all()
    for runner in runners:
        last_seen = runner.last_seen_at
        if last_seen.tzinfo is None:  # SQLite naive datetime
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        if (now - last_seen).total_seconds() <= window:
            return True
    return False


def enqueue_job(
    db: Session, *, user_id: str, run_id: str | None, tool: str, arguments: dict
) -> RunnerJob:
    job = RunnerJob(
        user_id=user_id,
        run_id=run_id,
        tool=tool,
        arguments=dict(arguments or {}),
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _job_outcome(job: RunnerJob) -> dict:
    if job.status == "succeeded":
        return {"ok": True, **dict(job.result or {})}
    return {
        "ok": False,
        "error": "runner_error",
        "detail": job.error or "runner reported failure",
    }


def dispatch_tool(
    db: Session,
    *,
    user_id: str,
    run_id: str | None,
    tool: str,
    arguments: dict,
) -> dict:
    """Queue a runner job and wait for the result (bounded by the job timeout).

    Returns the same outcome shape as tools.execute_tool. The wait is a
    bounded poll of persisted job state — a server restart between enqueue
    and completion still leaves an honest queued/claimed job on disk.
    """
    settings = get_settings()
    if not has_online_runner(db, user_id):
        return {
            "ok": False,
            "error": "runner_unavailable",
            "detail": (
                "no curvin-runner is connected; the action was NOT executed — "
                "start curvin-runner on your machine to enable local execution"
            ),
        }

    job = enqueue_job(db, user_id=user_id, run_id=run_id, tool=tool, arguments=arguments)
    emit_event(
        db,
        run_id,
        "tool_dispatched",
        {"jobId": job.id, "tool": tool, "status": "queued"},
    )

    deadline = time.monotonic() + settings.runner_job_timeout_seconds
    while time.monotonic() < deadline:
        time.sleep(settings.runner_poll_interval_seconds)
        db.expire_all()
        current = db.get(RunnerJob, job.id)
        if current is not None and current.status in ("succeeded", "failed"):
            return _job_outcome(current)

    # Timeout: close the job honestly if it is still unfinished.
    db.expire_all()
    current = db.get(RunnerJob, job.id)
    if current is not None and current.status not in ("succeeded", "failed"):
        current.status = "failed"
        current.error = (
            f"runner job timed out after {settings.runner_job_timeout_seconds}s "
            "without a result"
        )
        current.completed_at = utcnow()
        db.add(current)
        db.commit()
        return {
            "ok": False,
            "error": "runner_timeout",
            "detail": current.error,
        }
    return _job_outcome(current) if current is not None else {
        "ok": False,
        "error": "runner_error",
        "detail": "runner job disappeared",
    }
