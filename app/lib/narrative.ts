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
