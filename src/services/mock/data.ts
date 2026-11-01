/**
 * DEMO DATA — development only.
 *
 * Everything in this file is fabricated sample content served by the mock
 * service adapters when NEXT_PUBLIC_USE_MOCKS=true. It never represents real
 * user data, real repositories, or real agent activity, and it is removed the
 * moment the real backend adapters are switched on.
 */
import type {
  ActivityItem,
  AgentMessage,
  Conversation,
  DiscoverEntry,
  GitHubRepository,
  LearningDomain,
  Project,
  ProjectTemplate,
  RecentItem,
  RepoFile,
  UserProfile,
} from "@/types/domain";

/** ISO timestamps relative to first module load so the demo always looks alive. */
const NOW = Date.now();
const ago = (hours: number): string => new Date(NOW - hours * 3_600_000).toISOString();

export const DEMO_USER: UserProfile = {
  id: "user-1",
  name: "Demo User",
  email: "demo@curvin.dev",
  createdAt: ago(24 * 90),
};

export const DEMO_TEMPLATES: ProjectTemplate[] = [
  { id: "tpl-next-saas", name: "Next.js SaaS Starter", description: "Marketing site, auth, billing-ready dashboard, and Postgres access in one repo.", category: "Web app", stack: ["Next.js", "TypeScript", "Tailwind CSS", "Postgres"] },
  { id: "tpl-fastapi-service", name: "FastAPI Microservice", description: "Typed REST service with health checks, structured logs, and CI.", category: "Backend", stack: ["Python", "FastAPI", "Docker", "GitHub Actions"] },
  { id: "tpl-rag-chat", name: "RAG Chat Application", description: "Document ingestion, vector search, and a streaming chat UI over your own corpus.", category: "AI", stack: ["Next.js", "Python", "pgvector"] },
  { id: "tpl-elt-pipeline", name: "Analytics ELT Pipeline", description: "Scheduled ingestion into warehouse tables with data-quality checks and a refresh dashboard.", category: "Data", stack: ["Python", "dbt", "DuckDB"] },
  { id: "tpl-realtime-app", name: "Realtime Collaboration App", description: "Presence, cursors, and shared state with conflict resolution.", category: "Web app", stack: ["React", "WebSocket", "CRDTs"] },
  { id: "tpl-ml-service", name: "ML Inference Service", description: "Model serving with batch and online endpoints, plus drift monitoring.", category: "AI", stack: ["Python", "PyTorch", "Docker"] },
  { id: "tpl-express-api", name: "Express REST API", description: "Modular Node API with validation, auth, and OpenAPI generation.", category: "Backend", stack: ["Node.js", "Express", "Zod"] },
  { id: "tpl-landing", name: "Product Landing Page", description: "High-performance marketing page with analytics and CMS content.", category: "Web app", stack: ["Next.js", "Tailwind CSS"] },
];

export const DEMO_REPOS: GitHubRepository[] = [
  { id: "repo-atlas", owner: "acme-labs", name: "atlas-analytics", description: "Customer analytics dashboard — metrics, cohorts, and alerts.", primaryLanguage: "TypeScript", stars: 184, isPrivate: false, updatedAt: ago(5) },
  { id: "repo-copilot", owner: "acme-labs", name: "support-copilot", description: "Support answer assistant backed by RAG over docs.", primaryLanguage: "Python", stars: 96, isPrivate: false, updatedAt: ago(31) },
  { id: "repo-billing", owner: "acme-labs", name: "billing-core", description: "Payments, invoices, dunning.", primaryLanguage: "Go", stars: 51, isPrivate: true, updatedAt: ago(96) },
  { id: "repo-portfolio", owner: "demo", name: "portfolio", description: "Personal portfolio site.", primaryLanguage: "TypeScript", stars: 3, isPrivate: false, updatedAt: ago(300) },
];

