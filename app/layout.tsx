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
      <body className="flex min-h-screen flex-col bg-bg text-ink antialiased font-lastik">
        {/* The ONLY use of Bebas Neue: the wordmark, flush top-left. */}
        <span className="fixed left-6 top-5 z-20 font-bebas text-3xl tracking-wide text-ink">
          SECTOR4
        </span>
        {children}
        <footer className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 font-grotesk text-[10px] leading-snug text-muted/80">
          <span className="max-w-3xl">{DISCLAIMER}</span>
        </footer>
      </body>
    </html>
  );
}
