# Snapshot `final`-capture reconciler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `final` snapshot capture self-healing — the daily cron backfills any completed round still missing a `final` (freezes the past-predictions snapshot AND scores calibration), so a missed post-race window no longer silently drops a race from `/weekend` and `/accuracy`.

**Architecture:** A new pure `reconcileFinals(year, rounds, deps)` scans the season's rounds from `race_calendar.json`, skips rounds already snapshotted, skips rounds with no actuals yet (the un-raced target), and calls the existing `writeWeekendSnapshot(..., "final")` for the rest. It runs from the existing daily cron route on every fire, INDEPENDENT of whether a checkpoint is due for the current gp. No new cron, no R17/secret change.

**Tech Stack:** TypeScript (Next.js App Router), vitest. Blob I/O is injectable for testing.

## Global Constraints

- **No new Vercel cron entry** (Hobby cron limits) — augment the existing `app/api/cron/snapshot/route.ts`. No `vercel.json` change.
- **No R17 / GitHub-Actions change, no new secret, no deploy-readiness polling.**
- **Idempotent + safe:** never rebuild an existing `final` (existence check + `force:false`); never write a bogus empty-actuals `final` (skip when `getActualFinish` is empty — this is the gate that excludes the un-raced upcoming target). `writeWeekendSnapshot` already refuses to double-count a gp in the calibration index.
- **Reconcile must not break the primary write:** a reconcile failure is caught and returned as `{ error }`, never a 500 for the due-checkpoint write.
- **Reconcile runs regardless of `dueCheckpoint`** (the missed-final case is precisely when nothing is due for the current gp).
- **No behavior change** to the existing due-checkpoint write, the admin route, `build-snapshot.ts`, the Python pipeline, or any bundled data artifact.
- **Commits:** conventional style, description only. NO Claude/AI attribution, NO Co-Authored-By, NO robot emoji.
- Run TS tests: `npm run test`. Single file: `npm run test -- reconcile`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.

## File Structure

- `app/lib/snapshot-write.ts` (MODIFY) — export the previously-private `getActualFinish` (renamed from `realGetActualFinish`) so the reconciler reuses it; rename the internal local that shadowed it.
- `app/lib/reconcile-finals.ts` (NEW) — `reconcileFinals` (throws-through pure logic) + `safeReconcileFinals` (guarded wrapper) + `ReconcileDeps`/`ReconcileResult`.
- `app/lib/reconcile-finals.test.ts` (NEW) — full unit coverage with injected I/O.
- `app/api/cron/snapshot/route.ts` (MODIFY) — run `safeReconcileFinals` on every fire, include the summary in the response, keep the due write independent.

### Deviation from spec §8 (route-handler test)

The spec named a cron-route test for reconcile-summary-present + failure-isolation. There is no precedent for Next route-handler tests in this repo (all tests are on `app/lib/*`), and such a test needs a `Request` + env + module mocks (fragile). Instead, failure-isolation is guaranteed by `safeReconcileFinals` (its own try/catch) and fully unit-tested in `reconcile-finals.test.ts`; the route becomes trivial glue calling that wrapper. Net coverage of the invariant is equal or better, without a new fragile harness.

---

### Task 1: Export `getActualFinish` from `snapshot-write.ts`

**Files:**
- Modify: `app/lib/snapshot-write.ts`
- Test: `app/lib/snapshot-write.test.ts` (existing — must stay green)

**Interfaces:**
- Produces: `export async function getActualFinish(year: number, gp: string): Promise<string[]>` (the `/api/results` → `finishOrder` fetch, previously the private `realGetActualFinish`). Reused by the reconciler in Task 2.

- [ ] **Step 1: Rename + export the fetch helper**

In `app/lib/snapshot-write.ts`, change the private function (currently `async function realGetActualFinish(...)`, ~lines 24-34) to an exported name:

```ts
export async function getActualFinish(year: number, gp: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${selfBase()}/api/results?year=${year}&gp=${encodeURIComponent(gp)}`,
      { cache: "no-store" },
    );
    return res.ok ? ((await res.json()).finishOrder ?? []) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Fix the shadowed local inside `writeWeekendSnapshot`**

The function body has `const getActualFinish = deps.getActualFinish ?? realGetActualFinish;` (~line 66) and later `const actualFinish = await getActualFinish(year, gp);` (~line 76). The local now collides with the exported name. Rename the LOCAL to `fetchActualFinish`:

