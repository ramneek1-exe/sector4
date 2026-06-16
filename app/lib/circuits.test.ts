import { describe, it, expect } from "vitest";
import { normalizeCircuit } from "./circuits";

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
