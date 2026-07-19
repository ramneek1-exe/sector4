"use client";

// Timing-line motif between landing sections: a thin baseline with three sector ticks
// (a lap's S1/S2/S3 splits), DrawSVG-drawn on scroll. Decorative only (aria-hidden);
// under reduced motion the line simply renders complete.
import { useEffect, useRef } from "react";
import { gsap } from "@/app/lib/gsap";

export function SectorDivider({ className = "" }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const strokes = svg.querySelectorAll("line");
      gsap.set(strokes, { drawSVG: "0%" });
      gsap.to(strokes, {
        drawSVG: "100%",
        duration: 1.1,
        ease: "power2.inOut",
        stagger: 0.08,
        scrollTrigger: { trigger: svg, start: "top 85%", once: true },
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <svg
      ref={ref}
      aria-hidden
      viewBox="0 0 1200 24"
      preserveAspectRatio="none"
      className={`mx-auto block h-6 w-full max-w-5xl px-6 text-ink/20 ${className}`}
    >
      <line x1="0" y1="12" x2="1200" y2="12" stroke="currentColor" strokeWidth="1" />
      <line x1="300" y1="5" x2="300" y2="19" stroke="currentColor" strokeWidth="1" />
      <line x1="600" y1="5" x2="600" y2="19" stroke="currentColor" strokeWidth="1" />
      <line x1="900" y1="5" x2="900" y2="19" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
