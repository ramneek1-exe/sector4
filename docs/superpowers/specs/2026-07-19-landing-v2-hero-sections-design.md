# Landing v2 — hero rework + sector-numbered sections (design)

Date: 2026-07-19. Owner-brainstormed on branch `landing-page` (PR #37, landing v1 built and
preview-verified). This spec covers pass 1 of the owner's ordering: **hero first, then the
sections working downwards**. Explicitly deferred to their own later passes: **preloader +
hero reveal choreography** and the **footer redesign**. Scope here is `/` only, plus one
site-wide motion foundation (smooth scroll) that lands in `layout.tsx`.

## 0. Context

Landing v1 (PR #37) shipped a centered wordmark hero over a DitherVideo (fog fallback) and
four flat marketing sections. Owner review: keep the bones, redesign the hero as type-led
editorial (no wordmark), give the sections a brand conceit, and add real motion. The
licensed b-roll now exists: `public/hero.mp4` (960x540 H.264, 0.85MB, audio stripped,
faststart — recompressed from the 46MB original; dither sampling at ~240 cols makes the
resolution loss invisible).

## 1. Hero

- **Full-bleed dithered video**, `public/hero.mp4` through the existing `DitherVideo`
  (fog fallback path retained for error/reduced-motion/autoplay-block).
- **Light, site-matched recipe** — replace the dark purple/ice-blue palette with `#fafafa`
  paper + brand blues so the hero reads continuous with the rest of the site. Final
  `colorBack`/`colorFront`/`cols` values are tuned in the `/lab/dither` section E bench
  against the real footage before being hardcoded.
- **No wordmark in the hero.** The fixed nav carries the brand.
- **Centered, type-led thesis** (the statement IS the hero):
  > A lap has three sectors. This is the one where you find out why.
  Large serif (`font-pixel-serif` scale, like section headings but bigger), max-width
  constrained, `.legible` scrim retained (closest-side ellipse — see PR #36 lesson).
- **CTA unchanged:** "Ask your first question" → `/ask`.
- **Motion: minimal now, reveal-ready.** Keep the existing staggered one-shot entrance.
  Structure the DOM so the later preloader→hero reveal slots in without rework: the video
  layer, the thesis block, and the CTA are separately addressable elements (stable
  refs/classnames), no animation logic baked into markup. Scroll cue stays; its arrow may
  become a DrawSVG stroke (see §3).

## 2. Sections — sector-numbered conceit

Lean into the name. The four sections are presented as timing-sheet sectors, paying off the
hero thesis ("a lap has three sectors…").

**New order (S4 = brand payoff):**

| # | Section | Heading direction |
|---|---------|-------------------|
| S1 | Ask anything | **"Formula 1, minus the false confidence."** (owner-picked line) |
| S2 | Learn the sport | rewrite, teaching angle |
| S3 | This weekend | rewrite, race-date + sharpening-through-quali angle |
| S4 | Honest by design | rewrite as the payoff: the fourth sector is the truth; live scored-race count + "See the record" → `/accuracy` closes the page |

- **Sector numeral:** each section carries an oversized, faded timing-sheet numeral
  ("S1"…"S4", Space Grotesk, decorative aria-hidden), positioned per-section (offset,
  editorial — not identical stamps).
- **Timing-line divider:** an SVG line motif between sections that draws across on scroll
  (DrawSVG, §3). Replaces the current flat `border-t` rhythm.
- **Emblems kept** (flag/tyre/car) but repositioned per-section within the new grid.
- **Copy:** full rewrite per section in the implementation pass; S1 heading is locked
  (above). Tone: the site's existing honest/no-hype voice. All copy passes the existing
  constraint set (no invented facts, no em-dash-in-UI rule, bands-not-percentages framing).
- **Live scored count** behavior unchanged (renders only when the Blob fetch succeeds and
  count ≥ 1; degrades to copy).

## 3. Motion system (owner directive: GSAP, smooth)

- **Site-wide smooth scroll: Lenis** (new small dep) in a client `SmoothScrollProvider`
  mounted in `layout.tsx`, syncing ScrollTrigger (`lenis.on("scroll", ScrollTrigger.update)`
  + gsap ticker driving `lenis.raf`). Native scroll semantics are preserved, so the fixed
  nav, anchor links, and existing pages (`/ask`, `/weekend`, `/accuracy`, `/learn`) keep
  working untouched. **Disabled entirely under `prefers-reduced-motion`** (and Lenis is
  skipped on touch devices' native momentum by its defaults).
- **ScrollTrigger** (GSAP already a dep, 3.12.5): per-section in-view entrances — sector
  numeral, heading, body, link staggered; one timeline per section, `once: true`, no
  scrubbing/pinning/scrolljack.
- **DrawSVG** for vector draws: the timing-line dividers draw across on scroll; the hero
  scroll-cue arrow strokes in; emblem stroke accents only where an SVG path already exists.
  (GSAP + all former Club plugins — DrawSVG, SplitText, ScrollTrigger — are free from the
  `gsap` package post-Webflow.)
- **Reduced-motion:** every tween gated (`gsap.matchMedia`); content must be fully visible
  and functional with JS animations off (no opacity-0 stranding — set initial hidden states
  via GSAP, not CSS).
- **Hero:** minimal entrance only this pass (§1); the full GSAP choreography arrives with
  the preloader pass.

## 4. Out of scope (later passes, owner ordering)

1. **Preloader + hero reveal** (dither-resolve choreography) — next pass after sections.
2. **Footer redesign** — final pass.
3. Any change to `/ask`, `/weekend`, `/accuracy`, `/learn` beyond them inheriting smooth
   scroll from the layout provider.
4. og-image update for the landing (noted as open; separate slice if owner wants it).

## 5. Constraints and risks

- **Server/client boundary (PR #37 lesson):** no value imports from "use client" modules
  into server components; nav constants stay in `app/lib/nav.ts`. The new
  `SmoothScrollProvider` is a client component that wraps `{children}` in the server
  layout — children pass through as props (allowed); smoke with local `next start` + curl,
  not just `npm run build`.
- **WebGL budget:** hero mounts one shader canvas (DitherVideo canvas is 2D — fine);
  section motion is pure GSAP/SVG, no new shader mounts (context-cap lesson, PR #34/35).
- **Perf:** Lenis + ScrollTrigger are the only new runtime costs; `once: true` triggers
  kill themselves. hero.mp4 is 0.85MB.
- **A11y:** numerals/dividers `aria-hidden`; reduced-motion paths as §3; focus styles
  unchanged.
- **Video licensing:** owner purchased the b-roll; the compressed derivative is committed,
  the 46MB original stays out of the repo.

## 6. Success criteria

- `/` renders the type-led hero over the real dithered b-roll in the light recipe; fog
  fallback still works if the video errors.
- Sections read as S1→S4 with the reorder and new copy; S4 closes on the record link.
- Scroll feels smooth site-wide; dividers draw in; entrances stagger on scroll; ALL of it
  inert under `prefers-reduced-motion` with content fully visible.
- `next start` smoke: `/` and `/ask` 200; vitest + tsc + build clean.
