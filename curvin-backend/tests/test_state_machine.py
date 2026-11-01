"""Unit tests for the agent run state machine (pure logic)."""
from __future__ import annotations

import pytest

from app.agent.state import (
    InvalidTransition,
    RunStatus,
    TERMINAL_STATUSES,
    can_transition,
    is_terminal,
    transition,
)


class TestLegalPaths:
    def test_happy_path(self):
        path = [
            RunStatus.CREATED,
            RunStatus.PLANNING,
            RunStatus.READY,
            RunStatus.RUNNING,
            RunStatus.VERIFYING,
            RunStatus.COMPLETED,
        ]
        current = path[0]
        for nxt in path[1:]:
            assert transition(current, nxt) is nxt
            current = nxt

    def test_approval_gate_roundtrip(self):
        assert transition(RunStatus.RUNNING, RunStatus.WAITING_FOR_APPROVAL) is RunStatus.WAITING_FOR_APPROVAL
        assert transition(RunStatus.WAITING_FOR_APPROVAL, RunStatus.RUNNING) is RunStatus.RUNNING

    def test_pause_and_resume(self):
        assert transition(RunStatus.RUNNING, RunStatus.PAUSED) is RunStatus.PAUSED
        assert transition(RunStatus.PAUSED, RunStatus.RUNNING) is RunStatus.RUNNING

    def test_recovery_loop(self):
        assert transition(RunStatus.RUNNING, RunStatus.RECOVERING) is RunStatus.RECOVERING
        assert transition(RunStatus.RECOVERING, RunStatus.RUNNING) is RunStatus.RUNNING

    @pytest.mark.parametrize(
        "status",
        [
            RunStatus.CREATED,
            RunStatus.PLANNING,
            RunStatus.READY,
            RunStatus.RUNNING,
            RunStatus.WAITING_FOR_APPROVAL,
            RunStatus.PAUSED,
            RunStatus.VERIFYING,
            RunStatus.RECOVERING,
        ],
    )
    def test_any_live_state_can_cancel_and_fail(self, status):
        assert can_transition(status, RunStatus.CANCELLED)
        assert can_transition(status, RunStatus.FAILED)


class TestTerminalStates:
    @pytest.mark.parametrize("status", sorted(TERMINAL_STATUSES, key=lambda s: s.value))
    def test_terminal_states_allow_nothing(self, status):
        assert is_terminal(status)
        for target in RunStatus:
            assert not can_transition(status, target)

    @pytest.mark.parametrize(
        "status",
        [
            RunStatus.CREATED,
            RunStatus.PLANNING,
            RunStatus.READY,
            RunStatus.RUNNING,
            RunStatus.WAITING_FOR_APPROVAL,
            RunStatus.PAUSED,
            RunStatus.VERIFYING,
            RunStatus.RECOVERING,
        ],
    )
    def test_live_states_are_not_terminal(self, status):
        assert not is_terminal(status)


class TestInvalidTransitions:
    def test_completed_cannot_resume(self):
        with pytest.raises(InvalidTransition):
            transition(RunStatus.COMPLETED, RunStatus.RUNNING)

    def test_cancelled_cannot_be_cancelled_again(self):
        with pytest.raises(InvalidTransition):
            transition(RunStatus.CANCELLED, RunStatus.CANCELLED)

    def test_created_cannot_complete_directly(self):
        # Verification must precede completion from CREATED.
        with pytest.raises(InvalidTransition):
            transition(RunStatus.CREATED, RunStatus.COMPLETED)

    def test_failed_cannot_recover(self):
        with pytest.raises(InvalidTransition):
            transition(RunStatus.FAILED, RunStatus.RECOVERING)

    def test_error_message_contains_states(self):
        with pytest.raises(InvalidTransition) as excinfo:
            transition(RunStatus.COMPLETED, RunStatus.PLANNING)
        assert "completed" in str(excinfo.value)
        assert "planning" in str(excinfo.value)
