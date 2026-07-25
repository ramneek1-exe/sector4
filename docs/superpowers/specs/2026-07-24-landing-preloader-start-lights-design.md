# Landing Preloader — Start-Lights Sequence + Hero Reveal

**Date:** 2026-07-24
**Status:** Design (approved in brainstorm, pending spec review)
**Scope:** Landing page (`/`) only. Frontend-only. No API / Python / data / cron change.

## Summary

The last deferred piece of the landing-v2 ordering: a preloader that plays once per
session on the landing page, then hands off to the hero's existing reveal. The concept is
an **F1 start-lights sequence** rendered as **abstract dots** (no FOM light gantry, no F1 /
FIA marks — per PRD §8 hard constraints): five dots arm left-to-right, hold on a random
suspense beat, then extinguish simultaneously ("lights out") to trigger the hero reveal.

The sequence is **gated on hero readiness** and **hard-capped in time**, so it never flashes
an unpainted hero and never drags. Reduced-motion and no-JS users see the hero immediately.

## Goals

- Play a start-lights preloader on the first landing-page visit per browser session.
- Release ("lights out") = whichever is later of a random suspense hold or hero assets being
  ready, hard-capped so total time is bounded.
- Hand off cleanly to the hero's existing `fog-in` reveal, without the thesis/CTA animating
  in *behind* the overlay.
- Zero regression to SSR content, no-JS, reduced-motion, or search-engine crawlability.

## Non-goals

- No site-wide preloader — landing `/` only. In-app navigation is unaffected.
- No change to the hero's video, dither recipe, or copy.
- No persistent (localStorage) or every-load behavior — session-scoped only.
- Exact visual styling (colors, backdrop, dissolve) is NOT locked here — see §Visual.

## Concept & behavior (locked)

- **Concept:** F1 start-lights, abstract dots. Not a reproduced FOM light gantry.
- **Frequency:** once per session (`sessionStorage`). Repeat visits / back-nav within the
  session → instant hero, no preloader.
- **Cadence:** snappy — 5 dots arm over ~1.2s (~0.24s each), hard cap 2.5s from t0.
- **Release rule:** `lightsOutAt = clamp(max(armDone + randomHold, heroReadyAt), 0, HARD_CAP)`
  where `randomHold ∈ [0.2s, 0.8s]`. If hero never signals ready, the hard cap fires it.
- **Reduced-motion:** skip the whole sequence — hero shows immediately, no overlay.

### Timing constants (single source, in `start-lights.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `LIGHT_COUNT` | 5 | number of dots |
| `ARM_INTERVAL_MS` | 240 | delay between each dot arming |
| `ARM_DONE_MS` | 1200 | `LIGHT_COUNT * ARM_INTERVAL_MS` — all armed |
| `HOLD_MIN_MS` | 200 | min random suspense hold after arm |
| `HOLD_MAX_MS` | 800 | max random suspense hold after arm |
| `HARD_CAP_MS` | 2500 | absolute ceiling for lights-out from t0 |
| `OUT_MS` | 300 | extinguish + dissolve duration |

`ARM_DONE_MS` is derived (`LIGHT_COUNT * ARM_INTERVAL_MS`), asserted in a test so the two
never drift.

## Architecture

Two units, clear boundary:

### `app/lib/start-lights.ts` (pure, tested)

No React, no DOM. Timing math + the pixel-disc cell generator. Exposes (plus `discCells`
below for the dither dots):

- `armSchedule(): number[]` — the illuminate timestamp for each of the 5 dots
  (`[0, 240, 480, 720, 960]` ms). Component uses these to stagger the "on" state.
- `pickHold(rand: () => number): number` — random hold in `[HOLD_MIN_MS, HOLD_MAX_MS]`,
  `rand` injected for deterministic tests.
- `resolveLightsOut({ hold, heroReadyAt }): number` — returns
  `clamp(max(ARM_DONE_MS + hold, heroReadyAt ?? Infinity), 0, HARD_CAP_MS)`. When
  `heroReadyAt` is `null` (never ready), the `max` with `Infinity` collapses to the cap.
- `discCells(cols, color, cutoff?): BayerCell[]` — builds an `cols×cols` RGBA coverage field
  for a centered filled circle (distance-based anti-aliased edge) and runs it through
  `thresholdCells` (`app/lib/bayer.ts`) to yield the hard-threshold pixel-disc cells. Pure
  (builds a `Uint8ClampedArray` directly, no canvas), so it is node-testable. The component
  feeds the result to `useRevealCanvas` for the actual paint.
- Constants above re-exported for the component and tests.

### `app/components/StartLights.tsx` (client island)

`"use client"`. Renders the overlay + drives the state machine off real events/timers.

- Mounted in `app/page.tsx` as a **sibling that overlays the hero** (`fixed inset-0 z-50`),
  NOT a child of the hero section (keeps hero markup / SSR untouched, same additive-chrome
  pattern the landing already uses).
