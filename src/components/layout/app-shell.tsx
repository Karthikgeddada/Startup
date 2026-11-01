"use client";

import { useEffect } from "react";

import { AgentPanel } from "@/components/agent/agent-panel";
import { NewProjectDialog } from "@/features/home/new-project-dialog";
import { AgentMark } from "@/components/brand/agent-mark";
import { CommandMenu } from "@/components/layout/command-menu";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { useUIStore } from "@/stores/ui-store";

/**
 * The three-part CURVIN shell: navigation sidebar · central workspace ·
 * persistent agent panel. The central column adapts as either side opens,
 * collapses, or (on small screens) becomes an overlay drawer.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  // Rehydrate persisted interface preferences after mount — server and client
  // render identical defaults first, so there is no hydration mismatch.
  useEffect(() => {
    void useUIStore.persist.rehydrate();
  }, []);

  // Global keyboard shortcuts (documented in APP_SHORTCUTS):
  // ⌘K/Ctrl+K command menu · [ sidebar · ] agent panel (not while typing).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const store = useUIStore.getState();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        store.setCommandMenuOpen(!store.commandMenuOpen);
        return;
      }
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      if (event.key === "[") {
        event.preventDefault();
        store.toggleSidebar();
      } else if (event.key === "]") {
        event.preventDefault();
        store.toggleAgentPanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:text-accent-foreground"
      >
        Skip to main content
      </a>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main
          id="main-content"
          className="min-h-0 flex-1 overflow-y-auto scroll-smooth"
        >
          {children}
        </main>
      </div>

      <AgentPanel />
      <CommandMenu />
      <NewProjectDialog />

      {/* Persistent compact agent entry point, visible whenever the panel is closed. */}
      <AgentPanelFab />
    </div>
  );
}

/** Floating agent entry point bottom-right of the workspace — the agent is one click away on every screen. */
function AgentPanelFab() {
  const open = useUIStore((state) => state.agentPanelOpen);
  const setAgentPanelOpen = useUIStore((state) => state.setAgentPanelOpen);
  if (open) return null;
  return (
    <button
      type="button"
      aria-label="Open Curvin agent"
      onClick={() => setAgentPanelOpen(true)}
      className="fixed bottom-5 right-5 z-40 hidden h-12 w-12 items-center justify-center rounded-pill bg-accent text-accent-foreground shadow-overlay transition-transform duration-150 ease-swift hover:scale-105 hover:bg-accent-hover md:flex"
    >
      <AgentMark size={22} className="text-accent-foreground" active />
    </button>
  );
}
