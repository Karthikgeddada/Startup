# CURVIN Frontend Architecture

## Layer map

```
app routes (RSC)            server components, metadata, route groups
   │
features/* view components  one folder per navigation experience (client)
   │
components/*                shell (sidebar/header/agent) · ui primitives · brand
   │
stores/*                    Zustand: ui (persisted prefs) · agent (in-memory) · toast · learn
   │
hooks/use-services          TanStack Query wrappers (cache, retries, invalidation)
   │
services/index              ONE registry: mock adapters or HTTP adapters
   │
services/types.ts           the typed frontend–backend contract
```

Dependencies flow strictly downward. View components never import adapters
directly; they go through hooks or the registry. The contract in
`services/types.ts` is the single seam where a real backend will plug in.

## Rendering model

* Route pages are React Server Components carrying metadata; each renders a
  client feature view.
* The `(application)` route group wraps pages in the three-part
  **AppShell** (sidebar · main · agent panel).
* Persistence uses `skipHydration`: server and client render identical
  defaults; the shell rehydrates interface preferences after mount — no
  hydration mismatch, no flash.

## State ownership

| State | Owner | Persisted? |
| --- | --- | --- |
| Sidebar/panel/agent-panel open, recent searches | `stores/ui-store` | localStorage (`curvin-ui`), partialize whitelist only |
| Theme | `next-themes` | localStorage (`theme`) |
| Last Learn domain | `stores/learn-store` | localStorage (`curvin-learn`) |
| Live conversation turns | `stores/agent-store` | **No** — deliberately in-memory; the conversations service is the source of truth |
| Server data (projects, templates, domains…) | TanStack Query | No — cache only |
| Dialog state (open/mode/prompt) | `stores/ui-store` (ephemeral fields) | No |

Product data is never fabricated into localStorage: offline persistence that
misrepresents itself as real history is a non-goal.

## The agent experience

1. `PromptComposer` (shared with the Home hero) collects text + attachments.
2. The panel ensures a conversation exists, appends the user message, and
   calls `services.agent.runTurn(input, onUpdate, signal)`.
3. `onUpdate` delivers **full-turn snapshots**; the store replaces the turn in
   place (`updateTurn`) — no block-level patching bugs, order guaranteed by the
   service contract.
4. Approval blocks render Approve/Reject; `resolveApproval` releases the
   gated continuation which keeps streaming into the same callback.
5. Abort is honored end-to-end (`AbortController`); retry replays the last
   user prompt.

Every block kind (`text`, `plan`, `tool`, `diff`, `approval`, `error`) has an
explicit renderer in `components/agent/agent-message.tsx`.

## Service layer & the demo boundary

`services/index.ts` picks adapters at module load:

```ts
export const services: CurvinServices = env.useMocks ? mockServices : httpServices;
```

* Mocks simulate latency, own an in-memory session, and run a scripted agent
  (16 learning domains with real summaries, seeded projects/templates/repos,
  turn structure with a pending approval gate).
* HTTP adapters implement the same interface with a retry/backoff fetch
  client and typed failure mapping.
* With mocks on, the agent panel header shows a visible **Demo data** badge.
  No mock result is ever presented as a real backend action.

## Design system

* Tokens live in `src/styles/globals.css` (light + dark, as CSS custom
  properties) and map to Tailwind v3 utilities via `theme.extend` in
  `tailwind.config.ts` — themes swap without re-rendering components.
* `lib/utils.ts#cn` (clsx + tailwind-merge) is the single class composer.
* `lib/format.ts` formatters are pure and deterministic (callers pass `now`).
* Motion: 150–250ms, custom `ease-swift` curve; no decorative animation.

## Testing

* **Unit (Vitest, jsdom)** — `cn`/`nextId`, formatters, ui-store semantics
  (dedupe/cap recents, dialog seeding), agent-store turn streaming semantics,
  and the mock service contract (16 domains, create/list round-trips,
  snapshot streaming with abort).
* **E2E (Playwright)** — the eleven essential journeys: hero load, five-section
  navigation, sidebar persistence, command-menu search + navigation, project
  creation, per-mode validation, agent conversation + streaming, approval,
  theme persistence, recents filters, learn search + chapters.

## Known follow-ups for backend integration

1. Point `NEXT_PUBLIC_API_BASE_URL` at the service and set
   `NEXT_PUBLIC_USE_MOCKS=false`.
2. Replace the mock auth with real session bootstrapping in `services`.
3. Wire `Workspace` tabs (changes/tests/logs) to live endpoints; their empty
   states are already honest placeholders.
4. Add error telemetry behind the existing `env.NEXT_PUBLIC_ANALYTICS_ID`.
