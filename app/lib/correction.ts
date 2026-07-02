import type { EntityType } from "@/app/lib/entity-whats";

const TYPES = new Set<EntityType>(["circuit", "driver", "team"]);
export type Correction = { type: EntityType; slug: string; note: string };

export function validateCorrection(body: unknown): Correction | { error: string } {
  const b = body as Record<string, unknown>;
  if (!b || !TYPES.has(b.type as EntityType)) return { error: "invalid type" };
  if (typeof b.slug !== "string" || !b.slug.trim()) return { error: "slug required" };
  if (typeof b.note !== "string" || !b.note.trim()) return { error: "note required" };
  const slug = b.slug.trim();
  if (slug.length > 120) return { error: "slug too long" };
  const note = b.note.trim();
  if (note.length > 2000) return { error: "note too long" };
  return { type: b.type as EntityType, slug, note };
}

export function issuePayload(c: Correction): { title: string; body: string; labels: string[] } {
  return {
    title: `Correction: ${c.type}/${c.slug}`,
    body: `Reader-submitted correction for **${c.type} ${c.slug}**.\n\n> ${c.note}\n\n(via the "spotted something wrong?" form)`,
    labels: ["correction"],
  };
}
