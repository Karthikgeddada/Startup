import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * CSS-driven tooltip: visible on hover and keyboard focus, never on touch drag.
 * Pure presentational — safe in server and client components.
 */
export function Tooltip({
  label,
  side = "bottom",
  children,
  className,
}: {
  label: string;
  side?: "top" | "bottom";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium shadow-dropdown",
          "bg-foreground text-background opacity-0 transition-opacity duration-150 ease-swift",
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          side === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
        )}
      >
        {label}
      </span>
    </span>
  );
}
