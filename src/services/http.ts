import { apiFetch } from "@/services/client";
import { httpAgent } from "@/services/agent-stream";
import type {
  AuthService,
  ConversationsService,
  CurvinServices,
  GitHubService,
  ProjectsService,
  RecentsService,
  SearchService,
} from "@/services/types";

/**
 * HTTP adapters for the CURVIN backend (live mode, Phase 7).
 *
 * These map 1:1 onto the backend REST surface. Two honest exclusions:
 * - learn/discover stay on the frontend's static content library (the
 *   registry composes static adapters for them in live mode) until a content
 *   backend exists.
 * - The agent service is the SSE consumer in agent-stream.ts.
 *
 * The dev identity is the backend's placeholder user (X-User-Id header) until
 * real authentication lands.
 */

/** Dev identity placeholder — matches the backend default user until real auth. */
const USER_ID = "user_dev";

const identity = () => ({ "X-User-Id": USER_ID });
const jsonIdentity = () => ({
  "Content-Type": "application/json",
  "X-User-Id": USER_ID,
});

const auth: AuthService = {
  getCurrentUser: () => apiFetch("/api/v1/me", { headers: identity() }),
};

const projects: ProjectsService = {
  listProjects: () => apiFetch("/api/v1/projects", { headers: identity() }),
  getProject: (id) => apiFetch(`/api/v1/projects/${id}`, { headers: identity() }),
  createProject: (input) =>
    apiFetch("/api/v1/projects", {
      method: "POST",
      headers: jsonIdentity(),
      body: JSON.stringify(input),
    }),
  listActivity: (limit) =>
    apiFetch(`/api/v1/activity?limit=${limit}`, { headers: identity() }),
  listTemplates: () => apiFetch("/api/v1/templates", { headers: identity() }),
  listRepoFiles: (projectId) =>
    apiFetch(`/api/v1/projects/${projectId}/files`, { headers: identity() }),
};

const github: GitHubService = {
  /** Empty until GITHUB_TOKEN is configured server-side — the UI shows an
   * honest empty state rather than fabricated repositories. */
  listRepositories: () =>
    apiFetch("/api/v1/github/repositories", { headers: identity() }),
};

const conversations: ConversationsService = {
  listConversations: () =>
    apiFetch("/api/v1/conversations", { headers: identity() }),
  getConversation: (id) =>
    apiFetch(`/api/v1/conversations/${id}`, { headers: identity() }),
  createConversation: (input) =>
    apiFetch("/api/v1/conversations", {
      method: "POST",
      headers: jsonIdentity(),
      body: JSON.stringify(input),
    }),
};

/** The agent service (SSE run-event consumer) lives in agent-stream.ts. */

const recents: RecentsService = {
  listRecents: () => apiFetch("/api/v1/recents", { headers: identity() }),
};

const search: SearchService = {
  search: (query) =>
    apiFetch(`/api/v1/search?q=${encodeURIComponent(query)}`, {
      headers: identity(),
    }),
};

/** Live-mode services. learn/discover stay static-content adapters and are
 * composed in by the registry — the backend has no content endpoints yet. */
export type HttpServices = Omit<CurvinServices, "learn" | "discover">;

export const httpServices: HttpServices = {
  auth,
  projects,
  github,
  conversations,
  agent: httpAgent,
  recents,
  search,
};
