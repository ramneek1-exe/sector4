import { describe, it, expect, vi } from "vitest";
import { runSnapshotCron, type RunCronInput } from "./snapshot-cron";
import type { SessionSchedule } from "./weekend-schedule";

const SCHEDULE: SessionSchedule = {
  year: 2026,
  gp: "Belgium",
  preQuali: "2026-07-18T10:30:00Z",
  postQuali: "2026-07-18T14:00:00Z",
  final: "2026-07-19T13:00:00Z",
};

function baseInput(now: string, over: Partial<RunCronInput> = {}): RunCronInput {
  return { schedule: SCHEDULE, rounds: ["Austria", "Belgium"], now: new Date(now), force: false, ...over };
}

// Injected spies that record call order into `calls`.
function spies(calls: string[]) {
  return {
    write: vi.fn(async () => { calls.push("write"); return { status: "snapshotted", checkpoint: "final", forced: false }; }),
    reconcile: vi.fn(async () => { calls.push("reconcile"); return { backfilled: [], alreadyPresent: [], notRaced: [] }; }),
    rebuild: vi.fn(async () => { calls.push("rebuild"); return { rows: 2 }; }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("runSnapshotCron", () => {
  it("runs the due-write BEFORE reconcile, then rebuild last", async () => {
    const calls: string[] = [];
    await runSnapshotCron(baseInput("2026-07-19T18:00:00Z"), spies(calls)); // after final -> due
    expect(calls).toEqual(["write", "reconcile", "rebuild"]);
  });

  it("captures the due final live (no reconstructed flag in the write options)", async () => {
    const d = spies([]);
    await runSnapshotCron(baseInput("2026-07-19T18:00:00Z"), d);
    expect(d.write).toHaveBeenCalledWith(2026, "Belgium", "final", { force: false });
    const opts = d.write.mock.calls[0][3];
    expect("reconstructed" in opts).toBe(false);
  });

  it("a due-write failure still runs reconcile + rebuild", async () => {
    const d = spies([]);
    d.write = vi.fn(async () => { throw new Error("boom"); });
    const out = await runSnapshotCron(baseInput("2026-07-19T18:00:00Z"), d);
    expect(d.reconcile).toHaveBeenCalled();
    expect(d.rebuild).toHaveBeenCalled();
    expect(out).toMatchObject({ error: "due write failed", rebuild: { rows: 2 } });
  });

  it("skips the write when nothing is due but still reconciles + rebuilds", async () => {
    const d = spies([]);
    const out = await runSnapshotCron(baseInput("2026-07-18T09:00:00Z"), d); // before preQuali
    expect(d.write).not.toHaveBeenCalled();
    expect(d.reconcile).toHaveBeenCalled();
    expect(d.rebuild).toHaveBeenCalled();
    expect(out.status).toBe("no checkpoint due");
  });
});

// Regression (Hungary 2026): Blob is read-after-write eventually consistent, so a final
// written in step 1 or 2 is routinely invisible to step 3's own read — the round misses the
// index and only appears on the NEXT fire (24h late on a daily cron). Whatever was written
// this run is handed to the rebuild directly.
describe("runSnapshotCron — hands freshly-written finals to the rebuild", () => {
  const snap = (gp: string) => ({ year: 2026, gp, checkpoint: "final", actuals: ["NOR"] });

  it("passes a reconciler-backfilled final through to the rebuild", async () => {
    const rebuild = vi.fn(async () => ({ rows: 1 }));
    await runSnapshotCron(baseInput("2026-07-19T18:00:00Z"), {
      write: vi.fn(async () => ({ status: "already snapshotted", checkpoint: "final", forced: false })),
      reconcile: vi.fn(async () => ({
        backfilled: ["Hungary"], alreadyPresent: [], notRaced: [],
        written: { Hungary: snap("Hungary") },
      })),
      rebuild,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(rebuild).toHaveBeenCalledWith(2026, ["Austria", "Belgium"], {
      fresh: { Hungary: snap("Hungary") },
    });
  });

  it("passes the due-write's own final through, and keeps it out of the JSON response", async () => {
    const rebuild = vi.fn(async () => ({ rows: 1 }));
    const out = await runSnapshotCron(baseInput("2026-07-19T18:00:00Z"), {
      write: vi.fn(async () => ({
        status: "snapshotted", checkpoint: "final", forced: false, snapshot: snap("Belgium"),
      })),
      reconcile: vi.fn(async () => ({ backfilled: [], alreadyPresent: [], notRaced: [], written: {} })),
      rebuild,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(rebuild).toHaveBeenCalledWith(2026, ["Austria", "Belgium"], {
      fresh: { Belgium: snap("Belgium") },
    });
    // The payload is a cron response, not a snapshot dump.
    expect(out.snapshot).toBeUndefined();
    expect(out.status).toBe("snapshotted");
  });

  it("does not treat a non-final due-write as a calibration input", async () => {
    const rebuild = vi.fn(async () => ({ rows: 0 }));
    await runSnapshotCron(baseInput("2026-07-18T15:00:00Z"), {
      write: vi.fn(async () => ({
        status: "snapshotted", checkpoint: "post-quali", forced: false,
        snapshot: { year: 2026, gp: "Belgium", checkpoint: "post-quali" },
      })),
      reconcile: vi.fn(async () => ({ backfilled: [], alreadyPresent: [], notRaced: [], written: {} })),
      rebuild,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(rebuild).toHaveBeenCalledWith(2026, ["Austria", "Belgium"], { fresh: {} });
  });
});
