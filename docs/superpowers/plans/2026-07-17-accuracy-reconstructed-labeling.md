# `/accuracy` reconstructed-round labeling + headline exclusion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish post-hoc reconstructed rounds from genuinely live-issued ones on `/accuracy`: exclude reconstructed rounds from the season headline (top3/Brier) and trend chart, and list them labeled "from testing, not predicted live".

**Architecture:** A `reconstructed?: boolean` flag is stamped onto the calibration index row by the post-hoc write paths (reconciler + admin backfill), never by the live cron due-write. `summarize` computes the headline + cumulative over live (non-reconstructed) rows only and reports a separate `nReconstructed` count. `/accuracy` lists all rows (labeling reconstructed ones) and shows headline metrics only over live rows.

**Tech Stack:** TypeScript (Next.js App Router), vitest.

## Global Constraints

- **Live cron due-write is UNCHANGED.** Only the reconciler and admin backfill (both post-hoc by definition) stamp `reconstructed: true`. A live in-window final (Austria) stays unflagged.
- **User-facing copy says "testing / not predicted live", never "regenerated" or "reconstructed".** (Internal field name `reconstructed` is fine.) NO em-dashes in any added copy (use commas / middot `·`).
- **Reconstructed rows are EXCLUDED from the headline `top3Rate`/`meanBrier` and the trend chart, but still LISTED** in the race-by-race table with the label.
- **Round every number that reaches output** (existing calibration rounding stays).
- **The existing live-path calibration row shape is unchanged** when `reconstructed` is not set (no `reconstructed` key written) — regression-guard it.
- **This slice stacks on the snapshot-final-reconciler branch** (PR #27); it modifies `reconcile-finals.ts` and the admin route added/edited there.
- **Commits:** conventional, description only. NO Claude/AI attribution, NO Co-Authored-By, NO robot emoji.
- TS tests: `npm run test`. Single file: `npm run test -- <name>`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.

## File Structure

- `app/lib/calibration.ts` (MODIFY) — `CalibrationRow.reconstructed`, `CalibrationSummary.nReconstructed`, live-only `summarize`.
- `app/lib/snapshot-write.ts` (MODIFY) — `WriteDeps.reconstructed`, stamp it on the pushed calibration row.
- `app/lib/reconcile-finals.ts` (MODIFY) — default `write` passes `reconstructed: true`.
- `app/api/admin/snapshot/route.ts` (MODIFY) — pass `reconstructed: true`.
- `app/accuracy/page.tsx` (MODIFY) — per-row label, live/testing counts, state gates on `index.length` vs live count.
- Tests: `app/lib/calibration.test.ts`, `app/lib/snapshot-write.test.ts`, `app/lib/reconcile-finals.test.ts` (all existing — extended).

---

### Task 1: `calibration.ts` — flag on row, live-only summarize, reconstructed count

**Files:**
- Modify: `app/lib/calibration.ts`
- Test: `app/lib/calibration.test.ts`

**Interfaces:**
- Produces: `CalibrationRow` gains `reconstructed?: boolean`; `CalibrationSummary` gains `nReconstructed: number`; `summarize` aggregates `top3Rate`/`meanBrier`/`cumulative`/`nRaces` over **live** rows only (`!reconstructed`), and `nReconstructed` = count of the rest.

- [ ] **Step 1: Write the failing tests**

Add to `app/lib/calibration.test.ts` (create the describe block if the file lacks one; otherwise append):

```ts
import { describe, it, expect } from "vitest";
import { summarize, type CalibrationRow } from "./calibration";

function row(gp: string, top3: number, brier: number, reconstructed?: boolean): CalibrationRow {
  return { gp, issuedAt: `2026-01-01T00:00:00.000Z`, top3, brierContrib: brier, ...(reconstructed ? { reconstructed: true } : {}) };
}

describe("summarize reconstructed exclusion", () => {
  it("excludes reconstructed rows from headline and cumulative", () => {
    const index = [
      row("China", 0.0, 0.30, true),        // reconstructed -> excluded
      row("Austria", 1.0, 0.05),            // live
    ];
    const s = summarize(index);
    expect(s.nRaces).toBe(1);               // live only
    expect(s.nReconstructed).toBe(1);
    expect(s.top3Rate).toBe(1.0);           // Austria only
    expect(s.meanBrier).toBe(0.05);
    expect(s.cumulative).toHaveLength(1);   // live only
    expect(s.cumulative[0].gp).toBe("Austria");
  });

  it("reports zero live but counts reconstructed when only testing rounds exist", () => {
    const index = [row("Australia", 0.33, 0.4, true), row("China", 0.0, 0.5, true)];
    const s = summarize(index);
    expect(s.nRaces).toBe(0);
    expect(s.nReconstructed).toBe(2);
    expect(s.top3Rate).toBe(0);
    expect(s.meanBrier).toBe(0);
    expect(s.cumulative).toEqual([]);
  });

  it("headline over an all-live index is unchanged (no reconstructed rows)", () => {
    const index = [row("Austria", 1.0, 0.05), row("Britain", 0.667, 0.1)];
    const s = summarize(index);
    expect(s.nRaces).toBe(2);
    expect(s.nReconstructed).toBe(0);
    expect(s.cumulative).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- calibration`
Expected: FAIL — `nReconstructed` does not exist / reconstructed rows still counted.

- [ ] **Step 3: Implement**

In `app/lib/calibration.ts`:

Add the field to `CalibrationRow`:
```ts
export interface CalibrationRow {
  gp: string;
  issuedAt: string;
  brierContrib: number;
  top3: number;
  reconstructed?: boolean; // written by post-hoc backfills (reconciler/admin); excluded from headline
}
```

Add to `CalibrationSummary`:
```ts
export interface CalibrationSummary {
  nRaces: number;          // LIVE (non-reconstructed) races
  nReconstructed: number;  // reconstructed rows (listed but excluded from the headline)
  top3Rate: number;
  meanBrier: number;
  cumulative: CumulativePoint[];
  status: CalibrationStatus;
}
```

Rewrite `summarize` to aggregate over live rows only. Replace the whole function body:

```ts
export function summarize(index: CalibrationRow[]): CalibrationSummary {
  const live = index.filter((r) => !r.reconstructed);
  const nReconstructed = index.length - live.length;
  const nRaces = live.length;
  // status counts by LIVE races (the qualitative-band gate is about our live record).
  const status = calibrationStatus(live);
  if (nRaces === 0) {
    return { nRaces: 0, nReconstructed, top3Rate: 0, meanBrier: 0, cumulative: [], status };
  }
  let sumTop3 = 0;
  let sumBrier = 0;
  const cumulative: CumulativePoint[] = live.map((r, i) => {
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
    nReconstructed,
    top3Rate: round2(sumTop3 / nRaces),
    meanBrier: round3(sumBrier / nRaces),
    cumulative,
    status,
  };
}
```

(Note: `calibrationStatus` is now passed the `live` subset so its `nRaces` reason text reflects the live count. Its signature is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- calibration`
Expected: PASS (existing calibration tests + the 3 new ones). If an existing test asserted `nRaces` over a mixed set, it predates the flag and its rows are all live (no `reconstructed`), so behavior is unchanged.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Adding a required `nReconstructed` to `CalibrationSummary` may surface any other constructor of that type — there is none outside `summarize`; the `nRaces===0` and main return both set it.)

- [ ] **Step 6: Commit**

```bash
git add app/lib/calibration.ts app/lib/calibration.test.ts
git commit -m "feat: summarize excludes reconstructed rows from the accuracy headline"
```

---

### Task 2: `snapshot-write.ts` — stamp `reconstructed` on the calibration row

**Files:**
- Modify: `app/lib/snapshot-write.ts`
- Test: `app/lib/snapshot-write.test.ts`

**Interfaces:**
- Consumes: `CalibrationRow.reconstructed` (Task 1).
- Produces: `WriteDeps` gains `reconstructed?: boolean`; when true, the calibration row pushed to the season index carries `reconstructed: true`; when absent, the row shape is unchanged (no key).

- [ ] **Step 1: Write the failing test**

Add to `app/lib/snapshot-write.test.ts` (reuse the file's existing `fakeStore`/`fakeBuild` helpers and the `final`-checkpoint path it already tests). Add two cases:

```ts
it("stamps reconstructed:true on the calibration row when the option is set", async () => {
  const store = fakeStore();
  await writeWeekendSnapshot(2026, "China", "final", {
    ...store,
    build: fakeBuild,
    getActualFinish: async () => ["NOR", "LEC", "PIA"],
    reconstructed: true,
  });
  const idx = store.store[seasonIndexKey(2026)] as Array<{ gp: string; reconstructed?: boolean }>;
  const chinaRow = idx.find((r) => r.gp === "China")!;
  expect(chinaRow.reconstructed).toBe(true);
});

it("omits reconstructed on the calibration row for the live path (default)", async () => {
  const store = fakeStore();
  await writeWeekendSnapshot(2026, "Austria", "final", {
    ...store,
    build: fakeBuild,
    getActualFinish: async () => ["VER", "NOR", "LEC"],
  });
  const idx = store.store[seasonIndexKey(2026)] as Array<{ gp: string; reconstructed?: boolean }>;
  const austriaRow = idx.find((r) => r.gp === "Austria")!;
  expect("reconstructed" in austriaRow).toBe(false);
});
```

(If `fakeStore` / `fakeBuild` are defined earlier in the file, reuse them; the file already imports `seasonIndexKey`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- snapshot-write`
Expected: FAIL — the row has no `reconstructed` key (option not wired yet).

- [ ] **Step 3: Implement**

In `app/lib/snapshot-write.ts`:

Add the option to `WriteDeps`:
```ts
export interface WriteDeps {
  force?: boolean;
  reconstructed?: boolean; // stamp the calibration row as a post-hoc backfill (reconciler/admin)
  getJson?: <T>(key: string) => Promise<T | null>;
  putJson?: (key: string, value: unknown) => Promise<string>;
  build?: (year: number, gp: string, checkpoint: Checkpoint) => Promise<WeekendSnapshot>;
  getActualFinish?: (year: number, gp: string) => Promise<string[]>;
  snapshotDeps?: SnapshotDeps;
}
```

In `writeWeekendSnapshot`, read the option near the other `deps.*` reads (top of the function):
```ts
  const reconstructed = deps.reconstructed ?? false;
```

Change the calibration-row push so the key is present only when true:
```ts
        idx.push({ gp, issuedAt: snap.issuedAt, ...cal, ...(reconstructed ? { reconstructed: true } : {}) });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- snapshot-write`
Expected: PASS (existing tests + the 2 new ones — the default-path test confirms the live row shape is unchanged).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add app/lib/snapshot-write.ts app/lib/snapshot-write.test.ts
git commit -m "feat: writeWeekendSnapshot stamps reconstructed on post-hoc calibration rows"
```

---

### Task 3: wire the post-hoc callers to stamp `reconstructed`

**Files:**
- Modify: `app/lib/reconcile-finals.ts`
- Modify: `app/api/admin/snapshot/route.ts`
- Test: `app/lib/reconcile-finals.test.ts`

**Interfaces:**
- Consumes: `WriteDeps.reconstructed` (Task 2).
- Produces: the reconciler default `write` and the admin backfill both call `writeWeekendSnapshot` with `reconstructed: true`.

- [ ] **Step 1: Write the failing test**

Add to `app/lib/reconcile-finals.test.ts` a test that the DEFAULT write path forwards `reconstructed: true`. Mock the `snapshot-write` module so the real Blob/build is not hit:

```ts
import { vi } from "vitest";

vi.mock("./snapshot-write", () => ({
  writeWeekendSnapshot: vi.fn(async () => ({ status: "snapshotted" })),
  getActualFinish: vi.fn(async () => ["NOR", "LEC", "PIA"]),
}));

// Import AFTER the mock so reconcileFinals binds the mocked module.
import { reconcileFinals } from "./reconcile-finals";
import { writeWeekendSnapshot } from "./snapshot-write";

it("default write stamps reconstructed:true", async () => {
  await reconcileFinals(2026, ["China"], {
    getJson: async () => null, // no existing snapshot -> proceeds to write
    // no `write` injected -> exercises the default that wraps writeWeekendSnapshot
  });
  expect(writeWeekendSnapshot).toHaveBeenCalledWith(2026, "China", "final", {
    force: false,
    reconstructed: true,
  });
});
```

Place this in its OWN test file section carefully: `vi.mock` is hoisted and affects the whole module. If the existing `reconcile-finals.test.ts` tests rely on the REAL `snapshot-write` (they inject their own `write`/`getActualFinish`/`getJson` deps, so they do not), the mock is safe. If any existing test in the file exercises the default `write`, keep this test in a separate file `app/lib/reconcile-finals.default-write.test.ts` instead to isolate the mock. (Prefer the separate file to avoid mock bleed.)

**Create `app/lib/reconcile-finals.default-write.test.ts`** with the imports + `vi.mock` + the single test above (wrapped in a `describe`), rather than appending to the existing file.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- reconcile-finals.default-write`
Expected: FAIL — the default currently calls with `{ force: false }` (no `reconstructed`).

- [ ] **Step 3: Implement**

In `app/lib/reconcile-finals.ts`, change the default `write`:
```ts
  const write =
    deps.write ??
    ((y: number, g: string) => writeWeekendSnapshot(y, g, "final", { force: false, reconstructed: true }));
```

In `app/api/admin/snapshot/route.ts`, change the write call to stamp reconstructed (the admin route is always a post-hoc backfill):
```ts
    const result = await writeWeekendSnapshot(year, gp, checkpoint, { force, reconstructed: true });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- reconcile`
Expected: PASS — the new default-write test passes; existing reconcile-finals tests (which inject their own `write` spy) are unaffected.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add app/lib/reconcile-finals.ts app/api/admin/snapshot/route.ts app/lib/reconcile-finals.default-write.test.ts
git commit -m "feat: reconciler and admin backfill stamp reconstructed on final snapshots"
```

---

### Task 4: `/accuracy` page — label reconstructed rows, split live/testing counts

**Files:**
- Modify: `app/accuracy/page.tsx`

**Interfaces:**
- Consumes: `CalibrationRow.reconstructed` + `CalibrationSummary.nReconstructed` (Tasks 1–2).
- Produces: the page lists all rows (labeling reconstructed ones "From testing · not predicted live"), shows headline metrics over live rows only, and never hides testing rows.

- [ ] **Step 1: Carry `reconstructed` onto each rendered row**

In `app/accuracy/page.tsx`, extend the `ScoredRace` type (near line 18-22) with `reconstructed: boolean`, and set it in `loadRaceRows` (line 34):

```ts
      return { gp: r.gp, detail, brier: r.brierContrib, reconstructed: !!r.reconstructed };
```

(Add `reconstructed: boolean;` to the `ScoredRace` interface.)

- [ ] **Step 2: Gate the row list on the full index, not the live count**

Change line 42 so rows load whenever ANY rows exist:
```ts
  const rows = index.length > 0 ? await loadRaceRows(index) : [];
```

Change the empty-state gate (line 61) to trigger only when the index is truly empty:
```ts
      {index.length === 0 ? (
```

- [ ] **Step 3: Show headline metrics over live rows only; surface the testing count**

Replace the `<dl>` stat block (lines 75-87) so "Races scored" reflects live rounds and the testing count is visible, and only render the top3/Brier stats when there is at least one live race:

```tsx
          <dl className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat
              label="Races scored"
              value={String(summary.nRaces)}
              gloss={summary.nReconstructed > 0 ? `plus ${summary.nReconstructed} from testing, not counted` : undefined}
            />
            {summary.nRaces > 0 && (
              <>
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
              </>
            )}
          </dl>
```

(If `Stat`'s `gloss` prop is required rather than optional, pass `""` instead of `undefined` — check the `Stat` component signature in this file / its import and match it.)

- [ ] **Step 4: Label reconstructed rows in the list**

In the `rows.map` `<li>` (around line 93-97), add a label next to the gp name when `r.reconstructed`. Replace the header `<div>`:

```tsx
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-grotesk font-semibold text-ink">
                    {r.gp}
                    {r.reconstructed && (
                      <span className="ml-2 rounded bg-ink/[0.06] px-1.5 py-0.5 align-middle font-grotesk text-[0.65rem] font-normal uppercase tracking-wide text-muted">
                        From testing · not predicted live
                      </span>
                    )}
                  </span>
                  <span className="font-grotesk text-xs text-muted">Brier {r.brier.toFixed(3)}</span>
                </div>
```

(No em-dashes; the separator is a middot `·`.)

- [ ] **Step 5: Typecheck, full test suite, build**

Run: `npx tsc --noEmit` → clean.
Run: `npm run test` → all pass (no regression).
Run: `npm run build` → clean; `/accuracy` still builds (dynamic route reading Blob).

- [ ] **Step 6: Commit**

```bash
git add app/accuracy/page.tsx
git commit -m "feat: accuracy page labels testing rounds and counts only live races in the headline"
```

---

## Self-Review

**Spec coverage:**
- §3 flag on `CalibrationRow` + `writeWeekendSnapshot` stamp → Tasks 1, 2. ✓
- §3 callers (reconciler always, admin always, live cron never) → Task 3 (reconciler + admin); live cron due-write untouched (not in any task's edits). ✓
- §4 `summarize` live-only headline + cumulative + `nReconstructed` → Task 1. ✓
- §5 page: list all rows, label reconstructed, live/testing counts, chart over live (the `>= 3` gate already reads `summary.nRaces`, now live-only — inherited, no extra change) → Task 4. ✓
- §6 one-time restamp is an OWNER ops step (documented in the spec) — no code task. ✓ (Handoff note added at branch-finish.)
- §7 tests (calibration exclusion, snapshot-write stamp+default-unchanged, reconcile default-write) → Tasks 1–3. ✓
- Non-goals (no `/weekend` labeling, no %-calibration, live cron unchanged) → honored. ✓

**Placeholder scan:** none — every step has concrete code/commands/expected output. The one conditional ("if `Stat.gloss` is required, pass `""`") names the exact check + fallback, not a vague TODO.

**Type consistency:** `reconstructed?: boolean` identical on `CalibrationRow` (Task 1) and `WriteDeps` (Task 2); `nReconstructed: number` added to `CalibrationSummary` in Task 1 and consumed in Task 4; `ScoredRace.reconstructed: boolean` (Task 4) derived from `CalibrationRow.reconstructed`. The reconciler default `write` option object `{ force: false, reconstructed: true }` matches `WriteDeps`. The `>= 3` chart gate and `nRaces===0`/`index.length===0` state gates are consistent with the live-vs-total split defined in Task 1.
