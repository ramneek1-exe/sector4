# Design — /lab/dither shader test page (paper-design Dithering evaluation)

Date: 2026-07-18
Status: approved (owner), building.

## 0. Goal

Owner found `@paper-design/shaders-react`'s `Dithering` shader (Apache 2.0, zero-dep, WebGL2
canvas) and wants to evaluate swapping the site's homegrown ASCII/dither artwork for it —
**matching or uplifting the current design**, judged in-situ with real site elements. Test page
first; no live-page changes.

Context: the PRD's "shaders.com WebGPU" plan was never adopted — current art is custom CPU canvas
(`AsciiFog` 6-stop palette fog on home//weekend/og, `CardFog` hover, `AsciiGlyph`/`AsciiEmblem`
glyph identity). `Dithering` is 2-color (colorBack/colorFront) with shapes
(simplex/warp/dots/wave/ripple/swirl/sphere) + ordered-dither types (random/2x2/4x4/8x8).

## 1. Deliverable — hidden `/lab/dither` route

Unlinked (no SiteNav), `robots: noindex`, client components. Sections:

- **A. Hero swap:** the real home-hero moment (h1 "Ask" + input-bar shell + `.legible` scrim +
  chips feel) over Dithering variants tuned to the brand palette, side-by-side with the real
  `AsciiFog`. Variants: ink `#251F44` bg + accent `#2F2E89`; ink + light `#addcef`; **two layered
  Dithering instances** (different shape/speed, blended) to fake the 6-stop palette depth.
- **B. Elements-on-dither:** `AsciiGlyph` driver row + `AsciiEmblem` (car/tyre) over dithered
  panels — does the abstract identity cohere on the new texture?
- **C. Card hover:** `CardFog` card vs a Dithering-powered hover card.
- **D. Playground grid:** small tiles, shapes × types (4x4/8x8) at brand colors; configs in one
  const array for fast tweaking.

## 2. Constraints

- New dep `@paper-design/shaders-react` (+ its peer `@paper-design/shaders` if required).
- Reduced motion: `speed=0` (static frame) under `prefers-reduced-motion`.
- og-image untouched (server-rendered, no WebGL).
- No live-page changes; the lab page is self-contained and deletable.
- Build task uses the `frontend-design` skill for hero-recreation quality.

## 3. Decision flow

Owner eyeballs the deployed page → picks direction (swap / partial adopt / reject). An actual
swap is its own slice later.
