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
      <body className="min-h-screen bg-bg text-ink antialiased font-lastik">
        <header className="mx-auto max-w-2xl px-6 pt-10">
          {/* The ONLY use of Bebas Neue: the wordmark. */}
          <span className="font-bebas text-4xl tracking-wide text-ink">SECTOR 4</span>
        </header>
        {children}
        <footer className="mx-auto max-w-2xl px-6 py-10 font-grotesk text-[11px] leading-relaxed text-muted">
          {DISCLAIMER}
        </footer>
      </body>
    </html>
  );
}
