# Design — /accuracy chart shared calendar timeline (fast-follow)

Date: 2026-07-18
Status: approved (owner: "chart x-axis looks off, use shared timeline"), ready for plan.
Follows: `2026-07-18-accuracy-chart-enrichment` (which shipped the two lines as independent full-width overlays).

## 0. Problem

The enriched chart plots the live cumulative line and the faded testing line each spaced by their
OWN array index (`i/(n-1)`), so both stretch across the full plot width. The live (2-point) and
testing (7-point) series occupy the same pixel range despite representing disjoint, non-overlapping
calendar windows — implying a false per-x comparison. Owner reviewed it and wants a **shared
calendar timeline**.

## 1. Goal

Position BOTH cumulative series on one shared x-axis by **absolute calendar round** (position in
the full ordered calibration index). Testing rounds (pre-launch, e.g. rounds 1–7) render on the
left; live rounds (Austria, GB — later rounds) render on the right, as disjoint segments on a
single timeline. Every round gets an x-label (testing labels de-emphasized).

## 2. Non-goals

- No change to which rows are live vs testing, the headline, or any prediction/data path.
- No change to the reveal animation, y-axis scale, markers, endpoint value, or legend.
- Still server-rendered, no hover/JS.

## 3. Data — absolute position on `CumulativePoint`

`CumulativePoint` (app/lib/calibration.ts) gains **`pos: number`** = the 0-based index of that
round in the FULL ordered calibration index (calendar order across live + testing). `summarize`
builds a `gp → position` map from `index` (each gp is unique per season) and `cumulativeSeries`
stamps `pos` on each point. `round` (per-series ordinal) stays for reference. Additive.

## 4. Geometry — `plotPoints` (shared-x helper)

`app/lib/chart-path.ts` gains:

```ts
export function plotPoints(
  values: number[],
  positions: number[],   // absolute round index per value
  total: number,         // total scored rounds (shared-timeline denominator)
  w = 640, h = 220, pad = { top: 16, right: 16, bottom: 30, left: 16 },
): Pt[];
```

`x = pad.left + innerW * (total <= 1 ? 0.5 : positions[i] / (total - 1))`; `y` from the value as
today (inverted, clamped, round2). `pointCoords`/`yLevel`/`buildLinePath` are UNCHANGED (kept for
the y-scale + any existing callers/tests).

## 5. Chart — shared-x rendering

`app/components/CalibrationChart.tsx`:
- `const total = live.length + testing.length` (all scored rounds).
- Live line points = `plotPoints(live.map(top3Rate), live.map(p => p.pos), total, W, H, PAD)`;
  live Brier line likewise; testing line = `plotPoints(testing.map(top3Rate),
  testing.map(p => p.pos), total, ...)`. Markers on the live points at their shared-x.
- Endpoint value label anchored at the last live point's shared-x.
- **X-axis labels for ALL rounds** at their shared-x: live rounds in muted, testing rounds in a
  lower-opacity muted (de-emphasized), 3-letter codes. (If 9 labels crowd at `W=640`, that is a
  visual check for the eyeball; the codes are short.)
- Everything else (y gridlines/labels, animation classes, legend) unchanged.

## 6. Tests

- `summarize`: `cumulative`/`cumulativeTesting` points carry the correct absolute `pos` (a live
  round after 7 testing rounds has `pos = 7, 8`; testing rounds `pos = 0..6`).
- `chart-path`: `plotPoints` maps a point at `pos=0` to `pad.left`, `pos=total-1` to `w-pad.right`,
  a middle pos proportionally; `total <= 1` centers.
- Existing calibration / chart-path tests stay green (additive `pos`, unchanged `buildLinePath`).

## 7. Files touched

- `app/lib/calibration.ts` — `CumulativePoint.pos` + compute.
- `app/lib/chart-path.ts` — `plotPoints`.
- `app/components/CalibrationChart.tsx` — shared-x + all-round labels.
- Tests: `app/lib/calibration.test.ts`, `app/lib/chart-path.test.ts`.

No change to: admin/cron routes, snapshot-write, predictions/Python, vercel.json, R17, globals.css.

## 8. Owner step after deploy

Eyeball `/accuracy`: testing line on the left (pre-launch rounds), live line as a short segment on
the right (Austria → GB), on one continuous round axis. No relabel/rebuild needed (data unchanged).
