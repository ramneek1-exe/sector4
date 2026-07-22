import { describe, it, expect, vi } from "vitest";
import { reconcileFinals, safeReconcileFinals } from "./reconcile-finals";
import { snapshotKey } from "./snapshot";

// Injected deps: a map of existing final-snapshot keys, a map of gp -> finishOrder, and a
// map of arbitrary snapshot keys -> snapshot contents (for pre-quali/post-quali lookups).
function deps(opts: {
  existingFinals?: string[];
  actuals?: Record<string, string[]>;
  snapshots?: Record<string, { reconstructed?: boolean }>;
}) {
  const existingFinals = new Set(opts.existingFinals ?? []);
  const actuals = opts.actuals ?? {};
  const snapshots = opts.snapshots ?? {};
  const write = vi.fn(
    async (_y: number, _g: string, _reconstructed: boolean) => ({ status: "snapshotted" }),
  );
  return {
    write,
    getJson: async <T>(key: string) => {
      if (existingFinals.has(key)) return {} as T;
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
    expect(d.write).toHaveBeenCalledWith(YEAR, "Great Britain", true);
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
    expect(d.write).toHaveBeenCalledWith(YEAR, "Belgium", false);
  });

  it("still marks reconstructed:true when the only prior checkpoint was itself reconstructed", async () => {
    const d = deps({
      actuals: { China: ["VER", "NOR", "PIA"] },
      snapshots: {
        [snapshotKey(YEAR, "China", "post-quali")]: { reconstructed: true },
      },
    });
    const out = await reconcileFinals(YEAR, ["China"], d);
    expect(d.write).toHaveBeenCalledWith(YEAR, "China", true);
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
    expect(d.write).toHaveBeenCalledWith(YEAR, "Great Britain", true);
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
