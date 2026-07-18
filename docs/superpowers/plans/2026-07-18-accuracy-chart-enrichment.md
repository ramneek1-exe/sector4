# /accuracy chart enrichment + GB live relabel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/accuracy` informative: relabel GB as live (admin override), add a testing cumulative series, and enrich the chart (y-axis scale, gridlines, markers, endpoint value, faded testing line, clearer Brier framing) with a pure-CSS reveal animation.

**Architecture:** GB relabel is an admin-route param + owner curl. The chart stays a server component (no JS/hover); "more info" comes from static SVG scaffolding + a CSS line-draw reveal. Geometry math lives in testable `chart-path.ts` helpers; `summarize` emits a parallel `cumulativeTesting` series.

**Tech Stack:** TypeScript (Next.js App Router), vitest, CSS.

## Global Constraints

- **Chart is a SERVER component** — no `use client`, no hover/tooltip. Animation is pure CSS on server-rendered SVG.
- **All motion gated by `@media (prefers-reduced-motion: reduce)`** (repo house rule) — chart fully drawn/static when reduced.
- **No dual-axis** — top-3 and `1 − Brier` share the 0..1 axis.
- **Reuse theme tokens** (accent = live primary; muted = testing/secondary); distinguish by opacity + solid/dashed.
- **Additive only** to `summarize` (new `cumulativeTesting`); do not change `nRaces`/headline semantics.
- **No em-dashes** in user-facing copy (legend/caption). **Round** numbers reaching output.
- **Commits:** conventional, description only. NO Claude/AI attribution / Co-Authored-By / robot emoji.
- TS tests: `npm run test`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.

## File Structure

- `app/api/admin/snapshot/route.ts` (MODIFY) — `reconstructed` override param.
- `app/lib/calibration.ts` (MODIFY) — `CalibrationSummary.cumulativeTesting`.
- `app/lib/chart-path.ts` (MODIFY) — `pointCoords` + `yLevel` helpers (buildLinePath refactored onto them).
- `app/components/CalibrationChart.tsx` (REWRITE) — axes/gridlines/markers/endpoint/testing/legend/animation classes.
- `app/accuracy/page.tsx` (MODIFY) — pass `live`+`testing`, lower the chart gate.
- `app/globals.css` (MODIFY) — chart reveal keyframes + reduced-motion guard.
- Tests: `app/lib/calibration.test.ts`, `app/lib/chart-path.test.ts`.

---

### Task 1: Admin `reconstructed` override (GB relabel mechanism)

**Files:**
- Modify: `app/api/admin/snapshot/route.ts`

**Interfaces:**
- Produces: `GET /api/admin/snapshot?...&reconstructed=0` writes the snapshot with `reconstructed: false`; absent/other → `true` (unchanged default).

- [ ] **Step 1: Add the param, mirroring the existing `force` parse**

In `app/api/admin/snapshot/route.ts`, find:

```ts
  // Backfill defaults to overwrite (that's the point); pass force=0 to respect idempotency.
  const force = !["0", "false"].includes(url.searchParams.get("force") ?? "1");

  try {
    const result = await writeWeekendSnapshot(year, gp, checkpoint, { force, reconstructed: true });
```

Replace with:

```ts
  // Backfill defaults to overwrite (that's the point); pass force=0 to respect idempotency.
  const force = !["0", "false"].includes(url.searchParams.get("force") ?? "1");
  // Admin backfills are post-hoc by default (reconstructed=true). Pass reconstructed=0 to write a
  // snapshot as LIVE (unflagged) -- used to correct a beta-era race whose final was backfilled
  // (e.g. Great Britain: forecast live, but its final snapshot was an admin backfill).
  const reconstructed = !["0", "false"].includes(url.searchParams.get("reconstructed") ?? "1");

  try {
    const result = await writeWeekendSnapshot(year, gp, checkpoint, { force, reconstructed });
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → clean; `/api/admin/snapshot` still dynamic.

(No unit test: this mirrors the existing untested `force` parse; a route-handler harness has no precedent here. Verified by the owner curl in the deploy step + review.)

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/snapshot/route.ts
git commit -m "feat: admin snapshot accepts reconstructed=0 to write a beta-era final as live"
```

