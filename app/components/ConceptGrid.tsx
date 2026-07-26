"use client";

// One theme's concept grid on /learn. Themes now carry up to 9 cards each (the
// 2026-07-26 content expansion) — collapses to the first INITIAL_VISIBLE with a
// "see more" toggle so a theme section doesn't dump a full 3x3 grid on first paint.
import { useState } from "react";
import { ConceptCard } from "@/app/components/ConceptCard";
import type { Concept } from "@/app/lib/concepts";

const INITIAL_VISIBLE = 6;

export function ConceptGrid({ concepts, startIndex }: { concepts: Concept[]; startIndex: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = concepts.length > INITIAL_VISIBLE;
  const visible = expanded ? concepts : concepts.slice(0, INITIAL_VISIBLE);

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c, i) => {
          // The first INITIAL_VISIBLE cards are on screen at page load and use the
          // page-wide stagger (startIndex carries the running index across every
          // theme). Cards past that only mount once "see more" is clicked -- they're
          // freshly rendered then, not sitting on the page since load, so reusing the
          // page-load delay (which can be 1-2s+ for a later theme) would leave them
          // invisible for a beat after an action the user just took. Short local
          // stagger instead, starting near 0ms.
          const delay =
            i < INITIAL_VISIBLE ? 150 + (startIndex + i) * 55 : (i - INITIAL_VISIBLE) * 55;
          return (
            <li key={c.slug} className="learn-rise" style={{ animationDelay: `${delay}ms` }}>
              <ConceptCard concept={c} />
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="cta-grow relative mt-4 inline-block font-grotesk text-xs font-semibold uppercase tracking-wide text-accent"
        >
          {expanded ? "See less" : `See ${concepts.length - INITIAL_VISIBLE} more`}
        </button>
      )}
    </>
  );
}
