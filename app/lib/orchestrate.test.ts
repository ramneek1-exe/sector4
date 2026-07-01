import { describe, it, expect } from "vitest";
import { answerQuery, type AnswerDeps } from "./orchestrate";
import type { PodiumFacts, PaceFacts, StrategyFacts } from "./narrative";

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
    ...over,
  };
}

describe("answerQuery", () => {
  it("returns a supported answer for a pit_loss lookup", async () => {
    const out = await answerQuery(deps(), "pit lane Monaco?");
    expect(out).toEqual({ supported: true, facts: FACTS, narrative: "Monaco loses about 19.5s." });
  });

  it("returns an honest unsupported message for unhandled intents", async () => {
    const out = await answerQuery(deps({ parse: async () => ({ intent: "predict_compound" }) }), "what compound?");
    expect(out.supported).toBe(false);
    if (!out.supported) expect(out.message).toMatch(/podium prediction/i);
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
    expect(out).toEqual({ supported: true, podium: PODIUM, narrative: "NOR is the strongest podium pick at Monza." });
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
    // Austria is authored in circuit-facts.json, so context flows through (capped at 2).
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
});
