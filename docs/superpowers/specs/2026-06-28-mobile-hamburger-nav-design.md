# Mobile hamburger nav — design

> Spec for the mobile navigation menu. Closes OPEN TODO #2 in `handoff.md`
> ("Mobile hamburger menu for the nav"). Date: 2026-06-28.

## Problem

`SiteNav` is a single persistent header row: the `SECTOR4` wordmark (Bebas Neue) on the
left, three links on the right (`Ask` / `Learn` / `Upcoming weekend`), all PP NeueBit with
a growing-underline hover (`.cta-grow`). On narrow viewports the three links — especially
the wide "Upcoming weekend" — crowd the wordmark. We need a mobile menu; desktop stays
exactly as-is.

## Scope

- IN: a hamburger button + full-screen overlay menu on mobile; GSAP open/close animation;
  accessibility (focus, `inert`, ARIA, Escape); reduced-motion handling; route-change close.
- OUT: changing the desktop nav, adding/removing nav links, restyling the links, any other
  page. New link destinations are out of scope — the menu renders the existing three.

## Breakpoint

- **Desktop unchanged:** the existing inline `<nav>` row renders at `md` and up
  (`hidden md:flex`).
- **Mobile:** below `md` (768px) the row is replaced by the hamburger button (`md:hidden`).
- 768px is the cutoff because "Upcoming weekend" + two links + the wordmark in PP NeueBit
  `text-2xl` crowd well before then.

## Structure

- `SiteNav.tsx` stays the header container. The three-link list is lifted into a single
  shared exported const `NAV_LINKS` (`{ href, label }[]`) so the desktop row and the mobile
  overlay render from one source of truth. The active-route logic (`isActive`, currently
  inline) is shared too — export a small `isActiveLink(pathname, href)` helper so both
  renderers match.
- New focused client component `app/components/MobileNav.tsx` holds the toggle button + the
  overlay + all the GSAP/animation/a11y logic, so `SiteNav` stays simple. It imports
  `NAV_LINKS` and `isActiveLink` from `SiteNav` (or a tiny shared `nav-links.ts` module if
  that reads cleaner — implementer's call, but one source of truth either way).

## The overlay (full-screen)

- Fixed, full-viewport, `bg-bg` (#FAFAFA), z above the header (the header is `z-30`; overlay
  sits above it). `id="mobile-menu"`.
- Top row mirrors the header so it reads as the same bar: `SECTOR4` wordmark (Bebas) on the
  left, a `✕` close button where the hamburger was on the right.
- The three links stacked and centered, large PP NeueBit, each keeping the `.cta-grow`
  growing-underline affordance and the active-route accent color (reuses `isActiveLink`).

## Behavior & accessibility

- **Toggle button:** `aria-expanded={open}`, `aria-controls="mobile-menu"`, `aria-label`
  toggles "Open menu" / "Close menu". `md:hidden`.
- **Always mounted:** the overlay stays in the DOM (so the GSAP timeline is reversible). When
  closed it carries the `inert` attribute, which removes it from tab order, focus, and
  pointer events — covering the focus-trap and background-scroll concerns without a manual
  trap. (`inert` is supported in all current evergreen browsers.)
- **Body scroll lock** while open (e.g. toggle `overflow-hidden` on `document.body`),
  restored on close. Guard for unmount.
- **Closes on:** the `✕`, `Escape` (keydown listener while open), a tap on the backdrop
  area, and a route change (a `useEffect` keyed on `usePathname()` sets `open=false`).
- **Focus:** on open, move focus to the `✕` (or first link); on close, return focus to the
  hamburger button. With `inert` handling the trap, this is the only manual focus management
  needed.

## Animation (GSAP)

- **Dependency:** add `@gsap/react` (official, tiny) for the `useGSAP` hook — it scopes the
  animation and auto-reverts on unmount. `gsap` core (^3.12.5) is already a dependency. This
  is the first GSAP usage in the app.
- **Open timeline** (built once via `useGSAP`, scoped to the `MobileNav` root):
  1. **Backdrop wipe** — overlay reveals via an expanding `clipPath` circle originating from
     the hamburger button's top-right corner (the menu appears to grow out of the button),
     with opacity 0→1. ~0.5s, `expo.out`.
  2. **Link stagger** — the three links animate from `y: 28, opacity: 0, filter: blur(6px)`
     to resolved, `stagger: 0.08`, `power3.out`, starting ~0.15s into the timeline so they
     ride in just behind the wipe.
  3. **Wordmark + ✕** fade in alongside.
  4. **Icon morph** — the three hamburger bars animate into an `✕` (top/bottom bars rotate
     ±45° and converge, middle fades) on the same timeline.
- **Close:** reverse the same timeline (`tl.reverse()`); the menu retracts toward the button.
  No separate exit code. `open` state drives `tl.play()` / `tl.reverse()`.
- **Reduced motion:** handled the GSAP-native way via `gsap.matchMedia()` — a
  `(prefers-reduced-motion: no-preference)` branch builds the full timeline; the reduced
  branch sets final states instantly (no tweens). `inert`/`open` toggling still works in both
  branches.

## Testing & verification

- vitest here is node-only (`environment: "node"`, includes `app/**/*.test.ts`); there is no
  jsdom/RTL component harness, and this feature has no pure logic worth extracting for a node
  test. So, matching how the M3/M6 frontend milestones were verified:
  - `npm run build` clean (`tsc` + Next build).
  - Existing test suites stay green (109 vitest + pytest); zero Python and zero desktop-path
    changes.
  - Browser/preview eyeball: open → stagger animation → navigate (auto-close) → reopen →
    `Escape`/`✕`/backdrop close → reduced-motion (instant, no tweens) → desktop unchanged at
    `md`+ → keyboard tab order correct (background `inert` when closed).

## Out of scope / non-goals

- No change to desktop nav, links, or their styling.
- No new routes or link destinations.
- No global animation framework decision beyond this component (GSAP was already the
  chosen motion lib per CLAUDE.md; this just lands the first usage).
