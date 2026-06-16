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

export type PodiumDriver = { driver: string; band: string; p_podium: number; rank: number };

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
