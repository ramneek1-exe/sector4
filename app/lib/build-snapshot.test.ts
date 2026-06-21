import { describe, it, expect } from "vitest";
import { buildSnapshot } from "./build-snapshot";

describe("buildSnapshot", () => {
  it("assembles a pre-quali snapshot in friday mode", async () => {
    const calls: { path: string; body: any }[] = [];
    const snap = await buildSnapshot(2026, "Austria", "pre-quali", {
      fetchPrediction: async (path, body) => {
        calls.push({ path, body });
        return { ok: path };
      },
    });
    expect(snap.checkpoint).toBe("pre-quali");
    expect(snap.year).toBe(2026);
    expect(snap.gp).toBe("Austria");
    expect(snap.issuedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    const podium = calls.find((c) => c.path.includes("podium"));
    expect(podium?.body.mode).toBe("friday");
    expect(calls.map((c) => c.path).sort()).toEqual(
      ["/api/pace", "/api/podium", "/api/strategy"].sort(),
    );
    expect(snap.calibrationNote).toMatch(/not yet calibrated/i);
  });

  it("uses auto mode post-quali so podium can sharpen", async () => {
    const calls: { path: string; body: any }[] = [];
    await buildSnapshot(2026, "Austria", "post-quali", {
      fetchPrediction: async (path, body) => {
        calls.push({ path, body });
        return {};
      },
    });
    expect(calls.find((c) => c.path.includes("podium"))?.body.mode).toBe("auto");
  });
});
