import { describe, it, expect } from "vitest";
import { answerQuery, type AnswerDeps } from "./orchestrate";

const FACTS = { stat: "pit_loss", gp: "Monaco", value: 19.5, units: "s", source: "curated track features" };

function deps(over: Partial<AnswerDeps> = {}): AnswerDeps {
  return {
    parse: async () => ({ intent: "lookup_stat", stat: "pit_loss", gp: "Monaco" }),
    lookup: async () => FACTS,
    narrate: async () => "Monaco loses about 19.5s.",
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
    // narrow the discriminated union before reading `message`
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
});
