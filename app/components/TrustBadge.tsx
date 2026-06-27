// app/components/TrustBadge.tsx
// Trust/integrity signal for a "what" (M6-A) — deliberate and well-typeset, NOT a
// disclaimer hedge (PRD §6.6). Verified reads settled; drafted reads honest, not alarmist.
// "community-reviewed" is wired for C. Presentational only; label logic lives in concepts.ts.
import { badgeLabel, type Badge } from "@/app/lib/concepts";

const STYLES: Record<Badge, string> = {
  verified: "border-accent/40 bg-accent/10 text-accent",
  drafted: "border-ink/15 bg-ink/[0.03] text-muted",
  "community-reviewed": "border-ink/20 bg-ink/[0.04] text-ink/70",
};

export function TrustBadge({ badge }: { badge: Badge }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-grotesk text-[11px] font-semibold uppercase tracking-wide ${STYLES[badge]}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {badgeLabel(badge)}
    </span>
  );
}
