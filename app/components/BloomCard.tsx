"use client";

import { useState } from "react";
import { CardFog } from "@/app/components/CardFog";

/**
 * Generic hover-bloom wrapper: any card-shaped block gets the CardFog dither bloom on
 * hover/focus, at a caller-set intensity (the /accuracy race rows use a very faint one
 * vs the /learn concept cards). Client component so server pages can wrap static content
 * (children pass through). Needs `relative isolate overflow-hidden rounded-*` styling via
 * className for the bloom to sit + clip correctly.
 */
export function BloomCard({
  children,
  className = "",
  intensity = 1,
}: {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={className}
    >
      <CardFog active={hover} intensity={intensity} />
      {children}
    </div>
  );
}
