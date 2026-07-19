# Design — sector4.net landing page (+ /ask move, dithered-video hero)

Date: 2026-07-19
Status: approved direction (owner); hero video look to be validated in the lab BEFORE the
b-roll purchase. Spec review → plan → build.

## 0. Owner vision

- `/` becomes a marketing landing page; the current home (Ask) moves to **`/ask`** verbatim.
- **Hero:** dramatic, full-viewport — an F1-car b-roll VIDEO rendered through the dither
  aesthetic, with the SECTOR4 wordmark, one bold thesis line, and a CTA funneling to `/ask`.
  Owner will purchase licensed footage; the look is validated with a test video first.
- Below the hero: sections communicating what Sector 4 IS. Light live-data touches.
  Copy tone: honest-confident (the anti-hype thesis is the pitch) — terse, plain verbs, no
  superlatives, no em-dashes.

## 1. Dithered video — technique

Paper's `ImageDithering` (images only) implements ordered 4x4 Bayer on LUMINANCE — the same
math as our `app/lib/bayer.ts`. So the hero uses our own runtime pipeline, which produces an
IDENTICAL look with no new dependency and works with any `<video>` source:

- **`DitherVideo` component (client):** a hidden playing `<video>` (muted, loop,
  `playsInline`, autoplay) is drawn each rAF onto a small offscreen grid (~`cols` ≈ 240,
  rows by aspect), then each cell maps **luminance → 2-tone** through the Bayer 4x4
  threshold (`lum >= bayerThreshold(x,y)` → front colour, else back colour), painted as
  cells onto the visible canvas (pixelated upscale). The dither look IS low-res, so this is
  cheap (~32k cells/frame).
- Props: `{ src, poster?, colorBack, colorFront, cols?, type? (4x4/8x8), className? }`.
- **Reduced motion:** video paused at the first frame — a static dithered poster.
- **Fallback:** no src / load error → the existing `DitherFog` (warp) as the hero bg, so
  the landing never has a dead hero. Autoplay-blocked → same static first-frame.
- Extend `app/lib/bayer.ts` with the shared luminance path (`bayerLuminanceCells` or an
  option), unit-tested like the alpha path.
- Perf: one 2D canvas, no WebGL context. If runtime cost ever matters, the same code can
  bake the b-roll offline into a plain video file (deferred; not v1).

## 2. Lab validation FIRST (before the b-roll purchase)

`/lab/dither` gains **section E · Video hero**: a local **file picker** (nothing committed;
owner drops any test clip in) rendering `DitherVideo` full-width with variant toggles —
2-tone palettes (ink-on-white, blue-on-white, white-on-ink), cols (160/240/320), 4x4 vs 8x8
— plus the hero copy overlaid (wordmark + thesis + CTA mock) so the full hero moment is
judged in-situ. Owner validates → buys footage → drops it at `public/hero.mp4`.

## 3. Route restructure

- `app/page.tsx` (Ask) moves to `app/ask/page.tsx` unchanged (component + all its pieces).
- New `app/page.tsx` = the landing (server component + client islands).
- **Nav:** `NAV_LINKS` "Ask" → `/ask`; wordmark keeps `/`. `isActiveLink`: `/ask` by
  prefix; `/` exact stays for the landing. The ask-reset event now keys on `/ask`
  (`emitAskResetIfHome` updated).
- `app/opengraph-image.tsx` stays at the root (now fronts the landing — fine).
- No redirects needed (`/` still exists; old bookmarks land on the landing with a CTA).

## 4. Landing structure (single scroll)

1. **Hero (full viewport):** `DitherVideo` bg + feathered scrim; SECTOR4 wordmark (Bebas,
   huge), thesis line (Lastik) — e.g. "An F1 companion that tells you the truth about what
   it knows."; primary CTA button → `/ask`; subtle scroll cue. All enter-motion gated.
2. **Ask anything:** 3-4 real example queries as chips deep-linking **`/ask?q=…`** (the ask
   page reads `?q=` to prefill the bar — small addition, no auto-run).
3. **Honest by design:** the calibration/honesty pitch; live touch = real live-scored race
   count from the season index (server-fetched, degrades to copy-only) → link `/accuracy`.
4. **Learn the sport:** whats/whys pitch → `/learn`.
5. **This weekend:** next race name + date from `app/data/weekend-schedule.json` → `/weekend`.
6. **Footer:** minimal (wordmark, nav links, corrections mail/GitHub link).

Sections reuse the design system (type roles, palette, `.legible`, BloomCard where apt,
Bayer emblems as section markers). Build tasks load `frontend-design` +
`design-motion-principles`; dramatic hero, restrained everything else.

## 5. Constraints

- PRD §8 rights rules hold: the b-roll must be licensed (owner purchase); the dither
  rendering abstracts liveries/marks anyway. No team logos/faces in any still we ship.
- No em-dashes in copy; numbers rounded; reduced-motion static everywhere.
- Landing adds at most ONE canvas (the video ditherer) — no WebGL contexts.
- `/ask` behavior identical post-move (incl. nav reset + `?q=` prefill addition).
- Non-goals: no accounts, no betting language, no news, no auto-playing audio ever.

## 6. Tests

- `bayer.ts` luminance path unit tests (2-tone mapping, threshold behavior).
- `/ask?q=` prefill unit-testable seam.
- Nav `isActiveLink` + reset-event retarget tests updated.
- tsc/build/vitest green; visual = owner eyeball (lab first, then landing preview).

## 7. Rollout

1. Lab section E + `DitherVideo` (test video validation) — can merge immediately (hidden).
2. Owner validates look → purchases b-roll → `public/hero.mp4`.
3. Route move + landing build → PR preview → owner eyeball → merge.
(1 and 3 can land in one branch if validation is quick; the hero falls back to DitherFog
until the real file exists, so the landing is shippable pre-purchase.)
