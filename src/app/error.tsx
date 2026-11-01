"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Root error boundary. Never show a blank screen — always a recovery path. */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for observability tooling; no user data is logged.
    console.error("Application error:", error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger-soft text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Something went wrong</h1>
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          The interface hit an unexpected error. Your work is safe — reloading usually resolves it.
          {error.digest ? ` Reference: ${error.digest}` : ""}
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
