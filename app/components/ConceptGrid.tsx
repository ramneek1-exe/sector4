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
        {visible.map((c, i) => (
          <li
            key={c.slug}
            className="learn-rise"
            style={{ animationDelay: `${150 + (startIndex + i) * 55}ms` }}
          >
            <ConceptCard concept={c} />
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="cta-grow mt-4 inline-block font-grotesk text-xs font-semibold uppercase tracking-wide text-accent"
        >
          {expanded ? "See less" : `See ${concepts.length - INITIAL_VISIBLE} more`}
        </button>
      )}
    </>
  );
}
