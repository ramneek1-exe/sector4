import type { ParsedQuery } from "./parser";
import type { StatFacts, PodiumFacts, PaceFacts, StrategyFacts } from "./narrative";
import { normalizeCircuit, normalizeLookupCircuit } from "./circuits";

// Year used when a prediction question names no season. 2024 has all 8 circuits with a
// real (non-warmup) prediction, so it's the safest default for this historical slice.
const DEFAULT_YEAR = 2024;
const LOOKUP_STATS = ["pit_loss", "tyre_deg", "stint_length"];

export type AnswerDeps = {
  parse: (query: string) => Promise<ParsedQuery>;
  lookup: (stat: string, gp: string) => Promise<StatFacts>;
  narrate: (facts: StatFacts) => Promise<string>;
  predictPodium: (year: number, gp: string) => Promise<PodiumFacts>;
  narratePodium: (facts: PodiumFacts) => Promise<string>;
  predictPace: (year: number, gp: string) => Promise<PaceFacts>;
  narratePace: (facts: PaceFacts) => Promise<string>;
  predictStrategy: (year: number, gp: string) => Promise<StrategyFacts>;
  narrateStrategy: (facts: StrategyFacts) => Promise<string>;
};

export type Answer =
  | { supported: true; facts: StatFacts; narrative: string }
  | { supported: true; podium: PodiumFacts; narrative: string }
  | { supported: true; pace: PaceFacts; narrative: string }
  | { supported: true; strategy: StrategyFacts; narrative: string }
  | { supported: false; message: string };

const UNSUPPORTED =
  "Try a podium prediction (e.g. “Who’s likely to podium at the 2024 Italian Grand Prix?”), " +
  "long-run pace gaps, a stop-count strategy call, or a stat lookup (pit-lane time loss, tyre " +
  "degradation, or stint length) for one of the supported circuits.";

const unsupportedSlice = (raw: string) =>
  `Predictions cover these 8 circuits for 2024–25: Bahrain, Saudi Arabia, Spain, Hungary, ` +
  `Italy, Mexico City, Las Vegas, Abu Dhabi. “${raw}” isn’t one of them yet.`;

const unsupportedLookup = (raw: string) =>
  `That stat isn’t available for “${raw}” yet — supported circuits are the 8 dry-weekend ` +
  `tracks (plus Monaco for pit-lane time loss).`;

export async function answerQuery(deps: AnswerDeps, query: string): Promise<Answer> {
  const parsed = await deps.parse(query);

  if (parsed.intent === "lookup_stat" && parsed.stat && LOOKUP_STATS.includes(parsed.stat) && parsed.gp) {
    const gp = normalizeLookupCircuit(parsed.gp, parsed.stat);
    if (!gp) return { supported: false, message: unsupportedLookup(parsed.gp) };
    const facts = await deps.lookup(parsed.stat, gp);
    const narrative = await deps.narrate(facts);
    return { supported: true, facts, narrative };
  }

  if (parsed.intent === "predict_podium" && parsed.gp) {
    const gp = normalizeCircuit(parsed.gp);
    if (!gp) return { supported: false, message: unsupportedSlice(parsed.gp) };
    const podium = await deps.predictPodium(parsed.year ?? DEFAULT_YEAR, gp);
    const narrative = await deps.narratePodium(podium);
    return { supported: true, podium, narrative };
  }

  if (parsed.intent === "predict_pace" && parsed.gp) {
    const gp = normalizeCircuit(parsed.gp);
    if (!gp) return { supported: false, message: unsupportedSlice(parsed.gp) };
    const pace = await deps.predictPace(parsed.year ?? DEFAULT_YEAR, gp);
    const narrative = await deps.narratePace(pace);
    return { supported: true, pace, narrative };
  }

  if (parsed.intent === "predict_strategy" && parsed.gp) {
    const gp = normalizeCircuit(parsed.gp);
    if (!gp) return { supported: false, message: unsupportedSlice(parsed.gp) };
    const strategy = await deps.predictStrategy(parsed.year ?? DEFAULT_YEAR, gp);
    const narrative = await deps.narrateStrategy(strategy);
    return { supported: true, strategy, narrative };
  }

  return { supported: false, message: UNSUPPORTED };
}
