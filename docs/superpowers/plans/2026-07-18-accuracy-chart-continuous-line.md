# /accuracy chart: one continuous line + round-number labels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two disjoint chart lines with ONE continuous cumulative line over all rounds (pre-launch faded, live solid+markers, sharing the boundary point), switch x-labels to round numbers (fixes the Australia/Austria "AUS" collision + mixed naming), and thin labels so they don't crowd as the season grows.

**Architecture:** `summarize` emits `cumulativeAll` (cumulative over the full index, each point tagged `reconstructed`). The chart draws one line split into a faded pre-launch sub-path + a solid live sub-path that share the boundary point. A `labelStride` helper thins x-labels.

**Tech Stack:** TypeScript (Next.js), vitest.

## Global Constraints

- **Headline `top3Rate`/`meanBrier`/`nRaces` stay live-only + unchanged.** Only the CHART line changes to all-rounds.
- Chart stays server-rendered (no `use client`/hover). Reuse existing CSS classes (`chart-draw`, `chart-fade`); no globals.css change.
- No em-dashes. Round numbers reaching output.
- `plotPoints`/`yLevel` unchanged.
- **Commits:** conventional, description only. NO AI attribution / Co-Authored-By / robot emoji.
- TS tests: `npm run test`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.

## File Structure

- `app/lib/calibration.ts` (MODIFY) — `CumulativePoint.reconstructed` + `CalibrationSummary.cumulativeAll`.
- `app/lib/chart-path.ts` (MODIFY) — `labelStride`.
- `app/components/CalibrationChart.tsx` (REWRITE) — single continuous line + round-number labels + thinning.
- `app/accuracy/page.tsx` (MODIFY) — pass `all={summary.cumulativeAll}`.
- Tests: `app/lib/calibration.test.ts`, `app/lib/chart-path.test.ts`.

---

### Task 1: `cumulativeAll` + `CumulativePoint.reconstructed`

**Files:**
- Modify: `app/lib/calibration.ts`
- Test: `app/lib/calibration.test.ts`

**Interfaces:**
- Produces: `CumulativePoint.reconstructed?: boolean`; `CalibrationSummary.cumulativeAll: CumulativePoint[]` (cumulative over the full index, in order).

- [ ] **Step 1: Write the failing test**

Append to `app/lib/calibration.test.ts`:

```ts
describe("cumulativeAll (single continuous line)", () => {
  it("is the cumulative over the full index in order, tagged reconstructed", () => {
    const index = [
      row("Australia", 0.3, 0.4, true),
      row("China", 0.0, 0.5, true),
      row("Austria", 1.0, 0.05),
      row("Britain", 0.667, 0.1),
    ];
    const s = summarize(index);
    expect(s.cumulativeAll.map((p) => p.gp)).toEqual(["Australia", "China", "Austria", "Britain"]);
    expect(s.cumulativeAll.map((p) => p.round)).toEqual([1, 2, 3, 4]);
    expect(s.cumulativeAll.map((p) => p.pos)).toEqual([0, 1, 2, 3]);
    expect(s.cumulativeAll.map((p) => !!p.reconstructed)).toEqual([true, true, false, false]);
  });

  it("is present (empty) with no rows", () => {
    expect(summarize([]).cumulativeAll).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test -- calibration`
Expected: FAIL — `cumulativeAll` / `reconstructed` missing.

- [ ] **Step 3: Implement**

In `app/lib/calibration.ts`:

Add `reconstructed?: boolean` to `CumulativePoint` (after `meanBrier`):

```ts
export interface CumulativePoint {
  round: number;
  pos: number;
  gp: string;
  top3Rate: number;
  meanBrier: number;
  reconstructed?: boolean; // true for pre-launch (post-hoc) rounds -> faded chart segment
}
```

In `cumulativeSeries`, stamp it on each point (add to the returned object):

```ts
      top3Rate: round2(sumTop3 / (i + 1)),
      meanBrier: round3(sumBrier / (i + 1)),
      reconstructed: r.reconstructed,
```

Add `cumulativeAll: CumulativePoint[]` to `CalibrationSummary` (near `cumulative`):

```ts
  cumulative: CumulativePoint[];
  cumulativeAll: CumulativePoint[]; // cumulative over ALL rounds (the single continuous chart line)
```

In `summarize`, compute it once and add to BOTH returns:

