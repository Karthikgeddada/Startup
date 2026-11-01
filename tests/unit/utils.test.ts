import { describe, expect, it } from "vitest";

import { cn, nextId } from "@/lib/utils";

describe("cn", () => {
  it("joins conditional class names", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("lets the last Tailwind conflict win", () => {
    expect(cn("h-10 px-3", "h-12")).toBe("px-3 h-12");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });

  it("merges nested arrays and objects", () => {
    expect(cn(["a", { b: true, c: false }], "d")).toBe("a b d");
  });
});

describe("nextId", () => {
  it("returns unique sequential ids per prefix", () => {
    const first = nextId("att");
    const second = nextId("att");
    expect(second).not.toBe(first);
    expect(first.startsWith("att-")).toBe(true);
  });
});
