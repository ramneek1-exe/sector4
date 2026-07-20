# Landing v2b (race-track spine + numeral hover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate SectorDivider lines with ONE continuous scroll-scrubbed race track that connects S1→S4 (grid box start, kerbed curves, chequered finish, the abstract car riding the path floor-parallel via MotionPath), plus a CardFog dither bloom on numeral hover.

**Architecture:** Spec §2b of `docs/superpowers/specs/2026-07-19-landing-v2-hero-sections-design.md`. Pure geometry in `app/lib/track-path.ts` (unit-tested); one client `TrackSpine` component measures the numeral anchors, renders the SVG overlay, and drives one scrubbed GSAP timeline (DrawSVG + MotionPath); `SectorNumeral` becomes a client component carrying the hover bloom and the `data-sector-anchor` the spine measures. Landing page stays a server component.

**Tech Stack:** gsap ^3.15 (adds MotionPathPlugin to the existing registration), existing CardFog / AsciiEmblem, vitest for the pure geometry.

## Global Constraints

- **Never import values from a "use client" module into a server component.** `app/lib/track-path.ts` stays pure/server-safe (no window, no gsap). `app/lib/gsap.ts` remains the only plugin-registration point, client-only.
- **Reduced motion:** all tweens inside `gsap.matchMedia("(prefers-reduced-motion: no-preference)")`; under reduce (or no JS) the FULL track + kerbs + furniture render complete and the car sits parked at the finish (positioned with plain CSS transforms from geometry data, NOT gsap).
- **WebGL budget:** CardFog blooms mount only while a numeral is hovered (existing `{active}` discipline). No other new shader mounts.
- **Decorative:** the whole track SVG and the car are `aria-hidden`; SVG `pointer-events-none`.
- **No Pirelli/FOM marks;** the car is the existing rights-safe silhouette (`AsciiEmblem kind="car"`).
- **Commits:** conventional style, one logical change each, NO AI attribution of any kind.
- Locked section order/copy from the v2 plan is untouched; this slice only swaps the divider system and the numeral component.
- Verify server routes with local `next start` + curl, not just `npm run build`. Kill stale `next start` processes squatting port 3000 before smoking (`pkill -f "next start"`).

---

### Task 1: Pure track geometry (`app/lib/track-path.ts`)

**Files:**
- Create: `app/lib/track-path.ts`
- Test: `app/lib/track-path.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (Task 2 relies on these exact names):

```ts
export interface TrackAnchor { x: number; y: number }
export interface TrackSegment { d: string; kind: "straight" | "curve" }
export interface TrackGeometry {
  d: string;                 // full single-stroke path S1 -> S4
  segments: TrackSegment[];  // alternating straight/connector, for kerb rendering
  start: TrackAnchor;        // top of the first straight (grid box goes here)
  finish: TrackAnchor;       // bottom of the last straight (chequered strip here)
}
export function buildTrackGeometry(anchors: TrackAnchor[], straightHalf?: number): TrackGeometry | null
```

- [ ] **Step 1: Write the failing test**

Create `app/lib/track-path.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTrackGeometry } from "./track-path";

const ZIGZAG = [
  { x: 600, y: 200 },
  { x: 100, y: 800 },
  { x: 600, y: 1400 },
  { x: 100, y: 2000 },
];

