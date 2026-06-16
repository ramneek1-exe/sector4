import { describe, it, expect } from "vitest";
import { answerQuery, type AnswerDeps } from "./orchestrate";
import type { PodiumFacts } from "./narrative";

const FACTS = { stat: "pit_loss", gp: "Monaco", value: 19.5, units: "s", source: "curated track features" };

const PODIUM: PodiumFacts = {
  year: 2024,
  gp: "Italy",
  mode: "saturday",
  qualitative: true,
  calibrated: false,
  n_train_races: 12,
  drivers: [
    { driver: "NOR", band: "strong", p_podium: 0.86, rank: 1 },
    { driver: "PIA", band: "strong", p_podium: 0.76, rank: 2 },
  ],
};

function deps(over: Partial<AnswerDeps> = {}): AnswerDeps {
  return {
    parse: async () => ({ intent: "lookup_stat", stat: "pit_loss", gp: "Monaco" }),
    lookup: async () => FACTS,
    narrate: async () => "Monaco loses about 19.5s.",
    predictPodium: async () => PODIUM,
    narratePodium: async () => "NOR is the strongest podium pick at Monza.",
    ...over,
  };
}

describe("answerQuery", () => {
  it("returns a supported answer for a pit_loss lookup", async () => {
    const out = await answerQuery(deps(), "pit lane Monaco?");
    expect(out).toEqual({ supported: true, facts: FACTS, narrative: "Monaco loses about 19.5s." });
  });

  it("returns an honest unsupported message for other intents", async () => {
    const out = await answerQuery(deps({ parse: async () => ({ intent: "predict_pace" }) }), "who wins?");
    expect(out.supported).toBe(false);
    if (!out.supported) expect(out.message).toMatch(/pit-lane/i);
  });

  it("does not call lookup or narrate when unsupported", async () => {
    let called = false;
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "explain_concept" }),
        lookup: async () => {
          called = true;
          return FACTS;
        },
      }),
      "what is deg?",
    );
    expect(out.supported).toBe(false);
    expect(called).toBe(false);
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

  it("defaults the year to 2024 when the podium question names none", async () => {
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
    expect(askedYear).toBe(2024);
  });

  it("rejects a podium circuit outside the 8-circuit slice without calling inference", async () => {
    let called = false;
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_podium", gp: "Monaco" }),
        predictPodium: async () => {
          called = true;
          return PODIUM;
        },
      }),
      "who podiums at Monaco?",
    );
    expect(out.supported).toBe(false);
    expect(called).toBe(false);
    if (!out.supported) expect(out.message).toMatch(/8 circuits/i);
  });
});
