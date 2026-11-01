# CURVIN System Overview — Phase 0 Repository Audit

**Audit date:** 2026-11-01 · **Repo state at audit:** `main`, clean, 77 files, pushed to `github.com/Karthikgeddada/Startup.git`

CURVIN is two engineering systems sharing one contract:

- **System A — CURVIN Application**: the existing Next.js 14 frontend (Home, Learn, Workspace, Recents, Discover, persistent Genie panel, approval flows).
- **System B — CURVIN Agent Engine**: an independent Python intelligence + execution backend (`curvin-backend/`, plus a future `curvin-runner` local execution companion).

The integration boundary is `src/services/types.ts` — the typed frontend–backend contract. The backend implements those shapes; the UI never changes.

---

## 1. What already exists (verified, not assumed)

### 1.1 Frontend (System A) — status by capability

| Capability | Status | Evidence |
| --- | --- | --- |
| Home dashboard (prompt-first creation, activity, recents preview) | Implemented (mock data) | `/home` route + `features/home` |
| Learn center, 16 domains, 48 chapters | Implemented, static educational content | `features/learn`, `DEMO_LEARN_DOMAINS` |
| Workspace (files, editor surface, preview, Genie panel) | Implemented (mock data) | `features/workspace` |
| Recents | Implemented (mock data) | `features/recents` |
| Discover (templates/integrations/capabilities) | Implemented (mock data; coming_soon labels honest) | `features/discover` |
| Project CRUD flows (blank / GitHub / template / AI modes) | Implemented (mock persistence, in-memory only) | `CreateProjectInput` contract, mock adapter |
| Conversations + streaming agent turns | Implemented as scripted simulation | `mock/index.ts` scripted `runTurn`, full-turn snapshots via `onUpdate` |
| Plans, tool blocks, diffs, approvals, errors, stop/retry UI | Implemented (rendered from mock block shapes) | `AgentBlock` union in `types/domain.ts` |
| Service abstraction layer (mock ↔ HTTP swap) | Implemented; HTTP adapter is a contract-shaped placeholder | `src/services/index.ts`, `env.useMocks` |
| Auth | Missing entirely (no backend, no login UI) | no auth routes/features |
| Real backend | Missing | none |
| Real agent execution | Missing | mock only, by design |
| GitHub integration | Mocked (static repo list, no API calls) | `DEMO_REPOS` |
| Tests | Implemented (unit + e2e suites; runtime never executed — no npm on build compute) | `tests/unit`, `tests/e2e` |

**Contract single source of truth:** `src/types/domain.ts` (domain model) and `src/services/types.ts` (service interfaces: `AuthService`, `ProjectsService`, `GitHubService`, `ConversationsService`, `AgentService`, `LearnService`, `DiscoverService`, `RecentsService`, `SearchService`).

### 1.2 Integration contract (what the backend must return)

The `AgentService.runTurn` contract streams progressive **full-turn snapshots** (`AgentTurn` with `blocks[]`), resolves with a terminal turn, and honours abort. `resolveApproval(conversationId, turnId, blockId, approved)` continues a gated run. The backend's run/event model must therefore be able to reconstruct an `AgentTurn` snapshot at any point — every run state change is persisted, not in-memory.

## 2. Environment capability report (Databricks serverless compute — build environment)

**Verified 2026-11-01 by direct probe:**

- Python 3.12.3, pip installs work notebook-scoped (SQLAlchemy 2, Alembic, pydantic-settings, sse-starlette installed and verified importable).
- FastAPI, uvicorn, pydantic, httpx, pytest, PyJWT preinstalled.
- git CLI available; network egress to github.com / pypi.org / api.openai.com reachable.
- `node` binary exists but **no npm/pnpm** → frontend `npm run build/test/e2e` cannot run here. All frontend verification so far is static.
- **No access to the user's Mac filesystem.** Repository inspection, terminal execution, browser automation, and dev-server runs for the *user's* projects happen on the user's machine via `curvin-runner` (Phase 4), never on Databricks.
- No browser automation runtime.
- Workspace storage is durable across sessions (Git repo persisted and pushable).

**Consequence:** backend code is authored and unit/integration-tested here with FastAPI `TestClient` + SQLite; Postgres (Supabase free tier), Vercel/Render deployment, and all filesystem/terminal operations are exercised on the user's machine. The ledger records which verifications ran where — nothing is claimed that did not run.

## 3. Target architecture

```text
CURVIN/
├── (existing Next.js frontend — untouched structure)
├── curvin-backend/     FastAPI modular monolith: API v1, persistence, agent engine
├── curvin-runner/      (Phase 4) local execution companion on the user's machine
├── docs/               architecture, api, security, development, implementation
└── packages/contracts/ (later) shared typed contract artifacts
```

**Zero-infrastructure rule:** local-first (SQLite) development; free-tier Postgres (Supabase) for persistence; BYOK model keys through the server-side model gateway only; no paid sandbox required for the agent loop (tools execute via the user's own runner). Free-tier limits are documented honestly in the backend README.

## 4. Mock vs real — acceptance rule

The mock adapters stay functional until the HTTP adapters are switched on (`NEXT_PUBLIC_USE_MOCKS=false`). The backend must never fabricate: tool results, test outcomes, command execution, or progress. Where a capability is not yet implemented (e.g. runner absent), the API returns an explicit `not_implemented` / blocked status rather than simulated success.
