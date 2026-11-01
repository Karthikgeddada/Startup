"use client";

import { Bot, FileCode2, History, Layers, MessageSquare, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState, SkeletonCard } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useRecents } from "@/hooks/use-services";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useUIStore } from "@/stores/ui-store";
import type { RecentItem } from "@/types/domain";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "project", label: "Projects" },
  { id: "conversation", label: "Conversations" },
  { id: "file", label: "Files" },
  { id: "session", label: "Sessions" },
] as const;

const SORTS = [
  { id: "recent", label: "Most recent" },
  { id: "oldest", label: "Oldest first" },
  { id: "name", label: "By name" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];
type SortId = (typeof SORTS)[number]["id"];

/**
 * Recents — the chronological memory of work: projects, conversations,
 * files, sessions. Searchable, filterable by type, sortable. Everything
 * stays one click away.
 */
export function RecentsView() {
  const recentsQuery = useRecents();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("recent");

  const setAgentPanelOpen = useUIStore((state) => state.setAgentPanelOpen);
  const setActiveConversation = useAgentStore((state) => state.setActiveConversation);

  const entries = useMemo(() => {
    const data = recentsQuery.data ?? [];
    const needle = query.trim().toLowerCase();
    const filtered = data.filter((entry) => {
      const matchesType = filter === "all" || entry.type === filter;
      const matchesText =
        !needle ||
        entry.title.toLowerCase().includes(needle) ||
        entry.subtitle?.toLowerCase().includes(needle);
      return matchesType && matchesText;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "name") return a.title.localeCompare(b.title);
      const left = new Date(a.lastAccessedAt).getTime();
      const right = new Date(b.lastAccessedAt).getTime();
      return sort === "recent" ? right - left : left - right;
    });
    return sorted;
  }, [recentsQuery.data, query, filter, sort]);

  const openEntry = (entry: RecentItem) => {
    if (entry.type === "conversation") {
      setActiveConversation(entry.id);
      setAgentPanelOpen(true);
      return;
    }
    if (entry.href) {
      window.location.assign(entry.href);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pb-24 pt-10 md:px-8">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">Recents</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
        Everything you touched, newest first — search it, filter it, jump back in.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="max-w-xs flex-1">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your recent work…"
            icon={<Search className="h-4 w-4" aria-hidden />}
            aria-label="Search recent items"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by type">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-pill px-3 py-1.5 text-[12px] font-medium transition-colors duration-150 ease-swift",
                filter === item.id
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortId)}
            className="h-8 rounded-lg border border-input bg-background px-2 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {SORTS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      {recentsQuery.isLoading ? (
        <div className="mt-8 flex flex-col gap-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<History className="h-5 w-5" aria-hidden />}
            title={query.trim() || filter !== "all" ? "Nothing matches those filters" : "No recent items yet"}
            description={
              query.trim() || filter !== "all"
                ? "Clear the search or switch back to All to see everything."
                : "As you create projects and talk to the agent, everything shows up here."
            }
          />
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-2" aria-label="Recent items">
          {entries.map((entry) => (
            <li key={`${entry.type}-${entry.id}`}>
              <button
                type="button"
                onClick={() => openEntry(entry)}
                className="flex w-full items-center gap-3.5 rounded-card border border-border bg-card px-4 py-3 text-left transition-colors duration-150 ease-swift hover:border-border-strong"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <TypeIcon type={entry.type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-foreground">
                    {entry.title}
                  </span>
                  {entry.subtitle ? (
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {entry.subtitle}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <Badge variant="outline">{entryLabel(entry.type)}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(entry.lastAccessedAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TypeIcon({ type }: { type: RecentItem["type"] }) {
  if (type === "project") return <Layers className="h-4 w-4" aria-hidden />;
  if (type === "conversation") return <MessageSquare className="h-4 w-4" aria-hidden />;
  if (type === "file") return <FileCode2 className="h-4 w-4" aria-hidden />;
  return <Bot className="h-4 w-4" aria-hidden />;
}

function entryLabel(type: RecentItem["type"]): string {
  switch (type) {
    case "project":
      return "Project";
    case "conversation":
      return "Conversation";
    case "file":
      return "File";
    case "session":
      return "Session";
  }
}
