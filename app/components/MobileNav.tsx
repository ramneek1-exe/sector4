"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NAV_LINKS, isActiveLink } from "@/app/components/SiteNav";

gsap.registerPlugin(useGSAP);

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The overlay is portaled to <body> (see render): the header sets `backdrop-filter`,
  // which makes it the containing block for any `position:fixed` descendant — so an in-header
  // overlay would clamp to the 68px header box instead of the viewport. Portaling escapes that.
  // `mounted` gates the portal to the client so SSR/hydration stay in sync.
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close whenever the route changes (link tap navigates → menu dismisses).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Toggle `inert` on the overlay on every open-state change (and once the portal mounts →
  // closed overlay starts inert: out of tab order, no pointer events, ignored by AT).
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open, mounted]);

  // While open: Escape closes, body scroll locks, focus moves to the in-overlay close (✕);
  // on close (effect cleanup) focus returns to the hamburger that opened it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("overflow-hidden");
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("overflow-hidden");
      buttonRef.current?.focus();
    };
  }, [open]);

  // Build the reversible open/close timeline. Targets are resolved via refs (not scoped
  // selector strings) because the overlay lives in a portal, outside this component's subtree.
  // Re-runs once the portal mounts so the overlay/link nodes exist. The clip-path wipe still
  // originates from the top-right (the ✕ corner) so it reads as growing out of that control.
  useGSAP(
    () => {
      const overlay = overlayRef.current;
      if (!overlay) return;

      const links = overlay.querySelectorAll(".mnav-link");

      const mm = gsap.matchMedia();
      mm.add(
        {
          animated: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { animated } = ctx.conditions as { animated: boolean; reduced: boolean };
          const tl = gsap.timeline({ paused: true });

          if (animated) {
            tl.to(overlay, {
              autoAlpha: 1,
              clipPath: "circle(150% at calc(100% - 2.75rem) 2.25rem)",
              duration: 0.5,
              ease: "expo.out",
            }).to(
              links,
              {
                autoAlpha: 1,
                y: 0,
                filter: "blur(0px)",
                stagger: 0.08,
                duration: 0.4,
                ease: "power3.out",
              },
              0.15,
            );
          } else {
            // Reduced motion: jump to the open state instantly. Use near-zero `.to()` tweens
            // with `immediateRender: false` (NOT `.set()`): a `.set()` would render at build
            // time and force the overlay visible while still closed (base CSS keeps t=0 hidden;
            // play() reveals, reverse() re-hides).
            tl.to(overlay, {
              autoAlpha: 1,
              clipPath: "none",
              duration: 0.001,
              immediateRender: false,
            }).to(
              links,
              { autoAlpha: 1, y: 0, filter: "none", duration: 0.001, immediateRender: false },
              0,
            );
          }

          tlRef.current = tl;
          return () => {
            tlRef.current = null;
          };
        },
      );
    },
    { dependencies: [mounted] },
  );

  // Drive the timeline from open state.
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (open) tl.play();
    else tl.reverse();
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="relative z-50 flex h-10 w-10 items-center justify-center rounded-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        {/* Static three-bar hamburger — opens the menu; the ✕ inside the overlay closes it
            (the full-screen overlay covers this button while open). */}
        <span className="pointer-events-none relative block h-4 w-6">
          <span className="absolute left-0 top-0 h-0.5 w-6 bg-current" />
          <span className="absolute left-0 top-1/2 h-0.5 w-6 -translate-y-1/2 bg-current" />
          <span className="absolute bottom-0 left-0 h-0.5 w-6 bg-current" />
        </span>
      </button>

      {mounted &&
        createPortal(
          <div
            ref={overlayRef}
            id="mobile-menu"
            className="mnav-overlay fixed inset-0 z-40 flex flex-col bg-bg md:hidden"
          >
            {/* Top bar mirrors the header so it reads as the same row: wordmark left, ✕ right
                (in the same corner the hamburger occupied, since the overlay covers it). */}
            <div className="flex h-[68px] shrink-0 items-center justify-between px-7">
              <Link
                href="/"
                aria-label="Sector 4, home"
                className="rounded-sm font-bebas text-4xl leading-none tracking-wide text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                SECTOR4
              </Link>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-sm font-pixel text-3xl leading-none text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                ✕
              </button>
            </div>

            {/* Links — centered, large, PP NeueBit, keep the growing underline + active accent. */}
            <nav
              aria-label="Mobile"
              className="flex flex-1 flex-col items-center justify-center gap-8"
              onClick={(e) => {
                // Tap on the backdrop (empty space, not a link) closes.
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              {NAV_LINKS.map(({ href, label }) => {
                const active = isActiveLink(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`mnav-link relative cta-grow font-pixel text-4xl leading-none tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                      active ? "text-accent" : "text-ink/80 hover:text-ink"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>,
          document.body,
        )}
    </div>
  );
}
