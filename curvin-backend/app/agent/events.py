"""Persisted run events — the SSE source of truth.

Events are appended with a monotonic per-run sequence number and committed
immediately, so a server restart cannot lose history and clients can replay
from Last-Event-ID. No in-process queues are authoritative.
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agent.state import InvalidTransition, RunStatus, transition
from app.models import AgentRun, RunEvent, utcnow


def emit_event(
    db: Session, run_id: str, event_type: str, payload: dict | None = None
) -> RunEvent:
    """Append one event with the next per-run seq and persist immediately."""
    last = db.scalar(
        select(func.coalesce(func.max(RunEvent.seq), 0)).where(
            RunEvent.run_id == run_id
        )
    )
    event = RunEvent(
        run_id=run_id,
        seq=(last or 0) + 1,
        type=event_type,
        payload=payload or {},
    )
    db.add(event)
    run = db.get(AgentRun, run_id)
    if run is not None:
        run.updated_at = utcnow()
    db.commit()
    db.refresh(event)
    return event


def set_run_status(
    db: Session,
    run_id: str,
    target: RunStatus,
    *,
    reason: str | None = None,
) -> AgentRun:
    """Validated state transition, persisted, with a run_status_changed event."""
    run = db.get(AgentRun, run_id)
    if run is None:
        raise KeyError(f"run not found: {run_id}")
    current = RunStatus(run.status)
    transition(current, target)  # raises InvalidTransition for illegal moves
    run.status = target.value
    run.updated_at = utcnow()
    if target is RunStatus.FAILED and reason:
        run.error = reason
    db.add(run)
    db.commit()
    emit_event(
        db,
        run_id,
        "run_status_changed",
        {"from": current.value, "to": target.value, "reason": reason},
    )
    db.refresh(run)
    return run
