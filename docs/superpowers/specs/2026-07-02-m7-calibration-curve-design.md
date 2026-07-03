# M7 (slice 1) — Season calibration curve: the "track record" page

**Status:** design approved 2026-07-02, ready for planning.
**Milestone:** M7 (breadth + polish). This is the FIRST of M7's independent sub-projects
(remaining: dominant-compound query type, explainers 8→15, visual polish, optional
championship projection — each its own spec→plan→build).

## 1. Purpose

Make the product's core honesty thesis **visible**: Sector 4 competes on honesty and
explanation, not predictive edge, and its podium calibration is expected to **improve as the
2026 season accumulates** ("learns the season"). The M5 delivery loop has been silently
scoring every issued podium against the actual finish since the first beta round; nothing in
the app shows that record. This sub-project builds the surface that does.

Scope decision (owner, 2026-07-02): this is the **honesty DISPLAY surface only**. It shows the
season accuracy trend and reports reliability status; it does **not** fit isotonic/Platt or
flip qualitative bands → numeric %. With only ~1–2 completed rounds logged, a calibration fit
would be statistically meaningless and flipping to % would betray the exact thesis the page
exists to prove. The page wires the **gate-check** the later %-upgrade will consume, but keeps
`ready: false` for v1. V1 shows **our own scores only** — no baseline comparison (deferred).

## 2. Data source (no new plumbing)

The cron (`app/api/cron/snapshot/route.ts`) already accumulates a per-season calibration index
in Blob at `seasonIndexKey(year)` = `calibration/${year}-index.json`. On each race's `final`
checkpoint it appends one row:

```
{ gp: string, issuedAt: string, brierContrib: number, top3: number }
```

- `brierContrib` — pooled Brier over all driver rows for that race: mean of `(p_podium - outcome)^2`,
  outcome = 1 if the driver actually finished top-3 (from `computeCalibrationRow` in `app/lib/actuals.ts`).
- `top3` — fraction of our predicted top-3 that actually finished top-3 (0, 1/3, 2/3, or 1).

This page **only reads** that index (server-side, via the existing `getJson` from
`app/lib/blob.ts`). No changes to the cron, the pipeline, R17, or the Blob write path.

The current season year comes from `app/data/weekend-schedule.json` (`year: 2026`), the same
source `/weekend` uses — imported, not hardcoded.

## 3. Logic module — `app/lib/calibration.ts` (pure, unit-tested)

Types:

```ts
export interface CalibrationRow {
  gp: string;
  issuedAt: string;
  brierContrib: number;
  top3: number;
}

export interface CumulativePoint {
  round: number;      // 1-based order in the logged index
  gp: string;
  top3Rate: number;   // cumulative mean of top3 through this round, rounded
  meanBrier: number;  // cumulative mean of brierContrib through this round, rounded
}

export interface CalibrationSummary {
  nRaces: number;
  top3Rate: number;         // season-to-date mean of top3, rounded (0 when nRaces === 0)
  meanBrier: number;        // season-to-date mean of brierContrib, rounded (0 when nRaces === 0)
  cumulative: CumulativePoint[];
  status: CalibrationStatus;
}

export interface CalibrationStatus {
  ready: boolean;   // is measured %-calibration unlocked? v1: always false
  nRaces: number;
  reason: string;   // honest human-readable status line
}
```

Functions:

- `summarize(index: CalibrationRow[]): CalibrationSummary`
  - Preserves index order as calendar order (the cron appends in race order).
  - `top3Rate` / `meanBrier` = rounded season means; `cumulative[i]` = rounded running means
    through round `i+1`.
  - Empty index → `{ nRaces: 0, top3Rate: 0, meanBrier: 0, cumulative: [], status }`.
- `calibrationStatus(index: CalibrationRow[]): CalibrationStatus`
  - `nRaces = index.length`.
  - `ready` — the gate the future %-upgrade consumes. **v1 keeps it `false`** (display-only
    scope), but the threshold is encoded honestly: `ready` requires `nRaces >= CALIBRATION_MIN_RACES`
    (a named constant, e.g. 6). Because v1 never fits/checks reliability, `ready` is returned
    `false` regardless for now, with a comment marking where the %-slice adds the reliability
    check. (Concretely: v1 returns `ready: false` always; the constant + nRaces gate exist so
    the later slice flips it on `nRaces >= MIN && reliabilityPasses(index)`.)
  - `reason` — e.g. `"We report qualitative bands, not percentages, until calibration is
    measured over enough races. {nRaces} logged so far."`

