# M3 Frontend Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the existing ASCII/dither M3 frontend — scattered helmet reveal, bolder fog, drifting suggested-query chips, pixel loading spinner + creative loading lines, hover/focus underglow, pixel-serif type — without changing data flow or the inference contract.

**Architecture:** Frontend-only changes to the Next.js (App Router, TS) app at repo root. Pure logic (hash scatter, loading-line picker, chip rotation) lives in small `app/lib/*.ts` modules with node-env Vitest tests; presentational animation lives in components (canvas 2D / GSAP / CSS). Every animation has a `prefers-reduced-motion` static fallback.

**Tech Stack:** Next.js 14.2, React 18, TypeScript, Tailwind (`tailwind.config.ts`), GSAP 3.12 (already a dep), canvas 2D, `next/font/local`, Vitest 2 (node env, `app/**/*.test.ts`).

## Global Constraints

- ASCII rendering stays on **canvas 2D** — the `shaders` pkg can't ASCII-ify DOM (and is being removed).
- **All motion gated behind `prefers-reduced-motion`** — static/instant fallback for every animation.
- Abstract glyphs only; preserve honesty copy; **round every number that reaches output**.
- No new runtime deps. (This plan *removes* `shaders`.)
- Pure logic in `app/lib/*.ts` (testable, node-env); tests live at `app/lib/*.test.ts` and run via `npx vitest run`.
- Commits: conventional style, one logical change; **no AI/Claude attribution** of any kind.
- Tailwind tokens (`tailwind.config.ts`): colors `bg #FAFAFA / ink #0B1020 / accent #2348E0 / accent-bright #2E8BFF / muted #5B6B8C`; fonts `bebas/grotesk/mono/lastik`. Ramp vars in `app/globals.css`: `--ramp-0..5` (`#0b1e6b → #eef6ff`).
- Bebas Neue = **wordmark only**.

## File Structure

- `app/lib/scatter.ts` (new) — pure `scatterDelay(i, span)` hashed reveal delay. + `app/lib/scatter.test.ts`.
- `app/lib/loading-lines.ts` (new) — `LOADING_LINES` array + `pickLoadingLine()`. + `app/lib/loading-lines.test.ts`.
- `app/lib/chips.ts` (new) — pure `visibleChips(cycle, slotCount, total)` rotation. + `app/lib/chips.test.ts`.
- `app/components/PixelSpinner.tsx` (new) — cycling pixel/ASCII spinner glyph (reduced-motion static).
- `app/components/QueryChips.tsx` (new) — drifting suggested-query chips (reduced-motion static row).
- `app/components/AsciiGlyph.tsx` (modify) — use `scatterDelay`.
- `app/components/AsciiFog.tsx` (modify) — bolder alpha/value range.
- `app/components/Reveal.tsx` (DELETE), `app/lib/reveal-fallback.ts` (DELETE), `app/lib/reveal-fallback.test.ts` (DELETE).
- `app/lib/fonts.ts` (modify) — wire PP Mondwest + PP NeueBit.
- `app/layout.tsx` (modify) — remove Shaders attribution; wordmark → `SECTOR4`.
- `app/page.tsx` (modify) — loading line + PixelSpinner + QueryChips + Mondwest on number/headers + bar/button hover & focus classes + softer scrim.
- `app/globals.css` (modify) — focus underglow keyframes/utilities.
- `tailwind.config.ts` (modify) — `pixel-serif` + `pixel` font families.
- `package.json` (modify) — remove `shaders`.

---

### Task 1: Remove Shaders dep + dead M2 reveal code

