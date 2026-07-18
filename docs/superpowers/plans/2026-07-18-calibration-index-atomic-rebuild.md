# Atomic calibration-index rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop mutating the calibration index row-by-row (the non-atomic RMW that lost rows). Make it a pure projection of the final snapshots, rebuilt in a single atomic, calendar-ordered write.

**Architecture:** `writeWeekendSnapshot` no longer writes the index — it only writes the snapshot, now carrying a `reconstructed` bit. A new `rebuildCalibrationIndex` reads every final snapshot and writes the whole index once. The daily cron rebuilds each fire (after reconcile + due-write); an admin endpoint rebuilds on demand for recovery.

**Tech Stack:** TypeScript (Next.js App Router), vitest. Blob I/O injectable for tests.

## Global Constraints

- **`writeWeekendSnapshot` MUST NOT write the calibration index anymore** — the entire `getJson(seasonIndexKey)` → push → `putJson(seasonIndexKey)` block is removed. This deletes the read-modify-write at its source (the root cause).
- **The index is written ONLY by `rebuildCalibrationIndex`, in a single `putJson`** — never per-round, never in a loop. This is the invariant that fixes lost updates.
- **`reconstructed` now lives on the SNAPSHOT object** (`WeekendSnapshot.reconstructed`), stamped by the write path (reconciler/admin → true; live cron due-write → absent). The rebuild carries it from the snapshot onto the index row.
- **Rebuild is calendar-ordered** — iterate `race_calendar.json[year]` in order; the output index row order equals that input order.
- **Cron rebuild runs LAST** (after `safeReconcileFinals` and the due-checkpoint write) so a live `final` written this fire is scored the same run. Rebuild failure is caught and reported, never 500s the cron.
- Round every number that reaches output (existing `computeCalibrationRow` rounding stays).
- **Commits:** conventional, description only. NO Claude/AI attribution, NO Co-Authored-By, NO robot emoji.
- TS tests: `npm run test`. Single: `npm run test -- <name>`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.

## File Structure

- `app/lib/snapshot.ts` (MODIFY) — `WeekendSnapshot.reconstructed?: boolean`.
- `app/lib/snapshot-write.ts` (MODIFY) — remove the index block; stamp `snap.reconstructed`; keep `snap.actuals`; drop now-unused imports.
- `app/lib/calibration-index.ts` (NEW) — `rebuildCalibrationIndex` + `safeRebuildCalibrationIndex`.
- `app/lib/calibration-index.test.ts` (NEW).
- `app/lib/snapshot-write.test.ts` (MODIFY) — retarget index-write assertions to the snapshot object; drop the double-append test.
- `app/api/cron/snapshot/route.ts` (MODIFY) — rebuild last, failure-isolated, in response.
- `app/api/admin/rebuild-calibration/route.ts` (NEW) — on-demand rebuild.

---

### Task 1: Move `reconstructed` to the snapshot; remove the index write from `writeWeekendSnapshot`

**Files:**
- Modify: `app/lib/snapshot.ts`
- Modify: `app/lib/snapshot-write.ts`
- Test: `app/lib/snapshot-write.test.ts`

**Interfaces:**
- Produces: `WeekendSnapshot.reconstructed?: boolean`. `writeWeekendSnapshot` writes only the snapshot (with `actuals` on final + `reconstructed` when the option is set) and `latest`; it no longer reads or writes `seasonIndexKey`.

- [ ] **Step 1: Update the existing tests to the new contract (write them first, expect fail)**

In `app/lib/snapshot-write.test.ts`:

Replace the test `"writes final + latest, stamps actuals, and appends one calibration row"` (the body asserting `io.store[seasonIndexKey(2026)]`) with a version that asserts NO index write:

```ts
  it("writes final + latest, stamps actuals, and does NOT write the index", async () => {
    const io = fakeStore();
    await writeWeekendSnapshot(2026, "Great Britain", "final", {
      ...io,
      build: fakeBuild,
      getActualFinish: async () => ["NOR", "LEC", "PIA"],
    });
    const snap = io.store[snapshotKey(2026, "Great Britain", "final")] as WeekendSnapshot;
    expect(snap.actuals).toEqual(["NOR", "LEC", "PIA"]);
    expect(io.store[latestKey(2026, "Great Britain")]).toBeDefined();
    expect(io.store[seasonIndexKey(2026)]).toBeUndefined(); // index is rebuilt elsewhere now
  });
```

