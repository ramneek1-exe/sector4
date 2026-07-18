# Cron reorder — due-write claims the live final — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the snapshot cron to `due-write → reconcile → rebuild` so the due-write captures the current race's `final` LIVE (unflagged) before the reconciler can backfill it as reconstructed — growing the `/accuracy` live-race count. Extract the orchestration into a testable `runSnapshotCron` so the ordering is regression-guarded.

**Architecture:** A new pure `runSnapshotCron(input, deps)` runs the due-write (isolated in its own try/catch) first, then `safeReconcileFinals`, then `safeRebuildCalibrationIndex`, returning the response object. The cron route becomes thin glue (auth + parse + call). Deps are injectable for tests.

**Tech Stack:** TypeScript (Next.js App Router), vitest.

## Global Constraints

- **Order is `due-write → reconcile → rebuild`.** The due-write MUST run before reconcile — that is the fix. The ordering test is the regression guard; do not weaken it.
- **The due-write passes only `{ force }`** (NO `reconstructed`) so a captured final is live. Reconciler/admin still stamp reconstructed elsewhere (unchanged).
- **Due-write is failure-isolated** (its own try/catch → `{ error: "due write failed" }`) so a failure can't skip reconcile + rebuild.
- **No change** to `reconcileFinals`, `rebuildCalibrationIndex`, `writeWeekendSnapshot`, the admin routes, `vercel.json`, R17, Python, or bundled data.
- **Commits:** conventional, description only. NO Claude/AI attribution, NO Co-Authored-By, NO robot emoji.
- TS tests: `npm run test`. Single: `npm run test -- snapshot-cron`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.

## File Structure

- `app/lib/snapshot-cron.ts` (NEW) — `runSnapshotCron` + `RunCronInput`/`RunCronDeps`.
- `app/lib/snapshot-cron.test.ts` (NEW).
- `app/api/cron/snapshot/route.ts` (MODIFY) — thin glue calling `runSnapshotCron`.

---

### Task 1: `runSnapshotCron` orchestrator (reorder + isolate) + route rewire

**Files:**
- Create: `app/lib/snapshot-cron.ts`
- Test: `app/lib/snapshot-cron.test.ts`
- Modify: `app/api/cron/snapshot/route.ts`

**Interfaces:**
- Consumes: `dueCheckpoint`/`SessionSchedule` (`./weekend-schedule`), `writeWeekendSnapshot` (`./snapshot-write`), `safeReconcileFinals` (`./reconcile-finals`), `safeRebuildCalibrationIndex` (`./calibration-index`).
- Produces: `runSnapshotCron(input: RunCronInput, deps?: RunCronDeps): Promise<Record<string, unknown>>`.

- [ ] **Step 1: Write the failing tests**

Create `app/lib/snapshot-cron.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runSnapshotCron, type RunCronInput } from "./snapshot-cron";
import type { SessionSchedule } from "./weekend-schedule";

const SCHEDULE: SessionSchedule = {
  year: 2026,
  gp: "Belgium",
  preQuali: "2026-07-18T10:30:00Z",
  postQuali: "2026-07-18T14:00:00Z",
  final: "2026-07-19T13:00:00Z",
};

function baseInput(now: string, over: Partial<RunCronInput> = {}): RunCronInput {
  return { schedule: SCHEDULE, rounds: ["Austria", "Belgium"], now: new Date(now), force: false, ...over };
}

// Injected spies that record call order into `calls`.
function spies(calls: string[]) {
  return {
    write: vi.fn(async () => { calls.push("write"); return { status: "snapshotted", checkpoint: "final", forced: false }; }),
    reconcile: vi.fn(async () => { calls.push("reconcile"); return { backfilled: [], alreadyPresent: [], notRaced: [] }; }),
    rebuild: vi.fn(async () => { calls.push("rebuild"); return { rows: 2 }; }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("runSnapshotCron", () => {
  it("runs the due-write BEFORE reconcile, then rebuild last", async () => {
    const calls: string[] = [];
    await runSnapshotCron(baseInput("2026-07-19T18:00:00Z"), spies(calls)); // after final -> due
    expect(calls).toEqual(["write", "reconcile", "rebuild"]);
  });

  it("captures the due final live (no reconstructed flag in the write options)", async () => {
    const d = spies([]);
    await runSnapshotCron(baseInput("2026-07-19T18:00:00Z"), d);
    expect(d.write).toHaveBeenCalledWith(2026, "Belgium", "final", { force: false });
    const opts = d.write.mock.calls[0][3];
    expect("reconstructed" in opts).toBe(false);
  });

  it("a due-write failure still runs reconcile + rebuild", async () => {
    const d = spies([]);
    d.write = vi.fn(async () => { throw new Error("boom"); });
    const out = await runSnapshotCron(baseInput("2026-07-19T18:00:00Z"), d);
    expect(d.reconcile).toHaveBeenCalled();
    expect(d.rebuild).toHaveBeenCalled();
    expect(out).toMatchObject({ error: "due write failed", rebuild: { rows: 2 } });
  });

  it("skips the write when nothing is due but still reconciles + rebuilds", async () => {
    const d = spies([]);
    const out = await runSnapshotCron(baseInput("2026-07-18T09:00:00Z"), d); // before preQuali
    expect(d.write).not.toHaveBeenCalled();
    expect(d.reconcile).toHaveBeenCalled();
    expect(d.rebuild).toHaveBeenCalled();
    expect(out.status).toBe("no checkpoint due");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test -- snapshot-cron`
Expected: FAIL — `./snapshot-cron` does not exist.

- [ ] **Step 3: Implement `runSnapshotCron`**

Create `app/lib/snapshot-cron.ts`:

```ts
// Orchestrates one snapshot-cron fire: due-write -> reconcile -> rebuild. Extracted from the
// route so the ORDER is unit-tested. Order matters: the due-write runs FIRST so it captures the
// current race's `final` LIVE (unflagged) before the reconciler could backfill it as
// reconstructed; the reconciler then only backfills genuinely-missed rounds, and the rebuild
// (a single atomic projection of all final snapshots) runs last. The due-write is isolated so a
// failure can't skip reconcile + rebuild. Deps are injectable for tests.
import { dueCheckpoint, type SessionSchedule } from "./weekend-schedule";
import { writeWeekendSnapshot } from "./snapshot-write";
import { safeReconcileFinals } from "./reconcile-finals";
import { safeRebuildCalibrationIndex } from "./calibration-index";

export interface RunCronInput {
  schedule: SessionSchedule;
  rounds: string[];
  now: Date;
  force: boolean;
}

export interface RunCronDeps {
  write?: typeof writeWeekendSnapshot;
  reconcile?: typeof safeReconcileFinals;
  rebuild?: typeof safeRebuildCalibrationIndex;
}

export async function runSnapshotCron(
  input: RunCronInput,
  deps: RunCronDeps = {},
): Promise<Record<string, unknown>> {
  const write = deps.write ?? writeWeekendSnapshot;
  const reconcile = deps.reconcile ?? safeReconcileFinals;
  const rebuild = deps.rebuild ?? safeRebuildCalibrationIndex;
  const { schedule: s, rounds, now, force } = input;

  // 1. Due-write FIRST, isolated. Passes only { force } (no reconstructed) -> a captured final
  //    is LIVE. If it throws, we still fall through to reconcile + rebuild.
  const due = dueCheckpoint(now, s);
  let result: Record<string, unknown>;
  if (due) {
    try {
      result = { ...(await write(s.year, s.gp, due, { force })) };
    } catch (e) {
      console.error("due-checkpoint write failed", e);
      result = { error: "due write failed" };
    }
  } else {
    result = { status: "no checkpoint due" };
  }

  // 2. Backfill any OTHER missed finals (the current gp is now alreadyPresent if step 1 caught it).
  const reconcileResult = await reconcile(s.year, rounds);

  // 3. Rebuild the calibration index LAST (single atomic projection of all final snapshots).
  const rebuildResult = await rebuild(s.year, rounds);

  return { ...result, reconcile: reconcileResult, rebuild: rebuildResult };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- snapshot-cron`
Expected: PASS (4 tests).

- [ ] **Step 5: Rewire the cron route to thin glue**

Replace `app/api/cron/snapshot/route.ts` entirely with:

```ts
// Schedule-aware, idempotent snapshot job (M5). Vercel Cron hits this DAILY (0 6 * * *). The
// orchestration (due-write -> reconcile -> rebuild) lives in runSnapshotCron so its ordering is
// unit-tested; this route is auth + input glue.
import { NextResponse } from "next/server";
import schedule from "@/app/data/weekend-schedule.json";
import type { SessionSchedule } from "@/app/lib/weekend-schedule";
import raceCalendar from "@/src/race_calendar.json";
import { runSnapshotCron } from "@/app/lib/snapshot-cron";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; reject anything else.
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // `?force=1` overwrites an existing snapshot for the due checkpoint (re-issue after a fix).
  const force = ["1", "true"].includes(new URL(req.url).searchParams.get("force") ?? "");
  try {
    const s = schedule as SessionSchedule;
    const rounds = (raceCalendar as Record<string, string[]>)[String(s.year)] ?? [];
    const payload = await runSnapshotCron({ schedule: s, rounds, now: new Date(), force });
    return NextResponse.json(payload);
  } catch (e) {
    console.error("cron snapshot failed", e);
    return NextResponse.json({ error: "snapshot failed" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Typecheck, full suite, build**

Run: `npx tsc --noEmit` → clean.
Run: `npm run test` → all pass (no regression).
Run: `npm run build` → clean; `/api/cron/snapshot` still a dynamic route.

- [ ] **Step 7: Commit**

```bash
git add app/lib/snapshot-cron.ts app/lib/snapshot-cron.test.ts app/api/cron/snapshot/route.ts
git commit -m "fix: cron runs the due-write before reconcile so live finals aren't labeled reconstructed"
```

---

## Self-Review

**Spec coverage:**
- §3.1 `runSnapshotCron` (due-write first + isolated → reconcile → rebuild; `{ force }` only) → Task 1 Step 3. ✓
- §3.2 route thin glue → Task 1 Step 5. ✓
- §4 missed-final safety (reconcile still runs every fire over all rounds) → preserved by the unconditional `reconcile(s.year, rounds)` call. ✓
- §5 tests (ordering guard, live-capture no-reconstructed, failure isolation, no-due path) → Task 1 Step 1. ✓
- §6 files (3) → all in Task 1. ✓
- §2 non-goals (no reconcile/rebuild/writeWeekendSnapshot/admin/vercel/Python change) → honored; only the cron orchestration + a new lib. ✓

**Placeholder scan:** none — every step has concrete code, commands, and expected output.

**Type consistency:** `RunCronInput`/`RunCronDeps` identical across the test, implementation, and route call. `runSnapshotCron` returns `Record<string, unknown>` (the route passes it straight to `NextResponse.json`). The due-write result is spread into a fresh object literal (`{ ...(await write(...)) }`) so `WriteResult` composes into `Record<string, unknown>` without an index-signature error. Deps default to the real `writeWeekendSnapshot` / `safeReconcileFinals` / `safeRebuildCalibrationIndex`, whose signatures (`(year, rounds)` for the latter two) match the call sites.
```
