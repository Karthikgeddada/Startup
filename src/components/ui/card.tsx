import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The standard elevated surface. Composable: Card provides the frame,
 * CardBody the internal rhythm, so every card in CURVIN breathes the same.
 */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-card text-foreground",
        "transition-colors duration-150 ease-swift",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("p-5", className)}>{children}</div>;
}
