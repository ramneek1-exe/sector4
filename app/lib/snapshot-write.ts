// Build, (score if final), and persist a weekend snapshot to Blob — the shared core behind
// both the daily cron (app/api/cron/snapshot) and the manual admin backfill endpoint
// (app/api/admin/snapshot). Deciding WHICH (year, gp, checkpoint) to write is the caller's
// job (the cron derives it from the bundled schedule; the admin route takes it as params);
// this module owns idempotency + final-checkpoint scoring + the Blob writes so the two
// callers can't drift. I/O is injectable so the logic is unit-testable without Blob. (M5)
import { buildSnapshot, type SnapshotDeps } from "./build-snapshot";
import { putJson as realPutJson, getJson as realGetJson } from "./blob";
import {
  snapshotKey,
  latestKey,
  type Checkpoint,
  type WeekendSnapshot,
} from "./snapshot";

function selfBase(): string {
  const host = process.env.VERCEL_URL ?? process.env.SELF_BASE_URL;
  if (!host) return "";
  return host.startsWith("http") ? host : `https://${host}`;
}

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

export interface WriteDeps {
  force?: boolean;
  reconstructed?: boolean;
  getJson?: <T>(key: string) => Promise<T | null>;
  putJson?: (key: string, value: unknown) => Promise<string>;
  build?: (year: number, gp: string, checkpoint: Checkpoint) => Promise<WeekendSnapshot>;
  getActualFinish?: (year: number, gp: string) => Promise<string[]>;
  snapshotDeps?: SnapshotDeps;
}

export interface WriteResult {
  status: "already snapshotted" | "snapshotted" | "results not ready";
  checkpoint: Checkpoint;
  forced: boolean;
  /** The snapshot actually persisted by this call (absent when nothing was written). Lets a
   *  caller hand it straight to the calibration rebuild instead of re-reading it from Blob,
   *  which is read-after-write eventually consistent — see RebuildDeps.fresh. */
  snapshot?: WeekendSnapshot;
}

/** Build, (score if final), and persist a weekend snapshot. Idempotent unless `force`: an
 *  existing snapshot for (year, gp, checkpoint) short-circuits without rebuilding. Writes
 *  the snapshot (+ actuals on final, + reconstructed flag) and `latest`; the calibration
 *  index is rebuilt separately by `rebuildCalibrationIndex`. */
export async function writeWeekendSnapshot(
  year: number,
  gp: string,
  checkpoint: Checkpoint,
  deps: WriteDeps = {},
): Promise<WriteResult> {
  const force = deps.force ?? false;
  const reconstructed = deps.reconstructed ?? false;
  const getJson = deps.getJson ?? realGetJson;
  const putJson = deps.putJson ?? realPutJson;
  const build = deps.build ?? ((y, g, c) => buildSnapshot(y, g, c, deps.snapshotDeps));
  const fetchActualFinish = deps.getActualFinish ?? getActualFinish;

  const key = snapshotKey(year, gp, checkpoint);
  if (!force && (await getJson<WeekendSnapshot>(key))) {
    return { status: "already snapshotted", checkpoint, forced: false };
  }

  const snap = await build(year, gp, checkpoint);

  if (checkpoint === "final") {
    const actuals = await fetchActualFinish(year, gp);
    // NEVER persist a final without a finishing order. `schedule.final` is the race START
    // time and the weekend pinger fires hourly, so the due-write routinely lands while the
    // race is still running, when results don't exist yet. Writing then would bake in
    // `actuals: []` — and because the key now exists, the reconciler would treat it as
    // complete and the calibration rebuild skips empty actuals, so the round could never
    // reach /accuracy. (Hungary 2026 was lost exactly this way.) Refusing the write leaves
    // the key absent so the next fire retries. Deliberately checked before the `force`
    // path too: forcing must not be able to poison it either.
    if (actuals.length === 0) {
      return { status: "results not ready", checkpoint, forced: force };
    }
    snap.actuals = actuals;
  }
  if (reconstructed) {
    snap.reconstructed = true;
  }

  await putJson(key, snap);
  await putJson(latestKey(year, gp), snap);
  return { status: "snapshotted", checkpoint, forced: force, snapshot: snap };
}
