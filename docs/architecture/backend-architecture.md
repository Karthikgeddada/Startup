# CURVIN Backend Architecture (`curvin-backend/`)

FastAPI modular monolith. Python 3.12+, SQLAlchemy 2 ORM, Alembic migrations, Pydantic v2 schemas. Postgres in production (Supabase free tier), SQLite for local dev/tests.

## Layout

```text
curvin-backend/
├── app/
│   ├── main.py            app factory, CORS, request IDs, structured errors, router mount
│   ├── core/              config (env-driven, partial validation), database session/engine
│   ├── models.py          SQLAlchemy models (single file, phase 1 scope)
│   ├── schemas.py          Pydantic schemas mirroring src/types/domain.ts
│   ├── agent/state.py     run state machine (pure logic)
│   └── api/v1/            health, projects, conversations, runs (+SSE), approvals
├── migrations/            Alembic (autogenerate; sqlite-compatible JSON columns)
├── tests/                 pytest + TestClient (runs on Databricks compute and locally)
├── alembic.ini, requirements.txt, pyproject.toml, .env.example, README.md
```

## API surface (v1, maps to `src/services/types.ts`)

| Endpoint | Purpose | Frontend contract |
| --- | --- | --- |
| `GET /api/v1/health` | liveness + DB check | — |
| `GET/POST /api/v1/projects`, `GET /api/v1/projects/{id}` | project CRUD | `ProjectsService` |
| `GET /api/v1/projects/{id}/files` | persisted file index (empty until runner/context engine fills it) | `listRepoFiles` |
| `GET/POST /api/v1/conversations`, `GET /api/v1/conversations/{id}` | conversations w/ messages | `ConversationsService` |
| `POST /api/v1/conversations/{id}/messages` | send user prompt → persists message + creates an `AgentRun` | `AgentService.runTurn` |
| `GET /api/v1/runs`, `GET /api/v1/runs/{id}` | run + task state | — |
| `POST /api/v1/runs/{id}/cancel`, `/resume` | lifecycle control (guarded state transitions) | abort/stop UI |
| `GET /api/v1/runs/{id}/events` | **SSE** event stream with replay via `Last-Event-ID` | streaming snapshots |
| `POST /api/v1/approvals/{id}/approve`, `/reject` | approval gating | `resolveApproval` |

Cross-cutting: every mutating/reading path is user-scoped (`user_id` on all rows). Phase 1 uses a `X-User-Id` header with a seeded default dev user — real auth (sessions/JWT) replaces it without schema change. Structured error envelope `{error: {code, message, request_id}}` on all failures.

## Persistence model

- `users`, `projects` (repository fields inlined as columns), `project_files` (file index), `conversations`, `messages` (role + content or JSON `blocks`), `agent_runs`, `run_tasks`, `run_events` (monotonic per-run `seq` + JSON payload — the event log SSE replays), `approvals`.
- All state transitions persisted; restart-safe. No in-memory dictionaries as source of truth (the SSE broadcaster polls the event log, so a server restart resumes streams from persisted events).
- Migrations: Alembic autogenerate; dev/test may use `Base.metadata.create_all` for ephemeral SQLite.

## Phasing (see agent-engine.md for the engine itself)

- **Phase 1 (this unit):** foundation above. Runs are created and persisted, events logged; the orchestrator loop arrives in Phase 3, so Phase 1 runs created from messages stay in `CREATED` state with an explicit `agent_engine_not_connected` marker — no fabricated progress.
- **Phase 2:** model gateway (multi-provider, BYOK, roles, budgets).
- **Phase 3:** orchestrator + planner + tool registry → real agent turns.
- **Phase 4:** `curvin-runner` (local filesystem/terminal/git execution).
- **Phase 5 (implemented):** context & memory (`app/agent/context.py`) — compacted conversation digest + runner-verified project file index.
- **Phase 6 (implemented):** evidence-based step completion — run_tasks complete only with genuinely successful tool executions (`task_completed` carries the evidence).
- **Phase 7 (implemented):** frontend real-mode — extras endpoints (`/me`, `/activity`, `/templates`, `/github/repositories`, `/recents`, `/search`) + the SSE agent consumer (`src/services/agent-stream.ts`) + live HTTP adapters; learn/discover stay static content.
- **Phase 8–10 (future):** GitHub integration beyond listing, app builder, browser automation — no fabricated features exist for these yet.