export const DEMO_PROJECTS: Project[] = [
  {
    id: "proj-atlas",
    name: "Atlas Analytics",
    description: "Customer analytics dashboard with cohort analysis and alerting.",
    status: "active",
    repository: { id: "repo-atlas", provider: "github", owner: "acme-labs", name: "atlas-analytics", url: "https://github.com/acme-labs/atlas-analytics", defaultBranch: "main" },
    activeBranch: "feat/retention-widget",
    techStack: ["Next.js", "TypeScript", "Postgres"],
    currentTask: "Building retention widget (awaiting approval)",
    templateId: "tpl-next-saas",
    createdAt: ago(24 * 40),
    updatedAt: ago(3),
    lastActivityAt: ago(1),
  },
  {
    id: "proj-copilot",
    name: "Support Copilot",
    description: "RAG assistant that answers support tickets from documentation.",
    status: "active",
    repository: { id: "repo-copilot", provider: "github", owner: "acme-labs", name: "support-copilot", url: "https://github.com/acme-labs/support-copilot", defaultBranch: "main" },
    activeBranch: "main",
    techStack: ["Python", "FastAPI", "pgvector"],
    currentTask: null,
    templateId: "tpl-rag-chat",
    createdAt: ago(24 * 12),
    updatedAt: ago(26),
    lastActivityAt: ago(20),
  },
  {
    id: "proj-pricing",
    name: "Pricing Engine Migration",
    description: "Move usage-based pricing to the new engine without downtime.",
    status: "draft",
    repository: { id: "repo-billing", provider: "github", owner: "acme-labs", name: "billing-core", url: "https://github.com/acme-labs/billing-core", defaultBranch: "main" },
    activeBranch: null,
    techStack: ["Go", "Postgres"],
    currentTask: null,
    templateId: null,
    createdAt: ago(24 * 3),
    updatedAt: ago(24 * 2),
    lastActivityAt: ago(24 * 2),
  },
  {
    id: "proj-portfolio",
    name: "Portfolio Site",
    description: "Personal site for a software engineer.",
    status: "active",
    repository: null,
    activeBranch: null,
    techStack: ["Next.js", "Tailwind CSS"],
    currentTask: null,
    templateId: "tpl-landing",
    createdAt: ago(24 * 6),
    updatedAt: ago(24 * 4),
    lastActivityAt: ago(24 * 4),
  },
];

export const DEMO_REPO_FILES: RepoFile[] = [
  { path: "src/app", type: "dir", sizeBytes: null },
  { path: "src/app/page.tsx", type: "file", sizeBytes: 4820 },
  { path: "src/app/layout.tsx", type: "file", sizeBytes: 1310 },
  { path: "src/components", type: "dir", sizeBytes: null },
  { path: "src/components/retention-widget.tsx", type: "file", sizeBytes: 6240 },
  { path: "src/lib/metrics.ts", type: "file", sizeBytes: 2980 },
  { path: "src/lib/api.ts", type: "file", sizeBytes: 1540 },
  { path: "package.json", type: "file", sizeBytes: 980 },
  { path: "README.md", type: "file", sizeBytes: 2210 },
  { path: "tests/retention.spec.ts", type: "file", sizeBytes: 1870 },
];

export const DEMO_ACTIVITY: ActivityItem[] = [
  { id: "act-1", projectId: "proj-atlas", description: "Agent proposed a change to src/components/retention-widget.tsx — awaiting approval", createdAt: ago(1) },
  { id: "act-2", projectId: "proj-atlas", description: "Test suite passed on feat/retention-widget (23 tests)", createdAt: ago(6) },
  { id: "act-3", projectId: "proj-copilot", description: "Indexed 148 documentation pages into the knowledge base", createdAt: ago(20) },
  { id: "act-4", projectId: "proj-portfolio", description: "Project created from template “Product Landing Page”", createdAt: ago(24 * 4) },
  { id: "act-5", projectId: "proj-pricing", description: "Draft created — repository billing-core connected", createdAt: ago(24 * 2) },
  { id: "act-6", projectId: "proj-copilot", description: "Answer quality improved after ingestion tuning (pass@5 0.61 → 0.74)", createdAt: ago(24 * 5) },
];

