import type { ParsedQuery } from "./parser";
import type { StatFacts } from "./narrative";

export type AnswerDeps = {
  parse: (query: string) => Promise<ParsedQuery>;
  lookup: (stat: string, gp: string) => Promise<StatFacts>;
  narrate: (facts: StatFacts) => Promise<string>;
};

export type Answer =
  | { supported: true; facts: StatFacts; narrative: string }
  | { supported: false; message: string };

const UNSUPPORTED =
  "This early slice only answers pit-lane time-loss lookups — e.g. “How much time is lost in the pit lane at Monaco?”";

export async function answerQuery(deps: AnswerDeps, query: string): Promise<Answer> {
  const parsed = await deps.parse(query);
  if (parsed.intent !== "lookup_stat" || parsed.stat !== "pit_loss" || !parsed.gp) {
    return { supported: false, message: UNSUPPORTED };
  }
  const facts = await deps.lookup(parsed.stat, parsed.gp);
  const narrative = await deps.narrate(facts);
  return { supported: true, facts, narrative };
}