---

### Task 2: `summarize` emits `cumulativeTesting`

**Files:**
- Modify: `app/lib/calibration.ts`
- Test: `app/lib/calibration.test.ts`

**Interfaces:**
- Produces: `CalibrationSummary.cumulativeTesting: CumulativePoint[]` — the cumulative walk over RECONSTRUCTED rows (parallel to `cumulative` over live rows).

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/calibration.test.ts` (reuse the existing `row(gp, top3, brier, reconstructed?)` helper from the earlier suite; if not present, define it as `{ gp, issuedAt: "2026-01-01T00:00:00.000Z", top3, brierContrib: brier, ...(reconstructed?{reconstructed:true}:{}) }`):

```ts
describe("summarize cumulativeTesting", () => {
  it("walks reconstructed rows only, parallel to the live cumulative", () => {
    const index = [
      row("Australia", 0.33, 0.4, true),
      row("China", 0.0, 0.5, true),
      row("Austria", 1.0, 0.05),        // live
    ];
    const s = summarize(index);
    expect(s.cumulative.map((p) => p.gp)).toEqual(["Austria"]);          // live
    expect(s.cumulativeTesting.map((p) => p.gp)).toEqual(["Australia", "China"]); // testing, in order
    expect(s.cumulativeTesting[0].round).toBe(1);
    expect(s.cumulativeTesting[1].round).toBe(2);
  });

  it("is empty when there are no reconstructed rows", () => {
    const s = summarize([row("Austria", 1.0, 0.05), row("Britain", 0.667, 0.1)]);
    expect(s.cumulativeTesting).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test -- calibration`
Expected: FAIL — `cumulativeTesting` does not exist.

- [ ] **Step 3: Implement**

In `app/lib/calibration.ts`, add to `CalibrationSummary`:

```ts
  cumulative: CumulativePoint[];
  cumulativeTesting: CumulativePoint[]; // cumulative over reconstructed rows (faded chart series)
```

Add a small helper above `summarize` (DRY the cumulative walk):

```ts
function cumulativeSeries(rows: CalibrationRow[]): CumulativePoint[] {
  let sumTop3 = 0;
  let sumBrier = 0;
  return rows.map((r, i) => {
    sumTop3 += r.top3;
    sumBrier += r.brierContrib;
    return {
      round: i + 1,
      gp: r.gp,
      top3Rate: round2(sumTop3 / (i + 1)),
      meanBrier: round3(sumBrier / (i + 1)),
    };
  });
}
```

In `summarize`, compute `const reconstructed = index.filter((r) => r.reconstructed);` alongside
`live`, replace the inline `cumulative` map with `cumulativeSeries(live)`, and add
`cumulativeTesting: cumulativeSeries(reconstructed)` to BOTH return paths (the `nRaces === 0`
early return and the main return). Keep `top3Rate`/`meanBrier`/`nRaces` exactly as they are
(live-only). Example main return:

```ts
  return {
    nRaces,
    nReconstructed,
    top3Rate: round2(sumTop3 / nRaces),
    meanBrier: round3(sumBrier / nRaces),
    cumulative: cumulativeSeries(live),
    cumulativeTesting: cumulativeSeries(reconstructed),
    status,
  };
```

(You may refactor the existing live `cumulative`/`sumTop3`/`sumBrier` to reuse `cumulativeSeries`
too, as long as the returned `top3Rate`/`meanBrier` values are unchanged — verify against the
existing tests.)

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- calibration`
Expected: PASS (existing + 2 new). Existing tests unchanged (additive field).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean. (Adding a required `cumulativeTesting` — the only constructor is `summarize`, both returns set it.)

```bash
git add app/lib/calibration.ts app/lib/calibration.test.ts
git commit -m "feat: summarize emits cumulativeTesting for the faded pre-launch chart series"
```

---

### Task 3: `chart-path.ts` geometry helpers

**Files:**
- Modify: `app/lib/chart-path.ts`
- Test: `app/lib/chart-path.test.ts`

**Interfaces:**
- Produces: `pointCoords(norm, w, h, pad): Pt[]` (per-point x/y), `yLevel(value, h, pad): number` (y for a 0..1 gridline), `Pt = { x: number; y: number }`. `buildLinePath` refactored to use `pointCoords` (same output).

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/chart-path.test.ts` (create it if absent, importing what it needs):

```ts
import { describe, it, expect } from "vitest";
import { buildLinePath, pointCoords, yLevel } from "./chart-path";

const PAD = { top: 16, right: 44, bottom: 30, left: 34 };
const W = 640, H = 240;

describe("pointCoords", () => {
  it("returns one coord per value, y inverted (1 = top)", () => {
    const pts = pointCoords([1, 0], W, H, PAD);
    expect(pts).toHaveLength(2);
    expect(pts[0].y).toBeCloseTo(PAD.top);                 // value 1 -> top
    expect(pts[1].y).toBeCloseTo(H - PAD.bottom);          // value 0 -> baseline
    expect(pts[0].x).toBeCloseTo(PAD.left);                // first point at left
    expect(pts[1].x).toBeCloseTo(W - PAD.right);           // last point at right
  });

  it("buildLinePath is pointCoords joined as an SVG points string", () => {
    const pts = pointCoords([0.5, 0.8], W, H, PAD);
    expect(buildLinePath([0.5, 0.8], W, H, PAD)).toBe(pts.map((p) => `${p.x},${p.y}`).join(" "));
  });
});

describe("yLevel", () => {
  it("maps 0 to baseline, 1 to top, 0.5 to the middle of the plot box", () => {
    expect(yLevel(0, H, PAD)).toBeCloseTo(H - PAD.bottom);
    expect(yLevel(1, H, PAD)).toBeCloseTo(PAD.top);
    expect(yLevel(0.5, H, PAD)).toBeCloseTo(PAD.top + (H - PAD.top - PAD.bottom) / 2);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test -- chart-path`
Expected: FAIL — `pointCoords` / `yLevel` not exported.

- [ ] **Step 3: Implement (refactor buildLinePath onto pointCoords)**

In `app/lib/chart-path.ts`, add and refactor:

```ts
export interface Pt {
  x: number;
  y: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function pointCoords(
  norm: number[],
  w = 640,
  h = 220,
  pad: ChartPad = { top: 16, right: 16, bottom: 30, left: 16 },
): Pt[] {
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const n = norm.length;
  return norm.map((v, i) => {
    const x = pad.left + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const clamped = Math.max(0, Math.min(1, v));
    const y = pad.top + innerH * (1 - clamped);
    return { x: round2(x), y: round2(y) };
  });
}

export function yLevel(
  value: number,
  h = 220,
  pad: ChartPad = { top: 16, right: 16, bottom: 30, left: 16 },
): number {
  const innerH = h - pad.top - pad.bottom;
  return round2(pad.top + innerH * (1 - Math.max(0, Math.min(1, value))));
}

export function buildLinePath(
  norm: number[],
  w = 640,
  h = 220,
  pad: ChartPad = { top: 16, right: 16, bottom: 30, left: 16 },
): string {
  return pointCoords(norm, w, h, pad).map((p) => `${p.x},${p.y}`).join(" ");
}
```

(Delete the old `buildLinePath` body; the refactored one produces identical output — the existing chart-path tests, if any, stay green.)

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- chart-path`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add app/lib/chart-path.ts app/lib/chart-path.test.ts
git commit -m "feat: chart-path pointCoords + yLevel helpers for markers and gridlines"
```

---

### Task 4: `CalibrationChart` rewrite + page wiring + reveal animation

**Files:**
- Rewrite: `app/components/CalibrationChart.tsx`
- Modify: `app/accuracy/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `CumulativePoint` (with `cumulative` + `cumulativeTesting` from Task 2), `pointCoords`/`yLevel`/`buildLinePath` (Task 3).
- Produces: `CalibrationChart({ live, testing })` renders the enriched SVG.

**Before writing the animation CSS, load the `design-motion-principles` skill** and keep the reveal restrained (ease-out, no bounce/overshoot/loop; line-draws once).

- [ ] **Step 1: Rewrite the component**

Replace `app/components/CalibrationChart.tsx` entirely with:

```tsx
// Cumulative season calibration chart (M7): a dependency-free, server-rendered inline-SVG line
// chart with a y-axis scale, point markers, an endpoint value label, and a faded "pre-launch"
// (reconstructed) series. Primary solid line = cumulative live top-3 hit rate (0..1). Dashed
// line = live Brier as 1 - meanBrier on the SAME 0..1 axis (higher = better-calibrated). Faded
// solid line = pre-launch (testing) top-3, shown for context, NOT counted in the headline.
// Reveal animation is pure CSS (see globals.css), gated by prefers-reduced-motion. No client JS.
import type { CumulativePoint } from "@/app/lib/calibration";
import { buildLinePath, pointCoords, yLevel, type ChartPad } from "@/app/lib/chart-path";

const W = 640;
const H = 240;
const PAD: ChartPad = { top: 16, right: 44, bottom: 30, left: 34 };
const LEVELS = [0, 0.5, 1];

const shortGp = (gp: string) => (gp.length > 6 ? gp.slice(0, 3).toUpperCase() : gp);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function CalibrationChart({
  live,
  testing,
}: {
  live: CumulativePoint[];
  testing: CumulativePoint[];
}) {
  if (live.length < 2 && testing.length < 2) return null;

  const liveTop3 = buildLinePath(live.map((p) => p.top3Rate), W, H, PAD);
  const liveBrier = buildLinePath(live.map((p) => 1 - p.meanBrier), W, H, PAD);
  const testTop3 = buildLinePath(testing.map((p) => p.top3Rate), W, H, PAD);
  const liveMarks = pointCoords(live.map((p) => p.top3Rate), W, H, PAD);
  const last = live.length >= 1 ? live[live.length - 1] : null;
  const lastMark = liveMarks.length ? liveMarks[liveMarks.length - 1] : null;

  return (
    <figure className="mt-6">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cumulative season calibration by round: live top-3 hit rate and Brier score, with pre-launch rounds shown for context"
        className="w-full"
      >
        {/* y-axis gridlines + labels (0 / 50% / 100%) */}
        {LEVELS.map((lv) => {
          const y = yLevel(lv, H, PAD);
          return (
            <g key={lv} className="chart-fade">
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                className="stroke-ink/10"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-muted font-grotesk"
                fontSize={10}
              >
                {pct(lv)}
              </text>
            </g>
          );
        })}

        {/* faded pre-launch (testing) top-3 line -- context only, no markers */}
        {testing.length >= 2 && (
          <polyline
            points={testTop3}
            fill="none"
            pathLength={1}
            className="stroke-muted chart-draw chart-draw--testing"
            strokeWidth={1.5}
            opacity={0.35}
          />
        )}

        {/* live Brier (dashed, fades in -- not line-drawn since dash pattern is in use) */}
        {live.length >= 2 && (
          <polyline
            points={liveBrier}
            fill="none"
            className="stroke-muted chart-fade"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.6}
          />
        )}

        {/* live top-3 (primary, line-drawn) + markers */}
        {live.length >= 2 && (
          <polyline
            points={liveTop3}
            fill="none"
            pathLength={1}
            className="stroke-accent chart-draw"
            strokeWidth={2.5}
          />
        )}
        {liveMarks.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r={3} className="fill-accent chart-fade" />
        ))}

        {/* endpoint value label on the live line */}
        {last && lastMark && (
          <text
            x={Math.min(lastMark.x + 6, W - 2)}
            y={lastMark.y - 6}
            textAnchor="end"
            className="fill-ink font-grotesk chart-fade"
            fontSize={11}
            fontWeight={600}
          >
            {pct(last.top3Rate)}
          </text>
        )}

        {/* x-axis: live round labels */}
        {live.map((p, i) => (
          <text
            key={p.round}
            x={liveMarks[i]?.x ?? 0}
            y={H - 10}
            textAnchor="middle"
            className="fill-muted font-grotesk chart-fade"
            fontSize={10}
          >
            {shortGp(p.gp)}
          </text>
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap gap-4 font-grotesk text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-accent" /> live top-3 hit rate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-muted opacity-60" /> Brier (higher =
          better-calibrated)
        </span>
        {testing.length >= 2 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-muted opacity-40" /> pre-launch (not
            counted)
          </span>
        )}
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2: Wire the page**

In `app/accuracy/page.tsx`:

Change the chart gate (currently `{summary.nRaces >= 3 && <CalibrationChart series={summary.cumulative} />}`) to render on ≥2 total scored rounds and pass both series:

```tsx
          {index.length >= 2 && (
            <CalibrationChart live={summary.cumulative} testing={summary.cumulativeTesting} />
          )}
```

(The component itself no-ops if both series have <2 points, so this is safe.)

- [ ] **Step 3: Add the reveal animation CSS**

In `app/globals.css`, append (following the existing `@keyframes` + reduced-motion pattern already in the file):

```css
/* /accuracy calibration chart reveal (pure CSS, no JS) */
@keyframes chartDraw {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}
.chart-draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: chartDraw 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.chart-draw--testing {
  animation-duration: 0.7s;
  animation-delay: 0.15s;
}
.chart-fade {
  opacity: 0;
  animation: fogIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: 0.55s;
}
@media (prefers-reduced-motion: reduce) {
  .chart-draw,
  .chart-draw--testing,
  .chart-fade {
    animation: none;
    stroke-dashoffset: 0;
    opacity: 1;
  }
}
```

Note: the `.chart-fade` markers/labels set `opacity: 0` initially and fade in via `fogIn` (an
existing keyframe in globals.css that animates opacity/transform). If `fogIn` also translates,
that is fine for the labels/markers. VERIFY `fogIn` exists in globals.css (it does — used by
`AsciiFog`); if its transform looks wrong on SVG text, define a local `@keyframes chartFadeIn {
from { opacity: 0 } to { opacity: 1 } }` and use that instead. The faded testing polyline keeps
its inline `opacity={0.35}`; the reduced-motion rule's `opacity: 1` must NOT override it — scope
the reduced-motion `opacity: 1` to `.chart-fade` only (as written above the polylines use
`.chart-draw`, not `.chart-fade`, so their inline opacity is preserved).

- [ ] **Step 4: Typecheck, full suite, build**

Run: `npx tsc --noEmit` → clean.
Run: `npm run test` → all pass (no regression).
Run: `npm run build` → clean; `/accuracy` still builds.

- [ ] **Step 5: Commit**

```bash
git add app/components/CalibrationChart.tsx app/accuracy/page.tsx app/globals.css
git commit -m "feat: enrich /accuracy chart with y-axis scale, markers, faded pre-launch series, and a CSS reveal"
```

---

## Self-Review

**Spec coverage:**
- §1 GB admin `reconstructed` override → Task 1. ✓ (owner curl in §9 is an ops step, not code.)
- §2 `cumulativeTesting` → Task 2. ✓
- §3 chart scaffolding (y-scale, gridlines, markers, endpoint value, faded testing, Brier framing, tokens, a11y) → Task 4 component + Task 3 helpers. ✓
- §4 gate lowered to ≥2 total scored → Task 4 Step 2. ✓
- §5 reveal animation (CSS line-draw + staggered fade, reduced-motion gated) → Task 4 Step 3 (+ load design-motion-principles). ✓
- §6 non-goals (no hover/JS, no dual-axis, no summarize-headline change) → honored. ✓
- §7 tests (summarize cumulativeTesting, chart-path helpers; admin/chart limits acknowledged) → Tasks 2/3; Task 1/4 verified via tsc+build+visual. ✓
- §8 files (6) → all present. ✓

**Placeholder scan:** none — full code in every step. The one conditional (Task 4 Step 3, `fogIn` transform on SVG text) names the exact check + the fallback keyframe.

**Type consistency:** `CumulativePoint` shape (`round, gp, top3Rate, meanBrier`) identical across `cumulativeSeries` (Task 2), `pointCoords` inputs, and the component. `CalibrationSummary.cumulativeTesting` (Task 2) is consumed by the page (Task 4 Step 2) and passed as the component's `testing` prop. `pointCoords`/`yLevel`/`buildLinePath` signatures (Task 3) match the component's calls. `ChartPad` reused from chart-path. The admin `reconstructed` boolean (Task 1) matches `WriteDeps.reconstructed`.
```
