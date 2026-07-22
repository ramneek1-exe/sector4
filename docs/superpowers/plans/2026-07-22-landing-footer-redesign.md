# Landing Footer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the landing page's plain v1 footer (wordmark + nav links, no motion) with
a giant Bebas Neue `SECTOR4` wordmark spanning most of the section width, the legal
disclaimer underneath, a scroll-scrubbed parallax reveal, and a cursor-magnet
microinteraction on the letters — while suppressing the duplicate legal footer that would
otherwise also render on `/`.

**Architecture:** Two new pure lib modules (`app/lib/legal.ts` for the shared disclaimer
text, `app/lib/wordmark-magnet.ts` for the magnet-offset/lerp math), a route-gated site-wide
footer component, and a client `LandingFooter` component built in three layers (static
layout → GSAP `ScrollTrigger` scrub parallax → `IntersectionObserver`-gated cursor magnet),
following the same patterns `TrackSpine.tsx` and `DitherFog.tsx` already established in
this codebase.

**Tech Stack:** Next.js App Router (server + client components), GSAP + ScrollTrigger
(`app/lib/gsap.ts`, already registered), Tailwind CSS, Vitest.

## Global Constraints

- Footer is `min-h-[40vh]` — a floor, not a cap; taller is fine if content needs it.
- Nav links are dropped from the footer entirely (header nav already covers navigation).
- The legal disclaimer text must be byte-identical between the site-wide footer and the
  landing footer — single source of truth in `app/lib/legal.ts`, no copy-pasted strings.
- Reduced motion (`prefers-reduced-motion: reduce`): full content visible, zero
  scroll-linked movement, and the cursor-magnet effect attaches **no listener and no rAF
  loop at all** (not just visually inert).
- Hidden/offset states are set via `gsap.set` only, inside
  `gsap.matchMedia("(prefers-reduced-motion: no-preference)")` — never via CSS. This is the
  site-wide convention (`SectionReveal`, `TrackSpine`) so no-JS/reduced-motion users always
  see full content.
- No color change on the letter-magnet hover; letters stay the wordmark's normal ink color.
- No WebGL/shader involvement in the footer — plain CSS transforms driven by JS, same
  performance class as `SectionReveal`.
- No change to `TrackSpine`, the sector sections, or their copy.
- Commits: small, focused, conventional-style (`feat:`/`fix:`/`docs:`/`style:`), one logical
  change per commit, no AI attribution (per `CLAUDE.md`).
