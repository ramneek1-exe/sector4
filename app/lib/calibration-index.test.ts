import { describe, it, expect, vi } from "vitest";
import { rebuildCalibrationIndex, safeRebuildCalibrationIndex } from "./calibration-index";
import { snapshotKey, seasonIndexKey } from "./snapshot";

function snap(gp: string, actuals: string[] | undefined, reconstructed?: boolean) {
  return {
    year: 2026, gp, checkpoint: "final", issuedAt: `2026-01-01T00:00:00.000Z`,
    podium: { drivers: [{ driver: "NOR", p_podium: 0.6 }, { driver: "LEC", p_podium: 0.4 }, { driver: "PIA", p_podium: 0.3 }] },
    pace: null, strategy: null, calibrationNote: "n",
    ...(actuals ? { actuals } : {}),
    ...(reconstructed ? { reconstructed: true } : {}),
  };
}

// Injected store: snapshots keyed by their snapshotKey; putJson captures the index write.
function io(snaps: Record<string, unknown>) {
  const store: Record<string, unknown> = { ...snaps };
  const putJson = vi.fn(async (k: string, v: unknown) => { store[k] = v; return `blob://${k}`; });
  return {
    store, putJson,
    getJson: async <T>(k: string) => (k in store ? (store[k] as T) : null),
  };
}

const YEAR = 2026;

describe("rebuildCalibrationIndex", () => {
  it("builds rows in rounds order and writes the index exactly once", async () => {
    const d = io({
      [snapshotKey(YEAR, "China", "final")]: snap("China", ["NOR", "LEC", "PIA"], true),
      [snapshotKey(YEAR, "Austria", "final")]: snap("Austria", ["VER", "NOR", "LEC"]),
    });
    const out = await rebuildCalibrationIndex(YEAR, ["China", "Austria"], d);
    expect(out).toEqual({ rows: 2 });
    expect(d.putJson).toHaveBeenCalledTimes(1);
    const idx = d.store[seasonIndexKey(YEAR)] as Array<{ gp: string; reconstructed?: boolean }>;
    expect(idx.map((r) => r.gp)).toEqual(["China", "Austria"]); // input order preserved
  });

  it("carries reconstructed from the snapshot; omits it when absent", async () => {
    const d = io({
      [snapshotKey(YEAR, "China", "final")]: snap("China", ["NOR", "LEC", "PIA"], true),
      [snapshotKey(YEAR, "Austria", "final")]: snap("Austria", ["VER", "NOR", "LEC"]),
    });
    await rebuildCalibrationIndex(YEAR, ["China", "Austria"], d);
    const idx = d.store[seasonIndexKey(YEAR)] as Array<{ gp: string; reconstructed?: boolean }>;
    expect(idx.find((r) => r.gp === "China")!.reconstructed).toBe(true);
    expect("reconstructed" in idx.find((r) => r.gp === "Austria")!).toBe(false);
  });

  it("skips rounds with no snapshot, no actuals, or empty actuals", async () => {
    const d = io({
      [snapshotKey(YEAR, "China", "final")]: snap("China", ["NOR", "LEC", "PIA"]),
      [snapshotKey(YEAR, "Miami", "final")]: snap("Miami", undefined),   // no actuals
      [snapshotKey(YEAR, "Canada", "final")]: snap("Canada", []),        // empty actuals
      // Belgium: no snapshot at all
    });
    const out = await rebuildCalibrationIndex(YEAR, ["China", "Miami", "Canada", "Belgium"], d);
    expect(out).toEqual({ rows: 1 });
    const idx = d.store[seasonIndexKey(YEAR)] as Array<{ gp: string }>;
    expect(idx.map((r) => r.gp)).toEqual(["China"]);
  });

  it("safeRebuildCalibrationIndex returns an error object instead of throwing", async () => {
    const out = await safeRebuildCalibrationIndex(YEAR, ["China"], {
      getJson: async () => { throw new Error("blob down"); },
    });
    expect(out).toEqual({ error: "rebuild failed" });
  });
});

// Regression (Hungary 2026): Blob is read-after-write eventually consistent. The cron
// reconciles a missing final and then rebuilds in the SAME run, so the just-written
// snapshot is routinely invisible to the rebuild's own read — the round silently misses
// the index and only lands on the NEXT cron fire (a 24h lag with a daily cron). Callers
// can hand the freshly-written snapshots straight to the rebuild instead of hoping the
// read catches up.
describe("rebuildCalibrationIndex — freshly-written snapshots", () => {
  it("indexes a fresh snapshot that Blob does not return yet", async () => {
    const d = io({
      [snapshotKey(YEAR, "Belgium", "final")]: snap("Belgium", ["NOR", "LEC", "PIA"]),
      // Hungary deliberately absent from the store: models the read-after-write lag.
    });
    const out = await rebuildCalibrationIndex(YEAR, ["Belgium", "Hungary"], {
      ...d,
      fresh: { Hungary: snap("Hungary", ["VER", "NOR", "LEC"]) as never },
    });
    expect(out.rows).toBe(2);
    const rows = d.putJson.mock.calls[0][1] as { gp: string }[];
    expect(rows.map((r) => r.gp)).toEqual(["Belgium", "Hungary"]);
  });

  it("prefers the fresh snapshot over a stale one still being served by Blob", async () => {
    const d = io({
      // Stale read: the poisoned empty-actuals snapshot the fix just overwrote.
      [snapshotKey(YEAR, "Hungary", "final")]: snap("Hungary", undefined),
    });
    const out = await rebuildCalibrationIndex(YEAR, ["Hungary"], {
      ...d,
      fresh: { Hungary: snap("Hungary", ["VER", "NOR", "LEC"]) as never },
    });
    expect(out.rows).toBe(1);
  });

  it("is unchanged when no fresh snapshots are supplied", async () => {
    const d = io({ [snapshotKey(YEAR, "Belgium", "final")]: snap("Belgium", ["NOR"]) });
    const out = await rebuildCalibrationIndex(YEAR, ["Belgium", "Hungary"], d);
    expect(out.rows).toBe(1);
  });
});
