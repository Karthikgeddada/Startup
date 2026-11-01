import { env } from "@/config/env";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Retry attempts for transient failures (5xx / network). Default 2. */
  retries?: number;
  /** Per-attempt timeout. Default 15s. */
  timeoutMs?: number;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

/** Exponential backoff with jitter: ~300ms, ~600ms, ... capped, ±30% random. */
function backoffDelay(attempt: number): number {
  const base = 300 * 2 ** attempt;
  const jitter = base * 0.3 * (Math.random() * 2 - 1);
  return Math.min(base + jitter, 5000);
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Typed HTTP client for the future CURVIN backend.
 * - Retries transient failures with exponential backoff + jitter
 * - Never retries 4xx (except 408/429 — handled upstream as rate limits)
 * - Honours AbortSignal across fetch and backoff waits
 * - No credentials in code; auth flows through the backend session layer
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const { signal, retries = 2, timeoutMs = 15_000 } = options;
  const url = `${env.apiBaseUrl}${path}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await sleep(backoffDelay(attempt - 1), signal);
    }

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const onOuterAbort = () => timeout.abort();
    signal?.addEventListener("abort", onOuterAbort, { once: true });

    try {
      const response = await fetch(url, { ...init, signal: timeout.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => undefined);
        const error = new ApiError(
          response.status,
          (body as { message?: string } | undefined)?.message ?? response.statusText,
          body,
        );
        if (isRetryable(response.status) && attempt < retries) {
          lastError = error;
          continue;
        }
        throw error;
      }
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw error;
      }
      lastError = error;
      if (attempt === retries) throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    }
  }
  throw lastError ?? new ApiError(0, "Request failed");
}
