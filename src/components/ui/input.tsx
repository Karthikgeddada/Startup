"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

export const inputBase = cn(
  "w-full rounded-lg bg-background px-3 text-sm text-foreground placeholder:text-subtle-foreground",
  "transition-colors duration-150 ease-swift",
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

/** Optional field chrome: when any of these is set the control is wrapped in a labelled field. */
interface FieldChrome {
  label?: string;
  hint?: string;
  error?: string;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldChrome {
  invalid?: boolean;
  /** Leading icon inside the control. */
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, label, hint, error, icon, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  const control = (
    <div className="relative flex w-full items-center">
      {icon ? (
        <span className="pointer-events-none absolute left-3 text-muted-foreground">{icon}</span>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error) || invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          inputBase,
          "h-10 border border-input",
          icon && "pl-9",
          (error || invalid) && "border-danger focus:ring-danger",
          className,
        )}
        {...props}
      />
    </div>
  );

  if (!label && !hint && !error) return control;

  return (
    <div className="flex flex-col gap-1.5">
      {label ? <Label htmlFor={inputId}>{label}</Label> : null}
      {control}
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-[12px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    FieldChrome {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid = false, label, hint, error, id, ...props }, ref) {
    const autoId = useId();
    const textareaId = id ?? autoId;
    const describedBy = error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined;

    const control = (
      <textarea
        ref={ref}
        id={textareaId}
        aria-invalid={Boolean(error) || invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          inputBase,
          "min-h-[80px] border border-input py-2.5 leading-relaxed",
          (error || invalid) && "border-danger focus:ring-danger",
          className,
        )}
        {...props}
      />
    );

    if (!label && !hint && !error) return control;

    return (
      <div className="flex flex-col gap-1.5">
        {label ? <Label htmlFor={textareaId}>{label}</Label> : null}
        {control}
        {error ? (
          <p id={`${textareaId}-error`} role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={`${textareaId}-hint`} className="text-[12px] text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

export function Label({
  htmlFor,
  children,
  className,
}: {
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("text-[13px] font-medium text-foreground", className)}
    >
      {children}
    </label>
  );
}

/** Form field wrapper: label, control, hint and error message with aria wiring. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
