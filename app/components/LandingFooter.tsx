"use client";

// The landing page's closing statement: a giant SECTOR4 wordmark spanning most of the
// section's width, with the legal disclaimer beneath it -- this page's OWN styled copy of
// app/lib/legal.ts's DISCLAIMER (the site-wide SiteFooter renders nothing on "/", see
// SiteFooter.tsx, so this is the only copy of the text rendered here). Two motion layers:
// a scroll-scrubbed parallax reveal (wordmark + legal line travel different distances),
// and a cursor-magnet nudge on the individual wordmark letters, gated to only run while
// the footer is in the viewport (IntersectionObserver, matching the codebase's discipline
// of not running per-frame work off-screen -- see CardFog, the /lab/dither InView helper).
import { useEffect, useRef, useState } from "react";
import { gsap } from "@/app/lib/gsap";
import { DISCLAIMER } from "@/app/lib/legal";
import { magnetOffset, lerp, type Point } from "@/app/lib/wordmark-magnet";
import { useReducedMotion } from "@/app/lib/use-reduced-motion";

const LETTERS = ["S", "E", "C", "T", "O", "R", "4"];
const WORDMARK_FONT_CLASS = "font-bebas leading-none tracking-wide";
const WORDMARK_FONT_SIZE = "clamp(5rem, 24vw, 22rem)";

// Parallax travel distances (px) -- owner review (Task 7): the original 32/72 starting
// point read as too subtle on the real page; bumped up for a more pronounced reveal.
const WORDMARK_TRAVEL_PX = 80;
const LEGAL_TRAVEL_PX = 160;

// Cursor-magnet tuning: a letter within MAGNET_RADIUS_PX of the pointer nudges toward it,
// up to MAGNET_MAX_OFFSET_PX at zero distance. Same rAF-lerp smoothing factor as the
// hero's cursor-trailing dither blob (DitherFog). Starting point, tuned in Task 7.
const MAGNET_RADIUS_PX = 140;
const MAGNET_MAX_OFFSET_PX = 10;
const MAGNET_LERP = 0.12;

export function LandingFooter() {
  const rootRef = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLParagraphElement>(null);
  const legalRef = useRef<HTMLParagraphElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const reduced = useReducedMotion();

  // Scroll parallax (unchanged from Task 5).
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

  // Cursor-magnet letters: only tracks the pointer while the footer is in the viewport,
  // and under reduced motion does nothing at all -- no listener, no rAF loop, not just
  // visually inert.
  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;
    if (!root) return;

    let active = false;
    // Index-aligned with letterRefs.current/targets/pos (NOT built by pushing only the
    // non-null refs -- a skipped index there would desync every array's indexing from
    // this point on). A ref that's momentarily null measures as far off-screen, which
    // magnetOffset naturally resolves to a zero offset (outside any real radius).
    const centers: Point[] = LETTERS.map(() => ({ x: -9999, y: -9999 }));
    const targets: Point[] = LETTERS.map(() => ({ x: 0, y: 0 }));
    const pos: Point[] = LETTERS.map(() => ({ x: 0, y: 0 }));

    const measure = () => {
      letterRefs.current.forEach((el, i) => {
        if (!el) {
          centers[i] = { x: -9999, y: -9999 };
          return;
        }
        const r = el.getBoundingClientRect();
        centers[i] = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
    };

    let raf = 0;
    const tick = () => {
      pos.forEach((p, i) => {
        p.x = lerp(p.x, targets[i]?.x ?? 0, MAGNET_LERP);
        p.y = lerp(p.y, targets[i]?.y ?? 0, MAGNET_LERP);
        const el = letterRefs.current[i];
        if (el) el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;
      });
      raf = requestAnimationFrame(tick);
    };

    // rAF only runs while the footer is actually in view -- gating just the pointer-target
    // updates (as a first pass had it) still left the loop itself spinning continuously for
    // the component's whole mounted lifetime, contrary to this file's own "gated to only
    // run while in the viewport" claim (whole-branch review finding). Leaving view also
    // resets every letter to rest immediately, so nothing carries a stale offset into the
    // next entry (this also closes the "stale offset on scroll-out" minor from Task 6's
    // review -- a letter can no longer freeze mid-nudge while off-screen).
    const io = new IntersectionObserver(
      ([entry]) => {
        active = entry.isIntersecting;
        if (active) {
          // Re-measure on entry: the parallax's own transform may have shifted letter
          // positions since the last measurement (e.g. first mount, or scroll-in still
          // mid-scrub), so a stale center would nudge letters in a slightly wrong
          // direction until the next measure.
          measure();
          if (!raf) raf = requestAnimationFrame(tick);
        } else {
          cancelAnimationFrame(raf);
          raf = 0;
          targets.forEach((t) => {
            t.x = 0;
            t.y = 0;
          });
          pos.forEach((p, i) => {
            p.x = 0;
            p.y = 0;
            const el = letterRefs.current[i];
            if (el) el.style.transform = "translate(0px, 0px)";
          });
        }
      },
      { rootMargin: "100px" },
    );
    io.observe(root);
    measure();
    window.addEventListener("resize", measure);

    const onMove = (e: PointerEvent) => {
      if (!active) return;
      const pointer = { x: e.clientX, y: e.clientY };
      centers.forEach((c, i) => {
        targets[i] = magnetOffset(c, pointer, {
          radius: MAGNET_RADIUS_PX,
          maxOffset: MAGNET_MAX_OFFSET_PX,
        });
      });
    };
    const onLeave = () => {
      targets.forEach((t) => {
        t.x = 0;
        t.y = 0;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-[40vh] w-full flex-col justify-center gap-6 overflow-hidden bg-ink px-6 py-16 sm:px-8"
    >
      <div className="mx-auto flex w-full max-w-[1800px] flex-col items-center gap-6 text-center">
        <p
          ref={wordmarkRef}
          aria-label="Sector 4"
          className={`${WORDMARK_FONT_CLASS} text-bg`}
          style={{ fontSize: WORDMARK_FONT_SIZE }}
        >
          {LETTERS.map((ch, i) => (
            <span
              key={i}
              ref={(el) => {
                letterRefs.current[i] = el;
              }}
              className="inline-block will-change-transform"
            >
              {ch}
            </span>
          ))}
        </p>
        <p ref={legalRef} className="max-w-3xl font-grotesk text-xs leading-snug text-bg/60">
          {DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
