import { describe, it, expect } from "vitest";
import { getCircuitFacts } from "./circuit-facts";

describe("getCircuitFacts", () => {
  it("returns curated facts for a seeded circuit", () => {
    const facts = getCircuitFacts("Austria");
    expect(facts.length).toBeGreaterThanOrEqual(3);
    expect(typeof facts[0]).toBe("string");
  });
  it("returns an empty array for a circuit with no curated facts", () => {
    expect(getCircuitFacts("Narnia")).toEqual([]);
  });
});
