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
  seasonIndexKey,
  type Checkpoint,
  type WeekendSnapshot,
} from "./snapshot";
import { computeCalibrationRow } from "./actuals";

function selfBase(): string {
  const host = process.env.VERCEL_URL ?? process.env.SELF_BASE_URL;
  if (!host) return "";
  return host.startsWith("http") ? host : `https://${host}`;
}

async function realGetActualFinish(year: number, gp: string): Promise<string[]> {
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
  getJson?: <T>(key: string) => Promise<T | null>;
  putJson?: (key: string, value: unknown) => Promise<string>;
  build?: (year: number, gp: string, checkpoint: Checkpoint) => Promise<WeekendSnapshot>;
  getActualFinish?: (year: number, gp: string) => Promise<string[]>;
  snapshotDeps?: SnapshotDeps;
}

export interface WriteResult {
  status: "already snapshotted" | "snapshotted";
  checkpoint: Checkpoint;
  forced: boolean;
}

/** Build, (score if final), and persist a weekend snapshot. Idempotent unless `force`: an
 *  existing snapshot for (year, gp, checkpoint) short-circuits without rebuilding. On the
 *  `final` checkpoint, pulls the actual finishing order, stamps it onto the snapshot, and
 *  appends a once-per-gp calibration row to the season index. Writes both the checkpoint
 *  key and `latest`. */
export async function writeWeekendSnapshot(
  year: number,
  gp: string,
  checkpoint: Checkpoint,
  deps: WriteDeps = {},
): Promise<WriteResult> {
  const force = deps.force ?? false;
  const getJson = deps.getJson ?? realGetJson;
  const putJson = deps.putJson ?? realPutJson;
  const build = deps.build ?? ((y, g, c) => buildSnapshot(y, g, c, deps.snapshotDeps));
  const getActualFinish = deps.getActualFinish ?? realGetActualFinish;

  const key = snapshotKey(year, gp, checkpoint);
  if (!force && (await getJson<WeekendSnapshot>(key))) {
    return { status: "already snapshotted", checkpoint, forced: false };
  }

  const snap = await build(year, gp, checkpoint);

  if (checkpoint === "final") {
    const actualFinish = await getActualFinish(year, gp);
    snap.actuals = actualFinish;
    if (actualFinish.length > 0) {
      const idxKey = seasonIndexKey(year);
      const idx = (await getJson<unknown[]>(idxKey)) ?? [];
      // Idempotent: never double-count a gp in the calibration index (matters when a
      // forced re-run re-scores a final snapshot that was already scored).
      if (!idx.some((r) => (r as { gp?: string }).gp === gp)) {
        const cal = computeCalibrationRow(
          snap.podium as { drivers: { driver: string; p_podium: number }[] },
          actualFinish,
        );
        idx.push({ gp, issuedAt: snap.issuedAt, ...cal });
        await putJson(idxKey, idx);
      }
    }
  }

  await putJson(key, snap);
  await putJson(latestKey(year, gp), snap);
  return { status: "snapshotted", checkpoint, forced: force };
}
