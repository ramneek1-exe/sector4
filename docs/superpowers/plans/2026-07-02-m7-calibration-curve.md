# M7 Season Calibration Curve — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/accuracy`, a read-only "track record" page that makes the season podium-calibration record visible from the data the M5 cron already logs.

**Architecture:** A pure, tested logic module (`app/lib/calibration.ts`) summarizes the Blob-stored season calibration index into a display model. A dependency-free inline-SVG chart component renders the cumulative trend. A server-component page reads the Blob index live, renders four honest states by race count, and adds an "Accuracy" nav link. No Python, cron, R17, or Blob-write changes — read-only over existing data.

**Tech Stack:** Next.js App Router (server components), TypeScript, Tailwind (theme tokens `ink`/`muted`/`accent`/`bg`), Vitest, `@vercel/blob` via the existing `app/lib/blob.ts`.

## Global Constraints

- **Round every number that reaches output.** All rounding is centralized in `app/lib/calibration.ts`; display-only formatting (`.toFixed(3)`, `Math.round(x*100)`) never introduces raw floats.
- **No em-dashes in any user-facing copy** (house rule — owner wants non-AI-tell text).
- **Display-only scope:** no isotonic/Platt fit, no bands → % flip, no baseline comparison line. `status.ready` stays `false` in v1.
- **No changes** to the cron, `app/lib/actuals.ts`, `app/lib/snapshot.ts` write path, the Python pipeline, or R17. This slice only READS Blob.
- **Theme-aware + reduced-motion:** the page is static (no motion); use theme color tokens so it works in light/dark.
- **Own scores only** for v1.

---

### Task 1: Calibration logic module (`app/lib/calibration.ts`)

**Files:**
- Create: `app/lib/calibration.ts`
- Test: `app/lib/calibration.test.ts`

**Interfaces:**
- Consumes: nothing (pure; callers pass the Blob-loaded index).
- Produces:
  - `interface CalibrationRow { gp: string; issuedAt: string; brierContrib: number; top3: number }`
  - `interface CumulativePoint { round: number; gp: string; top3Rate: number; meanBrier: number }`
  - `interface CalibrationStatus { ready: boolean; nRaces: number; reason: string }`
  - `interface CalibrationSummary { nRaces: number; top3Rate: number; meanBrier: number; cumulative: CumulativePoint[]; status: CalibrationStatus }`
  - `interface RaceDetail { predicted: string[]; actual: string[]; hits: boolean[] }`
  - `const CALIBRATION_MIN_RACES: number`
  - `function summarize(index: CalibrationRow[]): CalibrationSummary`
  - `function calibrationStatus(index: CalibrationRow[]): CalibrationStatus`
  - `function raceDetail(podium: { drivers: { driver: string; p_podium: number }[] } | null | undefined, actuals: string[] | null | undefined): RaceDetail | null`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/calibration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  summarize,
  calibrationStatus,
  raceDetail,
  CALIBRATION_MIN_RACES,
  type CalibrationRow,
} from "./calibration";

const row = (gp: string, top3: number, brierContrib: number): CalibrationRow => ({
  gp,
  issuedAt: "2026-01-01T00:00:00Z",
  top3,
  brierContrib,
});

describe("summarize", () => {
  it("returns an empty summary for no races", () => {
    const s = summarize([]);
    expect(s.nRaces).toBe(0);
    expect(s.top3Rate).toBe(0);
    expect(s.meanBrier).toBe(0);
    expect(s.cumulative).toEqual([]);
  });

  it("computes season means, rounded", () => {
    const s = summarize([row("A", 1, 0.1), row("B", 1 / 3, 0.2)]);
    expect(s.nRaces).toBe(2);
    expect(s.top3Rate).toBe(0.67); // (1 + 0.333)/2 = 0.6667 -> 0.67
    expect(s.meanBrier).toBe(0.15); // (0.1 + 0.2)/2
  });

  it("builds a cumulative series in round order", () => {
    const s = summarize([row("A", 1, 0.1), row("B", 0, 0.3), row("C", 1, 0.2)]);
    expect(s.cumulative.map((p) => p.round)).toEqual([1, 2, 3]);
    expect(s.cumulative.map((p) => p.gp)).toEqual(["A", "B", "C"]);
    expect(s.cumulative[0].top3Rate).toBe(1);
    expect(s.cumulative[1].top3Rate).toBe(0.5); // (1+0)/2
    expect(s.cumulative[2].top3Rate).toBe(0.67); // (1+0+1)/3 = 0.667
    expect(s.cumulative[2].meanBrier).toBe(0.2); // (0.1+0.3+0.2)/3
  });
});

