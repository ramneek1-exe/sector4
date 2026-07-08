# /weekend Past-Predictions Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `/weekend`'s pre-predictions "setting up" state, add a grow-underline link that opens a modal showing the previous GP's frozen final podium call versus the actual finishing order.

**Architecture:** Frontend-only, read-only over the existing Vercel Blob snapshots. A pure, unit-tested lib resolves the previous GP (from the committed ordered calendar) and shapes predicted-vs-actual rows; a client component renders a `cta-grow` link plus a portalled fade+scale modal cloned from the existing `DriverStopsModal`; the `/weekend` server component's empty branch fetches the previous `final` snapshot and passes the shaped data in. No pipeline / Python / cron / schema change.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, Vitest, `@vercel/blob` (existing `getJson`), Tailwind.

## Global Constraints

- **No pipeline / Python / cron / snapshot-schema change.** Read-only over existing Blob data; derive `prevGp` on the frontend. (spec: Out of scope)
- **No em-dashes in any user-facing copy** (house rule); use plain words. The DNF placeholder is the literal string `DNF`, not a dash.
- **Round every number that reaches output** — `p_podium` is already rounded in the snapshot; `finishPos` and summary counts are integers. Do not reformat/multiply them.
- **Gate all motion behind `prefers-reduced-motion`** via Tailwind `motion-reduce:` variants (as `DriverStopsModal` does).
- **Graceful absence:** no resolvable predecessor, or a missing `final` snapshot, renders NO link — never a broken or empty modal.
- **Do not touch the populated `/weekend` branch** or any other page; only the `!snap || concluded` empty branch gains the link.

---

### Task 1: Pure lib — `resolvePrevGp` + `pastPredictionRows`

**Files:**
- Create: `app/lib/past-predictions.ts`
- Test: `app/lib/past-predictions.test.ts`

**Interfaces:**
- Consumes: `raceDetail` from `app/lib/calibration.ts` — `raceDetail(podium: { drivers: { driver: string; p_podium: number }[] } | null | undefined, actuals: string[] | null | undefined): { predicted: string[]; actual: string[]; hits: boolean[] } | null`.
- Produces:
  - `resolvePrevGp(scheduleGp: string, calendar: string[], concluded: boolean): string | null`
  - `pastPredictionRows(podium: PodiumLike | null | undefined, actuals: string[] | null | undefined): PastPredictionsData | null`
  - `interface PastRow { rank: number; driver: string; team: string | null; band: string; p_podium: number | null; finishPos: number | null; isPodium: boolean }`
  - `interface PastPredictionsData { rows: PastRow[]; hasActuals: boolean; summary: { hits: number; of: number } | null }`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/past-predictions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolvePrevGp, pastPredictionRows } from "./past-predictions";

const CAL = ["Australia", "China", "Great Britain", "Belgium"];

describe("resolvePrevGp", () => {
  it("returns the calendar predecessor when not concluded", () => {
    expect(resolvePrevGp("Belgium", CAL, false)).toBe("Great Britain");
  });
  it("returns the just-passed race (scheduleGp) when concluded", () => {
    // screen is showing nextGp; the previous race is scheduleGp itself
    expect(resolvePrevGp("Belgium", CAL, true)).toBe("Belgium");
  });
  it("returns null for round 1 with no predecessor", () => {
    expect(resolvePrevGp("Australia", CAL, false)).toBeNull();
  });
  it("returns null when scheduleGp is not in the calendar", () => {
    expect(resolvePrevGp("Mars", CAL, false)).toBeNull();
  });
});