describe("buildTrackGeometry", () => {
  it("returns null for fewer than 2 anchors", () => {
    expect(buildTrackGeometry([])).toBeNull();
    expect(buildTrackGeometry([{ x: 1, y: 2 }])).toBeNull();
  });

  it("builds straights at each anchor and connectors between them", () => {
    const g = buildTrackGeometry(ZIGZAG, 60)!;
    // 4 straights + 3 connectors, interleaved: S C S C S C S
    expect(g.segments).toHaveLength(7);
    expect(g.segments.map((s) => s.kind)).toEqual([
      "straight", "curve", "straight", "curve", "straight", "curve", "straight",
    ]);
    // start = top of first straight, finish = bottom of last
    expect(g.start).toEqual({ x: 600, y: 140 });
    expect(g.finish).toEqual({ x: 100, y: 2060 });
    // full path starts at start, single M
    expect(g.d.startsWith("M 600 140")).toBe(true);
    expect(g.d.match(/M /g)).toHaveLength(1);
    // three cubic connectors in the full path
    expect(g.d.match(/C /g)).toHaveLength(3);
  });

  it("marks same-x connectors as straight (vertical mobile mode)", () => {
    const vertical = [
      { x: 24, y: 200 },
      { x: 24, y: 800 },
      { x: 24, y: 1400 },
    ];
    const g = buildTrackGeometry(vertical, 40)!;
    expect(g.segments.every((s) => s.kind === "straight")).toBe(true);
  });

  it("clamps straightHalf so straights never overlap the connector span", () => {
    const tight = [
      { x: 600, y: 100 },
      { x: 100, y: 220 }, // only 120px apart
    ];
    const g = buildTrackGeometry(tight, 60)!;
    // straightHalf clamped to < half the anchor gap; no NaN, connector span positive
    expect(g.d).not.toContain("NaN");
    expect(g.start.y).toBeGreaterThanOrEqual(100 - 60);
    expect(g.finish.y).toBeLessThanOrEqual(220 + 60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/track-path.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `app/lib/track-path.ts`**

```ts
// Pure geometry for the landing's race-track spine (spec 2b). Given the sector
// numerals' centre points (in container pixel coords, S1..S4 order), produce one
// continuous SVG path: a short vertical straight at each anchor, smooth cubic
// S-curves between them. Segments are returned individually so the renderer can
// stripe kerbs onto the CURVE connectors only. Pure and server-safe by design.

export interface TrackAnchor {
  x: number;
  y: number;
}

export interface TrackSegment {
  d: string;
  kind: "straight" | "curve";
}

export interface TrackGeometry {
  d: string;
  segments: TrackSegment[];
  start: TrackAnchor;
  finish: TrackAnchor;
}

const fmt = (n: number) => String(Math.round(n));

export function buildTrackGeometry(
  anchors: TrackAnchor[],
  straightHalf = 60,
): TrackGeometry | null {
  if (anchors.length < 2) return null;

  // A straight may extend at most 40% of the tightest anchor gap, so the
  // connector between two close anchors always has positive span.
  let minGap = Infinity;
  for (let i = 1; i < anchors.length; i++) {
    minGap = Math.min(minGap, anchors[i].y - anchors[i - 1].y);
  }
  const half = Math.min(straightHalf, Math.max(8, minGap * 0.4));

  const segments: TrackSegment[] = [];
  const parts: string[] = [];

  const start = { x: anchors[0].x, y: anchors[0].y - half };
  parts.push(`M ${fmt(start.x)} ${fmt(start.y)}`);

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    // Straight through the anchor: top -> bottom.
    const top = { x: a.x, y: a.y - half };
    const bottom = { x: a.x, y: a.y + half };
    segments.push({
      d: `M ${fmt(top.x)} ${fmt(top.y)} L ${fmt(bottom.x)} ${fmt(bottom.y)}`,
      kind: "straight",
    });
    parts.push(`L ${fmt(bottom.x)} ${fmt(bottom.y)}`);

    // Connector to the next anchor's straight (cubic; vertical tangents at both
    // ends so it meets the straights smoothly).
    const next = anchors[i + 1];
    if (next) {
      const from = bottom;
      const to = { x: next.x, y: next.y - half };
      const span = to.y - from.y;
      const c1 = { x: from.x, y: from.y + span * 0.5 };
      const c2 = { x: to.x, y: to.y - span * 0.5 };
      const d =
        `M ${fmt(from.x)} ${fmt(from.y)} C ${fmt(c1.x)} ${fmt(c1.y)} ` +
        `${fmt(c2.x)} ${fmt(c2.y)} ${fmt(to.x)} ${fmt(to.y)}`;
      segments.push({ d, kind: from.x === to.x ? "straight" : "curve" });
      parts.push(
        `C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(to.x)} ${fmt(to.y)}`,
      );
    }
  }

  const last = anchors[anchors.length - 1];
  const finish = { x: last.x, y: last.y + half };

  return {
    d: parts.join(" "),
    segments,
    start: { x: Math.round(start.x), y: Math.round(start.y) },
    finish: { x: Math.round(finish.x), y: Math.round(finish.y) },
  };
}
```

Note the test expects `start`/`finish` computed from the UNCLAMPED half only when the
gaps allow (ZIGZAG gaps are 600px, so half stays 60). The tight-anchor test asserts
bounds, not exact values.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/track-path.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/track-path.ts app/lib/track-path.test.ts
git commit -m "feat: pure track-spine geometry (anchor straights, cubic connectors, kerb segments)"
```

---

### Task 2: `TrackSpine` renderer + scrubbed timeline

**Files:**
- Modify: `app/lib/gsap.ts` (register MotionPathPlugin)
- Create: `app/components/TrackSpine.tsx`

**Interfaces:**
- Consumes: `buildTrackGeometry` (Task 1), `{ gsap, ScrollTrigger }` from `app/lib/gsap.ts`, `AsciiEmblem` (existing).
- Produces: `TrackSpine()` client component. Contract with Task 4: it is rendered as the FIRST child of a `position: relative` wrapper that also contains the four sections; it measures every `[data-sector-anchor]` element inside that wrapper (document order = S1..S4) and overlays the track. Renders nothing until measurement succeeds.

- [ ] **Step 1: Register MotionPathPlugin in `app/lib/gsap.ts`**

```ts
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
```

and extend the existing call: `gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin, MotionPathPlugin);`

- [ ] **Step 2: Create `app/components/TrackSpine.tsx`**

```tsx
"use client";

// The landing's race-track spine (spec 2b): one continuous SVG track connecting the
// sector numerals S1 -> S4, drawn/scrubbed with scroll, with the abstract car riding
// the path (MotionPath autoRotate keeps its floor parallel to the track). Rendered as
// the first child of the relative sections wrapper; measures [data-sector-anchor]
// elements inside that wrapper. Under prefers-reduced-motion (or before JS runs) the
// full track renders statically and the car parks at the finish.
import { useEffect, useRef, useState } from "react";
import { gsap } from "@/app/lib/gsap";
import { buildTrackGeometry, type TrackGeometry } from "@/app/lib/track-path";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";

const CAR_W = 56;
const TRACK = "#251F44"; // ink
const KERB_RED = "#d2504a";

interface Measured {
  geometry: TrackGeometry;
  width: number;
  height: number;
}

export function TrackSpine() {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const carRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);

  // Measure the wrapper + numeral anchors; rebuild on resize (rAF-debounced).
  useEffect(() => {
    const root = rootRef.current;
    const wrapper = root?.parentElement;
    if (!root || !wrapper) return;

    let raf = 0;
    const measure = () => {
      const wrap = wrapper.getBoundingClientRect();
      const anchors = Array.from(
        wrapper.querySelectorAll<HTMLElement>("[data-sector-anchor]"),
      ).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: r.left - wrap.left + r.width / 2,
          y: r.top - wrap.top + r.height / 2,
        };
      });
      const geometry = buildTrackGeometry(anchors);
      setMeasured(
        geometry ? { geometry, width: wrap.width, height: wrap.height } : null,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(wrapper);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Scrubbed timeline: DrawSVG the track + kerbs while the car motion-paths along,
  // sharing one progress. Rebuilt whenever the measured geometry changes.
  useEffect(() => {
    if (!measured) return;
    const svg = svgRef.current;
    const car = carRef.current;
    const wrapper = rootRef.current?.parentElement;
    if (!svg || !car || !wrapper) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const trackPath = svg.querySelector<SVGPathElement>("[data-track-main]");
      if (!trackPath) return;
      const strokes = svg.querySelectorAll<SVGPathElement>("[data-track-draw]");
      gsap.set(strokes, { drawSVG: "0%" });
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: wrapper,
          start: "top 60%",
          end: "bottom 75%",
          scrub: 1,
        },
      });
      tl.to(strokes, { drawSVG: "100%", duration: 1 }, 0).to(
        car,
        {
          duration: 1,
          motionPath: {
            path: trackPath,
            align: trackPath,
            alignOrigin: [0.5, 0.5],
            autoRotate: true,
          },
        },
        0,
      );
      // ScrollTrigger measures on creation; a rebuild after resize needs fresh math.
      ScrollTrigger.refresh();
    });
    return () => mm.revert();
  }, [measured]);

  if (!measured) {
    return <div ref={rootRef} aria-hidden className="absolute inset-0" />;
  }

  const { geometry, width, height } = measured;
  const curves = geometry.segments.filter((s) => s.kind === "curve");
  const { start, finish } = geometry;

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden sm:block"
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${Math.round(width)} ${Math.round(height)}`}
        className="absolute inset-0"
      >
        {/* Kerbs: red base + offset white dashes, curves only, under the track line. */}
        {curves.map((c, i) => (
          <g key={i} opacity={0.55}>
            <path
              data-track-draw
              d={c.d}
              fill="none"
              stroke={KERB_RED}
              strokeWidth={8}
              strokeDasharray="12 12"
            />
            <path
              data-track-draw
              d={c.d}
              fill="none"
              stroke="#ffffff"
              strokeWidth={8}
              strokeDasharray="12 12"
              strokeDashoffset={12}
            />
          </g>
        ))}
        {/* The racing line itself. */}
        <path
          data-track-main
          data-track-draw
          d={geometry.d}
          fill="none"
          stroke={TRACK}
          strokeOpacity={0.18}
          strokeWidth={3}
        />
        {/* Grid box: starting-slot bracket, open toward travel (downward). */}
        <path
          d={`M ${start.x - 16} ${start.y + 16} L ${start.x - 16} ${start.y - 8} L ${start.x + 16} ${start.y - 8} L ${start.x + 16} ${start.y + 16}`}
          fill="none"
          stroke={TRACK}
          strokeOpacity={0.5}
          strokeWidth={3}
        />
        {/* Chequered finish strip, perpendicular to the final (vertical) straight. */}
        <g transform={`translate(${finish.x - 24} ${finish.y - 2})`} opacity={0.7}>
          {[0, 1].map((row) =>
            [0, 1, 2, 3, 4, 5].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={col * 8}
                y={row * 6}
                width={8}
                height={6}
                fill={(row + col) % 2 === 0 ? TRACK : "#ffffff"}
              />
            )),
          )}
        </g>
      </svg>
      {/* The car. Reduced-motion/no-JS default: parked at the finish, floor parallel
          to the (vertical) final straight; the scrubbed MotionPath overrides this
          transform entirely when motion is allowed. */}
      <div
        ref={carRef}
        className="absolute left-0 top-0"
        style={{
          width: CAR_W,
          transform: `translate(${finish.x - CAR_W / 2}px, ${finish.y - CAR_W / 4}px) rotate(90deg)`,
        }}
      >
        <AsciiEmblem kind="car" size={CAR_W} />
      </div>
    </div>
  );
}
```

