import { describe, expect, it } from "vitest";

import { formatBytes, formatRelativeTime, truncate } from "@/lib/format";

const NOW = new Date("2026-11-01T12:00:00Z");

describe("formatRelativeTime", () => {
  it("formats fresh timestamps as just now", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 10_000), NOW)).toBe("just now");
  });

  it("formats minutes, hours, days, months, and years", () => {
    const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
    expect(formatRelativeTime(minutesAgo(5), NOW)).toBe("5m ago");
    expect(formatRelativeTime(minutesAgo(3 * 60), NOW)).toBe("3h ago");
    expect(formatRelativeTime(minutesAgo(2 * 24 * 60), NOW)).toBe("2d ago");
    expect(formatRelativeTime(minutesAgo(60 * 24 * 60), NOW)).toBe("2mo ago");
    expect(formatRelativeTime(minutesAgo(400 * 24 * 60), NOW)).toBe("1y ago");
  });

  it("accepts ISO strings and epoch numbers", () => {
    expect(formatRelativeTime("2026-11-01T11:30:00Z", NOW)).toBe("30m ago");
    expect(formatRelativeTime(NOW.getTime() - 45_000, NOW)).toBe("just now");
  });
});

describe("formatBytes", () => {
  it("formats SI units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1_234)).toBe("1.2 KB");
    expect(formatBytes(3_500_000)).toBe("3.3 MB");
  });

  it("guards invalid input", () => {
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("truncate", () => {
  it("keeps short strings untouched", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long strings with an ellipsis within the limit", () => {
    const out = truncate("abcdefghij", 5);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(5);
  });
});
