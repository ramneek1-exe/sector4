import { describe, it, expect } from "vitest";
import { resolvePrevGp, pastPredictionRows } from "./past-predictions";

const CAL = ["Australia", "China", "Great Britain", "Belgium"];

describe("resolvePrevGp", () => {
  it("returns the calendar predecessor when not concluded", () => {
    expect(resolvePrevGp("Belgium", CAL, false)).toBe("Great Britain");
  });
  it("returns the just-passed race (scheduleGp) when concluded", () => {
    // screen is showing nextGp; the previous race is scheduleGp itself
    expect(resolvePrevGp("Belgium", CAL, true)).toBe("Belgium");
  });
  it("returns null for round 1 with no predecessor", () => {
    expect(resolvePrevGp("Australia", CAL, false)).toBeNull();
  });
  it("returns null when scheduleGp is not in the calendar", () => {
    expect(resolvePrevGp("Mars", CAL, false)).toBeNull();
  });
});

describe("pastPredictionRows", () => {
  const podium = {
    drivers: [
      { rank: 1, driver: "NOR", team: "McLaren", band: "strong", p_podium: 0.61 },
      { rank: 2, driver: "PIA", team: "McLaren", band: "strong", p_podium: 0.54 },
      { rank: 3, driver: "LEC", team: "Ferrari", band: "in contention", p_podium: 0.41 },
      { rank: 4, driver: "VER", team: "Red Bull Racing", band: "in contention", p_podium: 0.33 },
    ],
  };

  it("shapes rows with finish position and podium hits from actuals", () => {
    const actuals = ["NOR", "LEC", "RUS", "PIA"]; // PIA finished P4 (off podium), VER DNF
    const out = pastPredictionRows(podium, actuals)!;
    expect(out.hasActuals).toBe(true);
    const nor = out.rows.find((r) => r.driver === "NOR")!;
    expect(nor.finishPos).toBe(1);
    expect(nor.isPodium).toBe(true);
    const pia = out.rows.find((r) => r.driver === "PIA")!;
    expect(pia.finishPos).toBe(4);
    expect(pia.isPodium).toBe(false);
    const ver = out.rows.find((r) => r.driver === "VER")!;
    expect(ver.finishPos).toBeNull(); // not classified -> DNF
    // predicted top-3 by p = NOR,PIA,LEC; actual top-3 = NOR,LEC,RUS -> 2 hits
    expect(out.summary).toEqual({ hits: 2, of: 3 });
  });

  it("degrades to odds-only when actuals are absent", () => {
    const out = pastPredictionRows(podium, null)!;
    expect(out.hasActuals).toBe(false);
    expect(out.summary).toBeNull();
    expect(out.rows.every((r) => r.finishPos === null && r.isPodium === false)).toBe(true);
  });

  it("returns null when there are no drivers", () => {
    expect(pastPredictionRows({ drivers: [] }, ["NOR"])).toBeNull();
    expect(pastPredictionRows(null, ["NOR"])).toBeNull();
  });
});
