# Landing Preloader — Start-Lights Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A once-per-session F1 start-lights preloader on the landing page (`/`) that arms five dither/pixel dots, holds a random suspense beat gated on hero readiness, then extinguishes to release the hero's existing reveal.

**Architecture:** Pure timing + pixel-disc math in `app/lib/start-lights.ts` (node-tested). A client island `app/components/StartLights.tsx` overlays the hero (`fixed inset-0 z-50`), drives the state machine, and renders the dots via the existing `thresholdCells` + `useRevealCanvas` 2D-canvas vocabulary. An inline no-flash gate script in `app/page.tsx` sets `data-preloader-active` on `<html>` before the hero paints, which CSS uses to pause the hero's `fog-in`; the island removes it at "lights out" to release. No-JS / reduced-motion / repeat visits skip the overlay entirely and reveal the hero with zero added delay.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, vitest (`node` env), existing `app/lib/bayer.ts` (`thresholdCells`) + `app/lib/use-reveal-canvas.ts` (`useRevealCanvas`).

## Global Constraints

- Frontend-only. NO API / Python / data / cron / `vercel.json` change.
- Landing `/` only. No site-wide preloader; in-app navigation unaffected.
- Abstract dots ONLY — no FOM light gantry, no F1/FIA/FOM marks, no team liveries (PRD §8).
- Dither/pixel dots via **hard-threshold** `thresholdCells` on a **2D canvas** — never a WebGL/shader per dot (the ~16-context cap lesson); hard-threshold, not ordered-Bayer edge dither (`sector4_emblem_pixel_art_no_dither`).
- vitest env is `node` — tests are pure, no DOM/component render. Component verified via build + live eyeball.
- Reduced-motion / no-JS / repeat-visit: hero appears on load with ZERO added delay.
- Timing constants (single source in `start-lights.ts`): `LIGHT_COUNT=5`, `ARM_INTERVAL_MS=240`, `ARM_DONE_MS=1200`, `HOLD_MIN_MS=200`, `HOLD_MAX_MS=800`, `HARD_CAP_MS=2500`, `OUT_MS=300`.
- Session flag key: `s4-preloaded` (must match verbatim between the inline gate script and the component).
- Commits: conventional-style, one logical change; NO Claude/AI attribution of any kind.
- Verify prod builds per repo ops rule: `rm -rf .next && npm run build` (never verify a prod build after `npm run dev`).

## File Structure

- `app/lib/start-lights.ts` (new) — pure timing math + `discCells` pixel-disc generator. One responsibility: the preloader's deterministic math, no React/DOM.
- `app/lib/start-lights.test.ts` (new) — vitest for the pure module.
- `app/components/StartLights.tsx` (new) — client island: state machine + dither-dot overlay. Consumes `start-lights.ts`, `bayer.ts`, `use-reveal-canvas.ts`.
- `app/globals.css` (modify) — hero `fog-in` pause gate under `[data-preloader-active]` + overlay dissolve keyframe.
- `app/page.tsx` (modify) — inline no-flash gate script + mount `<StartLights/>`. Hero markup otherwise untouched (`data-hero` hooks already present).

---

### Task 1: Pure timing + pixel-disc module

**Files:**
- Create: `app/lib/start-lights.ts`
- Test: `app/lib/start-lights.test.ts`

**Interfaces:**
- Consumes: `thresholdCells`, `BayerCell` from `@/app/lib/bayer`.
- Produces:
  - `LIGHT_COUNT`, `ARM_INTERVAL_MS`, `ARM_DONE_MS`, `HOLD_MIN_MS`, `HOLD_MAX_MS`, `HARD_CAP_MS`, `OUT_MS` (numbers)
  - `armSchedule(): number[]`
  - `pickHold(rand?: () => number): number`
  - `resolveLightsOut(args: { hold: number; heroReadyAt: number | null }): number`
  - `discCells(cols: number, color: { r: number; g: number; b: number }, cutoff?: number): BayerCell[]`

- [ ] **Step 1: Write the failing test**

