import { describe, it, expect } from "vitest";
import { isRelativeCircuit, nextRace } from "./next-race";

const SCHEDULE = {
  year: 2026,
  gp: "Austria",
  final: "2026-06-28T15:00:00Z",
  nextGp: "Great Britain",
};

describe("isRelativeCircuit", () => {
  it("matches relative references the parser may emit", () => {
    for (const r of ["next race", "the next race", "upcoming race", "the upcoming GP", "this weekend", "coming up"]) {
      expect(isRelativeCircuit(r)).toBe(true);
    }
  });

  it("does not match named circuits or empty input", () => {
    for (const c of ["Austria", "Monza", "Italy", "Las Vegas", undefined, ""]) {
      expect(isRelativeCircuit(c)).toBe(false);
    }
  });
});

describe("nextRace", () => {
  it("returns the scheduled weekend before its race finishes", () => {
    const before = new Date("2026-06-22T00:00:00Z");
    expect(nextRace(before, SCHEDULE)).toEqual({ year: 2026, gp: "Austria" });
  });

  it("rolls to the following weekend once the race has finished", () => {
    const after = new Date("2026-06-29T00:00:00Z");
    expect(nextRace(after, SCHEDULE)).toEqual({ year: 2026, gp: "Great Britain" });
  });
});