export const DEMO_CONVERSATIONS: Conversation[] = [
  {
    id: "conv-retention",
    title: "Retention widget on Atlas",
    projectId: "proj-atlas",
    repositoryId: "repo-atlas",
    createdAt: ago(8),
    updatedAt: ago(1),
    messages: [
      {
        id: "msg-r1",
        role: "user",
        content: "Add a 30-day retention widget to the Atlas dashboard. Use the existing metrics library and keep the visual style consistent.",
        attachments: [],
        createdAt: ago(8),
      },
      {
        id: "turn-r1",
        role: "agent",
        status: "completed",
        createdAt: ago(7.9),
        blocks: [
          {
            kind: "text",
            id: "blk-r1-text",
            content: "I scanned the repository and mapped how the metrics library is used today. Here is my plan before touching any code.",
          },
          {
            kind: "plan",
            id: "blk-r1-plan",
            title: "Implementation plan",
            steps: [
              { id: "step-1", title: "Understand metrics library surface (src/lib/metrics.ts)", status: "done" },
              { id: "step-2", title: "Add retention aggregation to the metrics client", status: "done" },
              { id: "step-3", title: "Build the retention widget component", status: "done" },
              { id: "step-4", title: "Add tests and run the suite", status: "done" },
            ],
          },
          {
            kind: "tool",
            id: "blk-r1-tool",
            name: "repo-scan",
            status: "succeeded",
            summary: "Indexed 214 files across src/, tests/, and config",
            log: [
              "resolving import graph…",
              "src/lib/metrics.ts exports 9 functions (3 relevant)",
              "3 components import <MetricCard/>",
              "done in 3.9s",
            ],
          },
          {
            kind: "tool",
            id: "blk-r1-tests",
            name: "test-runner",
            status: "succeeded",
            summary: "23 passed · 0 failed · 1.8s",
            log: ["vitest run — 23 files", "all green", "done in 1.8s"],
          },
        ],
      },
    ],
  },
  {
    id: "conv-copilot-index",
    title: "Reindex support docs",
    projectId: "proj-copilot",
    repositoryId: "repo-copilot",
    createdAt: ago(24 * 4),
    updatedAt: ago(24 * 4),
    messages: [
      {
        id: "msg-c1",
        role: "user",
        content: "The knowledge base is stale. Reindex the docs and tell me what changed.",
        attachments: [],
        createdAt: ago(24 * 4),
      },
      {
        id: "turn-c1",
        role: "agent",
        status: "completed",
        createdAt: new Date(NOW - 24 * 4 * 3_600_000 + 60_000).toISOString(),
        blocks: [
          {
            kind: "text",
            id: "blk-c1-text",
            content: "Reindexed 148 pages. 9 pages changed, 3 were added, and 2 moved. Ingestion tuning raised answer quality from 0.61 to 0.74 pass@5.",
          },
        ],
      },
    ],
  },
];