Create `app/lib/start-lights.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ARM_DONE_MS,
  ARM_INTERVAL_MS,
  HARD_CAP_MS,
  HOLD_MAX_MS,
  HOLD_MIN_MS,
  LIGHT_COUNT,
  armSchedule,
  discCells,
  pickHold,
  resolveLightsOut,
} from "@/app/lib/start-lights";

describe("armSchedule", () => {
  it("is one timestamp per light, evenly spaced from 0", () => {
    expect(armSchedule()).toEqual([0, 240, 480, 720, 960]);
  });
  it("keeps ARM_DONE_MS derived from count * interval", () => {
    expect(ARM_DONE_MS).toBe(LIGHT_COUNT * ARM_INTERVAL_MS);
  });
});

describe("pickHold", () => {
  it("hits the floor when rand is 0", () => {
    expect(pickHold(() => 0)).toBe(HOLD_MIN_MS);
  });
  it("hits the ceiling when rand is 1", () => {
    expect(pickHold(() => 1)).toBe(HOLD_MAX_MS);
  });
  it("stays within bounds", () => {
    const h = pickHold(() => 0.5);
    expect(h).toBeGreaterThanOrEqual(HOLD_MIN_MS);
    expect(h).toBeLessThanOrEqual(HOLD_MAX_MS);
  });
});

describe("resolveLightsOut", () => {
  it("uses arm+hold when the hero is ready early", () => {
    expect(resolveLightsOut({ hold: 200, heroReadyAt: 500 })).toBe(1400);
  });
  it("waits for a late hero-ready (still under the cap)", () => {
    expect(resolveLightsOut({ hold: 200, heroReadyAt: 2000 })).toBe(2000);
  });
  it("falls back to the hard cap when the hero never signals", () => {
    expect(resolveLightsOut({ hold: 800, heroReadyAt: null })).toBe(HARD_CAP_MS);
  });
  it("clamps anything past the cap", () => {
    expect(resolveLightsOut({ hold: 800, heroReadyAt: 9999 })).toBe(HARD_CAP_MS);
  });
});

describe("discCells", () => {
  const RED = { r: 216, g: 58, b: 52 };
  it("produces a non-empty pixel disc", () => {
    expect(discCells(12, RED).length).toBeGreaterThan(0);
  });
  it("is a circle, not a square (center present, corner absent)", () => {
    const cells = discCells(12, RED);
    const has = (x: number, y: number) => cells.some((c) => c.x === x && c.y === y);
    expect(has(6, 6)).toBe(true); // near center
    expect(has(0, 0)).toBe(false); // corner outside the circle
  });
  it("is left-right symmetric in cell count", () => {
    const cols = 12;
    const cells = discCells(cols, RED);
    const left = cells.filter((c) => c.x < cols / 2).length;
    const right = cells.filter((c) => c.x >= cols / 2).length;
    expect(left).toBe(right);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/start-lights.test.ts`
