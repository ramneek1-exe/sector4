# Hero Reveal — Curtain Lift with Parallax

**Date:** 2026-07-25
**Status:** Implemented (spec approved, visual pass recorded)
**Scope:** Landing page (`/`) only. Frontend-only. No API / Python / data / cron change.
**Supersedes:** the "lights out → dissolve" handoff in
`docs/superpowers/specs/2026-07-24-landing-preloader-start-lights-design.md` §Visual.

## Summary

The start-lights preloader currently hands off to the hero with a flat
`opacity: 1 → 0` dissolve over 300ms, while the hero's `.fog-in` un-pauses at the same
instant. Two problems, both confirmed by the owner:

1. **The dissolve is plain.** A uniform crossfade reads as nothing happening; the moment
   should carry the energy of a race start.
2. **The text reveal is wasted.** `.fog-in` runs 0.7s, but it is released at the same
   moment the dissolve begins — so the first ~300ms of it plays *underneath an opaque
   overlay* and is never seen.

This replaces the dissolve with a **vertical curtain lift with parallax**: the warm field
lifts straight up out of frame, and the light gantry lifts further and faster on top of it,
so the nearer object travels more. The hero's text is held until the curtain is ~65% clear,
so its full 0.7s reveal plays in open air.

## Goals

- Replace the flat dissolve with a directional, depth-cued exit.
- Give the hero's `.fog-in` reveal its full duration in the clear.
- Fix the logged a11y minor: hero elements are `opacity: 0`-but-focusable during the
  sequence.
- Keep the change small: no new files, no canvas, no new dependency.
- Zero regression to reduced-motion, no-JS, repeat-visit, or non-hydrating paths.

## Non-goals

- No change to the arming sequence — cadence, lamp visuals, housings, hero-readiness
  gating and the hard cap are all untouched. This spec covers only what happens *after*
  lights-out.
- No change to the hero's video, dither recipe, copy, or the `.fog-in` keyframes
  themselves (`.fog-in` is used site-wide; only *when* it is released changes).
- No dither/disintegration treatment. That approach was considered and rejected — see
  §Approaches considered.
- No site-wide preloader change. Landing `/` only.

## Approaches considered

**A. Bayer dither disintegration (rejected — complexity).** The warm field breaks up
through the site's own ordered-dither ramp, cells dropping out coarse-to-fine.
`bayerThreshold8(x, y)` in `app/lib/bayer.ts` already *is* the ordering function, and
because the field is a solid color no `ImageData` sampling is needed — a cell clears when
`progress >= bayerThreshold8(x, y)`. Strongest brand fit, since dither is the site's
signature texture.

Rejected because making the **gantry disintegrate with the field** (the owner's preference,
and the only version that reads as one image rather than DOM sitting on top of an effect)
requires rasterizing the DOM gantry into the canvas. The safe way to do that is a
*measured twin* — read each live housing/lamp `getBoundingClientRect()` at lights-out and
repaint from those measured rects, so `clamp()`-based lamp sizing can't drift. That is
~3 new modules plus tests, a main-thread rAF loop, DPR handling, and a one-frame swap
risk, to buy a visual the site already expresses elsewhere (hero video, glyphs, card
blooms).

**B. Curtain lift with parallax (chosen).** Two `transform` keyframes on two elements that
already exist. Runs on the compositor, needs no measurement, and cannot drift. The cost is
that this moment stops speaking the dither vocabulary and reads clean/editorial instead —
accepted deliberately in exchange for the complexity saved.

**C. DOM cell grid, no canvas (rejected).** A grid of divs with Bayer-derived
`transition-delay`. At 24px cells that is ~2,280 elements on a 1440×900 viewport, reads
blocky rather than dithered, and the gantry physically cannot disintegrate with it.

## Concept & behavior (locked)