describe("calibrationStatus", () => {
  it("is never ready in v1 (display-only) and reports the count", () => {
    expect(calibrationStatus([]).ready).toBe(false);
    expect(calibrationStatus([]).nRaces).toBe(0);
    const s = calibrationStatus([row("A", 1, 0.1), row("B", 0, 0.2)]);
    expect(s.ready).toBe(false);
    expect(s.nRaces).toBe(2);
    expect(s.reason).toContain("2 logged so far");
  });

  it("exports a positive min-races threshold for the future %-upgrade", () => {
    expect(CALIBRATION_MIN_RACES).toBeGreaterThan(0);
  });
});

describe("raceDetail", () => {
  const podium = {
    drivers: [
      { driver: "VER", p_podium: 0.8 },
      { driver: "NOR", p_podium: 0.6 },
      { driver: "LEC", p_podium: 0.5 },
      { driver: "RUS", p_podium: 0.2 },
    ],
  };

  it("returns null when podium or actuals are missing", () => {
    expect(raceDetail(null, ["VER"])).toBeNull();
    expect(raceDetail(podium, [])).toBeNull();
  });

  it("extracts predicted top-3, actual top-3, and per-slot hits", () => {
    const d = raceDetail(podium, ["VER", "RUS", "NOR", "LEC"])!;
    expect(d.predicted).toEqual(["VER", "NOR", "LEC"]);
    expect(d.actual).toEqual(["VER", "RUS", "NOR"]);
    expect(d.hits).toEqual([true, true, false]); // VER hit, NOR hit, LEC missed
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/lib/calibration.test.ts`
Expected: FAIL — cannot resolve `./calibration`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/calibration.ts`:

```ts
// Season calibration record -> display model for the /accuracy page (M7).
// Pure + fully rounded here (house rule: round every number that reaches output). Reads
// NOTHING; the cron (app/api/cron/snapshot/route.ts) accumulates the raw Blob index and
// callers pass it in. Display-only: we never fit or flip to % in v1.

export interface CalibrationRow {
  gp: string;
  issuedAt: string;
  brierContrib: number;
  top3: number;
}

export interface CumulativePoint {
  round: number;
  gp: string;
  top3Rate: number;
  meanBrier: number;
}

export interface CalibrationStatus {
  ready: boolean;
  nRaces: number;
  reason: string;
}

export interface CalibrationSummary {
  nRaces: number;
  top3Rate: number;
  meanBrier: number;
  cumulative: CumulativePoint[];
  status: CalibrationStatus;
}

export interface RaceDetail {
  predicted: string[];
  actual: string[];
  hits: boolean[];
}

// Scored races required before measured %-calibration can even be attempted. v1 never
// flips (display-only); the future %-slice will flip status.ready on
// `nRaces >= CALIBRATION_MIN_RACES && reliabilityPasses(index)`.
export const CALIBRATION_MIN_RACES = 6;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function calibrationStatus(index: CalibrationRow[]): CalibrationStatus {
  const nRaces = index.length;
  return {
    ready: false, // v1 is display-only; see CALIBRATION_MIN_RACES.
    nRaces,
    reason:
      "We report qualitative bands, not percentages, until calibration is measured over " +
      `enough races. ${nRaces} logged so far.`,
  };
}

export function summarize(index: CalibrationRow[]): CalibrationSummary {
  const nRaces = index.length;
  const status = calibrationStatus(index);
  if (nRaces === 0) {
    return { nRaces: 0, top3Rate: 0, meanBrier: 0, cumulative: [], status };
  }
  let sumTop3 = 0;
  let sumBrier = 0;
  const cumulative: CumulativePoint[] = index.map((r, i) => {
    sumTop3 += r.top3;
    sumBrier += r.brierContrib;
    return {
      round: i + 1,
      gp: r.gp,
      top3Rate: round2(sumTop3 / (i + 1)),
      meanBrier: round3(sumBrier / (i + 1)),
    };
  });
  return {
    nRaces,
    top3Rate: round2(sumTop3 / nRaces),
    meanBrier: round3(sumBrier / nRaces),
    cumulative,
    status,
  };
}

// Pure extraction of the per-race predicted-vs-actual detail from a frozen final snapshot's
// podium + actuals. Blob-free so it is unit-testable; the page does the fetch.
export function raceDetail(
  podium: { drivers: { driver: string; p_podium: number }[] } | null | undefined,
  actuals: string[] | null | undefined,
): RaceDetail | null {
  if (!podium?.drivers?.length || !actuals?.length) return null;
  const predicted = [...podium.drivers]
    .sort((a, b) => b.p_podium - a.p_podium)
    .slice(0, 3)
    .map((d) => d.driver);
  const actual = actuals.slice(0, 3);
  const actualTop3 = new Set(actual);
  const hits = predicted.map((d) => actualTop3.has(d));
  return { predicted, actual, hits };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/calibration.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/lib/calibration.ts app/lib/calibration.test.ts
git commit -m "feat: calibration summary + status logic for the accuracy page"
```

---

### Task 2: Calibration chart (`app/lib/chart-path.ts` + `app/components/CalibrationChart.tsx`)

**Files:**
- Create: `app/lib/chart-path.ts`
- Test: `app/lib/chart-path.test.ts`
- Create: `app/components/CalibrationChart.tsx`

**Interfaces:**
- Consumes: `CumulativePoint` from `app/lib/calibration.ts` (Task 1).
- Produces:
  - `function buildLinePath(norm: number[], w?: number, h?: number, pad?: { top: number; right: number; bottom: number; left: number }): string`
  - `function CalibrationChart({ series }: { series: CumulativePoint[] }): JSX.Element | null` (returns `null` for `< 2` points).

- [ ] **Step 1: Write the failing test**

Create `app/lib/chart-path.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLinePath } from "./chart-path";

const noPad = { top: 0, right: 0, bottom: 0, left: 0 };

describe("buildLinePath", () => {
  it("spreads points across the inner width and inverts the y axis", () => {
    const pts = buildLinePath([0, 0.5, 1], 100, 100, noPad);
    const coords = pts.split(" ").map((p) => p.split(",").map(Number));
    expect(coords[0][0]).toBe(0); // first x at left
    expect(coords[2][0]).toBe(100); // last x at right
    expect(coords[0][1]).toBe(100); // value 0 -> bottom (y = H)
    expect(coords[2][1]).toBe(0); // value 1 -> top (y = 0)
    expect(coords[1][1]).toBe(50); // value 0.5 -> middle
  });

  it("clamps out-of-range values into the box", () => {
    const pts = buildLinePath([-1, 2], 100, 100, noPad);
    const ys = pts.split(" ").map((p) => Number(p.split(",")[1]));
    expect(ys[0]).toBe(100); // -1 clamps to 0 -> bottom
    expect(ys[1]).toBe(0); // 2 clamps to 1 -> top
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/chart-path.test.ts`
Expected: FAIL — cannot resolve `./chart-path`.

- [ ] **Step 3: Write the pure helper**

Create `app/lib/chart-path.ts`:

```ts
// Pure SVG polyline generator for the calibration trend chart (M7). Maps a series of
// 0..1-normalized values to an SVG `points` string across a padded plot box, inverting y
// (1 = top). Kept in lib (Blob-free, no JSX) so it is unit-testable.
export interface ChartPad {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function buildLinePath(
  norm: number[],
  w = 640,
  h = 220,
  pad: ChartPad = { top: 16, right: 16, bottom: 30, left: 16 },
): string {
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const n = norm.length;
  return norm
    .map((v, i) => {
      const x = pad.left + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
      const clamped = Math.max(0, Math.min(1, v));
      const y = pad.top + innerH * (1 - clamped);
      return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
    })
    .join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/chart-path.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the chart component**

Create `app/components/CalibrationChart.tsx`:

```tsx
// Cumulative season calibration chart (M7): a dependency-free inline-SVG line chart.
// Primary solid line = cumulative top-3 hit rate (0..1, the headline metric). Secondary
// dashed line = cumulative Brier, normalized to its own range so a HIGHER line means a
// LOWER (better) Brier. Server-renderable, static (no motion), theme-token colors.
import type { CumulativePoint } from "@/app/lib/calibration";
import { buildLinePath } from "@/app/lib/chart-path";

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 30, left: 16 };

const shortGp = (gp: string) => (gp.length > 6 ? gp.slice(0, 3).toUpperCase() : gp);

export function CalibrationChart({ series }: { series: CumulativePoint[] }) {
  if (series.length < 2) return null;

  const briers = series.map((p) => p.meanBrier);
  const bMin = Math.min(...briers);
  const bMax = Math.max(...briers);
  const bRange = bMax - bMin || 1;

  const top3Points = buildLinePath(series.map((p) => p.top3Rate), W, H, PAD);
  const brierPoints = buildLinePath(
    briers.map((b) => 1 - (b - bMin) / bRange),
    W,
    H,
    PAD,
  );

  const innerW = W - PAD.left - PAD.right;
  const xAt = (i: number) =>
    PAD.left + (series.length <= 1 ? innerW / 2 : (innerW * i) / (series.length - 1));

  return (
    <figure className="mt-6">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cumulative season calibration by round: top-3 hit rate and Brier score"
        className="w-full"
      >
        <line
          x1={PAD.left}
          y1={H - PAD.bottom}
          x2={W - PAD.right}
          y2={H - PAD.bottom}
          className="stroke-ink/15"
          strokeWidth={1}
        />
        <polyline
          points={brierPoints}
          fill="none"
          className="stroke-muted"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.6}
        />
        <polyline points={top3Points} fill="none" className="stroke-accent" strokeWidth={2.5} />
        {series.map((p, i) => (
          <text
            key={p.round}
            x={xAt(i)}
            y={H - 12}
            textAnchor="middle"
            className="fill-muted font-grotesk"
            fontSize={10}
          >
            {shortGp(p.gp)}
          </text>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 font-grotesk text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-accent" /> top-3 hit rate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-muted opacity-60" /> Brier (lower is
          better)
        </span>
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 6: Verify the component typechecks + build sees it**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/lib/chart-path.ts app/lib/chart-path.test.ts app/components/CalibrationChart.tsx
git commit -m "feat: dependency-free SVG calibration trend chart"
```

---

### Task 3: The `/accuracy` page (`app/accuracy/page.tsx`)

**Files:**
- Create: `app/accuracy/page.tsx`

**Interfaces:**
- Consumes: `summarize`, `raceDetail`, `CalibrationRow`, `RaceDetail` from `app/lib/calibration.ts`; `CalibrationChart` from `app/components/CalibrationChart.tsx`; `getJson` from `app/lib/blob.ts`; `seasonIndexKey`, `snapshotKey`, `WeekendSnapshot` from `app/lib/snapshot.ts`; `AsciiEmblem` from `app/components/AsciiEmblem.tsx`; year from `app/data/weekend-schedule.json`.
- Produces: the default-exported `AccuracyPage` server component at route `/accuracy`.

- [ ] **Step 1: Write the page**

Create `app/accuracy/page.tsx`:

```tsx
// /accuracy (M7): the season "track record" page. Makes the "calibration improves as the
// season accumulates" thesis visible. Reads the Blob season calibration index (written by
// the cron), summarizes it, and renders our own scored podium record. Display-only: no
// %-flip, no baseline. Server component; reads live Blob so it is force-dynamic.
import Link from "next/link";
import scheduleData from "@/app/data/weekend-schedule.json";
import { getJson } from "@/app/lib/blob";
import { seasonIndexKey, snapshotKey, type WeekendSnapshot } from "@/app/lib/snapshot";
import { summarize, raceDetail, type CalibrationRow, type RaceDetail } from "@/app/lib/calibration";
import { CalibrationChart } from "@/app/components/CalibrationChart";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accuracy" };

const YEAR = (scheduleData as { year: number }).year;

interface ScoredRace {
  gp: string;
  detail: RaceDetail | null;
  brier: number;
}

async function loadRaceRows(index: CalibrationRow[]): Promise<ScoredRace[]> {
  return Promise.all(
    index.map(async (r) => {
      const snap = await getJson<WeekendSnapshot>(snapshotKey(YEAR, r.gp, "final"));
      const detail = snap
        ? raceDetail(
            snap.podium as { drivers: { driver: string; p_podium: number }[] } | null,
            snap.actuals as string[] | null,
          )
        : null;
      return { gp: r.gp, detail, brier: r.brierContrib };
    }),
  );
}

export default async function AccuracyPage() {
  const index = (await getJson<CalibrationRow[]>(seasonIndexKey(YEAR))) ?? [];
  const summary = summarize(index);
  const rows = summary.nRaces > 0 ? await loadRaceRows(index) : [];

  return (
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-10 sm:px-8">
      <header className="mb-8 flex items-center gap-3">
        <AsciiEmblem kind="car" size={52} cols={34} className="shrink-0" />
        <div>
          <h1 className="font-pixel-serif text-5xl text-ink sm:text-6xl">Accuracy</h1>
          <p className="mt-2 max-w-prose font-lastik text-muted">
            Every podium we call is scored against the real finish. Here is the {YEAR} record so
            far. We expect it to sharpen as the season accumulates.
          </p>
        </div>
      </header>

      <p className="mb-8 rounded-md border border-ink/10 bg-ink/[0.03] px-4 py-3 font-grotesk text-sm text-muted">
        {summary.status.reason}
      </p>

      {summary.nRaces === 0 ? (
        <p className="font-lastik text-muted">
          No completed rounds scored yet this season. Predictions are issued each weekend and
          scored here after the race.{" "}
          <Link href="/weekend" className="cta-grow text-accent">
            See this weekend&rsquo;s predictions
          </Link>
          .
        </p>
      ) : (
        <>
          <dl className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Races scored" value={String(summary.nRaces)} />
            <Stat
              label="Top-3 hit rate"
              value={`${Math.round(summary.top3Rate * 100)}%`}
              gloss="share of podium places we called correctly"
            />
            <Stat
              label="Brier score"
              value={summary.meanBrier.toFixed(3)}
              gloss="lower is better-calibrated"
            />
          </dl>

          {summary.nRaces >= 3 && <CalibrationChart series={summary.cumulative} />}

          <ol className="mt-8 space-y-3">
            {rows.map((r) => (
              <li key={r.gp} className="rounded-md border border-ink/10 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-grotesk font-semibold text-ink">{r.gp}</span>
                  <span className="font-grotesk text-xs text-muted">Brier {r.brier.toFixed(3)}</span>
                </div>
                {r.detail ? (
                  <div className="mt-2 grid grid-cols-2 gap-4 font-grotesk text-sm">
                    <div>
                      <span className="text-xs uppercase tracking-wide text-muted">Predicted</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {r.detail.predicted.map((d, i) => (
                          <span key={d} className={r.detail!.hits[i] ? "text-accent" : "text-ink/50"}>
                            {d} {r.detail!.hits[i] ? "✓" : "✗"}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide text-muted">Actual</span>
                      <div className="mt-1 flex flex-wrap gap-2 text-ink">
                        {r.detail.actual.map((d) => (
                          <span key={d}>{d}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 font-grotesk text-sm text-muted">
                    Detail unavailable for this round.
                  </p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, gloss }: { label: string; value: string; gloss?: string }) {
  return (
    <div className="rounded-md border border-ink/10 p-4">
      <dt className="font-grotesk text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-grotesk text-3xl text-ink">{value}</dd>
      {gloss && <dd className="mt-1 font-grotesk text-xs text-muted">{gloss}</dd>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; the build lists an `/accuracy` route.

- [ ] **Step 3: Commit**

```bash
git add app/accuracy/page.tsx
git commit -m "feat: /accuracy season track-record page"
```

---

### Task 4: Add the "Accuracy" nav link

**Files:**
- Modify: `app/components/SiteNav.tsx` (the `NAV_LINKS` array)
- Modify: `app/components/SiteNav.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NAV_LINKS` now includes `{ href: "/accuracy", label: "Accuracy" }` between Learn and Upcoming weekend (consumed by both the desktop row and `MobileNav`).

- [ ] **Step 1: Update the failing test first**

In `app/components/SiteNav.test.ts`, replace the `NAV_LINKS` expectations:

```ts
  it("is the four nav links in order", () => {
    expect(NAV_LINKS.map((l) => l.href)).toEqual(["/", "/learn", "/accuracy", "/weekend"]);
    expect(NAV_LINKS.map((l) => l.label)).toEqual([
      "Ask",
      "Learn",
      "Accuracy",
      "Upcoming weekend",
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/SiteNav.test.ts`
Expected: FAIL — current `NAV_LINKS` has only three entries.

- [ ] **Step 3: Add the link**

In `app/components/SiteNav.tsx`, update `NAV_LINKS`:

```ts
export const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Ask" },
  { href: "/learn", label: "Learn" },
  { href: "/accuracy", label: "Accuracy" },
  { href: "/weekend", label: "Upcoming weekend" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/components/SiteNav.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/SiteNav.tsx app/components/SiteNav.test.ts
git commit -m "feat: add Accuracy link to site nav"
```

---

### Task 5: Full-suite verification + manual state check

**Files:** none (verification only).

- [ ] **Step 1: Run the full JS test suite**

Run: `npx vitest run`
Expected: all vitest suites pass (including the new `calibration`, `chart-path`, and updated `SiteNav`).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: clean build; `/accuracy` appears in the route list as a dynamic (ƒ) route.

- [ ] **Step 3: Confirm no Python was touched**

Run: `git diff --name-only main -- '*.py'`
Expected: no output (this slice changes zero Python files).

- [ ] **Step 4: Manual state check (local dev)**

Run `npm run dev`, visit `http://localhost:3000/accuracy`. Because the Blob index may be empty locally, confirm at least the empty state renders honestly ("No completed rounds scored yet this season"). To exercise the populated states, temporarily point the page at a small mock array (do NOT commit) or verify on a Vercel preview reading the real Blob index before merge. Confirm:
  - Empty (0 races): banner + empty copy + `/weekend` link.
  - 1-2 races (mock or preview): scorecard + row list, NO chart.
  - >=3 races (mock or preview): scorecard + chart + row list.
  - The "Accuracy" nav link appears on desktop and in the mobile overlay and routes correctly.

- [ ] **Step 5: Commit any final fixes** (if the manual check surfaced adjustments)

```bash
git add -A
git commit -m "fix: accuracy page polish from manual state check"
```

---

## Self-Review

**Spec coverage:**
- §2 data source (read-only Blob index) → Task 3 (`getJson(seasonIndexKey)`), no write-path changes (Global Constraints + Task 5 Step 3).
- §3 `calibration.ts` (`summarize`, `calibrationStatus`, `raceDetail`, `CALIBRATION_MIN_RACES`, centralized rounding) → Task 1.
- §4 page: route + nav → Tasks 3, 4; four render states → Task 3; scorecard tiles → Task 3 (`Stat`); race-by-race degrade < 3 vs >= 3 → Task 3 + Task 2 (chart); PP Mondwest header + AsciiEmblem → Task 3; snapshot-sourced detail with score-only fallback → Task 3 (`loadRaceRows` + `raceDetail` null branch).
- §5 non-goals (no %-flip, no baseline, no cron/pipeline/R17 changes) → Global Constraints + Task 5 Step 3.
- §6 testing → Tasks 1, 2 (unit), Task 5 (build + manual states).

**Placeholder scan:** none — every step carries concrete code or an exact command.

**Type consistency:** `CalibrationRow`, `CumulativePoint`, `RaceDetail`, `CalibrationSummary` names match across Tasks 1→2→3. `buildLinePath` signature identical in Task 2 helper, test, and component. `summarize`/`raceDetail`/`getJson`/`snapshotKey`/`seasonIndexKey`/`WeekendSnapshot` names match their source modules. `AsciiEmblem` prop shape (`kind`/`size`/`cols`/`className`) matches its definition.
