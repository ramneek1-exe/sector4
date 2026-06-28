import { describe, it, expect } from "vitest";
import { allConcepts, getConcept } from "./concepts";

const BADGES = ["verified", "drafted", "community-reviewed"];

describe("concepts.json integrity", () => {
  const concepts = allConcepts();

  it("ships exactly the 8 starter concepts", () => {
    expect(concepts.length).toBe(8);
  });

  it("every concept has all required fields populated", () => {
    for (const c of concepts) {
      expect(c.slug, "slug").toBeTruthy();
      expect(c.term, `${c.slug} term`).toBeTruthy();
      expect(c.group, `${c.slug} group`).toBeTruthy();
      expect(c.summary, `${c.slug} summary`).toBeTruthy();
      expect(c.body.length, `${c.slug} body`).toBeGreaterThan(0);
      expect(c.whyItMatters, `${c.slug} whyItMatters`).toBeTruthy();
      expect(c.sources.length, `${c.slug} sources`).toBeGreaterThan(0);
      expect(BADGES, `${c.slug} badge`).toContain(c.badge);
    }
  });

  it("ships all concepts as verified (owner-reviewed)", () => {
    expect(concepts.every((c) => c.badge === "verified")).toBe(true);
  });

  it("slugs are unique", () => {
    const slugs = concepts.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every related slug resolves to a real concept", () => {
    for (const c of concepts) {
      for (const r of c.related) {
        expect(getConcept(r), `${c.slug} -> ${r}`).toBeDefined();
      }
    }
  });

  it("every source has a label and an https url", () => {
    for (const c of concepts) {
      for (const s of c.sources) {
        expect(s.label, `${c.slug} source label`).toBeTruthy();
        expect(s.url.startsWith("https://"), `${c.slug} source url`).toBe(true);
      }
    }
  });
});