- **Direction:** straight up. The hero is revealed bottom-first.
- **Parallax:** the gantry is drawn *on* the field, so it is the nearer object and must
  travel further. Field lifts 100vh; gantry lifts 130vh total.
- **Composition:** the gantry row is already a child of the overlay, and child transforms
  compose with the parent — so the gantry's keyframe carries only the **extra** 30vh, not
  the full 130vh. No DOM restructure.

> **Note on units.** The gantry differential must be expressed in `vh`, not `%`.
> A percentage `translateY` resolves against the *element's own* height, and the gantry row
> is roughly 150px tall — `translateY(-30%)` would be a ~45px nudge, not a parallax.

### Timeline (from lights-out)

```
t+0ms      all five housings go dark
t+0ms      LIGHTS_OUT_HOLD_MS begins — a beat on the dark gantry (the "GO" moment)
t+120ms    curtain starts
             field  translateY(0 → -100%)   over CURTAIN_MS
             gantry translateY(0 → -30vh)   over CURTAIN_MS   (extra, composes to 130vh)
             ease   cubic-bezier(0.76, 0, 0.24, 1)
t+705ms    [data-preloader-active] dropped  (120 + 900 × 0.65)
             -> h1 .fog-in starts in open air; CTA +0.18s; scroll cue +0.36s
t+1020ms   overlay unmounts (phase -> "done")
```

Worst case from `t0`: `HARD_CAP_MS` (5500) + 1020 = **6520ms**, backstopped at
`postHydrationFailsafeMs()` = 7020ms (6520 + 500 slack) — on that SAME `t0` clock. The inline
`HERO_FAILSAFE_MS` (8000ms, measured from HTML parse in `app/page.tsx`) now covers only the
"React never hydrates" case: once `StartLights` mounts, it clears that inline timer and owns
the release from its own `t0`. The two are deliberately no longer compared, so hydration time
can't eat into the sequence's headroom the way it previously did.

## Implementation

Four files changed. No new files.

### `app/lib/start-lights.ts` (pure — no `"use client"`)

`OUT_MS` (300) is removed and replaced by:

```ts
export const LIGHTS_OUT_HOLD_MS = 120;   // dark-gantry beat before the lift
export const CURTAIN_MS = 900;
export const TEXT_RELEASE_FRAC = 0.65;
export const HERO_FAILSAFE_MS = 8000;    // the inline gate's failsafe in page.tsx

/** ms after lights-out at which [data-preloader-active] is dropped. */
export function textReleaseDelayMs(): number;   // 705

/** ms after lights-out at which the overlay unmounts. */
export function overlayTeardownMs(): number;    // 1020
```

