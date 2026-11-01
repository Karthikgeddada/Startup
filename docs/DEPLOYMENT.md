# Deploying CURVIN Frontend

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
