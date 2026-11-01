import { cn } from "@/lib/utils";

/**
 * CURVIN brand mark — original geometry.
 *
 * The mark is a continuous open ring (the "C") with a right-pointing chevron
 * at its centre — a prompt cursor advancing through an orbit. It reads as both
 * the letter C and an engineer's command line. Monochrome by design: it uses
 * currentColor exclusively and works in light and dark themes.
 */
export function CurvinMark({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0 text-foreground", className)}
    >
      {/* Open ring: 270° arc leaving an upper-right gap */}
      <circle
        cx="12"
        cy="12"
        r="8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="37.7 12.6"
        transform="rotate(-38 12 12)"
      />
      {/* Forward chevron at centre */}
      <path
        d="M9.6 7.9 14.3 12 9.6 16.1"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full lockup: mark + lowercase wordmark, as used in the sidebar header.
 */
export function CurvinLogo({
  className,
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <CurvinMark size={size} />
      <span
        className="text-[1.19rem] font-semibold leading-none tracking-[-0.03em] text-foreground"
        aria-hidden="true"
      >
        curvin
      </span>
    </span>
  );
}
