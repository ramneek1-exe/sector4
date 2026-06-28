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
<ConceptPopoverProvider>  ── app/components/ConceptPopover.tsx
   │  holds the single { slug, anchorRect } | null state; renders one portalled popover;
   │  exposes open(slug, rect) via useConceptPopover() context
   │
   │   narrative string (from Haiku, unchanged)
   │      │
   │      ▼
   │   linkifyNarrative(text)  ── app/lib/linkify.ts (pure)
   │      │   returns Segment[] = (string | { text, slug })[]
   │      ▼
   │   <NarrativeText narrative className> ── app/components/NarrativeText.tsx
   │      plain text → text nodes; {text,slug} → <button> link span
   │      click → useConceptPopover()(slug, e.currentTarget.getBoundingClientRect())
   ▼
ConceptPopover (rendered by the provider)
       portal; term + TrustBadge + summary + "Read more →" → /learn/[slug]
```

A **Context provider** (`ConceptPopoverProvider`, exporting a `useConceptPopover()` hook)
wraps the answer area in `app/page.tsx`. It owns the single `{ slug, anchorRect } | null`
state and renders one portalled `ConceptPopover`, so the four card components never thread an
`onOpen` prop — each `NarrativeText` just calls the hook. One popover instance serves all four
cards.

### `app/lib/linkify.ts` (pure, the testable core)

- `type Segment = string | { text: string; slug: string }`
- `linkifyNarrative(text: string): Segment[]`
- Builds an alias→slug index once from `allConcepts()`. Walks the string left-to-right; at
  each position tries the **longest** matching alias across all concepts, **case-insensitive**,
  **word-boundary** anchored (so "deg" does not match inside "degree").
  On a match: emit a link segment, mark that concept consumed (skip its later aliases), and
  advance past the matched text. Otherwise accumulate plain text.
- Also exports `computePopoverPosition(anchor, size, viewport, margin?)` — the popover
  placement math (below / flip-up / horizontal clamp) extracted as a pure function so it is
  node-testable without a DOM.
- No React, no DOM. Deterministic.

### `app/components/NarrativeText.tsx`

- Props: `{ narrative: string; className?: string }` (className carries the card's existing
  `font-lastik …` typography so the visual result is unchanged for plain text).
- Calls `linkifyNarrative`, renders segments inside a `<p>`. Link segments are `<button>`
  elements styled as the brand-blue growing-underline (reuse the existing `.cta-grow` nav-hover
  treatment, `relative` for its positioned `::after`), with the concept `term` as `aria-label`.
  `onClick` calls `useConceptPopover()(slug, e.currentTarget.getBoundingClientRect())`.
- Replaces the four raw `<p className="… font-lastik …">{narrative}</p>` blocks.

### `app/components/ConceptPopover.tsx` (provider + popover + hook)

- Exports `ConceptPopoverProvider` (owns state, renders the popover), `useConceptPopover()`
  (returns the `open(slug, rect)` function), and an internal `ConceptPopover`.
- `ConceptPopover` looks up `getConcept(slug)`; renders in a **portal** (like the existing
  stops modal so card `overflow` can't clip it): `term`, `TrustBadge`, `summary`, and a
  `next/link` **"Read more →"** to `/learn/[slug]`.
- Positioning: `useLayoutEffect` measures the rendered popover, then calls the pure
  `computePopoverPosition(anchor, size, viewport)` — below by default, flip above when bottom
  overflow with room above, clamp `left` into `[8, viewportWidth − width − 8]`. Hidden
  (`visibility:hidden`) until measured to avoid a flash.
- Dismiss: click-outside (`mousedown`, registered on a 0ms timeout so the opening click
  doesn't self-close), `Esc`, and opening another term (provider just swaps state). a11y:
  `role="dialog"`, `aria-labelledby` the term; the "Read more" link is keyboard-reachable.
- Motion: quick fade + scale via a `show` flag (mirror the stops modal, ~150ms); under
  `prefers-reduced-motion`, instant (Tailwind `motion-reduce:transition-none`). Positioning
  uses `top/left` (not transform) so it never conflicts with the scale transition.

## Error / edge handling

- A narrative with no concept terms → `linkifyNarrative` returns a single plain string
  segment; `NarrativeText` renders exactly today's output (pure passthrough).
- An alias whose slug is somehow missing from `getConcept` → the popover renders nothing and
  closes (defensive; shouldn't happen since aliases derive from the same data).
- Overlapping aliases (e.g. "pit loss" vs "pit-lane time loss") are resolved by
  longest-match-at-position, so the more specific phrase wins.

## Testing

The codebase's vitest runs in a **node environment** (`include: app/**/*.test.ts`) with no
jsdom or testing-library, and has **no component render tests** — the frontend is verified
via `tsc` + `npm run build` + live preview. M6-B honors that pattern: all real logic lives
in **pure, node-testable** functions; the thin React components are verified by build/tsc/live.

- **vitest `app/lib/linkify.test.ts`** (pure logic):
  - `linkifyNarrative`: longest-match-wins; word-boundary (no "deg" inside "degree");
    first-occurrence-per-concept (second mention stays plain); multi-concept ordering across a
    sentence; case-insensitivity; no-match passthrough returns a single string segment.
  - `computePopoverPosition`: below by default; flips up when no room below but room above;
    stays below when neither fits; clamps to the left edge; clamps to the right edge; centers
    horizontally in the normal case.
- **Components** (`NarrativeText`, `ConceptPopover`/provider): no new test infra introduced.
  Verified by `tsc` (types), `npm run build` (compiles + SSR-safe), and a live preview eyeball
  (a known term is clickable; the popover shows the summary + badge + working "Read more" link;
  Esc / click-outside dismiss; reduced-motion is instant).
- Python suite untouched (no Python changes), but run pytest once to confirm no incidental
  breakage.

## Out-of-scope follow-ups (note, don't build)

- Extending links to `/learn` body prose and the curated circuit-facts block.
- Surfacing `related` concepts inside the popover.
- These wait until after M6-C settles the entity-what side.
