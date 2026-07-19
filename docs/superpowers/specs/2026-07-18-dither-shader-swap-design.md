# Design — site-wide dither art swap (paper-design shader + Bayer glyphs)

Date: 2026-07-18
Status: approved direction (owner locked every visual call in the /lab/dither iterations);
spec pending owner review before plan/build.

## 0. Locked recipe (from /lab/dither, 7 owner-reviewed rounds)

- **Hero fog:** paper-design `Dithering` WARP, two multiply-stacked white-backed layers —
  blue `#406cd6` (size 2, speed 0.5, scale 0.8) + sky `#459ae4` (size 2, speed 0.35, scale
  0.55), 4x4 Bayer — over the white page, PLUS a cursor-trailing accent BLOB: an extra
  accent-`#2f2e89` warp layer on a masked wrapper (soft radial ~130px, rAF-lerped 0.12,
  snap-on-entry, fade-out on leave) with `mix-blend-mode: multiply` on the WRAPPER (the mask's
  stacking context isolates inner blends — lab-learned).
- **Card bloom:** the same warp pair masked to CardFog's bottom-right radial
  (`radial-gradient(120% 120% at 100% 100%, black 0..35%, transparent 72%)`), multiply on the
  masked wrapper, fade in/out on hover.
- **Identity glyphs (helmets + emblems):** `BayerGlyph` — the exact coloured site SVG drawn to
  a **cell=1** grid, 4x4 Bayer threshold applied to the ALPHA channel only → solid exact fills
  (shell/visor/vent), ordered-dither edges hugging the outline. Static; crisp numeral overlay
  (NUMBER_POS/numberColor). Deterministic canvas, no WebGL contexts.

## 1. Architecture — swap the renderers INSIDE the existing components

Zero call-site churn; popover/entity-what/badge integrations untouched.

1. **New `app/components/DitherFog.tsx`** (client): the locked hero recipe (2 layers + blob),
   `{ className }` API like AsciiFog. Replace `<AsciiFog>` in **`app/page.tsx`** and
   **`app/weekend/page.tsx`** with `<DitherFog>`. `AsciiFog.tsx` stays (CardFog's internals
   reference it today; the lab control uses it; delete in a later cleanup once unreferenced).
2. **`CardFog.tsx` internals → dither bloom** (keep `{ active }` API; `ConceptCard` untouched).
   The shader mounts ONLY while `active` or fading out, and unmounts after — /learn renders a
   grid of cards, and always-mounted per-card contexts would hit the browser WebGL context cap
   (the lab's eviction lesson). ≤2 contexts alive at any time.
3. **`AsciiGlyph.tsx` internals → Bayer renderer** (keep API `{code, team, size, cols?}` —
   `cols` accepted but ignored). Paint = BayerGlyph logic over `helmetSvgMarkup(g, false)`,
   cell 1, DPR≤2; crisp numeral overlay kept. **Reveal:** replace the scatter-in with a
   **Bayer-ordered dither-resolve**: paint cells whose Bayer threshold < t, animate t 0→1 over
   ~450ms ease-out (the pattern "resolves in" in dither order — same spirit, native to the new
   look). Reduced motion → instant full paint. `DriverGlyph` stays the SSR/no-canvas fallback.
4. **`AsciiEmblem.tsx` internals → Bayer renderer** (keep API `{kind, size, cols?, animate?,
   color?}`). SVG kinds (tyre/airflow/flag/battery) render via `emblemSvgMarkup(kind, color)`;
   **car** renders its coverage bitmap (`car-silhouette`) to an offscreen canvas in the brand
   colour, then the same Bayer alpha pass. Same dither-resolve reveal when `animate`, instant
   under reduced motion.
5. **Extract the shared Bayer renderer to `app/lib/bayer.ts`** (pure: grid sample → threshold →
   cell list) so AsciiGlyph/AsciiEmblem/lab share one implementation and the sampling logic is
   unit-testable without canvas.

## 2. Untouched

- **og-image** (`app/opengraph-image.tsx`): server-rendered ASCII fog via the noise lib — no
  WebGL possible there. Stays as-is this slice (brief og-vs-site style gap accepted; optional
  follow-up to restyle it toward the dither look with a server-side Bayer pass).
- `/lab/dither` stays as the reference/tuning page (AsciiFog control intact).
- TyreSpinner, `.fog-in` CSS entrances, `.legible` scrims, fonts, palette.

## 3. Perf / correctness constraints

- WebGL context budget per page: hero 3 (2 layers + blob), card bloom ≤2 transient. Never
  mount a shader per list item.
- Reduced motion: fog speed 0 + no blob; glyph/emblem reveal instant. (House rule.)
- SSR: DitherFog/CardFog client-only (they already are); glyph SSR fallback stays DriverGlyph.
- Numbers/text remain crisp overlays — never dithered.
- Bundle: `@paper-design/shaders-react` already a dep (lab). No other additions.

## 4. Tests

- `app/lib/bayer.ts`: pure sampling/threshold unit tests (solid interior always passes; alpha
  edge dithers by the 4x4 matrix; cell=1 grid dims).
- Component swaps verified by tsc + build + existing vitest (no call-site API changes).
- Visual: owner eyeballs preview (home, /weekend, /learn card hover, /learn emblems,
  /accuracy emblem, past-predictions modal helmets).

## 5. Rollout

One branch/PR. Old components retired only after their last reference drops (AsciiFog kept for
og/lab). If the preview eyeball fails on any surface, that surface can revert to the old
component with a one-line import change — the APIs are unchanged.
