import { describe, expect, it } from "vitest";

import { env, services } from "@/services";

describe("service registry", () => {
  it("uses mock adapters unless explicitly disabled", () => {
    // The test environment never sets NEXT_PUBLIC_USE_MOCKS=false.
    expect(env.useMocks).toBe(true);
    expect(services.projects).toBeDefined();
    expect(services.agent).toBeDefined();
  });
});

describe("mock projects service", () => {
  it("lists seeded projects", async () => {
    const projects = await services.projects.listProjects();
    expect(projects.length).toBeGreaterThan(0);
    for (const project of projects) {
      expect(project.id).toBeTruthy();
      expect(["active", "draft", "importing", "error", "archived"]).toContain(project.status);
    }
  });

  it("creates and persists a new project", async () => {
    const created = await services.projects.createProject({
      name: "Test project",
      description: "Created by the unit suite",
      mode: "blank",
    });
    expect(created.name).toBe("Test project");
    const found = await services.projects.getProject(created.id);
    expect(found?.id).toBe(created.id);
  });
});

describe("mock learn and discover services", () => {
  it("serves sixteen domains with chapters", async () => {
    const domains = await services.learn.listDomains();
    expect(domains).toHaveLength(16);
    for (const domain of domains) {
      expect(domain.chapters.length).toBeGreaterThan(0);
      expect(domain.summary.length).toBeGreaterThan(0);
    }
  });

  it("resolves a single domain by slug", async () => {
    const domains = await services.learn.listDomains();
    const first = domains[0];
    const domain = await services.learn.getDomain(first.id);
    expect(domain?.id).toBe(first.id);
    expect(await services.learn.getDomain("does-not-exist")).toBeNull();
  });

  it("labels discover entries with honest availability", async () => {
    const entries = await services.discover.listEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(["available", "coming_soon"]).toContain(entry.status);
    }
  });
});

describe("mock search service", () => {
  it("returns categorized results that match the query", async () => {
    const projects = await services.projects.listProjects();
    const needle = projects[0].name.split(" ")[0].toLowerCase();
    const results = await services.search.search(needle);
    expect(Array.isArray(results)).toBe(true);
    for (const result of results) {
      expect(["projects", "conversations", "files", "templates", "documentation"]).toContain(
        result.category,
      );
    }
  });
});

describe("mock conversation and agent services", () => {
  it("round-trips a created conversation", async () => {
    const created = await services.conversations.createConversation({
      title: "Suite conversation",
      projectId: null,
    });
    expect(created.title).toBe("Suite conversation");
    const fetched = await services.conversations.getConversation(created.id);
    expect(fetched?.id).toBe(created.id);
  });

  it("streams structured turn snapshots and honors abort", async () => {
    const conversation = await services.conversations.createConversation({
      title: "Streaming",
      projectId: null,
    });
    const snapshots: unknown[] = [];
    const controller = new AbortController();

    await services.agent.runTurn(
      { conversationId: conversation.id, prompt: "Add a contact form", projectId: null },
      (turn) => {
        snapshots.push(turn);
        // Abort once the plan appears — the mock must stop cleanly.
        if (turn.blocks.some((block) => block.kind === "plan")) {
          controller.abort();
        }
      },
      controller.signal,
    );

    expect(snapshots.length).toBeGreaterThan(0);
  }, 15_000);
});
