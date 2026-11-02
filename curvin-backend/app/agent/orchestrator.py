"""The autonomous execution loop (Phase 3).

Drives a run: created → planning (plan persisted as run_tasks) → ready →
running → bounded reasoning/tool loop → completed (or failed /
waiting_for_approval / cancelled). Everything observable is persisted as run
events — the SSE source of truth — and the agent reply is persisted as a
Message with frontend-compatible blocks. Loop context is rebuilt from the
conversation plus the event log, so a run resumed after an approval gate
continues from persisted history: no in-process state is authoritative.

Honesty rules enforced here:
- Unconfigured gateway → runs stay `created` (no fabricated progress).
- Tools without the runner report `runner_unavailable`; the model is told.
- Write/dangerous tools pause for approval BEFORE execution — permission is
  enforced server-side, the LLM never gates itself.
- The loop is bounded (iterations + the gateway's call/token budget).
"""
from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.context import (
    compact_history,
    project_file_context,
    record_file_facts,
)
from app.agent.events import emit_event, set_run_status
from app.agent.gateway import (
    BudgetTracker,
    ExecutionBudget,
    GatewayError,
    GatewayNotConfiguredError,
    ModelGateway,
    ModelRole,
    OpenAICompatibleGateway,
    ToolCallRequest,
    resolve_roles,
)
from app.agent.planner import generate_plan
from app.agent.runner_dispatch import dispatch_tool
from app.agent.state import InvalidTransition, RunStatus
from app.agent.tools import execute_tool, get_tool, get_tool_specs, tool_permission
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models import AgentRun, Approval, Message, RunEvent, RunTask

logger = logging.getLogger("curvin.orchestrator")

SYSTEM_PROMPT = (
    "You are CURVIN, an autonomous software engineering agent working inside "
    "the user's development workspace. Work toward the user's goal step by "
    "step. Use the provided tools when they help, and reason about their "
    "results. When a tool reports that local execution is unavailable, say so "
    "honestly instead of pretending it succeeded. When the goal is addressed, "
    "reply with a concise final answer in plain text."
)


class _RunPaused(Exception):
    """Internal: the loop stopped at an approval gate."""


# ------------------------------------------------------------------ entries


def build_gateway() -> ModelGateway | None:
    """Construct the run gateway from settings; None when unconfigured.

    Returning None keeps runs in `created` — no fabricated progress.
    """
    settings = get_settings()
    try:
        roles = resolve_roles(settings)
    except GatewayNotConfiguredError:
        return None
    return OpenAICompatibleGateway(
        base_url=roles.base_url,
        api_key=roles.api_key,
        role_models=roles.role_models,
        budget=BudgetTracker(
            ExecutionBudget(settings.agent_max_llm_calls, settings.agent_max_total_tokens)
        ),
        timeout_seconds=settings.llm_timeout_seconds,
        max_retries=settings.llm_max_retries,
    )


def orchestrate_run(run_id: str) -> None:
    """Background entry: drive a freshly created run to a stop state."""
    gateway = build_gateway()
    if gateway is None:
        return
    with SessionLocal() as db:
        run = db.get(AgentRun, run_id)
        if run is None or RunStatus(run.status) is not RunStatus.CREATED:
            return
        _drive(db, run, gateway, resumed=False)


def resume_run(run_id: str) -> None:
    """Background entry: continue a run released from an approval gate."""
    gateway = build_gateway()
    if gateway is None:
        return
    with SessionLocal() as db:
        run = db.get(AgentRun, run_id)
        if run is None or RunStatus(run.status) is not RunStatus.RUNNING:
            return
        _drive(db, run, gateway, resumed=True)


# ------------------------------------------------------------------- engine


