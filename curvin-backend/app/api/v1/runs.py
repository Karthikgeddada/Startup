"""Agent run APIs — lifecycle control + the SSE event stream.

The event stream reads the persisted run_events log (never an in-process
queue), so streams survive server restarts and clients replay from
Last-Event-ID (header) or ?last_event_id= (query).
"""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.agent.events import emit_event, set_run_status
from app.agent.state import InvalidTransition, RunStatus, is_terminal
from app.api.v1.projects import current_user_id, ensure_user
from app.core.database import SessionLocal, get_db
from app.models import AgentRun, Approval, RunEvent, RunTask, utcnow
from app.schemas import ApprovalOut, CreateApprovalIn, RunOut, approval_out, run_out

router = APIRouter(prefix="/runs", tags=["runs"])


def _get_run(db: Session, user_id: str, run_id: str) -> AgentRun:
    run = db.get(AgentRun, run_id)
    if run is None or run.user_id != user_id:
        raise HTTPException(status_code=404, detail="run not found")
    return run


def _run_tasks(db: Session, run_id: str) -> list[RunTask]:
    return list(
        db.scalars(
            select(RunTask)
            .where(RunTask.run_id == run_id)
            .order_by(RunTask.position)
        ).all()
    )


def _guard_transition(db: Session, run: AgentRun, target: RunStatus, reason: str | None = None) -> AgentRun:
    try:
        return set_run_status(db, run.id, target, reason=reason)
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("", response_model=list[RunOut])
def list_runs(
    conversation_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[RunOut]:
    ensure_user(db, user_id)
    stmt = select(AgentRun).where(AgentRun.user_id == user_id)
    if conversation_id is not None:
        stmt = stmt.where(AgentRun.conversation_id == conversation_id)
    rows = db.scalars(stmt.order_by(AgentRun.created_at.desc())).all()
    return [run_out(r, _run_tasks(db, r.id)) for r in rows]


@router.get("/{run_id}", response_model=RunOut)
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> RunOut:
    run = _get_run(db, user_id, run_id)
    return run_out(run, _run_tasks(db, run.id))


@router.post("/{run_id}/cancel", response_model=RunOut)
def cancel_run(
    run_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> RunOut:
    run = _get_run(db, user_id, run_id)
    run = _guard_transition(db, run, RunStatus.CANCELLED, reason="cancelled by user")
    emit_event(db, run.id, "run_cancelled", {"by": "user"})
    return run_out(run, _run_tasks(db, run.id))


@router.post("/{run_id}/resume", response_model=RunOut)
def resume_run(
    run_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> RunOut:
    run = _get_run(db, user_id, run_id)
    # Only a paused run resumes; approval gates are released via /approvals.
    run = _guard_transition(db, run, RunStatus.RUNNING, reason="resumed by user")
    return run_out(run, _run_tasks(db, run.id))


@router.post("/{run_id}/approvals", response_model=ApprovalOut, status_code=201)
def create_approval(
    run_id: str,
    payload: CreateApprovalIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> ApprovalOut:
    """Register an approval gate on a run (used by the orchestrator in Phase 3;
    exposed now so the approval flow is testable end-to-end)."""
    run = _get_run(db, user_id, run_id)
    current = RunStatus(run.status)
    if current not in {RunStatus.CREATED, RunStatus.READY, RunStatus.RUNNING}:
        raise HTTPException(
            status_code=409,
            detail=f"approval cannot be requested from state {current.value}",
        )

    approval = Approval(
        run_id=run.id,
        title=payload.title,
        description=payload.description,
        status="pending",
    )
    db.add(approval)
    db.commit()

    run = _guard_transition(
        db, run, RunStatus.WAITING_FOR_APPROVAL, reason=payload.title
    )
    emit_event(
        db,
        run.id,
        "approval_required",
        {"approvalId": approval.id, "title": payload.title},
    )
    return approval_out(approval)


@router.get("/{run_id}/events")
async def stream_run_events(
    run_id: str,
    request: Request,
    last_event_id: str | None = Query(default=None, alias="last_event_id"),
    db: Session = Depends(get_db),
) -> EventSourceResponse:
    """SSE stream of the run's persisted event log.

    Sends everything after the cursor, keeps polling while the run is live,
    and ends with `stream_end` once the run reaches a terminal state.
    """
    user_id = request.headers.get("X-User-Id") or "user_dev"
    _get_run(db, user_id, run_id)  # 404 before opening the stream

    cursor_header = request.headers.get("Last-Event-ID")
    cursor_raw = last_event_id or cursor_header or "0"
    try:
        cursor = int(cursor_raw)
    except ValueError:
        cursor = 0

    async def event_stream() -> AsyncIterator[dict]:
        last = cursor
        while True:
            if await request.is_disconnected():
                break
            with SessionLocal() as session:
                events = list(
                    session.scalars(
                        select(RunEvent)
                        .where(RunEvent.run_id == run_id, RunEvent.seq > last)
                        .order_by(RunEvent.seq)
                    ).all()
                )
                run = session.get(AgentRun, run_id)
            for event in events:
                last = event.seq
                yield {
                    "id": str(event.seq),
                    "event": event.type,
                    "data": json.dumps(
                        {
                            "seq": event.seq,
                            "type": event.type,
                            "payload": event.payload or {},
                            "createdAt": event.created_at.isoformat(),
                        }
                    ),
                }
            if run is not None and is_terminal(RunStatus(run.status)) and not events:
                yield {
                    "event": "stream_end",
                    "data": json.dumps({"runId": run_id, "runStatus": run.status}),
                }
                break
            await asyncio.sleep(0.5)

    return EventSourceResponse(event_stream())
