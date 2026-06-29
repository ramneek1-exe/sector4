"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_LINKS, isActiveLink } from "@/app/components/SiteNav";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close whenever the route changes (link tap navigates → menu dismisses).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Toggle `inert` on the overlay on every open-state change (also runs on mount → closed
  // overlay starts inert: out of tab order, no pointer events, ignored by AT).
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);

  // While open: Escape closes, body scroll locks, focus moves into the overlay; on close
  // (effect cleanup) focus returns to the hamburger.
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
        {/* Three bars — Task 3 morphs these into an X via GSAP. */}
        <span className="pointer-events-none relative block h-4 w-6">
          <span className="mnav-bar mnav-bar-top absolute left-0 top-0 h-0.5 w-6 bg-current" />
          <span className="mnav-bar mnav-bar-mid absolute left-0 top-1/2 h-0.5 w-6 -translate-y-1/2 bg-current" />
          <span className="mnav-bar mnav-bar-bot absolute bottom-0 left-0 h-0.5 w-6 bg-current" />
        </span>
      </button>

      <div
        ref={overlayRef}
        id="mobile-menu"
        className="mnav-overlay fixed inset-0 z-40 flex flex-col bg-bg"
        onClick={(e) => {
          // Tap on the backdrop (not on a link/button) closes.
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        {/* Top bar mirrors the header so it reads as the same row. */}
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
        <nav className="flex flex-1 flex-col items-center justify-center gap-8">
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
      </div>
    </div>
  );
}