```ts
  const posOf = (gp: string) => index.findIndex((r) => r.gp === gp);
  const cumulativeAll = cumulativeSeries(index, posOf);
```

(add `cumulativeAll,` to the `nRaces === 0` return object and the main return object.)

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- calibration`
Expected: PASS (existing + new). If any existing test deep-equals a whole `CumulativePoint` or `CalibrationSummary`, add the new fields.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add app/lib/calibration.ts app/lib/calibration.test.ts
git commit -m "feat: summarize emits cumulativeAll (all-rounds) with a reconstructed tag per point"
```

---

### Task 2: `labelStride` helper

**Files:**
- Modify: `app/lib/chart-path.ts`
- Test: `app/lib/chart-path.test.ts`

**Interfaces:**
- Produces: `labelStride(total: number, max = 12): number` = `Math.max(1, Math.ceil(total / max))`.

- [ ] **Step 1: Write the failing test**

Append to `app/lib/chart-path.test.ts`:

```ts
import { labelStride } from "./chart-path";

describe("labelStride", () => {
  it("is 1 while total fits under max", () => {
    expect(labelStride(9)).toBe(1);
    expect(labelStride(12)).toBe(1);
    expect(labelStride(1)).toBe(1);
  });
  it("grows so labels stay under max", () => {
    expect(labelStride(24)).toBe(2);
    expect(labelStride(25)).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test -- chart-path`
Expected: FAIL — `labelStride` not exported.

- [ ] **Step 3: Implement**

Add to `app/lib/chart-path.ts`:

```ts
export function labelStride(total: number, max = 12): number {
  return Math.max(1, Math.ceil(total / max));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- chart-path`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add app/lib/chart-path.ts app/lib/chart-path.test.ts
git commit -m "feat: labelStride thins chart x-axis labels as rounds accumulate"
```

---

### Task 3: Chart — single continuous line + round-number labels

**Files:**
- Rewrite: `app/components/CalibrationChart.tsx`
- Modify: `app/accuracy/page.tsx`

**Interfaces:**
- Consumes: `CalibrationSummary.cumulativeAll` (Task 1), `plotPoints`/`yLevel`/`labelStride` (Task 2 + existing).
- Produces: `CalibrationChart({ all })`.

- [ ] **Step 1: Rewrite the component**

Replace `app/components/CalibrationChart.tsx` entirely with:

```tsx
// Season calibration chart (M7): a dependency-free, server-rendered inline-SVG chart. ONE
// continuous cumulative top-3 line over ALL scored rounds; the pre-launch (reconstructed) segment
// is faded and the live segment is solid with markers, the two sharing the boundary point so the
// line is continuous. A dashed muted line shows 1 - Brier on the same 0..1 axis (higher =
// better-calibrated). X-axis = round numbers, thinned as rounds accumulate. The HEADLINE stats
// (elsewhere) count live races only; this line is a whole-season trend. Reveal is pure CSS
// (globals.css), gated by prefers-reduced-motion. No client JS.
import type { CumulativePoint } from "@/app/lib/calibration";
import { plotPoints, yLevel, labelStride, type ChartPad } from "@/app/lib/chart-path";

