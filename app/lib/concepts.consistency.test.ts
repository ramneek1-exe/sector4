import { describe, it, expect } from "vitest";
import { allConcepts, getConcept } from "./concepts";

const BADGES = ["verified", "drafted", "community-reviewed"];

const ALLOWED_GROUPS = [
  "Tyres & strategy",
  "Pace & sessions",
  "Air & aero",
  "Race control",
  "Power & energy",
];

describe("concepts.json integrity", () => {
  const concepts = allConcepts();

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

  it("every group is one of the allowed groups", () => {
    for (const c of concepts) {
      expect(ALLOWED_GROUPS, `${c.slug} group`).toContain(c.group);
    }
  });

  it("slugs are kebab-case", () => {
    for (const c of concepts) {
      expect(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug), `${c.slug} kebab`).toBe(true);
    }
  });

  it("aliases are globally unique across all concepts (case-insensitive)", () => {
    const seen = new Map<string, string>();
    for (const c of concepts) {
      for (const a of c.aliases) {
        const key = a.toLowerCase();
        expect(seen.has(key), `duplicate alias "${a}" (${seen.get(key)} vs ${c.slug})`).toBe(false);
        seen.set(key, c.slug);
      }
    }
  });

  it("no user-facing copy contains an em-dash", () => {
    for (const c of concepts) {
      const strings = [c.term, c.summary, c.whyItMatters, ...c.body];
      for (const s of strings) {
        expect(s.includes("—"), `${c.slug} em-dash in "${s.slice(0, 40)}"`).toBe(false);
      }
    }
  });

  it("ships all 24 concepts", () => {
    expect(concepts.length).toBe(24);
  });

  it("all 24 concepts are verified", () => {
    const verified = concepts.filter((c) => c.badge === "verified").length;
    const drafted = concepts.filter((c) => c.badge === "drafted").length;
    expect(verified).toBe(24);
    expect(drafted).toBe(0);
  });

  it("covers all five groups", () => {
    const groups = new Set(concepts.map((c) => c.group));
    expect(groups).toEqual(
      new Set(["Tyres & strategy", "Pace & sessions", "Air & aero", "Race control", "Power & energy"]),
    );
  });
});
