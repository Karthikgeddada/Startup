# CURVIN Backend — Agent Engine (Phase 1)

FastAPI modular monolith powering the CURVIN platform: persisted projects,
conversations, agent runs, a replayable run-event log (SSE), approvals, and
the run state machine. The autonomous orchestration loop, model gateway,
GitHub integration, and the local runner land in later phases (see
`../docs/architecture/backend-architecture.md`).

## What is real in Phase 1

- Project / conversation / message CRUD — **persisted** (SQLite locally, Postgres in production), user-scoped.
- Sending a message creates a **real, persisted agent run** in `created` state with a `run_created` event. It does **not** pretend to execute — the orchestrator is Phase 3. No fabricated progress, ever.
- Run lifecycle: cancel/resume/approval-gate via a validated state machine; every transition is persisted with an event.
- `GET /api/v1/runs/{id}/events` — SSE stream over the **database event log** with replay from `Last-Event-ID` (header) or `?last_event_id=` (query). Streams survive server restarts.
- Structured errors `{error: {code, message, request_id}}`, request IDs on every response, CORS for the frontend.

## What is explicitly NOT implemented yet (honest list)

- Authentication is a placeholder: `X-User-Id` header (dev user default). Real session auth replaces it without schema change.
- Model gateway (Phase 2), orchestrator/planner/tools (Phase 3), `curvin-runner` local execution (Phase 4), GitHub (Phase 8).
- `mode=github` projects are persisted as `importing` with an explicit pending-import task — not faked.

## Quickstart (local)

```bash
cd curvin-backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# API at http://localhost:8000, docs at http://localhost:8000/docs
```

Zero configuration required — SQLite is created automatically. For Postgres, copy `.env.example` → `.env` and set `DATABASE_URL` (Supabase free tier works; use the transaction pooler URI).

## Tests

```bash
pip install -r requirements.txt
pytest
```

The suite (unit + TestClient integration incl. SSE replay) runs against a throwaway SQLite database — verified on the build compute 2026-11-01.

## Migrations

Development on SQLite may rely on the auto-created schema. Production on Postgres uses Alembic:

```bash
DATABASE_URL=postgresql+psycopg2://... alembic revision --autogenerate -m "phase 1 schema"
DATABASE_URL=postgresql+psycopg2://... alembic upgrade head
```

## Deployment (zero-infra path)

Render free web service works with `uvicorn app.main:app` and this directory as root; set `DATABASE_URL` (Supabase transaction pooler), `FRONTEND_URL`, and `ENVIRONMENT=production`. Free-tier limits to plan for: Render free instances sleep after 15 min idle (first request takes ~30s to wake; SSE reconnects replay from the log, so nothing is lost) and Supabase free pauses after 7 days of inactivity.
