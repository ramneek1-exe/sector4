import { describe, expect, it } from "vitest";
import {
  ARM_DONE_MS,
  ARM_INTERVAL_MS,
  CURTAIN_MS,
  HARD_CAP_MS,
  HERO_FAILSAFE_MS,
  HOLD_MAX_MS,
  HOLD_MIN_MS,
  LIGHT_COUNT,
  LIGHTS_OUT_HOLD_MS,
  TEXT_RELEASE_FRAC,
  armSchedule,
  overlayTeardownMs,
  pickHold,
  resolveLightsOut,
  textReleaseDelayMs,
} from "@/app/lib/start-lights";

describe("armSchedule", () => {
  it("is one timestamp per light, evenly spaced from 0", () => {
    expect(armSchedule()).toEqual([0, 800, 1600, 2400, 3200]);
  });
  it("keeps ARM_DONE_MS derived from count * interval", () => {
    expect(ARM_DONE_MS).toBe(LIGHT_COUNT * ARM_INTERVAL_MS);
  });
});

describe("pickHold", () => {
  it("hits the floor when rand is 0", () => {
    expect(pickHold(() => 0)).toBe(HOLD_MIN_MS);
  });
  it("hits the ceiling when rand is 1", () => {
    expect(pickHold(() => 1)).toBe(HOLD_MAX_MS);
  });
  it("stays within bounds", () => {
    const h = pickHold(() => 0.5);
    expect(h).toBeGreaterThanOrEqual(HOLD_MIN_MS);
    expect(h).toBeLessThanOrEqual(HOLD_MAX_MS);
  });
});

describe("resolveLightsOut", () => {
  it("uses arm+hold when the hero is ready early", () => {
    expect(resolveLightsOut({ hold: 200, heroReadyAt: 500 })).toBe(4200);
  });
  it("waits for a late hero-ready (still under the cap)", () => {
    expect(resolveLightsOut({ hold: 200, heroReadyAt: 5000 })).toBe(5000);
  });
  it("falls back to the hard cap when the hero never signals", () => {
    expect(resolveLightsOut({ hold: 800, heroReadyAt: null })).toBe(HARD_CAP_MS);
  });
  it("clamps anything past the cap", () => {
    expect(resolveLightsOut({ hold: 800, heroReadyAt: 9999 })).toBe(HARD_CAP_MS);
  });
});

describe("textReleaseDelayMs", () => {
  it("releases the hero partway through the curtain, not at its start", () => {
    // 120ms dark-gantry beat + 65% of the 700ms lift.
    expect(textReleaseDelayMs()).toBe(575);
  });
  it("stays derived from the constants rather than hard-coded", () => {
    expect(textReleaseDelayMs()).toBe(LIGHTS_OUT_HOLD_MS + CURTAIN_MS * TEXT_RELEASE_FRAC);
  });
  it("lands before the overlay unmounts, so the hero never reveals into a gap", () => {
    expect(textReleaseDelayMs()).toBeLessThan(overlayTeardownMs());
  });
});

describe("overlayTeardownMs", () => {
  it("is the dark beat plus the full curtain", () => {
    expect(overlayTeardownMs()).toBe(820);
    expect(overlayTeardownMs()).toBe(LIGHTS_OUT_HOLD_MS + CURTAIN_MS);
  });
});

describe("failsafe invariant", () => {
  // app/page.tsx's inline gate force-reveals the hero at HERO_FAILSAFE_MS in case React
  // never hydrates. If the sequence ever outgrew that, the failsafe would fire DURING the
  // curtain and reveal the hero mid-lift. Nothing else guards this.
  it("finishes the worst-case sequence before the inline failsafe fires", () => {
    expect(HARD_CAP_MS + overlayTeardownMs()).toBeLessThan(HERO_FAILSAFE_MS);
  });
});
