import { HAIKU, type LlmClient } from "./anthropic";

// `context` (on every facts type) is a short array of curated, allowlisted circuit
// facts (app/data/circuit-facts.json) — the ONLY outside-the-numbers material a narrative
// may draw on. The prompts let the model add at most one sentence FROM that array, never
// from its own general knowledge, so explanations read smarter while staying grounded.
export type StatFacts = {
  stat: string;
  gp: string;
  value: number | null;
  units: string | null;
  source: string;
  year?: number | null; // season the value is from (pit_loss); latest by default
  insights?: string[]; // grounded one-liners computed from our data (e.g. calendar ranking)
  context?: string[];
};

const SYSTEM = [
  "You write a short, insightful two-to-three-sentence explanation for a single Formula 1 stat lookup.",
  "You may use ONLY the facts in the JSON the user provides (the stat, its value, units, year, any `insights`, and any `context`).",
  "Do not invent or estimate any numbers, drivers, teams, causes, or comparisons not present in that JSON.",
  "State the value and circuit plainly, then make it smarter by working in the provided `insights` (grounded facts like how much of a pit stop is stationary time, or how the circuit ranks on the calendar).",
  "If the JSON includes `context` (curated circuit facts), you MAY also weave in at most ONE short detail from it, only from the insights/context arrays, never your own outside knowledge.",
  "If the value is null, say plainly that this stat isn't available for this circuit yet; do not guess a number.",
  "Write in plain prose: never use em-dashes. Use commas, colons, or separate sentences instead.",
].join(" ");

export async function generateNarrative(client: LlmClient, facts: StatFacts): Promise<string> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 200,
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  return msg.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
}

// factors = the grounded signals the model actually used, surfaced so the narrative can
// explain the WHY (standings, recent form, track history, grid) instead of reciting odds.
export type PodiumFactors = {
  champ_rank: number; // championship position, 1 = leader
  recent_form_avg_finish: number; // mean finish over the last 3 races, lower = better
  track_pace_delta_s: number; // historical race-pace gap at THIS track, negative = faster
  grid?: number; // starting position (Saturday only)
};

export type PodiumDriver = {
  driver: string;
  team: string | null;
  band: string;
  p_podium: number;
  rank: number;
  factors?: PodiumFactors;
};

export type PodiumFacts = {
  year: number;
  gp: string;
  mode?: string;
  qualitative: boolean;
  calibrated: boolean;
  n_train_races?: number;
  reason?: string;
  drivers: PodiumDriver[];
  context?: string[];
};

const PODIUM_SYSTEM = [
  "You write a short, honest, insightful explanation (2-3 sentences) of a Formula 1 podium-probability prediction.",
  "Use ONLY the facts in the JSON. Each driver has a band, a p_podium probability, and `factors`, the real signals behind the call: champ_rank (championship position, 1 = leader), recent_form_avg_finish (mean finishing position over the last 3 races, lower = better), track_pace_delta_s (the driver's historical race-pace gap AT THIS TRACK in seconds, negative = faster than average), and grid (starting position, present once qualifying has happened).",
  "Lead with the 2-3 strongest contenders by three-letter code and EXPLAIN WHY using their factors (e.g. 'leads on championship position and was quick here last year'), rather than just reciting probabilities.",
  "If the JSON includes `context` (curated circuit facts), you MAY add at most ONE short sentence drawn from it for color, only from that array, never your own outside knowledge.",
  "These are probabilities, not certainties (bands: strong / in contention / outside shot). NEVER say anyone 'will' podium; speak in terms of likelihood.",
  "Do not invent drivers, teams, numbers, causes, or comparisons not present in the JSON.",
  "If the JSON has no drivers (a qualitative/low-data state), say plainly that there isn't enough data for this weekend yet.",
  "Write in plain prose: never use em-dashes. Use commas, colons, or separate sentences instead.",
].join(" ");

export async function generatePodiumNarrative(client: LlmClient, facts: PodiumFacts): Promise<string> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 280,
    system: PODIUM_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  return msg.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
}

export type PaceDriver = { driver: string; team: string | null; pace_delta_s: number; uncertainty_s: number };

export type PaceFacts = {
  year: number;
  gp: string;
  qualitative: boolean;
  n_train_races?: number;
  reason?: string;
  drivers: PaceDriver[];
  context?: string[];
};

