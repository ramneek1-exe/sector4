# M6-B — Inline concept links + in-context popover

> Design spec. Date: 2026-06-28. Milestone: M6-B (learning layer, PRD §6.6).
> Builds directly on the M6-A seams (`concepts.json`, `getConcept(slug)`, `summary`,
> `TrustBadge`). Self-contained; no Python changes.

## Goal

Make the concepts a narrative references **clickable inline**, opening an in-context
popover anchored over the clicked word that shows the concept's `summary`, its trust
badge, and a link to the full `/learn/[slug]` page — without leaving the answer.

This is the "whys link to whats" half of the learning layer: per-prediction grounded
narratives (the whys) become navigable into the evergreen concept whats.

## Non-goals (v1)

- Linking anywhere other than the **4 answer narratives** (Stat, Podium, Pace, Strategy).
  The `/learn` pages, curated circuit facts, and `whyItMatters` text are out of scope.
- Changing how narratives are generated. The 4 Haiku narrative prompts are **untouched**;
  linking is a deterministic post-process, so there is no new prompt constraint and zero
  hallucination risk.
- Entity-whats / caching / TTL / corrections form — that is M6-C, a separate cycle.

## Decisions (locked with owner)

- **Deterministic term-matching**, not LLM-emitted markers. Code scans the finished
  narrative string for known concept terms; no prompt change.
- **Popover anchored over the clicked word** (not a side panel or bottom sheet). Lightest
  and most in-context. Edge handling: anchor below the word by default, flip above when
  there is no room, clamp horizontally to the viewport (mobile-safe).
- **Aliases co-located** as a new `aliases: string[]` field on each concept in
  `concepts.json` — single source of truth, no separate map.
- **First occurrence per concept only** — once a concept is linked in a narrative, later
  mentions stay plain text. Naturally caps links at 8 (the concept count).

## Data change

Add `aliases: string[]` to the `Concept` interface (`app/lib/concepts.ts`) and to all 8
entries in `app/data/concepts.json`. Aliases are the surface forms narratives actually
use, hand-authored per concept. Initial authoring (refined against real narrative output
during build):

- `tyre-degradation` → `["tyre degradation", "tyre deg", "degradation", "deg"]`
- `undercut-overcut` → `["undercut", "overcut"]`
- `stop-count-strategy` → `["stop-count", "stop count", "one-stop", "two-stop", "extra stop"]`
- `pit-lane-time-loss` → `["pit-lane time loss", "pit lane loss", "pit loss", "pit stop"]`
- `qualifying-vs-race-pace` → `["qualifying pace", "race pace", "quali pace"]`
- `track-evolution` → `["track evolution", "track ramps up", "rubbering in"]`
- `dirty-air` → `["dirty air", "clean air"]`
- `drs` → `["drs", "active aero", "active-aero", "overtake boost"]`

The `term` field is **not** auto-added as an alias; aliases are the explicit, curated list
(some `term`s like "Undercut / Overcut" never appear verbatim in prose).

## Components & data flow

```
narrative string (from Haiku, unchanged)
   │
   ▼
linkifyNarrative(text)  ── app/lib/linkify.ts (pure)
   │   returns Segment[] = (string | { text, slug })[]
   ▼
<NarrativeText segments> ── app/components/NarrativeText.tsx
   │   plain text → text nodes; {text,slug} → <button> link span
   │   click → onOpen({ slug, anchorRect })
   ▼
<ConceptPopover slug anchorRect onClose> ── app/components/ConceptPopover.tsx
       portal; term + TrustBadge + summary + "Read more →" → /learn/[slug]
```

State (`{ slug, anchorRect } | null`, only one open) is lifted to the answer container in
`app/page.tsx` and passed to every `NarrativeText`, so a single popover instance serves all
four cards.

### `app/lib/linkify.ts` (pure, the testable core)

- `type Segment = string | { text: string; slug: string }`
- `linkifyNarrative(text: string): Segment[]`
- Builds an alias→slug index once from `allConcepts()`. Walks the string left-to-right; at
  each position tries the **longest** matching alias across all concepts, **case-insensitive**,
  **word-boundary** anchored (regex `\b` semantics so "deg" does not match inside "degree").
  On a match: emit a link segment, mark that concept consumed (skip its later aliases), and
  advance past the matched text. Otherwise accumulate plain text.
- No React, no DOM. Deterministic.

### `app/components/NarrativeText.tsx`

- Props: `{ narrative: string; onOpen: (p: { slug: string; anchorRect: DOMRect }) => void }`
- Calls `linkifyNarrative`, renders segments. Link segments are `<button>` elements styled
  as the brand-blue growing-underline (reuse the existing nav-hover treatment), with the
  concept `term` as `aria-label`. `onClick` passes `e.currentTarget.getBoundingClientRect()`.
- Replaces the four raw `<p className="… font-lastik …">{narrative}</p>` blocks.

### `app/components/ConceptPopover.tsx`

- Props: `{ slug: string; anchorRect: DOMRect; onClose: () => void }`
- Looks up `getConcept(slug)`; renders in a **portal** (like the existing stops modal so
  card `overflow` can't clip it): `term`, `TrustBadge`, `summary`, and a `next/link`
  **"Read more →"** to `/learn/[slug]`.
- Positioning: compute from `anchorRect` — below by default, flip above when bottom overflow,
  clamp `left` into `[8, viewportWidth − width − 8]`. Recompute on scroll/resize while open.
- Dismiss: click-outside, `Esc`, route change, and opening another term (parent just swaps
  state). a11y: `role="dialog"`, `aria-labelledby` the term; focus moves into the popover on
  open and returns to the trigger on close; the link is keyboard-reachable.
- Motion: quick fade + scale (mirror the stops modal); under `prefers-reduced-motion`,
  instant with no transform.

## Error / edge handling

- A narrative with no concept terms → `linkifyNarrative` returns a single plain string
  segment; `NarrativeText` renders exactly today's output (pure passthrough).
- An alias whose slug is somehow missing from `getConcept` → the popover renders nothing and
  closes (defensive; shouldn't happen since aliases derive from the same data).
- Overlapping aliases (e.g. "pit loss" vs "pit-lane time loss") are resolved by
  longest-match-at-position, so the more specific phrase wins.

## Testing

- **vitest `linkify.test.ts`:** longest-match-wins; word-boundary (no "deg" in "degree");
  first-occurrence-per-concept (second mention stays plain); multi-concept ordering across a
  sentence; case-insensitivity; no-match passthrough returns one string segment.
- **vitest render test:** `NarrativeText` with a known term renders a `<button>`; clicking it
  fires `onOpen` with the right slug; `ConceptPopover` renders the concept `summary` + a
  `/learn/[slug]` link.
- `npm run build` + `tsc` clean. Python suite untouched (no Python changes), but run pytest
  once to confirm no incidental breakage.

## Out-of-scope follow-ups (note, don't build)

- Extending links to `/learn` body prose and the curated circuit-facts block.
- Surfacing `related` concepts inside the popover.
- These wait until after M6-C settles the entity-what side.
