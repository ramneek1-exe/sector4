import { describe, it, expect } from "vitest";
import { contentHash, mergeWhat } from "./entity-merge";

const base = { type: "driver" as const, slug: "VER", title: "Max Verstappen",
  source: { label: "Wikipedia", url: "u" } };

describe("mergeWhat", () => {
  it("new record starts drafted", () => {
    const out = mergeWhat(undefined, { ...base, summary: "A" }, "2026-07-01T00:00:00Z");
    expect(out.badge).toBe("drafted");
    expect(out.contentHash).toBe(contentHash("A"));
  });
  it("verified + unchanged summary stays verified", () => {
    const prev = { ...base, summary: "A", badge: "verified" as const, generatedAt: "x", contentHash: contentHash("A") };
    expect(mergeWhat(prev, { ...base, summary: "A" }, "now").badge).toBe("verified");
  });
  it("verified + changed summary resets to drafted", () => {
    const prev = { ...base, summary: "A", badge: "verified" as const, generatedAt: "x", contentHash: contentHash("A") };
    expect(mergeWhat(prev, { ...base, summary: "B" }, "now").badge).toBe("drafted");
  });
});