DELETE the test `"does not double-append a gp already in the calibration index"` (the function no longer writes the index; the rebuild starts from an empty array so double-append is structurally impossible).

Keep `"post-quali writes the snapshot without scoring"` as-is (it already asserts `seasonIndexKey` is undefined — still true).

Replace the two reconstructed tests so they assert the SNAPSHOT object, not an index row:

```ts
  it("stamps reconstructed:true on the snapshot when the option is set", async () => {
    const store = fakeStore();
    await writeWeekendSnapshot(2026, "China", "final", {
      ...store,
      build: fakeBuild,
      getActualFinish: async () => ["NOR", "LEC", "PIA"],
      reconstructed: true,
    });
    const snap = store.store[snapshotKey(2026, "China", "final")] as WeekendSnapshot;
    expect(snap.reconstructed).toBe(true);
  });

  it("omits reconstructed on the snapshot for the live path (default)", async () => {
    const store = fakeStore();
    await writeWeekendSnapshot(2026, "Austria", "final", {
      ...store,
      build: fakeBuild,
      getActualFinish: async () => ["VER", "NOR", "LEC"],
    });
    const snap = store.store[snapshotKey(2026, "Austria", "final")] as WeekendSnapshot;
    expect("reconstructed" in snap).toBe(false);
  });
```

Ensure `snapshotKey` and `latestKey` are imported in the test file (the import block already pulls from `./snapshot`; add any missing names).

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test -- snapshot-write`
Expected: FAIL — `writeWeekendSnapshot` still writes the index / still stamps the row, and `snap.reconstructed` isn't set.

- [ ] **Step 3: Add the type field**

In `app/lib/snapshot.ts`, add to `WeekendSnapshot` (after `actuals?: unknown;`):

```ts
  actuals?: unknown;
  reconstructed?: boolean; // true when this final was written post-hoc (reconciler/admin), not live
```

- [ ] **Step 4: Remove the index block from `writeWeekendSnapshot`; stamp the snapshot**

In `app/lib/snapshot-write.ts`, replace the whole `if (checkpoint === "final") { ... }` block plus the trailing writes:

```ts
  const snap = await build(year, gp, checkpoint);

  if (checkpoint === "final") {
    const actualFinish = await fetchActualFinish(year, gp);
    snap.actuals = actualFinish;
    if (actualFinish.length > 0) {
      const idxKey = seasonIndexKey(year);
      const idx = (await getJson<unknown[]>(idxKey)) ?? [];
      if (!idx.some((r) => (r as { gp?: string }).gp === gp)) {
        const cal = computeCalibrationRow(
          snap.podium as { drivers: { driver: string; p_podium: number }[] },
          actualFinish,
        );
        idx.push({ gp, issuedAt: snap.issuedAt, ...cal, ...(reconstructed ? { reconstructed: true } : {}) });
        await putJson(idxKey, idx);
      }
    }
  }

  await putJson(key, snap);
  await putJson(latestKey(year, gp), snap);
  return { status: "snapshotted", checkpoint, forced: force };
```

with:

```ts
  const snap = await build(year, gp, checkpoint);

  if (checkpoint === "final") {
    snap.actuals = await fetchActualFinish(year, gp);
  }
  if (reconstructed) {
    snap.reconstructed = true;
  }

  await putJson(key, snap);
  await putJson(latestKey(year, gp), snap);
  return { status: "snapshotted", checkpoint, forced: force };
```

Then remove the now-unused imports from `app/lib/snapshot-write.ts`: `seasonIndexKey` (from the `./snapshot` import) and `computeCalibrationRow` (the whole `import { computeCalibrationRow } from "./actuals";` line). Keep `snapshotKey`, `latestKey`, `WeekendSnapshot`, `Checkpoint`. Update the function's doc comment: it now "writes the snapshot (+ actuals on final, + reconstructed flag) and `latest`; the calibration index is rebuilt separately by `rebuildCalibrationIndex`."

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test -- snapshot-write`
Expected: PASS (updated tests).

Run: `npx tsc --noEmit`
Expected: clean. (If `getJson` becomes unused in `writeWeekendSnapshot` after removing the index read, the compiler under `noUnusedLocals` may flag it — the short-circuit read at the top still uses `getJson`, so it stays used. Verify no unused-import errors; remove any that surface.)

- [ ] **Step 6: Commit**

