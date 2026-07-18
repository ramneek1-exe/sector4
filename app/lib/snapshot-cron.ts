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