Notes for the implementer:
- Import `ScrollTrigger` alongside `gsap` from `@/app/lib/gsap` (used by the
  `ScrollTrigger.refresh()` call).
- `hidden sm:block`: below `sm` the numerals stack tight against the column and the
  wrapper's anchor x-positions nearly coincide — the geometry degrades to the vertical
  mode by construction (same-x connectors), but the overlay competes with full-width
  text, so the spine renders from `sm` up. The plan's "simplified vertical" mobile mode
  falls out automatically between `sm` and `md` where the anchors are near-vertical.
- Car orientation: `AsciiEmblem kind="car"` faces RIGHT. On a downward straight,
  autoRotate yields 90deg (nose down) — matching the parked transform. If preview shows
  the car nose-up, flip with `autoRotate: 180` — call it out in your report either way.
- Do NOT add `once: true` — this trigger is scrubbed and must live for the page's life;
  `mm.revert()` on cleanup kills it.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean (component not yet mounted; Task 4 wires it).

- [ ] **Step 4: Commit**

```bash
git add app/lib/gsap.ts app/components/TrackSpine.tsx
git commit -m "feat: TrackSpine scrubbed race-track overlay (DrawSVG + MotionPath car)"
```

---

### Task 3: `SectorNumeral` client component with CardFog hover