**Files:**
- Delete: `app/components/Reveal.tsx`, `app/lib/reveal-fallback.ts`, `app/lib/reveal-fallback.test.ts`
- Modify: `app/layout.tsx` (remove the "Powered by Shaders" footer link), `package.json` (remove `shaders`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (cleanup). Confirmed: only `Reveal.tsx` references `shaders`/`reveal-fallback`; `page.tsx` does not import `Reveal`.

- [ ] **Step 1: Confirm nothing else imports the deleted modules**

Run: `grep -rn "Reveal\|reveal-fallback\|from \"shaders\|shaders/react" app/ | grep -v "app/components/Reveal.tsx\|app/lib/reveal-fallback"`
Expected: no output (only the files being deleted reference them).

- [ ] **Step 2: Delete the dead files**

```bash
git rm app/components/Reveal.tsx app/lib/reveal-fallback.ts app/lib/reveal-fallback.test.ts
```

- [ ] **Step 3: Remove the Shaders attribution from the footer**

In `app/layout.tsx`, the footer currently renders the disclaimer **and** an `<a href="https://shaders.com">Powered by Shaders</a>`. Remove the `<a>` element only; keep the disclaimer. The footer becomes a single `<span>` child — adjust so it still renders validly:

```tsx
        <footer className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 font-grotesk text-[10px] leading-snug text-muted/80">
          <span className="max-w-3xl">{DISCLAIMER}</span>
        </footer>
```

- [ ] **Step 4: Remove the `shaders` dependency**

Edit `package.json` and delete the `"shaders": "^2.5.130",` line from `dependencies`, then refresh the lockfile:

Run: `npm install`
Expected: completes; `package-lock.json` updates; no remaining `shaders` resolution.

- [ ] **Step 5: Verify build + tests are clean**

Run: `npx vitest run && npm run build`
Expected: Vitest PASS (now without the reveal-fallback test); `npm run build` succeeds with no missing-module / dead-import errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove shaders dep + dead M2 reveal code and attribution"
```

---

### Task 2: Wire pixel fonts + apply type system (wordmark, answer number, headers)

**Files:**
- Modify: `app/lib/fonts.ts`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes: font files `app/fonts/bitmap/PPMondwest-Regular.otf`, `app/fonts/bitmap/PPNeueBit-Bold.otf` (present).
- Produces: CSS vars `--font-pixel-serif`, `--font-pixel`; Tailwind utilities `font-pixel-serif`, `font-pixel`; added to `fontVars`.

- [ ] **Step 1: Wire the two fonts in `app/lib/fonts.ts`**

Add below the existing `lastik` definition (mirrors the existing `localFont` pattern):

```ts
// Pixel serif — display moments (answer numbers, section headers, future landing). PP Mondwest.
export const pixelSerif = localFont({
  src: [{ path: "../fonts/bitmap/PPMondwest-Regular.otf", weight: "400", style: "normal" }],
  variable: "--font-pixel-serif",
  display: "swap",
});
// Pixel sans — small "computer" accents. PP NeueBit Bold.
export const pixel = localFont({
  src: [{ path: "../fonts/bitmap/PPNeueBit-Bold.otf", weight: "700", style: "normal" }],
  variable: "--font-pixel",
  display: "swap",
});
```

Then extend the `fontVars` export to include both:

```ts
export const fontVars = `${bebas.variable} ${grotesk.variable} ${mono.variable} ${lastik.variable} ${pixelSerif.variable} ${pixel.variable}`;
```

- [ ] **Step 2: Add Tailwind font families**

In `tailwind.config.ts`, inside `theme.extend.fontFamily`, add (alongside `bebas/grotesk/mono/lastik`):

```ts
        "pixel-serif": ["var(--font-pixel-serif)", "serif"],
        pixel: ["var(--font-pixel)", "monospace"],
```

- [ ] **Step 3: Verify the build resolves the fonts**

Run: `npm run build`
Expected: succeeds. If `next/font/local` rejects the `.otf`, convert each to `.woff2` (e.g. `npx ttf2woff2` after an otf→ttf step, or `fonttools`), place beside the `.otf`, and point `src.path` at the `.woff2` (same self-host pattern used for the other faces). Re-run build to green.

- [ ] **Step 4: Wordmark → `SECTOR4`**

In `app/layout.tsx`, change the wordmark text from `SECTOR 4` to `SECTOR4` (keep `font-bebas` and all classes):

```tsx
        <span className="fixed left-6 top-5 z-20 font-bebas text-3xl tracking-wide text-ink">
          SECTOR4
        </span>
```

- [ ] **Step 5: Apply Mondwest to the big answer number + section eyebrows**

In `app/page.tsx`:
- `StatAnswer` value (the `text-7xl` number) → add `font-pixel-serif`:

```tsx
      <div className="font-pixel-serif text-7xl font-bold tracking-tight text-ink">
        {facts.value}
        <span className="ml-1 text-3xl text-muted">{facts.units}</span>
      </div>
```

- `PodiumLineup` eyebrow header (`{podium.year} {podium.gp} · podium odds …`) → swap `font-grotesk` for `font-pixel-serif` and drop `uppercase` (the pixel serif reads better mixed-case), keeping the tracking/size:

```tsx
      <div className="font-pixel-serif text-sm tracking-[0.12em] text-muted">
        {podium.year} {podium.gp} · podium odds
        {podium.mode ? ` · ${podium.mode}` : ""}
      </div>
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: succeeds, no unknown-utility errors for `font-pixel-serif`.

- [ ] **Step 7: Commit**

```bash
git add app/lib/fonts.ts tailwind.config.ts app/layout.tsx app/page.tsx
git commit -m "feat: wire PP Mondwest/NeueBit pixel fonts; SECTOR4 wordmark; pixel-serif headers"
```

---

### Task 3: Helmet reveal — true per-cell scatter

**Files:**
- Create: `app/lib/scatter.ts`, `app/lib/scatter.test.ts`
- Modify: `app/components/AsciiGlyph.tsx`

**Interfaces:**
- Produces: `scatterDelay(i: number, span: number): number` — deterministic hashed delay in `[0, span)`.
- Consumed by: `AsciiGlyph.tsx` reveal (`delayFor`).

- [ ] **Step 1: Write the failing test**

`app/lib/scatter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scatterDelay } from "./scatter";

describe("scatterDelay", () => {
  it("is deterministic for the same input", () => {
    expect(scatterDelay(42, 500)).toBe(scatterDelay(42, 500));
  });

  it("stays within [0, span)", () => {
    for (let i = 0; i < 500; i++) {
      const d = scatterDelay(i, 500);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(500);
    }
  });

  it("produces many distinct buckets (not the old 23-clump artifact)", () => {
    const vals = new Set<number>();
    for (let i = 0; i < 200; i++) vals.add(Math.round(scatterDelay(i, 500)));
    expect(vals.size).toBeGreaterThan(120); // was capped at 23 with the old modulo
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run app/lib/scatter.test.ts`
Expected: FAIL — `scatterDelay` not defined.

- [ ] **Step 3: Implement**

`app/lib/scatter.ts`:

```ts
/**
 * Deterministic hashed reveal delay for cell `i`, in `[0, span)`. Replaces the old
 * `(i*73) % 23` which produced only 23 delay buckets (cells popped in visible clumps).
 * An integer-hash mix gives an effectively uniform per-cell delay — true scatter — while
 * staying deterministic (no Math.random → no hydration mismatch).
 */
export function scatterDelay(i: number, span: number): number {
  let h = i | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 0x100000000) * span;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run app/lib/scatter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Use it in `AsciiGlyph.tsx`**

Add the import near the other `@/app/lib` imports:

```tsx
import { scatterDelay } from "@/app/lib/scatter";
```

Replace the inline `delayFor` (currently `const delayFor = (i: number) => (((i * 73) % 23) / 23) * REVEAL_MS;`) with:

```tsx
    const delayFor = (i: number) => scatterDelay(i, REVEAL_MS);
```

(Leave `REVEAL_MS`, `FADE_MS`, the `tick` loop, and the reduced-motion `paint(() => 1)` branch unchanged.)

- [ ] **Step 6: Verify build + full tests**

Run: `npx vitest run && npm run build`
Expected: all PASS; build clean.

- [ ] **Step 7: Commit**

```bash
git add app/lib/scatter.ts app/lib/scatter.test.ts app/components/AsciiGlyph.tsx
git commit -m "feat: per-cell hashed scatter for the helmet ASCII reveal"
```

---

### Task 4: Creative loading lines

**Files:**
- Create: `app/lib/loading-lines.ts`, `app/lib/loading-lines.test.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `LOADING_LINES: readonly string[]`, `pickLoadingLine(): string`.
- Consumed by: `page.tsx` loading state.

- [ ] **Step 1: Write the failing test**

`app/lib/loading-lines.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LOADING_LINES, pickLoadingLine } from "./loading-lines";

describe("loading lines", () => {
  it("has the full owner-authored set", () => {
    expect(LOADING_LINES.length).toBe(15);
    expect(LOADING_LINES).toContain("Bwoahhh...");
    expect(LOADING_LINES).toContain("Leaving the space for Fernando...");
  });

  it("pickLoadingLine returns a member of the list", () => {
    for (let i = 0; i < 50; i++) expect(LOADING_LINES).toContain(pickLoadingLine());
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run app/lib/loading-lines.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`app/lib/loading-lines.ts` (lines verbatim, including emoji and the masked word):

```ts
/** Owner-authored loading lines — one picked at random per query. Verbatim; do not edit copy. */
export const LOADING_LINES: readonly string[] = [
  "We are checking...",
  "Boxing for mediums...",
  "⚠️ Investigating the 'inchident'...",
  "Just got told it's a motor race. Now going car racing...",
  "Bwoahhh...",
  "Updating the words of wisdom...",
  "Changing the f*****g car...",
  "Getting my gloves and steering wheel...",
  "Calling the World Champion Hotline...",
  "Leaving the space for Fernando...",
  "Giving Ocon a +5s penalty...",
  "Asking Carlos for the pancake recipe...",
  "Playing Mariah Carayyy...",
  "Going up and down, side to side like a rollercoaster...",
  "Licking the stamp and sending it...",
];

export function pickLoadingLine(): string {
  return LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run app/lib/loading-lines.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into `page.tsx`**

Add the import:

```tsx
import { pickLoadingLine } from "@/app/lib/loading-lines";
```

Add loading-line state and set it when a run starts. In `Home`, add:

```tsx
  const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0]);
```

(import `LOADING_LINES` too), and at the top of `run()` after `setLoading(true)`:

```tsx
      setLoadingLine(pickLoadingLine());
```

Replace the loading paragraph (currently `Reading the weekend…`) with the chosen line (note: the line already carries its own trailing `...`, so do not append an ellipsis):

```tsx
        {loading && (
          <p className="fog-in font-pixel text-base tracking-wide text-muted">{loadingLine}</p>
        )}
```

- [ ] **Step 6: Verify build + tests**

Run: `npx vitest run && npm run build`
Expected: all PASS; build clean.

- [ ] **Step 7: Commit**

```bash
git add app/lib/loading-lines.ts app/lib/loading-lines.test.ts app/page.tsx
git commit -m "feat: random F1-radio loading lines in pixel type"
```

---

### Task 5: Ask button — pixel spinner

**Files:**
- Create: `app/components/PixelSpinner.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `<PixelSpinner />` — a fixed-width cycling glyph; static under reduced motion.
- Consumed by: the Ask button's loading state in `page.tsx`.

- [ ] **Step 1: Implement the spinner component**

`app/components/PixelSpinner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

// Rotating quadrant blocks — reads as a pixel/ASCII spinner in the mono face.
const FRAMES = ["▖", "▘", "▝", "▗"];

/** Cycling pixel spinner. Fixed-width (one glyph). Static first frame under reduced motion. */
export function PixelSpinner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 110);
    return () => clearInterval(id);
  }, []);
  return (
    <span aria-hidden className="inline-block w-[1ch] text-center font-mono">
      {FRAMES[i]}
    </span>
  );
}
```

- [ ] **Step 2: Wire into the Ask button**

In `app/page.tsx`, add the import:

```tsx
import { PixelSpinner } from "@/app/components/PixelSpinner";
```

Replace the button label (`{loading ? "…" : "Ask"}`) with the spinner while loading:

```tsx
          {loading ? <PixelSpinner /> : "Ask"}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/components/PixelSpinner.tsx app/page.tsx
