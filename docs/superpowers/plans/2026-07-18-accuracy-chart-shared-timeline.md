# /accuracy chart shared calendar timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Position both chart cumulative series on one shared calendar timeline (by absolute round index) instead of each stretching full-width, so testing rounds sit left and live rounds right as disjoint segments.

**Architecture:** `CumulativePoint` gains `pos` (absolute index in the full ordered calibration index). A `plotPoints(values, positions, total, …)` helper maps x by `pos/(total-1)`. The chart uses it for both series + labels every round.

**Tech Stack:** TypeScript (Next.js), vitest.

## Global Constraints

- **Additive `pos`** on `CumulativePoint`; do not change `round`/`top3Rate`/`meanBrier`/headline/`nRaces`.
- `pointCoords`/`yLevel`/`buildLinePath` UNCHANGED (y-scale + existing tests depend on them).
- Chart stays server-rendered (no `use client`/hover); animation/legend/y-axis/markers unchanged.
- No em-dashes in copy. Round numbers reaching output.
- **Commits:** conventional, description only. NO AI attribution / Co-Authored-By / robot emoji.
- TS tests: `npm run test`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.

## File Structure

- `app/lib/calibration.ts` (MODIFY) — `CumulativePoint.pos` + compute.
- `app/lib/chart-path.ts` (MODIFY) — `plotPoints`.
- `app/components/CalibrationChart.tsx` (MODIFY) — shared-x geometry + all-round labels.
- Tests: `app/lib/calibration.test.ts`, `app/lib/chart-path.test.ts`.

---

### Task 1: `CumulativePoint.pos` (absolute calendar position)

**Files:**
- Modify: `app/lib/calibration.ts`
- Test: `app/lib/calibration.test.ts`

**Interfaces:**
- Produces: `CumulativePoint.pos: number` = 0-based index of the round in the full ordered index. `cumulativeSeries(rows, posOf)` stamps it; `summarize` supplies `posOf`.

- [ ] **Step 1: Write the failing test**

Append to `app/lib/calibration.test.ts` (reuse the `row(gp, top3, brier, reconstructed?)` helper):

```ts
describe("cumulative pos (shared timeline)", () => {
  it("stamps the absolute index in the full calendar order on each point", () => {
    const index = [
      row("Australia", 0.3, 0.4, true),  // pos 0
      row("China", 0.0, 0.5, true),      // pos 1
      row("Austria", 1.0, 0.05),         // pos 2 (live)
      row("Britain", 0.667, 0.1),        // pos 3 (live)
    ];
    const s = summarize(index);
    expect(s.cumulativeTesting.map((p) => p.pos)).toEqual([0, 1]);
    expect(s.cumulative.map((p) => p.pos)).toEqual([2, 3]); // live rounds keep their calendar pos
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test -- calibration`
Expected: FAIL — `pos` is undefined on the points.

- [ ] **Step 3: Implement**

In `app/lib/calibration.ts`:

Add `pos` to `CumulativePoint`:

```ts
export interface CumulativePoint {
  round: number;
  pos: number; // 0-based index in the full ordered calibration index (shared-timeline x)
  gp: string;
  top3Rate: number;
  meanBrier: number;
}
```

Change `cumulativeSeries` to take a position lookup and stamp `pos`:

```ts
function cumulativeSeries(
  rows: CalibrationRow[],
  posOf: (gp: string) => number,
): CumulativePoint[] {
  let sumTop3 = 0;
  let sumBrier = 0;
  return rows.map((r, i) => {
    sumTop3 += r.top3;
    sumBrier += r.brierContrib;
    return {
      round: i + 1,
      pos: posOf(r.gp),
      gp: r.gp,
      top3Rate: round2(sumTop3 / (i + 1)),
      meanBrier: round3(sumBrier / (i + 1)),
    };
  });
}
```

In `summarize`, define `posOf` from the full index (before the `nRaces === 0` early return) and
pass it to every `cumulativeSeries(...)` call:

