// Pure assembly helper for the entity-what build pipeline.
// Called from scripts/build-entity-whats.mjs (which duplicates the tiny helpers
// so the .mjs runs without a TypeScript compilation step).
// The mergeWhat/contentHash source of truth is app/lib/entity-merge.ts.
import { mergeWhat } from "@/app/lib/entity-merge";
import { sanitizeParaphrase } from "@/app/lib/paraphrase";
import type { EntityWhat, EntityType } from "@/app/lib/entity-whats";

export type WikiExtract = { extract: string; url: string };
/** Injectable: receives a Wikipedia article title, returns extract + canonical URL. */
export type Fetcher = (title: string) => Promise<WikiExtract>;
/** Injectable: receives raw Wikipedia extract, returns a short paraphrase (pre-sanitize). */
export type Summarizer = (extract: string) => Promise<string>;

export type BuildInput = {
  type: EntityType;
  slug: string;
  /** Exact Wikipedia article title (from entity-titles.json). */
  title: string;
  /** Circuits only: display track name shown on /weekend. */
  track?: string;
};

/**
 * Full assembly: fetch → summarize → sanitize → mergeWhat.
 * fetch and summarize are injected so tests can stub them without network/API.
 */
export async function buildEntityRecord(
  input: BuildInput,
  prev: EntityWhat | undefined,
  now: string,
  fetch: Fetcher,
  summarize: Summarizer,
): Promise<EntityWhat> {
  const { extract, url } = await fetch(input.title);
  const raw = await summarize(extract);
  const summary = sanitizeParaphrase(raw);
  return mergeWhat(
    prev,
    {
      type: input.type,
      slug: input.slug,
      title: input.title,
      summary,
      source: { label: "Wikipedia", url },
      ...(input.track !== undefined ? { track: input.track } : {}),
    },
    now,
  );
}
