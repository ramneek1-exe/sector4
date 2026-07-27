// Self-healing backfill of missing `final` snapshots (the artifact that freezes the
// past-predictions call AND scores the season calibration index). The daily cron only
// snapshots the CURRENT schedule.gp for the checkpoint due "now", so a race whose post-race
// window is missed before the schedule rolls forward is silently dropped from /weekend and
// /accuracy (the Great Britain 2026 failure). This scans the season's rounds and backfills
// any completed round still missing its `final`. Idempotent; reuses writeWeekendSnapshot.
// I/O is injectable so the logic is unit-testable without Blob.
//
// LABELING: a missed `final` is NOT necessarily "never predicted live" — R17 rolls
// schedule.gp the same day as the race (evening), which structurally beats the next
// once-daily Vercel cron fire, so EVERY race's `final` capture window is missed by
// due-write, live races included (Belgium 2026 was mislabeled this way). The honest signal
// is whether an earlier LIVE checkpoint (post-quali/pre-quali) already exists for the gp —
// if so we forecast it before the race and the final backfill is written unflagged; only a
// gp with no prior live checkpoint (true pre-beta history) gets `reconstructed:true`.
import { getJson as realGetJson } from "./blob";
import { snapshotKey, type WeekendSnapshot } from "./snapshot";
import { writeWeekendSnapshot, getActualFinish as realGetActualFinish } from "./snapshot-write";

export interface ReconcileDeps {
  getJson?: <T>(key: string) => Promise<T | null>;
  getActualFinish?: (year: number, gp: string) => Promise<string[]>;
  write?: (
    year: number,
    gp: string,
    reconstructed: boolean,
    force?: boolean,
  ) => Promise<{ snapshot?: WeekendSnapshot } | unknown>;
}

/** True when this gp already has a live (non-reconstructed) pre-race checkpoint — i.e. we
 *  forecast this weekend before the race, we just missed the `final` capture window. The
 *  daily cron + R17's same-day schedule roll structurally can't land `final`'s due-write
 *  inside the current gp's window (the roll always beats the next once-daily cron fire), so
 *  a missed `final` alone does NOT mean "never predicted live" — check the earlier
 *  checkpoints, which the due-write DOES catch during the week before the roll. */
async function hadLiveCheckpoint(
  year: number,
  gp: string,
  getJson: <T>(key: string) => Promise<T | null>,
): Promise<boolean> {
  for (const checkpoint of ["post-quali", "pre-quali"] as const) {
    const snap = await getJson<WeekendSnapshot>(snapshotKey(year, gp, checkpoint));
    if (snap && !snap.reconstructed) return true;
  }
  return false;
}

export interface ReconcileResult {
  backfilled: string[]; // finals newly written this run
  alreadyPresent: string[]; // final snapshot already existed
  notRaced: string[]; // no actuals yet (un-raced target / results not ready)
  /** The snapshots written this run, keyed by gp. Handed to the calibration rebuild so it
   *  does not have to re-read them from Blob, which may not serve a just-written key yet
   *  (read-after-write consistency). Without this a backfilled round misses the index and
   *  only appears on the NEXT cron fire. */
  written: Record<string, WeekendSnapshot>;
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
    deps.write ??
    ((y: number, g: string, reconstructed: boolean, force = false) =>
      writeWeekendSnapshot(y, g, "final", { force, reconstructed }));

  const backfilled: string[] = [];
  const alreadyPresent: string[] = [];
  const notRaced: string[] = [];
  const written: Record<string, WeekendSnapshot> = {};

  for (const gp of rounds) {
    // A final only counts as complete if it carries a finishing order. A final with EMPTY
    // actuals is unscoreable: the calibration rebuild skips it, so the round would never
    // reach /accuracy, and a bare key-exists check would keep it that way forever. Treat it
    // as missing so it gets rewritten once results land, which also self-heals any snapshot
    // already poisoned this way (Hungary 2026).
    const existing = await getJson<WeekendSnapshot>(snapshotKey(year, gp, "final"));
    const existingActuals = existing?.actuals as string[] | undefined;
    if (existing && existingActuals && existingActuals.length > 0) {
      alreadyPresent.push(gp);
      continue;
    }
    const actual = await getActualFinish(year, gp);
    if (!actual || actual.length === 0) {
      notRaced.push(gp);
      continue;
    }
    const liveForecast = await hadLiveCheckpoint(year, gp, getJson);
    // Overwriting a poisoned final needs `force`; a genuinely absent one does not (and is
    // left unforced so a healthy snapshot can never be clobbered by a stray reconcile).
    const res = (await write(year, gp, !liveForecast, Boolean(existing))) as
      | { snapshot?: WeekendSnapshot; status?: string }
      | undefined;
    // The writer re-fetches actuals and refuses to persist a final without them. That can
    // disagree with the check above if results vanish in between (a narrow race), and
    // reporting a backfill that did not happen would send a reader chasing the wrong thing
    // — so trust the writer's own verdict, not the earlier probe.
    if (res?.status === "results not ready") {
      notRaced.push(gp);
      continue;
    }
    if (res?.snapshot) written[gp] = res.snapshot;
    backfilled.push(gp);
  }

  return { backfilled, alreadyPresent, notRaced, written };
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
