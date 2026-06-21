import { describe, it, expect } from "vitest";
import { snapshotKey, latestKey, seasonIndexKey } from "./snapshot";

describe("snapshot keys", () => {
  it("builds stable blob keys", () => {
    expect(snapshotKey(2026, "Austria", "pre-quali")).toBe(
      "weekends/2026-Austria/pre-quali.json",
    );
    expect(latestKey(2026, "Austria")).toBe("weekends/2026-Austria/latest.json");
    expect(seasonIndexKey(2026)).toBe("calibration/2026-index.json");
  });

  it("slugifies multi-word circuits", () => {
    expect(snapshotKey(2026, "Great Britain", "final")).toBe(
      "weekends/2026-Great-Britain/final.json",
    );
  });
});
