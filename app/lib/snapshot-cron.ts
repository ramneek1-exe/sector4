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
import type { WeekendSnapshot } from "./snapshot";

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
  // Finals written during THIS run, keyed by gp. Blob is read-after-write eventually
  // consistent, so step 3 re-reading them is a race it frequently loses; handing them over
  // directly makes the index deterministic. (Hungary 2026 needed two cron fires: one to
  // backfill, a later one to index — a 24h lag per race on a daily cron.)
  const fresh: Record<string, WeekendSnapshot> = {};
  if (due) {
    try {
      const { snapshot, ...rest } = await write(s.year, s.gp, due, { force });
      result = { ...rest };
      // Only a `final` carries actuals, so only a final is a calibration input.
      if (due === "final" && snapshot) fresh[s.gp] = snapshot;
    } catch (e) {
      console.error("due-checkpoint write failed", e);
      result = { error: "due write failed" };
    }
  } else {
    result = { status: "no checkpoint due" };
  }

  // 2. Backfill any OTHER missed finals (the current gp is now alreadyPresent if step 1 caught it).
  const reconcileResult = await reconcile(s.year, rounds);
  if ("written" in reconcileResult) Object.assign(fresh, reconcileResult.written);

  // 3. Rebuild the calibration index LAST (single atomic projection of all final snapshots),
  //    preferring anything written above over a possibly-stale Blob read.
  const rebuildResult = await rebuild(s.year, rounds, { fresh });

  return { ...result, reconcile: reconcileResult, rebuild: rebuildResult };
}
