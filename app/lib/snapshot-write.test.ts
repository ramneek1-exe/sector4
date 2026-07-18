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

  it("writes final + latest, stamps actuals, and does NOT write the index", async () => {
    const io = fakeStore();
    await writeWeekendSnapshot(2026, "Great Britain", "final", {
      ...io,
      build: fakeBuild,
      getActualFinish: async () => ["NOR", "LEC", "PIA"],
    });
    const snap = io.store[snapshotKey(2026, "Great Britain", "final")] as WeekendSnapshot;
    expect(snap.actuals).toEqual(["NOR", "LEC", "PIA"]);
    expect(io.store[latestKey(2026, "Great Britain")]).toBeDefined();
    expect(io.store[seasonIndexKey(2026)]).toBeUndefined(); // index is rebuilt elsewhere now
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

  it("stamps reconstructed:true on the snapshot when the option is set", async () => {
    const store = fakeStore();
    await writeWeekendSnapshot(2026, "China", "final", {
      ...store,
      build: fakeBuild,
      getActualFinish: async () => ["NOR", "LEC", "PIA"],
      reconstructed: true,
    });
    const snap = store.store[snapshotKey(2026, "China", "final")] as WeekendSnapshot;
    expect(snap.reconstructed).toBe(true);
  });

  it("omits reconstructed on the snapshot for the live path (default)", async () => {
    const store = fakeStore();
    await writeWeekendSnapshot(2026, "Austria", "final", {
      ...store,
      build: fakeBuild,
      getActualFinish: async () => ["VER", "NOR", "LEC"],
    });
    const snap = store.store[snapshotKey(2026, "Austria", "final")] as WeekendSnapshot;
    expect("reconstructed" in snap).toBe(false);
  });
});
