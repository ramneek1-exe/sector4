"use client";

// The legal disclaimer footer, rendered on every page EXCEPT the landing ("/"), which
// renders its own styled version of the same text inline (see LandingFooter) -- otherwise
// the disclaimer would appear twice on "/". Client component because the route gate needs
// usePathname (the same pattern SiteNav already uses for landing-specific behavior).
import { usePathname } from "next/navigation";
import { DISCLAIMER } from "@/app/lib/legal";
import { isLandingRoute } from "@/app/lib/nav";

export function SiteFooter() {
  const pathname = usePathname();
  if (isLandingRoute(pathname)) return null;
  return (
    <footer className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 font-grotesk text-[10px] leading-snug text-muted/80">
      <span className="max-w-3xl">{DISCLAIMER}</span>
    </footer>
  );
}
