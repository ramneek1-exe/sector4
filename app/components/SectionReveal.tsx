"use client";

// Scroll-triggered entrance for a landing section. Server sections wrap their content in
// this and tag elements with `data-reveal`; on scroll into view those elements stagger
// in ONCE. Hidden states are set via gsap.set INSIDE the matchMedia context (never CSS),
// so reduced-motion and no-JS users always see full content.
import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "@/app/lib/gsap";

export function SectionReveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const targets = el.querySelectorAll("[data-reveal]");
      if (!targets.length) return;
      gsap.set(targets, { autoAlpha: 0, y: 24 });
      gsap.timeline({
        scrollTrigger: { trigger: el, start: "top 78%", once: true },
      }).to(targets, {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.12,
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
