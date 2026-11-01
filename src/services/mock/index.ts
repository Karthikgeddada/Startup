/**
 * MOCK SERVICE ADAPTERS — development only.
 *
 * Implements every contract in services/types.ts against the demo data seed
 * with simulated latency, an in-memory session store, and a fully scripted
 * (deterministic) agent turn. Switching to the real backend is one env var.
 */
import type {
  AgentBlock,
  AgentTurn,
  Conversation,
  PlanStep,
  Project,
  RecentItem,
  SearchResult,
  UserMessage,
} from "@/types/domain";
import type {
  AgentService,
  AuthService,
  ConversationsService,
  CurvinServices,
  DiscoverService,
  GitHubService,
  LearnService,
  ProjectsService,
  RecentsService,
  SearchService,
} from "@/services/types";
import {
  buildSearchCorpus,
  DEMO_ACTIVITY,
  DEMO_CONVERSATIONS,
  DEMO_DISCOVER,
  DEMO_LEARN_DOMAINS,
  DEMO_PROJECTS,
  DEMO_RECENTS,
  DEMO_REPO_FILES,
  DEMO_REPOS,
  DEMO_TEMPLATES,
  DEMO_USER,
} from "@/services/mock/data";

// ------------------------------------------------------------------ helpers

let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${(seq += 1)}`;
const iso = (): string => new Date().toISOString();

function delay<T>(value: T, ms = 160, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

const clone = <T>(value: T): T => structuredClone(value);

// -------------------------------------------------------- in-session state
// The mock store mutates in memory only. Closing the tab resets it; durable
// persistence belongs to the backend, which is exactly the point being made.
const state = {
  projects: clone(DEMO_PROJECTS),
  conversations: clone(DEMO_CONVERSATIONS),
  recents: clone(DEMO_RECENTS),
};

function recordRecent(item: Omit<RecentItem, "id" | "lastAccessedAt">): void {
  state.recents = [
    { ...item, id: nextId("rec"), lastAccessedAt: iso() },
    ...state.recents,
  ].slice(0, 40);
}

// ------------------------------------------------------------------ adapters

const auth: AuthService = {
  getCurrentUser: () => delay(clone(DEMO_USER), 120),
};

const projects: ProjectsService = {
  listProjects: () =>
    delay(
      [...state.projects].sort(
        (a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
      ),
      200,
    ),

  getProject: async (id) =>
    delay(state.projects.find((project) => project.id === id) ?? null, 140),

  createProject: async (input) => {
    if (input.name.trim().length === 0) {
      throw new Error("Project name is required");
    }
    const project: Project = {
      id: nextId("proj"),
      name: input.name.trim(),
      description: input.description.trim(),
      status: input.mode === "template" || input.mode === "github" ? "active" : "draft",
      repository: null,
      activeBranch: null,
      techStack: [],
      currentTask: null,
      templateId: input.templateId ?? null,
      createdAt: iso(),
      updatedAt: iso(),
      lastActivityAt: iso(),
    };

    if (input.mode === "github") {
      const repo = DEMO_REPOS.find((r) => r.id === input.githubRepoId);
      if (!repo) throw new Error("Repository not found");
      project.repository = {
        id: repo.id,
        provider: "github",
        owner: repo.owner,
        name: repo.name,
        url: `https://github.com/${repo.owner}/${repo.name}`,
        defaultBranch: "main",
      };
      project.activeBranch = "main";
      if (!project.description) project.description = repo.description;
    }

    if (input.mode === "template") {
      const template = DEMO_TEMPLATES.find((t) => t.id === input.templateId);
      if (!template) throw new Error("Template not found");
      project.techStack = [...template.stack];
      if (!project.description) project.description = template.description;
    }

    if (input.mode === "ai" && input.prompt) {
      // The AI mode creates the project shell only. The agent conversation —
      // where the actual planning happens — starts explicitly from the panel.
      project.currentTask = null;
    }

    await delay(null, 650); // deliberate: creation is a real operation
    state.projects = [project, ...state.projects];
    recordRecent({
      type: "project",
      title: project.name,
      subtitle: project.repository ? `${project.repository.owner}/${project.repository.name}` : "No repository",
      projectId: project.id,
      href: `/workspace?project=${project.id}`,
    });
    return clone(project);
  },

  listActivity: (limit) => delay(clone(DEMO_ACTIVITY).slice(0, limit), 180),

  listTemplates: () => delay(clone(DEMO_TEMPLATES), 150),

  listRepoFiles: async (projectId) => {
    const project = state.projects.find((p) => p.id === projectId);
    await delay(null, 220);
    return project?.repository ? clone(DEMO_REPO_FILES) : [];
  },
};

