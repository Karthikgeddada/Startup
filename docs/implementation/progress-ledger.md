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
| P1-1 | FastAPI app factory, config, DB session, structured errors, request IDs, health | IN_PROGRESS | curvin-backend/app/main.py, app/core/* | pytest on Databricks compute (SQLite) — pending |
| P1-2 | SQLAlchemy models (users, projects, project_files, conversations, messages, agent_runs, run_tasks, run_events, approvals) + Alembic | IN_PROGRESS | curvin-backend/app/models.py, migrations/ | pending |
| P1-3 | Run state machine | IN_PROGRESS | curvin-backend/app/agent/state.py | unit tests — pending |
| P1-4 | API v1 routers (projects, conversations+messages, runs+SSE, approvals) | IN_PROGRESS | curvin-backend/app/api/v1/* | TestClient integration tests — pending |
| P1-5 | Backend test suite | IN_PROGRESS | curvin-backend/tests/ | pytest — pending |

## Phase 2+ — planned (see docs/architecture/backend-architecture.md)

P2 model gateway · P3 orchestrator/planner/tools · P4 curvin-runner · P5 context/memory · P6 real coding agent · P7 frontend integration · P8 GitHub · P9 app builder · P10 browser · P11 deployment — all `NOT_STARTED`.

## Blockers / honest limits

- Frontend build/test cannot run on this compute (no npm). Statically validated only; first real gate is CI or Vercel build.
- No Mac filesystem access from Databricks: all repository/terminal ops for user projects deferred to `curvin-runner` (Phase 4).
- Postgres connectivity from this compute untested (psycopg2 unavailable here); Postgres validation happens on user machine / Render.
