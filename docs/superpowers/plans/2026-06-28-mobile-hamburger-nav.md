# Mobile Hamburger Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile hamburger menu (full-screen GSAP-animated overlay) that replaces the crowded inline nav row below `md`, leaving the desktop nav unchanged.

**Architecture:** Lift the nav link list + active-route helper out of `SiteNav` into a shared source. The desktop `<nav>` becomes `hidden md:flex`. A new `MobileNav` client component (`md:hidden`) renders a hamburger button + an always-mounted full-screen overlay; `open` state drives a reversible GSAP timeline (`useGSAP` + `gsap.matchMedia()` for reduced-motion), and the `inert` attribute removes the closed overlay from focus/scroll/pointer.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind, GSAP (`gsap` ^3.12.5 already present) + `@gsap/react` (`useGSAP`), Vitest (node-only).

## Global Constraints

- **Desktop nav unchanged** — no change to links, styling, or layout at `md` (768px) and up.
- **No new routes or link destinations** — the menu renders the existing three links only.
- **One source of truth** for the link list (`NAV_LINKS`) and active logic (`isActiveLink`); desktop + mobile both consume it.
- **All motion gated by `prefers-reduced-motion`** via `gsap.matchMedia()` — reduced branch sets final states instantly, no tweens.
- **Tailwind tokens (verbatim):** bg `bg-bg`, ink `text-ink` (#0B1020), accent `text-accent` (#2348E0), pixel font `font-pixel`, wordmark `font-bebas` (Bebas Neue — wordmark ONLY). Growing underline = class `.cta-grow` (requires the link to be `relative`; underline color is `--ramp-1`).
- **Header is `z-30`; NAV_H = 68px.** Overlay must sit above the header.
- **No AI attribution in commits**; conventional-style messages, one logical change per commit.
- **Verification reality:** vitest is node-only (`environment: "node"`, includes `app/**/*.test.ts`) — no jsdom/RTL. Pure helpers get node tests; component behavior is verified by `npm run build` + browser. Don't add a component test harness.

---

### Task 1: Shared link source + `isActiveLink` helper (with node test), desktop nav responsive

**Files:**
- Modify: `app/components/SiteNav.tsx`
- Create: `app/components/SiteNav.test.ts`

**Interfaces:**
- Produces: `export const NAV_LINKS: { href: string; label: string }[]` (the three links: `/`→"Ask", `/learn`→"Learn", `/weekend`→"Upcoming weekend"); `export function isActiveLink(pathname: string, href: string): boolean` (root href matches exactly, others match by prefix). Both consumed by Task 2/4's `MobileNav` and by `SiteNav`'s desktop row.

- [ ] **Step 1: Write the failing test**

Create `app/components/SiteNav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NAV_LINKS, isActiveLink } from "./SiteNav";

describe("NAV_LINKS", () => {
  it("is the three nav links in order", () => {
    expect(NAV_LINKS.map((l) => l.href)).toEqual(["/", "/learn", "/weekend"]);
    expect(NAV_LINKS.map((l) => l.label)).toEqual(["Ask", "Learn", "Upcoming weekend"]);
  });
});

describe("isActiveLink", () => {
  it("matches the root href only on exact '/'", () => {
    expect(isActiveLink("/", "/")).toBe(true);
    expect(isActiveLink("/learn", "/")).toBe(false);
  });
  it("matches non-root hrefs by prefix", () => {
    expect(isActiveLink("/learn", "/learn")).toBe(true);
    expect(isActiveLink("/learn/drs", "/learn")).toBe(true);
    expect(isActiveLink("/weekend", "/weekend")).toBe(true);
    expect(isActiveLink("/", "/learn")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/SiteNav.test.ts`
Expected: FAIL — `NAV_LINKS`/`isActiveLink` are not exported yet.

- [ ] **Step 3: Refactor `SiteNav.tsx` to export the shared source and use it**

Replace the body of `app/components/SiteNav.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileNav } from "@/app/components/MobileNav";

// Single-row persistent site nav (lives in the root layout, so it's on every page).
// SECTOR4 wordmark on the left (the ONLY use of Bebas Neue); the section links + the
// live-weekend CTA on the right, all in PP NeueBit with a growing-underline hover.
export const NAV_H = 68; // px (h-[68px]) — the layout pads the body by this so content clears it

// One source of truth for the link list — consumed by the desktop row AND the mobile overlay.
export const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Ask" },
  { href: "/learn", label: "Learn" },
  { href: "/weekend", label: "Upcoming weekend" },
];

// Root matches only on exact "/"; every other href matches by path prefix.
export function isActiveLink(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const linkClass =
  "relative cta-grow font-pixel text-2xl leading-none tracking-wide transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-[68px] items-center justify-between bg-bg/95 px-7 backdrop-blur-sm">
      <Link
        href="/"
        aria-label="Sector 4, home"
        className="rounded-sm font-bebas text-4xl leading-none tracking-wide text-ink transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
      >
        SECTOR4
      </Link>

      {/* Desktop: inline row (unchanged). Hidden below md, where MobileNav takes over. */}
      <nav className="hidden items-center gap-6 md:flex">
        {NAV_LINKS.map(({ href, label }) => {
          const active = isActiveLink(pathname, href);
          const inactive =
            href === "/weekend" ? "text-ink/80 hover:text-ink" : "text-ink/65 hover:text-ink";
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`${linkClass} ${active ? "text-accent" : inactive}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile: hamburger + full-screen overlay. */}
      <MobileNav />
    </header>
  );
}
```

(Note: `MobileNav` is created in Task 2. Until then the import will fail to build — that's expected; this task's deliverable is the test passing, and Task 2 immediately follows. Do NOT add the import until Task 2 if running build between tasks; if so, temporarily render `null` and add the import in Task 2. For a clean per-task build, comment out the `MobileNav` import + usage here and restore in Task 2.)

To keep this task independently buildable, instead of the comment above: **omit the `MobileNav` import and its `<MobileNav />` line in this task** — add them in Task 4 (wiring). For now the mobile breakpoint simply shows nothing below `md`. So in Step 3, delete the `import { MobileNav }...` line and the `{/* Mobile ... */}<MobileNav />` block.

- [ ] **Step 4: Run test + build to verify**

Run: `npx vitest run app/components/SiteNav.test.ts`
Expected: PASS (3 tests).

Run: `npm run build`
Expected: clean build (the desktop nav is now `hidden md:flex`; below `md` the nav row is gone, no mobile control yet).

- [ ] **Step 5: Commit**

```bash
git add app/components/SiteNav.tsx app/components/SiteNav.test.ts
git commit -m "refactor: share NAV_LINKS + isActiveLink, make desktop nav md-only"
```

---

### Task 2: `MobileNav` — functional, accessible overlay (no GSAP yet)

**Files:**
- Create: `app/components/MobileNav.tsx`

**Interfaces:**
- Consumes: `NAV_LINKS`, `isActiveLink` from `@/app/components/SiteNav`.
- Produces: `export function MobileNav(): JSX.Element` — a `md:hidden` wrapper with a hamburger `<button>` and an always-mounted full-screen overlay `#mobile-menu`. Closed overlay carries `inert`. Used by `SiteNav` (wired in Task 4).

