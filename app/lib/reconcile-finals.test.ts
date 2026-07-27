import { describe, it, expect, vi } from "vitest";
import { reconcileFinals, safeReconcileFinals } from "./reconcile-finals";
import { snapshotKey } from "./snapshot";

// Injected deps: a map of existing final-snapshot keys, a map of gp -> finishOrder, and a
// map of arbitrary snapshot keys -> snapshot contents (for pre-quali/post-quali lookups).
function deps(opts: {
  existingFinals?: string[];
  /** Finals that exist but carry empty actuals — the Hungary-2026 poisoned-snapshot case,
   *  written by a due-write that fired while the race was still running. */
  poisonedFinals?: string[];
  actuals?: Record<string, string[]>;
  snapshots?: Record<string, { reconstructed?: boolean }>;
}) {
  const existingFinals = new Set(opts.existingFinals ?? []);
  const poisonedFinals = new Set(opts.poisonedFinals ?? []);
  const actuals = opts.actuals ?? {};
  const snapshots = opts.snapshots ?? {};
  const write = vi.fn(
    async (_y: number, _g: string, _reconstructed: boolean) => ({ status: "snapshotted" }),
  );
  return {
    write,
    getJson: async <T>(key: string) => {
      // A healthy existing final always carries a scored finishing order — that is what
      // makes it "already present". The fixture models that rather than a bare {}.
      if (existingFinals.has(key)) return { actuals: ["VER", "NOR", "LEC"] } as T;
      if (poisonedFinals.has(key)) return { actuals: [] } as T;
      if (key in snapshots) return snapshots[key] as T;
      return null;
    },
    getActualFinish: async (_y: number, gp: string) => actuals[gp] ?? [],
  };
}

const YEAR = 2026;

