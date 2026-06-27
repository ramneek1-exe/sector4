// Assemble the three prediction cards into one frozen snapshot for a checkpoint.
// Pre-quali pins podium to friday mode (no grid yet); post-quali/final let it auto-
// sharpen (grid present). Network is injected so this is unit-testable. (M5 R13)
import { DEFAULT_YEAR } from "./circuits";
import { getGrid, type Grid } from "./grid";
import type { Checkpoint, WeekendSnapshot } from "./snapshot";

export interface SnapshotDeps {
  fetchPrediction: (path: string, body: Record<string, unknown>) => Promise<unknown>;
  // Resolves the weekend's qualifying grid; injectable for tests. Defaults to the
  // committed app/data/grids.json (written by R17 after quali).
  getGrid?: (year: number, gp: string) => Grid | undefined;
}

const CAL_NOTE =
  "Podium shown as honest bands, not a telemetry edge — probabilities are not yet " +
  "calibrated and will sharpen as the 2026 season accumulates.";

export async function buildSnapshot(
  year: number,
  gp: string,
  checkpoint: Checkpoint,
  deps?: SnapshotDeps,
): Promise<WeekendSnapshot> {
  const fetchPrediction =
    deps?.fetchPrediction ??
    (async (path, body) => {
      // On Vercel, a function calls its own deployment via VERCEL_URL (host only).
      const host = process.env.VERCEL_URL ?? process.env.SELF_BASE_URL;
      const base = host ? (host.startsWith("http") ? host : `https://${host}`) : "";
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      return res.ok ? res.json() : { error: res.status };
    });

  const mode = checkpoint === "pre-quali" ? "friday" : "auto";
  // The grid sharpens the podium Friday -> Saturday, so it only applies once quali has
  // run. If the grid file isn't there yet (R17 hasn't committed it), `grid` is undefined
  // and /api/podium falls back to honest Friday bands rather than a fake grid.
  const grid = checkpoint === "pre-quali" ? undefined : (deps?.getGrid ?? getGrid)(year, gp);
  const [podium, pace, strategy] = await Promise.all([
    fetchPrediction("/api/podium", { year, gp, mode, grid }),
    fetchPrediction("/api/pace", { year, gp }),
    fetchPrediction("/api/strategy", { year, gp }),
  ]);

  return {
    year: year ?? DEFAULT_YEAR,
    gp,
    checkpoint,
    issuedAt: new Date().toISOString(),
    podium,
    pace,
    strategy,
    calibrationNote: CAL_NOTE,
  };
}
