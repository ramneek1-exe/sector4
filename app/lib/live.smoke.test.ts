// Live smoke test for the M2 LLM layer — makes REAL Haiku calls.
// Skipped unless ANTHROPIC_API_KEY is in the environment, so normal `npm test`
// and CI stay offline/free. Run it deliberately with a key:
//   set -a; source .env.local; set +a; npx vitest run app/lib/live.smoke.test.ts
import { describe, it, expect } from "vitest";
import { getClient } from "./anthropic";
import { parseQuery } from "./parser";
import { generateNarrative } from "./narrative";

const hasKey = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!hasKey)("live Haiku layer (M2 gate)", () => {
  it("parser routes the Monaco pit-lane question to lookup_stat/pit_loss/Monaco", async () => {
    const parsed = await parseQuery(getClient(), "How much time is lost in the pit lane at Monaco?");
    expect(parsed.intent).toBe("lookup_stat");
    expect(parsed.stat).toBe("pit_loss");
    expect(parsed.gp).toMatch(/monaco/i);
  }, 30_000);

  it("narrative is grounded — states the given 19.5s value and circuit", async () => {
    const facts = { stat: "pit_loss", gp: "Monaco", value: 19.5, units: "s", source: "curated track features" };
    const narrative = await generateNarrative(getClient(), facts);
    expect(narrative.length).toBeGreaterThan(0);
    expect(narrative).toContain("19.5");
    expect(narrative).toMatch(/monaco/i);
  }, 30_000);
});
