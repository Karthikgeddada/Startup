import { cn } from "@/lib/utils";

/**
 * CURVIN Agent Mark — original geometry.
 *
 * A tilted elliptical orbit around a solid core with one bright node riding
 * the orbit: the agent at work around your project. Distinct from the brand
 * mark (open ring + chevron). Monochrome via currentColor; pass the `active`
 * variant for the brand-accent treatment used on entry points.
 */
export function AgentMark({
  className,
  size = 24,
  active = false,
}: {
  className?: string;
  size?: number;
  /** Accent treatment for primary entry points such as the header button. */
  active?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn(
        "shrink-0 transition-colors duration-150",
        active ? "text-accent" : "text-muted-foreground",
        className,
      )}
    >
      <g transform="rotate(-24 12 12)">
        <ellipse
          cx="12"
          cy="12"
          rx="8.8"
          ry="4.4"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
        <circle cx="20.8" cy="12" r="2.4" fill="currentColor" />
      </g>
    </svg>
  );
}
