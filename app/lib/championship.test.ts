import { describe, expect, it } from "vitest";
import { buildStandings, isStandingsFile, loadStandings, championshipLede } from "@/app/lib/championship";

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

  it("clamps remaining rounds to a non-negative whole number", () => {
    const negative = buildStandings({ VER: 241, PIA: 198 }, -1);
    expect(negative.every((r) => r.requiredRate === null)).toBe(true);

    // 43 / 13.7 would round to 3.1 if the fraction were used as-is; the clamp floors to
    // 13 whole rounds, which is what makes 3.3 the right out-scoring rate here. A test that
    // only checks the negative case above passes identically with or without the floor, so
    // this fractional case is the one that actually pins Math.floor.
    const [, pia] = buildStandings({ VER: 241, PIA: 198 }, 13.7);
    expect(pia.requiredRate).toBe(3.3);
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

  it("rejects a payload whose drivers map is an array, not a keyed object", () => {
    // typeof [] === "object" and Object.values on an array is just its elements, so without
    // an explicit Array.isArray guard this slips through and buildStandings then keys
    // entries by array index ("0", "1") instead of driver codes -- silent garbage instead
    // of the documented null/"section does not render" behaviour.
    expect(isStandingsFile({ ...wellFormed, drivers: [241, 198] })).toBe(false);
  });

  it("rejects a payload whose teams map is an array, not a keyed object", () => {
    expect(isStandingsFile({ ...wellFormed, teams: [385, 300] })).toBe(false);
  });

  it("accepts a payload with a present, well-formed driverTeams map", () => {
    expect(
      isStandingsFile({ ...wellFormed, driverTeams: { VER: "Red Bull Racing" } }),
    ).toBe(true);
  });

  it("accepts a payload with no driverTeams map at all", () => {
    // Optional field: an older emitter's payload (no driverTeams key) must still validate --
    // absence degrades to grey helmets, not to the whole section vanishing.
    expect(isStandingsFile(wellFormed)).toBe(true);
    expect("driverTeams" in wellFormed).toBe(false);
  });

  it("rejects a payload whose driverTeams map is an array, not a keyed object", () => {
    expect(
      isStandingsFile({ ...wellFormed, driverTeams: ["Red Bull Racing", "McLaren"] }),
    ).toBe(false);
  });

  it("rejects a payload whose driverTeams map holds a non-string value", () => {
    expect(isStandingsFile({ ...wellFormed, driverTeams: { VER: 1 } })).toBe(false);
  });
});

describe("loadStandings", () => {
  it("returns null when the standings file is absent, rather than throwing", () => {
    // app/data/standings.json does not exist yet -- this is the normal pre-first-run state
    // until the weekend batch job first writes it. This exercises the real absent-file path,
    // unmocked.
    expect(loadStandings()).toBeNull();
  });

  // A second case simulating a present, well-formed file was attempted with vi.doMock /
  // dynamic re-import, but loadStandings's require() call resolves through real Node module
  // resolution rather than Vitest's mock-aware module graph -- the mock is silently ignored
  // and the call still throws (caught, returning null) because plain Node require() has no
  // "@/" alias to resolve against. That mechanism is only wired up by Next's webpack build
  // (see next.config path aliasing via tsconfig "paths"), not by this test runtime, so it
  // isn't practical to simulate the present-file path from this file. Per the task brief's
  // own fallback: covering the null path only, and saying so explicitly here.
});

describe("championshipLede", () => {
  // The championship_picture /ask intent's deterministic one-liner. Lives in this file (not
  // narrative.ts, which pulls in the Anthropic SDK) so it's safe to share between the
  // narrative generator's system prompt and the /ask client UI with no drift.
  it("names the leader and the gap to second", () => {
    const rows = buildStandings({ VER: 255, NOR: 230 }, 12);
    const s = championshipLede({ year: 2026, remainingRounds: 12, totalRounds: 24, rows });
    expect(s).toBe("VER leads the 2026 championship on 255 points, 25 clear of NOR with 12 of 24 rounds left.");
  });

  it("degrades honestly when standings are empty", () => {
    const s = championshipLede({ year: 2026, remainingRounds: 12, totalRounds: 24, rows: [] });
    expect(s).toBe("Championship standings are not available yet.");
  });

  it("handles a single-row table (no second place) without a gap clause", () => {
    const rows = buildStandings({ VER: 255 }, 12);
    const s = championshipLede({ year: 2026, remainingRounds: 12, totalRounds: 24, rows });
    expect(s).toBe("VER leads the 2026 championship on 255 points.");
  });
});
