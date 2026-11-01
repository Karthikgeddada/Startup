"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { services } from "@/services";
import { qk } from "@/services/query-keys";
import type { CreateProjectInput } from "@/services/types";

export function useCurrentUser() {
  return useQuery({ queryKey: qk.user, queryFn: () => services.auth.getCurrentUser() });
}

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: () => services.projects.listProjects() });
}

export function useProject(projectId: string | null) {
  return useQuery({
    queryKey: qk.project(projectId ?? ""),
    queryFn: () => services.projects.getProject(projectId as string),
    enabled: projectId !== null,
  });
}

export function useActivity(limit = 8) {
  return useQuery({ queryKey: qk.activity(limit), queryFn: () => services.projects.listActivity(limit) });
}

export function useTemplates() {
  return useQuery({ queryKey: qk.templates, queryFn: () => services.projects.listTemplates() });
}

export function useRepoFiles(projectId: string | null) {
  return useQuery({
    queryKey: qk.repoFiles(projectId ?? ""),
    queryFn: () => services.projects.listRepoFiles(projectId as string),
    enabled: projectId !== null,
  });
}

export function useGitHubRepositories() {
  return useQuery({ queryKey: qk.githubRepos, queryFn: () => services.github.listRepositories() });
}

export function useConversations() {
  return useQuery({
    queryKey: qk.conversations,
    queryFn: () => services.conversations.listConversations(),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => services.projects.createProject(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.projects });
      void queryClient.invalidateQueries({ queryKey: qk.recents });
    },
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; projectId: string | null }) =>
      services.conversations.createConversation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.conversations });
    },
  });
}

export function useLearnDomains() {
  return useQuery({ queryKey: qk.learnDomains, queryFn: () => services.learn.listDomains() });
}

export function useDiscoverEntries() {
  return useQuery({ queryKey: qk.discover, queryFn: () => services.discover.listEntries() });
}

export function useRecents() {
  return useQuery({ queryKey: qk.recents, queryFn: () => services.recents.listRecents() });
}
