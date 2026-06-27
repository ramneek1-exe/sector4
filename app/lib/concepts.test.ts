import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/data/concepts.json", () => ({
  default: [
    { slug: "a", term: "A", group: "G1", summary: "s", body: ["p"], whyItMatters: "w", related: ["b", "ghost"], badge: "drafted", sources: [{ label: "L", url: "http://x" }] },
    { slug: "b", term: "B", group: "G2", summary: "s", body: ["p"], whyItMatters: "w", related: [], badge: "verified", sources: [] },
    { slug: "c", term: "C", group: "G1", summary: "s", body: ["p"], whyItMatters: "w", related: [], badge: "drafted", sources: [] },
  ],
}));

import { allConcepts, getConcept, conceptsByGroup, resolveRelated, badgeLabel } from "./concepts";

describe("concepts accessors", () => {
  it("allConcepts returns every concept", () => {
    expect(allConcepts().map((c) => c.slug)).toEqual(["a", "b", "c"]);
  });
  it("getConcept finds by slug and misses to undefined", () => {
    expect(getConcept("a")?.term).toBe("A");
    expect(getConcept("nope")).toBeUndefined();
  });
  it("conceptsByGroup groups in first-appearance order", () => {
    const g = conceptsByGroup();
    expect(g.map((x) => x.group)).toEqual(["G1", "G2"]);
    expect(g[0].concepts.map((c) => c.slug)).toEqual(["a", "c"]);
  });
  it("resolveRelated maps slugs to concepts and drops unknowns", () => {
    expect(resolveRelated("a").map((c) => c.slug)).toEqual(["b"]); // "ghost" dropped
  });
  it("badgeLabel maps each badge to its label", () => {
    expect(badgeLabel("verified")).toBe("Verified");
    expect(badgeLabel("drafted")).toBe("Drafted · unverified");
    expect(badgeLabel("community-reviewed")).toBe("Community-reviewed");
  });
});
