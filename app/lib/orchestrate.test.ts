import { describe, it, expect } from "vitest";
import { answerQuery, type AnswerDeps } from "./orchestrate";
import type { PodiumFacts, PaceFacts, StrategyFacts, CompoundFacts } from "./narrative";
import type { StandingsFile } from "./championship";

const FACTS = { stat: "pit_loss", gp: "Monaco", value: 19.5, units: "s", source: "curated track features" };

const PODIUM: PodiumFacts = {
  year: 2024,
  gp: "Italy",
  mode: "saturday",
  qualitative: true,
  calibrated: false,
  n_train_races: 12,
  drivers: [
    { driver: "NOR", team: "McLaren", band: "strong", p_podium: 0.86, rank: 1 },
    { driver: "PIA", team: "McLaren", band: "strong", p_podium: 0.76, rank: 2 },
  ],
};

const PACE: PaceFacts = {
  year: 2024, gp: "Italy", qualitative: false, n_train_races: 12,
  drivers: [{ driver: "NOR", team: "McLaren", pace_delta_s: -0.21, uncertainty_s: 0.08 }],
};

const STRATEGY: StrategyFacts = {
  year: 2024, gp: "Bahrain", qualitative: false, n_train_races: 12,
  sc_caveat: "Stop-count edge is measured on a dry, safety-car-clean backtest…",
  dominant: { n_stops: 2, share: 0.75, n_drivers: 20 },
  drivers: [{ driver: "VER", team: "Red Bull Racing", n_stops: 2, confidence: 0.7 }],
};

const COMPOUND: CompoundFacts = {
  year: 2024, gp: "Bahrain", compound: "MEDIUM", basis_year: 2023,
};

const STANDINGS: StandingsFile = {
  year: 2026,
  throughGp: "Great Britain",
  throughRound: 12,
  totalRounds: 24,
  remainingRounds: 12,
  drivers: { VER: 255, NOR: 230 },
  teams: { "Red Bull Racing": 300, McLaren: 410 },
  driverTeams: { VER: "Red Bull Racing", NOR: "McLaren" },
};

// A well-formed file from an older emitter that hasn't picked up driverTeams yet -- the
// normal degrade-to-grey case, not a malformed payload.
const STANDINGS_NO_DRIVER_TEAMS: StandingsFile = {
  year: 2026,
  throughGp: "Great Britain",
  throughRound: 12,
  totalRounds: 24,
  remainingRounds: 12,
  drivers: { VER: 255, NOR: 230 },
  teams: { "Red Bull Racing": 300, McLaren: 410 },
};

function deps(over: Partial<AnswerDeps> = {}): AnswerDeps {
  return {
    parse: async () => ({ intent: "lookup_stat", stat: "pit_loss", gp: "Monaco" }),
    lookup: async () => FACTS,
    narrate: async () => "Monaco loses about 19.5s.",
    predictPodium: async () => PODIUM,
    narratePodium: async () => "NOR is the strongest podium pick at Monza.",
    grid: () => undefined, // hermetic default; override per-test to exercise sharpening

    predictPace: async () => PACE,
    narratePace: async () => "NOR holds a small long-run edge.",
    predictStrategy: async () => STRATEGY,
    narrateStrategy: async () => "Bahrain leans two-stop.",
    predictCompound: async () => COMPOUND,
    narrateCompound: async () => "Bahrain has historically favored the medium.",
    narrateChampionship: async () => "VER leads on 255 points, 25 clear of NOR.",
    loadStandings: () => STANDINGS,
    ...over,
  };
}

