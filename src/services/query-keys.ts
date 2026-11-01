/** Central TanStack Query key factory — single source for invalidation. */
export const qk = {
  user: ["user"] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  activity: (limit: number) => ["activity", limit] as const,
  templates: ["templates"] as const,
  repoFiles: (projectId: string) => ["projects", projectId, "files"] as const,
  githubRepos: ["github", "repositories"] as const,
  conversations: ["conversations"] as const,
  conversation: (id: string) => ["conversations", id] as const,
  learnDomains: ["learn", "domains"] as const,
  discover: ["discover"] as const,
  recents: ["recents"] as const,
} as const;