def _drive(
    db: Session, run: AgentRun, gateway: ModelGateway, *, resumed: bool
) -> None:
    try:
        if not resumed:
            _plan_phase(db, run, gateway)
        final_text, tool_blocks = _reasoning_loop(db, run, gateway)
        _complete(db, run, final_text, tool_blocks)
    except _RunPaused:
        logger.info("run %s paused at an approval gate", run.id)
        return
    except GatewayError as exc:
        _fail(db, run, f"model gateway error: {exc}", source="gateway")
    except Exception as exc:  # noqa: BLE001 — a background task must never crash
        logger.exception("orchestrator failure for run %s", run.id)
        _fail(db, run, f"orchestrator error: {exc}", source="orchestrator")


def _plan_phase(db: Session, run: AgentRun, gateway: ModelGateway) -> None:
    set_run_status(db, run.id, RunStatus.PLANNING)
    emit_event(db, run.id, "planning_started", {"goal": run.goal[:500]})

    steps = generate_plan(gateway, run.goal)
    tasks: list[RunTask] = []
    for position, step in enumerate(steps):
        task = RunTask(run_id=run.id, position=position, description=step, status="pending")
        db.add(task)
        tasks.append(task)
    db.commit()
    emit_event(db, run.id, "plan_generated", {"steps": steps})

    set_run_status(db, run.id, RunStatus.READY)
    if tasks:
        tasks[0].status = "in_progress"
        db.commit()
        emit_event(
            db, run.id, "task_started", {"taskId": tasks[0].id, "description": tasks[0].description}
        )
    set_run_status(db, run.id, RunStatus.RUNNING)


def _reasoning_loop(
    db: Session, run: AgentRun, gateway: ModelGateway
) -> tuple[str, list[dict]]:
    """Bounded LLM reasoning ↔ tool execution loop.

    Returns (final_text, tool_blocks); raises _RunPaused at an approval gate.
    """
    settings = get_settings()
    max_iterations = max(1, settings.agent_max_llm_calls)
    messages = _context(db, run)
    tool_blocks: list[dict] = []

    for _ in range(max_iterations):
        # Observe external lifecycle changes (cancel/reject) between steps.
        db.expire_all()
        current = db.get(AgentRun, run.id)
        if current is None or RunStatus(current.status) in (
            RunStatus.CANCELLED,
            RunStatus.FAILED,
        ):
            raise _RunPaused  # terminal by external action — stop cleanly

        result = gateway.complete(messages, role=ModelRole.CODE, tools=get_tool_specs())
        if result.usage.total_tokens:
            emit_event(
                db,
                run.id,
                "llm_usage",
                {
                    "promptTokens": result.usage.prompt_tokens,
                    "completionTokens": result.usage.completion_tokens,
                    "totalTokens": result.usage.total_tokens,
                },
            )

        if not result.tool_calls:
            if result.content and result.content.strip():
                return result.content, tool_blocks
            raise GatewayError("model returned neither content nor tool calls")

        # Record the assistant turn (OpenAI wire shape) for the next call.
        messages.append(
            {
                "role": "assistant",
                "content": result.content,
                "tool_calls": [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": call.name,
                            "arguments": json.dumps(call.arguments),
                        },
                    }
                    for call in result.tool_calls
                ],
            }
        )

        for call in result.tool_calls:
            outcome = _invoke_tool(db, run, call)
            if outcome is None:  # paused at an approval gate
                raise _RunPaused
            tool_blocks.append(_tool_block(call, outcome))
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(outcome)[:4000],
                }
            )

    raise GatewayError(
        f"exceeded {max_iterations} reasoning iterations without a final answer"
    )