`HERO_FAILSAFE_MS` lives here so `app/page.tsx` can interpolate it into the inline gate
string rather than hard-coding `8000` in a JS string literal that has to be kept in sync
by hand. This file has no `"use client"`, so importing it from the server component is
safe (unlike `app/lib/gsap.ts` — see that file's header comment). Only a number is
interpolated into `dangerouslySetInnerHTML`.

### `app/components/StartLights.tsx`

`release()` splits from one beat into three. It currently drops the attribute immediately
and unmounts after `OUT_MS`; it becomes:

```
setPhase("out")                    // lamps dark; sessionStorage key written (unchanged)
 + textReleaseDelayMs()  ->  root.removeAttribute("data-preloader-active")
 + overlayTeardownMs()   ->  setPhase("done")
```

Both timers go through the existing `timers[]` array so the effect's cleanup still clears
them. The overlay `<div>` and the gantry row `<div>` each get an `animation` whose
`animation-delay` is `LIGHTS_OUT_HOLD_MS`, plus `willChange: "transform"`. The gantry row
gains a `start-lights-gantry` class as a reduced-motion hook.

**The `arming` path is not touched.** Lamp visuals, housing geometry, cadence, hero-readiness
gating and the hard cap all stay exactly as tuned.

### `app/globals.css`

`@keyframes preloaderDissolve` is replaced by:

```css
@keyframes preloaderCurtain       { to { transform: translateY(-100%); } }
@keyframes preloaderCurtainGantry {
  0% { transform: translateY(0); filter: blur(0px); }
  30% { filter: blur(1.7px); }
  100% { transform: translateY(-30vh); filter: blur(14px); }
}
```

The gantry's blur-out was added during the visual pass (see §Visual pass) — it is held
sharp through the easing's slow start, then smears over the fast exit so it reads as
speed rather than soft focus. Blur is on the gantry only; the field behind it stays clean.
Because of it the gantry row carries `willChange: "transform, filter"` while the overlay
keeps plain `willChange: "transform"`.

The existing reduced-motion `animation: none !important` block extends to
`.start-lights-gantry` alongside `.start-lights-overlay` (defense-in-depth; the overlay is
already JS-gated off under reduced motion).

**a11y fix**, on the rule that already exists:

```css
[data-preloader-active] .fog-in {
  animation-play-state: paused;
  visibility: hidden;      /* added */
}
```

This closes the logged minor — the hero CTA was `opacity: 0` but still focusable and still
in the accessibility tree beneath an opaque overlay, so a keyboard user tabbing early hit
an invisible target. `visibility: hidden` removes an element from both the tab order and
the a11y tree. It was chosen over `inert` because it is pure CSS on an existing rule: it
applies pre-paint, requires no JS, and reverts automatically when the attribute drops, so
there is no teardown path that could strand the hero permanently unfocusable. `inert`
would need an element to target that does not yet exist when the inline gate runs, plus
its own removal in both the island and the failsafe.

The resume is clean: `fogIn` starts at `opacity: 0`, so flipping to visible at release
shows nothing until the animation paints it.

### `app/lib/start-lights.test.ts`

Add cases for `textReleaseDelayMs()` and `overlayTeardownMs()`, plus one regression guard
that is currently unprotected:

```
HARD_CAP_MS + overlayTeardownMs() < HERO_FAILSAFE_MS      // 6520 < 8000
```

If a future timing tweak pushes the sequence past the failsafe, the failsafe fires
*during* the curtain and the hero is revealed early or left mid-state. Nothing catches
that today.

## Edge cases (all unchanged from current behavior)

| Path | Behavior |
|---|---|
| Repeat visit in session | Inline gate never sets the attribute; overlay never mounts; `.fog-in` runs immediately, zero added delay. |
| `prefers-reduced-motion: reduce` | Same as above, plus `.fog-in` has `animation: none` and the overlay/gantry keyframes are force-disabled. |
| No JS | Attribute never set; hero renders and animates normally. |
| React never hydrates | Inline failsafe drops the attribute at `HERO_FAILSAFE_MS`; hero reveals. |
| `sessionStorage` unavailable (private mode) | Existing `try/catch` — sequence still plays and reveals, just replays next visit. |

## Verification

- `vitest` — new timing helpers + the failsafe invariant; full suite green.
- `tsc` + `npm run build` clean.
- Live eyeball on a prod build in a fresh isolated context (`rm -rf .next && npm run build`
  first — `npm run dev` overwrites `.next`), confirming: curtain lifts up, gantry clears
  the top edge before the field, hero text begins its rise in open air rather than under
  the overlay.
- Reduced-motion: hero present immediately, no curtain, no stepping.
- Keyboard: Tab during the sequence must not land on the hero CTA.
- Repeat visit: no overlay, no delay.

## Visual pass

The owner's pass chose a 900ms curtain duration and kept the 30vh gantry differential and
the `cubic-bezier(0.76, 0, 0.24, 1)` easing. A 14px gantry blur-out was added during this
pass at the owner's request, beyond the original spec — the gantry smears as it accelerates
away, held sharp through the easing's slow start and then blurring hard over the fast middle
and exit to read as speed. Blur applies to the gantry only; the field stays clean.