git commit -m "feat: pixel spinner on the Ask button while loading"
```

---

### Task 6: Drifting suggested-query chips

**Files:**
- Create: `app/lib/chips.ts`, `app/lib/chips.test.ts`, `app/components/QueryChips.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `visibleChips(cycle: number, slotCount: number, total: number): number[]` (pure rotation);
  `<QueryChips examples={string[]} onPick={(q) => void} />`.
- Consumed by: `page.tsx` `EmptyState`.

- [ ] **Step 1: Write the failing test for the rotation helper**

`app/lib/chips.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { visibleChips } from "./chips";

describe("visibleChips", () => {
  it("returns slotCount distinct example indices in range", () => {
    const total = 7;
    for (let cycle = 0; cycle < 20; cycle++) {
      const v = visibleChips(cycle, 3, total);
      expect(v.length).toBe(3);
      expect(new Set(v).size).toBe(3); // no slot shows the same example as another
      v.forEach((idx) => {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(total);
      });
    }
  });

  it("advances across cycles (rotation, not static)", () => {
    expect(visibleChips(0, 3, 7)).not.toEqual(visibleChips(1, 3, 7));
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run app/lib/chips.test.ts`
Expected: FAIL — `visibleChips` not defined.

- [ ] **Step 3: Implement the helper**

