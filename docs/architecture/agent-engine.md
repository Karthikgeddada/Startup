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

## Orchestrator + planner + tools (Phase 3 — implemented)

`app/agent/orchestrator.py` drives a run `created → planning → ready → running → (bounded loop) → completed | failed | waiting_for_approval | cancelled`:

- `orchestrate_run` / `resume_run` are the two entry points, scheduled as FastAPI background tasks by the conversations and approvals routers. An unconfigured gateway returns early, leaving runs in `created` — no fabricated progress.
- Planning (`planner.py`): the PLANNING-role model returns JSON steps (robust parse: fenced/dirty JSON, prose fallback to a single honest goal step, capped at 6); steps persist 1:1 as `run_tasks` with a `plan_generated` event; the first step starts `in_progress` — steps are never auto-marked `done` (that requires runner-verified work, Phase 6).
- Reasoning loop: `gateway.complete(...)` (CODE role, tool specs offered) → tool calls → server-side permission check → execution → tool results fed back into the message list; repeats until a final text answer, bounded by `agent_max_llm_calls` iterations and the gateway's call/token budget. Cancellation/rejection is observed between iterations.
- Approval gating: write/dangerous tools pause the run `running → waiting_for_approval` with a pending `Approval` row and `approval_required` event BEFORE any execution; `POST /approvals/{id}/approve` resumes the loop, which rebuilds its entire LLM context from the conversation + persisted event log (nothing in-process is authoritative).
- Failure honesty: `BudgetExceededError`, `ProviderError`, iteration overrun, and unexpected exceptions all land in a persisted `failed` run (`agent_runs.error` + `error_occurred` event), never a silent crash.
- Final answer persists as a frontend-compatible agent `Message` (blocks: text / plan / tool) plus a `run_completed` event.

`app/agent/tools.py` — the bounded action surface: `fs_read`/`fs_list` (read), `fs_write`/`git_commit` (write), `terminal`/`git_push` (dangerous); unknown tools default to the most restrictive class. Runner-backed tools execute on `curvin-runner` (user's machine, Phase 4) — never simulated — and until it exists report `runner_unavailable` (an honest failure the model is told about, and which surfaces as a failed tool block). The registry is injectable: tests register handler-backed tools; Phase 4 swaps in runner transport without touching the orchestrator.

Verification: 69/69 pytest on Databricks serverless compute (tests/test_orchestrator.py — scripted FakeGateway: happy path, approval pause/resume, reject→cancel, budget/provider/iteration failures, unconfigured stays created, planner parse/fallback). No live LLM call yet — no key configured.

## Model gateway (Phase 2 — implemented)

Provider-neutral (`app/agent/gateway/`): OpenAI-compatible completions, streaming (SSE chunk parsing + tool-call fragment assembly), embeddings; bounded retries with backoff on 5xx/429/transport errors; fast-fail `ProviderError` on 4xx; per-call usage accounting; per-run `ExecutionBudget` (max LLM calls + max tokens) raising `BudgetExceededError` so agent loops can never run unbounded. Logical roles (fast/planning/code/verification/embedding) resolve from env with per-role overrides, all defaulting to the base model — BYOK, server-side keys only, never exposed through the API (`GET /api/v1/models` reports status only). Tested with httpx.MockTransport; live smoke test pending a real key.
