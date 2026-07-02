import { describe, it, expect } from "vitest";
import { contentHash, mergeWhat } from "./entity-merge";

const base = { type: "driver" as const, slug: "VER", title: "Max Verstappen",
  source: { label: "Wikipedia", url: "u" } };

describe("mergeWhat", () => {
  it("new record starts verified", () => {
    const out = mergeWhat(undefined, { ...base, summary: "A" }, "2026-07-01T00:00:00Z");
    expect(out.badge).toBe("verified");
    expect(out.contentHash).toBe(contentHash("A"));
  });
  it("unchanged summary keeps the prior badge", () => {
    const prev = { ...base, summary: "A", badge: "community-reviewed" as const, generatedAt: "x", contentHash: contentHash("A") };
    expect(mergeWhat(prev, { ...base, summary: "A" }, "now").badge).toBe("community-reviewed");
  });
  it("changed summary re-verifies", () => {
    const prev = { ...base, summary: "A", badge: "drafted" as const, generatedAt: "x", contentHash: contentHash("A") };
    expect(mergeWhat(prev, { ...base, summary: "B" }, "now").badge).toBe("verified");
  });
});
