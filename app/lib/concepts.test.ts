import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/data/concepts.json", () => ({
  default: [
    { slug: "a", term: "A", group: "G1", summary: "s", aliases: ["alias1", "alias2"], body: ["p"], whyItMatters: "w", related: ["b", "ghost"], badge: "drafted", sources: [{ label: "L", url: "http://x" }] },
    { slug: "b", term: "B", group: "G2", summary: "s", aliases: ["alias3"], body: ["p"], whyItMatters: "w", related: [], badge: "verified", sources: [] },
    { slug: "c", term: "C", group: "G1", summary: "s", aliases: ["alias4", "alias5"], body: ["p"], whyItMatters: "w", related: [], badge: "drafted", sources: [] },
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

describe("concept aliases", () => {
  it("every concept has at least one non-empty alias", () => {
    for (const c of allConcepts()) {
      expect(Array.isArray(c.aliases), `${c.slug} aliases`).toBe(true);
      expect(c.aliases.length, `${c.slug} alias count`).toBeGreaterThan(0);
      for (const a of c.aliases) expect(a.trim().length, `${c.slug} alias "${a}"`).toBeGreaterThan(0);
    }
  });

  it("aliases are globally unique (no alias maps to two concepts)", () => {
    const seen = new Map<string, string>();
    for (const c of allConcepts()) {
      for (const a of c.aliases) {
        const key = a.toLowerCase();
        expect(seen.has(key), `duplicate alias "${a}" (${seen.get(key)} vs ${c.slug})`).toBe(false);
        seen.set(key, c.slug);
      }
    }
  });
});
