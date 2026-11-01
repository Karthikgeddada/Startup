/**
 * Pure formatting helpers. No Date.now() inside — callers pass `now`, which
 * keeps every function deterministic and unit-testable.
 */

export type DateInput = Date | string | number;

function toDate(input: DateInput): Date {
  return input instanceof Date ? input : new Date(input);
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** "just now", "5m ago", "3h ago", "2d ago", "6mo ago", "1y ago" */
export function formatRelativeTime(input: DateInput, now: Date = new Date()): string {
  const date = toDate(input);
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);

  if (seconds < 45) return "just now";
  const abs = Math.abs(seconds);
  if (abs < HOUR) return `${Math.round(abs / MINUTE)}m ago`;
  if (abs < DAY) return `${Math.round(abs / HOUR)}h ago`;
  if (abs < MONTH) return `${Math.round(abs / DAY)}d ago`;
  if (abs < YEAR) return `${Math.round(abs / MONTH)}mo ago`;
  return `${Math.round(abs / YEAR)}y ago`;
}

/** "1.2 KB", "3.4 MB" — SI units, single decimal for sub-10 values. */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = bytes === 0 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  const places = i === 0 || value >= 10 ? 0 : decimals;
  return `${value.toFixed(places)} ${units[i]}`;
}

/** Truncate long strings for single-line UI contexts. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