Change line ~66 from:
```ts
  const getActualFinish = deps.getActualFinish ?? realGetActualFinish;
```
to:
```ts
  const fetchActualFinish = deps.getActualFinish ?? getActualFinish;
```

And change line ~76 from:
```ts
    const actualFinish = await getActualFinish(year, gp);
```
to:
```ts
    const actualFinish = await fetchActualFinish(year, gp);
```

(The `deps.getActualFinish` field name in `WriteDeps` is UNCHANGED — only the local variable and the module function name change.)

- [ ] **Step 3: Run the existing snapshot-write tests to confirm no regression**

Run: `npm run test -- snapshot-write`
Expected: PASS (same count as before — the rename is behavior-preserving; the injected-deps test path still overrides via `deps.getActualFinish`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no other file referenced `realGetActualFinish` — it was private).

- [ ] **Step 5: Commit**

```bash
git add app/lib/snapshot-write.ts
git commit -m "refactor: export getActualFinish from snapshot-write for reuse"
```

---

### Task 2: `reconcileFinals` + `safeReconcileFinals`

**Files:**
- Create: `app/lib/reconcile-finals.ts`
- Test: `app/lib/reconcile-finals.test.ts`

**Interfaces:**
- Consumes: `getActualFinish` (Task 1) from `./snapshot-write`; `writeWeekendSnapshot` from `./snapshot-write`; `getJson` from `./blob`; `snapshotKey` from `./snapshot`.
- Produces:
  - `reconcileFinals(year: number, rounds: string[], deps?: ReconcileDeps): Promise<ReconcileResult>` — throws through if a dep throws.
  - `safeReconcileFinals(year: number, rounds: string[], deps?: ReconcileDeps): Promise<ReconcileResult | { error: string }>` — guarded wrapper.
  - `ReconcileResult = { backfilled: string[]; alreadyPresent: string[]; notRaced: string[] }`.
  - `ReconcileDeps = { getJson?; getActualFinish?; write? }` (all optional, injectable).

- [ ] **Step 1: Write the failing tests**

Create `app/lib/reconcile-finals.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { reconcileFinals, safeReconcileFinals } from "./reconcile-finals";
import { snapshotKey } from "./snapshot";

// Injected deps: a map of existing final-snapshot keys, and a map of gp -> finishOrder.
function deps(opts: {
  existingFinals?: string[];
  actuals?: Record<string, string[]>;
}) {
  const existing = new Set(opts.existingFinals ?? []);
  const actuals = opts.actuals ?? {};
  const write = vi.fn(async (_y: number, _g: string) => ({ status: "snapshotted" }));
  return {
    write,
    getJson: async <T>(key: string) => (existing.has(key) ? ({} as T) : null),
    getActualFinish: async (_y: number, gp: string) => actuals[gp] ?? [],
  };
}

const YEAR = 2026;

describe("reconcileFinals", () => {
  it("backfills a completed round with no final snapshot", async () => {
    const d = deps({ actuals: { "Great Britain": ["NOR", "LEC", "PIA"] } });
    const out = await reconcileFinals(YEAR, ["Great Britain"], d);
    expect(out.backfilled).toEqual(["Great Britain"]);
    expect(out.alreadyPresent).toEqual([]);
    expect(out.notRaced).toEqual([]);
    expect(d.write).toHaveBeenCalledTimes(1);
    expect(d.write).toHaveBeenCalledWith(YEAR, "Great Britain");
  });

  it("skips a round whose final snapshot already exists", async () => {
    const d = deps({
      existingFinals: [snapshotKey(YEAR, "Austria", "final")],
      actuals: { Austria: ["VER", "NOR", "LEC"] },
    });
    const out = await reconcileFinals(YEAR, ["Austria"], d);
    expect(out.alreadyPresent).toEqual(["Austria"]);
    expect(out.backfilled).toEqual([]);
    expect(d.write).not.toHaveBeenCalled();
  });

  it("skips a round with no actuals yet (un-raced target)", async () => {
    const d = deps({ actuals: {} }); // Belgium not yet raced -> empty finishOrder
    const out = await reconcileFinals(YEAR, ["Belgium"], d);
    expect(out.notRaced).toEqual(["Belgium"]);
    expect(out.backfilled).toEqual([]);
    expect(d.write).not.toHaveBeenCalled();
  });

  it("partitions a mixed rounds list correctly", async () => {
    const d = deps({
      existingFinals: [snapshotKey(YEAR, "Austria", "final")],
      actuals: {
        Austria: ["VER"],
        "Great Britain": ["NOR", "LEC", "PIA"],
        // Belgium omitted -> notRaced
      },
    });
    const out = await reconcileFinals(
      YEAR,
      ["Austria", "Great Britain", "Belgium"],
      d,
    );
    expect(out.alreadyPresent).toEqual(["Austria"]);
    expect(out.backfilled).toEqual(["Great Britain"]);
    expect(out.notRaced).toEqual(["Belgium"]);
    expect(d.write).toHaveBeenCalledTimes(1);
    expect(d.write).toHaveBeenCalledWith(YEAR, "Great Britain");
  });
});

describe("safeReconcileFinals", () => {
  it("returns the summary on success", async () => {
    const d = deps({ actuals: { "Great Britain": ["NOR"] } });
    const out = await safeReconcileFinals(YEAR, ["Great Britain"], d);
    expect(out).toEqual({
      backfilled: ["Great Britain"],
      alreadyPresent: [],
      notRaced: [],
    });
  });

  it("returns an error object instead of throwing when a dep fails", async () => {
    const out = await safeReconcileFinals(YEAR, ["Great Britain"], {
      getJson: async () => {
        throw new Error("blob down");
      },
    });
    expect(out).toEqual({ error: "reconcile failed" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- reconcile`