- Visual/motion-feel constants (parallax travel distances, magnet radius/offset, the
  wordmark's `clamp()` bounds) are aesthetic judgment calls — per house feedback, render
  real candidates and get explicit sign-off before the final commit (Task 7), don't lock
  them in unilaterally.

---

### Task 1: Shared legal text + landing-route helper

**Files:**
- Create: `app/lib/legal.ts`
- Modify: `app/lib/nav.ts`
- Create: `app/lib/nav.test.ts`

**Interfaces:**
- Produces: `DISCLAIMER: string` (`app/lib/legal.ts`); `isLandingRoute(pathname: string): boolean` (`app/lib/nav.ts`)

- [ ] **Step 1: Create the shared legal text module**

Create `app/lib/legal.ts`:

```ts
// Shared legal disclaimer text -- rendered by BOTH the site-wide footer (every page
// except the landing) and the landing page's own footer (styled differently, see
// LandingFooter + SiteFooter), so the copy can never drift between the two.
export const DISCLAIMER =
  "Sector 4 is an independent project, not affiliated with or endorsed by Formula 1, " +
  "FOM, the FIA, or any team. All driver and team names are used for editorial reference. " +
  "Data sourced from publicly available timing.";
```

- [ ] **Step 2: Write the failing test for `isLandingRoute`**

Create `app/lib/nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isLandingRoute } from "./nav";

describe("isLandingRoute", () => {
  it("is true only for the exact root path", () => {
    expect(isLandingRoute("/")).toBe(true);
  });
  it("is false for any other path", () => {
    expect(isLandingRoute("/ask")).toBe(false);
    expect(isLandingRoute("/weekend")).toBe(false);
    expect(isLandingRoute("")).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run app/lib/nav.test.ts`
Expected: FAIL — `isLandingRoute` is not exported from `./nav`.

- [ ] **Step 4: Implement `isLandingRoute`**

In `app/lib/nav.ts`, add (near `isActiveLink`, same section):

```ts
// True only for the landing page itself ("/") -- used to gate the site-wide legal footer
// off on the landing route, since LandingFooter renders its own styled copy of the same
// disclaimer text there (see SiteFooter.tsx / app/lib/legal.ts).
export function isLandingRoute(pathname: string): boolean {
  return pathname === "/";
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run app/lib/nav.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output (clean)

```bash
git add app/lib/legal.ts app/lib/nav.ts app/lib/nav.test.ts
git commit -m "feat: shared legal text module + isLandingRoute helper"
```

---

### Task 2: Site-wide footer gating (SiteFooter component)

**Files:**
- Create: `app/components/SiteFooter.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `DISCLAIMER` (Task 1, `app/lib/legal.ts`); `isLandingRoute` (Task 1, `app/lib/nav.ts`)
- Produces: `<SiteFooter />` component (no props), rendered once in `app/layout.tsx`

- [ ] **Step 1: Create the SiteFooter component**

Create `app/components/SiteFooter.tsx`:

```tsx
"use client";

// The legal disclaimer footer, rendered on every page EXCEPT the landing ("/"), which
// renders its own styled version of the same text inline (see LandingFooter) -- otherwise
// the disclaimer would appear twice on "/". Client component because the route gate needs
// usePathname (the same pattern SiteNav already uses for landing-specific behavior).
import { usePathname } from "next/navigation";
import { DISCLAIMER } from "@/app/lib/legal";
import { isLandingRoute } from "@/app/lib/nav";

export function SiteFooter() {
  const pathname = usePathname();
  if (isLandingRoute(pathname)) return null;
  return (
    <footer className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 font-grotesk text-[10px] leading-snug text-muted/80">
      <span className="max-w-3xl">{DISCLAIMER}</span>
    </footer>
  );
}
```

- [ ] **Step 2: Wire it into the root layout**

In `app/layout.tsx`, the current file is:

```tsx
import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { fontVars } from "@/app/lib/fonts";
import { SiteNav } from "@/app/components/SiteNav";
import { SmoothScroll } from "@/app/components/SmoothScroll";

const TAGLINE = "Honest podium odds, strategy, and the numbers behind them.";

// ... metadata export unchanged ...

const DISCLAIMER =
  "Sector 4 is an independent project, not affiliated with or endorsed by Formula 1, " +
  "FOM, the FIA, or any team. All driver and team names are used for editorial reference. " +
  "Data sourced from publicly available timing.";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body className="flex min-h-screen flex-col overflow-x-hidden bg-bg text-ink antialiased font-lastik pt-[68px]">
        <SmoothScroll />
        <SiteNav />
        {children}
        <footer className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 font-grotesk text-[10px] leading-snug text-muted/80">
          <span className="max-w-3xl">{DISCLAIMER}</span>
        </footer>
      </body>
    </html>
  );
}
```

Change the imports at the top:

```tsx
import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { fontVars } from "@/app/lib/fonts";
import { SiteNav } from "@/app/components/SiteNav";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SmoothScroll } from "@/app/components/SmoothScroll";
```

Remove the local `const DISCLAIMER = ...` block entirely (it now lives in
`app/lib/legal.ts`, unused here).

Replace the inline `<footer>...</footer>` at the bottom with `<SiteFooter />`:

```tsx
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body className="flex min-h-screen flex-col overflow-x-hidden bg-bg text-ink antialiased font-lastik pt-[68px]">
        <SmoothScroll />
        <SiteNav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean)

- [ ] **Step 4: Manual verification — build and check both branches**

Run: `npm run build`
Expected: clean build.

Start the dev server (`npm run dev`), then in a browser (or via `curl -s http://localhost:3000/ask | grep -o "independent project"` for a quick text check):
- Visit `/ask` (or `/learn`, `/accuracy`, `/weekend`) — the small legal footer text
  ("Sector 4 is an independent project...") should still appear at the bottom, unchanged.
- Visit `/` — the small legal footer should NOT appear (the landing's own footer is still
  the old v1 one at this point, Task 4 replaces it; just confirm the site-wide one is
  gone).

- [ ] **Step 5: Commit**

```bash
git add app/components/SiteFooter.tsx app/layout.tsx
git commit -m "feat: gate the site-wide legal footer off the landing route"
```

---

### Task 3: Wordmark-magnet pure math

**Files:**
- Create: `app/lib/wordmark-magnet.ts`
- Create: `app/lib/wordmark-magnet.test.ts`

**Interfaces:**
- Produces: `Point` type, `MagnetOptions` type, `magnetOffset(letterCenter: Point, pointer: Point, opts: MagnetOptions): Point`, `lerp(current: number, target: number, factor: number): number` (all from `app/lib/wordmark-magnet.ts`)

- [ ] **Step 1: Write the failing tests**

Create `app/lib/wordmark-magnet.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { magnetOffset, lerp } from "./wordmark-magnet";

describe("magnetOffset", () => {
  it("is zero when the pointer is exactly at the letter center", () => {
    expect(
      magnetOffset({ x: 100, y: 100 }, { x: 100, y: 100 }, { radius: 80, maxOffset: 10 }),
    ).toEqual({ x: 0, y: 0 });
  });

  it("is zero at or beyond the radius", () => {
    expect(
      magnetOffset({ x: 0, y: 0 }, { x: 80, y: 0 }, { radius: 80, maxOffset: 10 }),
    ).toEqual({ x: 0, y: 0 });
    expect(
      magnetOffset({ x: 0, y: 0 }, { x: 200, y: 0 }, { radius: 80, maxOffset: 10 }),
    ).toEqual({ x: 0, y: 0 });
  });

  it("offset direction points from the letter toward the pointer", () => {
    const right = magnetOffset({ x: 0, y: 0 }, { x: 40, y: 0 }, { radius: 80, maxOffset: 10 });
    expect(right.x).toBeGreaterThan(0);
    expect(right.y).toBe(0);
    const left = magnetOffset({ x: 0, y: 0 }, { x: -40, y: 0 }, { radius: 80, maxOffset: 10 });
    expect(left.x).toBeLessThan(0);
  });

  it("magnitude scales linearly with falloff (midpoint radius = half maxOffset)", () => {
    const o = magnetOffset({ x: 0, y: 0 }, { x: 40, y: 0 }, { radius: 80, maxOffset: 10 });
    // dist=40, falloff=1-40/80=0.5, magnitude=10*0.5=5
    expect(o.x).toBeCloseTo(5, 5);
    expect(o.y).toBe(0);
  });

  it("magnitude approaches maxOffset as distance approaches 0", () => {
    const o = magnetOffset({ x: 0, y: 0 }, { x: 1, y: 0 }, { radius: 80, maxOffset: 10 });
    // dist=1, falloff=1-1/80=0.9875, magnitude=9.875
    expect(o.x).toBeCloseTo(9.875, 2);
  });
});

describe("lerp", () => {
  it("returns current when factor is 0", () => {
    expect(lerp(0, 100, 0)).toBe(0);
  });
  it("returns target when factor is 1", () => {
    expect(lerp(0, 100, 1)).toBe(100);
  });
  it("moves partway toward target for a fractional factor", () => {
    expect(lerp(0, 100, 0.12)).toBeCloseTo(12, 5);
  });
  it("converges: repeated application approaches target", () => {
    let v = 0;
    for (let i = 0; i < 50; i++) v = lerp(v, 100, 0.12);
    expect(v).toBeCloseTo(100, 0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/lib/wordmark-magnet.test.ts`
Expected: FAIL — cannot find module `./wordmark-magnet`.

- [ ] **Step 3: Implement the module**

Create `app/lib/wordmark-magnet.ts`:

```ts
// Pure geometry for the landing footer's cursor-magnet wordmark letters. A letter within
// `radius` px of the pointer nudges toward it with linear distance falloff, capped at
// `maxOffset`; at or beyond the radius it rests at zero. Kept pure/testable per this
// codebase's convention (logic lives in lib, not buried in component internals -- see
// track-path.ts for the precedent).
export interface Point {
  x: number;
  y: number;
}

export interface MagnetOptions {
  radius: number; // px: influence range -- letters at or beyond this distance rest at 0
  maxOffset: number; // px: offset magnitude at zero distance (pointer exactly on the letter)
}

/** Offset a letter should move toward the pointer, given the letter's own rest-position
 *  center and the pointer's current position (both in the same coordinate space, e.g.
 *  viewport / getBoundingClientRect). Zero outside `radius`, and zero exactly at the
 *  center (direction is undefined at distance 0; rather than divide by zero, rest). */
export function magnetOffset(letterCenter: Point, pointer: Point, opts: MagnetOptions): Point {
  const dx = pointer.x - letterCenter.x;
  const dy = pointer.y - letterCenter.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist >= opts.radius) return { x: 0, y: 0 };
  const falloff = 1 - dist / opts.radius; // 1 at dist=0 -> 0 at dist=radius
  const scale = (opts.maxOffset * falloff) / dist;
  return { x: dx * scale, y: dy * scale };
}

/** One step of exponential smoothing toward `target` -- the same easing shape as the
 *  hero's cursor-trailing dither blob (DitherFog). `factor` in (0,1]; higher = snappier. */
export function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/lib/wordmark-magnet.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output (clean)

```bash
git add app/lib/wordmark-magnet.ts app/lib/wordmark-magnet.test.ts
git commit -m "feat: wordmark cursor-magnet offset + lerp math"
```

---

### Task 4: LandingFooter — static layout, wired into the page

**Files:**
- Create: `app/components/LandingFooter.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `DISCLAIMER` (Task 1, `app/lib/legal.ts`)
- Produces: `<LandingFooter />` component (no props), replacing the old inline
  `LandingFooter()` function in `app/page.tsx`

- [ ] **Step 1: Create the static LandingFooter component**

Create `app/components/LandingFooter.tsx`:

```tsx
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
```

Note: `aria-label="Sector 4"` on the `<p>` makes assistive tech announce "Sector 4" once,
not letter-by-letter — per ARIA semantics, an `aria-label` on a container overrides its
text content for accessibility purposes while the visible letters remain in the DOM for
sighted users (and for the per-letter `ref`s Task 6 adds).

- [ ] **Step 2: Remove the old inline footer and wire in the new component**

In `app/page.tsx`, change the import line:

```tsx
import { NAV_H, NAV_LINKS } from "@/app/lib/nav";
```

to:

```tsx
import { NAV_H } from "@/app/lib/nav";
import { LandingFooter } from "@/app/components/LandingFooter";
```

Then remove the old inline function entirely — find and delete this block (near the end of
the file):

```tsx
function LandingFooter() {
  return (
    <div className="border-t border-ink/10 px-6 py-10 sm:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4">
        <span className="font-bebas text-2xl tracking-wide text-ink">SECTOR4</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="font-grotesk text-sm text-muted transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
```

The `<LandingFooter />` call site (inside `LandingPage()`'s returned JSX, already present)
does not need to change — it now resolves to the imported component instead of the local
function.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean). If `Link` is now unused in `app/page.tsx`, TypeScript/ESLint
may flag it — check other usages of `Link` in the file (the hero CTA and section links use
it) before assuming it needs removing; it almost certainly stays in use elsewhere in this
file.

- [ ] **Step 4: Build and visually verify**

Run: `npm run build`
Expected: clean build.

Start the dev server (`npm run dev`), visit `/`, scroll to the bottom. Confirm:
- A large `SECTOR4` wordmark renders, spanning most of the viewport width, no nav links.
- The disclaimer text renders beneath it.
- No layout overflow/horizontal scrollbar at common widths (check at least 375px and
  1440px via the browser's device toolbar or window resize).

- [ ] **Step 5: Commit**

```bash
git add app/components/LandingFooter.tsx app/page.tsx
git commit -m "feat: replace v1 landing footer with static big-wordmark layout"
```

---

### Task 5: Scroll-scrubbed parallax reveal

**Files:**
- Modify: `app/components/LandingFooter.tsx`

**Interfaces:**
- Consumes: `gsap`, `ScrollTrigger` (`app/lib/gsap.ts`, already registered)
- Produces: `rootRef`, `wordmarkRef`, `legalRef` (refs on the footer root / wordmark `<p>` /
  legal `<p>`) — Task 6 attaches its own effect to the same root and needs these element
  refs to already exist with these exact names.

- [ ] **Step 1: Add the parallax scroll effect**

Replace the full contents of `app/components/LandingFooter.tsx` with:

```tsx
"use client";

// The landing page's closing statement: a giant SECTOR4 wordmark spanning most of the
// section's width, with the legal disclaimer beneath it -- this page's OWN styled copy of
// app/lib/legal.ts's DISCLAIMER (the site-wide SiteFooter renders nothing on "/", see
// SiteFooter.tsx, so this is the only copy of the text rendered here). This revision adds
// the scroll-scrubbed parallax reveal; the cursor-magnet letters (Task 6) land as a
// follow-up commit on this same file.
import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "@/app/lib/gsap";
import { DISCLAIMER } from "@/app/lib/legal";

const LETTERS = ["S", "E", "C", "T", "O", "R", "4"];

// Parallax travel distances (px) for the scroll-scrubbed reveal: the wordmark travels a
// SMALLER distance (reads as slower, matching its visual weight) than the legal line
// (travels further, reads as faster) -- the classic layered-depth parallax cue. A starting
// point, tuned against the real page in the plan's final visual-QA task, not sacred.
const WORDMARK_TRAVEL_PX = 32;
const LEGAL_TRAVEL_PX = 72;

export function LandingFooter() {
  const rootRef = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLParagraphElement>(null);
  const legalRef = useRef<HTMLParagraphElement>(null);

  // Scroll parallax: wordmark and legal line travel different distances as the footer
  // scrolls into view, sharing one scrubbed timeline (ScrollTrigger, the same tool
  // TrackSpine already uses for its scroll-scrubbed track draw).
  useEffect(() => {
    const root = rootRef.current;
    const wordmark = wordmarkRef.current;
    const legal = legalRef.current;
    if (!root || !wordmark || !legal) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.set(wordmark, { y: WORDMARK_TRAVEL_PX });
      gsap.set(legal, { y: LEGAL_TRAVEL_PX });
      gsap
        .timeline({
          scrollTrigger: { trigger: root, start: "top 90%", end: "top 40%", scrub: true },
        })
        .to(wordmark, { y: 0, ease: "none" }, 0)
        .to(legal, { y: 0, ease: "none" }, 0);
    });
    return () => mm.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-[40vh] w-full flex-col justify-center gap-6 overflow-hidden border-t border-ink/10 px-6 py-16 sm:px-8"
    >
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
        <p
          ref={wordmarkRef}
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
        <p ref={legalRef} className="max-w-3xl font-grotesk text-xs leading-snug text-muted/80">
          {DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean)

- [ ] **Step 3: Build and manually verify**

Run: `npm run build`
Expected: clean build.

Start the dev server, visit `/`, scroll down to the footer slowly. Confirm the wordmark and
legal line settle into place at slightly different rates as the section enters view (not
required to look "final" — Task 7 tunes the exact feel). Then enable
"Emulate CSS prefers-reduced-motion: reduce" in Chrome DevTools (Rendering tab) and reload:
confirm the footer shows its final resting state immediately, with no scroll-linked
movement.

- [ ] **Step 4: Commit**

```bash
git add app/components/LandingFooter.tsx
git commit -m "feat: scroll-scrubbed parallax reveal for the landing footer"
```

---

### Task 6: Cursor-magnet letters

**Files:**
- Modify: `app/components/LandingFooter.tsx`

**Interfaces:**
- Consumes: `magnetOffset`, `lerp`, `Point` (Task 3, `app/lib/wordmark-magnet.ts`);
  `rootRef` (Task 5)

- [ ] **Step 1: Add the cursor-magnet effect**

Replace the full contents of `app/components/LandingFooter.tsx` with:

```tsx
"use client";

// The landing page's closing statement: a giant SECTOR4 wordmark spanning most of the
// section's width, with the legal disclaimer beneath it -- this page's OWN styled copy of
// app/lib/legal.ts's DISCLAIMER (the site-wide SiteFooter renders nothing on "/", see
// SiteFooter.tsx, so this is the only copy of the text rendered here). Two motion layers:
// a scroll-scrubbed parallax reveal (wordmark + legal line travel different distances),
// and a cursor-magnet nudge on the individual wordmark letters, gated to only run while
// the footer is in the viewport (IntersectionObserver, matching the codebase's discipline
// of not running per-frame work off-screen -- see CardFog, the /lab/dither InView helper).
import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "@/app/lib/gsap";
import { DISCLAIMER } from "@/app/lib/legal";
import { magnetOffset, lerp, type Point } from "@/app/lib/wordmark-magnet";

const LETTERS = ["S", "E", "C", "T", "O", "R", "4"];

// Parallax travel distances (px) -- see Task 5's commit for the rationale. Starting point,
// tuned in the plan's final visual-QA task.
const WORDMARK_TRAVEL_PX = 32;
const LEGAL_TRAVEL_PX = 72;

// Cursor-magnet tuning: a letter within MAGNET_RADIUS_PX of the pointer nudges toward it,
// up to MAGNET_MAX_OFFSET_PX at zero distance. Same rAF-lerp smoothing factor as the
// hero's cursor-trailing dither blob (DitherFog). Starting point, tuned in Task 7.
const MAGNET_RADIUS_PX = 140;
const MAGNET_MAX_OFFSET_PX = 10;
const MAGNET_LERP = 0.12;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function LandingFooter() {
  const rootRef = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLParagraphElement>(null);
  const legalRef = useRef<HTMLParagraphElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const reduced = useReducedMotion();

  // Scroll parallax (unchanged from Task 5).
  useEffect(() => {
    const root = rootRef.current;
    const wordmark = wordmarkRef.current;
    const legal = legalRef.current;
    if (!root || !wordmark || !legal) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.set(wordmark, { y: WORDMARK_TRAVEL_PX });
      gsap.set(legal, { y: LEGAL_TRAVEL_PX });
      gsap
        .timeline({
          scrollTrigger: { trigger: root, start: "top 90%", end: "top 40%", scrub: true },
        })
        .to(wordmark, { y: 0, ease: "none" }, 0)
        .to(legal, { y: 0, ease: "none" }, 0);
    });
    return () => mm.revert();
  }, []);

  // Cursor-magnet letters: only tracks the pointer while the footer is in the viewport,
  // and under reduced motion does nothing at all -- no listener, no rAF loop, not just
  // visually inert.
  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;
    if (!root) return;

    let active = false;
    // Index-aligned with letterRefs.current/targets/pos (NOT built by pushing only the
    // non-null refs -- a skipped index there would desync every array's indexing from
    // this point on). A ref that's momentarily null measures as far off-screen, which
    // magnetOffset naturally resolves to a zero offset (outside any real radius).
    const centers: Point[] = LETTERS.map(() => ({ x: -9999, y: -9999 }));
    const targets: Point[] = LETTERS.map(() => ({ x: 0, y: 0 }));
    const pos: Point[] = LETTERS.map(() => ({ x: 0, y: 0 }));

    const measure = () => {
      letterRefs.current.forEach((el, i) => {
        if (!el) {
          centers[i] = { x: -9999, y: -9999 };
          return;
        }
        const r = el.getBoundingClientRect();
        centers[i] = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        active = entry.isIntersecting;
        // Re-measure whenever the footer enters view: the parallax's own transform may
        // have shifted letter positions since the last measurement (e.g. first mount, or
        // scroll-in still mid-scrub), so a stale center would nudge letters in a slightly
        // wrong direction until the next measure.
        if (active) measure();
      },
      { rootMargin: "100px" },
    );
    io.observe(root);
    measure();
    window.addEventListener("resize", measure);

    const onMove = (e: PointerEvent) => {
      if (!active) return;
      const pointer = { x: e.clientX, y: e.clientY };
      centers.forEach((c, i) => {
        targets[i] = magnetOffset(c, pointer, {
          radius: MAGNET_RADIUS_PX,
          maxOffset: MAGNET_MAX_OFFSET_PX,
        });
      });
    };
    const onLeave = () => {
      targets.forEach((t) => {
        t.x = 0;
        t.y = 0;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const tick = () => {
      pos.forEach((p, i) => {
        p.x = lerp(p.x, targets[i]?.x ?? 0, MAGNET_LERP);
        p.y = lerp(p.y, targets[i]?.y ?? 0, MAGNET_LERP);
        const el = letterRefs.current[i];
        if (el) el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-[40vh] w-full flex-col justify-center gap-6 overflow-hidden border-t border-ink/10 px-6 py-16 sm:px-8"
    >
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
        <p
          ref={wordmarkRef}
          aria-label="Sector 4"
          className="font-bebas leading-none tracking-wide text-ink"
          style={{ fontSize: "clamp(4rem, 18vw, 16rem)" }}
        >
          {LETTERS.map((ch, i) => (
            <span
              key={i}
              ref={(el) => {
                letterRefs.current[i] = el;
              }}
              className="inline-block will-change-transform"
            >
              {ch}
            </span>
          ))}
        </p>
        <p ref={legalRef} className="max-w-3xl font-grotesk text-xs leading-snug text-muted/80">
          {DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean)

- [ ] **Step 3: Build and manually verify**

Run: `npm run build`
Expected: clean build.

Start the dev server, visit `/`, scroll to the footer, move the cursor near/across the
`SECTOR4` letters. Confirm individual letters nudge subtly toward the cursor and settle
back when it moves away. Then enable reduced-motion emulation and reload: confirm letters
do not move at all when the cursor passes over them.

- [ ] **Step 4: Commit**

```bash
git add app/components/LandingFooter.tsx
git commit -m "feat: cursor-magnet microinteraction on the landing footer wordmark"
```

---

### Task 7: Visual QA pass — tune constants, owner sign-off

**Files:**
- Modify: `app/components/LandingFooter.tsx` (constants only: `WORDMARK_TRAVEL_PX`,
  `LEGAL_TRAVEL_PX`, `MAGNET_RADIUS_PX`, `MAGNET_MAX_OFFSET_PX`, the `clamp()` bounds in the
  wordmark's inline `fontSize` style)

**Interfaces:** none new — this task only retunes existing constants from Tasks 4-6.

This task is a judgment call, not mechanical work — per house feedback on this project,
visual/aesthetic changes need real rendered candidates shown before committing, not
committed then iterated blind.

- [ ] **Step 1: Start the dev server and render the current state**

Run: `npm run dev` (background), then use Chrome DevTools (or equivalent) to screenshot
`/` scrolled to the footer at:
- Desktop width (~1440px or the project's usual check width)
- Mobile width (~375-390px)
- Mid-scroll (partial parallax) and fully-settled (post-scroll) states
- A screenshot with the cursor positioned near/on a few different letters

- [ ] **Step 2: Present the renders and iterate**

Show the screenshots (and describe the live scroll/hover feel, since screenshots can't
fully capture motion) to the user. Ask specifically about: the wordmark size (does it
genuinely span "majority of width" at both checked breakpoints, or does the `clamp()` need
wider bounds?), the parallax travel distances (too subtle / too much?), and the magnet
radius and strength (too subtle / too aggressive / right?). Adjust the five constants in
`app/components/LandingFooter.tsx` based on feedback, re-render, repeat until approved. Do
not proceed to Step 3 without explicit approval.

- [ ] **Step 3: Final full-suite verification**

Run: `npx vitest run`
Expected: all tests pass (existing suite + Task 1's 2 new tests + Task 3's 9 new tests).

Run: `npx tsc --noEmit`
Expected: no output (clean)

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add app/components/LandingFooter.tsx
git commit -m "style: tune landing footer parallax and cursor-magnet feel"
```

If Step 2 required no changes from the Task 6 defaults, skip this commit (nothing to
commit) and note that in the final report instead.
