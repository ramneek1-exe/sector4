import type { ParsedQuery } from "./parser";
import type { StatFacts, PodiumFacts, PaceFacts, StrategyFacts } from "./narrative";
import { normalizeCircuit, normalizeLookupCircuit, DEFAULT_YEAR } from "./circuits";
import { isRelativeCircuit, nextRace, type UpcomingRace } from "./next-race";
import { getCircuitFacts } from "./circuit-facts";
import { getGrid, type Grid } from "./grid";

// Year used when a prediction question names no season — the live beta season (2026).
const LOOKUP_STATS = ["pit_loss", "tyre_deg", "stint_length"];

// Curated, allowlisted circuit facts (app/data/circuit-facts.json) the narrative may draw
// ONE detail from — the only outside-the-numbers material allowed (PRD: no invented facts).
// Capped at 2 to keep the prompt tight; empty for circuits we haven't authored yet.
const CONTEXT_LIMIT = 2;

// Attach curated circuit context (if we have any) without mutating the source object.
// No-op when none exists, so facts for un-authored circuits round-trip unchanged.
function withContext<T extends { context?: string[] }>(facts: T, gp: string): T {
  const context = getCircuitFacts(gp).slice(0, CONTEXT_LIMIT);
  return context.length ? { ...facts, context } : facts;
}

export type AnswerDeps = {
  parse: (query: string) => Promise<ParsedQuery>;
  lookup: (stat: string, gp: string, year?: number) => Promise<StatFacts>;
  narrate: (facts: StatFacts) => Promise<string>;
  predictPodium: (year: number, gp: string, grid?: Grid) => Promise<PodiumFacts>;
  // Resolves a weekend's qualifying grid (post-quali) so user-facing podium queries
  // sharpen too; injectable for tests, defaults to the committed grids.json.
  grid?: (year: number, gp: string) => Grid | undefined;
  narratePodium: (facts: PodiumFacts) => Promise<string>;
  predictPace: (year: number, gp: string) => Promise<PaceFacts>;
  narratePace: (facts: PaceFacts) => Promise<string>;
  predictStrategy: (year: number, gp: string) => Promise<StrategyFacts>;
  narrateStrategy: (facts: StrategyFacts) => Promise<string>;
  // Resolves "the next race" / "this weekend" to a concrete upcoming GP. Injectable
  // for deterministic tests; defaults to the live weekend schedule.
  upcomingRace?: () => UpcomingRace;
};

// Resolve a prediction's target (year + canonical circuit). A relative reference
// ("the next race") or a missing circuit on a prediction intent both resolve to the
// upcoming weekend; a named circuit is normalized; an unknown named circuit -> null.
function resolveTarget(
  parsed: ParsedQuery,
  upcoming: () => UpcomingRace,
): { gp: string; year: number } | null {
  if (!parsed.gp || isRelativeCircuit(parsed.gp)) {
    const r = upcoming();
    return { gp: r.gp, year: parsed.year ?? r.year };
  }
  const gp = normalizeCircuit(parsed.gp);
  if (!gp) return null;
  return { gp, year: parsed.year ?? DEFAULT_YEAR };
}

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
  `Predictions cover the validated dry-weekend circuits plus the live 2026 calendar; ` +
  `“${raw}” isn’t one of the supported circuits yet.`;

const unsupportedLookup = (raw: string) =>
  `That stat isn’t available for “${raw}” yet — supported circuits are the 8 dry-weekend ` +
  `tracks (plus Monaco for pit-lane time loss).`;

export async function answerQuery(deps: AnswerDeps, query: string): Promise<Answer> {
  const parsed = await deps.parse(query);
  const upcoming = deps.upcomingRace ?? nextRace;

  if (parsed.intent === "lookup_stat" && parsed.stat && LOOKUP_STATS.includes(parsed.stat) && parsed.gp) {
    const gp = normalizeLookupCircuit(parsed.gp, parsed.stat);
    if (!gp) return { supported: false, message: unsupportedLookup(parsed.gp) };
    const base = await deps.lookup(parsed.stat, gp, parsed.year);
    const facts = withContext(base, gp);
    const narrative = await deps.narrate(facts);
    return { supported: true, facts, narrative };
  }

  if (parsed.intent === "predict_podium") {
    const target = resolveTarget(parsed, upcoming);
    if (!target) return { supported: false, message: unsupportedSlice(parsed.gp ?? "") };
    // Pass the grid when quali has run so the podium sharpens; undefined -> Friday bands.
    const grid = (deps.grid ?? getGrid)(target.year, target.gp);
    const podium = withContext(
      await deps.predictPodium(target.year, target.gp, grid),
      target.gp,
    );
    const narrative = await deps.narratePodium(podium);
    return { supported: true, podium, narrative };
  }

  if (parsed.intent === "predict_pace") {
    const target = resolveTarget(parsed, upcoming);
    if (!target) return { supported: false, message: unsupportedSlice(parsed.gp ?? "") };
    const pace = withContext(await deps.predictPace(target.year, target.gp), target.gp);
    const narrative = await deps.narratePace(pace);
    return { supported: true, pace, narrative };
  }

  if (parsed.intent === "predict_strategy") {
    const target = resolveTarget(parsed, upcoming);
    if (!target) return { supported: false, message: unsupportedSlice(parsed.gp ?? "") };
    const strategy = withContext(await deps.predictStrategy(target.year, target.gp), target.gp);
    const narrative = await deps.narrateStrategy(strategy);
    return { supported: true, strategy, narrative };
  }

  return { supported: false, message: UNSUPPORTED };
}
