"use client";

// Landing start-lights preloader (see the spec/plan dated 2026-07-24). Renders a
// full-bleed overlay of a start-light gantry — a row of LIGHT_COUNT abstract light
// housings whose red LED-halftone lamps illuminate left-to-right, hold a random
// suspense beat (gated on hero readiness, hard-capped), then all extinguish, hold a
// beat, and the field lifts up out of frame — the gantry lifting further on top of it
// (parallax) — releasing the hero's fog-in partway through so its reveal plays in the
// clear. See docs/superpowers/specs/2026-07-25-hero-curtain-reveal-design.md.
//
// Abstract + unbranded: generic dark housings + dithered red lamps only — no FOM
// light-gantry likeness, no F1/FIA/FOM marks or liveries (PRD §8).
//
// Only meaningful when the inline gate in page.tsx set [data-preloader-active] on
// <html> pre-paint (first landing visit this session, motion allowed). That same
// attribute is re-checked here, so the overlay renders nothing on repeat visits,
// reduced-motion, or no-JS-then-hydrate.
import { useEffect, useRef, useState } from "react";
import {
  CURTAIN_MS,
  HARD_CAP_MS,
  LIGHTS_OUT_HOLD_MS,
  LIGHT_COUNT,
  armSchedule,
  overlayTeardownMs,
  pickHold,
  postHydrationFailsafeMs,
  resolveLightsOut,
  textReleaseDelayMs,
} from "@/app/lib/start-lights";

// Keep in sync with the inline gate script in app/page.tsx.
const SESSION_KEY = "s4-preloaded";

// Visual constants — tuned live against rendered candidates during the visual pass.
const LAMPS_PER_HOUSING = 2; // stacked lamps per housing
// Responsive lamp diameter: shrinks with the viewport so the full 5-housing row never
// overflows a narrow phone (~320-390px). Caps at 64px on desktop. (String, not px number —
// it feeds width/height directly.)
const LAMP_D = "clamp(34px, 11vw, 64px)";
const HOUSING_PAD = "clamp(5px, 2vw, 10px)"; // housing inner padding, scales with LAMP_D
const HOUSING_GAP = "clamp(6px, 1.5vw, 10px)"; // gap between the two lamps in a housing
const ROW_GAP = "clamp(8px, 3vw, 16px)"; // gap between housings
const DOT_CELL = 5; // LED-halftone grid cell (css px) — the dither texture
const HOUSING_BG = "#0b0b0d"; // dark housing body
const LAMP_BASE = "#141417"; // unlit lamp disc
const OFF_DOT = "#2c2c30"; // grey halftone dots when unlit
const LIT_DOT = "#ff2a22"; // red halftone dots when lit
const LIT_GLOW = "rgba(255,42,34,0.7)"; // halo cast by a lit lamp
const LIGHT_UP_MS = 260; // per-housing ramp from off → lit
const BACKDROP = "#f3eee6"; // warm paper field
// Weighty ease-in-out for the curtain — it should feel like mass being lifted, not a
// fade. Tuned with the owner against rendered candidates (see the plan's Task 4).
const CURTAIN_EASE = "cubic-bezier(0.76, 0, 0.24, 1)";

type Phase = "idle" | "arming" | "out" | "done";

/** LED-halftone fill: a fine grid of `color` dots over the dark lamp base. Same
 *  cell size on the lit + unlit layers so the red dots register exactly over the
 *  grey ones. This is the "dither" texture — a regular dot matrix, like the LED
 *  lamps in the reference, not the ordered-Bayer canvas pattern. */
function halftone(color: string) {
  return {
    backgroundColor: LAMP_BASE,
    backgroundImage: `radial-gradient(circle, ${color} 42%, transparent 46%)`,
    backgroundSize: `${DOT_CELL}px ${DOT_CELL}px`,
  } as const;
}

/** One circular lamp. The grey halftone base always shows; a red halftone layer
 *  fades in (with a glow) when `lit` flips, so the lamp lights up rather than
 *  snapping on. */
function Lamp({ lit }: { lit: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        display: "block",
        width: LAMP_D,
        height: LAMP_D,
        borderRadius: "50%",
        overflow: "hidden",
        boxShadow: lit
          ? `0 0 16px 3px ${LIT_GLOW}`
          : "inset 0 0 7px rgba(0,0,0,0.65)",
        transition: `box-shadow ${LIGHT_UP_MS}ms ease`,
        ...halftone(OFF_DOT),
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          opacity: lit ? 1 : 0,
          transition: `opacity ${LIGHT_UP_MS}ms ease`,
          ...halftone(LIT_DOT),
        }}
      />
    </span>
  );
}

/** A dark vertical housing holding LAMPS_PER_HOUSING lamps that light together. */
function LightHousing({ lit }: { lit: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        flexDirection: "column",
        gap: HOUSING_GAP,
        padding: HOUSING_PAD,
        borderRadius: 4,
        background: HOUSING_BG,
        boxShadow: "0 8px 22px rgba(0,0,0,0.22)",
      }}
    >
      {Array.from({ length: LAMPS_PER_HOUSING }, (_, i) => (
        <Lamp key={i} lit={lit} />
      ))}
    </div>
  );
}

