# CURVIN — Frontend

A premium, production-grade frontend for **CURVIN**, an AI-powered autonomous
software engineering platform. Built with Next.js 14 (App Router), React 18,
TypeScript (strict), Tailwind CSS v3, TanStack Query, Zustand, React Hook Form +
Zod, Vitest and Playwright.

> **Demo mode by default.** Out of the box the app runs on typed mock adapters
> — realistic latency, structured agent turns with approvals — clearly labeled
> `Demo data` in the agent panel. Nothing pretends to be a real backend:
> set `NEXT_PUBLIC_USE_MOCKS=false` to bind the HTTP adapters to your service.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000 — redirects to /home
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run typecheck` | Strict TypeScript check |
| `npm run test` | Vitest unit suites |
| `npm run test:e2e` | Playwright end-to-end suites |

## Environment

Copy `.env.example` to `.env.local`. All variables are `NEXT_PUBLIC_` only —
server secrets never enter this app.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_USE_MOCKS` | `true` | Mock adapters vs. HTTP adapters |
| `NEXT_PUBLIC_API_BASE_URL` | `""` | Backend base URL for HTTP adapters |
| `NEXT_PUBLIC_ANALYTICS_ID` | `""` | Optional analytics id |

The contract is validated once at module load (`src/config/env.ts`) — bad
values fail fast at build time, not silently at runtime.

## What is inside

* **Five navigation experiences** — Home (prompt-first), Learn (16-domain
  curriculum), Workspace (project-centric, six honest tabs), Recents
  (search/filter/sort), Discover (curated, availability always labeled).
* **The agent panel** — persistent right column with conversation list,
  context selector, structured turns (plans, tool logs, diff previews,
  approvals with explicit Approve/Reject), stop, retry, and error blocks.
* **Command menu** — ⌘K/Ctrl+K global search + actions, full keyboard control.
* **Project creation** — one dialog, four honest modes: blank, GitHub import,
  template, prompt-first; validated with React Hook Form + Zod; success is
  only claimed when the service call resolves.
* **Design system** — Apple-premium neutral palette, `#0071e3` accent,
  light/dark tokens, 2px-radius steps, one accent per screen, motion 150–250ms.

See `docs/ARCHITECTURE.md` for the layer map and `docs/DEPLOYMENT.md` for
Vercel/GitHub deployment.

## Project layout

```
src/
  app/                 # App Router routes — (application) group mounts the shell
  components/          # ui/ (primitives), layout/ (shell), agent/, shared/, brand/
  features/            # home, learn, workspace, recents, discover
  services/            # typed contracts + mock/ + http/ adapters behind one registry
  stores/              # Zustand: ui (persisted prefs), agent (in-memory), toast, learn
  hooks/               # TanStack Query wrappers over the service registry
  config/  lib/  styles/  types/
tests/unit/            # Vitest: utils, format, stores, services
  tests/e2e/           # Playwright: the eleven essential journeys
```

## Engineering principles

1. **Typed boundary.** Every data-facing call goes through
   `src/services/types.ts` contracts. Mocks and HTTP adapters are
   interchangeable behind `src/services/index.ts`.
2. **Honest UI.** Empty states, loading states, and failures are explicit.
   No fabricated data, no dead controls, no premature success claims.
3. **Accessible by default.** Semantic landmarks, focus rings, aria wiring,
   keyboard paths for every interaction, honest labels.
4. **Persistence rules.** Only interface preferences persist to localStorage
   (sidebar, panel, theme via next-themes, recent searches). Product data —
   projects, conversations, messages — lives behind the service layer.

## Verification status

This codebase was authored with static validation (import paths, prop/type
contracts, route names cross-checked); runtime verification with
`npm run build`, `npm run test`, and `npm run test:e2e` is the final gate on
your machine or CI — see `docs/DEPLOYMENT.md`.
