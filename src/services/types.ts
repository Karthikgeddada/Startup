import type {
  ActivityItem,
  AgentTurn,
  Conversation,
  DiscoverEntry,
  GitHubRepository,
  LearningDomain,
  Project,
  ProjectTemplate,
  RecentItem,
  RepoFile,
  SearchResult,
  UserProfile,
} from "@/types/domain";

/**
 * Typed service contracts. The UI depends on these interfaces only — never on
 * an adapter directly. Swapping the mock adapters for HTTP adapters (or any
 * future transport) requires zero UI changes.
 */

export interface CreateProjectInput {
  name: string;
  description: string;
  mode: "blank" | "github" | "template" | "ai";
  /** Required when mode is "github". */
  githubRepoId?: string;
  /** Required when mode is "template". */
  templateId?: string;
  /** The originating prompt when mode is "ai". */
  prompt?: string;
}

export interface AgentTurnInput {
  conversationId: string;
  prompt: string;
  projectId: string | null;
}

export interface AuthService {
  getCurrentUser(): Promise<UserProfile>;
}

export interface ProjectsService {
  listProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | null>;
  createProject(input: CreateProjectInput): Promise<Project>;
  listActivity(limit: number): Promise<ActivityItem[]>;
  listTemplates(): Promise<ProjectTemplate[]>;
  listRepoFiles(projectId: string): Promise<RepoFile[]>;
}

export interface GitHubService {
  listRepositories(): Promise<GitHubRepository[]>;
}

export interface ConversationsService {
  listConversations(): Promise<Conversation[]>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  createConversation(input: {
    title: string;
    projectId: string | null;
  }): Promise<Conversation>;
}

export interface AgentService {
  /**
   * Stream one agent turn as progressive snapshots via `onUpdate`.
   * Resolve with the final turn (status completed/failed/cancelled).
   * Must honour `signal` and settle — never leave a dangling run.
   */
  runTurn(
    input: AgentTurnInput,
    onUpdate: (turn: AgentTurn) => void,
    signal: AbortSignal,
  ): Promise<AgentTurn>;
  /** Resolve a pending approval block; returns the updated turn. */
  resolveApproval(
    conversationId: string,
    turnId: string,
    blockId: string,
    approved: boolean,
  ): Promise<AgentTurn>;
}

export interface LearnService {
  listDomains(): Promise<LearningDomain[]>;
  getDomain(slug: string): Promise<LearningDomain | null>;
}

export interface DiscoverService {
  listEntries(): Promise<DiscoverEntry[]>;
}

export interface RecentsService {
  listRecents(): Promise<RecentItem[]>;
}

export interface SearchService {
  search(query: string): Promise<SearchResult[]>;
}

export interface CurvinServices {
  auth: AuthService;
  projects: ProjectsService;
  github: GitHubService;
  conversations: ConversationsService;
  agent: AgentService;
  learn: LearnService;
  discover: DiscoverService;
  recents: RecentsService;
  search: SearchService;
}
