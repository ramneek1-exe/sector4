# DitherVideo paint-loop throttle — design

2026-07-26. Follows the SEO audit's performance finding (`sector4.net-audit/findings/performance.md`,
gitignored scratch): a repeated long-task cluster on `/` between ~3.8-4.4s post-navigation,
"same-size tasks, evenly spaced, no yielding" — the audit guessed this was the "WebGPU
dither shader" and recommended code-splitting it off the initial bundle.

## Root cause (investigated, not guessed)

Read `app/components/StartLights.tsx` and `app/components/DitherVideo.tsx` in full.

- `StartLights` has no rAF loop at all — pure `setTimeout` + CSS animations. Not the
  source.
- `DitherVideo`'s paint loop (the `useEffect` gated on `playing && inView && pageVisible`)
  calls `paintFrame()` on **every rAF tick, uncapped** — native display refresh rate
  (60fps, up to 120fps on ProMotion). Each `paintFrame()` does a canvas `drawImage` +
  `getImageData` (GPU→CPU readback) + a per-pixel luminance/threshold loop over up to
  `cols={420}` × ~180 rows on desktop + a `putImageData`. That's real per-frame cost,
  running continuously for as long as the hero video is in view — matches the audit's
  finding exactly.
- It's plain Canvas 2D (`canvas.getContext("2d")`), not WebGPU — the audit's language was
  imprecise about the underlying technology.
- `ffprobe public/hero.mp4` confirms the source is exactly **30fps** (`r_frame_rate=30/1`).
  Painting faster than that re-dithers the identical decoded video frame — pure waste, not
  extra smoothness.

## Why the audit's original fix (code-split off initial bundle) doesn't fit

`StartLights` needs the hero `<video>`'s `canplay` event to fire *early* (it's the
readiness signal the curtain-release timing is gated on — `resolveLightsOut({hold,
heroReadyAt})` in `app/lib/start-lights.ts`). Deferring `DitherVideo`'s mount/load would
delay that signal and change the preloader's timing, which is exactly the kind of
regression this codebase has a long history of (see the curtain-reveal/preloader entries
in `handoff.md` — clock-coupling bugs, StrictMode issues, etc.). Not doing this.

## Fix

Throttle `paintFrame()` inside the existing rAF loop to a fixed interval (30fps,
matching the source video's real encode rate) instead of calling it unconditionally every
tick. The loop still calls `requestAnimationFrame` every tick (cheap, keeps the
tab-visibility/pause semantics unchanged) — it just skips the expensive paint work when
called again before the interval has elapsed.

Pure, testable piece: `shouldPaint(now, lastPaint, minIntervalMs): boolean` in a new
`app/lib/frame-throttle.ts` (matches the project convention: logic in `app/lib/*.ts` with
`*.test.ts`, called from the component — not buried in the component itself). The
component wires it into the existing loop with a `lastPaint` ref/local variable.

## What this does NOT touch

- `StartLights.tsx` — untouched, zero risk to the preloader/curtain-reveal timing.
- The readiness gate (`canplay` listener) — untouched, still fires at the same real time.
- Visual output — same painted frames, same colors, same dither math; only the *rate* of
  redundant re-paints changes.
- Mobile `cols=240` vs desktop `cols=420` — untouched.

## Verification plan

Same method as the font WOFF2 fix (PR #55): Lighthouse (mobile, simulated throttling)
before/after on `/`, specifically the long-tasks audit and TBT, not just the headline LCP
(which the font fix already showed is a noisy/simulated number, not the reliable signal
here). Also a manual long-task trace comparison via `chrome-devtools-mcp` if Lighthouse's
long-tasks list isn't granular enough to confirm the cadence actually changed from
~16ms/tick to ~33ms/tick.

## Explicitly out of scope

Any change to `cols`/`colsDesktop`, the Bayer matrix algorithm itself, or the sampling
resolution — those are visual-quality knobs already tuned by the owner, not part of this
fix.
