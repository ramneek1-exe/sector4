import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { fontVars } from "@/app/lib/fonts";

const TAGLINE = "Honest podium odds, strategy, and the numbers behind them.";

// metadataBase makes the file-based opengraph/twitter images resolve to absolute URLs
// on the production domain, so link previews render when the site is shared. (next.config
// redirects www -> apex, so the canonical host is the bare domain.)
export const metadata: Metadata = {
  metadataBase: new URL("https://sector4.net"),
  title: {
    default: "Sector 4 — F1 weekend companion",
    template: "%s · Sector 4",
  },
  description:
    "An explainer-led F1 weekend companion: honest, calibrated podium odds, pit-stop " +
    "strategy, and the numbers behind a race weekend — with plain-English explanations.",
  applicationName: "Sector 4",
  openGraph: {
    type: "website",
    siteName: "Sector 4",
    title: "Sector 4 — F1 weekend companion",
    description: TAGLINE,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sector 4 — F1 weekend companion",
    description: TAGLINE,
  },
};

const DISCLAIMER =
  "Sector 4 is an independent project, not affiliated with or endorsed by Formula 1, " +
  "FOM, the FIA, or any team. All driver and team names are used for editorial reference. " +
  "Data sourced from publicly available timing.";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body className="flex min-h-screen flex-col overflow-x-hidden bg-bg text-ink antialiased font-lastik">
        {/* Top nav bar — the wordmark lives here (the ONLY use of Bebas Neue). Has a
            translucent backing so scrolled content passes UNDER it instead of bleeding
            through the logo. Reusable for future nav items. */}
        <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center bg-bg/95 px-6 backdrop-blur-sm">
          <Link
            href="/"
            aria-label="Sector 4 — home"
            className="rounded-sm font-bebas text-3xl leading-none tracking-wide text-ink transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
          >
            SECTOR4
          </Link>
        </header>
        {children}
        <footer className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 font-grotesk text-[10px] leading-snug text-muted/80">
          <span className="max-w-3xl">{DISCLAIMER}</span>
        </footer>
      </body>
    </html>
  );
}
