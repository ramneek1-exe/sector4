import { describe, it, expect } from "vitest";
import { writeWeekendSnapshot } from "./snapshot-write";
import {
  snapshotKey,
  latestKey,
  seasonIndexKey,
  type Checkpoint,
  type WeekendSnapshot,
} from "./snapshot";

// In-memory stand-in for the Blob store so the write logic is testable without network.
function fakeStore(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  return {
    store,
    getJson: async <T>(k: string) => (k in store ? (store[k] as T) : null),
    putJson: async (k: string, v: unknown) => {
      store[k] = v;
      return `blob://${k}`;
    },
  };
}

const podium = {
  drivers: [
    { driver: "NOR", p_podium: 0.6 },
    { driver: "LEC", p_podium: 0.4 },
    { driver: "PIA", p_podium: 0.3 },
  ],
};

const fakeBuild = async (
  year: number,
  gp: string,
  checkpoint: Checkpoint,
): Promise<WeekendSnapshot> => ({
  year,
  gp,
  checkpoint,
  issuedAt: "2026-07-05T15:00:00.000Z",
  podium,
  pace: {},
  strategy: {},
  calibrationNote: "note",
});

describe("writeWeekendSnapshot", () => {
  it("short-circuits when a snapshot exists and force is false", async () => {
    const io = fakeStore({
      [snapshotKey(2026, "Great Britain", "final")]: { existing: true },
    });
    let built = false;
    const res = await writeWeekendSnapshot(2026, "Great Britain", "final", {
      ...io,
      build: async (...a) => {
        built = true;
        return fakeBuild(...a);
      },
      getActualFinish: async () => ["NOR"],
    });
    expect(res.status).toBe("already snapshotted");
    expect(built).toBe(false);
  });

  it("writes final + latest, stamps actuals, and appends one calibration row", async () => {
    const io = fakeStore();
    const res = await writeWeekendSnapshot(2026, "Great Britain", "final", {
      ...io,
      build: fakeBuild,
      getActualFinish: async () => ["NOR", "PIA", "LEC"],
      force: true,
    });
    expect(res.status).toBe("snapshotted");
    const finalSnap = io.store[
      snapshotKey(2026, "Great Britain", "final")
    ] as WeekendSnapshot;
    expect(finalSnap.actuals).toEqual(["NOR", "PIA", "LEC"]);
    expect(io.store[latestKey(2026, "Great Britain")]).toBeTruthy();
    const idx = io.store[seasonIndexKey(2026)] as { gp: string }[];
    expect(idx).toHaveLength(1);
    expect(idx[0].gp).toBe("Great Britain");
    expect(idx[0]).toHaveProperty("top3");
    expect(idx[0]).toHaveProperty("brierContrib");
  });

  it("does not double-append a gp already in the calibration index", async () => {
    const io = fakeStore({
      [seasonIndexKey(2026)]: [{ gp: "Great Britain", top3: 1, brierContrib: 0.1 }],
    });
    await writeWeekendSnapshot(2026, "Great Britain", "final", {
      ...io,
      build: fakeBuild,
      getActualFinish: async () => ["NOR", "PIA", "LEC"],
      force: true,
    });
    expect((io.store[seasonIndexKey(2026)] as unknown[]).length).toBe(1);
  });

  it("post-quali writes the snapshot without scoring", async () => {
    const io = fakeStore();
    await writeWeekendSnapshot(2026, "Great Britain", "post-quali", {
      ...io,
      build: fakeBuild,
      getActualFinish: async () => ["NOR"],
      force: true,
    });
    const snap = io.store[
      snapshotKey(2026, "Great Britain", "post-quali")
    ] as WeekendSnapshot;
    expect(snap).toBeTruthy();
    expect(snap.actuals).toBeUndefined();
    expect(io.store[seasonIndexKey(2026)]).toBeUndefined();
  });

  it("stamps reconstructed:true on the calibration row when the option is set", async () => {
    const store = fakeStore();
    await writeWeekendSnapshot(2026, "China", "final", {
      ...store,
      build: fakeBuild,
      getActualFinish: async () => ["NOR", "LEC", "PIA"],
      reconstructed: true,
    });
    const idx = store.store[seasonIndexKey(2026)] as Array<{ gp: string; reconstructed?: boolean }>;
    const chinaRow = idx.find((r) => r.gp === "China")!;
    expect(chinaRow.reconstructed).toBe(true);
  });

  it("omits reconstructed on the calibration row for the live path (default)", async () => {
    const store = fakeStore();
    await writeWeekendSnapshot(2026, "Austria", "final", {
      ...store,
      build: fakeBuild,
      getActualFinish: async () => ["VER", "NOR", "LEC"],
    });
    const idx = store.store[seasonIndexKey(2026)] as Array<{ gp: string; reconstructed?: boolean }>;
    const austriaRow = idx.find((r) => r.gp === "Austria")!;
    expect("reconstructed" in austriaRow).toBe(false);
  });
});