```bash
git add app/lib/snapshot.ts app/lib/snapshot-write.ts app/lib/snapshot-write.test.ts
git commit -m "refactor: writeWeekendSnapshot stamps snapshot.reconstructed and no longer writes the calibration index"
```

---

### Task 2: `rebuildCalibrationIndex` — the atomic projection writer

**Files:**
- Create: `app/lib/calibration-index.ts`
- Test: `app/lib/calibration-index.test.ts`

**Interfaces:**
- Consumes: `WeekendSnapshot.reconstructed` + `.actuals` + `.podium` (Task 1); `computeCalibrationRow` from `./actuals`; `snapshotKey`/`seasonIndexKey` from `./snapshot`; `getJson`/`putJson` from `./blob`.
- Produces:
  - `rebuildCalibrationIndex(year: number, rounds: string[], deps?: RebuildDeps): Promise<{ rows: number }>` — reads each final snapshot in `rounds` order, builds the index, writes it ONCE.
  - `safeRebuildCalibrationIndex(year, rounds, deps?): Promise<{ rows: number } | { error: string }>` — guarded wrapper (never throws).
  - `RebuildDeps = { getJson?; putJson? }`.

- [ ] **Step 1: Write the failing tests**

Create `app/lib/calibration-index.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { rebuildCalibrationIndex, safeRebuildCalibrationIndex } from "./calibration-index";
import { snapshotKey, seasonIndexKey } from "./snapshot";

function snap(gp: string, actuals: string[] | undefined, reconstructed?: boolean) {
  return {
    year: 2026, gp, checkpoint: "final", issuedAt: `2026-01-01T00:00:00.000Z`,
    podium: { drivers: [{ driver: "NOR", p_podium: 0.6 }, { driver: "LEC", p_podium: 0.4 }, { driver: "PIA", p_podium: 0.3 }] },
    pace: null, strategy: null, calibrationNote: "n",
    ...(actuals ? { actuals } : {}),
    ...(reconstructed ? { reconstructed: true } : {}),
  };
}

// Injected store: snapshots keyed by their snapshotKey; putJson captures the index write.
function io(snaps: Record<string, unknown>) {
  const store: Record<string, unknown> = { ...snaps };
  const putJson = vi.fn(async (k: string, v: unknown) => { store[k] = v; return `blob://${k}`; });
  return {
    store, putJson,
    getJson: async <T>(k: string) => (k in store ? (store[k] as T) : null),
  };
}

const YEAR = 2026;

