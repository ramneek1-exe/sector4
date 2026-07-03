import { describe, it, expect, test } from "vitest";
import {
  generateNarrative,
  generatePaceNarrative,
  generateStrategyNarrative,
  strategyLede,
  compoundLede,
  type PaceFacts,
  type StrategyFacts,
  type CompoundFacts,
} from "./narrative";

const fakeClient = (text: string) => ({
  messages: { create: async () => ({ content: [{ type: "text", text }] }) },
}) as any;

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

describe("generateNarrative", () => {
  it("passes only the provided facts and returns the text", async () => {
    let seen: any;
    const client = {
      messages: {
        create: async (args: any) => {
          seen = args;
          return { content: [{ type: "text", text: "Monaco loses about 19.5s in the pit lane. Its short pit lane is offset by the reduced 60 kph limit." }] };
        },
      },
    };
    const facts = { stat: "pit_loss", gp: "Monaco", value: 19.5, units: "s", source: "curated track features" };
    const out = await generateNarrative(client, facts);

    expect(out).toContain("19.5");
    // The facts JSON must be present in the user content (grounding).
    const userMsg = seen.messages.find((m: any) => m.role === "user");
    expect(userMsg.content).toContain("19.5");
    expect(userMsg.content).toContain("Monaco");
    // A do-not-invent constraint must be present in the system prompt.
    expect(seen.system.toLowerCase()).toContain("only");
  });
});

describe("generatePaceNarrative", () => {
  it("returns the model's text", async () => {
    const out = await generatePaceNarrative(fakeClient("NOR holds a small long-run edge."), PACE);
    expect(out).toBe("NOR holds a small long-run edge.");
  });
});

describe("generateStrategyNarrative", () => {
  it("returns the model's text", async () => {
    const out = await generateStrategyNarrative(fakeClient("Bahrain leans two-stop."), STRATEGY);
    expect(out).toBe("Bahrain leans two-stop.");
  });
});

test("actual mode ledes with what happened", () => {
  const f = { year: 2026, gp: "Austria", mode: "actual" as const, qualitative: false, sc_caveat: "",
    stops_min: 1, stops_max: 3, dominant: { n_stops: 2, share: 0.7, n_drivers: 20 }, drivers: [] };
  expect(strategyLede(f)).toMatch(/most drivers ran 2 stops/i);
});

test("historical mode ledes with the norm", () => {
  const f = { year: 2026, gp: "Great Britain", mode: "historical" as const, qualitative: false, sc_caveat: "",
    n_seasons: 3, dominant: { n_stops: 2, share: null, n_drivers: null }, drivers: [] };
  expect(strategyLede(f)).toMatch(/usually a 2-stop/i);
});

const base: CompoundFacts = { year: 2026, gp: "Italy", compound: "MEDIUM", basis_year: 2025 };

describe("compoundLede", () => {
  it("names the historical dominant compound in lower case", () => {
    const s = compoundLede(base);
    expect(s).toContain("Italy");
    expect(s).toContain("medium");
    expect(s).not.toContain("—"); // no em-dash
  });

  it("degrades honestly when there is no history", () => {
    const s = compoundLede({ ...base, compound: null, basis_year: null });
    expect(s.toLowerCase()).toContain("enough history");
  });
});
