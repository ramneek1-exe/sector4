# Design — /accuracy chart enrichment + GB live relabel (backlog #7)

Date: 2026-07-18
Status: approved (owner), ready for implementation plan
Milestone: M7 UX polish (`/accuracy` chart "needs more info") + a data-label correction (GB was live).

## 0. Two folded pieces

Owner asks, this slice:
1. **Relabel Great Britain as LIVE.** GB is flagged `reconstructed` only because its final
   snapshot was a post-hoc admin backfill (PR #24) — but GB (R9) was *forecast live* during the
   beta (which started Austria R8). "reconstructed artifact" ≠ "not predicted live"; for the
   `/accuracy` label the owner's intent is the latter. So GB should count LIVE (with Austria);
   the 7 pre-beta rounds (Australia…Barcelona) stay testing.
2. **Enrich the calibration chart.** It currently renders as bare lines with no scale. Add
   readability scaffolding + a faded testing series + a pure-CSS reveal animation.

## 1. GB relabel — admin `reconstructed` override

`app/api/admin/snapshot/route.ts` currently hardcodes `writeWeekendSnapshot(..., { force,
reconstructed: true })`. Add an optional `?reconstructed=` query param: default `true` (admin
backfills are post-hoc by default), but `0`/`false` writes the snapshot as LIVE (no
`reconstructed`). The owner then, one time:

```bash
BASE="https://sector4.net"
curl -sG "$BASE/api/admin/snapshot" --data-urlencode "gp=Great Britain" \
  --data-urlencode "checkpoint=final" --data-urlencode "reconstructed=0" \
  -H "Authorization: Bearer $CRON_SECRET"; echo
curl -s "$BASE/api/admin/rebuild-calibration" -H "Authorization: Bearer $CRON_SECRET"; echo
```

→ GB's snapshot loses the flag; the rebuild (projection) drops GB's `reconstructed` on its index
row → GB counts LIVE. Result: 2 live (Austria, GB) + 7 testing. No model/boundary change; future
races are labeled live/testing automatically by the cron reorder (backlog #8).

Parse: `reconstructed` is `false` only when the param is exactly `"0"` or `"false"`; anything
else (incl. absent) stays `true`.

## 2. Chart data — add a testing cumulative series

`summarize` (app/lib/calibration.ts) already emits `cumulative` over LIVE rows. Add a parallel
**`cumulativeTesting: CumulativePoint[]`** = the same cumulative walk over the RECONSTRUCTED rows
(their own subset, in index/calendar order). Both series feed the chart. `nRaces`/headline stay
live-only (unchanged). This is additive — no change to existing fields.

## 3. Chart render — `CalibrationChart` rewrite (server-rendered, no JS)

`app/components/CalibrationChart.tsx` stays a **server component** (no `use client`, no hover).
The "more info" comes from static scaffolding + a CSS reveal. New props: `{ live:
CumulativePoint[]; testing: CumulativePoint[] }` (rename from the single `series`).

Additions:
- **Y-axis scale:** recessive horizontal gridlines + labels at **0 / 50% / 100%** (left margin
  for labels). This is the biggest readability win — the lines get a scale.
- **Point markers:** a dot (r ≥ 4, ~8px hit area) at each round on the live top-3 line.
- **Endpoint value label:** the latest cumulative live top-3 direct-labeled at the line end
  (e.g. "67%"). Selective — only the endpoint, never every point.
- **Faded testing series:** the `testing` cumulative rendered as a de-emphasized line (lower
  opacity, muted), clearly labeled in the legend as **"pre-launch (not counted)"**, visually
  separate from the live accent line. So the page has content now (7 testing rounds) while the
  live line grows, without testing masquerading as the track record.
- **X-axis:** keep short gp labels; the two series share the calendar x-position (round index).
- **Brier line clarity:** keep it on the shared 0..1 axis as `1 − meanBrier`, but relabel the
  legend/caption so "higher = better-calibrated" is explicit (the current bare "Brier" + the
  inverted mapping is the confusing part).
- **Palette:** reuse existing theme tokens — accent = live primary, muted = testing/secondary —
  distinguished by opacity + solid/dashed (secondary encoding). Two salient series; safe.
- **a11y:** the race-by-race list already below the chart is the table view; the SVG keeps its
  `role="img"` + descriptive `aria-label`. Legend present (≥2 series).

## 4. Chart render gate

Change the page gate so the chart renders when there is **≥2 total scored rounds** (live +
testing), not `nRaces(live) >= 3`. With the faded testing series the chart is now populated
early. (`CalibrationChart` still internally no-ops if a given series has <2 points.)

## 5. Reveal animation (pure CSS, reduced-motion gated)

On reveal, the chart animates in — **pure CSS, no client component** (CSS animates
server-rendered SVG in the browser; no JS):
- **Line-draw:** each polyline uses `pathLength`/`stroke-dasharray` with a `stroke-dashoffset`
  keyframe from full→0 so the line draws itself over ~0.8–1.0s (ease-out). Live line draws;
  testing line draws slightly delayed + faster (secondary).
- **Staggered fade:** gridlines/labels/markers/endpoint value fade+rise in after the line
  (short stagger).
- **Restraint (design-motion-principles):** ease-out, no bounce/overshoot, no springy easing, no
  looping. It reveals once on load.
- **`@media (prefers-reduced-motion: reduce)`** disables all of it — chart appears instantly,
  fully drawn. Non-negotiable (repo house rule).
- CSS lives in `app/globals.css` (or a scoped block) keyed by chart classNames; the build task
  loads `design-motion-principles` to keep the motion purposeful and slop-free.

## 6. Non-goals

- No hover/tooltip/crosshair (owner chose static; no client component).
- No dual-axis (top-3 and Brier stay on the shared 0..1 axis).
- No change to `summarize`'s headline/`nRaces` semantics, predictions, Python, cron, or
  `vercel.json`.
- No beta-start boundary auto-classification (GB handled by the explicit override).

## 7. Tests

- **Admin route:** `reconstructed=0`/`false` → `writeWeekendSnapshot` called with
  `reconstructed: false` (or the option omitted); absent/other → `true`. (If a route-handler test
  is too heavy per repo convention, assert via the smallest testable seam.)
- **`summarize`:** `cumulativeTesting` walks reconstructed rows only (parallel to `cumulative`
  over live); all-live index → `cumulativeTesting` empty; mixed → correct split. Existing
  `summarize` tests stay green (additive field).
- **Chart:** pure-render assertions are limited for SVG; rely on tsc + build + a visual check on
  the deploy. (No unit test framework for SVG geometry here; the calibration math is covered in
  `summarize`.)

## 8. Files touched

- `app/api/admin/snapshot/route.ts` — `reconstructed` override param.
- `app/lib/calibration.ts` — `CalibrationSummary.cumulativeTesting` + its computation.
- `app/components/CalibrationChart.tsx` — rewrite (axes/gridlines/markers/endpoint/testing/legend).
- `app/accuracy/page.tsx` — pass `live` + `testing` series; change the chart gate; pass the data.
- `app/globals.css` — chart reveal keyframes + reduced-motion guard.
- Tests: `app/lib/calibration.test.ts` (cumulativeTesting).

No change to: predictions/Python, cron/reconcile/rebuild, snapshot-write, `vercel.json`, R17.

## 9. Owner steps after deploy

1. Relabel GB live: the two curls in §1 (`reconstructed=0` backfill → rebuild).
2. Eyeball `/accuracy`: 2 live rows (Austria, GB) + 7 testing; the chart now renders with the
   live line + faded pre-launch line + y-axis scale + markers + endpoint value, animating in on
   load (and static under reduced-motion).