export const DEMO_DISCOVER: DiscoverEntry[] = [
  { id: "dsc-gh", kind: "integration", category: "Integrations", title: "GitHub", description: "Import repositories, work on branches, and push reviewed changes.", status: "available", action: { label: "Import a repository", href: "/home?new=github" } },
  { id: "dsc-prompt", kind: "capability", category: "Curvin capabilities", title: "Prompt-first project creation", description: "Describe an application in plain language and Curvin plans it with you.", status: "available", action: { label: "Start with a prompt", href: "/home?new=ai" } },
  { id: "dsc-understand", kind: "capability", category: "Curvin capabilities", title: "Codebase understanding", description: "Repository scans that map structure, dependencies, and conventions.", status: "available", action: { label: "Open an active project", href: "/workspace" } },
  { id: "dsc-approvals", kind: "capability", category: "Curvin capabilities", title: "Review & approve changes", description: "Diffs, tests, and execution logs presented for explicit approval.", status: "available", action: { label: "Open the agent panel", href: "/workspace" } },
  { id: "tpl-disc-next", kind: "template", category: "Templates", title: "Next.js SaaS Starter", description: "Auth, dashboard, billing-ready marketing pages.", status: "available", action: { label: "Use this template", href: "/home?new=template&template=tpl-next-saas" } },
  { id: "tpl-disc-rag", kind: "template", category: "Templates", title: "RAG Chat Application", description: "Ingestion, vector search, streaming chat.", status: "available", action: { label: "Use this template", href: "/home?new=template&template=tpl-rag-chat" } },
  { id: "dsc-vercel", kind: "integration", category: "Integrations", title: "Vercel", description: "One-click preview deployments from Curvin projects.", status: "coming_soon", action: null },
  { id: "dsc-linear", kind: "integration", category: "Integrations", title: "Linear", description: "Turn Curvin tasks into tracked issues.", status: "coming_soon", action: null },
  { id: "dsc-supabase", kind: "integration", category: "Integrations", title: "Supabase", description: "Managed Postgres for Curvin projects.", status: "coming_soon", action: null },
  { id: "dsc-autotests", kind: "capability", category: "Curvin capabilities", title: "Autonomous test generation", description: "Curvin proposes test suites from the code it changes.", status: "coming_soon", action: null },
  { id: "ex-rag", kind: "example", category: "Examples", title: "RAG over product docs", description: "End-to-end walkthrough of the Support Copilot project.", status: "coming_soon", action: null },
];

export const DEMO_RECENTS: RecentItem[] = [
  { id: "rec-1", type: "project", title: "Atlas Analytics", subtitle: "feat/retention-widget", projectId: "proj-atlas", href: "/workspace?project=proj-atlas", lastAccessedAt: ago(1) },
  { id: "rec-2", type: "conversation", title: "Retention widget on Atlas", subtitle: "Curvin Agent", projectId: "proj-atlas", href: "/workspace?project=proj-atlas", lastAccessedAt: ago(1) },
  { id: "rec-3", type: "file", title: "src/components/retention-widget.tsx", subtitle: "Atlas Analytics", projectId: "proj-atlas", href: "/workspace?project=proj-atlas", lastAccessedAt: ago(3) },
  { id: "rec-4", type: "project", title: "Support Copilot", subtitle: "main", projectId: "proj-copilot", href: "/workspace?project=proj-copilot", lastAccessedAt: ago(20) },
  { id: "rec-5", type: "session", title: "Reindexed knowledge base", subtitle: "Support Copilot", projectId: "proj-copilot", href: "/workspace?project=proj-copilot", lastAccessedAt: ago(20) },
  { id: "rec-6", type: "project", title: "Pricing Engine Migration", subtitle: "Draft", projectId: "proj-pricing", href: "/workspace?project=proj-pricing", lastAccessedAt: ago(24 * 2) },
  { id: "rec-7", type: "conversation", title: "Reindex support docs", subtitle: "Curvin Agent", projectId: "proj-copilot", href: "/workspace?project=proj-copilot", lastAccessedAt: ago(24 * 4) },
  { id: "rec-8", type: "project", title: "Portfolio Site", subtitle: "No repository", projectId: "proj-portfolio", href: "/workspace?project=proj-portfolio", lastAccessedAt: ago(24 * 4) },
];

