"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Optional badge shown after the label (e.g. pending approval count). */
  badge?: string | number;
  disabled?: boolean;
}

/**
 * Controlled tab strip with full keyboard navigation (arrows + Home/End).
 * Consumers render the panel for `activeId` themselves with aria wiring helpers.
 */
export function Tabs({
  items,
  activeId,
  onChange,
  className,
}: {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const activeIndex = items.findIndex((tab) => tab.id === activeId);

  const move = (direction: 1 | -1 | "first" | "last") => {
    const enabled = items.filter((tab) => !tab.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((tab) => tab.id === activeId);
    const next =
      direction === "first"
        ? 0
        : direction === "last"
          ? enabled.length - 1
          : (current + direction + enabled.length) % enabled.length;
    onChange(enabled[next]!.id);
  };

  return (
    <div
      role="tablist"
      aria-label="Workspace sections"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          move("first");
        } else if (event.key === "End") {
          event.preventDefault();
          move("last");
        }
      }}
      className={cn("flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-border", className)}
    >
      {items.map((tab, index) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            tabIndex={isActive || index === activeIndex ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 ease-swift",
              "disabled:cursor-not-allowed disabled:opacity-40",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
            {tab.label}
            {tab.badge !== undefined ? (
              <span className="ml-0.5 rounded-pill bg-accent-soft px-1.5 text-[11px] font-medium text-accent">
                {tab.badge}
              </span>
            ) : null}
            {isActive ? (
              <span aria-hidden className="absolute inset-x-3 bottom-0 h-[2px] rounded-pill bg-accent" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Panel half of the Tabs pair. Render one per tab id. */
export function TabPanel({
  id,
  active,
  children,
  className,
}: {
  id: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className={cn("outline-none animate-fade-in", className)}
    >
      {children}
    </div>
  );
}
