"use client";

// The landing page's closing statement: a giant SECTOR4 wordmark spanning most of the
// section's width, with the legal disclaimer beneath it -- this page's OWN styled copy of
// app/lib/legal.ts's DISCLAIMER (the site-wide SiteFooter renders nothing on "/", see
// SiteFooter.tsx, so this is the only copy of the text rendered here). Static layout only
// in this revision; scroll parallax (Task 5) and the cursor-magnet letters (Task 6) land
// as follow-up commits on this same file.
import { DISCLAIMER } from "@/app/lib/legal";

const LETTERS = ["S", "E", "C", "T", "O", "R", "4"];

export function LandingFooter() {
  return (
    <div className="relative flex min-h-[40vh] w-full flex-col justify-center gap-6 overflow-hidden border-t border-ink/10 px-6 py-16 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
        <p
          aria-label="Sector 4"
          className="font-bebas leading-none tracking-wide text-ink"
          style={{ fontSize: "clamp(4rem, 18vw, 16rem)" }}
        >
          {LETTERS.map((ch, i) => (
            <span key={i} className="inline-block">
              {ch}
            </span>
          ))}
        </p>
        <p className="max-w-3xl font-grotesk text-xs leading-snug text-muted/80">
          {DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