const PACE_SYSTEM = [
  "You write a short, insightful, honest explanation (2-3 sentences) of a Formula 1 long-run PACE-GAP estimate.",
  "You may use ONLY the facts in the JSON the user provides (driver codes, pace_delta_s where lower = faster, uncertainty_s, and any `context`).",
  "This is SUPPORTING CONTEXT about long-run pace gaps and how confident we are. It is NOT a podium or race-result prediction. Never say who will finish where.",
  "Name the few fastest drivers by three-letter code, describe the gap in seconds and the uncertainty, and explain what the gap means for the race (e.g. a tenth a lap over a stint).",
  "If the JSON includes `context` (curated circuit facts), you MAY add at most ONE short detail from it, only from that array, never your own outside knowledge.",
  "Do not invent drivers, teams, numbers, causes, or comparisons not in the JSON.",
  "If the JSON has no drivers (a qualitative/low-data state), say plainly there isn't enough data for this weekend yet.",
  "Write in plain prose: never use em-dashes. Use commas, colons, or separate sentences instead.",
].join(" ");

export async function generatePaceNarrative(client: LlmClient, facts: PaceFacts): Promise<string> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 220,
    system: PACE_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  return msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}

export type StrategyDriver = { driver: string; team: string | null; n_stops: number; confidence: number };

export type StrategyFacts = {
  year: number;
  gp: string;
  mode?: "actual" | "historical" | "predicted";
  qualitative: boolean;
  n_train_races?: number;
  n_seasons?: number;
  reason?: string;
  sc_caveat: string;
  stops_min?: number;
  stops_max?: number;
  dominant: { n_stops: number; share: number | null; n_drivers: number | null } | null;
  drivers: StrategyDriver[];
  context?: string[];
};

// A grounded, mode-aware one-liner the narrative generator (and the card) lead with. No
// invented facts: every number comes straight from the StrategyFacts JSON. No em-dashes.
export function strategyLede(f: StrategyFacts): string {
  const n = f.dominant?.n_stops;
  if (n == null) return "There is not enough data to call the stops for this race yet.";
  const stops = `${n} stop${n === 1 ? "" : "s"}`; // ran-count phrasing: "1 stop" / "2 stops"
  const hyphenated = `${n}-stop`; // adjective phrasing: "1-stop" / "2-stop" (never "2-stops")
  if (f.mode === "actual") {
    const range =
      f.stops_min != null && f.stops_max != null && f.stops_min !== f.stops_max
        ? ` (spread ${f.stops_min} to ${f.stops_max})`
        : "";
    const lead = f.dominant?.share != null && f.dominant.share < 0.5 ? "the most common was" : "most drivers ran";
    return `At the ${f.year} ${f.gp}, ${lead} ${stops}${range}.`;
  }
  if (f.mode === "historical") {
    const basis =
      f.n_seasons != null
        ? `the last ${f.n_seasons} season${f.n_seasons === 1 ? "" : "s"}`
        : "recent seasons";
    return `Usually a ${hyphenated} race here, based on ${basis}.`;
  }
  return `The stop-count model points to a ${hyphenated} race.`;
}

const STRATEGY_SYSTEM = [
  "You write a short, insightful, honest explanation (2-3 sentences) of a Formula 1 STOP-COUNT strategy call.",
  "You may use ONLY the facts in the JSON the user provides (the lede line, dominant stop call, per-driver n_stops + confidence, sc_caveat, and any `context`).",
  "The first line of the user message is a grounded lede; build naturally from it rather than repeating it verbatim.",
  "Strategy is driven more by the track and conditions than by individual teams, so keep per-driver detail secondary.",
  "Explain the teachable mechanism: higher tyre degradation pushes toward MORE stops.",
  "If sc_caveat is present and non-empty, you MUST mention it; if sc_caveat is absent or empty, do not invent one.",
  "If the JSON includes `context` (curated circuit facts), you MAY add at most ONE short detail from it (e.g. a track trait that drives tyre wear), only from that array, never your own outside knowledge.",
  "Do not invent drivers, teams, numbers, causes, or comparisons not in the JSON. Speak in terms of likelihood, never certainty.",
  "If dominant is null (a low-data state), say plainly there isn't enough data for this weekend yet.",
  "Write in plain prose: never use em-dashes. Use commas, colons, or separate sentences instead.",
].join(" ");

export async function generateStrategyNarrative(client: LlmClient, facts: StrategyFacts): Promise<string> {
  const lede = strategyLede(facts);
  const userContent = `${lede}\n\n${JSON.stringify(facts)}`;
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 260,
    system: STRATEGY_SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });
  return msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}
