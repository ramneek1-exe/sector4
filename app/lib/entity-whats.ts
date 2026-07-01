// Entity whats (M6-C): auto-generated, cited, cached, badged prose for circuits/drivers/teams.
// Read-only over the committed app/data/entity-whats.json (generated in R17). Hard facts live in
// drivers.json/teams.json, NEVER here — this file is prose only.
import data from "@/app/data/entity-whats.json";
import type { Badge } from "@/app/lib/concepts";

export type EntityType = "circuit" | "driver" | "team";
export type EntityWhat = {
  type: EntityType;
  slug: string;
  title: string;
  summary: string;
  source: { label: string; url: string };
  badge: Badge;
  generatedAt: string;
  contentHash: string;
  track?: string; // circuits only: display track name for the /weekend block
};

const WHATS = data as Record<string, EntityWhat>;

export const entityKey = (type: EntityType, slug: string): string => `${type}:${slug}`;

export function getEntityWhat(type: EntityType, slug: string): EntityWhat | undefined {
  return WHATS[entityKey(type, slug)];
}

// Split prose into sentences, keeping terminal punctuation, dropping empties.
function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

// The /weekend seam (replaces app/lib/circuit-facts.ts). Same signatures, now over entity whats.
export function getCircuitFacts(gp: string): string[] {
  const w = getEntityWhat("circuit", gp);
  return w ? sentences(w.summary) : [];
}
export function getCircuitName(gp: string): string {
  return getEntityWhat("circuit", gp)?.track ?? gp;
}