```ts
  const live = index.filter((r) => !r.reconstructed);
  const reconstructed = index.filter((r) => r.reconstructed);
  const posOf = (gp: string) => index.findIndex((r) => r.gp === gp);
```

Then update both `cumulativeSeries(live)` → `cumulativeSeries(live, posOf)` and
`cumulativeSeries(reconstructed)` → `cumulativeSeries(reconstructed, posOf)` in BOTH the
`nRaces === 0` early return and the main return.

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- calibration`
Expected: PASS (existing + new). Existing tests that assert `round`/`gp`/values still pass
(`pos` is additive; if any existing test deep-equals a whole `CumulativePoint`, add `pos` to it).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add app/lib/calibration.ts app/lib/calibration.test.ts
git commit -m "feat: stamp absolute round pos on cumulative points for the shared-timeline chart"
```

---

### Task 2: `plotPoints` shared-x geometry helper

**Files:**
- Modify: `app/lib/chart-path.ts`
- Test: `app/lib/chart-path.test.ts`

**Interfaces:**
- Produces: `plotPoints(values, positions, total, w, h, pad): Pt[]` — x from `positions[i]/(total-1)`, y from the value.

- [ ] **Step 1: Write the failing test**

Append to `app/lib/chart-path.test.ts`:

```ts
import { plotPoints } from "./chart-path";

describe("plotPoints (shared timeline)", () => {
  const PAD = { top: 16, right: 44, bottom: 30, left: 34 };
  const W = 640, H = 240;

  it("maps pos 0 to the left edge, pos total-1 to the right edge, y from value", () => {
    const pts = plotPoints([1, 0.5], [0, 4], 5, W, H, PAD); // total 5
    expect(pts[0].x).toBeCloseTo(PAD.left);              // pos 0
    expect(pts[0].y).toBeCloseTo(PAD.top);               // value 1 -> top
    expect(pts[1].x).toBeCloseTo(W - PAD.right);         // pos 4 = total-1
  });

  it("places a middle position proportionally", () => {
    const innerW = W - PAD.left - PAD.right;
    const pts = plotPoints([0.5], [2], 5, W, H, PAD);    // pos 2 of 0..4 -> halfway
    expect(pts[0].x).toBeCloseTo(PAD.left + innerW * (2 / 4));
  });

  it("centers a single-round timeline (total <= 1)", () => {
    const innerW = W - PAD.left - PAD.right;
    const pts = plotPoints([0.7], [0], 1, W, H, PAD);
    expect(pts[0].x).toBeCloseTo(PAD.left + innerW / 2);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test -- chart-path`
Expected: FAIL — `plotPoints` not exported.

- [ ] **Step 3: Implement**

Add to `app/lib/chart-path.ts` (reuse the existing `round2` + `Pt`/`ChartPad`):

