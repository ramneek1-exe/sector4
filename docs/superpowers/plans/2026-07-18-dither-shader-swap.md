# Site-wide dither art swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the locked /lab/dither recipe site-wide: DitherFog hero (warp blue+sky + cursor blob) on home + /weekend, dither corner bloom in CardFog, Bayer solid-fill/dither-edge rendering inside AsciiGlyph + AsciiEmblem. APIs unchanged; zero call-site churn.

**Architecture:** A pure `app/lib/bayer.ts` renderer (grid sample → alpha Bayer threshold → cell list with per-cell threshold for the dither-resolve reveal) shared by glyphs/emblems. Shader surfaces (fog, bloom) use `@paper-design/shaders-react` with the lab-learned rules: multiply on MASKED WRAPPERS (mask isolates blending), white-backed layers, tight WebGL-context budget.

**Tech Stack:** TypeScript/Next.js, `@paper-design/shaders-react` (already a dep), canvas 2D, vitest.

## Global Constraints

- **The locked recipe is exact** (spec §0): hero layers blue `#406cd6` (size 2, speed 0.5, scale 0.8) + sky `#459ae4` (size 2, speed 0.35, scale 0.55), 4x4, white `#fafafa` back, multiply; blob = accent `#2f2e89` warp (size 2, speed 0.9, scale 0.5) on a masked wrapper (radial 130px, lerp 0.12, snap-on-entry, fade 300ms) with multiply ON THE WRAPPER. Card bloom mask: `radial-gradient(120% 120% at 100% 100%, black 0%, black 35%, transparent 72%)`, fade 500ms. Glyphs: cell=1, DPR≤2, solid exact SVG colours, alpha-Bayer edges.
- **Multiply goes on masked wrappers, never on a canvas inside a masked wrapper** (mask creates a stacking context that isolates inner blends — the lab's white-circle/invisible-bloom bug).
- **WebGL context budget:** hero 3; CardFog bloom mounts ONLY while `active` or fading out (≤2 alive) — /learn is a card grid; never a context per list item at rest.
- **Reduced motion:** fog speed 0 + no blob; glyph/emblem reveal instant. (House rule.)
- **Component APIs unchanged:** `AsciiGlyph {code, team, size, cols?}` (cols accepted, ignored), `AsciiEmblem {kind, size, cols?, animate?, className?, color?}`, `CardFog {active}`, `DitherFog {className?}` mirroring AsciiFog. DriverGlyph SSR fallback + popover wiring intact. Crisp numeral overlay never dithered.
- **Untouched:** `app/opengraph-image.tsx`, `/lab/dither`, `AsciiFog.tsx` (still referenced by lab + CardFog history), TyreSpinner, `.fog-in`, `.legible`.
- **Commits:** conventional, description only. NO AI attribution / Co-Authored-By / robot emoji.
- Verify: `npm run test`, `npx tsc --noEmit`, `npm run build` after each task.

## File Structure

- `app/lib/bayer.ts` (NEW) + `app/lib/bayer.test.ts` (NEW) — pure Bayer sampling.
- `app/components/DitherFog.tsx` (NEW) — hero fog + blob.
- `app/page.tsx`, `app/weekend/page.tsx` (MODIFY) — `AsciiFog` → `DitherFog` (import + element only).
- `app/components/CardFog.tsx` (REWRITE internals, same API).
- `app/components/AsciiGlyph.tsx` (REWRITE internals, same API + fallback + popover).
- `app/components/AsciiEmblem.tsx` (REWRITE internals, same API).

---

### Task 1: `app/lib/bayer.ts` — pure shared renderer

**Interfaces (later tasks consume):**
```ts
export const BAYER4: number[]; // 16 entries, 0..15
export const bayerThreshold: (x: number, y: number) => number; // (BAYER4[(y%4)*4+(x%4)]+0.5)/16
export type BayerCell = { x: number; y: number; color: string; t: number };
/** Cells whose alpha passes the ordered threshold. `t` is the cell's own threshold, reused
 *  by callers to order the dither-resolve reveal (paint cells with t <= progress). */
export function bayerCells(data: Uint8ClampedArray, cols: number, rows: number): BayerCell[];
```

- [ ] Write failing tests `app/lib/bayer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BAYER4, bayerThreshold, bayerCells } from "./bayer";

function px(cols: number, rows: number, fill: (x: number, y: number) => number[]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(cols * rows * 4);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * cols + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
  return d;
}

describe("bayer", () => {
  it("matrix is a 4x4 permutation of 0..15 and thresholds are in (0,1)", () => {
    expect([...BAYER4].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(bayerThreshold(0, 0)).toBeGreaterThan(0);
    expect(bayerThreshold(3, 3)).toBeLessThan(1);
  });
  it("solid interior always passes; fully transparent never does", () => {
    const solid = bayerCells(px(4, 4, () => [10, 20, 30, 255]), 4, 4);
    expect(solid).toHaveLength(16);
    expect(solid[0].color).toBe("rgb(10,20,30)");
    expect(bayerCells(px(4, 4, () => [0, 0, 0, 0]), 4, 4)).toHaveLength(0);
  });
  it("half-alpha edge dithers to roughly half the cells by the ordered matrix", () => {
    const n = bayerCells(px(4, 4, () => [0, 0, 0, 128]), 4, 4).length;
    expect(n).toBe(8); // alpha 128/255 ≈ 0.502 passes exactly thresholds (k+0.5)/16 for k<8
  });
});
```

- [ ] Implement (threshold pass: include cell when `a/255 >= bayerThreshold(x,y)`; color = `rgb(r,g,b)`; `t` = that threshold). Run tests → pass. `npx tsc --noEmit` clean.
- [ ] Commit: `feat: shared bayer alpha-dither renderer for glyphs and emblems`

---

### Task 2: `DitherFog` + hero swaps + `CardFog` bloom

- [ ] **`app/components/DitherFog.tsx`** (new, client). Port the lab's locked hero: the two multiply `Dithering` layers (exact params in Global Constraints) filling the component, plus the cursor-trailing blob (rAF-lerped CSS vars on a masked wrapper carrying `mixBlendMode: "multiply"`; inner Dithering plain). `{ className?: string }`; the root is `relative` and fills its box like AsciiFog. Reduced motion (matchMedia): speed 0, no blob. Reference implementation: `app/lab/dither/LabDither.tsx` `DitherHeroPanel` + `DitherLayers` (copy the logic, not an import — the lab stays independent).
- [ ] **Swap call sites:** in `app/page.tsx` and `app/weekend/page.tsx` replace the `AsciiFog` import + `<AsciiFog className=... />` element with `DitherFog` (same className). NOTHING else in those files changes.
- [ ] **`CardFog.tsx` internals:** keep `export function CardFog({ active }: { active: boolean })`. New internals: while `active` (or within a 500ms fade-out after deactivation), render the two warp layers inside a corner-masked wrapper (`CARD_MASK` from Global Constraints) with `mixBlendMode: "multiply"` on the wrapper + `opacity` transition driven by `active`; when inactive AND faded, render null (shader unmounted — context budget). Track the fade with a timeout/state. Reduced motion: static frame when shown (speed 0). Delete the old ASCII field internals.
- [ ] Verify: `npx tsc --noEmit`, `npm run test`, `npm run build` all clean; grep confirms no `AsciiFog` usage left in `app/page.tsx` / `app/weekend/page.tsx`.
- [ ] Commit: `feat: swap hero fog and card bloom to the locked dither warp recipe`

---

### Task 3: `AsciiGlyph` internals → Bayer + dither-resolve reveal

Keep EVERYTHING but the sampling + paint: props, entity-what popover button wiring, `DriverGlyph` fallback (SSR / pre-sample / canvas failure), aria attributes, crisp numeral overlay (`NUMBER_POS`, `g.numberColor`, 800 Arial — drawn on the canvas after cells, exactly as today).

- [ ] Replace the ASCII sampling (`sampleAscii`, cols=32, SS) with fine sampling: grid `cols = Math.round(size)`, `rows = Math.round(size * (HELMET_VIEWBOX.h / HELMET_VIEWBOX.w))` (cell = 1 CSS px), draw `helmetSvgMarkup(g, false)` to an offscreen canvas at grid size, `getImageData` → `bayerCells(data, cols, rows)` (Task 1).
- [ ] Paint: visible canvas at `size × height`, DPR≤2. Cell squares of exactly 1 CSS px at `(x, y)` in `cell.color`.
- [ ] **Reveal — Bayer-ordered dither-resolve:** animate `progress` 0→1 over 450ms ease-out; each frame paint cells where `cell.t <= progress` (the pattern resolves in dither order), then the numeral (alpha ramped in the last 30% as today). Reduced motion: paint everything immediately. Remove `scatterDelay` usage here.
- [ ] Verify: tsc + full vitest + build; grep confirms the popover/fallback blocks unchanged.
- [ ] Commit: `feat: helmet glyphs render solid fills with bayer-dithered edges and a dither-resolve reveal`

---

### Task 4: `AsciiEmblem` internals → Bayer (+ final verify)

Keep the API + the two source paths; both now feed `bayerCells`:

- [ ] **SVG kinds** (tyre/airflow/flag/battery): offscreen-draw `emblemSvgMarkup(kind, color)` at grid `cols = Math.round(size)`, `rows` from `emblemViewBox` aspect → `getImageData` → `bayerCells`.
- [ ] **Car:** draw the `CAR_SILHOUETTE` coverage bitmap to an offscreen canvas at its native `cols × rows` — per bitmap pixel `fillStyle` = the emblem colour (the `color` prop, default `#406CD6`) with `globalAlpha = coverage` — then `drawImage` scale that onto a second offscreen canvas at the target grid size, `getImageData` → `bayerCells`. (Coverage becomes alpha; the Bayer pass does the rest.)
- [ ] Paint + reveal identical to Task 3 (1px cells; `animate` → 450ms threshold sweep, else instant; reduced motion instant). Remove `scatterDelay`/`sampleAscii` usage here; keep the component `aria-hidden` decorative contract.
- [ ] **Final verify:** `npx tsc --noEmit`, `npm run test`, `npm run build` clean. Grep: `sampleAscii` no longer imported by AsciiGlyph/AsciiEmblem (still used by AsciiFog — untouched). All six surfaces build: home, /weekend, /learn, /learn/[slug], /accuracy, PastPredictions.
- [ ] Commit: `feat: emblems render via the shared bayer pipeline (svg kinds + car bitmap)`

---

## Self-Review

- Spec §1.1–1.5 ↔ Tasks 2 (DitherFog + swaps + CardFog), 3 (glyph), 4 (emblem), 1 (shared lib). §2 untouched-list respected (no task touches og/lab/AsciiFog/TyreSpinner). §3 constraints encoded in Global Constraints (context budget, wrapper-multiply, reduced motion, crisp numerals). §4 tests: bayer unit tests (T1), tsc/build/vitest per task, owner visual pass post-deploy. §5 rollback preserved (old components' files remain; call-site revert is one import).
- Types: `BayerCell {x,y,color,t}` consumed by T3/T4 paint loops; `bayerCells(data, cols, rows)` signature consistent; DitherFog `{className?}` matches both call sites' current `<AsciiFog className>` usage.
- No placeholders: T1 carries full code; T2–T4 name exact files, exact params, exact regions to preserve, with the lab file as the reference implementation for the ported logic.