Expected: FAIL — cannot import from `./reconcile-finals` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `app/lib/reconcile-finals.ts`:

```ts
// Self-healing backfill of missing `final` snapshots (the artifact that freezes the
// past-predictions call AND scores the season calibration index). The daily cron only
// snapshots the CURRENT schedule.gp for the checkpoint due "now", so a race whose post-race
// window is missed before the schedule rolls forward is silently dropped from /weekend and
// /accuracy (the Great Britain 2026 failure). This scans the season's rounds and backfills
// any completed round still missing its `final`. Idempotent; reuses writeWeekendSnapshot.
// I/O is injectable so the logic is unit-testable without Blob.
import { getJson as realGetJson } from "./blob";
import { snapshotKey, type WeekendSnapshot } from "./snapshot";
import { writeWeekendSnapshot, getActualFinish as realGetActualFinish } from "./snapshot-write";

export interface ReconcileDeps {
  getJson?: <T>(key: string) => Promise<T | null>;
  getActualFinish?: (year: number, gp: string) => Promise<string[]>;
  write?: (year: number, gp: string) => Promise<unknown>;
}

export interface ReconcileResult {
  backfilled: string[]; // finals newly written this run
  alreadyPresent: string[]; // final snapshot already existed
  notRaced: string[]; // no actuals yet (un-raced target / results not ready)
}

/** Backfill any completed round in `rounds` that lacks a `final` snapshot. A round is
 *  skipped when its final already exists (idempotent) or when no actual finishing order is
 *  available yet (the un-raced upcoming target, or results not published) — the latter guard
 *  is why we never write a bogus empty-actuals final. Throws through if a dep throws. */
export async function reconcileFinals(
  year: number,
  rounds: string[],
  deps: ReconcileDeps = {},
): Promise<ReconcileResult> {
  const getJson = deps.getJson ?? realGetJson;
  const getActualFinish = deps.getActualFinish ?? realGetActualFinish;
  const write =
    deps.write ?? ((y: number, g: string) => writeWeekendSnapshot(y, g, "final", { force: false }));

  const backfilled: string[] = [];
  const alreadyPresent: string[] = [];
  const notRaced: string[] = [];

  for (const gp of rounds) {
    if (await getJson<WeekendSnapshot>(snapshotKey(year, gp, "final"))) {
      alreadyPresent.push(gp);
      continue;
    }
    const actual = await getActualFinish(year, gp);
    if (!actual || actual.length === 0) {
      notRaced.push(gp);
      continue;
    }
    await write(year, gp);
    backfilled.push(gp);
  }

  return { backfilled, alreadyPresent, notRaced };
}

/** Guarded wrapper: never throws, so a reconcile failure can never break the cron's primary
 *  due-checkpoint write. Returns the summary, or `{ error }` on any failure. */
export async function safeReconcileFinals(
  year: number,
  rounds: string[],
  deps: ReconcileDeps = {},
): Promise<ReconcileResult | { error: string }> {
  try {
    return await reconcileFinals(year, rounds, deps);
  } catch (e) {
    console.error("reconcile finals failed", e);
    return { error: "reconcile failed" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- reconcile`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/lib/reconcile-finals.ts app/lib/reconcile-finals.test.ts