- **State machine:** `arming → holding → out → done`.
  - `arming`: dots turn on per `armSchedule()`.
  - `holding`: `pickHold()` chosen on mount (via `Math.random`); listens for `heroReady`.
  - transition to `out` at `resolveLightsOut(...)` ms after mount (a single `setTimeout`
    recomputed once `heroReadyAt` is known, but never later than the cap — a cap timer is
    armed unconditionally at mount so a missing `heroReady` still releases).
  - `out`: all dots extinguish + overlay dissolves over `OUT_MS`; hero reveal released at the
    start of `out`.
  - `done`: overlay unmounts (no lingering WebGL/canvas held at rest — same lifecycle
    discipline as `CardFog`/`DitherShadow`), `sessionStorage["s4-preloaded"] = "1"` set.
- **`heroReady` signal:** the hero `<video>`'s `canplay` event AND first dither frame painted.
  Simplest robust wiring: a small ready callback the overlay subscribes to. If precise dither
  paint is awkward to observe, fall back to `canplay` alone plus a short raf tick — the hard
  cap is the ultimate backstop, so `heroReady` precision is not safety-critical.
- **Skip conditions (render nothing, hero instant):**
  - `sessionStorage["s4-preloaded"]` already set, OR
  - `prefers-reduced-motion: reduce`.
  Both evaluated before first paint of the overlay to avoid a flash — the overlay is gated
  behind a `useState` initialized in a mount effect; until it resolves to "show", nothing is
  rendered and the hero reveal is NOT delayed (see below).

### Hero reveal handoff

Today the hero's thesis/CTA/cue carry `fog-in` (CSS animation, runs on mount) with staggered
`animationDelay`s. With a preloader they must NOT animate while the overlay covers them.

- **Mechanism:** the overlay owns a "revealed" signal. While the preloader is active
  (`arming`/`holding`), the hero reveal is held; at the `out` transition it's released and the
  existing `fog-in` runs as-is (thesis, then CTA +0.18s, then cue +0.36s — unchanged).
- **Implementation:** gate the `fog-in` start via a `data-hero-revealed` attribute on a hero
  wrapper (or a `paused` animation-play-state flipped to `running`). Preferred: the four
  `data-hero` layers get `animation-play-state: paused` by default under a
  `[data-preloader-active]` root attribute, flipped to running when the overlay releases.
  This keeps the hero purely CSS-driven and requires no JS to reveal in the skip/no-JS/
  reduced-motion paths (where `[data-preloader-active]` is never set, so play-state stays the
  CSS default `running` — hero animates normally on load exactly as it does today).
- **Critical invariant:** in every skip path (session flag set, reduced-motion, no JS), the
  hero must animate/appear on load with NO added delay. The pause is applied ONLY when the
  overlay is actually going to play. Test both branches.

## Visual treatment (dither/pixel direction locked, exact look chosen at build)

Locked here:
- Five abstract dots, horizontal row, centered on a full-bleed field overlaying the hero.
- **Dither/pixel vibe (owner direction):** each dot is rendered as a hard-threshold
  **pixel-art disc**, not a smooth CSS circle — the same rasterise → grid-sample →
  `thresholdCells` (`app/lib/bayer.ts`) → canvas-paint vocabulary the site's
  `AsciiEmblem`/`AsciiGlyph` already use, with `image-rendering: pixelated` for chunky
  8-bit pixels. Hard-threshold quantization (NOT ordered-Bayer edge dither) at a chunky
  cell size — per the emblem finding (`sector4_emblem_pixel_art_no_dither`).
- **2D canvas, NOT WebGL/shader.** Five simultaneous shader canvases would risk the browser's
  ~16 WebGL-context cap (the lab lesson); `thresholdCells` + 2D canvas is deterministic and
  cheap. One canvas per dot (5 total) or a single canvas — implementation detail.
- Dots arm L→R (each disc paints in on its cadence beat), hold, extinguish together, field
  dissolves to reveal hero.
- Dissolve = overlay opacity fade (`preloaderDissolve` keyframe). A dither dissolve is a
  nice-to-have but must not hold a WebGL context at unmount — opacity fade is the safe
  default.

NOT locked (decided during the build's visual pass, per the project's standing rule that
visual/design changes need 2–4 rendered candidates shown before commit —
`feedback_visual_changes_show_candidates`):
- Dot color when armed (warm "ready" red vs brand accent `#406cd6`) and when off; dot size,
  spacing, cell chunkiness.
- Backdrop: light `#fafafa` vs dark `ink`.
- Any glow/scanline flourish on the panel.

**Constraint reminder:** abstract dots only. No FOM light gantry silhouette, no F1/FIA/FOM
marks, no team liveries. Color coding is fine; brand/warm tones only.

## Reduced-motion / no-JS / SSR safety

