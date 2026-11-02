# Deploying CURVIN (Frontend & Backend)

## 1. Local verification (first run on a new machine)

```bash
npm install
npm run lint        # ESLint: next/core-web-vitals
npm run typecheck   # tsc --noEmit, strict
npm run test        # Vitest unit suites
npm run build       # production build
npm run test:e2e    # Playwright (starts the built app per playwright.config.ts)
```

`npx playwright install` once per machine for browser binaries.

The app ships in demo mode (`NEXT_PUBLIC_USE_MOCKS` defaults to true), so a
local run needs no backend.

## 2. GitHub

```bash
git init
git add .
git commit -m "CURVIN frontend foundation"
git branch -M main
git remote add origin git@github.com:<your-org>/curvin.git
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `.next`, `.env*.local`, and
Playwright artifacts. Commit `.env.example` only — never real values.

## 3. Vercel

1. Import the repository at vercel.com → **Add New → Project**.
2. Framework preset: **Next.js** (auto-detected; `vercel.json` is included with
   sensible defaults — `@vercel/next` runtime, static/ISR hints for
   `/home`, `/learn`, `/workspace`, `/recents`, `/discover`, and `/(api)/health`).
3. Environment variables (Production + Preview):
   * `NEXT_PUBLIC_USE_MOCKS` — keep `true` until the backend is live, then `false`.
   * `NEXT_PUBLIC_API_BASE_URL` — e.g. `https://api.curvin.dev` (no trailing slash).
   * `NEXT_PUBLIC_ANALYTICS_ID` — optional.
4. Deploy. Verify `https://<deployment>.vercel.app/api/health` returns
   `{"status":"ok",…}`.

### Preview deployments

Every PR gets a Vercel preview with the same env — convenient for design QA
against the mock layer.

## 4. Switching to the real backend

1. Set `NEXT_PUBLIC_USE_MOCKS=false` and `NEXT_PUBLIC_API_BASE_URL`.
2. The registry (`src/services/index.ts`) binds the HTTP adapters; the
   contract in `services/types.ts` is the integration checklist.
3. Keep the mock suite running in CI with `NEXT_PUBLIC_USE_MOCKS=true` — it is
   the fastest regression net for the UI.

## 5. CI (GitHub Actions, optional starter)

A minimal workflow: install → lint → typecheck → unit tests → build. Add
Playwright in a second job with `npx playwright install --with-deps`.

## 6. Operational notes

* `/api/health` is the liveness probe for uptime monitors and Vercel checks.
* Error boundary (`src/app/error.tsx`) guarantees a recovery path — pair it
  with your observability tool once analytics is enabled.
* Interface preferences persist per-browser in localStorage (`curvin-ui`,
  `curvin-learn`, `theme`); clearing site data resets the demo UI safely.

## 7. Backend deployment (Render + Supabase)

The backend deploys as a Render web service defined by `render.yaml` at the
repo root (Render Blueprint). Postgres is your existing Supabase project;
migrations run automatically on every boot — `alembic upgrade head` is
idempotent. Verified boot path: migrate → serve → `GET /api/v1/health` →
`{"status": "ok"}`, runners included.

### 7.1 Supabase (database)

1. Supabase dashboard → your project → **Connect → Transaction pooler** →
   copy the URI.
2. Rewrite it into the SQLAlchemy form the backend expects:

   ```text
   postgresql+psycopg2://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
   ```

   Keep port **6543** (transaction pooler — direct connections don't survive
   serverless-style pooling), the `+psycopg2` driver, and `sslmode=require`.

### 7.2 Render (API service)

1. **dashboard.render.com → New → Blueprint** → select this repo;
   `render.yaml` is picked up automatically (`curvin-backend`, free plan,
   health check `/api/v1/health`).
2. Fill the prompted (`sync: false`) env vars — values live in Render only,
   never in the repo:
   * `DATABASE_URL` — the Supabase URL from 7.1.
   * `FRONTEND_URL` — your Vercel origin (e.g. `https://curvin.vercel.app`);
     enables credentialed CORS for the browser.
   * `LLM_API_KEY` / `LLM_PROVIDER` / `LLM_BASE_URL` / `LLM_MODEL` — the model
     gateway (server-side only; `/api/v1/models` reports status, never keys).
3. Apply. Build: `pip install -r requirements.txt`. Boot:
   `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
4. Verify: `curl https://<service>.onrender.com/api/v1/health` →
   `{"status": "ok", "database": "ok", ...}`.

Free-plan note: the service sleeps after ~15 idle minutes; the first request
after sleep takes ~30 s to wake. curvin-runner heartbeats/claims tolerate
this (bounded waits fail honestly, never fabricate).

### 7.3 Point everything at the deployed backend

* **curvin-runner** (your Mac — tool execution stays local by design):
  `python3 curvin_runner.py register --server https://<service>.onrender.com --root ~/CurvinProjects`
  then `python3 curvin_runner.py run`.
* **Frontend** (Vercel): keep `NEXT_PUBLIC_USE_MOCKS=true` until Phase 7 ships
  the HTTP adapters; then set it to `false` with
  `NEXT_PUBLIC_API_BASE_URL=https://<service>.onrender.com`.
* **API consumers**: same base URL with `X-User-Id` (identity placeholder
  until real auth lands).
