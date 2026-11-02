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

## Runner protocol (Phase 4 — implemented)

The backend NEVER executes tools. `curvin-runner` is a stdlib-only single-file client (`curvin-runner/curvin_runner.py`) the user launches on their machine; it claims queued jobs, executes them inside a local sandbox, and reports the real result.

Backend side:

- Tables `runners` + `runner_jobs` (migration `b4e2f6a81c53`). Job lifecycle: `queued → claimed → succeeded | failed`; a dispatch timeout marks the job `failed` with the reason — never an invented result.
- `app/api/v1/runners.py`: `register` (per-runner bearer token shown exactly once; only its SHA-256 hash is stored), list (online = heartbeat inside `RUNNER_ONLINE_WINDOW_SECONDS`, default 30 s), `heartbeat`, `claim` (atomic oldest-queued-job-for-THIS-runner's-user update — a runner can never see another user's jobs), `report result` (409 if the job was already resolved). Runner auth is the bearer token; the user identity comes from the X-User-Id placeholder at registration only.
- `app/agent/runner_dispatch.py::dispatch_tool`: no online runner → honest `runner_unavailable` without queueing anything; otherwise enqueue + `tool_dispatched` event + a bounded wait (`RUNNER_JOB_TIMEOUT_SECONDS`, default 120 s) polling persisted job state, so a backend restart cannot strand an in-memory promise. Outcomes: runner result, `runner_error`, or `runner_timeout` — all the same shape as `tools.execute_tool` outcomes.
- Orchestrator wiring: handler-less tools (fs/terminal/git) route through `dispatch_tool`; permission classes and approval gating still apply BEFORE the job is queued, so nothing dangerous reaches the runner without an explicit approval.

Runner side (user's Mac):

- Loop: heartbeat every 10 s, claim-poll every 2 s, execute, report. Commands: `register`, `status`, `run [--once] [--root DIR]`, `test` (offline sandbox self-check, no backend needed).
- Sandbox: every filesystem path is jailed to the projects root (absolute paths rejected, `..` and symlink escapes rejected after `resolve()`), commands run with cwd inside the root under a 120 s timeout, outputs capped at 64 KB and listings at 500 entries before reporting. Token + root live in `~/.curvin-runner.json` (chmod 600).

Verification: 87/87 pytest on Databricks serverless compute (tests incl. the 11 runner tests in `tests/test_runner.py`: token never leaking, runner auth 401s, claim/report lifecycle incl. double-report 409, cross-user claim isolation, no-runner honesty with nothing queued, full dispatch flow with a background claiming thread, timeout closing the job failed, orchestrator end-to-end with a simulated runner, offline sandbox jail/truncation). `alembic upgrade head` on a fresh DB creates all 11 tables; `curvin_runner.py test` self-check passes offline. Honest limit: no live Mac execution from this compute — the user runs `curvin-runner` locally (see curvin-runner/README.md); no live LLM call yet.

## Context & memory (Phase 5 — implemented)

`app/agent/context.py` gives the orchestrator bounded, honest memory:

- **Conversation memory** (`compact_history`): the most recent 10 messages are kept verbatim; everything older collapses into ONE deterministic digest system message — each exchange truncated to 160 chars, clearly labelled "compacted — truncated, not summarised". Long conversations stay inside the model context without silently dropping history or inventing a summary.
- **Project file index** (`record_file_facts` + `project_file_context`): the `project_files` table is filled ONLY from real tool outcomes (fs_list entries, fs_read/fs_write paths+bytes) — the index is never guessed. It is injected into run context as a bounded 40-file listing so the agent knows what exists before reading.

Both are consumed by `orchestrator._context`, so approval-paused runs rebuild the same memory on resume. Verified in tests/test_context.py (digest content, verbatim window, index upserts, failed-outcome no-ops).

## Evidence-based step completion (Phase 6 — implemented)

Plan steps are never auto-completed. `orchestrator._observe_evidence` runs after every tool outcome:

- A genuinely SUCCESSFUL tool execution completes the in-progress `run_task` — the `task_completed` event carries the evidence (`{tool, callId}`) — and starts the next task (`task_started`).
- A failed or `runner_unavailable` outcome completes nothing; the step stays in progress and the model sees the honest failure.
- `file_inspected` (fs_read/fs_list) and `file_modified` (fs_write) events + the project file index update flow from the same real outcomes.
- `run_completed` carries the full final answer text (≤8 KB) so live frontends render the complete turn from the stream.

Verified: successful handler-backed tool → tasks [done, in_progress] + evidence event; failed tool → nothing completed (tests/test_context.py).

## Frontend real-mode integration (Phase 7 — implemented)

- **Backend support endpoints** (`app/api/v1/extras.py`): `/me`, `/activity` (recent runs), `/templates` (static starters), `/github/repositories` (real listing only with GITHUB_TOKEN; honest `[]` otherwise), `/recents` (real conversations+projects), `/search` (projects/conversations/indexed files). No fabricated rows anywhere.
- **Agent SSE consumer** (`src/services/agent-stream.ts`): `runTurn` POSTs the message, then reduces the run's persisted event log into `AgentTurn` snapshots — plan blocks from `plan_generated`/`task_started`/`task_completed`, tool blocks from `tool_invoked`/`tool_dispatched`/`tool_result`, approval blocks from `approval_required`/`approval_granted`/`approval_rejected`, error blocks from `error_occurred`. Streamed over fetch (not EventSource) so the X-User-Id header and AbortSignal both work; abort POSTs `/runs/{id}/cancel`. A 10-minute guard rejects honestly if a run never reaches a terminal state.
- **Registry** (`src/services/index.ts`): `NEXT_PUBLIC_USE_MOCKS=false` swaps in HTTP adapters for auth/projects/github/conversations/agent/recents/search; learn/discover remain the static content library in BOTH modes (no content backend exists — they are never presented as live data).

Honest limit: no npm on the Databricks compute — the frontend adapters are statically reviewed only; the first real gate is `npm run typecheck && npm run build` or CI on the user's machine. Backend pieces (extras endpoints) are tested: 87/87 pytest.

## Model gateway (Phase 2 — implemented)

Provider-neutral (`app/agent/gateway/`): OpenAI-compatible completions, streaming (SSE chunk parsing + tool-call fragment assembly), embeddings; bounded retries with backoff on 5xx/429/transport errors; fast-fail `ProviderError` on 4xx; per-call usage accounting; per-run `ExecutionBudget` (max LLM calls + max tokens) raising `BudgetExceededError` so agent loops can never run unbounded. Logical roles (fast/planning/code/verification/embedding) resolve from env with per-role overrides, all defaulting to the base model — BYOK, server-side keys only, never exposed through the API (`GET /api/v1/models` reports status only). Tested with httpx.MockTransport; live smoke test pending a real key.
