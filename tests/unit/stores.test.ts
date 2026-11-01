import { beforeEach, describe, expect, it } from "vitest";

import { useAgentStore } from "@/stores/agent-store";
import { useUIStore } from "@/stores/ui-store";
import type { AgentTurn, UserMessage } from "@/types/domain";

beforeEach(() => {
  useUIStore.setState({
    sidebarCollapsed: false,
    agentPanelOpen: false,
    mobileNavOpen: false,
    commandMenuOpen: false,
    recentSearches: [],
    newProjectOpen: false,
    newProjectMode: "blank",
    newProjectTemplateId: null,
    newProjectPrompt: null,
  });
  useAgentStore.setState({
    activeConversationId: null,
    contextProjectId: null,
    messages: {},
  });
  localStorage.clear();
});

describe("ui store", () => {
  it("toggles sidebar and agent panel independently", () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    useUIStore.getState().toggleAgentPanel();
    expect(useUIStore.getState().agentPanelOpen).toBe(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });

  it("deduplicates and caps recent searches", () => {
    const store = useUIStore.getState();
    for (const query of ["a", "b", "c", "b", "a"]) store.addRecentSearch(query);
    expect(useUIStore.getState().recentSearches).toEqual(["a", "b", "c"]);
  });

  it("ignores blank recent searches", () => {
    useUIStore.getState().addRecentSearch("   ");
    expect(useUIStore.getState().recentSearches).toEqual([]);
  });

  it("opens the new-project flow with mode, template, and prompt", () => {
    useUIStore.getState().openNewProject("template", "tpl-api", null);
    const state = useUIStore.getState();
    expect(state.newProjectOpen).toBe(true);
    expect(state.newProjectMode).toBe("template");
    expect(state.newProjectTemplateId).toBe("tpl-api");
    useUIStore.getState().closeNewProject();
    expect(useUIStore.getState().newProjectOpen).toBe(false);
    expect(useUIStore.getState().newProjectTemplateId).toBeNull();
  });
});

describe("agent store", () => {
  const userMessage: UserMessage = {
    id: "m1",
    role: "user",
    content: "Build a landing page",
    attachments: [],
    createdAt: "2026-11-01T00:00:00.000Z",
  };

  const turn: AgentTurn = {
    id: "t1",
    role: "agent",
    status: "running",
    blocks: [{ id: "b1", kind: "text", content: "Planning…" }],
    createdAt: "2026-11-01T00:00:01.000Z",
  };

  it("appends messages per conversation without cross-talk", () => {
    const store = useAgentStore.getState();
    store.hydrateMessages("c1", [userMessage]);
    store.appendMessage("c1", turn);
    useAgentStore.getState().appendMessage("c2", userMessage);
    expect(useAgentStore.getState().messages.c1).toHaveLength(2);
    expect(useAgentStore.getState().messages.c2).toHaveLength(1);
  });

  it("replaces a streaming turn in place", () => {
    useAgentStore.getState().hydrateMessages("c1", [userMessage, turn]);
    const updated: AgentTurn = {
      ...turn,
      status: "completed",
      blocks: [...turn.blocks, { id: "b2", kind: "text", content: "Done." }],
    };
    useAgentStore.getState().updateTurn("c1", updated);
    const messages = useAgentStore.getState().messages.c1;
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual(updated);
  });

  it("flips turn status for stop and cancel", () => {
    useAgentStore.getState().hydrateMessages("c1", [turn]);
    useAgentStore.getState().setTurnStatus("c1", "t1", "cancelled");
    const cancelled = useAgentStore.getState().messages.c1[0] as AgentTurn;
    expect(cancelled.status).toBe("cancelled");
  });

  it("tracks conversation and project context", () => {
    useAgentStore.getState().setActiveConversation("c9");
    useAgentStore.getState().setContextProject("p2");
    expect(useAgentStore.getState().activeConversationId).toBe("c9");
    expect(useAgentStore.getState().contextProjectId).toBe("p2");
  });
});
