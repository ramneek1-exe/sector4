// Pure nav constants + helpers, in a SERVER-SAFE module. These used to live in
// SiteNav.tsx, but that file is "use client" — importing values from a client module
// into a server component turns them into client references, and calling
// NAV_LINKS.map() server-side (the landing footer) crashed with "Attempted to call
// map() from the server". Keep anything a server component needs HERE.
export const NAV_H = 68; // px (h-[68px]) — the layout pads the body by this so content clears it

// One source of truth for the link list — desktop row, mobile overlay, landing footer.
export const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/ask", label: "Ask" },
  { href: "/learn", label: "Learn" },
  { href: "/accuracy", label: "Accuracy" },
  { href: "/weekend", label: "Next race" },
];

// Root matches only on exact "/"; every other href matches by path prefix.
export function isActiveLink(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// True only for the landing page itself ("/") -- used to gate the site-wide legal footer
// off on the landing route, since LandingFooter renders its own styled copy of the same
// disclaimer text there (see SiteFooter.tsx / app/lib/legal.ts).
export function isLandingRoute(pathname: string): boolean {
  return pathname === "/";
}

// Clicking "Ask" while already on /ask must reset the page (same-route Links no-op in
// the router, so the answer state would otherwise persist). The page listens for this event.
export const ASK_RESET_EVENT = "sector4:ask-reset";
export function emitAskResetIfOnAsk(pathname: string, href: string) {
  if (href === "/ask" && pathname === "/ask") window.dispatchEvent(new Event(ASK_RESET_EVENT));
}
