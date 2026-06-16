import "./globals.css";
import type { ReactNode } from "react";
import { fontVars } from "@/app/lib/fonts";
import { AuroraBackdrop } from "@/app/components/AuroraBackdrop";

export const metadata = { title: "Sector 4", description: "F1 weekend companion" };

const DISCLAIMER =
  "Sector 4 is an independent project, not affiliated with or endorsed by Formula 1, " +
  "FOM, the FIA, or any team. All driver and team names are used for editorial reference. " +
  "Data sourced from publicly available timing.";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body className="min-h-screen bg-bg text-ink antialiased font-lastik">
        <AuroraBackdrop />
        {/* The ONLY use of Bebas Neue: the wordmark, flush top-left. */}
        <span className="fixed left-6 top-5 z-20 font-bebas text-3xl tracking-wide text-ink">
          SECTOR 4
        </span>
        {children}
        <footer className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-4 px-6 py-3 font-grotesk text-[10px] leading-snug text-muted/80">
          <span className="max-w-3xl">{DISCLAIMER}</span>
          <a
            href="https://shaders.com"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 uppercase tracking-widest"
          >
            Powered by Shaders
          </a>
        </footer>
      </body>
    </html>
  );
}