**Files:**
- Create: `app/components/SectorNumeral.tsx`

**Interfaces:**
- Consumes: `CardFog` (existing: `{ active: boolean; intensity?: number }`, mounts its shader only while active).
- Produces: `SectorNumeral({ n, className? })` client component. Contract with Task 4: renders the oversized numeral (same visual classes as the current server helper in `app/page.tsx`), carries `data-sector-anchor` on its wrapper (TrackSpine measures it) and `data-reveal` (SectionReveal staggers it), and blooms CardFog on pointer hover.

- [ ] **Step 1: Create `app/components/SectorNumeral.tsx`**

```tsx
"use client";

// Oversized faded timing-sheet numeral ("S1".."S4"). Decorative, but interactive on
// hover: the card-hover dither bloom (CardFog) mounts inside the numeral's box while
// the pointer is over it and unmounts at rest (WebGL budget discipline). The wrapper
// is also the track spine's anchor: [data-sector-anchor] marks the racing line's
// waypoint at this section.
import { useState } from "react";
import { CardFog } from "@/app/components/CardFog";

export function SectorNumeral({ n, className = "" }: { n: number; className?: string }) {
  const [hovered, setHovered] = useState(false);

  return (
    <span
      aria-hidden
      data-reveal
      data-sector-anchor
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={`relative isolate inline-block select-none overflow-hidden ${className}`}
    >
      <CardFog active={hovered} intensity={0.5} />
      <span className="pointer-events-none relative font-grotesk text-[7rem] font-bold leading-none tracking-tight text-ink/[0.06] sm:text-[10rem]">
        S{n}
      </span>
    </span>
  );
}
```