This task ships the menu **fully working and accessible without animation** (instant show/hide). GSAP is layered on in Task 3. There is no jsdom harness, so this task is verified by `npm run build` + the browser checklist.

- [ ] **Step 1: Create the component**

Create `app/components/MobileNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_LINKS, isActiveLink } from "@/app/components/SiteNav";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close whenever the route changes (link tap navigates → menu dismisses).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Toggle `inert` on the overlay on every open-state change (also runs on mount → closed
  // overlay starts inert: out of tab order, no pointer events, ignored by AT).
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);

  // While open: Escape closes, body scroll locks, focus moves into the overlay; on close
  // (effect cleanup) focus returns to the hamburger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("overflow-hidden");
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("overflow-hidden");
      buttonRef.current?.focus();
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="relative z-50 flex h-10 w-10 items-center justify-center rounded-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        {/* Three bars — Task 3 morphs these into an X via GSAP. */}
        <span className="pointer-events-none relative block h-4 w-6">
          <span className="mnav-bar mnav-bar-top absolute left-0 top-0 h-0.5 w-6 bg-current" />
          <span className="mnav-bar mnav-bar-mid absolute left-0 top-1/2 h-0.5 w-6 -translate-y-1/2 bg-current" />
          <span className="mnav-bar mnav-bar-bot absolute bottom-0 left-0 h-0.5 w-6 bg-current" />
        </span>
      </button>

      <div
        ref={overlayRef}
        id="mobile-menu"
        className="mnav-overlay fixed inset-0 z-40 flex flex-col bg-bg"
        onClick={(e) => {
          // Tap on the backdrop (not on a link/button) closes.
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        {/* Top bar mirrors the header so it reads as the same row. */}
        <div className="flex h-[68px] shrink-0 items-center justify-between px-7">
          <Link
            href="/"
            aria-label="Sector 4, home"
            className="rounded-sm font-bebas text-4xl leading-none tracking-wide text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            SECTOR4
          </Link>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-sm font-pixel text-3xl leading-none text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            ✕
          </button>
        </div>

        {/* Links — centered, large, PP NeueBit, keep the growing underline + active accent. */}
        <nav className="flex flex-1 flex-col items-center justify-center gap-8">
          {NAV_LINKS.map(({ href, label }) => {
            const active = isActiveLink(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`mnav-link relative cta-grow font-pixel text-4xl leading-none tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                  active ? "text-accent" : "text-ink/80 hover:text-ink"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Temporarily wire into `SiteNav` to exercise it**

