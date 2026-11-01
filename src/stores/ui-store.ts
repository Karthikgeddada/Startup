"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Interface preferences only — never product data. Persisted to localStorage
 * via `skipHydration`: the app shell rehydrates after mount so server and
 * client render the same initial markup (no hydration mismatch).
 */
export type NewProjectMode = "blank" | "github" | "template" | "ai";

interface UIState {
  sidebarCollapsed: boolean;
  agentPanelOpen: boolean;
  mobileNavOpen: boolean;
  commandMenuOpen: boolean;
  recentSearches: string[];
  /** Ephemeral dialog state — never persisted. */
  newProjectOpen: boolean;
  newProjectMode: NewProjectMode;
  newProjectTemplateId: string | null;
  /** Prompt-first creation: text typed on the Home hero, prefilled into the AI mode. */
  newProjectPrompt: string | null;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleAgentPanel: () => void;
  setAgentPanelOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setCommandMenuOpen: (open: boolean) => void;
  addRecentSearch: (query: string) => void;
  openNewProject: (mode?: NewProjectMode, templateId?: string | null, prompt?: string | null) => void;
  closeNewProject: () => void;
}

/** Recent-search ring buffer length. */
const MAX_RECENT_SEARCHES = 8;

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      agentPanelOpen: false,
      mobileNavOpen: false,
      commandMenuOpen: false,
      recentSearches: [],
      newProjectOpen: false,
      newProjectMode: "blank",
      newProjectTemplateId: null,
      newProjectPrompt: null,

      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleAgentPanel: () => set({ agentPanelOpen: !get().agentPanelOpen }),
      setAgentPanelOpen: (open) => set({ agentPanelOpen: open }),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      setCommandMenuOpen: (open) => set({ commandMenuOpen: open }),
      addRecentSearch: (query) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        set({
          recentSearches: [
            trimmed,
            ...get().recentSearches.filter((item) => item !== trimmed),
          ].slice(0, MAX_RECENT_SEARCHES),
        });
      },

      openNewProject: (mode = "blank", templateId = null, prompt = null) =>
        set({
          newProjectOpen: true,
          newProjectMode: mode,
          newProjectTemplateId: templateId,
          newProjectPrompt: prompt,
        }),
      closeNewProject: () =>
        set({ newProjectOpen: false, newProjectTemplateId: null, newProjectPrompt: null }),
    }),
    {
      name: "curvin-ui",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        agentPanelOpen: state.agentPanelOpen,
        recentSearches: state.recentSearches,
      }),
    },
  ),
);
