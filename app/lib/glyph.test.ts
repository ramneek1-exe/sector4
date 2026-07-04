import { describe, it, expect } from "vitest";
import { resolveGlyph, driverName } from "./glyph";
import drivers from "@/app/data/drivers.json";
import teams from "@/app/data/teams.json";

describe("resolveGlyph", () => {
  it("resolves a known driver+team to helmet fill, number, and contrast-guarded numeral", () => {
    const g = resolveGlyph("VER", "Red Bull Racing");
    expect(g.code).toBe("VER");
    expect(g.number).toBe(33);
    expect(g.helmetFill).toBe("#223971");
    expect(g.accent).toBe("#E2002A");
    expect(g.numberColor).toMatch(/^#([0-9A-Fa-f]{6})$/);
    expect(g.known).toBe(true);
  });
  it("degrades an unknown driver to grey + raw code, no fabricated number", () => {
    const g = resolveGlyph("XXX", "Red Bull Racing");
    expect(g.code).toBe("XXX");
    expect(g.number).toBeNull();
    expect(g.known).toBe(false);
  });
  it("degrades an unknown/absent team to a neutral grey helmet", () => {
    const g = resolveGlyph("VER", null);
    expect(g.helmetFill).toBe("#9CA3AF");
  });

  it("maps 2026 pipeline team-name variants to the canonical color, not grey", () => {
    // Strings the fastf1 season results emit for teams already in teams.json.
    expect(resolveGlyph("VER", "Red Bull").helmetFill).toBe("#223971"); // Red Bull Racing
    expect(resolveGlyph("GAS", "Alpine F1 Team").helmetFill).not.toBe("#9CA3AF");
    expect(resolveGlyph("LAW", "RB F1 Team").helmetFill).not.toBe("#9CA3AF");
    expect(resolveGlyph("BOT", "Alfa Romeo").helmetFill).not.toBe("#9CA3AF");
    expect(resolveGlyph("TSU", "AlphaTauri").helmetFill).not.toBe("#9CA3AF");
  });

  it("resolves the new 2026 teams Audi and Cadillac to real colors, not grey", () => {
    expect(resolveGlyph("HUL", "Audi").helmetFill).not.toBe("#9CA3AF");
    expect(resolveGlyph("PER", "Cadillac F1 Team").helmetFill).not.toBe("#9CA3AF");
  });
});

describe("data integrity", () => {
  it("every driver has an integer number and a valid hex personal color", () => {
    for (const [code, d] of Object.entries(drivers as Record<string, any>)) {
      expect(Number.isInteger(d.number), `${code} number`).toBe(true);
      expect(d.personalColor, `${code} color`).toMatch(/^#([0-9A-Fa-f]{6})$/);
      expect(typeof d.name).toBe("string");
    }
  });
  it("every team has valid primary+secondary hex", () => {
    for (const [name, t] of Object.entries(teams as Record<string, any>)) {
      expect(t.primary, `${name} primary`).toMatch(/^#([0-9A-Fa-f]{6})$/);
      expect(t.secondary, `${name} secondary`).toMatch(/^#([0-9A-Fa-f]{6})$/);
    }
  });
});

describe("driverName", () => {
  it("resolves a known driver code to a full name", () => {
    expect(driverName("VER")).toBe("Max Verstappen");
  });
  it("falls back to the code for an unknown driver", () => {
    expect(driverName("ZZZ")).toBe("ZZZ");
  });
});