In `app/components/SiteNav.tsx`, add the import and render (this is the same wiring Task 4 finalizes; adding it now lets you verify Task 2 in the browser):

Add at top with the other imports:
```tsx
import { MobileNav } from "@/app/components/MobileNav";
```
Add just before the closing `</header>`:
```tsx
      <MobileNav />
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Browser verification (instant show/hide, pre-animation)**

Run `npm run dev`, open at a <768px viewport (DevTools device toolbar). Verify:
- Below `md`: hamburger shows, desktop link row hidden. At `md`+: link row shows, hamburger hidden.
- Tap hamburger → full-screen overlay covers the page; SECTOR4 + ✕ on top, three links centered.
- Tap a link → navigates AND overlay closes. Tap hamburger again → reopens.
- `Escape` closes. `✕` closes. Tapping empty overlay space closes.
- While open, the page behind does not scroll.
- Keyboard: with the menu closed, Tab does NOT land on the overlay's links (it's `inert`); open it and Tab cycles the ✕ + links; closing returns focus to the hamburger.

- [ ] **Step 5: Commit**

```bash
git add app/components/MobileNav.tsx app/components/SiteNav.tsx
git commit -m "feat: accessible mobile hamburger overlay nav"
```

---

### Task 3: GSAP slick open/close animation + icon morph + reduced-motion

**Files:**
- Modify: `app/components/MobileNav.tsx`
- Modify: `app/globals.css`
- Modify: `package.json` (add `@gsap/react`)

**Interfaces:**
- Consumes: the DOM structure + class hooks from Task 2 (`.mnav-overlay`, `.mnav-link`, `.mnav-bar-top/-mid/-bot`) and the `open` state.
- Produces: a reversible GSAP timeline driven by `open`; no new exports.

The reveal grows out of the button's top-right corner (`clipPath` circle), links stagger in with a blur clear, and the bars morph to an X. Base CSS holds the *closed* visual state so the paused timeline (time 0) == hidden; GSAP animates toward open and `reverse()` returns to the CSS base.

- [ ] **Step 1: Install `@gsap/react`**

Run: `npm install @gsap/react`
Expected: adds `@gsap/react` to `package.json` dependencies; `gsap` already present.

- [ ] **Step 2: Add the closed-state base CSS**

Append to `app/globals.css`:

```css
/* Mobile nav overlay (app/components/MobileNav.tsx). Base = CLOSED visual state so the
   paused GSAP timeline at time 0 matches this; the timeline animates toward OPEN and
   reverse() returns here. autoAlpha (GSAP) toggles opacity+visibility together. */
