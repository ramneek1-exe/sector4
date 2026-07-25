import { describe, expect, it, vi } from "vitest";
import {
  ARM_DONE_MS,
  ARM_INTERVAL_MS,
  CURTAIN_MS,
  FAILSAFE_SLACK_MS,
  HARD_CAP_MS,
  HERO_FAILSAFE_MS,
  HOLD_MAX_MS,
  HOLD_MIN_MS,
  LIGHT_COUNT,
  LIGHTS_OUT_HOLD_MS,
  TEXT_RELEASE_FRAC,
  type AdoptFailsafeDeps,
  adoptFailsafe,
  armSchedule,
  overlayTeardownMs,
  pickHold,
  postHydrationFailsafeMs,
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
    // 120ms dark-gantry beat + 65% of the 900ms lift.
    expect(textReleaseDelayMs()).toBe(705);
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
    expect(overlayTeardownMs()).toBe(1020);
    expect(overlayTeardownMs()).toBe(LIGHTS_OUT_HOLD_MS + CURTAIN_MS);
  });
});

describe("postHydrationFailsafeMs", () => {
  // HERO_FAILSAFE_MS (inline, measured from HTML parse) covers only "React never
  // hydrated". Once the island mounts it clears that timer and backstops the release on
  // its OWN t0 — the same clock as HARD_CAP_MS — so the two are deliberately NOT compared
  // any more. An assertion across those clocks silently measured a hydration budget.
  it("clears the worst-case sequence, with slack", () => {
    expect(postHydrationFailsafeMs()).toBe(7020);
    expect(postHydrationFailsafeMs()).toBe(HARD_CAP_MS + overlayTeardownMs() + FAILSAFE_SLACK_MS);
    expect(postHydrationFailsafeMs()).toBeGreaterThan(HARD_CAP_MS + overlayTeardownMs());
  });
  it("stays below the inline failsafe constant", () => {
    // Bounds the CONSTANT only. These are different clocks, so this does NOT bound the
    // user-perceived wait, which from HTML parse is hydrationDelay + postHydrationFailsafeMs().
    expect(postHydrationFailsafeMs()).toBeLessThan(HERO_FAILSAFE_MS);
  });
});

describe("adoptFailsafe", () => {
  // Plain fakes, no library — mirrors runSnapshotCron's test style (see snapshot-cron.test.ts).
  // `calls` records call order; `setTimer` hands out a fresh id per invocation and captures
  // its callback so tests can fire the installed backstop directly.
  function fakeDeps(calls: string[]) {
    let nextId = 100;
    let installedCallback: (() => void) | undefined;
    const clearTimer = vi.fn((id: number) => calls.push(`clear:${id}`));
    const forgetInlineFailsafe = vi.fn(() => calls.push("forget"));
    const setTimer = vi.fn((fn: () => void, ms: number) => {
      calls.push(`set:${ms}`);
      installedCallback = fn;
      return nextId++;
    });
    const releaseGate = vi.fn(() => calls.push("release"));
    const d: Omit<AdoptFailsafeDeps, "inlineFailsafeId" | "previousBackstopId"> = {
      clearTimer,
      forgetInlineFailsafe,
      setTimer,
      releaseGate,
    };
    return { d, getInstalledCallback: () => installedCallback };
  }

  it("clears the inline gate's timer and forgets it when one is armed", () => {
    const calls: string[] = [];
    const { d } = fakeDeps(calls);
    adoptFailsafe({ inlineFailsafeId: 1, previousBackstopId: undefined, ...d });
    expect(d.clearTimer).toHaveBeenCalledWith(1);
    expect(d.forgetInlineFailsafe).toHaveBeenCalledTimes(1);
  });

  it("does not touch the inline gate's timer when none is armed, but still installs a backstop", () => {
    const calls: string[] = [];
    const { d } = fakeDeps(calls);
    adoptFailsafe({ inlineFailsafeId: undefined, previousBackstopId: undefined, ...d });
    expect(d.clearTimer).not.toHaveBeenCalled();
    expect(d.forgetInlineFailsafe).not.toHaveBeenCalled();
    expect(d.setTimer).toHaveBeenCalledTimes(1);
  });

  it("supersedes an earlier mount's orphan backstop", () => {
    const calls: string[] = [];
    const { d } = fakeDeps(calls);
    const returned = adoptFailsafe({ inlineFailsafeId: undefined, previousBackstopId: 42, ...d });
    expect(d.clearTimer).toHaveBeenCalledWith(42);
    expect(returned).not.toBe(42);
  });

  it("installs the backstop at postHydrationFailsafeMs()", () => {
    const calls: string[] = [];
    const { d } = fakeDeps(calls);
    adoptFailsafe({ inlineFailsafeId: undefined, previousBackstopId: undefined, ...d });
    expect(d.setTimer).toHaveBeenCalledWith(expect.any(Function), postHydrationFailsafeMs());
  });

  it("the installed callback releases the gate", () => {
    const calls: string[] = [];
    const { d, getInstalledCallback } = fakeDeps(calls);
    adoptFailsafe({ inlineFailsafeId: undefined, previousBackstopId: undefined, ...d });
    getInstalledCallback()?.();
    expect(d.releaseGate).toHaveBeenCalledTimes(1);
  });

  it("clears the inline timer before installing the new backstop", () => {
    const calls: string[] = [];
    const { d } = fakeDeps(calls);
    adoptFailsafe({ inlineFailsafeId: 1, previousBackstopId: undefined, ...d });
    expect(calls).toEqual(["clear:1", "forget", `set:${postHydrationFailsafeMs()}`]);
  });

  it("clears both stale timers when both are present", () => {
    const calls: string[] = [];
    const { d } = fakeDeps(calls);
    adoptFailsafe({ inlineFailsafeId: 1, previousBackstopId: 42, ...d });
    expect(d.clearTimer).toHaveBeenCalledWith(1);
    expect(d.clearTimer).toHaveBeenCalledWith(42);
    expect(d.clearTimer).toHaveBeenCalledTimes(2);
  });
});
