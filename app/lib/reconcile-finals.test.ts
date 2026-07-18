import { describe, it, expect, vi } from "vitest";
import { reconcileFinals, safeReconcileFinals } from "./reconcile-finals";
import { snapshotKey } from "./snapshot";

// Injected deps: a map of existing final-snapshot keys, and a map of gp -> finishOrder.
function deps(opts: {
  existingFinals?: string[];
  actuals?: Record<string, string[]>;
}) {
  const existing = new Set(opts.existingFinals ?? []);
  const actuals = opts.actuals ?? {};
  const write = vi.fn(async (_y: number, _g: string) => ({ status: "snapshotted" }));
  return {
    write,
    getJson: async <T>(key: string) => (existing.has(key) ? ({} as T) : null),
    getActualFinish: async (_y: number, gp: string) => actuals[gp] ?? [],
  };
}

const YEAR = 2026;

describe("reconcileFinals", () => {
  it("backfills a completed round with no final snapshot", async () => {
    const d = deps({ actuals: { "Great Britain": ["NOR", "LEC", "PIA"] } });
    const out = await reconcileFinals(YEAR, ["Great Britain"], d);
    expect(out.backfilled).toEqual(["Great Britain"]);
    expect(out.alreadyPresent).toEqual([]);
    expect(out.notRaced).toEqual([]);
    expect(d.write).toHaveBeenCalledTimes(1);
    expect(d.write).toHaveBeenCalledWith(YEAR, "Great Britain");
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
    expect(d.write).toHaveBeenCalledWith(YEAR, "Great Britain");
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
