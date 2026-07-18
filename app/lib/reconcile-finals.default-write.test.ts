import { vi } from "vitest";

// Mock snapshot-write before importing reconcileFinals so the reconciler binds the mocked module.
vi.mock("./snapshot-write", () => ({
  writeWeekendSnapshot: vi.fn(async () => ({ status: "snapshotted" })),
  getActualFinish: vi.fn(async () => ["NOR", "LEC", "PIA"]),
}));

import { describe, it, expect } from "vitest";
import { reconcileFinals } from "./reconcile-finals";
import { writeWeekendSnapshot } from "./snapshot-write";

describe("reconcileFinals — default write path", () => {
  it("default write stamps reconstructed:true", async () => {
    await reconcileFinals(2026, ["China"], {
      getJson: async () => null, // no existing snapshot -> proceeds to write
      // no `write` injected -> exercises the default that wraps writeWeekendSnapshot
    });
    expect(writeWeekendSnapshot).toHaveBeenCalledWith(2026, "China", "final", {
      force: false,
      reconstructed: true,
    });
  });
});
