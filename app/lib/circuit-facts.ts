// Curated, hand-authored, verified circuit facts + track name (M5 stopgap). NOT
// LLM-generated — the PRD forbids invented facts. M6's learning layer replaces this file
// with the dynamic entity-what pipeline (allowlist -> Haiku paraphrase -> cite + link ->
// cache -> badge).
import data from "@/app/data/circuit-facts.json";

type Circuit = { track: string; facts: string[] };
const CIRCUITS = data as Record<string, Circuit>;

export function getCircuitFacts(gp: string): string[] {
  return CIRCUITS[gp]?.facts ?? [];
}

/** Display track name for a gp key (e.g. "Austria" -> "the Red Bull Ring"), or the key. */
export function getCircuitName(gp: string): string {
  return CIRCUITS[gp]?.track ?? gp;
}