git commit -m "feat: reconcileFinals backfills missing final snapshots (self-healing)"
```

---

### Task 3: Wire the reconciler into the daily cron

**Files:**
- Modify: `app/api/cron/snapshot/route.ts`

**Interfaces:**
- Consumes: `safeReconcileFinals` (Task 2); `@/src/race_calendar.json` (shape `{ "2026": string[] }`).
- Produces: the cron response now includes `reconcile` alongside the due-checkpoint result.

- [ ] **Step 1: Add imports**

In `app/api/cron/snapshot/route.ts`, add to the imports:

```ts
import raceCalendar from "@/src/race_calendar.json";
import { safeReconcileFinals } from "@/app/lib/reconcile-finals";
```

- [ ] **Step 2: Run reconcile on every fire, independent of the due checkpoint**

Replace the current `try` block body:

```ts
  try {
    const s = schedule as SessionSchedule;
    const due = dueCheckpoint(new Date(), s);
    if (!due) return NextResponse.json({ status: "no checkpoint due" });
    const result = await writeWeekendSnapshot(s.year, s.gp, due, { force });
    return NextResponse.json(result);
  } catch (e) {
    console.error("cron snapshot failed", e);
    return NextResponse.json({ error: "snapshot failed" }, { status: 500 });
  }
```

with:

```ts
  try {
    const s = schedule as SessionSchedule;
    // Reconcile runs on EVERY fire, independent of the current gp's due checkpoint: the
    // missed-final case is exactly when nothing is due for schedule.gp but a prior round
    // still needs its final captured.
    const rounds = (raceCalendar as Record<string, string[]>)[String(s.year)] ?? [];
    const reconcile = await safeReconcileFinals(s.year, rounds);

    const due = dueCheckpoint(new Date(), s);
    const result = due
      ? await writeWeekendSnapshot(s.year, s.gp, due, { force })
      : { status: "no checkpoint due" as const };
    return NextResponse.json({ ...result, reconcile });
  } catch (e) {
    console.error("cron snapshot failed", e);
    return NextResponse.json({ error: "snapshot failed" }, { status: 500 });
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (`raceCalendar` is a JSON import; the `Record<string, string[]>` cast + `String(s.year)` index is type-safe. `resolveJsonModule` is already enabled — other files import JSON the same way.)

- [ ] **Step 4: Run the full vitest suite + build**

Run: `npm run test`
Expected: all pass (no regression; the cron route has no existing test to break, and snapshot-write/reconcile tests are green).

Run: `npm run build`
Expected: clean (`/api/cron/snapshot` still builds as a dynamic route).

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/snapshot/route.ts
git commit -m "feat: daily cron reconciles missing final snapshots on every fire"
```

---

## Self-Review

**Spec coverage:**
- §3 mechanism (augment daily cron, no new cron/R17) → Task 3. ✓ (refined: reconcile runs independent of `due` — a correctness improvement over the spec's "after the due write" wording, necessary because the missed-final case has no due checkpoint.)
- §4 reconcile function (existence skip, empty-actuals gate, writeWeekendSnapshot reuse, 3-way summary, injectable I/O, `force:false`) → Task 2. ✓
- §5 shared `getActualFinish` export → Task 1. ✓
- §6 candidate rounds from `race_calendar.json` (`{year: [...]}`, includes + gates out the target) → Task 3 Step 2 + Task 2 empty-actuals gate. ✓
- §7 cron route shape → Task 3. ✓
- §8 tests: reconcile unit tests (backfill / already / not-raced / mixed / force:false-by-default) + failure-isolation → Task 2. Route-handler test intentionally replaced by `safeReconcileFinals` coverage (documented deviation above). ✓
- §10 observability (`reconcile` summary in response) → Task 3 Step 2. ✓
- Non-goals (no vercel.json/R17/admin/pipeline/data changes) → honored across all tasks. ✓

**Placeholder scan:** none — every step has concrete code, commands, and expected output.

**Type consistency:** `getActualFinish(year, gp): Promise<string[]>` defined in Task 1, consumed as the reconciler default in Task 2. `reconcileFinals`/`safeReconcileFinals` signatures and `ReconcileResult`/`ReconcileDeps` shapes are identical across Task 2's tests, implementation, and Task 3's call site. `write` dep is `(year, gp) => Promise<unknown>`, matching the default `writeWeekendSnapshot(y, g, "final", {force:false})`. The `deps.getActualFinish` field name in `WriteDeps` is preserved in Task 1 (only the local var + module fn renamed), so `snapshot-write.ts`'s own tests keep passing.
```