const W = 640;
const H = 240;
const PAD: ChartPad = { top: 16, right: 44, bottom: 30, left: 34 };
const LEVELS = [0, 0.5, 1];
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function CalibrationChart({ all }: { all: CumulativePoint[] }) {
  const total = all.length;
  if (total < 2) return null;

  const pts = plotPoints(all.map((p) => p.top3Rate), all.map((_, i) => i), total, W, H, PAD);
  const brierPts = plotPoints(all.map((p) => 1 - p.meanBrier), all.map((_, i) => i), total, W, H, PAD);
  const toStr = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");

  // Split the single line into a faded pre-launch sub-path and a solid live sub-path that share the
  // boundary point (continuous). Pre-launch rounds precede live rounds in calendar order.
  let firstLiveIdx = all.findIndex((p) => !p.reconstructed);
  if (firstLiveIdx === -1) firstLiveIdx = total; // no live rounds -> everything faded
  const fadedPts = firstLiveIdx > 0 ? pts.slice(0, firstLiveIdx + 1) : [];
  const solidPts = firstLiveIdx < total ? pts.slice(firstLiveIdx) : [];
  const markers = pts.filter((_, i) => !all[i].reconstructed);
  const lastPt = pts[total - 1];
  const stride = labelStride(total);

  return (
    <figure className="mt-6">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cumulative top-3 hit rate across all rounds (pre-launch rounds faded, live rounds solid) and Brier score"
        className="w-full"
      >
        {LEVELS.map((lv) => {
          const y = yLevel(lv, H, PAD);
          return (
            <g key={lv} className="chart-fade">
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} className="stroke-ink/10" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" className="fill-muted font-grotesk" fontSize={10}>
                {pct(lv)}
              </text>
            </g>
          );
        })}

        {/* Brier (dashed, all rounds, fades in) */}
        <polyline
          points={toStr(brierPts)}
          fill="none"
          className="stroke-muted chart-fade"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.5}
        />

        {/* single continuous top-3 line: faded pre-launch sub-path + solid live sub-path */}
        {fadedPts.length >= 2 && (
          <polyline
            points={toStr(fadedPts)}
            fill="none"
            pathLength={1}
            className="stroke-muted chart-draw chart-draw--testing"
            strokeWidth={2}
            opacity={0.4}
          />
        )}
        {solidPts.length >= 2 && (
          <polyline
            points={toStr(solidPts)}
            fill="none"
            pathLength={1}
            className="stroke-accent chart-draw"
            strokeWidth={2.5}
          />
        )}
        {markers.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r={4} className="fill-accent chart-fade" />
        ))}

        {/* endpoint value = final all-rounds cumulative */}
        {lastPt && (
          <text
            x={Math.min(lastPt.x + 6, W - 2)}
            y={lastPt.y - 6}
            textAnchor="end"
            className="fill-ink font-grotesk chart-fade"
            fontSize={11}
            fontWeight={600}
          >
            {pct(all[total - 1].top3Rate)}
          </text>
        )}

        {/* x-axis: round numbers, thinned; live rounds always labeled */}
        {all.map((p, i) => {
          if (p.reconstructed && i % stride !== 0) return null;
          return (
            <text
              key={p.gp}
              x={pts[i].x}
              y={H - 10}
              textAnchor="middle"
              className="fill-muted font-grotesk chart-fade"
              fontSize={10}
              opacity={p.reconstructed ? 0.5 : 1}
            >
              {`R${p.round}`}
            </text>
          );
        })}
      </svg>

      <figcaption className="mt-2 flex flex-wrap gap-4 font-grotesk text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-accent" /> live top-3 (cumulative)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-muted opacity-40" /> pre-launch (not counted)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-muted opacity-60" /> Brier (higher = better-calibrated)
        </span>
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2: Wire the page**

In `app/accuracy/page.tsx`, change the chart element (currently `<CalibrationChart live={summary.cumulative} testing={summary.cumulativeTesting} />`) to:

```tsx
          {index.length >= 2 && <CalibrationChart all={summary.cumulativeAll} />}
```

- [ ] **Step 3: Typecheck, full suite, build**

Run: `npx tsc --noEmit` → clean.
Run: `npm run test` → all pass.
Run: `npm run build` → clean; `/accuracy` builds.

- [ ] **Step 4: Commit**

```bash
git add app/components/CalibrationChart.tsx app/accuracy/page.tsx
git commit -m "feat: chart is one continuous line (pre-launch faded, live solid) with thinned round-number labels"
```

---

## Self-Review

**Spec coverage:**
- §1a one continuous line (cumulativeAll + reconstructed tag; faded/solid split sharing the boundary) → Tasks 1, 3. ✓
- §1b round-number labels (fixes Australia/Austria collision + mixed naming) → Task 3 (`R{round}`, `shortGp` dropped). ✓
- §1c label thinning → Task 2 (`labelStride`) + Task 3 (stride gate; live always labeled). ✓
- §2 non-goals (headline unchanged, server-rendered, no globals.css change) → honored (reuses `chart-draw`/`chart-fade`). ✓
- §3 files → all covered. ✓
- §4 rendering detail → Task 3 component. ✓

**Placeholder scan:** none — full code in every step.

**Type consistency:** `CumulativePoint.reconstructed?: boolean` (Task 1) is read by the chart's `p.reconstructed` (Task 3). `CalibrationSummary.cumulativeAll` (Task 1) is passed as the component's `all` prop (Task 3 Step 2). `labelStride(total, max)` (Task 2) matches the chart's `labelStride(total)` call. `plotPoints`/`yLevel` signatures unchanged. The component no-ops when `total < 2`; the page still gates on `index.length >= 2`.
```
