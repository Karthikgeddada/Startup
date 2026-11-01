"use client";

import { Menu, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { AgentMark } from "@/components/brand/agent-mark";
import { IconButton } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useUIStore } from "@/stores/ui-store";

/** Application header: mobile menu, global search trigger, theme, agent. */
export function Header() {
  const setMobileNavOpen = useUIStore((state) => state.setMobileNavOpen);
  const setCommandMenuOpen = useUIStore((state) => state.setCommandMenuOpen);
  const agentPanelOpen = useUIStore((state) => state.agentPanelOpen);
  const toggleAgentPanel = useUIStore((state) => state.toggleAgentPanel);

  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-border surface-frost px-3.5 md:px-5">
      <IconButton
        label="Open navigation menu"
        className="lg:hidden"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </IconButton>

      <button
        type="button"
        onClick={() => setCommandMenuOpen(true)}
        aria-label="Search CURVIN — projects, docs, templates (Command K)"
        className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-border bg-background px-3 text-left text-[13px] text-muted-foreground transition-colors duration-150 ease-swift hover:border-border-strong hover:text-foreground"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Search projects, docs, templates…</span>
        <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
      </button>

      <span className="flex-1" />

      {mounted ? (
        <IconButton
          label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
        </IconButton>
      ) : (
        <span className="h-9 w-9" aria-hidden />
      )}

      <button
        type="button"
        onClick={toggleAgentPanel}
        aria-pressed={agentPanelOpen}
        aria-label={agentPanelOpen ? "Close Curvin agent panel" : "Open Curvin agent panel"}
        title={agentPanelOpen ? "Close Curvin agent panel" : "Open Curvin agent panel"}
        className="flex h-9 items-center gap-2 rounded-pill px-3 text-[13px] font-medium transition-colors duration-150 ease-swift hover:bg-muted"
      >
        <AgentMark size={20} active={agentPanelOpen} />
        <span className="hidden md:inline">Agent</span>
      </button>
    </header>
  );
}
