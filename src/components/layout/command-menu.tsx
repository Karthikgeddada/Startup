"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Clock, Command, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useUIStore } from "@/stores/ui-store";
import type { SearchResult } from "@/types/domain";

interface CommandItem {
  id: string;
  title: string;
  subtitle: string | null;
  group: string;
  icon: "action" | "result" | "recent";
  /** Navigation target, or an in-app action to run. */
  href?: string;
  run?: () => void;
}

/**
 * Global search + command menu (⌘K / Ctrl K). Searches projects, files,
 * conversations, templates, and documentation through the service layer, and
 * exposes the app's key actions. Full keyboard navigation.
 */
export function CommandMenu() {
  const open = useUIStore((state) => state.commandMenuOpen);
  const setCommandMenuOpen = useUIStore((state) => state.setCommandMenuOpen);
  const recentSearches = useUIStore((state) => state.recentSearches);
  const addRecentSearch = useUIStore((state) => state.addRecentSearch);

  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open; focus the input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelected(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Debounced search with request de-duplication.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await services.search.search(trimmed);
      setResults(found);
      setSearching(false);
      setSelected(0);
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const actions: CommandItem[] = useMemo(
    () => [
      { id: "act-home", title: "Go to Home", subtitle: null, group: "Actions", icon: "action", href: "/home" },
      { id: "act-learn", title: "Go to Learn", subtitle: null, group: "Actions", icon: "action", href: "/learn" },
      { id: "act-workspace", title: "Go to Workspace", subtitle: null, group: "Actions", icon: "action", href: "/workspace" },
      { id: "act-recents", title: "Go to Recents", subtitle: null, group: "Actions", icon: "action", href: "/recents" },
      { id: "act-discover", title: "Go to Discover", subtitle: null, group: "Actions", icon: "action", href: "/discover" },
      {
        id: "act-new-project",
        title: "Create a new project",
        subtitle: "Blank, template, GitHub import, or prompt-first",
        group: "Actions",
        icon: "action",
        run: () => useUIStore.getState().openNewProject(),
      },
      {
        id: "act-agent",
        title: "Open the Curvin agent",
        subtitle: "Plan, change, and review code with the agent",
        group: "Actions",
        icon: "action",
        run: () => useUIStore.getState().setAgentPanelOpen(true),
      },
    ],
    [],
  );

  const items: CommandItem[] = useMemo(() => {
    const trimmed = query.trim();
    const matchedActions = trimmed
      ? actions.filter((action) => action.title.toLowerCase().includes(trimmed.toLowerCase()))
      : actions;

    const resultItems: CommandItem[] = results.map((result) => ({
      id: `${result.category}-${result.id}`,
      title: result.title,
      subtitle: result.subtitle,
      group: categoryLabel(result.category),
      icon: "result" as const,
      href: result.href,
    }));

    if (!trimmed && recentSearches.length > 0) {
      const recentItems: CommandItem[] = recentSearches.slice(0, 5).map((entry, index) => ({
        id: `recent-${index}`,
        title: entry,
        subtitle: null,
        group: "Recent searches",
        icon: "recent" as const,
        run: () => setQuery(entry),
      }));
      return [...matchedActions, ...recentItems];
    }

    return [...matchedActions, ...resultItems];
  }, [query, results, actions, recentSearches]);

  const close = () => setCommandMenuOpen(false);

  const selectItem = (item: CommandItem) => {
    if (query.trim()) addRecentSearch(query.trim());
    close();
    if (item.href) router.push(item.href);
    else item.run?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((current) => Math.min(current + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[selected];
      if (item) selectItem(item);
    }
  };

  if (!open || typeof document === "undefined") return null;

  let lastGroup = "";

  return createPortal(
    <div className="fixed inset-0 z-[95]">
      <div aria-hidden onClick={close} className="absolute inset-0 bg-black/40 animate-fade-in" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and command menu"
        className="absolute left-1/2 top-[10vh] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-card border border-border bg-popover shadow-overlay animate-fade-in"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-menu-list"
            aria-label="Search CURVIN — projects, docs, templates, commands"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, docs, templates, or type a command…"
            className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle-foreground"
          />
          {searching ? <Spinner size={15} /> : <Kbd>Esc</Kbd>}
        </div>

        <div id="command-menu-list" role="listbox" aria-label="Results" className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              {query.trim() ? `No results for “${query.trim()}”` : "Type to search, or pick an action"}
            </p>
          ) : (
            items.map((item, index) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              const Icon =
                item.icon === "recent" ? Clock : item.icon === "result" ? ArrowRight : Command;
              return (
                <div key={item.id}>
                  {showGroup ? (
                    <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-subtle-foreground">
                      {item.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === selected}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => selectItem(item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-100",
                      index === selected ? "bg-muted" : "hover:bg-muted/60",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">{item.title}</span>
                      {item.subtitle ? (
                        <span className="block truncate text-[11.5px] text-muted-foreground">{item.subtitle}</span>
                      ) : null}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> open</span>
          <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd> close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function categoryLabel(category: SearchResult["category"]): string {
  switch (category) {
    case "projects":
      return "Projects";
    case "conversations":
      return "Conversations";
    case "files":
      return "Files";
    case "templates":
      return "Templates";
    case "documentation":
      return "Documentation";
  }
}