export function StartLights() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lit, setLit] = useState(0); // how many housings have armed so far
  const released = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    // Trust the pre-paint gate as the single decision-maker (it already checked
    // sessionStorage + reduced-motion synchronously before the hero painted).
    if (!root.hasAttribute("data-preloader-active")) {
      setPhase("done");
      return;
    }

    setPhase("arming");
    const timers: number[] = [];
    const t0 = performance.now();

    // Arm housings left to right.
    armSchedule().forEach((t, i) => {
      timers.push(window.setTimeout(() => setLit(i + 1), t));
    });

    const release = () => {
      if (released.current) return;
      released.current = true;
      setPhase("out"); // lamps go dark; the curtain animation starts after its own delay
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* private mode / disabled storage: still reveal, just replay next visit */
      }
      // Hold the hero's paused fog-in until the curtain is mostly clear, so its 0.7s
      // reveal plays in open air instead of behind an opaque overlay.
      timers.push(
        window.setTimeout(() => root.removeAttribute("data-preloader-active"), textReleaseDelayMs()),
      );
      timers.push(window.setTimeout(() => setPhase("done"), overlayTeardownMs()));
    };

    // Hero readiness: watch the hero <video> canplay; null until it fires.
    let heroReadyAt: number | null = null;
    let scheduled = false;
    const video =
      document.querySelector<HTMLVideoElement>('[data-hero="video"] video') ??
      document.querySelector<HTMLVideoElement>("video");

    // releaseAt = max(arm+hold, heroReady) capped; schedule once readiness is known.
    const hold = pickHold();
    const trySchedule = () => {
      if (released.current || scheduled || heroReadyAt === null) return;
      scheduled = true;
      const outAt = resolveLightsOut({ hold, heroReadyAt });
      const wait = Math.max(0, outAt - (performance.now() - t0));
      timers.push(window.setTimeout(release, wait));
    };
    const markReady = () => {
      if (heroReadyAt === null) heroReadyAt = performance.now() - t0;
      trySchedule();
    };
    if (video) {
      if (video.readyState >= 3) markReady();
      else video.addEventListener("canplay", markReady, { once: true });
    }

    // Hard-cap backstop: fires release even if canplay never comes.
    timers.push(window.setTimeout(release, HARD_CAP_MS));

    // The inline gate's failsafe is measured from HTML PARSE while everything above is
    // measured from this effect's t0 (post-hydration), so comparing them coupled the
    // sequence length to how long hydration took: a slow hydration could let that timer
    // fire mid-curtain and release the hero behind the still-opaque field. React is
    // demonstrably alive here, so that timer's only job ("never hydrated") is done —
    // clear it and take over on our own clock.
    const w = window as Window & { __s4HeroFailsafe?: number };
    if (w.__s4HeroFailsafe !== undefined) {
      clearTimeout(w.__s4HeroFailsafe);
      delete w.__s4HeroFailsafe;
    }
    // Deliberately NOT pushed onto timers[]: on a client-side navigation away mid-sequence
    // the cleanup clears every other timer, and this is then the only thing left that can
    // remove the attribute. removeAttribute is idempotent, so after a normal release this
    // is a no-op. (Removing the attribute in the cleanup instead would break dev: React
    // StrictMode double-invokes the effect, so the cleanup would strip the attribute
    // between the two runs and the second run would bail out — no preloader in dev.)
    window.setTimeout(() => root.removeAttribute("data-preloader-active"), postHydrationFailsafeMs());

    return () => {
      timers.forEach(clearTimeout);
      if (video) video.removeEventListener("canplay", markReady);
    };
  }, []);

  if (phase === "idle" || phase === "done") return null;

  return (
    <div
      className="start-lights-overlay fixed inset-0 z-50 flex items-center justify-center"
      aria-hidden
      style={{
        background: BACKDROP,
        willChange: phase === "out" ? "transform" : undefined,
        animation:
          phase === "out"
            ? `preloaderCurtain ${CURTAIN_MS}ms ${CURTAIN_EASE} ${LIGHTS_OUT_HOLD_MS}ms forwards`
            : undefined,
      }}
    >
      <div
        className="start-lights-gantry flex max-w-full items-center px-3"
        style={{
          gap: ROW_GAP,
          willChange: phase === "out" ? "transform, filter" : undefined,
          // Child transforms compose with the parent's, so this carries only the EXTRA
          // travel over the field — the gantry is the nearer object and clears the top
          // edge first, with the field trailing it out.
          animation:
            phase === "out"
              ? `preloaderCurtainGantry ${CURTAIN_MS}ms ${CURTAIN_EASE} ${LIGHTS_OUT_HOLD_MS}ms forwards`
              : undefined,
        }}
      >
        {Array.from({ length: LIGHT_COUNT }, (_, i) => (
          // "out" clears every housing (all lamps dark) before the lift —
          // the classic lights-out beat.
          <LightHousing key={i} lit={phase === "arming" && i < lit} />
        ))}
      </div>
    </div>
  );
}