`app/lib/chips.ts`:

```ts
/**
 * Which example index shows in each of `slotCount` slots at a given `cycle`. Each slot
 * is offset around the example ring so the visible chips stay distinct, and the whole set
 * advances one step per cycle (drifting rotation). Assumes total >= slotCount.
 */
export function visibleChips(cycle: number, slotCount: number, total: number): number[] {
  const stride = Math.max(1, Math.floor(total / slotCount));
  return Array.from({ length: slotCount }, (_, slot) => (cycle + slot * stride) % total);
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run app/lib/chips.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Build the `QueryChips` component**

`app/components/QueryChips.tsx` — three fixed slots positioned around the action zone; each slot cross-fades to the next example on a stagger. Reduced motion → a plain static wrapped row (today's behaviour).

```tsx
"use client";

import { useEffect, useState } from "react";
import { visibleChips } from "@/app/lib/chips";

const SLOTS = 3;
// Absolute slot positions (around the centred content; percentages of the zone).
const POS = [
  { top: "12%", left: "10%" },
  { top: "68%", left: "62%" },
  { top: "30%", left: "74%" },
];
const CYCLE_MS = 2600;

const chipClass =
  "rounded-full border border-white/60 bg-white/45 px-4 py-1.5 font-grotesk text-xs text-muted backdrop-blur transition hover:border-accent hover:text-ink";

