import { describe, expect, it } from "vitest";
import { buildStandings, isStandingsFile } from "@/app/lib/championship";

describe("buildStandings", () => {
  it("ranks by points, leader first, with the gap to the leader", () => {
    const rows = buildStandings({ VER: 241, PIA: 198, NOR: 187 }, 13);
    expect(rows.map((r) => r.key)).toEqual(["VER", "PIA", "NOR"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.gap)).toEqual([0, 43, 54]);
  });

  it("states the rate as points per remaining round, rounded", () => {
    const [, pia] = buildStandings({ VER: 241, PIA: 198 }, 13);
    // 43 / 13 = 3.307... -> the leader also scores, so this is an OUT-SCORING rate.
    expect(pia.requiredRate).toBe(3.3);
  });

  it("gives the leader no rate", () => {
    const [ver] = buildStandings({ VER: 241, PIA: 198 }, 13);
    expect(ver.requiredRate).toBeNull();
    expect(ver.gap).toBe(0);
  });

  it("has no rate once the season is over", () => {
    const rows = buildStandings({ VER: 241, PIA: 198 }, 0);
    expect(rows.every((r) => r.requiredRate === null)).toBe(true);
  });

  it("shares a rank on equal points and never invents an order", () => {
    const rows = buildStandings({ VER: 200, PIA: 200, NOR: 150 }, 5);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(rows[0].gap).toBe(0);
    expect(rows[1].gap).toBe(0);
  });

  it("returns nothing for an empty table rather than throwing", () => {
    expect(buildStandings({}, 13)).toEqual([]);
  });

  it("treats a negative remaining-round count as no rounds left", () => {
    const rows = buildStandings({ VER: 241, PIA: 198 }, -1);
    expect(rows.every((r) => r.requiredRate === null)).toBe(true);
  });
});

describe("isStandingsFile", () => {
  const wellFormed = {
    year: 2026,
    throughGp: "Hungary",
    throughRound: 11,
    totalRounds: 24,
    remainingRounds: 13,
    drivers: { VER: 241 },
    teams: { McLaren: 385 },
  };

  it("accepts a well-formed payload", () => {
    expect(isStandingsFile(wellFormed)).toBe(true);
  });

  it("rejects null", () => {
    expect(isStandingsFile(null)).toBe(false);
  });

  it("rejects a payload with a string where a number belongs", () => {
    expect(isStandingsFile({ ...wellFormed, throughRound: "11" })).toBe(false);
  });

  it("rejects a payload whose drivers map holds a non-numeric value", () => {
    expect(
      isStandingsFile({ ...wellFormed, drivers: { VER: "241" } }),
    ).toBe(false);
  });
});
