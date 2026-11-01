"use client";

import { create } from "zustand";

import type { AgentMessage, AgentTurn } from "@/types/domain";

/**
 * Live agent session state — in-memory by design.
 *
 * The conversations service remains the source of truth for durable history
 * (backend persistence once connected). This store holds the conversation the
 * panel is actively rendering so that closing the panel, navigating between
 * the five sections, or switching conversations never loses an in-flight turn.
 * It is deliberately NOT persisted to localStorage: fabricated offline
 * persistence would misrepresent itself as real backend history.
 */
interface AgentState {
  activeConversationId: string | null;
  /** Project context for the next prompt; null means account-level. */
  contextProjectId: string | null;
  /** Live message arrays by conversation id (hydrated from the service). */
  messages: Record<string, AgentMessage[]>;

  setActiveConversation: (id: string | null) => void;
  setContextProject: (projectId: string | null) => void;
  hydrateMessages: (conversationId: string, messages: AgentMessage[]) => void;
  appendMessage: (conversationId: string, message: AgentMessage) => void;
  /** Replace an agent turn in place — used while a turn is streaming blocks. */
  updateTurn: (conversationId: string, turn: AgentTurn) => void;
  /** Flip the status of a running turn (stop/cancel/fail). */
  setTurnStatus: (conversationId: string, turnId: string, status: AgentTurn["status"]) => void;
}

function replaceTurn(messages: AgentMessage[], turn: AgentTurn): AgentMessage[] {
  return messages.map((message) => (message.id === turn.id ? turn : message));
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  activeConversationId: null,
  contextProjectId: null,
  messages: {},

  setActiveConversation: (id) => set({ activeConversationId: id }),
  setContextProject: (projectId) => set({ contextProjectId: projectId }),

  hydrateMessages: (conversationId, messages) =>
    set({ messages: { ...get().messages, [conversationId]: messages } }),

  appendMessage: (conversationId, message) => {
    const existing = get().messages[conversationId] ?? [];
    set({ messages: { ...get().messages, [conversationId]: [...existing, message] } });
  },

  updateTurn: (conversationId, turn) => {
    const existing = get().messages[conversationId] ?? [];
    set({ messages: { ...get().messages, [conversationId]: replaceTurn(existing, turn) } });
  },

  setTurnStatus: (conversationId, turnId, status) => {
    const existing = get().messages[conversationId] ?? [];
    const next = existing.map((message) =>
      message.id === turnId && message.role === "agent" ? { ...message, status } : message,
    );
    set({ messages: { ...get().messages, [conversationId]: next } });
  },
}));
