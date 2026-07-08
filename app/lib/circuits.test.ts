import { describe, it, expect } from "vitest";
import { normalizeCircuit, normalizeLookupCircuit, gpLabel, DEFAULT_YEAR } from "./circuits";

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

  it("resolves British GP name variants (incl. the parser's 'United Kingdom')", () => {
    expect(normalizeCircuit("british gp")).toBe("Great Britain");
    expect(normalizeCircuit("the British Grand Prix")).toBe("Great Britain");
    expect(normalizeCircuit("United Kingdom")).toBe("Great Britain");
    expect(normalizeCircuit("Silverstone")).toBe("Great Britain");
  });

  it("normalizes the remaining 2026 roster circuits (upcoming races)", () => {
    expect(normalizeCircuit("Spa")).toBe("Belgium");
    expect(normalizeCircuit("the Belgian Grand Prix")).toBe("Belgium");
    expect(normalizeCircuit("Zandvoort")).toBe("Netherlands");
    expect(normalizeCircuit("Baku")).toBe("Azerbaijan");
    expect(normalizeCircuit("Interlagos")).toBe("São Paulo");
    expect(normalizeCircuit("Lusail")).toBe("Qatar");
    expect(normalizeCircuit("Singapore")).toBe("Singapore");
  });

  it("normalizes 2026 calendar circuits", () => {
    expect(normalizeCircuit("Austrian Grand Prix")).toBe("Austria");
    expect(normalizeCircuit("red bull ring")).toBe("Austria");
    expect(normalizeCircuit("Spielberg")).toBe("Austria");
    expect(normalizeCircuit("Silverstone")).toBe("Great Britain");
    expect(normalizeCircuit("Suzuka")).toBe("Japan");
    expect(normalizeCircuit("Montreal")).toBe("Canada");
    expect(normalizeCircuit("Monaco")).toBe("Monaco");
  });

  it("defaults to the live beta season", () => {
    expect(DEFAULT_YEAR).toBe(2026);
  });

  it("returns null for circuits outside the calendar", () => {
    expect(normalizeCircuit("Sochi")).toBeNull();
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

  it("maps Barcelona to Barcelona for pit_loss (2026 distinct circuit)", () => {
    expect(normalizeLookupCircuit("Barcelona", "pit_loss")).toBe("Barcelona");
  });
});

describe("gpLabel", () => {
  it("returns the adjectival GP label for mapped keys", () => {
    expect(gpLabel("Great Britain")).toBe("British");
    expect(gpLabel("Belgium")).toBe("Belgian");
    expect(gpLabel("Netherlands")).toBe("Dutch");
    expect(gpLabel("Saudi Arabia")).toBe("Saudi Arabian");
  });

  it("falls back to the gp key for place-named GPs", () => {
    expect(gpLabel("Monaco")).toBe("Monaco");
    expect(gpLabel("Miami")).toBe("Miami");
    expect(gpLabel("Qatar")).toBe("Qatar");
    expect(gpLabel("Narnia")).toBe("Narnia");
  });
});
