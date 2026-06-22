import "./globals.css";
import type { ReactNode } from "react";
import { fontVars } from "@/app/lib/fonts";

export const metadata = { title: "Sector 4", description: "F1 weekend companion" };

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
          <span className="font-bebas text-3xl leading-none tracking-wide text-ink">
            SECTOR4
          </span>
        </header>
        {children}
        <footer className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 font-grotesk text-[10px] leading-snug text-muted/80">
          <span className="max-w-3xl">{DISCLAIMER}</span>
        </footer>
      </body>
    </html>
  );
}
