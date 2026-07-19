import { describe, it, expect } from "vitest";
import { getEntityWhat, splitSentences, getCircuitFacts, getCircuitName, entityKey, parsePopoverKey } from "./entity-whats";

describe("entity-whats accessors", () => {
  it("keys by type:slug", () => {
    expect(entityKey("driver", "VER")).toBe("driver:VER");
    expect(getEntityWhat("driver", "VER")?.title).toBe("Max Verstappen");
    expect(getEntityWhat("team", "Nowhere")).toBeUndefined();
  });
  it("getCircuitFacts sentence-splits the summary (drop-in for /weekend)", () => {
    const facts = getCircuitFacts("Austria");
    expect(Array.isArray(facts)).toBe(true);
    expect(facts.length).toBeGreaterThan(1);
    expect(facts.every((f) => f.trim().length > 0 && !f.includes("  "))).toBe(true);
  });
  it("splitSentences never breaks on decimals or intra-token periods", () => {
    const out = splitSentences(
      "The facility near Stavelot spans 7.004 kilometers and hosted F1 since 1925. With two exceptions, it ran annually."
    );
    expect(out).toEqual([
      "The facility near Stavelot spans 7.004 kilometers and hosted F1 since 1925.",
      "With two exceptions, it ran annually.",
    ]);
  });
  it("getCircuitName returns the track display name, or the gp key when absent", () => {
    expect(getCircuitName("Austria")).toBe("Red Bull Ring");
    expect(getCircuitName("Nowhere")).toBe("Nowhere");
  });
});

it("parsePopoverKey resolves entity keys vs concept slugs", () => {
  const e = parsePopoverKey("driver:VER");
  expect(e && e.kind === "entity" && e.what.title).toBe("Max Verstappen");
  const c = parsePopoverKey("drs");
  expect(c && c.kind).toBe("concept");
  expect(parsePopoverKey("team:Nowhere")).toBeNull();
});
