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

No React, no DOM. Timing math only. Exposes:

- `armSchedule(): number[]` — the illuminate timestamp for each of the 5 dots
  (`[0, 240, 480, 720, 960]` ms). Component uses these to stagger the "on" state.
- `pickHold(rand: () => number): number` — random hold in `[HOLD_MIN_MS, HOLD_MAX_MS]`,
  `rand` injected for deterministic tests.
- `resolveLightsOut({ hold, heroReadyAt }): number` — returns
  `clamp(max(ARM_DONE_MS + hold, heroReadyAt ?? Infinity), 0, HARD_CAP_MS)`. When
  `heroReadyAt` is `null` (never ready), the `max` with `Infinity` collapses to the cap.
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

## Visual treatment (structure locked, look chosen at build)

Locked here:
- Five abstract dots, horizontal row, centered on a full-bleed field overlaying the hero.
- Dots arm L→R, hold, extinguish together, field dissolves to reveal hero.
- Dissolve uses the site's dither vocabulary where feasible (ties the preloader to the
  established Ascii/Dither system), but a plain opacity/blur dissolve is an acceptable
  fallback if a shader dissolve risks a WebGL-context-at-unmount cost.

NOT locked (decided during the build's visual pass, per the project's standing rule that
visual/design changes need 2–4 rendered candidates shown before commit —
`feedback_visual_changes_show_candidates`):
- Dot color when armed (warm "ready" red vs brand accent `#406cd6`) and when off.
- Backdrop: light `#fafafa` vs dark `ink`.
- Dissolve style (dither dissolve vs opacity/blur) and dot geometry/spacing/glow.

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

`app/lib/start-lights.test.ts` (vitest, pure):
- `armSchedule()` returns `[0, 240, 480, 720, 960]`; `ARM_DONE_MS === LIGHT_COUNT * ARM_INTERVAL_MS`.
- `pickHold(() => 0) === HOLD_MIN_MS`; `pickHold(() => 0.999...) ≈ HOLD_MAX_MS`; bounds hold.
- `resolveLightsOut`: hold-dominates case (`heroReadyAt` small) → `ARM_DONE_MS + hold`;
  heroReady-dominates case → `heroReadyAt`; `heroReadyAt === null` → `HARD_CAP_MS`; any input
  over cap → clamped to `HARD_CAP_MS`.

`StartLights` component behavior (where practical under jsdom):
- session flag present → renders nothing.
- reduced-motion → renders nothing.
- neither → renders overlay; sets flag on completion.

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