.mnav-overlay {
  opacity: 0;
  visibility: hidden;
  clip-path: circle(0% at calc(100% - 2.75rem) 2.25rem);
}
.mnav-link {
  opacity: 0;
  transform: translateY(28px);
  filter: blur(6px);
}
/* Reduced motion: GSAP's matchMedia sets final states instantly, but guard the base too so
   there is never a flash of the from-state if JS is slow. */
@media (prefers-reduced-motion: reduce) {
  .mnav-link {
    transform: none;
    filter: none;
  }
}
```

- [ ] **Step 3: Add the GSAP timeline to `MobileNav`**

In `app/components/MobileNav.tsx`, add imports:

```tsx
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
```

Add a root ref and a timeline ref inside the component (next to the other refs):

```tsx
  const rootRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
```

Put the root ref on the wrapper div: change `<div className="md:hidden">` to `<div ref={rootRef} className="md:hidden">`.

Build the timeline once (scoped to the root so selector strings resolve within it), branching on reduced motion via `matchMedia`:

```tsx
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          animated: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { animated } = ctx.conditions as { animated: boolean; reduced: boolean };
          const tl = gsap.timeline({ paused: true });

          if (animated) {
            tl.to(".mnav-overlay", {
              autoAlpha: 1,
              clipPath: "circle(150% at calc(100% - 2.75rem) 2.25rem)",
              duration: 0.5,
              ease: "expo.out",
            })
              .to(
                ".mnav-link",
                {
                  autoAlpha: 1,
                  y: 0,
                  filter: "blur(0px)",
                  stagger: 0.08,
                  duration: 0.4,
                  ease: "power3.out",
                },
                0.15,
              )
              // Hamburger bars → X, on the same timeline.
              .to(".mnav-bar-top", { y: 7, rotate: 45, duration: 0.3, ease: "power2.inOut" }, 0)
              .to(".mnav-bar-mid", { autoAlpha: 0, duration: 0.2 }, 0)
              .to(".mnav-bar-bot", { y: -7, rotate: -45, duration: 0.3, ease: "power2.inOut" }, 0);
          } else {
            // Reduced motion: jump straight to the open state (reverse() jumps back to closed).
            tl.set(".mnav-overlay", { autoAlpha: 1, clipPath: "none" })
              .set(".mnav-link", { autoAlpha: 1, y: 0, filter: "none" })
              .set(".mnav-bar-mid", { autoAlpha: 0 });
          }

          tlRef.current = tl;
          return () => {
            tlRef.current = null;
          };
        },
      );
    },
    { scope: rootRef },
  );

  // Drive the timeline from open state.
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (open) tl.play();
    else tl.reverse();
  }, [open]);
