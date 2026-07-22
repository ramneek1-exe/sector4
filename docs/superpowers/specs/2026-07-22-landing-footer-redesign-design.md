# Landing footer redesign (design)

Date: 2026-07-22. Owner-brainstormed on a new branch off `main` (landing page v1/v2/v2b +
4 fix PRs all merged and live; see `handoff.md`). This is the last deferred piece from the
original landing-v2 ordering ("hero first, then sections working downwards... finally
coming back to the preloader + hero reveal followed by the footer") — owner confirmed a
deliberate reorder: footer now, preloader/hero-reveal choreography stays queued separately.

## 0. Context

The current landing footer (`LandingFooter()` in `app/page.tsx`) is the **original v1**
one, untouched by any v2/v2b work: wordmark + `NAV_LINKS` row, plain `border-t`, no motion,
no relation to the sector-numbered/race-track visual language the rest of the page now
uses. Directly below it, `app/layout.tsx` renders a second, **site-wide** `<footer>` with
the legal disclaimer (small, muted, on every page — not landing-specific).

The `TrackSpine` already ends its race-track spine in a chequered finish strip at the S4
anchor, with the car (`AsciiEmblem kind="car"`) riding past it and exiting off-screen. The
new footer sits directly below that finish moment.

## 1. Scope

- Redesign `LandingFooter()` only. No change to the sector sections above it, no change to
  `TrackSpine`.
- Drop the nav-links row from the footer — header nav (`SiteNav`, fixed, on every page)
  already covers navigation; repeating it here is redundant.
- Pull the legal disclaimer into the redesigned footer, styled to match, and suppress the
  separate site-wide legal footer specifically on `/` (every other route keeps it
  unchanged).
- Two motion behaviors: a scroll-linked parallax reveal, and a cursor-reactive
  microinteraction on the wordmark. Both are new to the site (existing motion vocabulary is
  `cta-grow` underline hovers, `CardFog`/dither hover bloom, `TrackSpine`'s scroll-scrub,
  and the numeral hover glyph-clip bloom — none of those are reused here).

## 2. Layout & typography

`LandingFooter()` becomes a `min-h-[40vh]` flex section (at least 40% of viewport height;
taller is fine if content needs more room, this is a floor not a cap):

- A giant `SECTOR4` wordmark in Bebas Neue (the site's one wordmark font, matching
  `SiteNav`'s usage), fluid-sized via CSS `clamp()` so it spans most of the section's width
  at any viewport (e.g. `clamp(4rem, 18vw, 16rem)` — tuned visually during implementation,
  not treated as final). Single line; "SECTOR4" is short enough that wrapping shouldn't be
  a real risk at sane clamp bounds, but implementation should verify at narrow widths.
- The legal disclaimer directly underneath, small/muted text, unchanged copy.
- Plain text, not a link — this is the landing page itself, so a wordmark-to-home link
  would be a no-op. Real text content (not `aria-hidden`) since it's the page's closing
  brand statement, not decoration.
- No new background tint; inherits the page's default background.

## 3. Legal text sharing

The disclaimer string currently lives inline in `app/layout.tsx` as a local `const
DISCLAIMER`. It moves to a small shared module (e.g. `app/lib/legal.ts`) so both footers
import the same source text — no copy drift between the two renderings.

`app/layout.tsx`'s site-wide `<footer>` becomes a small client component that checks
`usePathname()` (same pattern `SiteNav` already uses for active-link state) and renders
nothing on `/`, since `LandingFooter` now shows its own styled version there. Every other
route (`/ask`, `/learn`, `/accuracy`, `/weekend`, `/learn/[slug]`) keeps the existing
site-wide footer exactly as today.

## 4. Motion: parallax reveal

As the footer section scrolls into view, the wordmark and legal line translate at
different rates as the user scrolls through the section (wordmark moves slower/larger,
legal line faster/smaller — standard parallax depth cue), driven by GSAP `ScrollTrigger`
with `scrub`, reusing the same GSAP setup `TrackSpine` already uses
(`app/lib/gsap.ts`).

Wrapped in `gsap.matchMedia("(prefers-reduced-motion: no-preference)")`, matching every
other animation on the page. Reduced-motion users see the fully-revealed final state with
no scroll-linked movement — hidden/offset states are set via `gsap.set` inside the
matchMedia context only, never CSS, so content is never hidden from no-JS or
reduced-motion users (the site-wide convention, see `SectionReveal`).

## 5. Motion: cursor microinteraction

The `SECTOR4` wordmark splits into 7 individual letter spans. While the footer section is
in the viewport (gated by `IntersectionObserver`, matching the codebase's existing
discipline of not running per-frame work while off-screen — e.g. `CardFog` mounts only on
hover, the dither lab uses `InView`), each letter offsets toward the cursor with
inverse-distance falloff and a small capped max offset (a subtle "magnetic" nudge, not a
cartoon wobble), smoothed with a `requestAnimationFrame` lerp — the same easing pattern
already used for the hero's cursor-trailing dither blob. Letters settle back to rest when
the pointer leaves the section or moves far enough away.

Reduced-motion: static, no pointer listener attached at all (not just visually inert —
skip the work).

No color change on interaction; letters stay the wordmark's normal ink color. No WebGL/
shader involvement — this is plain CSS transform driven by JS, same performance class as
the existing `SectionReveal` stagger.

## 6. Testing

- Pure geometry/easing helpers (letter-offset falloff calculation, lerp step) should be
  extracted into a testable function in `app/lib/`, following the pattern
  `app/lib/track-path.ts` set for `TrackSpine` — logic lives in `src`/`lib`, not buried in
  component internals, so it's unit-testable without a browser.
- `app/lib/legal.ts`'s exported constant needs no test (it's data, not logic).
- The `usePathname`-gated site-wide footer suppression is a one-line conditional; cover it
  with the same lightweight testing `SiteNav`'s `isActiveLink` gets (a pure function if
  reasonably extractable, otherwise a component-level check).
- Manual verification: reduced-motion (no scroll movement, no pointer offset, full content
  visible), narrow mobile width (wordmark doesn't wrap/overflow), and the real dev-server
  visual check (parallax reveal + cursor magnet) via Chrome DevTools, per this session's
  established practice of showing rendered candidates before committing to a specific
  motion feel.

## 7. Out of scope

- Preloader + hero-reveal choreography (separately queued, per owner).
- Any change to `TrackSpine`, the sector sections, or their copy.
- Additional footer content (contact/socials/about) — owner explicitly scoped this down to
  wordmark + legal line only.