describe("rebuildCalibrationIndex", () => {
  it("builds rows in rounds order and writes the index exactly once", async () => {
    const d = io({
      [snapshotKey(YEAR, "China", "final")]: snap("China", ["NOR", "LEC", "PIA"], true),
      [snapshotKey(YEAR, "Austria", "final")]: snap("Austria", ["VER", "NOR", "LEC"]),
    });
    const out = await rebuildCalibrationIndex(YEAR, ["China", "Austria"], d);
    expect(out).toEqual({ rows: 2 });
    expect(d.putJson).toHaveBeenCalledTimes(1);
    const idx = d.store[seasonIndexKey(YEAR)] as Array<{ gp: string; reconstructed?: boolean }>;
    expect(idx.map((r) => r.gp)).toEqual(["China", "Austria"]); // input order preserved
  });

  it("carries reconstructed from the snapshot; omits it when absent", async () => {
    const d = io({
      [snapshotKey(YEAR, "China", "final")]: snap("China", ["NOR", "LEC", "PIA"], true),
      [snapshotKey(YEAR, "Austria", "final")]: snap("Austria", ["VER", "NOR", "LEC"]),
    });
    await rebuildCalibrationIndex(YEAR, ["China", "Austria"], d);
    const idx = d.store[seasonIndexKey(YEAR)] as Array<{ gp: string; reconstructed?: boolean }>;
    expect(idx.find((r) => r.gp === "China")!.reconstructed).toBe(true);
    expect("reconstructed" in idx.find((r) => r.gp === "Austria")!).toBe(false);
  });

  it("skips rounds with no snapshot, no actuals, or empty actuals", async () => {
    const d = io({
      [snapshotKey(YEAR, "China", "final")]: snap("China", ["NOR", "LEC", "PIA"]),
      [snapshotKey(YEAR, "Miami", "final")]: snap("Miami", undefined),   // no actuals
      [snapshotKey(YEAR, "Canada", "final")]: snap("Canada", []),        // empty actuals
      // Belgium: no snapshot at all
    });
    const out = await rebuildCalibrationIndex(YEAR, ["China", "Miami", "Canada", "Belgium"], d);
    expect(out).toEqual({ rows: 1 });
    const idx = d.store[seasonIndexKey(YEAR)] as Array<{ gp: string }>;
    expect(idx.map((r) => r.gp)).toEqual(["China"]);
  });

  it("safeRebuildCalibrationIndex returns an error object instead of throwing", async () => {
    const out = await safeRebuildCalibrationIndex(YEAR, ["China"], {
      getJson: async () => { throw new Error("blob down"); },
    });
    expect(out).toEqual({ error: "rebuild failed" });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test -- calibration-index`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `app/lib/calibration-index.ts`:

```ts
// The season calibration index is a PURE PROJECTION of the final snapshots, rebuilt in a
// single atomic write. It is the ONLY writer of seasonIndexKey. This replaces the previous
// per-round read-modify-write in writeWeekendSnapshot, which lost rows under Blob's eventual
// consistency when run in a loop (reconciler / admin backfill). Rows are ordered by the caller-
// supplied `rounds` (calendar order). I/O is injectable for tests.
import { getJson as realGetJson, putJson as realPutJson } from "./blob";
import { snapshotKey, seasonIndexKey, type WeekendSnapshot } from "./snapshot";
import { computeCalibrationRow } from "./actuals";

export interface RebuildDeps {
  getJson?: <T>(key: string) => Promise<T | null>;
  putJson?: (key: string, value: unknown) => Promise<string>;
}

/** Read every final snapshot for `rounds` (in order), score the ones with actuals, and write
 *  the whole calibration index in ONE putJson. Race-free by construction; reflects current
 *  snapshot state (so re-stamps take effect); calendar-ordered. */
export async function rebuildCalibrationIndex(
  year: number,
  rounds: string[],
  deps: RebuildDeps = {},
): Promise<{ rows: number }> {
  const getJson = deps.getJson ?? realGetJson;
  const putJson = deps.putJson ?? realPutJson;

  const rows: unknown[] = [];
  for (const gp of rounds) {
    const snap = await getJson<WeekendSnapshot>(snapshotKey(year, gp, "final"));
    const actuals = snap?.actuals as string[] | undefined;
    if (!snap || !actuals || actuals.length === 0) continue;
    const cal = computeCalibrationRow(
      snap.podium as { drivers: { driver: string; p_podium: number }[] },
      actuals,
    );
    rows.push({
      gp,
      issuedAt: snap.issuedAt,
      ...cal,
      ...(snap.reconstructed ? { reconstructed: true } : {}),
    });
  }

  await putJson(seasonIndexKey(year), rows);
  return { rows: rows.length };
}

/** Guarded wrapper: never throws, so a rebuild failure can't break the cron's other work. */
export async function safeRebuildCalibrationIndex(
  year: number,
  rounds: string[],
  deps: RebuildDeps = {},
): Promise<{ rows: number } | { error: string }> {
  try {
    return await rebuildCalibrationIndex(year, rounds, deps);
  } catch (e) {
    console.error("rebuild calibration index failed", e);
    return { error: "rebuild failed" };
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm run test -- calibration-index`
Expected: PASS (4 tests).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/lib/calibration-index.ts app/lib/calibration-index.test.ts
git commit -m "feat: rebuildCalibrationIndex atomically projects the index from final snapshots"
```

---

### Task 3: Wire rebuild into the cron (last) + new admin recovery endpoint

**Files:**
- Modify: `app/api/cron/snapshot/route.ts`
- Create: `app/api/admin/rebuild-calibration/route.ts`

**Interfaces:**
- Consumes: `safeRebuildCalibrationIndex` / `rebuildCalibrationIndex` (Task 2); `raceCalendar`.
- Produces: cron response gains `rebuild`; new GET `/api/admin/rebuild-calibration`.

- [ ] **Step 1: Cron — add the rebuild pass LAST**

In `app/api/cron/snapshot/route.ts`, add to imports:

```ts
import { safeRebuildCalibrationIndex } from "@/app/lib/calibration-index";
```

Change the try-block body so rebuild runs after both reconcile and the due-write. Replace:

```ts
    const rounds = (raceCalendar as Record<string, string[]>)[String(s.year)] ?? [];
    const reconcile = await safeReconcileFinals(s.year, rounds);

    const due = dueCheckpoint(new Date(), s);
    const result = due
      ? await writeWeekendSnapshot(s.year, s.gp, due, { force })
      : { status: "no checkpoint due" as const };
    return NextResponse.json({ ...result, reconcile });
```

with:

```ts
    const rounds = (raceCalendar as Record<string, string[]>)[String(s.year)] ?? [];
    const reconcile = await safeReconcileFinals(s.year, rounds);

    const due = dueCheckpoint(new Date(), s);
    const result = due
      ? await writeWeekendSnapshot(s.year, s.gp, due, { force })
      : { status: "no checkpoint due" as const };

    // Rebuild the calibration index LAST, so it reflects both the reconciler's backfills and a
    // live `final` just written by the due-write above. Single atomic write; failure-isolated.
    const rebuild = await safeRebuildCalibrationIndex(s.year, rounds);

    return NextResponse.json({ ...result, reconcile, rebuild });
```

- [ ] **Step 2: New admin endpoint**

Create `app/api/admin/rebuild-calibration/route.ts`:

```ts
// One-shot atomic rebuild of the season calibration index from the final snapshots — for
// recovery after the index is corrupted or a snapshot's reconstructed flag is re-stamped. The
// daily cron also rebuilds every fire; this is the on-demand handle. Auth-gated like the other
// admin routes (Bearer CRON_SECRET). Writes seasonIndexKey in a single putJson.
//
//   curl "https://<deploy>/api/admin/rebuild-calibration" -H "Authorization: Bearer $CRON_SECRET"
import { NextResponse } from "next/server";
import raceCalendar from "@/src/race_calendar.json";
import schedule from "@/app/data/weekend-schedule.json";
import { rebuildCalibrationIndex } from "@/app/lib/calibration-index";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? (schedule as { year: number }).year);
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "year must be a number" }, { status: 400 });
  }
  const rounds = (raceCalendar as Record<string, string[]>)[String(year)] ?? [];
  try {
    const result = await rebuildCalibrationIndex(year, rounds);
    return NextResponse.json({ ...result, year });
  } catch (e) {
    console.error("admin rebuild-calibration failed", e);
    return NextResponse.json({ error: "rebuild failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck, full suite, build**

Run: `npx tsc --noEmit` → clean.
Run: `npm run test` → all pass (no regression; snapshot-write + calibration-index green, calibration `summarize` untouched).
Run: `npm run build` → clean; `/api/cron/snapshot` and `/api/admin/rebuild-calibration` build as dynamic routes.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/snapshot/route.ts app/api/admin/rebuild-calibration/route.ts
git commit -m "feat: cron rebuilds the calibration index each fire; add admin rebuild endpoint"
```

---

## Self-Review

**Spec coverage:**
- §3 snapshot carries `reconstructed`; `writeWeekendSnapshot` stops writing the index, keeps actuals → Task 1. ✓
- §4 `rebuildCalibrationIndex` (ordered, carries reconstructed, skips no-actuals, single write) + `safeRebuildCalibrationIndex` → Task 2. ✓
- §5 cron rebuilds LAST (after reconcile + due-write), failure-isolated, in response; admin endpoint → Task 3. ✓
- §6 recovery is owner ops (documented in spec); the admin endpoint it needs is built in Task 3. ✓
- §7 tests: rebuild ordering/carry/skip/single-write/safe-wrapper (Task 2); snapshot-write retargeted to the snapshot object + double-append test dropped (Task 1). ✓
- §8 files: all present across the 3 tasks. ✓
- §2 non-goals (no `summarize`/prediction/Python change; chart deferred) → honored. ✓

**Placeholder scan:** none — every step carries concrete code, commands, and expected output. The one conditional (Step 5 Task 1 `noUnusedLocals` on `getJson`) states the exact check + that `getJson` stays used by the short-circuit read.

**Type consistency:** `WeekendSnapshot.reconstructed?: boolean` (Task 1) is read by `rebuildCalibrationIndex` (Task 2) and stamped by `writeWeekendSnapshot` (Task 1). `rebuildCalibrationIndex(year, rounds, deps)` / `safeRebuildCalibrationIndex` signatures + `RebuildDeps` are identical across Task 2's tests, implementation, and Task 3's cron + admin call sites. The index row shape `{ gp, issuedAt, ...cal, reconstructed? }` matches `CalibrationRow` consumed by `summarize` (unchanged). `computeCalibrationRow(podium, actuals)` is used with the same arg shapes as the removed code in Task 1.
