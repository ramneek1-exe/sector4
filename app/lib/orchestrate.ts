import type { ParsedQuery } from "./parser";
import type { StatFacts, PodiumFacts } from "./narrative";
import { normalizeCircuit } from "./circuits";

// Year used when a podium question names no season. 2024 has all 8 circuits with a
// real (non-warmup) prediction, so it's the safest default for this historical slice.
const DEFAULT_PODIUM_YEAR = 2024;

export type AnswerDeps = {
  parse: (query: string) => Promise<ParsedQuery>;
  lookup: (stat: string, gp: string) => Promise<StatFacts>;
  narrate: (facts: StatFacts) => Promise<string>;
  predictPodium: (year: number, gp: string) => Promise<PodiumFacts>;
  narratePodium: (facts: PodiumFacts) => Promise<string>;
};

export type Answer =
  | { supported: true; facts: StatFacts; narrative: string }
  | { supported: true; podium: PodiumFacts; narrative: string }
  | { supported: false; message: string };

const UNSUPPORTED =
  "This early slice answers two things: pit-lane time-loss lookups (e.g. “How much time " +
  "is lost in the pit lane at Monaco?”) and podium predictions (e.g. “Who’s likely to " +
  "podium at the 2024 Italian Grand Prix?”).";

const unsupportedCircuit = (raw: string) =>
  `Podium predictions only cover these 8 circuits for 2024–25: Bahrain, Saudi Arabia, ` +
  `Spain, Hungary, Italy, Mexico City, Las Vegas, Abu Dhabi. “${raw}” isn’t one of them yet.`;

export async function answerQuery(deps: AnswerDeps, query: string): Promise<Answer> {
  const parsed = await deps.parse(query);

  if (parsed.intent === "lookup_stat" && parsed.stat === "pit_loss" && parsed.gp) {
    const facts = await deps.lookup(parsed.stat, parsed.gp);
    const narrative = await deps.narrate(facts);
    return { supported: true, facts, narrative };
  }

  if (parsed.intent === "predict_podium" && parsed.gp) {
    const gp = normalizeCircuit(parsed.gp);
    if (!gp) return { supported: false, message: unsupportedCircuit(parsed.gp) };
    const year = parsed.year ?? DEFAULT_PODIUM_YEAR;
    const podium = await deps.predictPodium(year, gp);
    const narrative = await deps.narratePodium(podium);
    return { supported: true, podium, narrative };
  }

  return { supported: false, message: UNSUPPORTED };
}
