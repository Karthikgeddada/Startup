"""Approval APIs — the human gate on agent execution.

Approve: pending → approved; a run waiting on this gate resumes RUNNING.
Reject: pending → rejected; a run waiting on this gate is CANCELLED.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.events import emit_event, set_run_status
from app.agent.state import InvalidTransition, RunStatus
from app.api.v1.projects import current_user_id
from app.api.v1.runs import _run_tasks
from app.core.database import get_db
from app.models import AgentRun, Approval
from app.schemas import ApprovalOut, RunOut, approval_out, run_out

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _get_approval(db: Session, user_id: str, approval_id: str) -> Approval:
    approval = db.get(Approval, approval_id)
    if approval is None:
        raise HTTPException(status_code=404, detail="approval not found")
    run = db.get(AgentRun, approval.run_id)
    if run is None or run.user_id != user_id:
        raise HTTPException(status_code=404, detail="approval not found")
    return approval, run


def _resolve(
    db: Session, user_id: str, approval_id: str, approved: bool
) -> tuple[ApprovalOut, RunOut | None]:
    approval, run = _get_approval(db, user_id, approval_id)
    if approval.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"approval already resolved: {approval.status}",
        )

    approval.status = "approved" if approved else "rejected"
    db.add(approval)
    db.commit()

    updated_run = None
    if RunStatus(run.status) is RunStatus.WAITING_FOR_APPROVAL:
        target = RunStatus.RUNNING if approved else RunStatus.CANCELLED
        try:
            updated_run = set_run_status(
                db,
                run.id,
                target,
                reason=("approval granted" if approved else "approval rejected"),
            )
        except InvalidTransition as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    emit_event(
        db,
        run.id,
        "approval_granted" if approved else "approval_rejected",
        {"approvalId": approval.id},
    )
    return approval_out(approval), (
        run_out(updated_run, _run_tasks(db, run.id)) if updated_run else None
    )


@router.post("/{approval_id}/approve")
def approve(
    approval_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> dict:
    approval, run = _resolve(db, user_id, approval_id, approved=True)
    return {"approval": approval.model_dump(mode="json"), "run": run.model_dump(mode="json") if run else None}


@router.post("/{approval_id}/reject")
def reject(
    approval_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> dict:
    approval, run = _resolve(db, user_id, approval_id, approved=False)
    return {"approval": approval.model_dump(mode="json"), "run": run.model_dump(mode="json") if run else None}
