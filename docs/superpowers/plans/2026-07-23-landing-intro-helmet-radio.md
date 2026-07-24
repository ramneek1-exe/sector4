# Landing Intro Section + Radio Helmet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "About Sector 4" intro section between the landing hero and the race-track spine, whose visual anchor is a large house helmet that rises on hover, casts a dithered drop shadow, and speaks a random F1 team-radio line word by word.

**Architecture:** Three copy-paste duplications are extracted first as behaviour-preserving refactors (`dither-recipe.ts`, `use-reduced-motion.ts`, `use-reveal-canvas.ts`), then the feature is built on top of them: a pure `race-radio.ts` message/timing library, a `HouseHelmet` render component, a `DitherShadow` bloom, a `RadioHelmet` interaction shell, and a server `AboutSector4()` section wired into `app/page.tsx`.

**Tech Stack:** Next.js 14 App Router, TypeScript, React 18, Tailwind 3.4, `@paper-design/shaders-react` (Dithering), GSAP 3.15 (existing `SectionReveal` only — no new GSAP), vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-landing-intro-helmet-radio-design.md`

## Global Constraints

- **Branch:** `landing-intro-radio-helmet` (already created; the spec commit `e771796` is on it).
- **Commits:** conventional style (`feat:`, `fix:`, `refactor:`, `docs:`), one logical change each. **No Claude/AI attribution** — no "Generated with", no `Co-Authored-By: Claude`, no robot emoji. Commit messages contain only the change description.
- **No em-dashes in user-facing copy.** Use a middot or a comma. (Standing project rule.)
- **The locked lab dither recipe must not be retuned.** Values move files; they do not change. Source: `docs/superpowers/plans/2026-07-18-dither-shader-swap.md`.
- **Tasks 1 and 2 are strictly behaviour-preserving.** No existing test may be edited. If a test needs changing, the refactor is wrong — rework it.
- **Reduced motion never hides content.** Under `prefers-reduced-motion: reduce` the full radio message is present in the DOM and visible.
- **PRD §8 identity rules:** no driver photos, faces, likenesses, team logos, F1/FOM/FIA marks, or liveries. The house helmet is an abstract shape in brand colours with no number.
- **Test environment is `node` and only matches `app/**/*.test.ts`** (see `vitest.config.ts`). Components and hooks are not unit-tested in this repo; only pure `app/lib/*.ts` modules are. Component correctness is verified in the browser.
- **Verification commands:**
  - `npm test` (vitest, currently 243 pass / 2 skip)
  - `npx tsc --noEmit`
  - `npm run build`
- **Local prod server gotcha:** `pkill -f "next start"` does NOT kill the server — it renames itself to `next-server`. Kill by PID: `kill $(lsof -ti tcp:3000 -sTCP:LISTEN)`, and confirm the listener changed before trusting any screenshot.

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `app/lib/dither-recipe.ts` | The one definition of the warp shader colours + layers. |
| `app/lib/use-reduced-motion.ts` | The one definition of the reduced-motion media-query hook. |
| `app/lib/use-reveal-canvas.ts` | The one definition of the DPR canvas sizing + cell paint + reveal loop. |
| `app/lib/race-radio.ts` | Radio messages, no-repeat picker, per-word timings. Pure. |
| `app/lib/race-radio.test.ts` | Unit tests for the above. |
| `app/components/HouseHelmet.tsx` | Brand-blue thresholded helmet field. No driver, number, or popover. |
| `app/components/DitherShadow.tsx` | Ellipse-masked warp bloom, mounted only while active. |
| `app/components/RadioHelmet.tsx` | Interaction shell: button, activation state machine, bubble, word stepper. |

**Modify**

| File | Change |
|---|---|
| `app/components/DitherFog.tsx` | Import the shared recipe + hook; delete local copies. |
| `app/components/CardFog.tsx` | Import the shared recipe + hook; delete local copies. |
| `app/components/AsciiGlyph.tsx` | Use `useRevealCanvas`; pass the numeral overlay. |
| `app/components/AsciiEmblem.tsx` | Use `useRevealCanvas`; no overlay. |
| `app/globals.css` | Lift + bubble transitions and the reduced-motion overrides. |
| `app/page.tsx` | Add `AboutSector4()`; render between `<Hero />` and the spine wrapper. |

---

### Task 1: Extract the shared dither recipe and reduced-motion hook

Both `DitherFog.tsx` and `CardFog.tsx` currently carry byte-identical copies of the warp layer recipe and of `useReducedMotion`. `DitherShadow` (Task 5) would be the third copy of each. This task creates one definition of each and points both existing components at it. **Nothing renders differently after this task.**

**Files:**
- Create: `app/lib/dither-recipe.ts`
- Create: `app/lib/use-reduced-motion.ts`
- Modify: `app/components/DitherFog.tsx`
- Modify: `app/components/CardFog.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `WHITE: string`, `BLUE: string`, `SKY: string`, `ACCENT: string`
  - `WARP_LAYERS: Partial<DitheringProps>[]`
  - `useReducedMotion(): boolean`

- [ ] **Step 1: Create the shared recipe module**

Create `app/lib/dither-recipe.ts`:

```ts
import type { DitheringProps } from "@paper-design/shaders-react";

// The locked lab recipe (docs/superpowers/plans/2026-07-18-dither-shader-swap.md, spec §0).
// This lived as two identical copies in DitherFog and CardFog; DitherShadow would have made
// three. Values are verbatim — do not retune without re-running /lab/dither.

export const WHITE = "#fafafa"; // page surface; multiply-blended layers pass it through
export const BLUE = "#406cd6";
export const SKY = "#459ae4";
export const ACCENT = "#2f2e89";

/** Two white-backed warp layers, multiply-stacked so the palette accumulates over white. */
export const WARP_LAYERS: Partial<DitheringProps>[] = [
  { colorBack: WHITE, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.8 },
  { colorBack: WHITE, colorFront: SKY, shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.55 },
];
```

- [ ] **Step 2: Create the shared reduced-motion hook**

Create `app/lib/use-reduced-motion.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/**
 * Tracks `prefers-reduced-motion: reduce`, updating if the user changes it mid-session.
 * Extracted verbatim from DitherFog / CardFog, which each carried an identical copy.
 * Starts `false` so the server render and the first client render agree; the effect
 * corrects it on mount.
 */
