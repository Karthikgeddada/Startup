"""Agent run state machine — pure logic, fully unit-testable.

Every accepted transition is persisted by the caller (agent_runs.status + a
run_status_changed event). The machine is the single authority on which moves
are legal; APIs reject invalid moves with 409 instead of guessing.
"""
from __future__ import annotations

from enum import Enum


class RunStatus(str, Enum):
    CREATED = "created"
    PLANNING = "planning"
    READY = "ready"
    RUNNING = "running"
    WAITING_FOR_APPROVAL = "waiting_for_approval"
    PAUSED = "paused"
    VERIFYING = "verifying"
    RECOVERING = "recovering"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


TERMINAL_STATUSES = frozenset(
    {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}
)

_TRANSITIONS: dict[RunStatus, frozenset[RunStatus]] = {
    RunStatus.CREATED: frozenset(
        {RunStatus.PLANNING, RunStatus.RUNNING, RunStatus.WAITING_FOR_APPROVAL, RunStatus.FAILED, RunStatus.CANCELLED}
    ),
    RunStatus.PLANNING: frozenset(
        {RunStatus.READY, RunStatus.RUNNING, RunStatus.FAILED, RunStatus.CANCELLED}
    ),
    RunStatus.READY: frozenset(
        {RunStatus.RUNNING, RunStatus.WAITING_FOR_APPROVAL, RunStatus.FAILED, RunStatus.CANCELLED}
    ),
    RunStatus.RUNNING: frozenset(
        {
            RunStatus.VERIFYING,
            RunStatus.WAITING_FOR_APPROVAL,
            RunStatus.PAUSED,
            RunStatus.RECOVERING,
            RunStatus.COMPLETED,
            RunStatus.FAILED,
            RunStatus.CANCELLED,
        }
    ),
    RunStatus.WAITING_FOR_APPROVAL: frozenset(
        {RunStatus.RUNNING, RunStatus.FAILED, RunStatus.CANCELLED}
    ),
    RunStatus.PAUSED: frozenset({RunStatus.RUNNING, RunStatus.FAILED, RunStatus.CANCELLED}),
    RunStatus.VERIFYING: frozenset(
        {RunStatus.COMPLETED, RunStatus.RUNNING, RunStatus.RECOVERING, RunStatus.FAILED, RunStatus.CANCELLED}
    ),
    RunStatus.RECOVERING: frozenset(
        {RunStatus.RUNNING, RunStatus.FAILED, RunStatus.CANCELLED}
    ),
    RunStatus.COMPLETED: frozenset(),
    RunStatus.FAILED: frozenset(),
    RunStatus.CANCELLED: frozenset(),
}


class InvalidTransition(Exception):
    """Raised when a run state move is not allowed by the transition table."""

    def __init__(self, current: RunStatus, target: RunStatus) -> None:
        self.current = current
        self.target = target
        super().__init__(
            f"invalid run state transition: {current.value} -> {target.value}"
        )


def can_transition(current: RunStatus, target: RunStatus) -> bool:
    return target in _TRANSITIONS[current]


def transition(current: RunStatus, target: RunStatus) -> RunStatus:
    """Validate a transition and return the new status (raises InvalidTransition)."""
    if not can_transition(current, target):
        raise InvalidTransition(current, target)
    return target


def is_terminal(status: RunStatus) -> bool:
    return status in TERMINAL_STATUSES