describe("answerQuery", () => {
  it("returns a supported answer for a pit_loss lookup", async () => {
    const out = await answerQuery(deps(), "pit lane Monaco?");
    // Circuits with an entity what get allowlisted `context` attached (varies with the
    // regenerated data), so assert the stable core rather than deep-equalling the object.
    expect(out.supported).toBe(true);
    if (out.supported && "facts" in out) {
      expect(out.facts.value).toBe(19.5);
      expect(out.facts.gp).toBe("Monaco");
      expect(out.narrative).toBe("Monaco loses about 19.5s.");
    }
  });

  it("returns an honest unsupported message for unhandled intents", async () => {
    // lookup_stat with a stat outside LOOKUP_STATS falls through every routed branch.
    const out = await answerQuery(
      deps({ parse: async () => ({ intent: "lookup_stat", stat: "unknown_stat", gp: "Monaco" }) }),
      "some unrouted stat?",
    );
    expect(out.supported).toBe(false);
    if (!out.supported) expect(out.message).toMatch(/podium prediction/i);
  });

  it("routes a compound question to a supported compound answer", async () => {
    const out = await answerQuery(
      deps({ parse: async () => ({ intent: "predict_compound", gp: "Bahrain", year: 2024 }) }),
      "what tyre is usually dominant at Bahrain?",
    );
    expect(out.supported).toBe(true);
    if (out.supported && "compound" in out) {
      expect(out.compound.compound).toBe("MEDIUM");
      expect(out.narrative).toBe("Bahrain has historically favored the medium.");
    }
  });

  it("routes explain_concept to a concept answer without calling lookup", async () => {
    let called = false;
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "explain_concept" }),
        lookup: async () => {
          called = true;
          return FACTS;
        },
      }),
      "what is DRS?",
    );
    expect(out.supported).toBe(true);
    expect(out).toHaveProperty("concept");
    expect(called).toBe(false);
  });

  it("explain_concept with no recognizable term is unsupported", async () => {
    const out = await answerQuery(
      deps({ parse: async () => ({ intent: "explain_concept" }) }),
      "what is the airspeed velocity of an unladen swallow?",
    );
    expect(out.supported).toBe(false);
  });

  it("resolves a relative circuit for a stat lookup (pit loss at the next race)", async () => {
    let askedGp = "";
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "lookup_stat", stat: "pit_loss", gp: "next race" }),
        lookup: async (_stat, gp) => {
          askedGp = gp;
          return { ...FACTS, gp };
        },
        upcomingRace: () => ({ year: 2026, gp: "Great Britain" }),
      }),
      "pit lane time loss at the next race?",
    );
    expect(out.supported).toBe(true);
    expect(askedGp).toBe("Great Britain");
  });

  it("routes a podium question to a supported podium answer (normalizing the circuit)", async () => {
    let askedYear = 0;
    let askedGp = "";
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_podium", gp: "Monza", year: 2024 }),
        predictPodium: async (year, gp) => {
          askedYear = year;
          askedGp = gp;
          return PODIUM;
        },
      }),
      "who podiums at Monza in 2024?",
    );
    expect(askedYear).toBe(2024);
    expect(askedGp).toBe("Italy"); // Monza -> Italy
    // Italy has an entity what, so `context` is attached; assert the stable core.
    expect(out.supported).toBe(true);
    if (out.supported && "podium" in out) {
      expect(out.podium.drivers).toEqual(PODIUM.drivers);
      expect(out.narrative).toBe("NOR is the strongest podium pick at Monza.");
    }
  });

  it("defaults the year to the live 2026 season when the podium question names none", async () => {
    let askedYear = 0;
    await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_podium", gp: "Italy" }),
        predictPodium: async (year) => {
          askedYear = year;
          return PODIUM;
        },
      }),
      "who podiums at Monza?",
    );
    expect(askedYear).toBe(2026);
  });

  it("resolves a relative 'next race' podium question to the upcoming weekend", async () => {
    let askedYear = 0;
    let askedGp = "";
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_podium", gp: "next race" }),
        upcomingRace: () => ({ year: 2026, gp: "Austria" }),
        predictPodium: async (year, gp) => { askedYear = year; askedGp = gp; return PODIUM; },
      }),
      "who's gonna be on the podium at the next race?",
    );
    expect(askedYear).toBe(2026);
    expect(askedGp).toBe("Austria");
    expect(out.supported).toBe(true);
  });

  it("forwards the qualifying grid to the podium predictor (post-quali sharpening)", async () => {
    let askedGrid: Record<string, number> | undefined;
    await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_podium", gp: "Austria", year: 2026 }),
        grid: () => ({ RUS: 1, LEC: 2 }),
        predictPodium: async (_y, _g, grid) => { askedGrid = grid; return PODIUM; },
      }),
      "who podiums at Austria?",
    );
    expect(askedGrid).toEqual({ RUS: 1, LEC: 2 });
  });

  it("passes no grid pre-quali so the podium stays in honest Friday mode", async () => {
    let called = false;
    let askedGrid: Record<string, number> | undefined = { sentinel: 0 };
    await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_podium", gp: "Austria", year: 2026 }),
        grid: () => undefined,
        predictPodium: async (_y, _g, grid) => { called = true; askedGrid = grid; return PODIUM; },
      }),
      "who podiums at Austria?",
    );
    expect(called).toBe(true);
    expect(askedGrid).toBeUndefined();
  });

  it("attaches curated circuit context to the facts handed to the narrator", async () => {
    let narrated: PodiumFacts | undefined;
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_podium", gp: "Red Bull Ring", year: 2026 }),
        predictPodium: async () => ({ ...PODIUM, gp: "Austria" }),
        narratePodium: async (facts) => { narrated = facts; return "grounded narrative"; },
      }),
      "who podiums in Austria?",
    );
    // Austria has an entity what (entity-whats.json), so context flows through (capped at 2).
    expect(narrated?.context?.length).toBe(2);
    expect(out.supported).toBe(true);
    if (out.supported && "podium" in out) expect(out.podium.context?.length).toBe(2);
  });

  it("falls back to the upcoming weekend when a prediction names no circuit", async () => {
    let askedGp = "";
    await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_podium" }),
        upcomingRace: () => ({ year: 2026, gp: "Austria" }),
        predictPodium: async (_y, gp) => { askedGp = gp; return PODIUM; },
      }),
      "who's gonna podium?",
    );
    expect(askedGp).toBe("Austria");
  });

  it("rejects a podium circuit outside the calendar without calling inference", async () => {
    let called = false;
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_podium", gp: "Sochi" }),
        predictPodium: async () => {
          called = true;
          return PODIUM;
        },
      }),
      "who podiums at Sochi?",
    );
    expect(out.supported).toBe(false);
    expect(called).toBe(false);
    if (!out.supported) expect(out.message).toMatch(/supported circuits/i);
  });

  it("routes a pace question to a supported pace answer (normalizing the circuit)", async () => {
    let askedGp = "";
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_pace", gp: "Monza", year: 2024 }),
        predictPace: async (_y, gp) => { askedGp = gp; return PACE; },
      }),
      "long run pace at Monza 2024?",
    );
    expect(askedGp).toBe("Italy");
    expect(out.supported).toBe(true);
    if (out.supported && "pace" in out) expect(out.narrative).toMatch(/long-run/);
  });

  it("routes a strategy question to a supported strategy answer", async () => {
    const out = await answerQuery(
      deps({ parse: async () => ({ intent: "predict_strategy", gp: "Bahrain", year: 2024 }) }),
      "how many stops at Bahrain 2024?",
    );
    expect(out.supported).toBe(true);
    if (out.supported && "strategy" in out) expect(out.strategy.sc_caveat).toBeTruthy();
  });

  it("routes a tyre-deg lookup through the lookup path", async () => {
    let askedStat = "";
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "lookup_stat", stat: "tyre_deg", gp: "Bahrain" }),
        lookup: async (stat) => { askedStat = stat; return { stat, gp: "Bahrain", value: 0.12, units: "s/lap", source: "FP long-run Theil-Sen deg" }; },
      }),
      "how fast do tyres wear at Bahrain?",
    );
    expect(askedStat).toBe("tyre_deg");
    expect(out.supported).toBe(true);
  });

  it("rejects a deg lookup for Monaco (not in the strategy slice)", async () => {
    let called = false;
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "lookup_stat", stat: "tyre_deg", gp: "Monaco" }),
        lookup: async () => { called = true; return FACTS; },
      }),
      "tyre deg at Monaco?",
    );
    expect(out.supported).toBe(false);
    expect(called).toBe(false);
  });

  it("passes grid_context through to the podium facts", async () => {
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_podium", gp: "Italy", year: 2024 }),
        predictPodium: async () => ({
          ...PODIUM,
          grid_context: "This is one of the hardest circuits to overtake on, so a front-row start counts for more than usual here.",
        }),
      }),
      "who podiums at Monza?",
    );
    expect(out.supported).toBe(true);
    if (out.supported && "podium" in out) {
      expect(out.podium.grid_context).toContain("front-row start counts for more");
    }
  });

  it("returns an honest unavailable message when standings are absent", async () => {
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "championship_picture" }),
        loadStandings: () => null,
      }),
      "who leads the championship?",
    );
    expect(out.supported).toBe(false);
    if (!out.supported) expect(out.message).toBe("I don't have the current championship standings yet.");
  });

  it("routes a championship question to the computed facts and narrative", async () => {
    const out = await answerQuery(
      deps({ parse: async () => ({ intent: "championship_picture" }) }),
      "who leads the championship?",
    );
    expect(out.supported).toBe(true);
    if (out.supported && "championship" in out) {
      expect(out.championship.year).toBe(2026);
      expect(out.championship.throughGp).toBe("Great Britain");
      expect(out.championship.remainingRounds).toBe(12);
      expect(out.championship.totalRounds).toBe(24);
      expect(out.championship.rows[0]).toEqual({ key: "VER", points: 255, rank: 1, gap: 0, requiredRate: null });
      expect(out.narrative).toBe("VER leads on 255 points, 25 clear of NOR.");
    }
  });

  it("threads driverTeams through from the loaded standings file into the facts", async () => {
    const out = await answerQuery(
      deps({ parse: async () => ({ intent: "championship_picture" }) }),
      "who leads the championship?",
    );
    expect(out.supported).toBe(true);
    if (out.supported && "championship" in out) {
      expect(out.championship.driverTeams).toEqual({ VER: "Red Bull Racing", NOR: "McLaren" });
    }
  });

  it("still produces rows when the standings file has no driverTeams map (degrades to grey, drops nothing)", async () => {
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "championship_picture" }),
        loadStandings: () => STANDINGS_NO_DRIVER_TEAMS,
      }),
      "who leads the championship?",
    );
    expect(out.supported).toBe(true);
    if (out.supported && "championship" in out) {
      expect(out.championship.driverTeams).toBeUndefined();
      expect(out.championship.rows.map((r) => r.key)).toEqual(["VER", "NOR"]);
    }
  });

  it("is season-scoped: does not resolve a gp or call the upcoming-race resolver", async () => {
    let upcomingCalled = false;
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "championship_picture" }), // no gp, unlike every other intent
        upcomingRace: () => {
          upcomingCalled = true;
          return { year: 2026, gp: "Austria" };
        },
      }),
      "how far back is NOR in the championship?",
    );
    expect(upcomingCalled).toBe(false);
    expect(out.supported).toBe(true);
  });

  it("excludes a driver absent from drivers.json, so the narrative cannot name a row the table hides", async () => {
    // The facts feed BOTH the lede/narrative and the rendered table. Filtering only at render
    // time let the prose mention a driver the table had dropped; the filter belongs here.
    const withUnknown: StandingsFile = {
      ...STANDINGS,
      drivers: { VER: 255, NOR: 230, ZZZ: 40 },
    };
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "championship_picture" }),
        loadStandings: () => withUnknown,
      }),
      "who leads the championship?",
    );
    if (out.supported && "championship" in out) {
      expect(out.championship.rows.map((r) => r.key)).toEqual(["VER", "NOR"]);
      expect(out.championship.rows.some((r) => r.key === "ZZZ")).toBe(false);
    } else {
      throw new Error("expected a supported championship answer");
    }
  });
});