```

Notes for the implementer:
- Keep the existing `inert`/scroll-lock/Escape effects from Task 2 — GSAP only handles the *visual* transition; `inert` + scroll lock are independent and correct as-is.
- The `.mnav-bar-mid` keeps `bg-current`; animating `autoAlpha` hides it for the X. The button stays `text-ink` so the X is ink-colored.
- Do not remove the Tailwind base classes on `.mnav-overlay`/`.mnav-link`; the globals.css rules above add the closed-state properties GSAP animates.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean build (TypeScript happy with `@gsap/react` types; if `gsap.core.Timeline` typing complains, ensure `import gsap from "gsap"` is the default import as shown).

- [ ] **Step 5: Browser verification (animation + reduced motion)**

`npm run dev`, <768px viewport:
- Open: overlay wipes out of the top-right (where the button is), links stagger up with a blur-clear, bars morph to an X. Close: it all reverses back toward the button.
- Toggle OS/DevTools "reduce motion" (DevTools: Rendering → Emulate `prefers-reduced-motion: reduce`): open/close is instant, no wipe/stagger/blur, no tweened morph — but the overlay still opens, closes, and is fully usable.
- Re-confirm the Task 2 a11y checklist still holds (Escape/✕/backdrop/route-change close; focus return; `inert` when closed; no background scroll).

- [ ] **Step 6: Commit**

```bash
git add app/components/MobileNav.tsx app/globals.css package.json package-lock.json
git commit -m "feat: GSAP wipe + stagger animation and icon morph for mobile nav"
```

---

### Task 4: Finalize wiring + full verification

**Files:**
- Modify: `app/components/SiteNav.tsx` (only if the Task 2 temporary wiring needs tidying)

**Interfaces:** none new — this task confirms `SiteNav` renders `<MobileNav />` exactly once and the whole suite is green.

- [ ] **Step 1: Confirm `SiteNav` wiring**

Open `app/components/SiteNav.tsx`. Confirm: `import { MobileNav } from "@/app/components/MobileNav";` is present once, `<MobileNav />` is rendered once just before `</header>`, and the desktop `<nav>` is `hidden ... md:flex`. (Task 2 added these; this is a final check — fix duplicates if any.)

- [ ] **Step 2: Full test + build**

Run: `npx vitest run`
Expected: all vitest pass (the existing suite + the new `SiteNav.test.ts`; ~112 pass).

Run: `npm run build`
Expected: clean (`tsc` + Next build).

(No Python touched — pytest unaffected. Do not run it as part of this feature.)

- [ ] **Step 3: Final cross-check against the spec**

Manually confirm, at <768px and ≥768px:
- Desktop (≥md): identical to before — inline Ask/Learn/Upcoming-weekend row, hamburger absent.
- Mobile (<md): hamburger present, link row absent; overlay open/animate/navigate-close/Escape/✕/backdrop all work; reduced-motion instant; background `inert` + scroll-locked when open.

- [ ] **Step 4: Commit (if any tidy-up was needed; otherwise skip)**

```bash
git add app/components/SiteNav.tsx
git commit -m "chore: finalize mobile nav wiring"
```

---

## Self-Review

**Spec coverage:**
- Breakpoint (`md`, desktop unchanged) → Task 1 (`hidden md:flex`) + Task 2 (`md:hidden`). ✓
- Shared `NAV_LINKS` + `isActiveLink` → Task 1 (with node test). ✓
- New `MobileNav.tsx`, full-screen overlay, mirrored top bar, centered links w/ `.cta-grow` + active accent → Task 2. ✓
- a11y: `aria-expanded`/`aria-controls`/`aria-label`, `inert` when closed, scroll lock, Escape/✕/backdrop/route-change close, focus into-overlay/return → Task 2. ✓
- GSAP `@gsap/react` `useGSAP`, clipPath wipe from button, link stagger+blur, icon morph, reversible timeline, `gsap.matchMedia()` reduced branch → Task 3. ✓
- Testing reality (node-only vitest; build + browser) → Tasks 1–4 verification steps. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; verification steps give exact commands + expected results. ✓

**Type consistency:** `NAV_LINKS`/`isActiveLink` signatures defined in Task 1 are used verbatim in Task 2. Class hooks `.mnav-overlay`/`.mnav-link`/`.mnav-bar-{top,mid,bot}` defined in Task 2's JSX are the exact selectors animated in Task 3's CSS + timeline. `MobileNav` export name consistent across Tasks 2/4. ✓

**Note on task buildability:** Task 1 leaves `SiteNav` building cleanly without `MobileNav` (import omitted per its Step 3 note); Task 2 adds the import + render so it's exercised immediately; Task 4 just confirms. No task leaves the tree un-buildable.
