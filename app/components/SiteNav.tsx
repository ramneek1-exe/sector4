"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileNav } from "@/app/components/MobileNav";

// Single-row persistent site nav (lives in the root layout, so it's on every page).
// SECTOR4 wordmark on the left (the ONLY use of Bebas Neue); the section links + the
// live-weekend CTA on the right, all in PP NeueBit with a growing-underline hover.
export const NAV_H = 68; // px (h-[68px]) — the layout pads the body by this so content clears it

// One source of truth for the link list — consumed by the desktop row AND the mobile overlay.
export const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Ask" },
  { href: "/learn", label: "Learn" },
  { href: "/accuracy", label: "Accuracy" },
  { href: "/weekend", label: "Upcoming weekend" },
];

// Root matches only on exact "/"; every other href matches by path prefix.
export function isActiveLink(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Clicking "Ask" while already on / must reset the page (same-route Links no-op in the
// router, so the answer state would otherwise persist). The page listens for this event.
export const ASK_RESET_EVENT = "sector4:ask-reset";
export function emitAskResetIfHome(pathname: string, href: string) {
  if (href === "/" && pathname === "/") window.dispatchEvent(new Event(ASK_RESET_EVENT));
}

const linkClass =
  "relative cta-grow font-pixel text-2xl leading-none tracking-wide transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-[68px] items-center justify-between bg-bg/95 px-7 backdrop-blur-sm">
      <Link
        href="/"
        aria-label="Sector 4, home"
        className="rounded-sm font-bebas text-4xl leading-none tracking-wide text-ink transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
      >
        SECTOR4
      </Link>

      {/* Desktop: inline row (unchanged). Hidden below md, where MobileNav takes over. */}
      <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
        {NAV_LINKS.map(({ href, label }) => {
          const active = isActiveLink(pathname, href);
          const inactive =
            href === "/weekend" ? "text-ink/80 hover:text-ink" : "text-ink/65 hover:text-ink";
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => emitAskResetIfHome(pathname, href)}
              className={`${linkClass} ${active ? "text-accent" : inactive}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <MobileNav />
    </header>
  );
}
