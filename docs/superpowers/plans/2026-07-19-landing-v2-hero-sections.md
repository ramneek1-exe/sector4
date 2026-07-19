# Landing v2 (hero + sector sections) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/` into a type-led hero over the real dithered b-roll plus four sector-numbered sections (S1 Ask, S2 Learn, S3 Weekend, S4 Honest payoff), with Lenis smooth scroll + GSAP ScrollTrigger/DrawSVG motion, all reduced-motion gated.

**Architecture:** Spec: `docs/superpowers/specs/2026-07-19-landing-v2-hero-sections-design.md`. Server page (`app/page.tsx`) keeps all content; motion lives in three small client components (`SmoothScroll` side-effect mount in layout, `SectionReveal` wrapper, `SectorDivider` SVG) that import GSAP through one client-only registration module. No value ever flows from a "use client" module into a server component (PR #37 lesson — nav constants stay in `app/lib/nav.ts`).

**Tech Stack:** Next.js 14 App Router, gsap ^3.15 (ScrollTrigger + DrawSVGPlugin now in the public npm package), lenis ^1.3, Tailwind, vitest (pure-function tests only — no jsdom/RTL in this repo).

## Global Constraints

- **Never import values from a "use client" module into a server component** (client-reference crash; build passes, request 500s). Smoke with `next start` + curl, not just `npm run build`.
- **Commits:** conventional style, one logical change each, **no AI attribution of any kind** (no Co-Authored-By, no "Generated with").
- **No em-dashes in UI copy.** Bands-not-percentages framing; no invented facts.
- **Reduced motion:** every tween inside `gsap.matchMedia("(prefers-reduced-motion: no-preference)")`; initial hidden states set via `gsap.set` inside that context (NEVER CSS `opacity-0`), so no-JS and reduced-motion users see full content.
- **No new WebGL mounts** (context cap ~16); GSAP/SVG only for section motion.
- **Locked copy:** hero thesis "A lap has three sectors. This is the one where you find out why."; S1 heading "Formula 1, minus the false confidence."
- Section order: S1 Ask, S2 Learn, S3 This weekend, S4 Honest by design.
- `public/hero.mp4` already committed (0.85MB); DitherVideo fog fallback path must keep working.
- Decorative numerals/dividers `aria-hidden`.

---

### Task 1: Motion foundation (deps, gsap module, SmoothScroll in layout)

**Files:**
- Modify: `package.json` (via npm install)
- Create: `app/lib/gsap.ts`
- Create: `app/lib/motion.ts`
- Test: `app/lib/motion.test.ts`
- Create: `app/components/SmoothScroll.tsx`
- Modify: `app/layout.tsx:44-49`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `app/lib/gsap.ts` exporting `{ gsap, ScrollTrigger }` (plugins registered: ScrollTrigger, DrawSVGPlugin) for ALL later client components; `app/components/SmoothScroll.tsx` default-less named export `SmoothScroll` (renders null); `app/lib/motion.ts` exporting `shouldInitSmoothScroll(prefersReducedMotion: boolean): boolean` and `tickerTimeToMs(timeSeconds: number): number`.

- [ ] **Step 1: Install deps**

```bash
npm install gsap@^3.15.0 lenis@^1.3.25
```

Expected: package.json gsap bumped to ^3.15.0, lenis added. (`@gsap/react` stays as-is.)

- [ ] **Step 2: Write the failing test**

Create `app/lib/motion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldInitSmoothScroll, tickerTimeToMs } from "./motion";

describe("shouldInitSmoothScroll", () => {
  it("disables smooth scroll under prefers-reduced-motion", () => {
    expect(shouldInitSmoothScroll(true)).toBe(false);
  });
  it("enables smooth scroll otherwise", () => {
    expect(shouldInitSmoothScroll(false)).toBe(true);
  });
});

describe("tickerTimeToMs", () => {
  it("converts gsap ticker seconds to the ms lenis.raf expects", () => {
    expect(tickerTimeToMs(1.5)).toBe(1500);
    expect(tickerTimeToMs(0)).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/lib/motion.test.ts`
Expected: FAIL (module `./motion` not found).

- [ ] **Step 4: Implement `app/lib/motion.ts`** (pure, server-safe: no window/gsap imports)

```ts
// Pure decision helpers for the site-wide smooth-scroll setup. Kept out of the client
// components so the reduced-motion gate and the gsap-ticker unit conversion (seconds ->
// the milliseconds lenis.raf expects) are unit-testable.
export function shouldInitSmoothScroll(prefersReducedMotion: boolean): boolean {
  return !prefersReducedMotion;
}

export function tickerTimeToMs(timeSeconds: number): number {
  return timeSeconds * 1000;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/lib/motion.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Create `app/lib/gsap.ts`** (single registration point; ONLY client components may import it)

```ts
"use client";

// The one place GSAP plugins get registered. Client-only: importing this from a server
// component would turn its exports into client references (see the nav-constants lesson),
// so only "use client" components may import from here.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

export { gsap, ScrollTrigger };
```

- [ ] **Step 7: Create `app/components/SmoothScroll.tsx`**

```tsx
"use client";

// Site-wide Lenis smooth scroll, synced to ScrollTrigger. Mounted once in the root
// layout as a null-rendering sibling (it drives window scroll; it does not wrap
// children, which keeps the server layout free of client wrappers). Skipped entirely
// under prefers-reduced-motion, including live media-query changes.
import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/app/lib/gsap";
import { shouldInitSmoothScroll, tickerTimeToMs } from "@/app/lib/motion";

export function SmoothScroll() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lenis: Lenis | null = null;
    let onTick: ((time: number) => void) | null = null;

    const start = () => {
      if (lenis) return;
      lenis = new Lenis({ autoRaf: false });
      lenis.on("scroll", ScrollTrigger.update);
      onTick = (time: number) => lenis?.raf(tickerTimeToMs(time));
      gsap.ticker.add(onTick);
      gsap.ticker.lagSmoothing(0);
    };
    const stop = () => {
      if (onTick) gsap.ticker.remove(onTick);
      onTick = null;
      lenis?.destroy();
      lenis = null;
    };

    const sync = () => (shouldInitSmoothScroll(mq.matches) ? start() : stop());
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      stop();
    };
  }, []);

  return null;
}
```

- [ ] **Step 8: Mount in `app/layout.tsx`**

Add import and mount as a sibling BEFORE `<SiteNav />` (renders null; children stay untouched server content):

```tsx
import { SmoothScroll } from "@/app/components/SmoothScroll";
```

and in the body:

```tsx
      <body className="flex min-h-screen flex-col overflow-x-hidden bg-bg text-ink antialiased font-lastik pt-[68px]">
        <SmoothScroll />
        {/* Persistent single-row nav ... (existing comment) */}
        <SiteNav />
        {children}
