# M6-A — Concept Whats + `/learn` (design)

> Sub-project A of M6 (the learning layer). M6 is decomposed into **A — concept whats**
> (this doc), **B — whys cross-linking** (inline links from prediction narratives to whats),
> and **C — entity-what pipeline** (allowlist retrieval → Haiku paraphrase → cite → cache →
> TTL → badge lifecycle → corrections form). A is the foundation B and C both reuse. Source
> of truth: PRD §6.6. Date: 2026-06-27.

## Goal

Ship the educational core of the learning layer: a hand-authored, browsable set of
teaching concepts at `/learn`, each a structured mini-explainer carrying a trust badge.
A is self-sufficient (no external retrieval, no dependence on B) and establishes the
`what` data model + the badge UI primitive that B and C build on.

## Scope

**In:** the `what` data model + JSON store, `/learn` index + per-concept pages, the
`TrustBadge` integrity component, 8 authored starter concepts (shipped "drafted,
unverified"), a "Learn" nav link, and PP Mondwest section headings on `/learn` and the
Ask (home) page.

**Out (deferred):**
- Inline linking from prediction narratives to concept whats → **B**.
- The drawer/hover in-context surface → **B**.
- The corrections form; allowlist retrieval, Haiku paraphrase, cache, per-type TTL refresh,
  and `community-reviewed` promotion → **C**.

## 1. Data model & storage

`app/data/concepts.json` — an array of concept objects:

```jsonc
{
  "slug": "tyre-degradation",          // stable id; the /learn/[slug] route + B's link target
  "term": "Tyre Degradation",
  "group": "Tyres & strategy",         // thematic group for the index
  "summary": "...",                    // ONE line — reused verbatim by B's drawer/hover later
  "body": ["para 1", "para 2"],        // 1–2 plain paragraphs (string[]; no markdown dep)
  "whyItMatters": "...",               // ties to a Sector 4 prediction (e.g. deg → stop-count)
  "related": ["undercut-overcut", "stop-count-strategy"], // slugs → chips (not inline; that's B)
  "badge": "drafted",                  // "verified" | "drafted" (| "community-reviewed" in C)
  "sources": [{ "label": "...", "url": "..." }] // allowlisted refs backing the entry
}
```

`app/lib/concepts.ts` — types + pure accessors:
- `allConcepts(): Concept[]`
- `getConcept(slug): Concept | undefined`
- `conceptsByGroup(): { group: string; concepts: Concept[] }[]` (stable group order)
- `resolveRelated(slug): Concept[]` (maps `related` slugs → concepts, drops unknowns)

No external deps; `body` renders as `<p>` per paragraph (no markdown engine). Static
import of the JSON (bundler-safe, like `drivers.json`).

## 2. Surface & routing

- **`app/learn/page.tsx`** — index. A top-level **"Learn"** heading in **PP Mondwest**
  (`font-pixel-serif`), then the 8 concepts as a card grid **grouped by `group`** (group
  label in Space Grotesk; cards show `term` + `summary` + `TrustBadge`). Cards link to the
  concept page.
- **`app/learn/[slug]/page.tsx`** — entry. Layout top→bottom: `term` (Bebas display) ·
  `TrustBadge` · `summary` as lead (Lastik, larger) · `body` paragraphs (Lastik) · a
  set-apart **"Why it matters"** callout · **related** chips (link to sibling concepts) ·
  **sources** list. `generateStaticParams` over the 8 slugs (static pages). Unknown slug →
  `notFound()`.
- **Nav:** a **"Learn"** link added to the home page, alongside the existing `/weekend`
  CTA. (Both `/learn` and the home Ask page get the matching pixel-serif heading — see §5.)

## 3. Trust badge — `app/components/TrustBadge.tsx`

A deliberately well-typeset **integrity signal, not a disclaimer hedge** (PRD §6.6 calls
this out explicitly). Props: `badge: "verified" | "drafted" | "community-reviewed"`.
- `verified` → confident, settled treatment ("Verified").
- `drafted` → "Drafted · unverified", honest but not alarmist.
- `community-reviewed` → variant stubbed now, used by C.
Space Grotesk label, small, restrained. Reused unchanged by C. Pure presentational
component, unit-tested for label/variant mapping.

## 4. Content — the 8 starter concepts

Authored from allowlisted sources, in the product voice, each with `related` cross-links
and `whyItMatters` tied to an actual Sector 4 prediction. Groups:

- **Tyres & strategy:** Tyre Degradation · Undercut / Overcut · Stop-Count Strategy ·
  Pit-Lane Time Loss
- **Pace & sessions:** Qualifying vs. Race Pace · Track Evolution
- **Air & aero:** Dirty Air · DRS

All ship as **`"drafted"`**. The owner reviews and flips any to `"verified"` (a one-field
edit in `concepts.json`). This is honest by default and exercises both badge states from
day one.

## 5. Headings & visual / motion

- **Section headings in PP Mondwest** (`font-pixel-serif`): `/learn` gets a top-level
  **"Learn"** heading; the Ask (home) page gets a matching **"Ask"** heading in the same
  font, placed near the query bar so the two pages read as a set. (Font already wired in
  `app/lib/fonts.ts` as `--font-pixel-serif`; its own comment designates it for section
  headers.)
- Reuse the existing type system + palette. `/learn` prioritizes **legibility** (it is for
  reading): a restrained ASCII accent, **not** the home page's active fog. All motion
  behind `prefers-reduced-motion`. No new heavy dependencies.

## File structure

```
app/data/concepts.json            # the 8 concepts (NEW)
app/lib/concepts.ts               # types + accessors (NEW)
app/lib/concepts.test.ts          # accessor unit tests (NEW)
app/components/TrustBadge.tsx     # badge integrity component (NEW)
app/components/TrustBadge.test.tsx# badge variant tests (NEW)
app/learn/page.tsx                # index (NEW)
app/learn/[slug]/page.tsx         # concept entry (NEW)
app/page.tsx                      # add "Ask" pixel-serif heading + "Learn" nav link (EDIT)
```

## Testing & DoD

- `concepts.ts` accessors unit-tested (grouping order, related resolution drops unknowns,
  `getConcept` miss → undefined).
- `TrustBadge` variant/label mapping tested.
- A schema/consistency test over `concepts.json`: every `related` slug resolves; every
  concept has the required fields; `badge` ∈ allowed set.
- `npm run build` clean (static `/learn` + `/learn/[slug]` pages render); existing vitest +
  pytest suites stay green.
- Manual: `/learn` index groups + badges render; a concept page renders all sections;
  related chips navigate; both pixel-serif headings show; reduced-motion path is static.

## Open / forward-compatible notes

- `summary` is intentionally a standalone one-liner so **B** reuses it for the drawer/hover
  with no re-authoring.
- `badge` enum already includes `community-reviewed` so **C** adds no schema change.
- The `getConcept(slug)` seam is the deep-link target **B** will link narratives into.
