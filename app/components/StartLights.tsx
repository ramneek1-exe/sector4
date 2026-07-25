"use client";

// Landing start-lights preloader (see the spec/plan dated 2026-07-24). Renders a
// full-bleed overlay of a start-light gantry — a row of LIGHT_COUNT abstract light
// housings whose red LED-halftone lamps illuminate left-to-right, hold a random
// suspense beat (gated on hero readiness, hard-capped), then all extinguish and
// the field dissolves to release the hero's fog-in reveal.
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
  HARD_CAP_MS,
  LIGHT_COUNT,
  OUT_MS,
  armSchedule,
  pickHold,
  resolveLightsOut,
} from "@/app/lib/start-lights";

// Keep in sync with the inline gate script in app/page.tsx.
const SESSION_KEY = "s4-preloaded";

// Visual constants — tuned live against rendered candidates during the visual pass.
const LAMPS_PER_HOUSING = 2; // stacked lamps per housing
const LAMP_D = 64; // lamp diameter (css px)
const DOT_CELL = 5; // LED-halftone grid cell (css px) — the dither texture
const HOUSING_BG = "#0b0b0d"; // dark housing body
const LAMP_BASE = "#141417"; // unlit lamp disc
const OFF_DOT = "#2c2c30"; // grey halftone dots when unlit
const LIT_DOT = "#ff2a22"; // red halftone dots when lit
const LIT_GLOW = "rgba(255,42,34,0.7)"; // halo cast by a lit lamp
const LIGHT_UP_MS = 260; // per-housing ramp from off → lit
const BACKDROP = "#f3eee6"; // warm paper field

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
        gap: 10,
        padding: 10,
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
      setPhase("out");
      root.removeAttribute("data-preloader-active"); // un-pause hero fog-in
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* private mode / disabled storage: still reveal, just replay next visit */
      }
      timers.push(window.setTimeout(() => setPhase("done"), OUT_MS));
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
        animation: phase === "out" ? `preloaderDissolve ${OUT_MS}ms ease forwards` : undefined,
      }}
    >
      <div className="flex items-center" style={{ gap: 16 }}>
        {Array.from({ length: LIGHT_COUNT }, (_, i) => (
          // "out" clears every housing (all lamps dark) before the dissolve —
          // the classic lights-out beat.
          <LightHousing key={i} lit={phase === "arming" && i < lit} />
        ))}
      </div>
    </div>
  );
}
