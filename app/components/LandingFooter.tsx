"use client";

// The landing page's closing statement: a giant SECTOR4 wordmark spanning most of the
// section's width, with the legal disclaimer beneath it -- this page's OWN styled copy of
// app/lib/legal.ts's DISCLAIMER (the site-wide SiteFooter renders nothing on "/", see
// SiteFooter.tsx, so this is the only copy of the text rendered here). This revision adds
// the scroll-scrubbed parallax reveal; the cursor-magnet letters (Task 6) land as a
// follow-up commit on this same file.
import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "@/app/lib/gsap";
import { DISCLAIMER } from "@/app/lib/legal";

const LETTERS = ["S", "E", "C", "T", "O", "R", "4"];

// Parallax travel distances (px) for the scroll-scrubbed reveal: the wordmark travels a
// SMALLER distance (reads as slower, matching its visual weight) than the legal line
// (travels further, reads as faster) -- the classic layered-depth parallax cue. A starting
// point, tuned against the real page in the plan's final visual-QA task, not sacred.
const WORDMARK_TRAVEL_PX = 32;
const LEGAL_TRAVEL_PX = 72;

export function LandingFooter() {
  const rootRef = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLParagraphElement>(null);
  const legalRef = useRef<HTMLParagraphElement>(null);

  // Scroll parallax: wordmark and legal line travel different distances as the footer
  // scrolls into view, sharing one scrubbed timeline (ScrollTrigger, the same tool
  // TrackSpine already uses for its scroll-scrubbed track draw).
  useEffect(() => {
    const root = rootRef.current;
    const wordmark = wordmarkRef.current;
    const legal = legalRef.current;
    if (!root || !wordmark || !legal) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.set(wordmark, { y: WORDMARK_TRAVEL_PX });
      gsap.set(legal, { y: LEGAL_TRAVEL_PX });
      gsap
        .timeline({
          scrollTrigger: { trigger: root, start: "top 90%", end: "bottom bottom", scrub: true },
        })
        .to(wordmark, { y: 0, ease: "none" }, 0)
        .to(legal, { y: 0, ease: "none" }, 0);
    });
    return () => mm.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-[40vh] w-full flex-col justify-center gap-6 overflow-hidden border-t border-ink/10 px-6 py-16 sm:px-8"
    >
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
        <p
          ref={wordmarkRef}
          aria-label="Sector 4"
          className="font-bebas leading-none tracking-wide text-ink"
          style={{ fontSize: "clamp(4rem, 18vw, 16rem)" }}
        >
          {LETTERS.map((ch, i) => (
            <span key={i} className="inline-block">
              {ch}
            </span>
          ))}
        </p>
        <p ref={legalRef} className="max-w-3xl font-grotesk text-xs leading-snug text-muted/80">
          {DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
