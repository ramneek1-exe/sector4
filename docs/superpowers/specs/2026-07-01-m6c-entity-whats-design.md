# M6-C — Entity-what pipeline — design

> Spec. The dynamic-entity half of the learning layer (PRD §6.6): auto-generated, cited,
> cached, badged "whats" for circuits, drivers, and teams, replacing the hand-authored
> `circuit-facts.json` stopgap. Date: 2026-07-01.

## Problem

The learning layer's **concept whats** (M6-A) and **inline links + popover** (M6-B) are live, but
the **entity whats** (circuits/drivers/teams) are not. `/weekend` shows facts from a hand-authored
`app/data/circuit-facts.json` stopgap (only Austria + Great Britain seeded), and drivers/teams have
no "what" at all. M6-C builds the dynamic entity-what pipeline: retrieve from an allowlist source,
paraphrase with Haiku (short, original, cited), cache, badge, and surface it, refreshing on the
existing weekly ops cadence.

## Decisions (locked with owner, 2026-07-01)

1. **Scope: all three entity types** — circuits, drivers, teams.
2. **Precompute, not on-demand.** The entity set is bounded and known (the season roster is in the
   app's own data), so generation runs in the **R17 GitHub Action** each weekend and commits a
   static JSON. No request-time fetch or LLM. Rationale: matches the codebase (committed JSON + R17
   + `drivers.json` as source of truth), the generated prose is reviewable in git (makes the
   "drafted → verified" model real), and there is no request-time latency/cost/failure. The
   self-building/on-demand behavior is an additive follow-up if real usage ever reaches off-roster
   entities (same cache format, no rewrite).
3. **Allowlist source (v1): Wikipedia REST API** (`.../page/summary/<title>` → short extract +
   canonical URL). Each record stores its source, so named technical sources can be added later
   without a format change.
4. **Corrections → GitHub issue** via a serverless route using a repo token (Vercel env var).
5. **Surfaces:** circuits on the `/weekend` block + inline name links; teams via inline name links;
   **drivers via a tappable glyph** → popover (contextual, satisfies the "no standalone bios"
   non-goal). All reuse the M6-B popover.
6. **Hard facts from `drivers.json`/`teams.json`**, never from cached prose.

## Architecture

### Generation (batch, in R17)
- New script `scripts/build-entity-whats.mjs` (Node/TS — the LLM prompt layer already lives in TS:
  `app/lib/anthropic`, `narrative.ts`). It:
  1. Enumerates entities: circuits from `RACE_CALENDAR`/`weekend-schedule.json`, drivers from
     `app/data/drivers.json`, teams from `app/data/teams.json`.
  2. For each, resolves a Wikipedia title (a small per-entity title map so we cite the right
     article, e.g. `VER → "Max Verstappen"`, `Austria → "Red Bull Ring"`), fetches the REST summary.
  3. Calls Haiku with a **paraphrase prompt** (short, original, cited, allowlist-only, "do not
     invent facts", no reproduced passages, no em-dashes).
  4. Writes/merges `app/data/entity-whats.json` via a **non-destructive, diff-aware** merge (see
     Badges).
- Wired into R17 as a step after the data build. Needs `ANTHROPIC_API_KEY` (already a repo/app
  secret) available to the Action; the GitHub token for corrections is a separate Vercel env var,
  not needed by the generation script.
- fastf1-free; independent of `build_2026.py` (different concern), but runs in the same workflow.

### Data model — `app/data/entity-whats.json`
A `Record<string, EntityWhat>` keyed `"<type>:<slug>"`:
```ts
type EntityWhat = {
  type: "circuit" | "driver" | "team";
  slug: string;              // canonical key: circuit gp key / driver code / team key
  title: string;             // display title (from structured data, not prose)
  summary: string;           // the Haiku paraphrase (prose ONLY; no hard facts baked in)
  source: { label: string; url: string }; // e.g. { "Wikipedia", "https://en.wikipedia.org/..." }
  badge: "drafted" | "verified" | "community-reviewed";
  generatedAt: string;       // ISO
  contentHash: string;       // hash of `summary` for change detection
};
```
Circuit records additionally carry `track` (display name, e.g. "the Red Bull Ring"). To keep the
`/weekend` block a drop-in, `getCircuitFacts` returns the circuit's `summary` **split on sentence
boundaries** into `string[]` (the seam's existing return shape), so the block renders unchanged.

### Accessors — `app/lib/entity-whats.ts`
Pure, reads the JSON:
- `getEntityWhat(type, slug): EntityWhat | undefined`
- `getCircuitFacts(gp): string[]` and `getCircuitName(gp): string` — **the existing seam**, reimplemented over `entity-whats.json` (drop-in; `app/lib/circuit-facts.ts` is replaced/retired).
- `driverWhat(code)`: composes the hard facts from `drivers.json` (name, team, number) + the
  cached `summary` + badge + source, for the driver popover. Same for teams.

## Surfaces (reuse M6-B popover)
- **`/weekend`**: the "About &lt;circuit&gt;" block reads the swapped seam; add the `TrustBadge` + a
  "Source →" citation + the corrections affordance beneath it.
- **Inline links** (extends M6-B `linkify`): circuit names and team names in narratives linkify to
  the popover (first-occurrence per entity, word-boundary — same rules as concepts). The popover
  renders the entity what (summary + badge + citation + corrections).
- **Driver glyph tap**: the `AsciiGlyph`/`DriverGlyph` in podium/pace/strategy cards becomes an
  accessible button that opens the popover with the driver what (hard facts from `drivers.json` +
  paraphrase + badge + citation + corrections).
- The popover (M6-B `ConceptPopover`) is generalized to render either a concept or an entity what;
  its "read more" for an entity is the **citation link** (no `/learn/[slug]` entity page in v1).

## Corrections form
- A one-field affordance ("spotted something wrong?") on every what opens a tiny inline note field.
- Submit → `POST /api/correction` (new serverless route) with `{ type, slug, note }`.
- The route validates + rate-limits, then opens a **GitHub issue** (label `correction`, title
  `Correction: <type>/<slug>`, body = entity, current prose, user note) via the GitHub REST API
  using a repo token in a Vercel env var. No secret reaches the client. On failure it returns an
  honest error; never silently drops.

## Badges + refresh (per-content-type TTL)
- New auto-generated whats: **`drafted`**.
- **Promotion to `verified`**: a human edits `badge: "verified"` on the record in the committed
  JSON after reading the prose in git. The R17 merge preserves an existing `verified` badge
  **unless the regenerated `summary` differs from the stored `contentHash`**, in which case it
  resets to `drafted` (PRD staleness rule).
- Concept whats (M6-A) are evergreen and untouched by this pipeline.

## Testing
Repo pattern (node-only vitest for pure TS; the generation script's live fetch/LLM is smoke-tested,
not in CI):
- vitest: `entity-whats.ts` accessors (get by type/slug; `getCircuitFacts` drop-in matches the old
  shape; `driverWhat` composes hard facts from `drivers.json` + prose); the paraphrase
  post-processor (length cap, no reproduced-passage / em-dash); the diff→badge-reset logic; the
  correction-payload builder.
- `/api/correction`: tested with a **mocked GitHub client** (asserts the issue payload; never calls
  GitHub). Validation + rate-limit covered.
- The generation script: run once against live Wikipedia + Haiku (manual/smoke), producing a
  reviewable `entity-whats.json` for the current roster; committed.
- `npm run build` clean; existing vitest + pytest stay green; M6-A/M6-B popover/linkify tests still
  pass after the popover generalization.

## Out of scope / non-goals
- **On-demand / self-building cache** — precompute only (additive follow-up if usage warrants).
- **Standalone driver/team bio pages** (PRD non-goal) — whats are contextual (popover/`/weekend`).
- No `/learn/[slug]` pages for entities in v1 (citation link is the "read more").
- Sources beyond Wikipedia (the record carries `source`, so this is additive later).
- Reproduced passages, un-cited prose, hard facts in cached prose — all forbidden (PRD hard rules).

## Dependencies / risks
- `ANTHROPIC_API_KEY` must be available to the R17 Action (confirm it is, or add it).
- A repo token (issues:write) as a Vercel env var for `/api/correction`.
- The Wikipedia title map must be accurate per entity so citations point at the right article; a
  wrong/missing title yields no what (honest empty state), never a guessed one.