Expected: FAIL — cannot resolve `@/app/lib/start-lights` (module not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `app/lib/start-lights.ts`:

```ts
// Pure math for the landing start-lights preloader (see
// docs/superpowers/specs/2026-07-24-landing-preloader-start-lights-design.md).
// No React, no DOM — single source for the sequence constants + the pixel-disc
// cell generator, so the component and its tests never drift.
import { thresholdCells, type BayerCell } from "@/app/lib/bayer";

export const LIGHT_COUNT = 5;
export const ARM_INTERVAL_MS = 240;
export const ARM_DONE_MS = LIGHT_COUNT * ARM_INTERVAL_MS; // 1200
export const HOLD_MIN_MS = 200;
export const HOLD_MAX_MS = 800;
export const HARD_CAP_MS = 2500;
export const OUT_MS = 300;

/** Illuminate timestamp (ms from t0) for each dot, left to right. */
export function armSchedule(): number[] {
  return Array.from({ length: LIGHT_COUNT }, (_, i) => i * ARM_INTERVAL_MS);
}

/** Random suspense hold in [HOLD_MIN_MS, HOLD_MAX_MS]. `rand` injected for tests. */
export function pickHold(rand: () => number = Math.random): number {
  return HOLD_MIN_MS + rand() * (HOLD_MAX_MS - HOLD_MIN_MS);
}

/**
 * Lights-out time (ms from t0): the later of the random suspense hold finishing
 * and the hero assets being ready, hard-capped so it never drags. A null
 * heroReadyAt (hero never signaled) collapses to the cap via max-with-Infinity.
 */
export function resolveLightsOut({
  hold,
  heroReadyAt,
}: {
  hold: number;
  heroReadyAt: number | null;
}): number {
  const ready = heroReadyAt ?? Infinity;
  const target = Math.max(ARM_DONE_MS + hold, ready);
  return Math.min(target, HARD_CAP_MS);
}

/**
 * Hard-threshold pixel-disc cells for one dot: a cols×cols RGBA coverage field
 * for a centered filled circle (distance-based AA edge), run through the shared
 * thresholdCells (app/lib/bayer.ts). Pure — builds the byte field directly, no
 * canvas — so it is node-testable; the component paints the result via
 * useRevealCanvas. Hard threshold (not ordered-Bayer edge dither), matching the
 * emblem pixel-art finding.
 */
export function discCells(
  cols: number,
  color: { r: number; g: number; b: number },
  cutoff = 0.5,
): BayerCell[] {
  const rows = cols;
  const data = new Uint8ClampedArray(cols * rows * 4);
  const center = (cols - 1) / 2;
  const radius = cols / 2;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const dist = Math.hypot(x - center, y - center);
      // coverage 1 well inside, ramps to 0 across the last half-cell at the edge.
      const coverage = Math.max(0, Math.min(1, radius - dist + 0.5));
      const i = (y * cols + x) * 4;
      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = Math.round(coverage * 255);
    }
  }
  return thresholdCells(data, cols, rows, cutoff);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/start-lights.test.ts`
Expected: PASS (all cases).

Note on symmetry: with `cols` even, `center = (cols-1)/2` is a half-integer, so the disc is mirror-symmetric across the vertical axis and the left/right counts match exactly. Keep dot `cols` even.

- [ ] **Step 5: Commit**

```bash
git add app/lib/start-lights.ts app/lib/start-lights.test.ts
git commit -m "feat: pure start-lights timing + pixel-disc cell generator"
```

---

### Task 2: Hero reveal pause gate + overlay dissolve (CSS)

**Files:**
- Modify: `app/globals.css` (append a new section near the other `@keyframes`/`fog-in` block)

**Interfaces:**
- Consumes: the existing `.fog-in` class already on the hero's `data-hero` layers.
- Produces: the `[data-preloader-active] .fog-in { animation-play-state: paused }` gate and the `preloaderDissolve` keyframe used by the component.

- [ ] **Step 1: Add the pause gate + dissolve keyframe**

Append to `app/globals.css` (after the `fog-in` block, ~line 32):

```css
/* --- Landing preloader: start-lights -------------------------------------
   While the preloader is arming/holding, hold the hero's own fog-in reveal so
   the thesis/CTA/cue don't animate in behind the overlay. The attribute is set
   pre-paint by an inline gate in page.tsx ONLY on a session's first landing
   visit with motion allowed; the StartLights island removes it at "lights out"
   to release. With no attribute (no-JS, reduced-motion, repeat visit) fog-in
   runs exactly as it does today — zero added delay. */
[data-preloader-active] .fog-in {
  animation-play-state: paused;
}

@keyframes preloaderDissolve {
  from { opacity: 1; }
  to { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  /* The overlay is JS-gated off under reduced-motion; keep the dissolve inert
     as defense-in-depth. */
  .start-lights-overlay {
    animation: none !important;
  }
}
```

- [ ] **Step 2: Verify the stylesheet still builds**

Run: `npx tsc --noEmit && rm -rf .next && npm run build`
Expected: build succeeds, no CSS errors. (No unit test — CSS is structural; correctness is verified live in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: hero fog-in pause gate + preloader dissolve keyframe"
```

---

### Task 3: StartLights client island

**Files:**
- Create: `app/components/StartLights.tsx`

**Interfaces:**
- Consumes: `LIGHT_COUNT`, `ARM_DONE_MS`, `HARD_CAP_MS`, `OUT_MS`, `armSchedule`, `pickHold`, `resolveLightsOut`, `discCells` from `@/app/lib/start-lights`; `useRevealCanvas` from `@/app/lib/use-reveal-canvas`; `BayerCell` from `@/app/lib/bayer`.
- Produces: `export function StartLights(): JSX.Element | null` — mounted once in `app/page.tsx`.

This task has no unit test (vitest is `node`-env, the component is DOM/canvas). It is verified by build here and live eyeball in Task 4.

- [ ] **Step 1: Write the component**

Create `app/components/StartLights.tsx`:

```tsx
"use client";

// Landing start-lights preloader (see the spec/plan dated 2026-07-24). Renders a
// full-bleed overlay of LIGHT_COUNT dither/pixel dots that arm left-to-right, hold
// a random suspense beat (gated on hero readiness, hard-capped), then extinguish
// and dissolve to release the hero's fog-in reveal.
//
// Only meaningful when the inline gate in page.tsx set [data-preloader-active] on
// <html> pre-paint (first landing visit this session, motion allowed). That same
// attribute is re-checked here, so the overlay renders nothing on repeat visits,
// reduced-motion, or no-JS-then-hydrate.
import { useEffect, useRef, useState } from "react";
import {
  ARM_DONE_MS,
  HARD_CAP_MS,
  LIGHT_COUNT,
  OUT_MS,
  armSchedule,
  discCells,
  pickHold,
  resolveLightsOut,
} from "@/app/lib/start-lights";
import { useRevealCanvas } from "@/app/lib/use-reveal-canvas";

// Keep in sync with the inline gate script in app/page.tsx.
const SESSION_KEY = "s4-preloaded";

// Visual constants — tuned live against rendered candidates during the visual pass.
const DOT_COLS = 12; // even → mirror-symmetric disc
const DOT_SIZE = 30; // css px per dot
const ARMED = { r: 216, g: 58, b: 52 }; // warm "ready" red (candidate default)
const OFF = { r: 208, g: 208, b: 208 }; // dim grey (candidate default)
const BACKDROP = "#fafafa"; // light field (candidate default)

type Phase = "idle" | "arming" | "out" | "done";

/** One dither pixel-disc, painted via the shared reveal-canvas (instant paint —
 *  the arm cadence is the reveal, so we don't want the per-dot 450ms resolve). */
function Dot({ armed }: { armed: boolean }) {
  const color = armed ? ARMED : OFF;
  const cells = discCells(DOT_COLS, color);
  const ref = useRevealCanvas({
    cells,
    grid: { cols: DOT_COLS, rows: DOT_COLS },
    size: DOT_SIZE,
    animate: false,
  });
  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ width: DOT_SIZE, height: DOT_SIZE, imageRendering: "pixelated" }}
    />
  );
}

