"use client";

// Site-wide Lenis smooth scroll, synced to ScrollTrigger. Mounted once in the root
// layout as a null-rendering sibling (it drives window scroll; it does not wrap
// children, which keeps the server layout free of client wrappers). Skipped entirely
// under prefers-reduced-motion, including live media-query changes.
import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/app/lib/gsap";
import { shouldInitSmoothScroll, tickerTimeToMs } from "@/app/lib/motion";

export function SmoothScroll() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lenis: Lenis | null = null;
    let onTick: ((time: number) => void) | null = null;

    const start = () => {
      if (lenis) return;
      lenis = new Lenis({ autoRaf: false });
      lenis.on("scroll", ScrollTrigger.update);
      onTick = (time: number) => lenis?.raf(tickerTimeToMs(time));
      gsap.ticker.add(onTick);
      gsap.ticker.lagSmoothing(0);
    };
    const stop = () => {
      if (onTick) gsap.ticker.remove(onTick);
      onTick = null;
      lenis?.destroy();
      lenis = null;
    };

    const sync = () => (shouldInitSmoothScroll(mq.matches) ? start() : stop());
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      stop();
    };
  }, []);

  return null;
}