def _invoke_tool(
    db: Session, run: AgentRun, call: ToolCallRequest
) -> dict | None:
    """Permission check → events → execution. None = paused for approval."""
    emit_event(
        db,
        run.id,
        "tool_invoked",
        {"tool": call.name, "callId": call.id, "arguments": call.arguments},
    )
    if (
        tool_permission(call.name) in ("write", "dangerous")
        and not _approval_granted(db, run.id)
    ):
        approval = Approval(
            run_id=run.id,
            title=f"Approve {call.name}",
            description=json.dumps(call.arguments)[:2000],
            status="pending",
        )
        db.add(approval)
        db.commit()
        set_run_status(
            db, run.id, RunStatus.WAITING_FOR_APPROVAL, reason=f"{call.name} requires approval"
        )
        emit_event(
            db,
            run.id,
            "approval_required",
            {
                "approvalId": approval.id,
                "callId": call.id,
                "tool": call.name,
                "title": approval.title,
            },
        )
        return None

    tool = get_tool(call.name)
    if tool is not None and tool.handler is None:
        # Runner-backed tool (Phase 4): execution happens on the user's
        # machine via curvin-runner — never on the backend. Without an
        # online runner this returns an honest runner_unavailable.
        outcome = dispatch_tool(
            db,
            user_id=run.user_id,
            run_id=run.id,
            tool=call.name,
            arguments=call.arguments,
        )
    else:
        outcome = execute_tool(call.name, call.arguments)
    emit_event(
        db,
        run.id,
        "tool_result",
        {
            "tool": call.name,
            "callId": call.id,
            "ok": bool(outcome.get("ok")),
            "outcome": outcome,
        },
    )
    _observe_evidence(db, run, call, outcome)
    return outcome


def _observe_evidence(
    db: Session, run: AgentRun, call: ToolCallRequest, outcome: dict
) -> None:
    """Phase 5/6 after a tool outcome: index file facts, emit file events,
    and complete the current plan step — only with successful execution
    evidence (a failed or runner_unavailable outcome completes nothing)."""
    if not outcome.get("ok"):
        return

    touched = record_file_facts(
        db,
        project_id=run.project_id,
        tool=call.name,
        arguments=call.arguments,
        outcome=outcome,
    )
    if call.name in ("fs_read", "fs_list"):
        emit_event(db, run.id, "file_inspected", {"tool": call.name, "paths": touched[:20]})
    elif call.name == "fs_write":
        emit_event(db, run.id, "file_modified", {"tool": call.name, "paths": touched[:20]})

    # Evidence-based step completion (Phase 6): the in-progress task is done
    # only because a tool genuinely succeeded; the next step starts.
    task = db.scalar(
        select(RunTask)
        .where(RunTask.run_id == run.id, RunTask.status == "in_progress")
        .order_by(RunTask.position)
    )
    if task is not None:
        task.status = "done"
        db.commit()
        emit_event(
            db,
            run.id,
            "task_completed",
            {"taskId": task.id, "evidence": {"tool": call.name, "callId": call.id}},
        )
        nxt = db.scalar(
            select(RunTask)
            .where(RunTask.run_id == run.id, RunTask.status == "pending")
            .order_by(RunTask.position)
        )
        if nxt is not None:
            nxt.status = "in_progress"
            db.commit()
            emit_event(
                db, run.id, "task_started", {"taskId": nxt.id, "description": nxt.description}
            )


def _approval_granted(db: Session, run_id: str) -> bool:
    """A granted approval unblocks this run's gated tools (Phase 3 scope)."""
    granted = db.scalar(
        select(Approval.id)
        .where(Approval.run_id == run_id, Approval.status == "approved")
        .limit(1)
    )
    return granted is not None


def _tool_block(call: ToolCallRequest, outcome: dict) -> dict:
    ok = bool(outcome.get("ok"))
    summary = (
        str(outcome.get("summary") or outcome.get("result") or "")
        if ok
        else f"error: {outcome.get('error')}: {outcome.get('detail')}"
    )
    return {
        "kind": "tool",
        "id": f"blk_{call.id}",
        "name": call.name,
        "status": "succeeded" if ok else "failed",
        "summary": summary[:500],
        "log": [
            f"arguments: {json.dumps(call.arguments)[:500]}",
            f"result: {json.dumps(outcome)[:500]}",
        ],
    }


