# M5 — `/weekend` Visual Upgrade + CTA: Design

> A focused polish pass on the M5 beta surface. The `/weekend` issued-artifact page is
> currently a functional text list; this gives it a styled podium table with driver
> glyphs, curated circuit fun-facts (a verified stopgap), and adds a CTA on the home page
> that routes to it. Authored 2026-06-21. Builds on the shipped M5 delivery layer
> (`app/weekend/page.tsx`, the snapshot schema) and the M3 glyph system (`AsciiGlyph`).

## 1. Goal

Make the beta's two public surfaces cohere with the product's visual identity:
1. The home page (`app/page.tsx`) gets a **CTA** routing casual visitors to the weekend's
   issued odds.
2. `/weekend` becomes a **designed artifact** — a styled podium-odds **table** with the
   ASCII **helmet glyphs**, the existing strategy/pace context, and a **curated fun-facts**
   block for the upcoming circuit — instead of a plain `<ol>`.

Honesty is preserved throughout: bands not `%`, the calibration note stays, and fun facts
are **hand-authored/verified** (no LLM invention — PRD hard rule).

## 2. Scope (locked in brainstorming)

**In scope:**
- CTA button on `app/page.tsx`, top-right, → `/weekend`.
- `/weekend` podium-odds **table** with `AsciiGlyph` per driver + full driver names.
- Light restyle of the existing strategy + pace sections to match the table.
- **Curated** circuit fun-facts: `app/data/circuit-facts.json` + `getCircuitFacts(gp)`
  helper, rendered in a fun-facts block. Verified, hand-authored, evergreen — a
  deliberate **stopgap**.
- A **handoff note**: M6 replaces `circuit-facts.json` with the dynamic entity-what
  pipeline (allowlist → Haiku paraphrase → cite + link → cache → "drafted, unverified"
  badge).

**Out of scope (explicitly deferred):**
- The M6 entity-what pipeline itself (dynamic/cited/cached/badged facts) — separate
  milestone; this spec only leaves a clean seam for it.
- Driver/team imagery beyond the existing abstract glyphs (PRD §8 rights rules stand).
- Any change to prediction logic, the snapshot schema, the cron, or Blob.
- Reworking the home page's interactive flow (only the CTA is added).

## 3. Constraints (carried from the project)

- **Honesty:** bands only (no numeric `%` as a headline; `p≈` is shown as the existing
  secondary figure, consistent with the home page); keep the calibration note; fun facts
  are verified-authored, never LLM-invented.
- **Visual system (PRD §8):** abstract glyphs only — helmet glyph in team colour +
  number in personal colour + 3-letter code. No photos/faces/logos/liveries. Driver
  hard facts (name, number, team colour) come from `drivers.json` / `teams.json` (source
  of truth), never inline literals.
- **Motion** gated behind `prefers-reduced-motion`.
- **Reuse** the existing `AsciiGlyph` (canvas helmet, the home-page component) so the two
  surfaces match; it already degrades to the `DriverGlyph` SVG fallback.
- `/weekend` stays a **server component** reading the latest Blob snapshot; the
  empty-state (no snapshot yet) is unchanged.

## 4. Components & data flow

### 4.1 CTA (`app/page.tsx`)
A small fixed link, top-right (mirroring the top-left `SECTOR4` wordmark), text
**"Upcoming weekend odds →"**, `href="/weekend"`. Styled with Space Grotesk + the design
system's pill/hover treatment used on the query bar; hover/transition gated by
`prefers-reduced-motion`. Pure additive — no change to existing home-page behaviour.

### 4.2 `/weekend` table
Replace the podium `<ol>` with a `<table>`:

| Col | Content | Source |
|---|---|---|
| Rank | `d.rank` | snapshot |
| Glyph | `<AsciiGlyph code={d.driver} team={d.team} size={…} />` | snapshot + teams.json |
| Driver | code (bold) + full name | snapshot + `drivers.json` |
| Team | `d.team` | snapshot |
| Band | band label, band-coloured | snapshot |
| p≈ | `d.p_podium` | snapshot |

Styling: design-system typography (Space Grotesk data labels), band colours reused from
the home page's `BAND_TEXT` map (extract to a shared module so both pages share one
source), banded rows, responsive (collapses gracefully on narrow screens). Driver full
names come from a small `driverName(code)` lookup over `drivers.json`.

Because `AsciiGlyph` is a client component (`"use client"`, canvas), it renders inside the
server page as a client island — already the pattern on the home page; the SVG
`DriverGlyph` fallback covers no-canvas/SSR.

### 4.3 Strategy + pace sections
Kept as-is functionally; restyled to sit visually under the table (shared section
styling). No logic change. They remain conditionally rendered (absent → omitted, as today
for Austria's pending telemetry).

### 4.4 Curated fun facts
- `app/data/circuit-facts.json`: `{ "<gp key>": ["fact", …] }` — hand-authored, verified,
  3–5 evergreen facts per circuit. Seed **Austria** + **Great Britain** (the beta's first
  two weekends); structure allows adding more per weekend.
- `app/lib/circuit-facts.ts`: `getCircuitFacts(gp: string): string[]` — returns the facts
  for the (already-canonical) gp key, or `[]` if none.
- `/weekend` renders a "Did you know" / fun-facts block from `getCircuitFacts(snap.gp)`;
  omitted when empty. Framed as curated context (verified) — NOT badged "drafted", since
  these are hand-verified (the dynamic, cited, badged version is M6).

### 4.5 Shared bits / small refactors (only what this work needs)
- Extract the `BAND_TEXT` band-colour map (currently in `app/page.tsx`) to a shared
  module (e.g. `app/lib/bands.ts`) so the table and the home page use one definition.
- Add `driverName(code)` to a small lookup helper over `drivers.json` (or reuse an
  existing one if present).

## 5. Testing

- **`getCircuitFacts`** — pure; unit-test (known gp → facts, unknown gp → `[]`,
  canonical-key match).
- **`driverName`** — pure; unit-test (known code → name, unknown → falls back to the code).
- **`bands` extraction** — a test asserting the shared map still covers all three bands.
- **CTA + table render** — verified via `tsc --noEmit` + `npm run build` + a live preview
  check of `/weekend` (the project has no `.tsx` render harness — vitest env is node — so
  component rendering is verified by build typecheck + live, per the M4 precedent).
- Existing suites stay green (144 pytest + 64 vitest).

## 6. Honesty / handoff note (REQUIRED deliverable)

Add to `handoff.md`: the `/weekend` fun facts are a **curated hand-authored stopgap**
(`app/data/circuit-facts.json`); **M6's learning layer must replace them** with the
entity-what pipeline — allowlist source → Haiku original paraphrase → inline citation +
link → cache with per-type TTL → auto "drafted, unverified" badge + corrections form,
hard facts from `drivers.json`. Until then, facts are added by hand per weekend.

## 7. Open items (resolved defaults; no blockers)
- Fact count per circuit: 3–5. Tone: casual, fan-friendly, verifiable.
- Glyph size in the table: match the home-page small size (~48–64px); finalize in the plan.
- Seed circuits for facts: Austria + Great Britain now; others added as the beta rolls.