```ts
export function plotPoints(
  values: number[],
  positions: number[],
  total: number,
  w = 640,
  h = 220,
  pad: ChartPad = { top: 16, right: 16, bottom: 30, left: 16 },
): Pt[] {
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  return values.map((v, i) => {
    const frac = total <= 1 ? 0.5 : positions[i] / (total - 1);
    const x = pad.left + innerW * frac;
    const clamped = Math.max(0, Math.min(1, v));
    const y = pad.top + innerH * (1 - clamped);
    return { x: round2(x), y: round2(y) };
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- chart-path`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add app/lib/chart-path.ts app/lib/chart-path.test.ts
git commit -m "feat: plotPoints maps series to a shared-timeline x by absolute round position"
```

---

### Task 3: Chart — shared-x rendering + all-round labels

**Files:**
- Modify: `app/components/CalibrationChart.tsx`

**Interfaces:**
- Consumes: `CumulativePoint.pos` (Task 1), `plotPoints` (Task 2).

- [ ] **Step 1: Switch the geometry to `plotPoints` on a shared total**

In `app/components/CalibrationChart.tsx`, update the import to add `plotPoints`:

```ts
import { plotPoints, yLevel, type ChartPad } from "@/app/lib/chart-path";
```

(Remove `buildLinePath`/`pointCoords` from the import if now unused — verify with tsc.)

Replace the geometry block (the `buildLinePath(...)` / `pointCoords(...)` lines that build
`liveTop3`, `liveBrier`, `testTop3`, `liveMarks`, `last`, `lastMark`) with:

```ts
  const total = live.length + testing.length;
  const toStr = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  const liveMarks = plotPoints(live.map((p) => p.top3Rate), live.map((p) => p.pos), total, W, H, PAD);
  const liveTop3 = toStr(liveMarks);
  const liveBrier = toStr(plotPoints(live.map((p) => 1 - p.meanBrier), live.map((p) => p.pos), total, W, H, PAD));
  const testTop3 = toStr(plotPoints(testing.map((p) => p.top3Rate), testing.map((p) => p.pos), total, W, H, PAD));
  const last = live.length >= 1 ? live[live.length - 1] : null;
  const lastMark = liveMarks.length ? liveMarks[liveMarks.length - 1] : null;
  const xForPos = (pos: number) =>
    PAD.left + (W - PAD.left - PAD.right) * (total <= 1 ? 0.5 : pos / (total - 1));
  const roundLabels = [
    ...testing.map((p) => ({ pos: p.pos, gp: p.gp, testing: true })),
    ...live.map((p) => ({ pos: p.pos, gp: p.gp, testing: false })),
  ];
```

The polyline `points={liveTop3}` / `points={liveBrier}` / `points={testTop3}` and the
`liveMarks.map(...)` markers + the endpoint label (`lastMark`) all keep working unchanged (same
variable names, now shared-x).

- [ ] **Step 2: Replace the x-axis labels with all-round shared-x labels**

Replace the existing x-axis label block (the `live.map((p, i) => <text ... x={liveMarks[i]?.x} ...>`
loop) with a loop over ALL rounds at their shared-x, testing de-emphasized:

```tsx
        {/* x-axis: every round at its shared-timeline position (testing de-emphasized) */}
        {roundLabels.map((l) => (
          <text
            key={l.gp}
            x={xForPos(l.pos)}
            y={H - 10}
            textAnchor="middle"
            className="fill-muted font-grotesk chart-fade"
            fontSize={10}
            opacity={l.testing ? 0.5 : 1}
          >
            {shortGp(l.gp)}
          </text>
        ))}
```

(`shortGp` already exists in the file.)

- [ ] **Step 3: Typecheck, full suite, build**

Run: `npx tsc --noEmit` → clean (remove any now-unused import flagged).
Run: `npm run test` → all pass.
Run: `npm run build` → clean; `/accuracy` builds.

- [ ] **Step 4: Commit**

```bash
git add app/components/CalibrationChart.tsx
git commit -m "feat: chart positions both series on a shared calendar timeline with all-round labels"
```

---

## Self-Review

**Spec coverage:**
- §3 `CumulativePoint.pos` + compute → Task 1. ✓
- §4 `plotPoints` → Task 2. ✓
- §5 shared-x rendering + all-round labels → Task 3. ✓
- §6 tests (pos, plotPoints edges) → Tasks 1/2. ✓
- §2 non-goals (headline/animation/legend/y-axis/markers unchanged; buildLinePath/yLevel unchanged) → honored. ✓

**Placeholder scan:** none — full code in every step. The one verify note (remove unused
`buildLinePath`/`pointCoords` import) is a concrete tsc check with the action stated.

**Type consistency:** `CumulativePoint.pos: number` (Task 1) is read by the chart's
`p.pos` (Task 3) and passed as `positions` to `plotPoints` (Task 2). `plotPoints(values,
positions, total, w, h, pad): Pt[]` signature matches the chart's calls. `xForPos` uses the same
`pos/(total-1)` formula as `plotPoints` for label alignment. `total = live.length +
testing.length` is the shared denominator across lines, markers, and labels.
```
