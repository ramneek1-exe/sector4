"use client";

import Link from "next/link";
import { useState } from "react";
import { CardFog } from "@/app/components/CardFog";
import { TrustBadge } from "@/app/components/TrustBadge";
import type { Concept } from "@/app/lib/concepts";

/**
 * A concept card on /learn. Hover does two things: an INSTANT affordance (border →
 * accent, a small lift + soft brand shadow, ~190ms) so feedback never waits, and the
 * brand dither warp blooming from the bottom-right corner (CardFog) as a delight layer.
 * The bloom sits behind the text (content is `relative`); under reduced-motion the lift
 * is suppressed and CardFog shows a static frame (no motion).
 */
export function ConceptCard({ concept }: { concept: Concept }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href={`/learn/${concept.slug}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="legible group relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl border border-ink/10 bg-white/80 p-5 transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_10px_34px_-14px_rgba(64,108,214,0.35)] focus-visible:-translate-y-0.5 focus-visible:border-accent focus-visible:outline-none motion-reduce:transition-colors motion-reduce:hover:translate-y-0 motion-reduce:focus-visible:translate-y-0"
    >
      <CardFog active={hover} />
      <div className="relative flex items-start justify-between gap-2">
        <span className="font-grotesk text-base font-bold text-ink">{concept.term}</span>
        <TrustBadge badge={concept.badge} />
      </div>
      <span className="relative font-lastik text-sm text-muted">{concept.summary}</span>
    </Link>
  );
}