```

- [ ] **Step 9: Verify build + smoke**

```bash
npx tsc --noEmit && npm run build
npm run start &   # then:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/       # expect 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/ask   # expect 200
```

Expected: tsc + build clean; both routes 200 (server smoke guards the client-module rule).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json app/lib/gsap.ts app/lib/motion.ts app/lib/motion.test.ts app/components/SmoothScroll.tsx app/layout.tsx
git commit -m "feat: site-wide Lenis smooth scroll synced to ScrollTrigger, reduced-motion gated"
```

---

### Task 2: Hero rework (type-led thesis, light recipe, reveal-ready DOM)

**Files:**
- Modify: `app/page.tsx:74-130` (the `Hero` function only)

**Interfaces:**
- Consumes: existing `DitherVideo`, `DitherFog` components (unchanged).
- Produces: hero DOM with stable `data-hero` attributes (`"video" | "thesis" | "cta" | "cue"`) that the later preloader pass will target. No exports.

- [ ] **Step 1: Rewrite the `Hero` function in `app/page.tsx`**

Replace the whole `Hero()` function (keep the section element's structure and the `.legible` scrim class) with:

```tsx
/** Type-led dramatic open: the thesis IS the hero (no wordmark; the nav carries the
 *  brand). Dithered b-roll runs full-bleed behind it in the light site recipe; DitherFog
 *  remains the no-src/error fallback. `data-hero` attributes are the stable hooks the
 *  future preloader/reveal pass will target; keep them on these four layers. */
function Hero() {
  return (
    <section
      className="relative flex w-full items-center justify-center overflow-hidden"
      style={{ minHeight: `calc(100vh - ${NAV_H}px)` }}
    >
      <DitherVideo
        data-hero="video"
        src="/hero.mp4"
        colorBack="#fafafa"
        colorFront="#406cd6"
        cols={240}
        className="absolute inset-0 h-full w-full"
      >
        <DitherFog className="h-full w-full" />
      </DitherVideo>

      <div
        data-hero="thesis"
        className="legible relative z-10 flex flex-col items-center gap-7 px-10 py-14 text-center sm:px-16 sm:py-20"
      >
        <h1 className="fog-in max-w-4xl font-pixel-serif text-4xl leading-tight text-ink sm:text-6xl md:text-7xl">
          A lap has three sectors.
          <br />
          This is the one where you find out why.
        </h1>
        <Link
          data-hero="cta"
          href="/ask"
          style={{ animationDelay: "0.18s" }}
          className="fog-in mt-2 inline-flex h-12 items-center justify-center rounded-full bg-accent px-8 font-grotesk text-lg font-medium text-white shadow-sm transition duration-200 hover:-translate-y-px hover:bg-accent-bright motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Ask your first question
        </Link>
      </div>

      <div
        data-hero="cue"
        aria-hidden
        style={{ animationDelay: "0.36s" }}
        className="fog-in legible absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full p-3"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-bounce text-ink/60 motion-reduce:animate-none"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
    </section>
  );
}
```

`DitherVideo`'s props are a closed interface, so TypeScript rejects the `data-hero`
attribute; extend `DitherVideoProps` in `app/components/DitherVideo.tsx` with
`"data-hero"?: string` and put it on the root div:

```tsx
interface DitherVideoProps {
  src?: string;
  poster?: string;
  colorBack: string;
  colorFront: string;
  cols?: number;
  matrix?: Matrix;
  className?: string;
  children?: React.ReactNode;
  "data-hero"?: string;
}
```

and on the root element: `<div ref={rootRef} aria-hidden="true" data-hero={props["data-hero"]} ...>` (destructure as `...rest` or read the prop explicitly).

- [ ] **Step 2: Verify build + visual smoke**

```bash
npx tsc --noEmit && npm run build
npm run start &
curl -s http://localhost:3000/ | grep -c "A lap has three sectors"   # expect >= 1
curl -s http://localhost:3000/ | grep -c "SECTOR4"                    # expect 1 (footer only, no hero wordmark)
```

Expected: tsc/build clean; thesis present; wordmark count drops to the footer instance only (nav renders its own).

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/components/DitherVideo.tsx
git commit -m "feat: type-led hero, no wordmark, light dither recipe over real b-roll"
```

---

### Task 3: SectionReveal + SectorDivider client components

**Files:**
- Create: `app/components/SectionReveal.tsx`
- Create: `app/components/SectorDivider.tsx`

**Interfaces:**
- Consumes: `{ gsap, ScrollTrigger }` from `app/lib/gsap.ts` (Task 1).
- Produces: `SectionReveal({ children, className? })` client wrapper that staggers any descendant carrying `data-reveal` into view once; `SectorDivider({ className? })` full-width timing-line SVG that draws in on scroll. Both safe to render from server components (children passed as props).

- [ ] **Step 1: Create `app/components/SectionReveal.tsx`**

```tsx
"use client";

// Scroll-triggered entrance for a landing section. Server sections wrap their content in
// this and tag elements with `data-reveal`; on scroll into view those elements stagger
// in ONCE. Hidden states are set via gsap.set INSIDE the matchMedia context (never CSS),
// so reduced-motion and no-JS users always see full content.
import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "@/app/lib/gsap";

export function SectionReveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const targets = el.querySelectorAll("[data-reveal]");
      if (!targets.length) return;
      gsap.set(targets, { autoAlpha: 0, y: 24 });
      gsap.timeline({
        scrollTrigger: { trigger: el, start: "top 78%", once: true },
      }).to(targets, {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.12,
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/components/SectorDivider.tsx`**

```tsx
"use client";

// Timing-line motif between landing sections: a thin baseline with three sector ticks
// (a lap's S1/S2/S3 splits), DrawSVG-drawn on scroll. Decorative only (aria-hidden);
// under reduced motion the line simply renders complete.
import { useEffect, useRef } from "react";
import { gsap } from "@/app/lib/gsap";

export function SectorDivider({ className = "" }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const strokes = svg.querySelectorAll("line");
      gsap.set(strokes, { drawSVG: "0%" });
      gsap.to(strokes, {
        drawSVG: "100%",
        duration: 1.1,
        ease: "power2.inOut",
        stagger: 0.08,
        scrollTrigger: { trigger: svg, start: "top 85%", once: true },
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <svg
      ref={ref}
      aria-hidden
      viewBox="0 0 1200 24"
      preserveAspectRatio="none"
      className={`mx-auto block h-6 w-full max-w-5xl px-6 text-ink/20 ${className}`}
    >
      <line x1="0" y1="12" x2="1200" y2="12" stroke="currentColor" strokeWidth="1" />
      <line x1="300" y1="5" x2="300" y2="19" stroke="currentColor" strokeWidth="1" />
      <line x1="600" y1="5" x2="600" y2="19" stroke="currentColor" strokeWidth="1" />
      <line x1="900" y1="5" x2="900" y2="19" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean (components not yet mounted; Task 4 wires them).

- [ ] **Step 4: Commit**

```bash
git add app/components/SectionReveal.tsx app/components/SectorDivider.tsx
git commit -m "feat: SectionReveal scroll entrance and DrawSVG SectorDivider timing line"
```

---

### Task 4: Sector-numbered sections (reorder, copy, numerals, wiring)

**Files:**
- Modify: `app/page.tsx` (LandingPage order + the four section functions; `LandingFooter` untouched)

**Interfaces:**
- Consumes: `SectionReveal`, `SectorDivider` (Task 3).
- Produces: the S1→S4 section order in the rendered document (guarded by the ordered
  smoke check in Step 2 — the order is a locked product decision: S4 Honest is the payoff).

- [ ] **Step 1: Rewrite the sections in `app/page.tsx`**

1a. Add imports:

```tsx
import { SectionReveal } from "@/app/components/SectionReveal";
import { SectorDivider } from "@/app/components/SectorDivider";
```

1b. Reorder `LandingPage`'s return (hero, then S1..S4 with dividers between, footer last):

```tsx
  return (
    <>
      <Hero />
      <AskAnything />
      <SectorDivider />
      <LearnTheSport />
      <SectorDivider />
      <ThisWeekend />
      <SectorDivider />
      <HonestByDesign liveScored={liveScored} />
      <LandingFooter />
    </>
  );
```

1c. Add the numeral helper (server-side, plain markup) near the section helpers:

```tsx
/** Oversized faded timing-sheet numeral ("S1".."S4"). Decorative; alternates side per
 *  section via the caller's positioning classes. */
function SectorNumeral({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      data-reveal
      className={`pointer-events-none select-none font-grotesk text-[7rem] font-bold leading-none tracking-tight text-ink/[0.06] sm:text-[10rem] ${className}`}
    >
      S{n}
    </span>
  );
}
```

1d. Replace the four section functions (LandingFooter stays as-is). Copy below is final
draft; the S1 heading and section order are LOCKED, the rest is owner-vetoable on preview.
Note the borders/backgrounds change: sections drop their `border-t` (the SectorDivider now
carries the rhythm); S4 keeps its tinted band.

```tsx
function AskAnything() {
  return (
    <section className="relative mx-auto w-full max-w-3xl px-6 py-20 sm:px-8 sm:py-28">
      <SectionReveal>
        <div className="absolute -top-6 right-0 sm:-top-10">
          <SectorNumeral n={1} />
        </div>
        <p data-reveal className={SECTION_LABEL}>
          Sector 1 · Ask anything
        </p>
        <h2 data-reveal className={SECTION_HEADING}>
          Formula 1, minus the false confidence.
        </h2>
        <p data-reveal className={SECTION_BODY}>
          Podium odds, pit stops, tyre wear, the basics. Ask in plain English and get a
          straight answer that says what the data shows, and what it can&apos;t.
        </p>
        <div data-reveal className="mt-8 flex flex-wrap gap-3">
          {EXAMPLE_QUERIES.map((q) => (
            <Link
              key={q}
              href={`/ask?q=${encodeURIComponent(q)}`}
              className="rounded-2xl border border-ink/10 bg-white/90 px-4 py-2.5 font-grotesk text-sm text-ink/80 shadow-sm transition hover:border-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              {q}
            </Link>
          ))}
        </div>
      </SectionReveal>
    </section>
  );
}

function LearnTheSport() {
  return (
    <section className="relative mx-auto w-full max-w-3xl px-6 py-20 sm:px-8 sm:py-28">
      <SectionReveal className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="absolute -top-6 left-0 sm:-top-10">
          <SectorNumeral n={2} />
        </div>
        <div data-reveal>
          <AsciiEmblem kind="tyre" size={64} className="shrink-0" />
        </div>
        <div>
          <p data-reveal className={SECTION_LABEL}>
            Sector 2 · Learn the sport
          </p>
          <h2 data-reveal className={SECTION_HEADING}>
            Every answer teaches you something.
          </h2>
          <p data-reveal className={SECTION_BODY}>
            Predictions link straight to the concepts behind them: what tyre degradation
            is, why undercuts work, what a stop-count call actually means. Follow a
            thread and the sport starts making sense.
          </p>
          <Link data-reveal href="/learn" className={SECTION_LINK}>
            Start learning →
          </Link>
        </div>
      </SectionReveal>
    </section>
  );
}

function ThisWeekend() {
  const dateLabel = formatRaceDate(schedule.final);
  return (
    <section className="relative mx-auto w-full max-w-3xl px-6 py-20 sm:px-8 sm:py-28">
      <SectionReveal className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="absolute -top-6 right-0 sm:-top-10">
          <SectorNumeral n={3} />
        </div>
        <div data-reveal>
          <AsciiEmblem kind="car" size={64} className="shrink-0" />
        </div>
        <div>
          <p data-reveal className={SECTION_LABEL}>
            Sector 3 · This weekend
          </p>
          <h2 data-reveal className={SECTION_HEADING}>
            {gpLabel(schedule.gp)} Grand Prix
          </h2>
          <p data-reveal className={SECTION_BODY}>
            Race day is {dateLabel}. Calls go up Friday and sharpen through qualifying,
            and we say so while the picture is still fuzzy.
          </p>
          <Link data-reveal href="/weekend" className={SECTION_LINK}>
            See this weekend →
          </Link>
        </div>
      </SectionReveal>
    </section>
  );
}

function HonestByDesign({ liveScored }: { liveScored: number }) {
  return (
    <section className="relative bg-ink/[0.02]">
      <SectionReveal className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-20 sm:flex-row sm:items-start sm:px-8 sm:py-28">
        <div className="absolute -top-6 left-0 sm:-top-10">
          <SectorNumeral n={4} />
        </div>
        <div data-reveal>
          <AsciiEmblem kind="flag" size={64} className="shrink-0" />
        </div>
        <div>
          <p data-reveal className={SECTION_LABEL}>
            Sector 4 · Honest by design
          </p>
          <h2 data-reveal className={SECTION_HEADING}>
            The fourth sector is the truth.
          </h2>
          <p data-reveal className={SECTION_BODY}>
            We show bands, not fake precision. Early season, podium odds are qualitative:
            a shot, an outside shot, unlikely. Every call gets scored against the real
            finish, and the record is public, good or bad.
          </p>
          {liveScored > 0 && (
            <p data-reveal className="mt-3 font-grotesk text-sm text-muted">
              {liveScored} {liveScored === 1 ? "race" : "races"} scored live so far.
            </p>
          )}
          <Link data-reveal href="/accuracy" className={SECTION_LINK}>
            See the record →
          </Link>
        </div>
      </SectionReveal>
    </section>
  );
}
```

(SectorNumeral sits inside SectionReveal's wrapper div, which is `relative` only when the
caller's section is; the section elements above carry `relative`, and the numeral's
absolute wrapper positions against them. `overflow` stays visible so the numeral may
crest above the section edge.)

- [ ] **Step 2: Full verify (ordered smoke guards the S1→S4 product decision)**

```bash
npm test          # all vitest including the new motion tests
npx tsc --noEmit && npm run build
npm run start &
curl -s http://localhost:3000/ | grep -o "Sector [1-4] ·"                  # expect EXACTLY, IN ORDER: Sector 1 · / Sector 2 · / Sector 3 · / Sector 4 ·
curl -s http://localhost:3000/ | grep -c "The fourth sector is the truth"  # expect 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/ask         # expect 200
```

Expected: tests green, build clean, the four sector labels print in 1,2,3,4 document
order (grep -o preserves it), S4 heading present, /ask 200.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: sector-numbered landing sections, S4 honesty payoff, scroll entrances"
```

---

### Task 5: Whole-branch verification + push

**Files:**
- None created; verification + push only.

**Interfaces:**
- Consumes: everything above.
- Produces: PR #37 updated with the v2 landing.

- [ ] **Step 1: Full test suite + build**

```bash
npm test && npx tsc --noEmit && npm run build
```

Expected: all vitest green (existing suite + `app/lib/motion.test.ts`), tsc + build clean.

- [ ] **Step 2: next start smoke (server-route guard)**

```bash
npm run start &
for p in / /ask /learn /accuracy /weekend; do curl -s -o /dev/null -w "$p %{http_code}\n" "http://localhost:3000$p"; done
```

Expected: all 200 (smooth-scroll provider mounts on every route; this guards the layout change).

- [ ] **Step 3: Push to the PR branch**

```bash
git push origin landing-page
```

Expected: PR #37 preview redeploys; owner eyeballs hero (real b-roll, light recipe), smooth scroll feel, section entrances, divider draws, and reduced-motion behavior (OS setting: everything visible, no smoothing, video frozen frame).

- [ ] **Step 4: Report for owner eyeball**

Note in the report: palette `#fafafa`/`#406cd6` is the starting recipe; tune against the real footage in `/lab/dither` section E and adjust the two constants in `Hero` if the owner wants a different read.
