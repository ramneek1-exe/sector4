import { createHash } from "node:crypto";
import type { EntityWhat } from "@/app/lib/entity-whats";

export function contentHash(summary: string): string {
  return createHash("sha256").update(summary.trim()).digest("hex").slice(0, 16);
}

type Built = Pick<EntityWhat, "type" | "slug" | "title" | "summary" | "source"> & { track?: string };

export function mergeWhat(prev: EntityWhat | undefined, next: Built, now: string): EntityWhat {
  const hash = contentHash(next.summary);
  const changed = !prev || prev.contentHash !== hash;
  // NEW -> drafted. Unchanged -> keep prev badge. Changed (incl. a verified one) -> drafted.
  const badge = !prev ? "drafted" : changed ? "drafted" : prev.badge;
  return { ...next, badge, generatedAt: now, contentHash: hash };
}
