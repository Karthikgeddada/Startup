# CURVIN Agent Engine Design

Independent intelligence + execution system inside `curvin-backend/app/agent/`. Runs without the frontend (API + SSE only), which the frontend then renders.

## Run state machine (implemented Phase 1, `agent/state.py`)

```text
CREATED → PLANNING → READY → RUNNING ⇄ WAITING_FOR_APPROVAL
                                   │       ↖ PAUSED (user pause)
RUNNING → VERIFYING → COMPLETED   ↘ RECOVERING → RUNNING
any non-terminal → CANCELLED / FAILED
```

States: `CREATED, PLANNING, READY, RUNNING, WAITING_FOR_APPROVAL, PAUSED, VERIFYING, RECOVERING, COMPLETED, FAILED, CANCELLED`. `transition(current, next)` validates against an explicit transition table; invalid moves raise `InvalidTransition` and are rejected by the API. Every accepted transition is persisted (`agent_runs.status` + a `run_status_changed` event).

## Event model (persistence-backed, replayable)

`run_events(run_id, seq, type, payload)` with monotonic per-run `seq`. SSE clients reconnect with `Last-Event-ID` and receive full replay — the source of truth is the database, never an in-process queue.

Event catalog (superset of the spec's Part 14 list; emitted progressively as phases land):

```text
run_created, run_status_changed, planning_started, plan_generated,
task_started, task_completed, tool_invoked, tool_result,
file_inspected, file_modified, diff_generated,
approval_required, approval_granted, approval_rejected,
test_started, test_completed, error_occurred,
recovery_started, recovery_completed, run_completed, run_failed, run_cancelled
```

The frontend adapter (Phase 7) reduces this log into progressive `AgentTurn` snapshots (blocks: text / plan / tool / diff / approval / error), satisfying the `runTurn(onUpdate)` contract.

## Execution loop (Phase 3 target)

Intent understanding → context retrieval → plan → iterated `LLM reasoning → permission check → tool call → result → context update` (bounded iterations, token budget, cancellation checks) → independent verification → final report. Permissions are enforced **server-side before** tool execution; the LLM never gates itself. Bounded repair loop for verification failures.

## Tool registry (Phase 3–4)

Filesystem, terminal, git, package-manager, browser tool classes. Each tool: id, name, description, input/output schema, permission class, timeout, retry policy. Filesystem/terminal/git handlers execute on `curvin-runner` (user's machine) via the runner protocol — never simulated. Until the runner exists, tool calls fail honestly with `runner_unavailable`.

## Model gateway (Phase 2)

Provider-neutral (OpenAI-compatible first), env/BYOK server-side keys only, logical roles (fast/planning/code/verification/embedding), streaming, tool-call adapters, usage accounting, fallbacks.