describe("reconcileFinals", () => {
  it("backfills a completed round with no final snapshot as reconstructed (no prior live checkpoint)", async () => {
    const d = deps({ actuals: { "Great Britain": ["NOR", "LEC", "PIA"] } });
    const out = await reconcileFinals(YEAR, ["Great Britain"], d);
    expect(out.backfilled).toEqual(["Great Britain"]);
    expect(out.alreadyPresent).toEqual([]);
    expect(out.notRaced).toEqual([]);
    expect(d.write).toHaveBeenCalledTimes(1);
    expect(d.write).toHaveBeenCalledWith(YEAR, "Great Britain", true, false);
  });

  it("backfills a missed final as LIVE (not reconstructed) when a live post-quali checkpoint already exists", async () => {
    // Mirrors Belgium 2026: forecast live pre-race (post-quali written by the due-write cron
    // before schedule.gp rolled), but the `final` write window was missed by cron timing.
    const d = deps({
      actuals: { Belgium: ["VER", "NOR", "PIA"] },
      snapshots: {
        [snapshotKey(YEAR, "Belgium", "post-quali")]: { reconstructed: false },
      },
    });
    const out = await reconcileFinals(YEAR, ["Belgium"], d);
    expect(out.backfilled).toEqual(["Belgium"]);
    expect(d.write).toHaveBeenCalledWith(YEAR, "Belgium", false, false);
  });

  it("still marks reconstructed:true when the only prior checkpoint was itself reconstructed", async () => {
    const d = deps({
      actuals: { China: ["VER", "NOR", "PIA"] },
      snapshots: {
        [snapshotKey(YEAR, "China", "post-quali")]: { reconstructed: true },
      },
    });
    const out = await reconcileFinals(YEAR, ["China"], d);
    expect(d.write).toHaveBeenCalledWith(YEAR, "China", true, false);
  });

  it("skips a round whose final snapshot already exists", async () => {
    const d = deps({
      existingFinals: [snapshotKey(YEAR, "Austria", "final")],
      actuals: { Austria: ["VER", "NOR", "LEC"] },
    });
    const out = await reconcileFinals(YEAR, ["Austria"], d);
    expect(out.alreadyPresent).toEqual(["Austria"]);
    expect(out.backfilled).toEqual([]);
    expect(d.write).not.toHaveBeenCalled();
  });

  // Regression: Hungary 2026. A `final` written while the race was still running carried
  // `actuals: []`, and the plain key-exists check treated it as complete forever — the
  // reconciler skipped it and the calibration rebuild ignores empty actuals, so the race
  // never appeared on /accuracy. An unscoreable final must be retried once results land.
  it("rewrites a final that exists but has empty actuals, once results are available", async () => {
    const d = deps({
      poisonedFinals: [snapshotKey(YEAR, "Hungary", "final")],
      actuals: { Hungary: ["NOR", "VER", "ANT"] },
      // A live post-quali exists, so the rewrite must be LIVE, not reconstructed.
      snapshots: { [snapshotKey(YEAR, "Hungary", "post-quali")]: {} },
    });
    const out = await reconcileFinals(YEAR, ["Hungary"], d);
    expect(out.backfilled).toEqual(["Hungary"]);
    expect(out.alreadyPresent).toEqual([]);
    expect(d.write).toHaveBeenCalledWith(YEAR, "Hungary", false, true); // force: overwrite the poisoned key
  });

  it("leaves a poisoned final alone while results are still unavailable", async () => {
    const d = deps({
      poisonedFinals: [snapshotKey(YEAR, "Hungary", "final")],
      actuals: {}, // race still running / results not published
    });
    const out = await reconcileFinals(YEAR, ["Hungary"], d);
    expect(out.notRaced).toEqual(["Hungary"]);
    expect(d.write).not.toHaveBeenCalled();
  });

  it("skips a round with no actuals yet (un-raced target)", async () => {
    const d = deps({ actuals: {} }); // Belgium not yet raced -> empty finishOrder
    const out = await reconcileFinals(YEAR, ["Belgium"], d);
    expect(out.notRaced).toEqual(["Belgium"]);
    expect(out.backfilled).toEqual([]);
    expect(d.write).not.toHaveBeenCalled();
  });

  it("partitions a mixed rounds list correctly", async () => {
    const d = deps({
      existingFinals: [snapshotKey(YEAR, "Austria", "final")],
      actuals: {
        Austria: ["VER"],
        "Great Britain": ["NOR", "LEC", "PIA"],
        // Belgium omitted -> notRaced
      },
    });
    const out = await reconcileFinals(
      YEAR,
      ["Austria", "Great Britain", "Belgium"],
      d,
    );
    expect(out.alreadyPresent).toEqual(["Austria"]);
    expect(out.backfilled).toEqual(["Great Britain"]);
    expect(out.notRaced).toEqual(["Belgium"]);
    expect(d.write).toHaveBeenCalledTimes(1);
    expect(d.write).toHaveBeenCalledWith(YEAR, "Great Britain", true, false);
  });
});

describe("safeReconcileFinals", () => {
  it("returns the summary on success", async () => {
    const d = deps({ actuals: { "Great Britain": ["NOR"] } });
    const out = await safeReconcileFinals(YEAR, ["Great Britain"], d);
    expect(out).toEqual({
      backfilled: ["Great Britain"],
      alreadyPresent: [],
      notRaced: [],
      // The injected write spy returns no `snapshot`, so nothing is collected to hand on.
      written: {},
    });
  });

  it("returns an error object instead of throwing when a dep fails", async () => {
    const out = await safeReconcileFinals(YEAR, ["Great Britain"], {
      getJson: async () => {
        throw new Error("blob down");
      },
    });
    expect(out).toEqual({ error: "reconcile failed" });
  });
});

describe("reconcileFinals — writer's verdict wins", () => {
  it("reports notRaced (not backfilled) when the writer refuses for want of actuals", async () => {
    const d = deps({ actuals: { Hungary: ["NOR", "VER"] } });
    // Models the narrow race: the probe saw actuals, the writer's own re-fetch did not.
    const write = vi.fn(async () => ({ status: "results not ready" }));
    const out = await reconcileFinals(2026, ["Hungary"], { ...d, write });
    expect(out.backfilled).toEqual([]);
    expect(out.notRaced).toEqual(["Hungary"]);
    expect(out.written).toEqual({});
  });
});