def _complete(db: Session, run: AgentRun, final_text: str, tool_blocks: list[dict]) -> None:
    tasks = list(
        db.scalars(
            select(RunTask).where(RunTask.run_id == run.id).order_by(RunTask.position)
        ).all()
    )
    blocks: list[dict] = [
        {"kind": "text", "id": f"blk_{run.id}_text", "content": final_text}
    ]
    if tasks:
        # Step statuses reflect runner-verified evidence: a step is `done`
        # only when a tool execution genuinely succeeded (Phase 6).
        blocks.append(
            {
                "kind": "plan",
                "id": f"blk_{run.id}_plan",
                "title": "Implementation plan",
                "steps": [
                    {"id": t.id, "title": t.description, "status": t.status}
                    for t in tasks
                ],
            }
        )
    blocks.extend(tool_blocks)

    message = Message(
        conversation_id=run.conversation_id,
        role="agent",
        status="completed",
        blocks=blocks,
        run_id=run.id,
    )
    db.add(message)
    db.commit()
    emit_event(
        db,
        run.id,
        "run_completed",
        {
            "messageId": message.id,
            "summary": final_text[:500],
            "text": final_text[:8000],
        },
    )
    set_run_status(db, run.id, RunStatus.COMPLETED)


def _fail(db: Session, run: AgentRun, reason: str, *, source: str) -> None:
    run_id = run.id
    try:
        emit_event(db, run_id, "error_occurred", {"source": source, "message": reason})
    finally:
        try:
            set_run_status(db, run_id, RunStatus.FAILED, reason=reason)
        except InvalidTransition:
            # Already terminal (e.g. cancelled concurrently) — the event log
            # still records what went wrong.
            logger.warning("run %s already terminal; failure kept in events only", run_id)


# ------------------------------------------------------------------ context


def _context(db: Session, run: AgentRun) -> list[dict]:
    """Event-sourced LLM context: system + plan + conversation + tool replay.

    Rebuilt from the database on every drive/resume, so approval-paused runs
    continue exactly where they stopped.
    """
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    tasks = list(
        db.scalars(
            select(RunTask).where(RunTask.run_id == run.id).order_by(RunTask.position)
        ).all()
    )
    if tasks:
        plan_lines = "\n".join(f"- {t.description}" for t in tasks)
        messages.append({"role": "system", "content": f"Plan:\n{plan_lines}"})

    if run.conversation_id:
        messages.extend(compact_history(db, run.conversation_id))
    file_context = project_file_context(db, run.project_id)
    if file_context is not None:
        messages.append(file_context)

    # Replay this run's tool exchanges from the event log (resume support).
    events = list(
        db.scalars(
            select(RunEvent).where(RunEvent.run_id == run.id).order_by(RunEvent.seq)
        ).all()
    )
    assistant_calls: list[dict] = []
    answered: set[str] = set()
    tool_messages: list[dict] = []
    for ev in events:
        payload = ev.payload or {}
        if ev.type == "tool_invoked":
            assistant_calls.append(
                {
                    "id": payload.get("callId") or "call_replay",
                    "type": "function",
                    "function": {
                        "name": payload.get("tool", ""),
                        "arguments": json.dumps(payload.get("arguments") or {}),
                    },
                }
            )
        elif ev.type == "tool_result":
            call_id = payload.get("callId")
            if call_id:
                answered.add(call_id)
            tool_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": json.dumps(
                        {"ok": payload.get("ok"), "outcome": payload.get("outcome")}
                    )[:4000],
                }
            )

    if assistant_calls:
        messages.append({"role": "assistant", "content": None, "tool_calls": assistant_calls})
    for entry in assistant_calls:
        if entry["id"] not in answered:
            tool_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": entry["id"],
                    "content": (
                        "The user approved this action; it was not executed — "
                        "call the tool again if it is still needed."
                    ),
                }
            )
    messages.extend(tool_messages)
    return messages