const github: GitHubService = {
  listRepositories: () => delay(clone(DEMO_REPOS), 320),
};

const conversations: ConversationsService = {
  listConversations: () =>
    delay(
      [...state.conversations].sort(
        (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      ),
      180,
    ),

  getConversation: async (id) =>
    delay(state.conversations.find((conversation) => conversation.id === id) ?? null, 120),

  createConversation: async (input) => {
    const conversation: Conversation = {
      id: nextId("conv"),
      title: input.title.trim() || "New conversation",
      projectId: input.projectId,
      repositoryId: null,
      messages: [],
      createdAt: iso(),
      updatedAt: iso(),
    };
    await delay(null, 240);
    state.conversations = [conversation, ...state.conversations];
    return clone(conversation);
  },
};

// ------------------------------------------------------------ scripted agent

/** Continuations for turns paused at an approval block. */
const approvalGates = new Map<string, (approved: boolean) => void>();

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

const agent: AgentService = {
  runTurn: async (input, onUpdate, signal) => {
    const project = state.projects.find((p) => p.id === input.projectId) ?? null;

    const turn: AgentTurn = {
      id: nextId("turn"),
      role: "agent",
      status: "running",
      blocks: [],
      createdAt: iso(),
    };

    const emit = () => onUpdate(clone(turn));
    const addBlock = (block: AgentBlock) => {
      turn.blocks.push(block);
      emit();
    };

    const updateBlock = (blockId: string, patch: (block: AgentBlock) => void) => {
      const index = turn.blocks.findIndex((block) => block.id === blockId);
      if (index === -1) return;
      const block = turn.blocks[index]!;
      patch(block);
      turn.blocks[index] = block;
      emit();
    };

    try {
      addBlock({
        kind: "text",
        id: nextId("blk"),
        content: project
          ? `Looking at ${project.name}${project.repository ? ` (${project.repository.owner}/${project.repository.name})` : ""}. I'll map the relevant code before proposing anything.`
          : "I'll help with that. Since no project is selected, I'll answer conceptually and keep it actionable.",
      });
      await wait(600, signal);

      const steps: PlanStep[] = [
        { id: nextId("step"), title: "Understand the relevant code", status: "pending" },
        { id: nextId("step"), title: "Draft the change", status: "pending" },
        { id: nextId("step"), title: "Present the diff for approval", status: "pending" },
      ];
      const planBlockId = nextId("blk");
      addBlock({ kind: "plan", id: planBlockId, title: "Proposed plan", steps });
      await wait(500, signal);

      const toolBlockId = nextId("blk");
      addBlock({
        kind: "tool",
        id: toolBlockId,
        name: "repo-scan",
        status: "running",
        summary: "Scanning repository…",
        log: [],
      });
      for (const line of ["resolving import graph…", "found 3 related modules", "run complete"]) {
        await wait(520, signal);
        updateBlock(toolBlockId, (block) => {
          if (block.kind === "tool") {
            block.log.push(line);
            block.summary = `Scanning repository… ${block.log.length} lines`;
          }
        });
      }
      await wait(400, signal);
      updateBlock(toolBlockId, (block) => {
        if (block.kind === "tool") {
          block.status = "succeeded";
          block.summary = "Indexed 214 files · 3 related modules";
        }
      });
      updateBlock(planBlockId, (block) => {
        if (block.kind === "plan") block.steps[0]!.status = "done";
      });
      await wait(400, signal);

      if (project?.repository) {
        updateBlock(planBlockId, (block) => {
          if (block.kind === "plan") block.steps[1]!.status = "in_progress";
        });
        await wait(700, signal);
        addBlock({
          kind: "diff",
          id: nextId("blk"),
          filePath: "src/components/agent-demo.tsx",
          additions: 3,
          deletions: 1,
          lines: [
            { type: "ctx", text: "export function Widget() {" },
            { type: "del", text: "  const data = useLegacyHook();" },
            { type: "add", text: "  const data = useMetricsClient();" },
            { type: "ctx", text: "  return <MetricCard data={data} />;" },
          ],
        });
        updateBlock(planBlockId, (block) => {
          if (block.kind === "plan") {
            block.steps[1]!.status = "done";
            block.steps[2]!.status = "in_progress";
          }
        });
        await wait(500, signal);

        const approvalBlockId = nextId("blk");
        addBlock({
          kind: "approval",
          id: approvalBlockId,
          title: "Apply this change?",
          description: "The diff replaces the legacy hook with the metrics client on one component. Nothing is applied until you approve.",
          status: "pending",
        });

        // Pause until the user resolves the approval (or aborts).
        const approved = await new Promise<boolean>((resolve, reject) => {
          approvalGates.set(turn.id, resolve);
          signal.addEventListener(
            "abort",
            () => {
              approvalGates.delete(turn.id);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });

        updateBlock(approvalBlockId, (block) => {
          if (block.kind === "approval") {
            block.status = approved ? "approved" : "rejected";
          }
        });

        if (approved) {
          const testsBlockId = nextId("blk");
          addBlock({
            kind: "tool",
            id: testsBlockId,
            name: "test-runner",
            status: "running",
            summary: "Running test suite…",
            log: ["vitest run — 23 files"],
          });
          await wait(1100, signal);
          updateBlock(testsBlockId, (block) => {
            if (block.kind === "tool") {
              block.status = "succeeded";
              block.summary = "23 passed · 0 failed · 1.8s";
              block.log.push("all green");
            }
          });
          addBlock({
            kind: "text",
            id: nextId("blk"),
            content: "Change applied and verified. The branch now has a green suite — review it whenever you're ready.",
          });
        } else {
          addBlock({
            kind: "text",
            id: nextId("blk"),
            content: "Understood — nothing was applied. Tell me what you'd like changed and I'll prepare a new proposal.",
          });
        }
        updateBlock(planBlockId, (block) => {
          if (block.kind === "plan") block.steps[2]!.status = "done";
        });
      } else {
        addBlock({
          kind: "text",
          id: nextId("blk"),
          content:
            "This account-level conversation is planning-only in the demo. Open a project with a connected repository to see diffs, approvals, and test runs.",
        });
      }

      turn.status = "completed";
      emit();
      persistTurn(input.conversationId, input.prompt, turn);
      return clone(turn);
    } catch (error) {
      turn.status = signal.aborted ? "cancelled" : "failed";
      if (!signal.aborted) {
        turn.blocks.push({
          kind: "error",
          id: nextId("blk"),
          title: "The agent run failed",
          message: error instanceof Error ? error.message : "Unknown error",
          retryable: true,
        });
      }
      emit();
      persistTurn(input.conversationId, input.prompt, turn);
      return clone(turn);
    }
  },

  resolveApproval: (conversationId, turnId, _blockId, approved) =>
    new Promise<AgentTurn>((resolve) => {
      const gate = approvalGates.get(turnId);
      if (gate) {
        gate(approved);
        approvalGates.delete(turnId);
      }
      const conversation = state.conversations.find((c) => c.id === conversationId);
      const turn = conversation?.messages.find(
        (message): message is AgentTurn => message.id === turnId && message.role === "agent",
      );
      resolve(clone(turn ?? { id: turnId, role: "agent", status: "completed", blocks: [], createdAt: iso() }));
    }),
};

/** Store the finished exchange so reopening a conversation shows it. */
function persistTurn(conversationId: string, prompt: string, turn: AgentTurn): void {
  const userMessage: UserMessage = {
    id: nextId("msg"),
    role: "user",
    content: prompt,
    attachments: [],
    createdAt: turn.createdAt,
  };
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (conversation) {
    conversation.messages.push(userMessage, clone(turn));
    conversation.updatedAt = iso();
  }
}

// -------------------------------------------------------- content & search

const learn: LearnService = {
  listDomains: () => delay(clone(DEMO_LEARN_DOMAINS), 150),
  getDomain: async (slug) =>
    delay(DEMO_LEARN_DOMAINS.find((domain) => domain.slug === slug) ?? null, 120),
};

const discover: DiscoverService = {
  listEntries: () => delay(clone(DEMO_DISCOVER), 150),
};

const recents: RecentsService = {
  listRecents: () =>
    delay(
      [...state.recents].sort(
        (a, b) => Date.parse(b.lastAccessedAt) - Date.parse(a.lastAccessedAt),
      ),
      150,
    ),
};

const search: SearchService = {
  search: async (query): Promise<SearchResult[]> => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    await delay(null, 180);
    return buildSearchCorpus()
      .filter(
        (entry) =>
          entry.title.toLowerCase().includes(trimmed) ||
          entry.subtitle?.toLowerCase().includes(trimmed),
      )
      .slice(0, 12)
      .map((entry, index) => ({
        id: `${entry.category}-${index}`,
        category: entry.category,
        title: entry.title,
        subtitle: entry.subtitle,
        href: entry.href,
      }));
  },
};

export const mockServices: CurvinServices = {
  auth,
  projects,
  github,
  conversations,
  agent,
  learn,
  discover,
  recents,
  search,
};