export function StartLights() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lit, setLit] = useState(0); // how many dots have armed so far
  const started = useRef(false);
  const released = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const root = document.documentElement;
    // Trust the pre-paint gate as the single decision-maker (it already checked
    // sessionStorage + reduced-motion synchronously before the hero painted).
    if (!root.hasAttribute("data-preloader-active")) {
      setPhase("done");
      return;
    }

    setPhase("arming");
    const timers: number[] = [];
    const t0 = performance.now();

    // Arm dots left to right.
    armSchedule().forEach((t, i) => {
      timers.push(window.setTimeout(() => setLit(i + 1), t));
    });

    const release = () => {
      if (released.current) return;
      released.current = true;
      setPhase("out");
      root.removeAttribute("data-preloader-active"); // un-pause hero fog-in
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* private mode / disabled storage: still reveal, just replay next visit */
      }
      timers.push(window.setTimeout(() => setPhase("done"), OUT_MS));
    };

    // Hero readiness: watch the hero <video> canplay; null until it fires.
    let heroReadyAt: number | null = null;
    let scheduled = false;
    const video =
      document.querySelector<HTMLVideoElement>('[data-hero="video"] video') ??
      document.querySelector<HTMLVideoElement>("video");

    // releaseAt = max(arm+hold, heroReady) capped; schedule once readiness is known.
    const hold = pickHold();
    const trySchedule = () => {
      if (released.current || scheduled || heroReadyAt === null) return;
      scheduled = true;
      const outAt = resolveLightsOut({ hold, heroReadyAt });
      const wait = Math.max(0, outAt - (performance.now() - t0));
      timers.push(window.setTimeout(release, wait));
    };
    const markReady = () => {
      if (heroReadyAt === null) heroReadyAt = performance.now() - t0;
      trySchedule();
    };
    if (video) {
      if (video.readyState >= 3) markReady();
      else video.addEventListener("canplay", markReady, { once: true });
    }

    // Hard-cap backstop: fires release even if canplay never comes.
    timers.push(window.setTimeout(release, HARD_CAP_MS));

    return () => {
      timers.forEach(clearTimeout);
      if (video) video.removeEventListener("canplay", markReady);
    };
  }, []);

  if (phase === "idle" || phase === "done") return null;

  return (
    <div
      className="start-lights-overlay fixed inset-0 z-50 flex items-center justify-center"
      aria-hidden
      style={{
        background: BACKDROP,
        animation: phase === "out" ? `preloaderDissolve ${OUT_MS}ms ease forwards` : undefined,
      }}
    >
      <div className="flex gap-4">
        {Array.from({ length: LIGHT_COUNT }, (_, i) => (
          <Dot key={i} armed={phase === "arming" && i < lit} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types + build**

Run: `npx tsc --noEmit && rm -rf .next && npm run build`
Expected: PASS — no type errors, build succeeds. (`StartLights` not mounted yet → inert; safe partial state.)

- [ ] **Step 3: Commit**

```bash
git add app/components/StartLights.tsx
git commit -m "feat: StartLights dither-dot preloader island"
```

---

### Task 4: Wire into the landing page (activation) + verify

**Files:**
- Modify: `app/page.tsx` (add the inline no-flash gate script + mount `<StartLights/>`; hero markup untouched)

**Interfaces:**
- Consumes: `StartLights` from `@/app/components/StartLights`.
- Produces: the activated preloader on `/`.

- [ ] **Step 1: Import StartLights**

In `app/page.tsx`, add to the import block (near the other component imports, ~line 15):

```tsx
import { StartLights } from "@/app/components/StartLights";
```

- [ ] **Step 2: Add the inline gate script + mount the overlay**

In `app/page.tsx`, replace the opening of the returned fragment. Change:

```tsx
  return (
    <>
      <Hero />
```

to:

```tsx
  return (
    <>
      {/* No-flash preloader gate: runs during HTML parse, BEFORE the hero below
          paints, so pausing fog-in never flashes. Sets [data-preloader-active]
          only on this session's first landing visit with motion allowed; the
          StartLights island removes it at "lights out". Key string must match
          SESSION_KEY in StartLights.tsx. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "(function(){try{if(!sessionStorage.getItem('s4-preloaded')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.setAttribute('data-preloader-active','')}}catch(e){}})();",
        }}
      />
      <StartLights />
      <Hero />
```

- [ ] **Step 3: Verify types + prod build**

Run: `npx tsc --noEmit && rm -rf .next && npm run build`
Expected: PASS — no type errors, build succeeds, `/` still `force-dynamic`.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all green (existing suite + the new `start-lights` tests), no failures.

- [ ] **Step 5: Live eyeball (prod build, real hero assets)**

Serve the prod build and check on `/`:

```bash
rm -rf .next && npm run build && npm start
```

(If a previous server is up, kill by port: `lsof -ti tcp:3000 -sTCP:LISTEN | xargs kill`.)

Verify in a browser at `http://localhost:3000/`:
- First load: five pixel/dither dots arm left→right, hold, extinguish, overlay dissolves, hero `fog-in` reveals (thesis → CTA → cue). Total feels snappy (≤~2.5s).
- No flash of the hero thesis/CTA *behind* the overlay before it dissolves.
- Reload the same tab: hero appears instantly, NO preloader (session flag set).
- Open a fresh tab / new session (or clear `sessionStorage`): preloader plays again.
- Reduced-motion (override `window.matchMedia` via a navigate initScript per the repo ops note — reduced-motion can't be emulated directly): no overlay, hero instant, no delay.
- No hydration/console errors; no horizontal overflow at 1440 / 390.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: activate start-lights preloader on the landing page"
```

---

## Self-Review

**Spec coverage:**
- Concept (start-lights, abstract dither dots) → Tasks 1 (`discCells`) + 3 (`Dot`/overlay). ✓
- Once-per-session gate → inline script (Task 4) + `SESSION_KEY` in component (Task 3). ✓
- Snappy cadence + random hold + hard cap + hero-ready gate → `resolveLightsOut`/`pickHold`/`armSchedule` (Task 1) + scheduler (Task 3). ✓
- Reveal handoff (pause fog-in, release at lights-out) → CSS gate (Task 2) + `removeAttribute` (Task 3) + pre-paint inline gate (Task 4). ✓
- Reduced-motion / no-JS / SSR zero-delay → inline gate only sets attr when motion allowed; CSS default runs fog-in; overlay is client-only (Tasks 2/3/4). ✓
- Dither/pixel via hard-threshold 2D canvas, no per-dot WebGL → `discCells` + `useRevealCanvas` (Tasks 1/3). ✓
- Testing (pure only, node env) → Task 1 tests + Task 4 suite/build/eyeball. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. Visual constants (`ARMED`/`OFF`/`BACKDROP`/sizes) are concrete candidate defaults, explicitly flagged for the live visual pass — not placeholders.

**Type consistency:** `discCells(cols, {r,g,b}, cutoff?)`, `resolveLightsOut({hold, heroReadyAt})`, `pickHold(rand?)`, `armSchedule()` names/signatures match across Tasks 1/3. `useRevealCanvas` args (`cells`/`grid`/`size`/`animate`) match its real signature. `SESSION_KEY`/`s4-preloaded` string matches between inline script and component.

## Post-implementation (not part of TDD tasks)

- Visual candidate pass: show 2–4 rendered variants (dot color armed red vs accent, light vs dark backdrop, dot size/spacing/chunkiness) before finalizing — per `feedback_visual_changes_show_candidates`. Then whole-branch review, then PR.
- Also live-verify the deferred driver-helmet glyph eyeball if convenient (unrelated open item).
