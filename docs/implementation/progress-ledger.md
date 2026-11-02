# CURVIN Implementation Progress Ledger

Statuses: `NOT_STARTED · IN_PROGRESS · BLOCKED · IMPLEMENTED · TESTED · VERIFIED`. Updated after every meaningful unit of work. Verification notes record **where** each check ran (Databricks compute vs user machine).

## Phase 0 — Repository audit & architecture

| ID | Task | Status | Files | Verification |
| --- | --- | --- | --- | --- |
| P0-1 | Repository audit: structure, routes, contracts, mock vs real classification | VERIFIED | — (read-only) | Contracts read from `src/services/types.ts`, `src/types/domain.ts`; git state checked (main, clean); findings in docs/architecture/system-overview.md |
| P0-2 | Environment capability probe | VERIFIED | — | Direct probe on Databricks serverless 2026-11-01: Python 3.12.3; fastapi/uvicorn/pytest preinstalled; sqlalchemy/alembic/pydantic-settings/sse-starlette installed OK; git CLI + network OK; node w/o npm; no Mac filesystem access. Recorded in system-overview.md §2 |
| P0-3 | Architecture docs (system overview, backend, agent engine) | IMPLEMENTED | docs/architecture/*.md | Content review pending user; structural check done |

## Phase 1 — Backend foundation

| ID | Task | Status | Files | Verification |
| --- | --- | --- | --- | --- |
| P1-1 | FastAPI app factory, config, DB session, structured errors, request IDs, health | VERIFIED | curvin-backend/app/main.py, app/core/config.py, app/core/database.py, app/api/v1/health.py | pytest on Databricks compute (SQLite TestClient): health ok, request-id header, error envelopes — 43/43 tests passed 2026-11-01 |
| P1-2 | SQLAlchemy models (users, projects, project_files, conversations, messages, agent_runs, run_tasks, run_events, approvals) + Alembic | VERIFIED | curvin-backend/app/models.py, alembic.ini, migrations/env.py, migrations/versions/20261101_9cd1e2cdfe93_phase_1_schema.py | Alembic autogenerate → 9 tables; `alembic upgrade head` applied to a fresh SQLite DB, all 9 tables verified present |
| P1-3 | Run state machine | VERIFIED | curvin-backend/app/agent/state.py | 25 unit tests: legal paths, terminal states, invalid transitions — all passed |
| P1-4 | API v1 routers (projects, conversations+messages, runs+SSE+cancel/resume, approvals) | VERIFIED | curvin-backend/app/api/v1/*.py | TestClient integration: user scoping (cross-user 404), run creation + persistence, cancel/409, approve/reject gating, SSE replay incl. Last-Event-ID cursor |
| P1-5 | Backend test suite | VERIFIED | curvin-backend/tests/ | 43 tests (18 integration + 25 state machine) — `pytest` rc 0 on Databricks compute, SQLite throwaway DB |

## Phase 2 — Model gateway

| ID | Task | Status | Files | Verification |
| --- | --- | --- | --- | --- |
| P2-1 | Gateway core: roles, tool specs, results, errors, budgets | VERIFIED | curvin-backend/app/agent/gateway/base.py | unit tests: role enum, budget call/token enforcement, error hierarchy — 60/60 suite passed 2026-11-01 |
| P2-2 | OpenAI-compatible provider (complete/stream/embed, retries, accounting) | VERIFIED | curvin-backend/app/agent/gateway/openai_compat.py | httpx.MockTransport tests: content/tool-call parsing incl. garbage-JSON fallback, tool serialization on the wire, retry on 500 (2 attempts), 401 no-retry, transport-error exhaustion, SSE delta + tool-fragment assembly + usage + done events, embeddings ordered parse |
| P2-3 | Role resolution + config (BYOK, per-role overrides, partial validation) | VERIFIED | curvin-backend/app/agent/gateway/roles.py, app/core/config.py, .env.example | unit tests: fallback to base model, per-role override, missing-config error names every missing LLM_* var |
| P2-4 | /api/v1/models status endpoint (no key exposure) | VERIFIED | curvin-backend/app/api/v1/models.py, app/main.py | endpoint tests: unconfigured → configured:false with actionable message; configured (dependency override) → roles + provider; response text contains no key material |

Honest limit: no live provider call yet (no LLM_API_KEY configured). Wire format matches the standard OpenAI schema the MockTransport fixtures mirror; live smoke test is the first task once a key is set.

## Phase 3 — Orchestrator, planner, tool registry

| ID | Task | Status | Files | Verification |
| --- | --- | --- | --- | --- |
| P3-1 | Tool registry (permission classes, injectable handlers, honest `runner_unavailable`) | VERIFIED | curvin-backend/app/agent/tools.py | unit coverage via orchestrator tests; 6 built-ins registered (fs_read/fs_list read; fs_write/git_commit write; terminal/git_push dangerous); unknown tools default dangerous |
| P3-2 | Planner (PLANNING-role JSON steps, robust parse w/ single-step fallback) | VERIFIED | curvin-backend/app/agent/planner.py | unit tests: fenced JSON, prose-wrapped JSON, no-JSON, empty steps, gateway-error fallback |
| P3-3 | Orchestrator loop (planning→run_tasks, bounded LLM↔tool loop, budget/cancel checks, approval pause, event-sourced context resume, agent Message w/ frontend blocks) | VERIFIED | curvin-backend/app/agent/orchestrator.py | scripted-FakeGateway tests verify persisted state: run status transitions + events (run_status_changed/planning_started/plan_generated/task_started/tool_invoked/tool_result/llm_usage/run_completed), run_tasks (first in_progress, never auto-done), agent Message blocks [text, plan, tool] |
| P3-4 | Router wiring (message → background orchestrate; approve → background resume) | VERIFIED | curvin-backend/app/api/v1/conversations.py, approvals.py | integration test: unconfigured gateway leaves run `created` with exactly [run_created] event (Phase 1 contract preserved); approval test drives the same resume path the router schedules |
| P3-5 | Orchestrator test suite | VERIFIED | curvin-backend/tests/test_orchestrator.py | 69/69 pytest on Databricks serverless compute 2026-11-02 (60 prior + 9 new: happy path, approval pause/resume, reject→cancel, budget exhaustion→failed, ProviderError→failed, iteration bound→failed, unconfigured→created, planner fallback, planner parse) |

Honest limit (unchanged): no live LLM call — no key configured; all model behaviour verified with a scripted in-process FakeGateway. At the time of Phase 3 closeout tools reported `runner_unavailable` pending curvin-runner; as of Phase 4 they dispatch to the runner (see above). Plan steps are not auto-completed — real coding work (Phase 6) completes them with evidence.

## Phase 4 — curvin-runner (local tool execution)

| ID | Task | Status | Files | Verification |
| --- | --- | --- | --- | --- |
| P4-1 | Runner + RunnerJob models, migration (queued → claimed → succeeded/failed), config knobs | VERIFIED | curvin-backend/app/models.py, migrations/versions/20261102_b4e2f6a81c53_phase_4_runner_schema.py, app/core/config.py | `alembic upgrade head` on a fresh SQLite DB creates all 11 tables; tz-naive SQLite datetimes normalised for the online-window check |
| P4-2 | Runner API (register w/ one-time token + SHA-256 hash, list/online, heartbeat, atomic user-scoped claim, report w/ 409 guard) | VERIFIED | curvin-backend/app/api/v1/runners.py, app/schemas.py, app/main.py | TestClient tests: token 401s, lifecycle, double-report 409, cross-user claim isolation |
| P4-3 | Dispatch layer (no-runner honesty, queued job + `tool_dispatched` event, bounded poll wait, `runner_timeout` closes job failed) wired into orchestrator for handler-less tools; approval gating still precedes dispatch | VERIFIED | curvin-backend/app/agent/runner_dispatch.py, orchestrator.py | full flow with a background claiming thread (second TestClient), timeout path, orchestrator end-to-end with simulated runner |
| P4-4 | curvin-runner client (stdlib-only single file: register/heartbeat/claim/execute/report; path-jail sandbox, 120 s command timeout, 64 KB output cap, 500-entry listing cap; `~/.curvin-runner.json` chmod 600) | VERIFIED | curvin-runner/curvin_runner.py, curvin-runner/README.md | offline sandbox tests in tests/test_runner.py + `curvin_runner.py test` self-check passes (path jail, round-trip, terminal, unknown tool, truncation) |
| P4-5 | Runner test suite | VERIFIED | curvin-backend/tests/test_runner.py | 80/80 pytest on Databricks serverless compute 2026-11-02 (69 prior + 11 new) |

Honest limit: the backend and runner are verified against each other via simulated runners (background claim/report threads); no live Mac execution from this compute — the user launches `curvin-runner` locally per curvin-runner/README.md. No live LLM call yet.

## Phase 5+ — planned (see docs/architecture/backend-architecture.md)

P5 context/memory · P6 real coding agent · P7 frontend integration · P8 GitHub · P9 app builder · P10 browser · P11 deployment — all `NOT_STARTED`.

## Blockers / honest limits

- Frontend build/test cannot run on this compute (no npm). Statically validated only; first real gate is CI or Vercel build.
- No Mac filesystem access from Databricks: all repository/terminal ops for user projects deferred to `curvin-runner` (Phase 4).
- Postgres connectivity from this compute untested (psycopg2 unavailable here); Postgres validation happens on user machine / Render.
- Notebooks-scoped pip installs on Databricks compute do not survive compute recycling — each session must reinstall deps before running tests (commands in curvin-backend/README.md). The workspace filesystem rejects `__pycache__` writes: run pytest from a /tmp copy of curvin-backend.
- Runs now execute end-to-end through the orchestrator when LLM_* settings are configured; without them they stay `created` — no fabricated progress. Runner-backed tools dispatch to `curvin-runner` (Phase 4, implemented): without an online runner they report `runner_unavailable` and nothing is queued. Live Mac execution still needs the user to run `curvin-runner` locally.