/** The Learn seed below is genuine, evergreen educational material. */
export const DEMO_LEARN_DOMAINS: LearningDomain[] = [
  { id: "cs-fundamentals", slug: "cs-fundamentals", title: "Computer Science Fundamentals", summary: "The vocabulary of computing: data representation, abstraction, and how machines execute programs.", related: ["data-structures", "operating-systems"], chapters: [
    { id: "csf-1", slug: "representation", title: "Data representation", minutes: 8, summary: "Bits, two’s complement integers, IEEE-754 floats, and why 0.1 + 0.2 ≠ 0.3 in binary.", code: { language: "text", snippet: "0.1 + 0.2 === 0.30000000000000004 // IEEE-754 double precision" } },
    { id: "csf-2", slug: "abstraction", title: "Abstraction and interfaces", minutes: 7, summary: "Layering systems so each level can be reasoned about independently — from ISA to API contracts.", code: undefined },
    { id: "csf-3", slug: "complexity-classes", title: "Complexity classes", minutes: 9, summary: "P, NP, and decidability at an intuitive level, plus what “tractable” means for engineering.", code: undefined },
  ] },
  { id: "data-structures", slug: "data-structures", title: "Data Structures and Algorithms", summary: "How data is organised decides what operations cost. Core structures, analysis, and algorithmic patterns.", related: ["cs-fundamentals", "system-design"], chapters: [
    { id: "dsa-1", slug: "arrays-lists", title: "Arrays, lists, and hashing", minutes: 12, summary: "Contiguity vs pointer structure; hash tables give expected O(1) lookup and how collisions are handled." },
    { id: "dsa-2", slug: "trees-graphs", title: "Trees and graphs", summary: "Trees for hierarchies, graphs for relationships; BFS for shortest steps, DFS for reachability.", minutes: 14 },
    { id: "dsa-3", slug: "amortized", title: "Amortized analysis", minutes: 8, summary: "Why dynamic arrays append in O(1) amortised time even though individual appends may reallocate.", code: { language: "python", snippet: "arr = []\nfor i in range(1_000_000):\n    arr.append(i)  # amortised O(1) despite reallocations" } },
  ] },
  { id: "oop", slug: "oop", title: "Object-Oriented Programming", summary: "Modelling with objects: encapsulation, inheritance, composition, and the design trade-offs between them.", related: ["software-architecture", "software-testing"], chapters: [
    { id: "oop-1", slug: "encapsulation", title: "Encapsulation and invariants", minutes: 8, summary: "Objects protect their invariants; getters/setters are a smell, meaningful operations are the goal." },
    { id: "oop-2", slug: "composition", title: "Composition over inheritance", minutes: 9, summary: "Fragile base-class coupling vs delegating to small collaborators — with refactor sketches." },
    { id: "oop-3", slug: "polymorphism", title: "Polymorphism in practice", minutes: 10, summary: "Subtyping vs parametric generics vs ad-hoc interfaces, and when each fits.", code: { language: "typescript", snippet: "interface Notifier { notify(user: User, msg: string): Promise<void> }" } },
  ] },
  { id: "operating-systems", slug: "operating-systems", title: "Operating Systems", summary: "What the machine really does under your program: processes, memory, and concurrency primitives.", related: ["cs-fundamentals", "production-engineering"], chapters: [
    { id: "os-1", slug: "processes-threads", title: "Processes and threads", minutes: 11, summary: "Isolation vs shared address spaces; context switches and why threads are cheap-ish but not free." },
    { id: "os-2", slug: "virtual-memory", title: "Virtual memory", minutes: 12, summary: "Pages, TLBs, and copy-on-write — the machinery behind fast process start and fork()." },
    { id: "os-3", slug: "scheduling", title: "Scheduling and I/O", minutes: 9, summary: "How the OS interleaves work and what “blocking” on a syscall actually means." },
  ] },
  { id: "networks", slug: "networks", title: "Computer Networks", summary: "How bytes move between programs: the layered model, TCP/UDP, HTTP, and what makes requests slow.", related: ["cloud-computing", "backend-engineering"], chapters: [
    { id: "net-1", slug: "layers", title: "Layers and the end-to-end principle", minutes: 10, summary: "Why the internet keeps intelligence at the edges and keeps the core dumb and fast." },
    { id: "net-2", slug: "tcp", title: "TCP and reliability", minutes: 12, summary: "Handshakes, flow control, congestion control, and why latency ≠ bandwidth.", code: { language: "text", snippet: "RTT ≈ 2 × propagation + queueing; throughput ≤ window / RTT" } },
    { id: "net-3", slug: "http", title: "HTTP in depth", minutes: 11, summary: "Versions 1.1 → 2 → 3, connection reuse, caching, and idempotency semantics engineers actually rely on." },
  ] },
  { id: "databases", slug: "databases", title: "Database Systems", summary: "Storage engines, indexes, transactions, and the consistency models that determine what your data means.", related: ["backend-engineering", "system-design"], chapters: [
    { id: "db-1", slug: "indexes", title: "Indexes and access paths", minutes: 12, summary: "B-trees, covering indexes, and why a wrong index is worse than none — with query plan reading.", code: { language: "sql", snippet: "EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 10;" } },
    { id: "db-2", slug: "transactions", title: "Transactions and isolation", minutes: 13, summary: "ACID, isolation levels, and the anomalies each level permits (dirty reads, phantoms, write skew)." },
    { id: "db-3", slug: "models", title: "Relational, document, and search", minutes: 10, summary: "When normalisation helps, when documents win, and how inverted indexes power search." },
  ] },
  { id: "frontend-engineering", slug: "frontend-engineering", title: "Frontend Engineering", summary: "Building interfaces that are fast, accessible, and maintainable: rendering, state, and the browser platform.", related: ["software-architecture", "software-testing"], chapters: [
    { id: "fe-1", slug: "rendering", title: "Rendering models", minutes: 12, summary: "CSR, SSR, streaming SSR, and islands — the trade-offs behind each and how to choose per route.", code: { language: "tsx", snippet: "// Server Component by default; add \"use client\" only where interactivity demands it" } },
    { id: "fe-2", slug: "state", title: "State management", minutes: 10, summary: "Server state vs UI state; caching and invalidation beats duplicated client stores." },
    { id: "fe-3", slug: "accessibility", title: "Accessibility as engineering", minutes: 11, summary: "Semantics first, keyboard parity, focus management, and accessible announcements — built in, not bolted on." },
  ] },
  { id: "backend-engineering", slug: "backend-engineering", title: "Backend Engineering", summary: "APIs, background work, and the operational disciplines that keep services reliable.", related: ["databases", "production-engineering"], chapters: [
    { id: "be-1", slug: "api-design", title: "API design", minutes: 12, summary: "Resources, idempotency, pagination (cursor over offset), and versioning without breaking clients.", code: { language: "http", snippet: "GET /v1/projects?cursor=eyJpZCI6…&limit=20" } },
    { id: "be-2", slug: "async-jobs", title: "Queues and background jobs", minutes: 10, summary: "At-least-once delivery, idempotent handlers, retries with backoff, and dead-letter discipline." },
    { id: "be-3", slug: "observability", title: "Observability", minutes: 9, summary: "Structured logs, metrics, and traces as three views of the same behaviour." },
  ] },
  { id: "system-design", slug: "system-design", title: "System Design", summary: "Composing services under real constraints: traffic, failure, latency budgets, and evolution.", related: ["databases", "cloud-computing"], chapters: [
    { id: "sd-1", slug: "back-of-envelope", title: "Back-of-envelope estimation", minutes: 9, summary: "QPS, byte math, and latency numbers every engineer should carry in their head.", code: { language: "text", snippet: "1M req/day ≈ 12 req/s · RAM read ~100ns · cross-datacenter RTT ~30–100ms" } },
    { id: "sd-2", slug: "caching", title: "Caching strategies", minutes: 11, summary: "Read-through, write-behind, invalidation, and the thundering herd." },
    { id: "sd-3", slug: "partitioning", title: "Sharding and replication", minutes: 13, summary: "Partition keys, hot spots, consistent hashing, and leader/follower trade-offs." },
  ] },
  { id: "software-architecture", slug: "software-architecture", title: "Software Architecture", summary: "Structure on purpose: boundaries, coupling, and architecture that survives requirements change.", related: ["oop", "frontend-engineering"], chapters: [
    { id: "sa-1", slug: "boundaries", title: "Boundaries and coupling", minutes: 10, summary: "Modules whose internals can change without the rest noticing; the dependency rule." },
    { id: "sa-2", slug: "patterns", title: "Patterns without dogma", minutes: 11, summary: "Layering, ports & adapters, and when a monolith is the right answer." },
    { id: "sa-3", slug: "evolution", title: "Evolving architecture", minutes: 9, summary: "Fitness functions and the economics of rewriting vs strangling a system incrementally." },
  ] },
  { id: "ai-ml", slug: "ai-ml", title: "Artificial Intelligence and Machine Learning", summary: "Learning from data: classical ML, deep learning, evaluation, and LLM systems like retrieval-augmented generation.", related: ["data-structures", "system-design"], chapters: [
    { id: "ml-1", slug: "evaluation", title: "Evaluation before modelling", minutes: 10, summary: "Datasets, splits, leakage, and choosing metrics that reflect the decision being made.", code: { language: "python", snippet: "X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y, random_state=42)" } },
    { id: "ml-2", slug: "deep-learning", title: "Deep learning essentials", minutes: 14, summary: "Gradients, backpropagation, and why depth helps — the minimal maths needed to debug training runs." },
    { id: "ml-3", slug: "rag", title: "RAG systems", minutes: 12, summary: "Chunking, embeddings, retrieval quality, and measuring answer faithfulness instead of vibes." },
  ] },
  { id: "cloud-computing", slug: "cloud-computing", title: "Cloud Computing", summary: "Managed infrastructure and the responsibility model: compute, storage, networking, and cost.", related: ["system-design", "devops"], chapters: [
    { id: "cl-1", slug: "responsibility", title: "The shared responsibility model", minutes: 8, summary: "What the provider guarantees, what you own, and where most outages actually originate." },
    { id: "cl-2", slug: "serverless", title: "Serverless and functions", minutes: 11, summary: "Cold starts, execution limits, and event-driven design — including why agents belong on dedicated compute.", code: { language: "text", snippet: "Vercel function timeout (default 10s, max 60s) — no long-running execution engines" } },
    { id: "cl-3", slug: "cost", title: "Cloud cost literacy", minutes: 9, summary: "Unit economics per request, storage lifecycle tiers, and tagging before scaling." },
  ] },
  { id: "devops", slug: "devops", title: "DevOps", summary: "Pipeline-to-production discipline: CI/CD, infrastructure as code, and release safety.", related: ["production-engineering", "cybersecurity"], chapters: [
    { id: "do-1", slug: "cicd", title: "Continuous integration", minutes: 10, summary: "Fast, deterministic pipelines; test selection; trunk-based development.", code: { language: "yaml", snippet: "on: [pull_request]\njobs:\n  verify:\n    steps: [run: npm ci && npm run typecheck && npm test && npm run build]" } },
    { id: "do-2", slug: "iac", title: "Infrastructure as code", minutes: 11, summary: "Declarative, reviewable, reproducible environments — and state management pitfalls." },
    { id: "do-3", slug: "progressive", title: "Progressive delivery", minutes: 9, summary: "Feature flags, canaries, blue-green deploys, and rollback as a first-class operation." },
  ] },
  { id: "cybersecurity", slug: "cybersecurity", title: "Cybersecurity", summary: "Trust boundaries, common vulnerability classes, and secure engineering habits.", related: ["backend-engineering", "networks"], chapters: [
    { id: "sec-1", slug: "owasp", title: "The usual suspects", minutes: 12, summary: "Injection, broken access control, SSRF, and deserialisation — with concrete examples and fixes.", code: { language: "sql", snippet: "-- parameterised, never interpolated\nSELECT * FROM users WHERE email = $1;" } },
    { id: "sec-2", slug: "authz", title: "Authentication vs authorization", minutes: 10, summary: "Sessions, tokens, and the client-side checks that must never be the only check." },
    { id: "sec-3", slug: "secrets", title: "Secrets hygiene", minutes: 7, summary: "Where secrets live, what leaks into browser bundles, and safe local development patterns." },
  ] },
  { id: "software-testing", slug: "software-testing", title: "Software Testing and Quality Engineering", summary: "Confidence per test: the pyramid, contracts, and failure analysis that makes tests worth their runtime.", related: ["devops", "frontend-engineering"], chapters: [
    { id: "st-1", slug: "pyramid", title: "The test pyramid", minutes: 10, summary: "Fast unit tests, fewer integration tests, thin end-to-end suite — and when to invert it." },
    { id: "st-2", slug: "flaky", title: "Flakiness and determinism", minutes: 9, summary: "Time, randomness, and ordering as the enemies; seeding and fakes over real I/O in unit tests." },
    { id: "st-3", slug: "e2e", title: "End-to-end journeys", minutes: 11, summary: "Testing what users actually do with Playwright, and keeping the suite parallel and fast.", code: { language: "typescript", snippet: "test(\"sidebar collapses\", async ({ page }) => {\n  await page.getByRole(\"button\", { name: \"Collapse sidebar\" }).click();\n});" } },
  ] },
  { id: "production-engineering", slug: "production-engineering", title: "Production Engineering", summary: "Running software in the real world: SLOs, incidents, capacity, and graceful degradation.", related: ["devops", "operating-systems"], chapters: [
    { id: "pe-1", slug: "slos", title: "SLOs and error budgets", minutes: 11, summary: "Defining what “up” means numerically and letting the budget drive feature-vs-reliability decisions.", code: { language: "text", snippet: "99.9% monthly SLO ⇒ error budget = 0.1% × 30d ≈ 43 minutes" } },
    { id: "pe-2", slug: "incidents", title: "Incident response", minutes: 10, summary: "Mitigate first, diagnose second; blameless postmortems that fix systems, not people." },
    { id: "pe-3", slug: "degradation", title: "Graceful degradation", minutes: 9, summary: "Load shedding, feature flags as circuit breakers, and queue-based buffering under overload." },
  ] },
];

