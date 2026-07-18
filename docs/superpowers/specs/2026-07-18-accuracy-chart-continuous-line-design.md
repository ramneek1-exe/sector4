# Design — /accuracy chart: one continuous line + round-number labels (fast-follow 2)

Date: 2026-07-18
Status: approved (owner), ready for plan.
Follows: `2026-07-18-accuracy-chart-shared-timeline`. Fixes 4 owner observations.

## 0. Owner observations

1. **Line reads "disconnected" between Austria and GB.** Two separate cumulative lines (testing 7pts
   left, live 2pts far right) with a gap → looks broken.
2. **Inconsistent gp labels** — some 3-letter, some full country/place names (`shortGp`: `<=6` chars
   show full, `>6` truncate to 3 upper).
3. **Australia and Austria both render "AUS"** — naive first-3-char truncation collides.
4. **Will labels squeeze as the season grows?** Yes — x = `pos/(total-1)`; more rounds compress
   points + labels.

## 1. Fixes

### 1a. One continuous line (obs 1)

Replace the two separate cumulative lines with ONE cumulative line over ALL scored rounds in
calendar order (single basis). Style by segment: **pre-launch (reconstructed) portion faded, live
portion solid + markers**, the two sub-paths **sharing the boundary point** so the line is visually
continuous (no gap). The Brier co-line becomes a single dashed muted line over all rounds
(secondary; not split).

- `summarize` gains **`cumulativeAll: CumulativePoint[]`** = `cumulativeSeries` over the FULL index
  (all rounds, in order). Each `CumulativePoint` gains **`reconstructed?: boolean`** (from its row)
  so the chart can split faded vs solid. `round` on these points is the global round number (1..N).
- Existing `cumulative` (live-only) and `cumulativeTesting` stay (unused by the chart now, but keep
  — cheap, and `cumulative` still backs the headline via `top3Rate`/`meanBrier` which are UNCHANGED
  and live-only). The **headline numbers remain live-only**; the chart line is a season trend.
- Chart split: `firstLiveIdx` = first index in `cumulativeAll` with `!reconstructed`.
  - `fadedPath` = `cumulativeAll[0 .. firstLiveIdx]` inclusive (pre-launch + the first live point, to
    bridge continuously). If no live rounds, faded = all; if firstLiveIdx===0, faded = empty.
  - `solidPath` = `cumulativeAll[firstLiveIdx .. end]` (live portion). Markers on these points.
  - Endpoint value label = the final `cumulativeAll` point's top3 (matches the line's end; the caption
    clarifies the line is cumulative across all rounds while the headline counts live only).

### 1b. Round-number x-labels (obs 2, 3)

Replace `shortGp(gp)` x-labels with the **global round number** (`point.round`, 1-based over the full
index) rendered as `R{n}` (or just `{n}`). Consistent, no Australia/Austria collision, timeline-native.
Actual gp names stay in the race-by-race table below. `shortGp` may be deleted if now unused.

### 1c. Label thinning (obs 4)

To avoid crowding as rounds accumulate, show a label only when it is **informative**: always label
**live** rounds (they are the record) and label testing rounds every `stride` where `stride =
Math.max(1, Math.ceil(total / MAX_LABELS))` with `MAX_LABELS = 12`. New pure helper
`labelStride(total, max)` in `chart-path.ts` (testable). Points still all plot; only labels thin.

## 2. Non-goals

- No change to headline `top3Rate`/`meanBrier`/`nRaces` (live-only, unchanged).
- No change to y-axis scale, gridlines, reveal animation, legend colors, or the data/label pipeline
  (still no relabel/rebuild needed after deploy).
- Chart stays server-rendered (no hover/JS).

## 3. Files touched

- `app/lib/calibration.ts` — `CumulativePoint.reconstructed`, `CalibrationSummary.cumulativeAll`.
- `app/lib/chart-path.ts` — `labelStride(total, max): number`.
- `app/components/CalibrationChart.tsx` — single continuous line (faded/solid split), round-number
  labels with thinning, single Brier line.
- Tests: `app/lib/calibration.test.ts` (cumulativeAll + reconstructed flag), `app/lib/chart-path.test.ts`
  (labelStride).

No change to: admin/cron routes, snapshot-write, predictions/Python, vercel.json, R17, globals.css
(reuses existing chart classes).

## 4. Rendering detail (chart)

- `total = cumulativeAll.length`. x per point = `plotPoints(values, cumulativeAll.map(p=>p.pos or round-1), total, ...)` — the single line spans the full width; pos = index in cumulativeAll (0..total-1), so no gap.
- fadedPath polyline: `stroke-muted`, `opacity 0.4`, `chart-draw` (line-draws). solidPath polyline:
  `stroke-accent`, `strokeWidth 2.5`, `chart-draw`. They share the boundary point → continuous.
- Markers (`fill-accent`, r=4) on solidPath points only.
- Brier: single `stroke-muted` dashed line over all points, fades in (`chart-fade`), `opacity 0.5`.
- x-labels: for each point, if `!reconstructed || (round-1) % stride === 0`, render `R{round}` at its x
  (`fill-muted`, testing at `opacity 0.5`).

## 5. Owner step after deploy

Eyeball `/accuracy`: one continuous accuracy line (pre-launch faded, live solid with dots), round
numbers on the x-axis, no disconnect. Data unchanged — no curl needed.