export function useReducedMotion(): boolean {
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
```

- [ ] **Step 3: Point `DitherFog` at both**

In `app/components/DitherFog.tsx`:

Replace the import block and the constant/hook definitions (currently lines 8-31) so the top of the file reads:

```tsx
import { useEffect, useRef } from "react";
import { Dithering } from "@paper-design/shaders-react";
import { WHITE, ACCENT, WARP_LAYERS } from "@/app/lib/dither-recipe";
import { useReducedMotion } from "@/app/lib/use-reduced-motion";
```

Delete these, which now live in the shared modules:
- the `WHITE` / `BLUE` / `SKY` / `ACCENT` constants
- the `HERO_LAYERS` array
- the entire local `useReducedMotion` function
- the now-unused `useState` and `DitheringProps` imports

Then in `DitherLayers`, rename the one usage:

```tsx
      {WARP_LAYERS.map((l, i) => (
```

`WHITE` and `ACCENT` are still used by the cursor blob's `Dithering` at the bottom of the file, which is why they are imported.

- [ ] **Step 4: Point `CardFog` at both**

In `app/components/CardFog.tsx`:

Replace the import block and the constant/hook definitions (currently lines 7-33) so the top of the file reads:

```tsx
import { useEffect, useRef, useState } from "react";
import { Dithering } from "@paper-design/shaders-react";
import { WARP_LAYERS } from "@/app/lib/dither-recipe";
import { useReducedMotion } from "@/app/lib/use-reduced-motion";

// Bottom-right corner reveal (CardFog's traditional placement).
const CARD_MASK = "radial-gradient(120% 120% at 100% 100%, black 0%, black 35%, transparent 72%)";
const FADE_MS = 500;
```

Delete: the `WHITE` / `BLUE` / `SKY` constants, the `BLOOM_LAYERS` array, the local `useReducedMotion`, and the `DitheringProps` type import. Keep `useState` — `CardFog` still uses it for `mounted` and `shown`.

Then rename the one usage near the bottom of the file:

```tsx
      {WARP_LAYERS.map((l, i) => (
```

- [ ] **Step 5: Verify nothing broke**

Run:

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: tsc clean, vitest 243 pass / 2 skip (unchanged — this refactor adds no tests and must break none), build clean.

- [ ] **Step 6: Verify visually**

```bash
npm run build && npm start
```

Open `http://localhost:3000/ask` and confirm the fog behind the action zone still animates and the cursor blob still trails the pointer. Open `http://localhost:3000/learn` and hover a concept card; the bottom-right dither bloom must still fade in and out.

Kill the server with `kill $(lsof -ti tcp:3000 -sTCP:LISTEN)` when done — `pkill -f "next start"` does not work here.

- [ ] **Step 7: Commit**

```bash
git add app/lib/dither-recipe.ts app/lib/use-reduced-motion.ts app/components/DitherFog.tsx app/components/CardFog.tsx
git commit -m "refactor: extract shared dither recipe and reduced-motion hook"
```

---

### Task 2: Extract the canvas reveal loop

`AsciiGlyph.tsx` and `AsciiEmblem.tsx` each carry a near-identical ~45-line effect: DPR canvas sizing, the cell paint loop, the `easeOut` reveal across `REVEAL_MS`, and the reduced-motion instant-paint branch. `HouseHelmet` (Task 4) would be the third. The only real difference between the two call sites is that `AsciiGlyph` paints a crisp numeral on top; that becomes an optional `drawOverlay` callback. **Nothing renders differently after this task.**

**Files:**
- Create: `app/lib/use-reveal-canvas.ts`
- Modify: `app/components/AsciiGlyph.tsx`
- Modify: `app/components/AsciiEmblem.tsx`

**Interfaces:**
- Consumes: `BayerCell` from `app/lib/bayer.ts` (existing).
- Produces:
  - `REVEAL_MS: number` (450)
  - `type OverlayDraw = (ctx: CanvasRenderingContext2D, progress: number, dims: { width: number; height: number }) => void`
  - `useRevealCanvas(opts: { cells: BayerCell[] | null; grid: { cols: number; rows: number } | null; size: number; animate?: boolean; drawOverlay?: OverlayDraw }): RefObject<HTMLCanvasElement>`

- [ ] **Step 1: Create the hook**

Create `app/lib/use-reveal-canvas.ts`:

```ts
"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { BayerCell } from "@/app/lib/bayer";

export const REVEAL_MS = 450; // dither-resolve reveal duration

function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

/** Painted on top of the resolved cell field each frame. `progress` is the eased reveal
 *  fraction (0..1); `dims` are the canvas's CSS pixel dimensions. AsciiGlyph uses this for
 *  the crisp numeral; the emblem and house helmet pass nothing. */
export type OverlayDraw = (
  ctx: CanvasRenderingContext2D,
  progress: number,
  dims: { width: number; height: number }
) => void;

/**
 * Paints a hard-thresholded cell field (app/lib/bayer.ts) to a canvas with the shared
 * dither-resolve reveal: cells appear in reading order over REVEAL_MS, eased. Handles DPR
 * sizing and the reduced-motion instant paint.
 *
 * Extracted from AsciiGlyph and AsciiEmblem, which carried identical copies of this loop.
 * Behaviour is unchanged from those originals: same REVEAL_MS, same easing curve, same
 * `min(2, devicePixelRatio)` clamp, same reduced-motion branch.
 */
export function useRevealCanvas({
  cells,
  grid,
  size,
  animate = true,
  drawOverlay,
}: {
  cells: BayerCell[] | null;
  grid: { cols: number; rows: number } | null;
  size: number;
  animate?: boolean;
  drawOverlay?: OverlayDraw;
}): RefObject<HTMLCanvasElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The overlay closure is rebuilt every render by its caller, so it must not be an effect
  // dependency or the reveal would restart on each render. Hold it in a ref instead.
  const overlayRef = useRef<OverlayDraw | undefined>(drawOverlay);
  overlayRef.current = drawOverlay;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!cells || !grid || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cellPx = size / grid.cols;
    const heightPx = grid.rows * cellPx;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(heightPx * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${heightPx}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const paint = (progress: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const cell of cells) {
        if (cell.t > progress) continue;
        ctx.fillStyle = cell.color;
        ctx.fillRect(cell.x * cellPx, cell.y * cellPx, cellPx, cellPx);
      }
      overlayRef.current?.(ctx, progress, { width: size, height: heightPx });
    };

    if (reduce || !animate) {
      paint(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / REVEAL_MS);
      paint(easeOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cells, grid, size, animate]);

  return canvasRef;
}
```

- [ ] **Step 2: Switch `AsciiGlyph` to the hook**

In `app/components/AsciiGlyph.tsx`:

Add the import:

```tsx
import { useRevealCanvas } from "@/app/lib/use-reveal-canvas";
```

Delete the local `REVEAL_MS` constant, the local `easeOut` function, and the `useRef` import if it becomes unused (it does — `canvasRef` now comes from the hook). The `useState` and `useEffect` imports stay.

Delete the `const canvasRef = useRef<HTMLCanvasElement>(null);` line and the ENTIRE second effect (the one commented "2. Paint the quantized field to the visible canvas"). Replace them with this hook call, placed with the other hooks near the top of the component body — **it must sit above the `if (!cells || !grid)` early return**, or React's hook order breaks:

```tsx
  const canvasRef = useRevealCanvas({
    cells,
    grid,
    size,
    // Crisp numeral overlay (legible where the dither field can't be), fades in over the
    // final 30% of the reveal.
    drawOverlay:
      g.number === null
        ? undefined
        : (ctx, progress, dims) => {
            ctx.globalAlpha = Math.max(0, Math.min(1, (progress - 0.7) / 0.3));
            ctx.fillStyle = g.numberColor;
            ctx.font = `800 ${Math.round(NUMBER_POS.size * dims.height)}px Arial, Helvetica, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(g.number), NUMBER_POS.x * dims.width, NUMBER_POS.y * dims.height);
            ctx.globalAlpha = 1;
          },
  });
```

Note the substitution: the original used `size` for the numeral's x and `heightPx` for its y and font size. Those are now `dims.width` and `dims.height`, which hold exactly those values.

The first effect (rasterise + threshold), the fallback `DriverGlyph` return, and the `<canvas ref={canvasRef} …>` JSX are all unchanged.

- [ ] **Step 3: Switch `AsciiEmblem` to the hook**

In `app/components/AsciiEmblem.tsx`:

Add the import:

```tsx
import { useRevealCanvas } from "@/app/lib/use-reveal-canvas";
```

Delete the local `REVEAL_MS` constant and the local `easeOut` function. Delete `const canvasRef = useRef<HTMLCanvasElement>(null);` and the ENTIRE second effect (commented "2. Paint the quantized field to the visible canvas"). Replace with:

```tsx
  const canvasRef = useRevealCanvas({ cells, grid, size, animate });
```

placed with the other hooks, above the `if (!cells || !grid)` early return. Drop `useRef` from the React import if nothing else uses it (nothing does).

Everything else — the car/SVG rasterise effect, `emblemAspect`, the placeholder div, the `<canvas>` JSX — is unchanged.

- [ ] **Step 4: Verify nothing broke**

Run:

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: tsc clean, vitest 243 pass / 2 skip (unchanged), build clean.

- [ ] **Step 5: Verify visually on all four affected surfaces**

```bash
npm run build && npm start
```

`AsciiGlyph` and `AsciiEmblem` render on four surfaces. Check each; every one must look exactly as it did before:

1. `http://localhost:3000/` — the tyre, car, and flag emblems beside sections S2, S3, S4, and the car riding the track spine.
2. `http://localhost:3000/ask` — ask "Who's likely to podium at the next race?" and check the driver helmets resolve with their numerals.
3. `http://localhost:3000/weekend` — the podium table helmets.
4. `http://localhost:3000/learn` — the concept card emblems and the large faded watermark on a concept page (this one uses `animate={false}`, so it must paint instantly, with no reveal).

Kill the server: `kill $(lsof -ti tcp:3000 -sTCP:LISTEN)`.

- [ ] **Step 6: Commit**

```bash
git add app/lib/use-reveal-canvas.ts app/components/AsciiGlyph.tsx app/components/AsciiEmblem.tsx
git commit -m "refactor: extract shared canvas reveal loop from glyph and emblem"
```

---

### Task 3: The `race-radio` library

Pure message list, no-repeat picker, and per-word timings. Follows the existing `app/lib/loading-lines.ts` precedent. This is the only unit-tested piece of the feature.

**Files:**
- Create: `app/lib/race-radio.ts`
- Test: `app/lib/race-radio.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RADIO_MESSAGES: readonly string[]`
  - `pickRadioMessage(prev: string | null): string`
  - `type RadioStep = { text: string; atMs: number }`
  - `radioSteps(text: string): RadioStep[]`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/race-radio.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RADIO_MESSAGES, pickRadioMessage, radioSteps } from "@/app/lib/race-radio";

describe("RADIO_MESSAGES", () => {
  it("is non-empty", () => {
    expect(RADIO_MESSAGES.length).toBeGreaterThan(0);
  });

  it("has no duplicate lines", () => {
    expect(new Set(RADIO_MESSAGES).size).toBe(RADIO_MESSAGES.length);
  });
});

describe("pickRadioMessage", () => {
  it("returns a member of the list", () => {
    for (let i = 0; i < 50; i++) {
      expect(RADIO_MESSAGES).toContain(pickRadioMessage(null));
    }
  });

  it("never returns the previous message", () => {
    for (const prev of RADIO_MESSAGES) {
      for (let i = 0; i < 30; i++) {
        expect(pickRadioMessage(prev)).not.toBe(prev);
      }
    }
  });

  it("ignores a previous value that is not in the list", () => {
    expect(RADIO_MESSAGES).toContain(pickRadioMessage("not a real message"));
  });
});

describe("radioSteps", () => {
  it("returns one step per word", () => {
    expect(radioSteps("Final lap. Push! Push! Push!")).toHaveLength(5);
  });

  it("starts the first step at 0ms", () => {
    expect(radioSteps("Box, box.")[0]).toEqual({ text: "Box,", atMs: 0 });
  });

  it("builds each step from the words so far", () => {
    expect(radioSteps("We're on Plan B.").map((s) => s.text)).toEqual([
      "We're",
      "We're on",
      "We're on Plan",
      "We're on Plan B.",
    ]);
  });

  it("ends with the complete message for every real radio line", () => {
    for (const message of RADIO_MESSAGES) {
      const steps = radioSteps(message);
      expect(steps[steps.length - 1].text).toBe(message);
    }
  });

  it("advances time monotonically", () => {
    const steps = radioSteps("If you speak to me every lap, I will disconnect the radio.");
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].atMs).toBeGreaterThan(steps[i - 1].atMs);
    }
  });

  it("holds longer after a word ending in punctuation", () => {
    // "Box," ends in a comma, so the gap before "box." is the base beat plus the pause.
    const punctuated = radioSteps("Box, box.");
    // "Box box" has no punctuation on the first word, so the gap is the base beat alone.
    const plain = radioSteps("Box box");
    expect(punctuated[1].atMs).toBeGreaterThan(plain[1].atMs);
  });

  it("returns no steps for empty or whitespace-only input", () => {
    expect(radioSteps("")).toEqual([]);
    expect(radioSteps("   ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/lib/race-radio.test.ts`

Expected: FAIL — `Failed to resolve import "@/app/lib/race-radio"`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/race-radio.ts`:

```ts
/**
 * Owner-authored race-engineer radio lines for the landing intro helmet
 * (app/components/RadioHelmet.tsx). Verbatim; do not edit copy.
 *
 * "We are checking…" also appears in LOADING_LINES (app/lib/loading-lines.ts) for the /ask
 * spinner. That overlap is deliberate and the two lists stay independent — they serve
 * different surfaces and the loading list is written in a different voice.
 */
export const RADIO_MESSAGES: readonly string[] = [
  "Box, box.",
  "Box for mediums next lap…",
  "Sector 4 pace is good…",
  "Must be the water…",
  "You are now the race leader.",
  "You're the fastest man on track.",
  "If you speak to me every lap, I will disconnect the radio.",
  "Final lap. Push! Push! Push!",
  "We're on Plan B.",
  "That is P3 currently, purple Sector 4.",
  "We are checking…",
];

/**
 * A random line, never the one just shown. Falls back to the full list when `prev` filters
 * everything out (a one-entry list, or a `prev` that isn't in the list at all), so this
 * always returns a real message rather than looping or throwing.
 */
export function pickRadioMessage(prev: string | null): string {
  const pool = RADIO_MESSAGES.filter((m) => m !== prev);
  const from = pool.length > 0 ? pool : RADIO_MESSAGES;
  return from[Math.floor(Math.random() * from.length)];
}

/** One reveal step: the message truncated to that word, and when it appears. */
export type RadioStep = { text: string; atMs: number };

const WORD_MS = 130; // base beat between words
const PAUSE_MS = 120; // extra hold after a word that ends a clause
const ENDS_CLAUSE = /[,.!?…]$/;

/**
 * Per-word reveal timings for one radio line, mimicking the broadcast caption: words land
 * one at a time and the rhythm breaks at punctuation the way a spoken call does.
 *
 * `text` on each step is the message built up to that word, so a consumer renders
 * `steps[i].text` directly instead of reassembling. Whitespace is normalised (trimmed,
 * internal runs collapsed), which is a no-op for every entry in RADIO_MESSAGES.
 */
export function radioSteps(text: string): RadioStep[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const steps: RadioStep[] = [];
  let at = 0;
  for (let i = 0; i < words.length; i++) {
    steps.push({ text: words.slice(0, i + 1).join(" "), atMs: at });
    at += WORD_MS + (ENDS_CLAUSE.test(words[i]) ? PAUSE_MS : 0);
  }
  return steps;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/lib/race-radio.test.ts`

Expected: PASS, 12 tests.

Then run the full suite: `npm test`

Expected: 255 pass / 2 skip (243 + the 12 new).

- [ ] **Step 5: Commit**

```bash
git add app/lib/race-radio.ts app/lib/race-radio.test.ts
git commit -m "feat: add race radio message library with per-word reveal timings"
```

---

### Task 4: The `HouseHelmet` component

The brand helmet: the shared silhouette from `app/lib/helmet.ts` in house colours, rasterised and hard-thresholded exactly as `AsciiGlyph` does, with no driver lookup, no numeral, and no entity popover.

**Files:**
- Create: `app/components/HouseHelmet.tsx`

**Interfaces:**
- Consumes: `useRevealCanvas` (Task 2); `thresholdCells`, `BayerCell` from `app/lib/bayer.ts`; `HELMET_VIEWBOX`, `SHELL`, `VISOR`, `VENT`, `VISOR_FILL`, `helmetSvgMarkup` from `app/lib/helmet.ts`; `ResolvedGlyph` from `app/lib/glyph.ts`.
- Produces: `HouseHelmet({ size?: number; className?: string })`

- [ ] **Step 1: Write the component**

Create `app/components/HouseHelmet.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { thresholdCells, type BayerCell } from "@/app/lib/bayer";
import { useRevealCanvas } from "@/app/lib/use-reveal-canvas";
import { HELMET_VIEWBOX, SHELL, VENT, VISOR, VISOR_FILL, helmetSvgMarkup } from "@/app/lib/helmet";
import type { ResolvedGlyph } from "@/app/lib/glyph";

// Matches AsciiGlyph / AsciiEmblem: threshold quantization at 2px per cell reads as clean
// 8-bit pixel art without losing shape detail (owner-reviewed 2026-07-22).
const DEFAULT_CELL_PX = 2;

const SHELL_FILL = "#406cd6"; // brand blue (accent-bright)
const VENT_FILL = "#459ae4"; // palette sky

/**
 * The house helmet: the same shared silhouette every driver glyph uses, in brand colours
 * with no number. Not any real driver, and deliberately not derived from drivers.json or
 * teams.json — it is brand furniture, so it must never go stale when the grid changes.
 * Abstract shapes and colour only (PRD §8).
 */
const HOUSE_GLYPH: ResolvedGlyph = {
  code: "S4",
  number: null,
  helmetFill: SHELL_FILL,
  accent: VENT_FILL,
  numberColor: "#ffffff", // unused: `number` is null, so no numeral is ever drawn
  known: false,
};

/**
 * The house helmet rendered as a hard-threshold pixel-art field, resolving in reading order
 * on mount (the shared dither-resolve reveal). Purely presentational and aria-hidden —
 * RadioHelmet owns the button, the label, and all interaction. The plain vector helmet is
 * the server render and the no-canvas fallback, at identical box dimensions so the swap
 * causes no layout shift.
 */
export function HouseHelmet({ size = 220, className = "" }: { size?: number; className?: string }) {
  const [cells, setCells] = useState<BayerCell[] | null>(null);
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null);
  const canvasRef = useRevealCanvas({ cells, grid, size });

  // Rasterise the helmet off-screen at the sampling grid and hard-threshold it.
  useEffect(() => {
    let cancelled = false;
    const { w, h } = HELMET_VIEWBOX;
    const gCols = Math.max(6, Math.round(size / DEFAULT_CELL_PX));
    const gRows = Math.max(1, Math.round(gCols * (h / w)));
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(helmetSvgMarkup(HOUSE_GLYPH, false))}`;

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const c = document.createElement("canvas");
        c.width = gCols;
        c.height = gRows;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        setCells(thresholdCells(data, gCols, gRows));
        setGrid({ cols: gCols, rows: gRows });
      } catch {
        /* tainted/unsupported canvas → keep the vector fallback */
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [size]);

  const height = Math.round((size * HELMET_VIEWBOX.h) / HELMET_VIEWBOX.w);

  if (!cells || !grid) {
    return (
      <svg
        width={size}
        height={height}
        viewBox={`0 0 ${HELMET_VIEWBOX.w} ${HELMET_VIEWBOX.h}`}
        aria-hidden
        className={className}
      >
        <path d={SHELL} fill={SHELL_FILL} />
        <path d={VISOR} fill={VISOR_FILL} />
        <path d={VENT} fill={VENT_FILL} />
      </svg>
    );
  }

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

Expected: clean. (The component has no consumer yet; that arrives in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add app/components/HouseHelmet.tsx
git commit -m "feat: add house helmet glyph for the landing intro"
```

---

### Task 5: The `DitherShadow` component

The drop shadow: the same warp recipe `/ask` and `/weekend` run, masked to a soft ellipse so it reads as a pool on the ground under the helmet. Mounted only while active so no WebGL context is held at rest.

**Files:**
- Create: `app/components/DitherShadow.tsx`

**Interfaces:**
- Consumes: `WARP_LAYERS` (Task 1), `useReducedMotion` (Task 1).
- Produces: `DitherShadow({ active: boolean; intensity?: number })`

**Accepted duplication:** this reuses `CardFog`'s mount / fade / unmount lifecycle rather than sharing it. Extracting a third abstraction mid-feature would widen the blast radius across `/learn` and `/accuracy` for a ~25-line saving. Logged as a follow-up, not done here.

- [ ] **Step 1: Write the component**

Create `app/components/DitherShadow.tsx`:

```tsx
"use client";

// The dither drop shadow beneath the landing intro helmet (app/components/RadioHelmet.tsx).
// Same locked warp recipe as DitherFog and CardFog, masked to a flat ellipse so it reads as
// a pool on the ground rather than a halo. Lifecycle mirrors CardFog: mounted only while
// active or mid-fade-out, then unmounted so the WebGL context is freed.
import { useEffect, useRef, useState } from "react";
import { Dithering } from "@paper-design/shaders-react";
import { WARP_LAYERS } from "@/app/lib/dither-recipe";
import { useReducedMotion } from "@/app/lib/use-reduced-motion";

// `closest-side` sizing is load-bearing, the same lesson as the .legible scrim: a default
// (farthest-corner) ellipse only reaches transparent at the box CORNERS, so the box edge
// slices the gradient mid-alpha and a hard rectangle appears over the warp. closest-side
// inscribes the ellipse, so alpha is exactly 0 at every side and no edge can exist.
const SHADOW_MASK =
  "radial-gradient(ellipse closest-side at 50% 50%, black 0%, black 18%, transparent 78%)";
const FADE_MS = 500;

export function DitherShadow({ active, intensity = 0.55 }: { active: boolean; intensity?: number }) {
  const [mounted, setMounted] = useState(active);
  // `shown` starts false so the browser paints an opacity-0 frame before the flip — without
  // it the wrapper mounts already at full opacity and the fade-IN never runs (pops in).
  const [shown, setShown] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();
  const speedFactor = reduced ? 0 : 1;

  useEffect(() => {
    if (!mounted) {
      setShown(false);
      return;
    }
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [mounted]);

  useEffect(() => {
    if (active) {
      if (fadeTimer.current) {
        clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }
      setMounted(true);
      return;
    }
    fadeTimer.current = setTimeout(() => setMounted(false), FADE_MS);
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [active]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity"
      style={{
        opacity: active && shown ? intensity : 0,
        transitionDuration: `${FADE_MS}ms`,
        // multiply on the MASKED WRAPPER, never only on a canvas inside it: a mask creates
        // its own stacking context, which isolates inner blend modes and renders as a
        // visible white shape instead of blending through.
        mixBlendMode: "multiply",
        maskImage: SHADOW_MASK,
        WebkitMaskImage: SHADOW_MASK,
      }}
    >
      {WARP_LAYERS.map((l, i) => (
        <Dithering
          key={i}
          {...l}
          speed={(l.speed ?? 0.5) * speedFactor}
          className="absolute inset-0 h-full w-full"
          // The layers ALSO carry multiply so the two colours accumulate against each other
          // inside the mask's stacking context, exactly as DitherFog and CardFog do.
          style={{ mixBlendMode: "multiply" }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/DitherShadow.tsx
git commit -m "feat: add ellipse-masked dither shadow bloom"
```

---

### Task 6: The `RadioHelmet` interaction shell

The state machine and presentation: a real button, hover / tap / keyboard activation, the lift, the shadow, and the speech bubble with its word stepper.

**Files:**
- Create: `app/components/RadioHelmet.tsx`
- Modify: `app/globals.css` (append at end of file)

**Interfaces:**
- Consumes: `HouseHelmet` (Task 4), `DitherShadow` (Task 5), `pickRadioMessage` / `radioSteps` / `RadioStep` (Task 3), `useReducedMotion` (Task 1).
- Produces: `RadioHelmet({ size?: number })`

- [ ] **Step 1: Add the transitions to `app/globals.css`**

Append to the end of `app/globals.css`:

```css
/* Landing intro radio helmet (app/components/RadioHelmet.tsx). The lift transform lives on
   its own inner element, NEVER on the [data-reveal] wrapper — SectionReveal sets `y` on
   those via GSAP and the two transforms would overwrite each other (the same bug the
   landing footer's parallax hit). */
.radio-lift {
  transform: translateY(0);
  transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
}
[data-radio-active] .radio-lift {
  transform: translateY(-14px);
}

/* Bubble opens after the lift has most of the way settled, closes fast. */
.radio-bubble {
  opacity: 0;
  transform: scale(0.94);
  transform-origin: bottom left;
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}
[data-radio-active] .radio-bubble {
  opacity: 1;
  transform: scale(1);
  transition:
    opacity 220ms ease 380ms,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1) 380ms;
}

/* Tail: a small triangle pointing down toward the helmet. Sits below the bubble body. */
.radio-bubble::after {
  content: "";
  position: absolute;
  left: 28px;
  bottom: -9px;
  width: 0;
  height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-top: 10px solid #ffffff;
}

@media (prefers-reduced-motion: reduce) {
  .radio-lift,
  [data-radio-active] .radio-lift {
    transform: none;
    transition: none;
  }
  .radio-bubble,
  [data-radio-active] .radio-bubble {
    transition: none;
  }
}
```

- [ ] **Step 2: Write the component**

Create `app/components/RadioHelmet.tsx`:

```tsx
"use client";

// The landing intro microinteraction: the house helmet lifts, a dither pool appears beneath
// it, and a speech bubble plays one random team-radio line word by word. A different line
// every activation. Hover (mouse), tap (touch), and keyboard focus all drive the same path.
import { useEffect, useRef, useState } from "react";
import { HouseHelmet } from "@/app/components/HouseHelmet";
import { DitherShadow } from "@/app/components/DitherShadow";
import { useReducedMotion } from "@/app/lib/use-reduced-motion";
import { pickRadioMessage, radioSteps, type RadioStep } from "@/app/lib/race-radio";

// The bubble opens at 380ms (see .radio-bubble in globals.css); words start once it's open.
const WORDS_DELAY_MS = 560;
// How long a tap keeps the bubble open. Generous enough for the longest line (11 words,
// roughly 2.1s of stepping after the 560ms lead-in) plus a comfortable hold.
const PIN_MS = 5200;

export function RadioHelmet({ size = 220 }: { size?: number }) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [steps, setSteps] = useState<RadioStep[]>([]);
  const [message, setMessage] = useState<string>("");
  const [stepIndex, setStepIndex] = useState(-1);
  const reduced = useReducedMotion();

  const active = hovering || pinned;

  // The message just shown, so the next pick never repeats it. A ref, not state: reading it
  // during the activation effect must not make that effect depend on it.
  const lastMessage = useRef<string | null>(null);
  const wordTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One place picks the message and schedules the words: the false -> true edge of `active`.
  // Every input path (hover, tap, focus) just flips a flag.
  useEffect(() => {
    const clearWordTimers = () => {
      wordTimers.current.forEach(clearTimeout);
      wordTimers.current = [];
    };

    if (!active) {
      clearWordTimers();
      return;
    }

    const next = pickRadioMessage(lastMessage.current);
    lastMessage.current = next;
    const nextSteps = radioSteps(next);
    setMessage(next);
    setSteps(nextSteps);

    if (reduced) {
      // Reduced motion: the whole line is present immediately, never stepped.
      setStepIndex(nextSteps.length - 1);
      return;
    }

    setStepIndex(-1);
    nextSteps.forEach((step, i) => {
      wordTimers.current.push(setTimeout(() => setStepIndex(i), WORDS_DELAY_MS + step.atMs));
    });

    return clearWordTimers;
  }, [active, reduced]);

  // Clear the pin timer on unmount so a tapped-then-navigated-away helmet leaves nothing behind.
  useEffect(() => {
    return () => {
      if (pinTimer.current) clearTimeout(pinTimer.current);
    };
  }, []);

  const pinFor = (ms: number | null) => {
    if (pinTimer.current) clearTimeout(pinTimer.current);
    pinTimer.current = null;
    setPinned(true);
    if (ms !== null) pinTimer.current = setTimeout(() => setPinned(false), ms);
  };

  // Hover is mouse-only: on touch, pointerenter fires on tap and pointerleave fires the
  // instant the finger lifts, which would close the bubble before a word appeared. Touch
  // goes through onClick instead.
  const onPointerEnter = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse") setHovering(true);
  };
  const onPointerLeave = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "mouse") return;
    setHovering(false);
    // A mouse click also pins for PIN_MS. Leaving the helmet should end that rather than
    // leave the bubble hanging with the pointer gone — unless the button holds keyboard
    // focus, whose pin the mouse has no business cancelling.
    if (document.activeElement !== e.currentTarget && pinTimer.current) {
      clearTimeout(pinTimer.current);
      pinTimer.current = null;
      setPinned(false);
    }
  };

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // `detail === 0` means the click came from the keyboard (Enter or Space on a focused
    // button), where focus already holds it open and an auto-close timer would fight that.
    pinFor(e.detail === 0 ? null : PIN_MS);
  };

  // Only keyboard focus should open it. A mouse click also focuses the button, but does not
  // match :focus-visible, so this stays out of the pointer path's way.
  const onFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    if (e.currentTarget.matches(":focus-visible")) pinFor(null);
  };
  const onBlur = () => {
    if (pinTimer.current) clearTimeout(pinTimer.current);
    pinTimer.current = null;
    setPinned(false);
  };

  const visibleText = stepIndex >= 0 ? (steps[stepIndex]?.text ?? "") : "";

  return (
    <div className="relative inline-block" data-radio-active={active ? "" : undefined}>
      {/* Bubble sits above the helmet. Its box is reserved by an invisible copy of the full
          message so words landing one at a time never reflow it. */}
      <div
        aria-hidden
        className="radio-bubble pointer-events-none absolute bottom-full left-0 z-20 mb-4 max-w-[17rem] rounded-2xl bg-white px-4 py-2.5 shadow-[0_2px_12px_rgba(37,31,68,0.12)] ring-1 ring-ink/10"
      >
        <span className="invisible block font-grotesk text-sm leading-snug text-ink">
          {message || " "}
        </span>
        <span className="absolute inset-0 px-4 py-2.5 font-grotesk text-sm leading-snug text-ink">
          {visibleText}
        </span>
      </div>

      {/* The full line, for screen readers: the animated copy above is aria-hidden so a
          reader never stutters through partial words. */}
      <span className="sr-only" aria-live="polite">
        {active ? message : ""}
      </span>

      {/* The shadow pool is anchored to the helmet's base and wider than it, so it reads as
          ground contact rather than a glow around the shape.

          It is a SIBLING of the button, never a descendant. DitherShadow renders a <div>,
          and a <button> may only contain phrasing content — the parser would close the
          button early and hydration would mismatch. This is the same content-model trap the
          landing footer's WordmarkFog hit by nesting a <div> inside a <p>. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-4 left-1/2 z-0 h-16 w-[130%] -translate-x-1/2"
      >
        <DitherShadow active={active} />
      </div>

      <button
        type="button"
        aria-label="Play a team radio message"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        onFocus={onFocus}
        onBlur={onBlur}
        className="relative z-10 block cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent/60"
      >
        {/* <span> is safe here: HouseHelmet renders a <canvas> or an <svg>, both phrasing
            content. `block` is a CSS display, not a content-model change. */}
        <span className="radio-lift block">
          <HouseHelmet size={size} />
        </span>
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles and the suite is green**

Run:

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: tsc clean, vitest 255 pass / 2 skip, build clean.

- [ ] **Step 4: Commit**

```bash
git add app/components/RadioHelmet.tsx app/globals.css
git commit -m "feat: add radio helmet microinteraction with team radio bubble"
```

---

### Task 7: Wire the `AboutSector4` section into the landing page

The server section: label, heading, body, and the `RadioHelmet` island, rendered between the hero and the spine wrapper.

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `RadioHelmet` (Task 6); the existing `SECTION_LABEL`, `SECTION_HEADING`, `SECTION_BODY` class constants and `SectionReveal` in `app/page.tsx`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the import**

In `app/page.tsx`, alongside the other component imports near the top:

```tsx
import { RadioHelmet } from "@/app/components/RadioHelmet";
```

- [ ] **Step 2: Render the section**

In the `LandingPage` component's returned JSX, insert `<AboutSector4 />` between `<Hero />` and the spine wrapper `<div>`:

```tsx
      <Hero />
      <AboutSector4 />
      {/* pt: the S1 numeral pokes up (-top-6/-top-10, see AskAnything) above its own
```

The spine wrapper and everything inside it are untouched.

- [ ] **Step 3: Add the section component**

In `app/page.tsx`, add this function immediately after `Hero()` and before `AskAnything()`:

```tsx
/** The plain "what this is" beat between the hero's thesis and the S1-S4 feature sections.
 *  Deliberately outside the spine wrapper: no SectorNumeral, no data-sector-anchor, so
 *  TrackSpine's measured geometry is unaffected and the track still starts at S1.
 *  No CTA — the hero and each of S1-S4 already carry one, and a fifth dilutes them. */
function AboutSector4() {
  return (
    <section className="relative mx-auto w-full max-w-3xl px-6 py-20 sm:px-8 sm:py-28">
      <SectionReveal className="flex flex-col items-center gap-12 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
        <div className="sm:max-w-md">
          <p data-reveal className={SECTION_LABEL}>
            About Sector 4
          </p>
          <h2 data-reveal className={SECTION_HEADING}>
            An F1 companion that shows its working.
          </h2>
          <p data-reveal className={SECTION_BODY}>
            Ask anything about the weekend and get a straight answer with the reasoning
            attached: podium odds as honest probabilities, real strategy calls, and the
            concepts behind both. Where the data is thin, it says so instead of sounding
            sure.
          </p>
        </div>
        {/* data-reveal goes on this WRAPPER; the lift transform lives on .radio-lift inside
            RadioHelmet. GSAP sets `y` on [data-reveal] elements, so the two must never
            share an element. */}
        <div data-reveal className="shrink-0">
          <RadioHelmet />
        </div>
      </SectionReveal>
    </section>
  );
}
```

- [ ] **Step 4: Verify the build**

Run:

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: tsc clean, vitest 255 pass / 2 skip, build clean.

- [ ] **Step 5: Verify in the browser**

```bash
npm start
```

At `http://localhost:3000/`:

1. The intro section sits between the hero and the S1 "Ask anything" section.
2. Hovering the helmet lifts it, the dither pool fades in beneath it, and the bubble opens with words appearing one at a time.
3. Moving the pointer away closes the bubble and settles the helmet.
4. Hovering again shows a **different** message.
5. Tab to the helmet with the keyboard: the focus ring shows and the interaction plays. Tab away: it closes.
6. The spine's grid box, car, and kerbs still start at S1 and behave as before.

Kill the server: `kill $(lsof -ti tcp:3000 -sTCP:LISTEN)`.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add About Sector 4 intro section to the landing page"
```

---

### Task 8: Visual candidate round and owner sign-off

Standing project rule: visual and design constants are shown as rendered candidates before being committed, not committed and then iterated. The constants shipped in Tasks 4-6 are **starting points, not decisions**.

**Files:**
- Modify: `app/components/RadioHelmet.tsx` (constants only)
- Modify: `app/components/DitherShadow.tsx` (constants only)
- Modify: `app/globals.css` (the `.radio-lift` / `.radio-bubble` rules only)

**Interfaces:**
- Consumes: everything from Tasks 4-7.
- Produces: owner-approved values for the constants below.

- [ ] **Step 1: Build and serve the page**

```bash
npm run build && npm start
```

- [ ] **Step 2: Capture candidates for each cluster**

Produce 2-4 rendered variants per cluster and show them to the owner. Do not commit a preference before they pick.

**Cluster A — helmet size.** `RadioHelmet`'s `size` default (currently 220). Candidates: 180, 220, 260.

**Cluster B — lift distance and easing.** `.radio-lift`'s `translateY` in `app/globals.css` (currently -14px) and the 420ms `cubic-bezier(0.22, 1, 0.36, 1)`. Candidates: a subtle -10px, the current -14px, a pronounced -20px.

**Cluster C — shadow pool.** `DitherShadow`'s `intensity` default (currently 0.55) and `SHADOW_MASK`'s stops, plus the pool's box in `RadioHelmet` (currently `h-16 w-[130%] -bottom-4`). Candidates: faint/tight, the current values, strong/wide.

**Cluster D — bubble.** Shape (`rounded-2xl`), tail size and position, typography (`font-grotesk text-sm`), and `max-w-[17rem]`. Candidates: the current compact grotesk bubble, a larger `text-base` version, and one with a squarer radius.

- [ ] **Step 3: Apply the owner's picks**

Edit only the constants named above. No structural changes — if a pick requires restructuring, that is a new task, not a tweak here.

- [ ] **Step 4: Re-verify**

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: tsc clean, vitest 255 pass / 2 skip, build clean.

- [ ] **Step 5: Commit**

```bash
git add app/components/RadioHelmet.tsx app/components/DitherShadow.tsx app/globals.css
git commit -m "style: tune intro helmet size, lift, shadow, and bubble to owner picks"
```

---

### Task 9: Whole-branch verification

Final pass across the full branch before the PR.

**Files:** none modified unless a defect is found.

**Interfaces:**
- Consumes: everything.
- Produces: a verified branch ready for review.

- [ ] **Step 1: Full suite, types, and build**

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: tsc clean, vitest 255 pass / 2 skip, build clean.

- [ ] **Step 2: Confirm the refactors changed no tests**

```bash
git diff main --stat -- 'app/**/*.test.ts'
```

Expected: `app/lib/race-radio.test.ts` is the ONLY test file in the diff, and it is an addition. Any modified pre-existing test file means Task 1 or Task 2 was not behaviour-preserving — stop and fix it.

- [ ] **Step 3: Regression check the four glyph surfaces**

```bash
npm start
```

Confirm `AsciiGlyph` and `AsciiEmblem` are visually unchanged from `main` on: `/` (section emblems and the spine car), `/ask` (driver helmets with numerals), `/weekend` (podium table helmets), `/learn` (card emblems, and the instant-paint watermark on a concept page).

- [ ] **Step 4: Reduced motion**

In Chrome DevTools, Rendering panel, set "Emulate CSS prefers-reduced-motion" to `reduce`, then reload `/`. Confirm:
- The helmet does not lift.
- The shadow pool renders as a still frame (visible, not suppressed).
- The bubble shows the **complete** message with no word stepping.

- [ ] **Step 5: Responsive and console**

- At 1440px and at ~500px: no horizontal page scroll. The bubble must not push the layout wider at the narrow width.
- DevTools console: no hydration mismatch warnings, no errors, on both first load and after interacting with the helmet.

- [ ] **Step 6: Repeat-message check**

Hover the helmet 10 times in a row. No message may appear twice back-to-back.

- [ ] **Step 7: Open the PR**

```bash
git push -u origin landing-intro-radio-helmet
gh pr create --title "Landing intro section with radio helmet microinteraction" --body "$(cat <<'EOF'
## Summary
Adds an "About Sector 4" intro section between the landing hero and the race-track spine. Its visual anchor is a large house helmet that lifts on hover, casts a dithered drop shadow, and plays a random F1 team-radio line word by word.

## Refactors (behaviour-preserving, no test changes)
- `app/lib/dither-recipe.ts` — the warp shader recipe, previously duplicated in `DitherFog` and `CardFog`.
- `app/lib/use-reduced-motion.ts` — the media-query hook, previously duplicated in the same two files.
- `app/lib/use-reveal-canvas.ts` — the DPR sizing and cell reveal loop, previously duplicated in `AsciiGlyph` and `AsciiEmblem`.

## Feature
- `app/lib/race-radio.ts` — messages, no-repeat picker, per-word timings. 12 unit tests.
- `app/components/HouseHelmet.tsx` — brand-blue thresholded helmet, no driver or number.
- `app/components/DitherShadow.tsx` — ellipse-masked warp pool, mounted only while active.
- `app/components/RadioHelmet.tsx` — activation state machine, lift, bubble, word stepper.
- `AboutSector4()` in `app/page.tsx`.

## Verification
- vitest 255 pass / 2 skip, `tsc --noEmit` clean, `next build` clean.
- `AsciiGlyph` / `AsciiEmblem` visually unchanged on `/`, `/ask`, `/weekend`, `/learn`.
- Reduced motion: no lift, still-frame shadow, complete message text.
- No horizontal overflow at 1440px or ~500px; no hydration or console errors.

Spec: `docs/superpowers/specs/2026-07-23-landing-intro-helmet-radio-design.md`
Plan: `docs/superpowers/plans/2026-07-23-landing-intro-helmet-radio.md`
EOF
)"
```

---

## Notes for the implementer

- **`TrackSpine` must not be touched.** The intro section sits outside its wrapper and carries no `data-sector-anchor`. If the spine's grid box, car path, or kerbs look different after Task 7, something was inserted in the wrong place.
- **The `data-hero` attributes in `app/page.tsx` are reserved** for the deferred preloader and hero-reveal pass. Leave them alone.
- **WebGL context budget:** browsers cap live contexts at roughly 16 and evict the oldest. The landing page already runs `DitherVideo` in the hero plus a `CardFog` per `SectorNumeral` hover. `DitherShadow` must stay mount-on-active — never make it always-on.
- **Follow-up logged, not done:** `CardFog` and `DitherShadow` now share a mount / fade / unmount lifecycle by duplication. A `useFadeMount(active, fadeMs)` hook would unify them; deliberately out of scope here to keep the blast radius off `/learn` and `/accuracy`.
