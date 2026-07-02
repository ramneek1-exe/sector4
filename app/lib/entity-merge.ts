import { createHash } from "node:crypto";
import type { EntityWhat } from "@/app/lib/entity-whats";

export function contentHash(summary: string): string {
  return createHash("sha256").update(summary.trim()).digest("hex").slice(0, 16);
}

type Built = Pick<EntityWhat, "type" | "slug" | "title" | "summary" | "source"> & { track?: string };

export function mergeWhat(prev: EntityWhat | undefined, next: Built, now: string): EntityWhat {
  const hash = contentHash(next.summary);
  const changed = !prev || prev.contentHash !== hash;
  // Verified by default: both sources (Wikipedia + the paraphrase over that allowlisted
  // source) are editorially reviewed before publishing, and we regenerate every run to keep
  // facts fresh (e.g. a driver's win count). NEW/changed -> verified; unchanged keeps prev
  // (so a hand-set stronger/weaker badge survives an identical regen).
  const badge = changed ? "verified" : prev.badge;
  return { ...next, badge, generatedAt: now, contentHash: hash };
}
