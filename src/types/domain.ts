/**
 * CURVIN domain model — the single vocabulary shared by the UI, the typed
 * service contracts, and future backend APIs. UI never invents its own shapes.
 */

// ---------------------------------------------------------------- Identity

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

// ---------------------------------------------------------------- Projects

export type ProjectStatus = "active" | "draft" | "importing" | "error" | "archived";

export interface RepositoryRef {
  id: string;
  provider: "github";
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  repository: RepositoryRef | null;
  /** Branch the workspace is working on; null until a repo is connected. */
  activeBranch: string | null;
  techStack: string[];
  /** Short summary of what the agent is currently doing, if anything. */
  currentTask: string | null;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  stack: string[];
}

export interface ActivityItem {
  id: string;
  projectId: string;
  description: string;
  createdAt: string;
}

// ---------------------------------------------------------------- GitHub

export interface GitHubRepository {
  id: string;
  owner: string;
  name: string;
  description: string;
  primaryLanguage: string | null;
  stars: number;
  isPrivate: boolean;
  updatedAt: string;
}

export interface RepoFile {
  path: string;
  type: "file" | "dir";
  sizeBytes: number | null;
}

// ---------------------------------------------------------------- Agent

export interface Attachment {
  id: string;
  name: string;
  kind: "file" | "reference";
  sizeBytes: number | null;
}

export interface UserMessage {
  id: string;
  role: "user";
  content: string;
  attachments: Attachment[];
  createdAt: string;
}

export type PlanStepStatus = "pending" | "in_progress" | "done" | "skipped";

export interface PlanStep {
  id: string;
  title: string;
  status: PlanStepStatus;
}

export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

export type AgentTurnStatus = "running" | "completed" | "failed" | "cancelled";

export type AgentBlock =
  | { kind: "text"; id: string; content: string }
  | { kind: "plan"; id: string; title: string; steps: PlanStep[] }
  | {
      kind: "tool";
      id: string;
      name: string;
      status: "pending" | "running" | "succeeded" | "failed";
      summary: string;
      log: string[];
    }
  | {
      kind: "diff";
      id: string;
      filePath: string;
      additions: number;
      deletions: number;
      lines: DiffLine[];
    }
  | {
      kind: "approval";
      id: string;
      title: string;
      description: string;
      status: "pending" | "approved" | "rejected";
    }
  | { kind: "error"; id: string; title: string; message: string; retryable: boolean };

export interface AgentTurn {
  id: string;
  role: "agent";
  status: AgentTurnStatus;
  blocks: AgentBlock[];
  createdAt: string;
}

export type AgentMessage = UserMessage | AgentTurn;

export interface Conversation {
  id: string;
  title: string;
  projectId: string | null;
  /** Repository id when the conversation is scoped to a repo. */
  repositoryId: string | null;
  messages: AgentMessage[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------- Learn

export interface LearningChapter {
  id: string;
  slug: string;
  title: string;
  minutes: number;
  summary: string;
  code?: { language: string; snippet: string };
}

export interface LearningDomain {
  id: string;
  slug: string;
  title: string;
  summary: string;
  chapters: LearningChapter[];
  related: string[];
}

// ---------------------------------------------------------------- Discover

export type DiscoverEntryStatus = "available" | "coming_soon";

export interface DiscoverEntry {
  id: string;
  kind: "template" | "integration" | "capability" | "example";
  category: string;
  title: string;
  description: string;
  status: DiscoverEntryStatus;
  /** Defined only for available entries. */
  action: { label: string; href: string } | null;
}

// ---------------------------------------------------------------- Recents

export type RecentItemType = "project" | "conversation" | "file" | "session";

export interface RecentItem {
  id: string;
  type: RecentItemType;
  title: string;
  subtitle: string | null;
  projectId: string | null;
  href: string;
  lastAccessedAt: string;
}

// ---------------------------------------------------------------- Search

export type SearchCategory =
  | "projects"
  | "conversations"
  | "files"
  | "documentation"
  | "templates";

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string | null;
  href: string;
}