/** Search corpus assembled from the other seeds at adapter call time. */
export function buildSearchCorpus(): { title: string; subtitle: string | null; category: "projects" | "conversations" | "files" | "documentation" | "templates"; href: string }[] {
  const projects = DEMO_PROJECTS.map((p) => ({ title: p.name, subtitle: p.description, category: "projects" as const, href: `/workspace?project=${p.id}` }));
  const conversations = DEMO_CONVERSATIONS.map((c) => ({ title: c.title, subtitle: "Conversation", category: "conversations" as const, href: "/workspace" }));
  const files = DEMO_REPO_FILES.filter((f) => f.type === "file").map((f) => ({ title: f.path, subtitle: "Atlas Analytics", category: "files" as const, href: "/workspace?project=proj-atlas" }));
  const templates = DEMO_TEMPLATES.map((t) => ({ title: t.name, subtitle: t.description, category: "templates" as const, href: `/home?new=template&template=${t.id}` }));
  const docs = DEMO_LEARN_DOMAINS.map((d) => ({ title: d.title, subtitle: "Learn", category: "documentation" as const, href: "/learn" }));
  return [...projects, ...conversations, ...files, ...templates, ...docs];
}

/** Extra demo messages exported for scripted agent turns in mock/index.ts. */
export const DEMO_AGENT_MESSAGES: Record<string, AgentMessage[]> = Object.fromEntries(
  DEMO_CONVERSATIONS.map((conversation) => [conversation.id, conversation.messages]),
);
