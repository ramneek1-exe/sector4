// Curated, hand-authored, verified circuit facts (M5 stopgap). NOT LLM-generated — the
// PRD forbids invented facts. M6's learning layer replaces this file with the dynamic
// entity-what pipeline (allowlist -> Haiku paraphrase -> cite + link -> cache -> badge).
import facts from "@/app/data/circuit-facts.json";

export function getCircuitFacts(gp: string): string[] {
  return (facts as Record<string, string[]>)[gp] ?? [];
}
