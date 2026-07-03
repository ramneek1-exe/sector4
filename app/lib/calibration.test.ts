import { describe, it, expect } from "vitest";
import {
  summarize,
  calibrationStatus,
  raceDetail,
  CALIBRATION_MIN_RACES,
  type CalibrationRow,
} from "./calibration";

const row = (gp: string, top3: number, brierContrib: number): CalibrationRow => ({
  gp,
  issuedAt: "2026-01-01T00:00:00Z",
  top3,
  brierContrib,
});

describe("summarize", () => {
  it("returns an empty summary for no races", () => {
    const s = summarize([]);
    expect(s.nRaces).toBe(0);
    expect(s.top3Rate).toBe(0);
    expect(s.meanBrier).toBe(0);
    expect(s.cumulative).toEqual([]);
  });

  it("computes season means, rounded", () => {
    const s = summarize([row("A", 1, 0.1), row("B", 1 / 3, 0.2)]);
    expect(s.nRaces).toBe(2);
    expect(s.top3Rate).toBe(0.67); // (1 + 0.333)/2 = 0.6667 -> 0.67
    expect(s.meanBrier).toBe(0.15); // (0.1 + 0.2)/2
  });

  it("builds a cumulative series in round order", () => {
    const s = summarize([row("A", 1, 0.1), row("B", 0, 0.3), row("C", 1, 0.2)]);
    expect(s.cumulative.map((p) => p.round)).toEqual([1, 2, 3]);
    expect(s.cumulative.map((p) => p.gp)).toEqual(["A", "B", "C"]);
    expect(s.cumulative[0].top3Rate).toBe(1);
    expect(s.cumulative[1].top3Rate).toBe(0.5); // (1+0)/2
    expect(s.cumulative[2].top3Rate).toBe(0.67); // (1+0+1)/3 = 0.667
    expect(s.cumulative[2].meanBrier).toBe(0.2); // (0.1+0.3+0.2)/3
  });
});

describe("calibrationStatus", () => {
  it("is never ready in v1 (display-only) and reports the count", () => {
    expect(calibrationStatus([]).ready).toBe(false);
    expect(calibrationStatus([]).nRaces).toBe(0);
    const s = calibrationStatus([row("A", 1, 0.1), row("B", 0, 0.2)]);
    expect(s.ready).toBe(false);
    expect(s.nRaces).toBe(2);
    expect(s.reason).toContain("2 logged so far");
  });

  it("exports a positive min-races threshold for the future %-upgrade", () => {
    expect(CALIBRATION_MIN_RACES).toBeGreaterThan(0);
  });
});

describe("raceDetail", () => {
  const podium = {
    drivers: [
      { driver: "VER", p_podium: 0.8 },
      { driver: "NOR", p_podium: 0.6 },
      { driver: "LEC", p_podium: 0.5 },
      { driver: "RUS", p_podium: 0.2 },
    ],
  };

  it("returns null when podium or actuals are missing", () => {
    expect(raceDetail(null, ["VER"])).toBeNull();
    expect(raceDetail(podium, [])).toBeNull();
  });

  it("extracts predicted top-3, actual top-3, and per-slot hits", () => {
    const d = raceDetail(podium, ["VER", "RUS", "NOR", "LEC"])!;
    expect(d.predicted).toEqual(["VER", "NOR", "LEC"]);
    expect(d.actual).toEqual(["VER", "RUS", "NOR"]);
    expect(d.hits).toEqual([true, true, false]); // VER hit, NOR hit, LEC missed
  });
});
