"use client";

import { getConcept } from "@/app/lib/concepts";
import { linkifyNarrative } from "@/app/lib/linkify";
import { useConceptPopover } from "@/app/components/ConceptPopover";

// Renders a prediction narrative, turning recognized concept terms into in-context links
// (M6-B). Plain text renders exactly as before; only matched terms become buttons.
export function NarrativeText({ narrative, className }: { narrative: string; className?: string }) {
  const open = useConceptPopover();
  const segments = linkifyNarrative(narrative);
  return (
    <p className={className}>
      {segments.map((seg, i) =>
        typeof seg === "string" ? (
          seg
        ) : (
          <button
            key={i}
            type="button"
            aria-label={getConcept(seg.slug)?.term ?? seg.text}
            onClick={(e) => open(seg.slug, e.currentTarget.getBoundingClientRect())}
            className="cta-grow relative font-medium text-accent"
          >
            {seg.text}
          </button>
        ),
      )}
    </p>
  );
}
