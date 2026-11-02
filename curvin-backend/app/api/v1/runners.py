"""Runner APIs — curvin-runner's channel to the backend (Phase 4).

Registration rides the user identity placeholder (X-User-Id, Phase 1);
every subsequent runner call authenticates with the per-runner bearer token
issued at registration (SHA-256 hash stored; plaintext shown exactly once).

The backend NEVER executes tools itself: it queues jobs (`runner_jobs`:
queued → claimed → succeeded | failed) and records results. Execution happens
only on the user's machine, inside the runner's own sandbox.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.v1.projects import current_user_id
from app.core.config import get_settings
from app.core.database import get_db
from app.models import Runner, RunnerJob, utcnow
from app.schemas import (
    JobResultIn,
    RunnerRegisterIn,
    RunnerRegisteredOut,
    RunnerOut,
    claimed_job_out,
    runner_out,
)

router = APIRouter(prefix="/runners", tags=["runners"])


def _as_utc(dt):
    """SQLite returns naive datetimes — normalise before subtracting."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def is_online(runner: Runner) -> bool:
    """A runner is online if it heartbeated inside the configured window."""
    window = get_settings().runner_online_window_seconds
    age = (utcnow() - _as_utc(runner.last_seen_at)).total_seconds()
    return age <= window  # window comparison, tz-normalised for SQLite


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _runner_from_token(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Runner:
    """Authenticate the calling curvin-runner by its bearer token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="runner token required")
    token = authorization[len("Bearer ") :].strip()
    runner = db.scalar(select(Runner).where(Runner.token_hash == _hash_token(token)))
    if runner is None:
        raise HTTPException(status_code=401, detail="invalid runner token")
    return runner


@router.get("", response_model=list[RunnerOut])
def list_runners(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[RunnerOut]:
    rows = db.scalars(
        select(Runner).where(Runner.user_id == user_id).order_by(Runner.created_at)
    ).all()
    return [runner_out(r, online=is_online(r)) for r in rows]


@router.post("/register", response_model=RunnerRegisteredOut, status_code=201)
def register(
    payload: RunnerRegisterIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> RunnerRegisteredOut:
    token = secrets.token_urlsafe(32)
    runner = Runner(
        user_id=user_id,
        name=payload.name,
        platform=payload.platform,
        token_hash=_hash_token(token),
        last_seen_at=utcnow(),
    )
    db.add(runner)
    db.commit()
    # The plaintext token is returned exactly once — never stored, never listed.
    return RunnerRegisteredOut(id=runner.id, name=runner.name, token=token)


@router.post("/{runner_id}/heartbeat", response_model=RunnerOut)
def heartbeat(
    runner_id: str,
    runner: Runner = Depends(_runner_from_token),
    db: Session = Depends(get_db),
) -> RunnerOut:
    if runner.id != runner_id:
        raise HTTPException(status_code=404, detail="runner not found")
    runner.last_seen_at = utcnow()
    db.add(runner)
    db.commit()
    return runner_out(runner, online=True)


@router.post("/{runner_id}/jobs/claim")
def claim_job(
    runner_id: str,
    runner: Runner = Depends(_runner_from_token),
    db: Session = Depends(get_db),
) -> dict:
    """Claim the oldest queued job for this runner's user (atomic).

    Only that user's jobs are visible — a runner can never execute another
    user's work.
    """
    if runner.id != runner_id:
        raise HTTPException(status_code=404, detail="runner not found")

    job = db.scalar(
        select(RunnerJob)
        .where(RunnerJob.user_id == runner.user_id, RunnerJob.status == "queued")
        .order_by(RunnerJob.created_at, RunnerJob.id)
        .limit(1)
    )
    if job is None:
        return {"job": None}

    claimed = db.execute(
        update(RunnerJob)
        .where(RunnerJob.id == job.id, RunnerJob.status == "queued")
        .values(status="claimed", runner_id=runner.id, claimed_at=utcnow())
    )
    if claimed.rowcount != 1:
        db.rollback()  # another runner won the race
        return {"job": None}
    db.commit()

    runner.last_seen_at = utcnow()
    db.add(runner)
    db.commit()
    return {"job": claimed_job_out(job).model_dump(mode="json")}


@router.post("/{runner_id}/jobs/{job_id}/result")
def report_result(
    runner_id: str,
    job_id: str,
    payload: JobResultIn,
    runner: Runner = Depends(_runner_from_token),
    db: Session = Depends(get_db),
) -> dict:
    """Record a runner's execution result for a job it claimed."""
    if runner.id != runner_id:
        raise HTTPException(status_code=404, detail="runner not found")
    job = db.get(RunnerJob, job_id)
    if job is None or job.runner_id != runner.id:
        raise HTTPException(status_code=404, detail="job not found for this runner")
    if job.status != "claimed":
        raise HTTPException(
            status_code=409,
            detail=f"job already resolved: {job.status}",
        )

    job.status = payload.status
    job.result = payload.result
    job.error = payload.error
    job.completed_at = utcnow()
    db.add(job)
    db.commit()
    return {"ok": True, "jobId": job.id, "status": job.status}
