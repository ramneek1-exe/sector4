# Design: `/weekend` past-predictions modal

**Date:** 2026-07-07
**Status:** approved (brainstorm)
**Milestone:** M7 slice (owner backlog item #5, 2026-07-06)
**Scope:** frontend-only, read-only over existing Blob data. No pipeline / Python / cron / schema change.

## Problem

When `/weekend` is in its pre-predictions "setting up" state — the
`!snap || concluded` branch that renders *"We're still setting up our garage at
{circuit}… Check back Saturday"* (`app/weekend/page.tsx` ~L80-124) — the user sees
nothing about what the product actually produces. Give them a sense of what to
expect by surfacing the **previous GP's frozen final predictions vs. what actually
happened**, behind a grow-underline link that opens a modal.

## What the user sees

- In the setting-up screen, a `cta-grow` grow-underline link reading
  **"Check out {name} GP"** (where `{name}` = `getCircuitName(prevGp)`).
- Clicking opens a portalled fade+scale modal titled clearly as the **PAST** race
  (e.g. "Previous race · Great Britain 2026 — our final call"). The modal shows a
  predicted-vs-actual podium table:
  - columns: rank, helmet glyph, driver (code + name), band, `p≈`, **Finished** (the
    driver's actual finish position `P#`, with a ✓ when they finished top-3);
  - a footer summary line: **"N/3 podium correct"**.
- Esc or backdrop click dismisses; all motion gated behind `prefers-reduced-motion`.
- If `actuals` is absent from the snapshot, the modal degrades to **odds-only** (no
  Finished column, no summary) — still useful.
- If there is no resolvable previous race, or its `final` snapshot is missing, **no
  link renders** (graceful absence, never a broken/empty modal).

## Data flow

1. **Resolve `prevGp` (frontend, no pipeline change).** Import the committed ordered
   calendar `@/src/race_calendar.json` (`{ "2026": ["Australia", …, "Great Britain",
   "Belgium"] }`; imports cleanly — `resolveJsonModule` is on, `@/*` → `./*`). The
   empty branch already computes `concluded` and `upcomingGp`:
   - **not concluded** → `prevGp` = the calendar predecessor of `schedule.gp`
     (Belgium → Great Britain);
   - **concluded** (screen is showing `schedule.nextGp`) → `prevGp` = `schedule.gp`
     (the race just passed; `nextGp` is not yet in the committed calendar, so we do
     NOT look it up there);
   - round 1 / no predecessor → `null`.
2. **Fetch (server).** `getJson<WeekendSnapshot>(snapshotKey(schedule.year, prevGp,
   "final"))` — the same server-only Blob read `/accuracy` uses. `null` → no link.
3. **Extract (pure, serializable).** From `snap.podium.drivers` + `snap.actuals`,
   build rows `{ rank, driver, team, band, p_podium, finishPos, isPodium }` and a
   `{ hits, of: 3 }` summary. Reuse `raceDetail` (calibration.ts) for the summary
   (predicted top-3 by `p_podium` vs actual top-3). `actuals` absent → rows carry
   `finishPos: null`, summary `null`.
4. **Render.** Pass rows/summary/labels as props (all plain, serializable) to a
   **client** component.

## Components (three units, one job each)

- **`app/lib/past-predictions.ts`** — pure, unit-tested:
  - `resolvePrevGp(scheduleGp, calendar, concluded): string | null` — concluded →
    `scheduleGp`; else the calendar entry before `scheduleGp` (found by value:
    `idx = calendar.indexOf(scheduleGp)`; `idx <= 0` → `null`). `nextGp` is never
    needed for resolution.
  - `pastPredictionRows(podium, actuals): { rows: PastRow[]; summary: { hits: number;
    of: number } | null }`
  - `finishPos` per driver = index in `actuals` + 1, or `null` if not classified
    (DNF / absent). `isPodium` = `finishPos != null && finishPos <= 3`.
- **`app/components/PastPredictions.tsx`** — client component:
  - the `cta-grow` link + a portalled fade+scale modal cloned from the working
    `DriverStopsModal` pattern (`app/page.tsx` L116-186): `show` state drives
    enter/exit, close fades out then unmounts (~180ms), Esc + backdrop close,
    `role="dialog"` / `aria-modal`, `motion-reduce:` variants.
  - renders the predicted-vs-actual table (glyph via `AsciiGlyph`, name via
    `driverName`, band colour via `BAND_TEXT`).
- **`app/weekend/page.tsx`** — server, **empty branch only**: resolve `prevGp` →
  fetch `final` snapshot → `pastPredictionRows` → render `<PastPredictions>` when data
  exists. The populated branch and all other behaviour are untouched.

## Approach choice (recorded)

The handoff suggested extracting a shared `<PodiumTable>` from the populated
`/weekend` markup. **Rejected for this slice:** the modal table adds a Finished
column, is compact, and lives in a scrollable modal, whereas the `/weekend` table is
a full-width page section with no actuals — sharing would require a parameterized
component and edits to the working populated branch (risk) for little gain. Instead
we share the **data** logic via the pure lib and keep a self-contained modal table.

## Edge cases

- `schedule.gp` is round 1 and not concluded → `resolvePrevGp` returns `null` → no link.
- Previous `final` snapshot missing in Blob → `getJson` `null` → no link.
- Snapshot present but `actuals` missing/empty → odds-only modal (no Finished col / summary).
- A predicted driver DNF'd / not in `actuals` → `finishPos: null`, shown as "—".
- `prefers-reduced-motion` → modal appears/closes without the fade+scale transition.

## Testing / verification

- **vitest** for `resolvePrevGp` (not-concluded predecessor / concluded → scheduleGp /
  round-1 → null) and `pastPredictionRows` (with actuals incl. a DNF row → null
  finishPos; without actuals → summary null).
- `tsc` + `npm run build` clean.
- **Live check on a preview deploy** — local Blob is empty (M5 finding: Blob reads need
  a real deploy), so the populated modal is only observable against real Blob. Eyeball
  `/weekend` on a preview; Great Britain's `final` snapshot exists (scored round) and its
  predecessor resolution should surface the link + a populated predicted-vs-actual modal.

## Out of scope

- No changes to the cron, snapshot write path, `actuals.ts`, Python, or R17.
- No new Blob keys or schema fields; no `prevGp` field added to `weekend-schedule.json`
  (kept a pure frontend derivation to honour the no-pipeline-change constraint).
- Strategy / pace echo in the modal (podium odds + actual result only).
