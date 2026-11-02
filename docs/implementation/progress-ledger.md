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

## Phase 3+ — planned (see docs/architecture/backend-architecture.md)

P3 orchestrator/planner/tools · P4 curvin-runner · P5 context/memory · P6 real coding agent · P7 frontend integration · P8 GitHub · P9 app builder · P10 browser · P11 deployment — all `NOT_STARTED`.

## Blockers / honest limits

- Frontend build/test cannot run on this compute (no npm). Statically validated only; first real gate is CI or Vercel build.
- No Mac filesystem access from Databricks: all repository/terminal ops for user projects deferred to `curvin-runner` (Phase 4).
- Postgres connectivity from this compute untested (psycopg2 unavailable here); Postgres validation happens on user machine / Render.
- Notebooks-scoped pip installs on Databricks compute do not survive compute recycling — each session must reinstall `sqlalchemy pydantic-settings sse-starlette alembic` before running tests (commands in curvin-backend/README.md).
- Run execution itself (orchestrator) is Phase 3: messages create persisted runs in `created` state; no fabricated progress.