**Rounding is centralized here** — every number that reaches the page is rounded in this
module (house rule). Round rates to 2 dp, Brier to 3 dp.

Tests (`app/lib/calibration.test.ts`, vitest): empty index; 1 row; 2 rows; ≥3 rows
(cumulative series correct + monotonic in `round`); rounding; `status.ready === false` and
`reason` reflects nRaces; season means match hand-computed values.

## 4. The page — `app/accuracy/page.tsx` (server component)

Route `/accuracy`, nav label **"Accuracy"**, added to `SiteNav` alongside Ask / Learn / the
weekend link. Reads the Blob index server-side, calls `summarize`, renders. Native to the
existing visual system: PP Mondwest page header + `AsciiEmblem` heading marker (as on
`/learn`), brand palette, theme-aware, all motion gated behind `prefers-reduced-motion`.

State machine driven by `summary.nRaces`:

1. **`nRaces === 0` (no finals scored yet):** honest empty state —
   "No completed rounds scored yet this season. Predictions are issued each weekend and scored
   here after the race." + link to `/weekend`. (Reliability banner still shown.)
2. **Reliability banner (always):** renders `summary.status.reason` — the standing honesty
   statement that we show bands, not %, with the live `nRaces` count.
3. **Scorecard (when `nRaces >= 1`):** three Space Grotesk stat tiles —
   - Races logged (`nRaces`)
   - Season top-3 hit rate (`top3Rate`, shown as a fraction/percent-of-podiums-called with a
     plain gloss)
   - Season Brier (`meanBrier`) with the gloss "lower = better-calibrated".
4. **Race-by-race, degrading gracefully:**
   - **`1 <= nRaces < 3`:** **row list only** — per race: GP name, our predicted top-3 (driver
     codes/glyphs), the actual top-3, ✓/✗ per predicted slot, that race's Brier. No trend line
     (honest: too few points).
   - **`nRaces >= 3`:** a **cumulative line chart above the list** — `top3Rate` as the primary
     line (headline metric), `meanBrier` as the calibration co-metric, x = round. Framed as
     *expected to sharpen as data accumulates* — never claiming a guaranteed monotonic decline.
     The row list remains below.

The per-race predicted/actual top-3 rows need the predicted trio. The season index rows carry
`top3` (the score) but not the predicted/actual driver lists. **Resolution:** the row-list
predicted-vs-actual detail reads from each weekend's frozen snapshot
(`weekends/{year}-{gp}/final.json`, which carries `podium` + `actuals`), fetched by `gp` from
the index. The scorecard, cumulative series, and chart come entirely from the lightweight index.
If a snapshot is missing/unreadable for a listed gp, that row falls back to score-only
(GP + top3 + Brier, no driver detail) — never an error.

Chart built with the `dataviz` skill's system at build time; the data stays legible (not
ASCII-ified — honesty over flourish). Numbers already rounded upstream.

## 5. Non-goals (explicit, for this slice)

- No isotonic/Platt fit; no bands → % flip anywhere in the app.
- No baseline (standings/grid) comparison line — our own scores only for v1.
- No changes to the cron, `actuals.ts`, the pipeline, R17, or any Blob write path.
- No new query type / parser / narrative work (those are separate M7 slices).
- No championship projection.

## 6. Testing & verification

- `app/lib/calibration.test.ts` (vitest) — the pure-logic cases in §3.
- `npm run build` + `tsc` clean; existing pytest/vitest suites stay green (this slice touches
  no Python).
- Manual verification of the four render states by seeding a mock index (empty / 1–2 / ≥3
  rows) — locally and, before merge, on a Vercel preview reading the real Blob index.

## 7. Files

- **New:** `app/lib/calibration.ts`, `app/lib/calibration.test.ts`, `app/accuracy/page.tsx`
  (+ any small presentational components the page needs, e.g. a stat-tile / chart component
  under `app/components/`).
- **Edited:** `SiteNav` (add the "Accuracy" link). Possibly `app/data/weekend-schedule.json`
  import for the year (read-only).
- **Untouched:** all Python, the cron, `actuals.ts`, `snapshot.ts` write path, R17.
