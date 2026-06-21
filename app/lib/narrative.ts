import { HAIKU, type LlmClient } from "./anthropic";

export type StatFacts = {
  stat: string;
  gp: string;
  value: number | null;
  units: string | null;
  source: string;
};

const SYSTEM = [
  "You write a two-sentence explanation for a single Formula 1 stat lookup.",
  "You may use ONLY the facts in the JSON the user provides.",
  "Do not invent or estimate any numbers, drivers, teams, causes, or comparisons not present in that JSON.",
  "State the value and circuit plainly; the second sentence may add brief, general context that does not introduce new facts.",
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

export type PodiumDriver = { driver: string; team: string | null; band: string; p_podium: number; rank: number };

export type PodiumFacts = {
  year: number;
  gp: string;
  mode?: string;
  qualitative: boolean;
  calibrated: boolean;
  n_train_races?: number;
  reason?: string;
  drivers: PodiumDriver[];
};

const PODIUM_SYSTEM = [
  "You write a two-sentence, honest explanation of a Formula 1 podium-probability prediction.",
  "You may use ONLY the facts in the JSON the user provides (driver codes, their bands, and p_podium values).",
  "These are probabilities, not certainties: bands are 'strong', 'in contention', 'outside shot'.",
  "Name the few strongest contenders by their three-letter code and band. NEVER say anyone 'will' podium — speak in terms of likelihood.",
  "Do not invent drivers, teams, numbers, causes, or comparisons not present in the JSON.",
  "If the JSON has no drivers (a qualitative/low-data state), say plainly that there isn't enough data for this weekend yet.",
].join(" ");

export async function generatePodiumNarrative(client: LlmClient, facts: PodiumFacts): Promise<string> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 220,
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
};

const PACE_SYSTEM = [
  "You write a two-sentence, honest explanation of a Formula 1 long-run PACE-GAP estimate.",
  "You may use ONLY the facts in the JSON the user provides (driver codes, pace_delta_s where lower = faster, and uncertainty_s).",
  "This is SUPPORTING CONTEXT about long-run pace gaps and how confident we are — it is NOT a podium or race-result prediction. Never say who will finish where.",
  "Name the few fastest drivers by three-letter code and describe the gap in seconds and the uncertainty. Do not invent drivers, teams, numbers, causes, or comparisons not in the JSON.",
  "If the JSON has no drivers (a qualitative/low-data state), say plainly there isn't enough data for this weekend yet.",
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
  qualitative: boolean;
  n_train_races?: number;
  reason?: string;
  sc_caveat: string;
  dominant: { n_stops: number; share: number; n_drivers: number } | null;
  drivers: StrategyDriver[];
};

const STRATEGY_SYSTEM = [
  "You write a two-to-three-sentence, honest explanation of a Formula 1 STOP-COUNT strategy prediction.",
  "You may use ONLY the facts in the JSON the user provides (the dominant stop call, per-driver n_stops + confidence, and sc_caveat).",
  "Lead with the race-level / track-level call from `dominant` (e.g. mostly a one- or two-stop here) — strategy is driven more by the track and conditions than by individual teams, so keep per-driver detail secondary.",
  "Explain the teachable mechanism: higher tyre degradation pushes toward MORE stops. You MUST mention the safety-car caveat from sc_caveat.",
  "Do not invent drivers, teams, numbers, causes, or comparisons not in the JSON. Speak in terms of likelihood, never certainty.",
  "If the JSON has no drivers / dominant is null (a low-data state), say plainly there isn't enough data for this weekend yet.",
].join(" ");

export async function generateStrategyNarrative(client: LlmClient, facts: StrategyFacts): Promise<string> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 260,
    system: STRATEGY_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  return msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}