Notes:
- The old server helper's `pointer-events-none` moves INNER (the glyph); the wrapper
  must receive pointer events for hover to fire. It stays `aria-hidden` (decorative);
  no keyboard focus handler — nothing actionable behind it.
- `isolate` + `overflow-hidden` on the wrapper: the PR #36 lesson — CardFog's
  mix-blend child must not escape the box.
- Read `app/components/CardFog.tsx` before wiring: confirm it fills its nearest
  positioned ancestor (it renders absolutely). If it pins to a bottom-right corner
  radial by design, that is ACCEPTABLE here (bloom rises from the numeral's corner,
  same as cards) — do not modify CardFog.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean (not yet mounted).

- [ ] **Step 3: Commit**

```bash
git add app/components/SectorNumeral.tsx
git commit -m "feat: SectorNumeral client component with CardFog hover bloom"
```

---

### Task 4: Page wiring (spine in, dividers out) + verify + push

**Files:**
- Modify: `app/page.tsx`
- Delete: `app/components/SectorDivider.tsx`

**Interfaces:**
- Consumes: `TrackSpine` (Task 2), `SectorNumeral` (Task 3), existing sections.
- Produces: the final landing composition on PR #37.

- [ ] **Step 1: Rewire `app/page.tsx`**

1a. Imports: remove `SectorDivider` import; add:

```tsx
import { TrackSpine } from "@/app/components/TrackSpine";
import { SectorNumeral } from "@/app/components/SectorNumeral";
```

1b. Delete the local `function SectorNumeral(...)` server helper (the client component
replaces it; call sites keep the exact same `<SectorNumeral n={N} />` shape).

1c. Replace `LandingPage`'s return: drop the three `<SectorDivider />` elements and wrap
the four sections in the spine's relative wrapper:

```tsx
  return (
    <>
      <Hero />
      <div className="relative">
        <TrackSpine />
        <AskAnything />
        <LearnTheSport />
        <ThisWeekend />
        <HonestByDesign liveScored={liveScored} />
      </div>
      <LandingFooter />
    </>
  );
```

1d. Delete `app/components/SectorDivider.tsx` (`git rm`). Confirm no other references:
`grep -rn "SectorDivider" app/` must return nothing.

- [ ] **Step 2: Full verify**

```bash
npm test
npx tsc --noEmit && npm run build
pkill -f "next start"; npm run start &
sleep 4
curl -s http://localhost:3000/ | grep -o "Sector [1-4] ·"    # expect the four labels in 1,2,3,4 order
for p in / /ask /learn /accuracy /weekend; do curl -s -o /dev/null -w "$p %{http_code}\n" "http://localhost:3000$p"; done   # all 200
pkill -f "next start"
```

Expected: vitest green (including track-path tests), tsc/build clean, order intact, all routes 200.

- [ ] **Step 3: Commit + push**

```bash
git add app/page.tsx app/components/SectorDivider.tsx
git commit -m "feat: continuous race-track spine replaces dividers; numeral hover bloom wired"
git push origin landing-page
```

- [ ] **Step 4: Report for owner eyeball**

Flag for the preview pass: car orientation on the straights (autoRotate offset if
nose-up), kerb visibility against both white and the S4 tinted band, track legibility
behind section text at `sm`–`md` widths, and scrub feel with Lenis (scrub: 1 lag).
