# M3 Frontend Polish — Design Spec

> Date: 2026-06-18 · Branch: `m3-frontend-glyph-system` (continues the in-progress M3
> frontend). Polish pass on the verified ASCII/dither UI before merge to `main`.
> Predecessor context: `docs/superpowers/specs/2026-06-15-m3-frontend-glyph-system-design.md`
> and `handoff.md` §4 item 4. **Code is authoritative over the older spec** (the ASCII
> pivot postdates it).

## Goal

Tighten the existing ASCII/dither frontend into a more polished, characterful, on-brand
experience without changing the data flow, the inference contract, or the abstract-glyph
rights constraints. Pure frontend polish; no backend, no API, no model changes.

## Locked invariants (do not violate)

- ASCII rendering stays on **canvas 2D** (the `shaders` pkg can't ASCII-ify DOM — M2 finding).
- **All motion gated behind `prefers-reduced-motion`** — static/instant fallback for every animation.
- Abstract glyphs only (no faces/photos/logos/liveries); honesty preserved (don't oversell).
- Round every number that reaches output. Logic that isn't view-only stays testable.
- No new runtime deps unless justified; prefer GSAP (already in the tree) / CSS / canvas.

## Owner decisions (this session)

- **Query input stays at the top** (above the fog/action zone) — not moved to the bottom.
- **Wordmark → `SECTOR4`** (tight, no space) — still set in Bebas Neue ("Bebas = wordmark only" holds).
- **PP Mondwest** (pixel serif) applied to **big answer numbers + section/eyebrow headers** now;
  also wired + reserved for the future landing page. Wordmark stays Bebas.
- **PP NeueBit Bold** available for small pixel "computer" accents (e.g. loading-text texture); not a core role.
- Italic want (landing page) is **out of scope for M3** — neither new font is italic; revisit on the landing page
  (likely faux-oblique Mondwest or a licensed italic). Noted only.

## Work items

### 1. Helmet reveal — true scatter (`app/components/AsciiGlyph.tsx`)
**Problem:** `delayFor(i) = ((i*73) % 23) / 23 * REVEAL_MS` yields only **23 distinct delay
buckets**, so cells appear in visible clumps ("a set, then the rest").
**Fix:** replace with a per-cell hashed pseudo-random delay in `[0, REVEAL_MS)`. Use a small
integer hash of the cell index (e.g. xorshift/`Math.imul` mix) → a `[0,1)` value → scaled to
`REVEAL_MS`. Deterministic (no `Math.random`, so no hydration mismatch), but effectively
uniform so cells dissolve in individually. Numeral overlay still fades in last. Reduced-motion
unchanged (paints at progress 1 instantly).
**Test:** unit-test the new hash helper (pure fn) — outputs in `[0,1)`, deterministic, and the
delay distribution covers many distinct buckets (not ≤23) across a representative cell count.

### 2. Fog — bolder (`app/components/AsciiFog.tsx`, `app/page.tsx`)
**Problem:** fog reads too faint.
**Fix:** raise per-cell alpha from `0.2 + cv*0.5` toward `~0.32 + cv*0.62`; widen the
colour-value range so more glyphs reach the brighter ramp; and ease the radial white scrim in
`page.tsx` (currently `rgba(250,250,250,0.88)` core) that dims the fog behind content — soften
so the fog is more present while answer text stays legible. Exact constants tuned live in-browser.
No behavioural/logic test (pure visual); the noise field math is already covered by `noise.test.ts`.

### 3. Suggested queries — drifting spawns (`app/page.tsx` `EmptyState`)
**Problem:** static chip row is flat.
**Fix:** chips **fade in at varied positions** within the action zone, linger, fade out, and a
new one appears elsewhere — cycling an expanded example list, **2–3 visible at once** at
different spots. Chips remain clickable (clicking runs the query). Implemented with
absolutely-positioned chips over the zone + GSAP (or CSS) staggered fade/translate on a timed
cycle; positions chosen from a small curated set so they don't overlap the centre content or
each other. **Reduced-motion → the current static wrapped row** (no spawning).
**Isolation:** the cycling logic (which example + which slot is shown when) is a small pure-ish
helper so the rotation order is predictable; the animation itself is presentational.

### 4. Remove Shaders attribution + dead reveal code
- `app/layout.tsx`: remove the "Powered by Shaders" footer link (keep the disclaimer).
- Delete the now-unused M2 reveal: `app/components/Reveal.tsx`, `app/lib/reveal-fallback.ts`,
  and its test `app/lib/reveal-fallback.test.ts` (confirm nothing imports them first).
- Remove the `shaders` dependency from `package.json` (unused after the deletion). Re-run
  `npm install` to update the lockfile; confirm `npm run build` still passes.

### 5. Ask button — pixel spinner (`app/page.tsx` + small inline component/helper)
**Problem:** loading shows a plain `"…"`.
**Fix:** while `loading`, the button shows an **ASCII/pixel spinner** — a short cycling frame
sequence in the mono face (e.g. rotating quadrant blocks `▖ ▘ ▝ ▗` or a 4–8 frame dot-matrix),
advanced on an interval/rAF. Keeps the button width stable (fixed-width glyph). **Reduced-motion
→ a static glyph** (no cycling). Spinner colour matches the button's existing on-accent text.

### 6. Creative loading text (`app/page.tsx` + a small `LOADING_LINES` constant)
**Problem:** fixed "Reading the weekend…".
**Fix:** pick a phrase **at random on each query** from this exact owner-authored set (verbatim,
including punctuation/emoji; the f-word stays masked as written):

```
We are checking...
Boxing for mediums...
⚠️ Investigating the 'inchident'...
Just got told it's a motor race. Now going car racing...
Bwoahhh...
Updating the words of wisdom...
Changing the f*****g car...
Getting my gloves and steering wheel...
Calling the World Champion Hotline...
Leaving the space for Fernando...
Giving Ocon a +5s penalty...
Asking Carlos for the pancake recipe...
Playing Mariah Carayyy...
Going up and down, side to side like a rollercoaster...
Licking the stamp and sending it...
```

Stored as a module-level array; a `pickLoadingLine()` helper returns one at random per run (chosen
when a query starts, held for that load). Reduced-motion is fine (single static line per load).
**Test:** the helper returns a member of the list.

### 7. Query bar + Ask button — hover & focus underglow (`app/page.tsx`, `app/globals.css`)
- **Hover (both):** subtle lift + border brighten (small translate/shadow), fast easing.
- **Focus (bar selected):** an **animated underglow** — a soft brand-blue glow beneath the bar
  that gently "breathes" (slow opacity/scale pulse) only while focused; implemented as a blurred
  gradient pseudo-element / box-shadow using the existing `--ramp` blues.
- **Ask button hover:** brighten (already `hover:bg-accent-bright`) + slight scale + matching glow.
- **All motion behind `prefers-reduced-motion`**: reduced-motion keeps a static focus ring/border,
  no breathing, no scale.

### 8. Type system (`app/lib/fonts.ts`, `app/layout.tsx`, `app/page.tsx`)
- Wire **PP Mondwest** (`app/fonts/bitmap/PPMondwest-Regular.otf`) and **PP NeueBit Bold**
  (`app/fonts/bitmap/PPNeueBit-Bold.otf`) via `next/font/local` with CSS-var roles
  (`--font-pixel-serif`, `--font-pixel`). Add to `fontVars`.
  - Note: `next/font/local` accepts `.otf`; if the build is unhappy, convert to `.woff2`
    (the documented self-host path) — same approach that fixed the gstatic-fetch issue.
- Apply **Mondwest** to: the big `StatAnswer` value number, and the section eyebrow headers
  (e.g. `YEAR GP · podium odds`). Tailwind utility/token `font-pixel-serif`.
- **NeueBit** available for the loading-text accent (optional, tune in-browser).
- Wordmark text → `SECTOR4` (tight), still `font-bebas`.

## Out of scope (deferred, unchanged)

Car/tire/track glyphs (M4), hover callouts (M6), favicon (M7), the §6.7 signature-reveal fidelity
fix, the landing page (+ its italic decision), live-2026 data.

## Verification (Definition of Done)

- `npx vitest run` green (existing + the few new pure-helper tests).
- `npm run build` clean (fonts resolve, no dead-import errors, `shaders` removal clean).
- In-browser check (Chrome DevTools): helmets dissolve cell-by-cell (no clumping); fog visibly
  bolder but text legible; suggested-query chips spawn/drift/cycle and are clickable; Ask button
  shows the pixel spinner while loading; loading text varies across runs; bar hover + focus
  underglow animate; wordmark reads `SECTOR4`; Mondwest renders on the answer number + headers.
- Reduced-motion pass: every animation has a static/instant fallback (helmet instant, fog single
  frame, chips static row, spinner static glyph, no underglow breathing).
- No oversell in any new copy; honesty notes intact.
