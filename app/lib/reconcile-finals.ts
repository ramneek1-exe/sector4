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
    deps.write ?? ((y: number, g: string) => writeWeekendSnapshot(y, g, "final", { force: false, reconstructed: true }));

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