describe("pastPredictionRows", () => {
  const podium = {
    drivers: [
      { rank: 1, driver: "NOR", team: "McLaren", band: "strong", p_podium: 0.61 },
      { rank: 2, driver: "PIA", team: "McLaren", band: "strong", p_podium: 0.54 },
      { rank: 3, driver: "LEC", team: "Ferrari", band: "in contention", p_podium: 0.41 },
      { rank: 4, driver: "VER", team: "Red Bull Racing", band: "in contention", p_podium: 0.33 },
    ],
  };

  it("shapes rows with finish position and podium hits from actuals", () => {
    const actuals = ["NOR", "LEC", "RUS", "PIA"]; // PIA finished P4 (off podium), VER DNF
    const out = pastPredictionRows(podium, actuals)!;
    expect(out.hasActuals).toBe(true);
    const nor = out.rows.find((r) => r.driver === "NOR")!;
    expect(nor.finishPos).toBe(1);
    expect(nor.isPodium).toBe(true);
    const pia = out.rows.find((r) => r.driver === "PIA")!;
    expect(pia.finishPos).toBe(4);
    expect(pia.isPodium).toBe(false);
    const ver = out.rows.find((r) => r.driver === "VER")!;
    expect(ver.finishPos).toBeNull(); // not classified -> DNF
    // predicted top-3 by p = NOR,PIA,LEC; actual top-3 = NOR,LEC,RUS -> 2 hits
    expect(out.summary).toEqual({ hits: 2, of: 3 });
  });

  it("degrades to odds-only when actuals are absent", () => {
    const out = pastPredictionRows(podium, null)!;
    expect(out.hasActuals).toBe(false);
    expect(out.summary).toBeNull();
    expect(out.rows.every((r) => r.finishPos === null && r.isPodium === false)).toBe(true);
  });

  it("returns null when there are no drivers", () => {
    expect(pastPredictionRows({ drivers: [] }, ["NOR"])).toBeNull();
    expect(pastPredictionRows(null, ["NOR"])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/lib/past-predictions.test.ts`
Expected: FAIL — `Failed to resolve import "./past-predictions"` / module not found.

- [ ] **Step 3: Write the implementation**

Create `app/lib/past-predictions.ts`:

```ts
// Shapes the previous GP's frozen final podium call into predicted-vs-actual rows for the
// /weekend "setting up" modal. Pure + Blob-free so it is unit-testable; the page does the
// fetch. Reuses raceDetail (calibration.ts) for the top-3 predicted-vs-actual summary.
import { raceDetail } from "./calibration";

interface PodiumLike {
  drivers?: {
    rank?: number;
    driver: string;
    team?: string | null;
    band?: string;
    p_podium?: number;
  }[];
}

export interface PastRow {
  rank: number;
  driver: string;
  team: string | null;
  band: string;
  p_podium: number | null;
  finishPos: number | null; // 1-indexed actual finish, or null if not classified (DNF)
  isPodium: boolean;
}

export interface PastPredictionsData {
  rows: PastRow[];
  hasActuals: boolean;
  summary: { hits: number; of: number } | null;
}

/** The race whose predictions to show. Concluded (screen shows nextGp) -> the just-passed
 *  scheduleGp. Otherwise the calendar entry immediately before scheduleGp. No predecessor
 *  (round 1, or scheduleGp absent) -> null. */
export function resolvePrevGp(
  scheduleGp: string,
  calendar: string[],
  concluded: boolean,
): string | null {
  if (concluded) return scheduleGp;
  const idx = calendar.indexOf(scheduleGp);
  return idx > 0 ? calendar[idx - 1] : null;
}

export function pastPredictionRows(
  podium: PodiumLike | null | undefined,
  actuals: string[] | null | undefined,
): PastPredictionsData | null {
  const drivers = podium?.drivers;
  if (!drivers?.length) return null;

  const order = actuals && actuals.length ? actuals : null;
  const rows: PastRow[] = drivers.slice(0, 10).map((d, i) => {
    const foundAt = order ? order.indexOf(d.driver) : -1;
    const finishPos = foundAt >= 0 ? foundAt + 1 : null;
    return {
      rank: d.rank ?? i + 1,
      driver: d.driver,
      team: d.team ?? null,
      band: d.band ?? "outside shot",
      p_podium: typeof d.p_podium === "number" ? d.p_podium : null,
      finishPos,
      isPodium: finishPos != null && finishPos <= 3,
    };
  });

  const detail = order
    ? raceDetail(
        {
          drivers: drivers.filter(
            (x): x is { driver: string; p_podium: number } =>
              typeof x.p_podium === "number",
          ),
        },
        order,
      )
    : null;
  const summary = detail
    ? { hits: detail.hits.filter(Boolean).length, of: 3 }
    : null;

  return { rows, hasActuals: order != null, summary };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/lib/past-predictions.test.ts`
Expected: PASS (7 assertions across 4 + 3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/past-predictions.ts app/lib/past-predictions.test.ts
git commit -m "feat: pure lib for /weekend past-predictions (prevGp + predicted-vs-actual rows)"
```

---

### Task 2: Client component — link + portalled modal

**Files:**
- Create: `app/components/PastPredictions.tsx`

**Interfaces:**
- Consumes: `PastPredictionsData` from `app/lib/past-predictions.ts`; `AsciiGlyph` from `app/components/AsciiGlyph.tsx` (`AsciiGlyph({ code, team, size? })`, `team: string | null`); `driverName` from `app/lib/glyph.ts` (`driverName(code: string): string`); `BAND_TEXT` from `app/lib/bands.ts` (`Record<string,string>`).
- Produces: `PastPredictions({ circuitName, year, gp, data }: { circuitName: string; year: number; gp: string; data: PastPredictionsData })` — a React component exporting the link + modal.

> No unit test: this is a presentational client component that renders a canvas-backed
> `AsciiGlyph` and a `document.body` portal (the same reason the existing `DriverStopsModal`
> has none). It is verified by `tsc` + `npm run build` (Task 3) and the live preview eyeball.

- [ ] **Step 1: Write the component**

Create `app/components/PastPredictions.tsx`:

```tsx
"use client";
// The /weekend "setting up" link + modal: the previous GP's frozen final podium call vs the
// actual result. Modal pattern cloned from app/page.tsx's DriverStopsModal (portal + fade/scale,
// Escape/backdrop close, reduced-motion gated). Data is shaped server-side by pastPredictionRows.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AsciiGlyph } from "@/app/components/AsciiGlyph";
import { driverName } from "@/app/lib/glyph";
import { BAND_TEXT } from "@/app/lib/bands";
import type { PastPredictionsData } from "@/app/lib/past-predictions";

interface Props {
  circuitName: string;
  year: number;
  gp: string;
  data: PastPredictionsData;
}

export function PastPredictions({ circuitName, year, gp, data }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cta-grow relative font-pixel text-xl leading-none tracking-wide text-accent transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
      >
        Check out {circuitName} GP
      </button>
      {open && (
        <PastModal
          circuitName={circuitName}
          year={year}
          gp={gp}
          data={data}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PastModal({
  circuitName,
  year,
  gp,
  data,
  onClose,
}: Props & { onClose: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    setShow(false);
    window.setTimeout(onClose, 180); // matches the transition duration
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;

  const { rows, hasActuals, summary } = data;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Our final ${year} ${gp} podium call versus the result`}
      onClick={close}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative flex max-h-[75vh] w-full max-w-md flex-col rounded-2xl border border-ink/15 bg-white/95 shadow-xl transition duration-200 ease-out motion-reduce:transition-none ${
          show ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-2.5">
          <div className="font-grotesk text-[11px] font-semibold uppercase tracking-wide text-muted">
            Previous race · {circuitName} {year} · our final call
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-full px-2 py-0.5 font-grotesk text-sm text-muted transition hover:bg-ink/5 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4">
          <table className="w-full border-collapse font-grotesk text-sm">
            <thead>
              <tr className="border-b border-ink/15 text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium"></th>
                <th className="py-2 pr-3 font-medium">Driver</th>
                <th className="py-2 pr-3 font-medium">Our call</th>
                <th className="py-2 pr-2 font-medium">p≈</th>
                {hasActuals && (
                  <th className="py-2 text-right font-medium">Finished</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={d.driver} className={i % 2 ? "bg-ink/[0.03]" : ""}>
                  <td className="py-2 pr-2 align-middle font-mono text-muted">{d.rank}</td>
                  <td className="py-1 pr-2 align-middle">
                    <AsciiGlyph code={d.driver} team={d.team} size={40} />
                  </td>
                  <td className="py-2 pr-3 align-middle">
                    <span className="font-bold tracking-wide">{d.driver}</span>{" "}
                    <span className="hidden text-muted sm:inline">{driverName(d.driver)}</span>
                  </td>
                  <td
                    className={`py-2 pr-3 align-middle font-semibold uppercase tracking-wide ${
                      BAND_TEXT[d.band] ?? BAND_TEXT["outside shot"]
                    }`}
                  >
                    {d.band}
                  </td>
                  <td className="py-2 pr-2 align-middle font-mono text-muted">
                    {d.p_podium ?? ""}
                  </td>
                  {hasActuals && (
                    <td className="py-2 text-right align-middle font-mono">
                      {d.finishPos == null ? (
                        <span className="text-muted">DNF</span>
                      ) : (
                        <span
                          className={
                            d.isPodium ? "font-semibold text-emerald-600" : "text-ink/70"
                          }
                        >
                          P{d.finishPos}
                          {d.isPodium ? " ✓" : ""}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {summary && (
            <p className="mt-3 font-grotesk text-xs text-muted">
              {summary.hits} of our top {summary.of} predicted finished on the podium.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Typecheck the new component**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `PastPredictions.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/components/PastPredictions.tsx
git commit -m "feat: PastPredictions link + portalled predicted-vs-actual modal"
```

---

### Task 3: Wire into `/weekend` empty branch + verify

**Files:**
- Modify: `app/weekend/page.tsx` (imports; the `if (!snap || concluded)` empty branch, ~L80-125)

**Interfaces:**
- Consumes: `resolvePrevGp`, `pastPredictionRows` (Task 1); `PastPredictions` (Task 2); existing `snapshotKey` (`app/lib/snapshot.ts`), `getJson`, `getCircuitName`, `WeekendSnapshot`.
- Produces: no new exports — renders `<PastPredictions>` in the empty branch when data exists.

- [ ] **Step 1: Add the imports**

In `app/weekend/page.tsx`, extend the snapshot import and add three new imports near the existing import block (top of file):

```tsx
import raceCalendar from "@/src/race_calendar.json";
import { snapshotKey, latestKey, type WeekendSnapshot } from "@/app/lib/snapshot";
import { resolvePrevGp, pastPredictionRows } from "@/app/lib/past-predictions";
import { PastPredictions } from "@/app/components/PastPredictions";
```

(Replace the existing `import { latestKey, type WeekendSnapshot } from "@/app/lib/snapshot";` line with the `snapshotKey, latestKey, ...` form above; leave all other imports as-is.)

- [ ] **Step 2: Resolve + fetch the previous snapshot inside the empty branch**

In the `if (!snap || concluded) {` block, immediately after the existing
`const upcomingWhat = getEntityWhat("circuit", upcomingGp);` line, add:

```tsx
    const calendar =
      (raceCalendar as Record<string, string[]>)[String(schedule.year)] ?? [];
    const prevGp = resolvePrevGp(schedule.gp, calendar, concluded);
    const prevSnap = prevGp
      ? await getJson<WeekendSnapshot>(snapshotKey(schedule.year, prevGp, "final"))
      : null;
    const pastData = prevSnap
      ? pastPredictionRows(
          prevSnap.podium as Parameters<typeof pastPredictionRows>[0],
          prevSnap.actuals as string[] | null,
        )
      : null;
```

- [ ] **Step 3: Render the link under "Check back Saturday."**

In the same branch's JSX, immediately after this existing element:

```tsx
          <p className="mt-4 font-grotesk text-base text-muted">Check back Saturday.</p>
```

add:

```tsx
          {prevGp && pastData && (
            <p className="mt-3">
              <PastPredictions
                circuitName={getCircuitName(prevGp)}
                year={schedule.year}
                gp={prevGp}
                data={pastData}
              />
            </p>
          )}
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: both clean; no errors; `/weekend` remains a dynamic route.

- [ ] **Step 5: Run the full JS test suite (regression)**

Run: `npx vitest run`
Expected: all pass (existing suite + the new `past-predictions.test.ts`), 0 failures.

- [ ] **Step 6: Commit**

```bash
git add app/weekend/page.tsx
git commit -m "feat: surface previous GP's predicted-vs-actual podium on the /weekend setting-up screen"
```

- [ ] **Step 7: Live preview verification (cannot be done locally — Blob is empty)**

Local Blob is empty (M5 finding: Blob reads require a real deploy), so the populated modal
is only observable against real Blob. On a Vercel **preview** deploy of this branch:
1. Open `/weekend`. While the current weekend (Belgium) is pre-predictions, expect the
   `Check out Great Britain GP` link under "Check back Saturday.".
2. Click it: a modal opens (fade+scale) titled `Previous race · Great Britain 2026 · our
   final call`, listing drivers with band, `p≈`, and a `Finished P# ✓` / `DNF` column, plus
   the `N of our top 3 predicted finished on the podium.` footer.
3. Esc and backdrop click both dismiss it.
4. Sanity: if the previous `final` snapshot is missing, confirm NO link renders (no empty modal).

Report the preview URL + outcome; do not merge until the owner has eyeballed it.

---

## Notes for the implementer

- **Do not** add a `prevGp` field to `weekend-schedule.json` or change any Python/cron — resolution is intentionally frontend-only (Global Constraints).
- **Do not** refactor the populated `/weekend` podium table into a shared component for this slice — the modal table differs (compact, adds a Finished column) and sharing would risk the working branch (spec: Approach choice).
- The `·` characters in copy are middots (already used elsewhere in `weekend/page.tsx`), not em-dashes — keep them; never introduce `—`.
