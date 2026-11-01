"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "rounded-pill bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-hover",
  secondary:
    "rounded-lg bg-muted text-foreground hover:bg-subtle",
  ghost: "rounded-lg text-foreground hover:bg-muted",
  danger: "rounded-pill bg-danger text-danger-foreground hover:opacity-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-[15px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Left icon slot. */
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-150 ease-swift",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children ? <span className="truncate">{children}</span> : null}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Exclude<ButtonVariant, "primary">;
  size?: "sm" | "md";
  /** Required — the accessible label. Surfaced as aria-label. */
  label: string;
  children: ReactNode;
}

export function IconButton({
  variant = "ghost",
  size = "md",
  label,
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-colors duration-150 ease-swift",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        variant === "ghost" && "text-muted-foreground hover:bg-muted hover:text-foreground",
        variant === "secondary" && "bg-muted text-foreground hover:bg-subtle",
        variant === "danger" && "text-danger hover:bg-danger-soft",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
