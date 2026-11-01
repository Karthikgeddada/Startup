import { apiFetch } from "@/services/client";
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

/**
 * HTTP adapters for the future CURVIN backend.
 *
 * These map 1:1 onto the REST surface the backend is expected to expose and
 * the typed contracts in services/types.ts. Until the backend exists, the
 * service registry keeps the app on mock adapters; switching is a single
 * environment variable (NEXT_PUBLIC_USE_MOCKS=false).
 */

const auth: AuthService = {
  getCurrentUser: () => apiFetch("/api/v1/me"),
};

const projects: ProjectsService = {
  listProjects: () => apiFetch("/api/v1/projects"),
  getProject: (id) => apiFetch(`/api/v1/projects/${id}`),
  createProject: (input) =>
    apiFetch("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  listActivity: (limit) => apiFetch(`/api/v1/activity?limit=${limit}`),
  listTemplates: () => apiFetch("/api/v1/templates"),
  listRepoFiles: (projectId) => apiFetch(`/api/v1/projects/${projectId}/files`),
};

const github: GitHubService = {
  listRepositories: () => apiFetch("/api/v1/github/repositories"),
};

const conversations: ConversationsService = {
  listConversations: () => apiFetch("/api/v1/conversations"),
  getConversation: (id) => apiFetch(`/api/v1/conversations/${id}`),
  createConversation: (input) =>
    apiFetch("/api/v1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
};

/** The live agent runs on the backend execution service, not on Vercel. */
const agent: AgentService = {
  /**
   * Streaming turn transport lands together with the real execution service
   * (SSE or chunked JSON). The frontend contract in services/types.ts is the
   * source of truth; until the backend exists this adapter refuses loudly
   * rather than pretending to stream.
   */
  runTurn: () =>
    Promise.reject(
      new Error(
        "Agent turns require the CURVIN backend. Set NEXT_PUBLIC_USE_MOCKS=true until it is connected.",
      ),
    ),
  resolveApproval: (conversationId, turnId, blockId, approved) =>
    apiFetch(`/api/v1/conversations/${conversationId}/turns/${turnId}/approvals/${blockId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    }),
};

const learn: LearnService = {
  listDomains: () => apiFetch("/api/v1/learn/domains"),
  getDomain: (slug) => apiFetch(`/api/v1/learn/domains/${slug}`),
};

const discover: DiscoverService = {
  listEntries: () => apiFetch("/api/v1/discover"),
};

const recents: RecentsService = {
  listRecents: () => apiFetch("/api/v1/recents"),
};

const search: SearchService = {
  search: (query) =>
    apiFetch(`/api/v1/search?q=${encodeURIComponent(query)}`),
};

export const httpServices: CurvinServices = {
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
