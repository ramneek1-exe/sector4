"use client";

// Landing start-lights preloader (see the spec/plan dated 2026-07-24). Renders a
// full-bleed overlay of LIGHT_COUNT dither/pixel dots that arm left-to-right, hold
// a random suspense beat (gated on hero readiness, hard-capped), then extinguish
// and dissolve to release the hero's fog-in reveal.
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
  discCells,
  pickHold,
  resolveLightsOut,
} from "@/app/lib/start-lights";
import { useRevealCanvas } from "@/app/lib/use-reveal-canvas";

// Keep in sync with the inline gate script in app/page.tsx.
const SESSION_KEY = "s4-preloaded";

// Visual constants — tuned live against rendered candidates during the visual pass.
const DOT_COLS = 12; // even → mirror-symmetric disc
const DOT_SIZE = 30; // css px per dot
const ARMED = { r: 216, g: 58, b: 52 }; // warm "ready" red (candidate default)
const OFF = { r: 208, g: 208, b: 208 }; // dim grey (candidate default)
const BACKDROP = "#fafafa"; // light field (candidate default)

type Phase = "idle" | "arming" | "out" | "done";

/** One dither pixel-disc, painted via the shared reveal-canvas (instant paint —
 *  the arm cadence is the reveal, so we don't want the per-dot 450ms resolve). */
function Dot({ armed }: { armed: boolean }) {
  const color = armed ? ARMED : OFF;
  const cells = discCells(DOT_COLS, color);
  const ref = useRevealCanvas({
    cells,
    grid: { cols: DOT_COLS, rows: DOT_COLS },
    size: DOT_SIZE,
    animate: false,
  });
  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ width: DOT_SIZE, height: DOT_SIZE, imageRendering: "pixelated" }}
    />
  );
}

export function StartLights() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lit, setLit] = useState(0); // how many dots have armed so far
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

    // Arm dots left to right.
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
      <div className="flex gap-4">
        {Array.from({ length: LIGHT_COUNT }, (_, i) => (
          <Dot key={i} armed={phase === "arming" && i < lit} />
        ))}
      </div>
    </div>
  );
}
