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
  /** Snapshots written moments ago in this same run, keyed by gp. Blob is read-after-write
   *  eventually consistent, so a final the cron just wrote is routinely NOT returned by the
   *  read below — the round would silently miss the index and only land on the next fire
   *  (a 24h lag on a daily cron; Hungary 2026 needed two fires). Passing them here makes
   *  the rebuild deterministic instead of dependent on replication timing. Takes precedence
   *  over the stored copy, which may also still be the pre-overwrite version. */
  fresh?: Record<string, WeekendSnapshot>;
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

  const fresh = deps.fresh ?? {};

  const rows: unknown[] = [];
  for (const gp of rounds) {
    const snap = fresh[gp] ?? (await getJson<WeekendSnapshot>(snapshotKey(year, gp, "final")));
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