- **SSR:** `StartLights` renders nothing on the server (client-gated). Crawlers + no-JS get
  the full hero + content immediately.
- **No-JS:** `[data-preloader-active]` never set → hero `fog-in` runs on load (CSS only) →
  hero appears normally. No overlay ever shown.
- **Reduced-motion:** overlay skipped; hero shown instantly. The hero's own `fog-in` is
  already `animation: none` under `prefers-reduced-motion` (globals.css), so reduced-motion
  users get static content with zero delay — unchanged from today.

## Testing

vitest runs in the **`node`** environment (no jsdom) — tests are pure, no DOM/component
render. The component is verified via build + live eyeball, matching the repo's standing
pattern (client visuals eyeballed on the deploy).

`app/lib/start-lights.test.ts` (vitest, pure):
- `armSchedule()` returns `[0, 240, 480, 720, 960]`; `ARM_DONE_MS === LIGHT_COUNT * ARM_INTERVAL_MS`.
- `pickHold(() => 0) === HOLD_MIN_MS`; `pickHold(() => 1) === HOLD_MAX_MS`; result within bounds.
- `resolveLightsOut`: hold-dominates case (`heroReadyAt` small) → `ARM_DONE_MS + hold`;
  heroReady-dominates case → `heroReadyAt`; `heroReadyAt === null` → `HARD_CAP_MS`; any input
  over cap → clamped to `HARD_CAP_MS`.
- `discCells(cols, color)`: non-empty for a small grid; a center cell is present and a corner
  cell is absent (circle, not square); count is symmetric across the vertical axis.

Full-branch: vitest all-green, `tsc` + `npm run build` clean. Live eyeball on the deploy
(overlay only meaningfully runs against real hero assets): first visit plays; reload within
session is instant; reduced-motion instant; no horizontal overflow; no hydration/console
errors. Prod-build verify per repo ops rule (`rm -rf .next && npm run build`, never verify a
prod build after `npm run dev`).

## Files

- `app/lib/start-lights.ts` (new) + `app/lib/start-lights.test.ts` (new)
- `app/components/StartLights.tsx` (new)
- `app/page.tsx` (mount overlay; add `data-preloader` hook plumbing — hero markup otherwise
  untouched; `data-hero` attrs already in place)
- `app/globals.css` (dot arm/extinguish/dissolve keyframes; `[data-preloader-active]`
  play-state gate for the hero `fog-in`; all reduced-motion guarded)

## Open decisions deferred to build

- Exact visual candidates (§Visual) — resolved via rendered candidates before commit.
- Precise `heroReady` wiring (`canplay` + dither-paint vs `canplay` + raf) — hard cap is the
  backstop, so this is a robustness detail, not a correctness gate.

## Visual-pass revisions (2026-07-24, owner-directed, post-build)

Live iteration with the owner during the controller-led visual pass changed three
things from the design above (owner reference image = an F1 start-light gantry with
red LED-halftone lamps on warm cream):

- **Look: abstract horizontal dots → a row of abstract light HOUSINGS.** Each of the
  LIGHT_COUNT housings is a dark rounded-rect (4px radius) holding 2 circular lamps
  filled with a red **LED-halftone dot-matrix** (CSS `radial-gradient` dot grid — the
  "dither" texture the owner wanted; NOT the ordered-Bayer canvas, NOT a per-dot WebGL
  shader). Lit lamps ramp on with a red glow; unlit are grey-dotted. Warm paper backdrop
  `#f3eee6`. Still **abstract + unbranded** — no FOM gantry likeness, no F1/FIA/FOM marks
  or liveries (PRD §8). This supersedes the earlier "abstract dots, not FOM light gantry"
  framing: the owner asked for the gantry FEELING, delivered without any branding.
- **Cadence: snappy (~2.5s cap) → real-F1 (~4-5s).** `ARM_INTERVAL_MS` 240→800 (lights
  arm ~1/sec, arm done at 4000ms), `HARD_CAP_MS` 2500→5500. Random hold 200-800 unchanged.
  Live-verified: housings light sequentially ~800ms apart, lights-out + dissolve ~4.8s.
- **Robustness: added a pure-JS failsafe.** The inline gate now also arms
  `setTimeout(removeAttribute, 8000)` so the hero reveals even if the React bundle never
  hydrates (final-review Important finding — the paused fog-in must never strand the hero
  invisible). 8s is well past the ~5s sequence.

The pure timing module dropped `discCells` (the canvas pixel-disc generator + its tests)
when the dots became CSS halftone; `start-lights.ts` is now timing-only.

**Open Minor (a11y, for final triage):** the hero CTA sits opacity-0-but-focusable under
the opaque overlay for the ~4-5s sequence; a keyboard user tabbing immediately lands on an
invisible target. Low-risk (reduced-motion users skip the overlay entirely) but the window
grew with the longer cadence — decide whether to make the hero `inert` while active.