export function QueryChips({ examples, onPick }: { examples: string[]; onPick: (q: string) => void }) {
  const [reduce, setReduce] = useState(false);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const r = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduce(r);
    if (r) return;
    const id = setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  if (reduce) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {examples.slice(0, 3).map((q) => (
          <button key={q} type="button" onClick={() => onPick(q)} className={chipClass}>
            {q}
          </button>
        ))}
      </div>
    );
  }

  const shown = visibleChips(cycle, SLOTS, examples.length);
  return (
    <div className="pointer-events-none absolute inset-0">
      {shown.map((exIdx, slot) => {
        const q = examples[exIdx];
        return (
          <button
            key={slot}
            type="button"
            onClick={() => onPick(q)}
            style={{ top: POS[slot].top, left: POS[slot].left }}
            className={`chip-drift pointer-events-auto absolute -translate-x-1/2 ${chipClass}`}
          >
            {q}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Add the chip drift animation to `app/globals.css`**

Append:

```css
@keyframes chip-drift {
  0% { opacity: 0; transform: translate(-50%, 6px); }
  14% { opacity: 1; transform: translate(-50%, 0); }
  86% { opacity: 1; transform: translate(-50%, 0); }
  100% { opacity: 0; transform: translate(-50%, -6px); }
}
.chip-drift { animation: chip-drift 2.6s ease-in-out both; }
@media (prefers-reduced-motion: reduce) {
  .chip-drift { animation: none; opacity: 1; }
}
```

(The React `key={slot}` keeps a slot's DOM node stable; to re-trigger the fade each cycle, also key the button on the example so React remounts it: change `key={slot}` to `key={`${slot}-${exIdx}`}`. Update that in `QueryChips.tsx`.)

- [ ] **Step 7: Use `QueryChips` in `EmptyState` and expand the examples**

In `app/page.tsx`: expand the `EXAMPLES` list to give the rotation variety (keep the first three as-is; they double as the `query` default and reduced-motion row):

```tsx
const EXAMPLES = [
  "Who is likely to podium at the 2024 Italian Grand Prix?",
  "Monza 2025 podium",
  "How much time is lost in the pit lane at Monaco?",
  "Who podiums at the 2024 Abu Dhabi Grand Prix?",
  "Bahrain 2024 podium odds",
  "Las Vegas 2024 podium",
  "How much time is lost in the pit lane at Monza?",
];
```

Replace the chip block inside `EmptyState` with the new component (keep the intro paragraph):

```tsx
function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="fog-in flex flex-col items-center gap-5 text-center">
      <p className="max-w-md font-lastik text-lg text-ink/70">
        Ask about a 2024–25 race weekend — honest podium odds, strategy, and the numbers behind them.
      </p>
      <QueryChips examples={EXAMPLES} onPick={onPick} />
    </div>
  );
}
```

Add the import:

```tsx
import { QueryChips } from "@/app/components/QueryChips";
```

- [ ] **Step 8: Verify build + tests**

Run: `npx vitest run && npm run build`
Expected: all PASS; build clean.

- [ ] **Step 9: Commit**

```bash
git add app/lib/chips.ts app/lib/chips.test.ts app/components/QueryChips.tsx app/page.tsx app/globals.css
git commit -m "feat: drifting suggested-query chips that spawn at varied spots"
```

---

### Task 7: Bolder fog

**Files:**
- Modify: `app/components/AsciiFog.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes/produces: none (visual tuning). No unit test — `noise.test.ts` already covers the field math.

- [ ] **Step 1: Raise fog alpha + widen the value range in `AsciiFog.tsx`**

In the `draw` loop, the fill currently reads:

```tsx
          ctx.fillStyle = `rgba(${m[0] | 0},${m[1] | 0},${m[2] | 0},${0.2 + cv * 0.5})`;
```

Make it bolder (higher floor + range, capped at 1):

```tsx
          ctx.fillStyle = `rgba(${m[0] | 0},${m[1] | 0},${m[2] | 0},${Math.min(1, 0.32 + cv * 0.62)})`;
```

- [ ] **Step 2: Ease the scrim that dims the fog in `page.tsx`**

The radial scrim behind content currently has a strong opaque core (`rgba(250,250,250,0.88)`). Soften the core so the fog stays present while text remains legible:

```tsx
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-[5] [background:radial-gradient(ellipse_46%_50%_at_50%_50%,rgba(250,250,250,0.74),rgba(250,250,250,0.3)_55%,transparent_75%)]"
        />
```

- [ ] **Step 3: Verify build, then tune in-browser**

Run: `npm run build`
Expected: succeeds. Then visually confirm (Task 9 browser pass): fog noticeably bolder, answer/empty-state text still legible over it. If text legibility suffers, nudge the scrim core back up (e.g. `0.8`) rather than lowering fog alpha.

- [ ] **Step 4: Commit**

```bash
git add app/components/AsciiFog.tsx app/page.tsx
git commit -m "feat: bolder ASCII fog (higher alpha, softer content scrim)"
```

---

### Task 8: Query bar + Ask button — hover & focus underglow

**Files:**
- Modify: `app/globals.css`, `app/page.tsx`

**Interfaces:**
- Consumes/produces: none (CSS + class wiring). Reduced-motion fallback required.

- [ ] **Step 1: Add hover/glow utilities + breathing keyframe to `app/globals.css`**

Append:

```css
/* Query bar: soft breathing underglow while focused. */
@keyframes bar-glow {
  0%, 100% { opacity: 0.45; transform: translateY(2px) scaleX(0.96); }
  50% { opacity: 0.9; transform: translateY(2px) scaleX(1.0); }
}
.bar-shell { position: relative; }
.bar-shell::after {
  content: "";
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: -7px;
  height: 14px;
  border-radius: 9999px;
  background: linear-gradient(90deg, var(--ramp-1), var(--ramp-3));
  filter: blur(11px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}
.bar-shell:focus-within::after {
  opacity: 0.8;
  animation: bar-glow 2.8s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .bar-shell:focus-within::after { animation: none; opacity: 0.6; }
}
```

- [ ] **Step 2: Wrap the input in the glow shell + add hover lift in `page.tsx`**

The `<form>` already wraps input + button. Put the underglow on a wrapper around the **input** so the glow tracks the bar (not the button). Restructure the form's input so it sits in a `.bar-shell` flex-1 container:

```tsx
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
        className="flex w-full max-w-xl gap-2"
      >
        <div className="bar-shell flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full border border-white/50 bg-white/55 px-5 py-3 font-grotesk text-sm text-ink shadow-sm outline-none backdrop-blur transition placeholder:text-muted hover:border-accent/70 hover:-translate-y-px focus:border-accent motion-reduce:hover:translate-y-0"
            placeholder="Ask about a race weekend…"
          />
        </div>
        <button
          className="rounded-full bg-accent px-6 py-3 font-grotesk text-sm font-medium text-white shadow-sm transition hover:-translate-y-px hover:bg-accent-bright hover:shadow-[0_6px_20px_-6px_var(--ramp-2)] disabled:opacity-60 motion-reduce:hover:translate-y-0"
          disabled={loading}
        >
          {loading ? <PixelSpinner /> : "Ask"}
        </button>
      </form>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds (arbitrary-value classes compile).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/page.tsx
git commit -m "feat: hover lift + breathing focus underglow on the query bar and Ask button"
```

---

### Task 9: Full verification + reduced-motion pass

**Files:** none (verification only).

- [ ] **Step 1: Full test + build**

Run: `npx vitest run && npm run build`
Expected: all Vitest PASS (including new scatter/loading-lines/chips tests); `npm run build` clean.

- [ ] **Step 2: In-browser check (Chrome DevTools)**

Start the app (`npm run dev`) and verify, per the spec DoD:
- Helmet glyphs dissolve **cell-by-cell** (no 23-clump popping).
- Fog visibly **bolder**, answer + empty-state text still legible.
- Suggested-query chips **spawn at varied spots, drift/cycle**, and clicking one runs that query.
- Ask button shows the **pixel spinner** while a query is in flight.
- Loading text **varies across runs** (re-query a few times).
- Query bar shows **hover lift** and a **breathing underglow when focused**; Ask button lifts/glows on hover.
- Wordmark reads **`SECTOR4`**; the big answer number + section eyebrow render in **Mondwest** pixel serif.

- [ ] **Step 3: Reduced-motion pass**

In DevTools, emulate `prefers-reduced-motion: reduce` and confirm: helmet paints instantly, fog is a single static frame, chips render as a static wrapped row, spinner is a static glyph, the focus underglow does not breathe (static, dimmer). No console errors.

- [ ] **Step 4: Final commit (if any tuning changed files)**

```bash
git add -A
git commit -m "chore: M3 frontend polish — final verification tuning"
```

(Skip if nothing changed in Steps 1–3.)

---

## Self-Review

**Spec coverage:** (1) helmet scatter → Task 3; (2) bolder fog → Task 7; (3) drifting chips → Task 6; (4) remove Shaders attribution + dead reveal + dep → Task 1; (5) pixel spinner → Task 5; (6) creative loading lines → Task 4; (7) hover + focus underglow → Task 8; (8) type system (fonts, wordmark, Mondwest placements) → Task 2. Verification DoD → Task 9. All spec items covered.

**Placeholder scan:** No TBD/TODO; every code step shows full code. Fog constants are concrete (`0.32 + cv*0.62`, scrim `0.74/0.3`) with an in-browser tuning note (acceptable — visual). Font `.otf`→`.woff2` fallback is a concrete documented branch, not a placeholder.

**Type consistency:** `scatterDelay(i, span)` consistent (Task 3). `visibleChips(cycle, slotCount, total)` consistent (Task 6). `pickLoadingLine()`/`LOADING_LINES` consistent (Task 4). `PixelSpinner` no props (Task 5). `QueryChips` props `{ examples, onPick }` consistent (Task 6). Tailwind `font-pixel-serif`/`font-pixel` defined in Task 2 and used in Tasks 2/4. CSS `.bar-shell` defined + used in Task 8; `.chip-drift` defined + used in Task 6.
