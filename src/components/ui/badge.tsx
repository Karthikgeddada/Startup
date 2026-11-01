import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger" | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  outline: "border border-border bg-transparent text-muted-foreground",
};

const dotClasses: Record<BadgeVariant, string> = {
  neutral: "bg-muted-foreground",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  outline: "bg-muted-foreground",
};

export function Badge({
  variant = "neutral",
  children,
  dot = false,
  className,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  /** Leading status dot — use for states, not decoration. */
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[11px] font-medium leading-5",
        variantClasses[variant],
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dotClasses[variant])} /> : null}
      {children}
    </span>
  );
}
