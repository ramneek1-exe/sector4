import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { fontVars } from "@/app/lib/fonts";
import { SiteNav } from "@/app/components/SiteNav";
import { SmoothScroll } from "@/app/components/SmoothScroll";

const TAGLINE = "Honest podium odds, strategy, and the numbers behind them.";

// metadataBase makes the file-based opengraph/twitter images resolve to absolute URLs
// on the production domain, so link previews render when the site is shared. (next.config
// redirects www -> apex, so the canonical host is the bare domain.)
export const metadata: Metadata = {
  metadataBase: new URL("https://sector4.net"),
  title: {
    default: "Sector 4: F1 weekend companion",
    template: "%s · Sector 4",
  },
  description:
    "An explainer-led F1 weekend companion: honest, calibrated podium odds, pit-stop " +
    "strategy, and the numbers behind a race weekend, with plain-English explanations.",
  applicationName: "Sector 4",
  openGraph: {
    type: "website",
    siteName: "Sector 4",
    title: "Sector 4: F1 weekend companion",
    description: TAGLINE,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sector 4: F1 weekend companion",
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
      <body className="flex min-h-screen flex-col overflow-x-hidden bg-bg text-ink antialiased font-lastik pt-[68px]">
        <SmoothScroll />
        {/* Persistent single-row nav (wordmark + section links + CTA). The fixed bar has
            a translucent backing so scrolled content passes UNDER it; the body's top
            padding (matching SiteNav NAV_H) keeps page content clear of it. */}
        <SiteNav />
        {children}
        <footer className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 font-grotesk text-[10px] leading-snug text-muted/80">
          <span className="max-w-3xl">{DISCLAIMER}</span>
        </footer>
      </body>
    </html>
  );
}
