import { describe, it, expect } from "vitest";
import { normalizeCircuit, normalizeLookupCircuit } from "./circuits";

describe("normalizeCircuit", () => {
  it("maps the canonical name to itself", () => {
    expect(normalizeCircuit("Italy")).toBe("Italy");
    expect(normalizeCircuit("Mexico City")).toBe("Mexico City");
  });

  it("maps common aliases to the canonical key", () => {
    expect(normalizeCircuit("Monza")).toBe("Italy");
    expect(normalizeCircuit("the Italian Grand Prix")).toBe("Italy");
    expect(normalizeCircuit("Jeddah")).toBe("Saudi Arabia");
    expect(normalizeCircuit("Vegas")).toBe("Las Vegas");
    expect(normalizeCircuit("mexico")).toBe("Mexico City");
  });

  it("returns null for circuits outside the 8-circuit slice", () => {
    expect(normalizeCircuit("Monaco")).toBeNull();
    expect(normalizeCircuit("Silverstone")).toBeNull();
    expect(normalizeCircuit(undefined)).toBeNull();
  });
});

describe("normalizeLookupCircuit", () => {
  it("resolves aliases for pit_loss including Monaco", () => {
    expect(normalizeLookupCircuit("Monaco", "pit_loss")).toBe("Monaco");
    expect(normalizeLookupCircuit("Monza", "pit_loss")).toBe("Italy");
  });

  it("excludes Monaco for deg/stint (strategy-table circuits only)", () => {
    expect(normalizeLookupCircuit("Monaco", "tyre_deg")).toBeNull();
    expect(normalizeLookupCircuit("Bahrain", "stint_length")).toBe("Bahrain");
  });

  it("returns null for an unknown circuit", () => {
    expect(normalizeLookupCircuit("Narnia", "pit_loss")).toBeNull();
  });
});
