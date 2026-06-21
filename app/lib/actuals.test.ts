import { describe, it, expect } from "vitest";
import { computeCalibrationRow } from "./actuals";

describe("computeCalibrationRow", () => {
  const podium = {
    drivers: [
      { driver: "VER", p_podium: 0.8 },
      { driver: "NOR", p_podium: 0.6 },
      { driver: "LEC", p_podium: 0.5 },
      { driver: "RUS", p_podium: 0.1 },
    ],
  };

  it("scores predicted bands against the actual finish", () => {
    const row = computeCalibrationRow(podium, ["VER", "NOR", "RUS"]);
    expect(row.top3).toBeGreaterThan(0);
    expect(row.brierContrib).toBeGreaterThanOrEqual(0);
  });

  it("rewards a perfect top-3 call", () => {
    const row = computeCalibrationRow(podium, ["VER", "NOR", "LEC"]);
    expect(row.top3).toBe(1); // top-3 predicted = top-3 actual
  });

  it("handles an empty podium without dividing by zero", () => {
    const row = computeCalibrationRow({ drivers: [] }, ["VER", "NOR", "LEC"]);
    expect(Number.isFinite(row.brierContrib)).toBe(true);
    expect(row.top3).toBe(0);
  });
});
