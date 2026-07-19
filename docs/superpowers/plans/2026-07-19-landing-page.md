# Landing page + dithered-video hero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/` becomes a marketing landing with a dithered-video hero (validated in the lab before the b-roll purchase); the current home moves to `/ask` verbatim.

**Architecture:** `DitherVideo` draws a playing `<video>` per-frame onto a low-res grid and maps luminance → 2-tone through the shared Bayer threshold (math-identical to paper's `ImageDithering` 4x4; parity proven in the lab side-by-side). The landing is a server component with client islands, reusing the design system; live touches degrade gracefully.

**Tech Stack:** TypeScript/Next.js, canvas 2D, `app/lib/bayer.ts`, vitest. No new deps.

## Global Constraints

- **Parity:** the video ditherer is ordered 4x4 (option 8x8) Bayer on LUMINANCE, 2-color — lab section E renders a paused frame through paper's real `ImageDithering` beside ours for eye-verification.
- **Reduced motion:** video paused on first frame (static dithered poster); all landing entrance motion gated.
- **Fallbacks:** no video src / load error / autoplay-block → `DitherFog` hero bg or static frame; landing never dead. Live-data touches degrade to copy-only.
- **`/ask` must behave identically post-move** (nav reset retargeted; plus new `?q=` prefill, no auto-run).
- **Copy:** honest-confident, terse, no superlatives, NO em-dashes. Rights: no team marks/faces in shipped stills; b-roll is owner-licensed.
- **Perf:** landing adds ONE 2D canvas (no WebGL). Lab keeps its InView discipline.
- **Commits:** conventional, description only. NO AI attribution / Co-Authored-By / robot emoji.
- Verify each task: `npx tsc --noEmit`, `npm run test`, `npm run build`.

## File Structure

- `app/lib/bayer.ts` (+ test) — luminance path.
- `app/components/DitherVideo.tsx` (NEW).
- `app/lab/dither/LabDither.tsx` — section E.
- `app/ask/page.tsx` (NEW = moved home) · `app/page.tsx` (REWRITE = landing) · `app/components/SiteNav.tsx` (+ MobileNav auto) · nav tests.
- Landing sections live inside the new `app/page.tsx` (+ small client islands if needed).

---

### Task 1: `bayer.ts` luminance path

**Interfaces:** `export function bayerLuminancePasses(data: Uint8ClampedArray, cols: number, rows: number, matrix?: "4x4" | "8x8"): boolean[]` — per cell, `true` when relative luminance (0..1, from sRGB via 0.2126R+0.7152G+0.0722B, premultiplied by alpha) `>=` the ordered threshold at (x,y). Export `BAYER8` too (standard 8x8 matrix) with `bayerThreshold8`.

- [ ] TDD in `app/lib/bayer.test.ts`: white frame → all true; black → all false; mid-gray (128) → exactly half under 4x4 (mirrors the alpha test); alpha 0 pixel → false regardless of RGB; 8x8 matrix is a permutation of 0..63.
- [ ] Implement (share the threshold lookup; keep existing exports untouched).
- [ ] Verify + commit: `feat: bayer luminance path for the dithered video hero`

### Task 2: `DitherVideo` component

**Interfaces:** `DitherVideo({ src, poster?, colorBack, colorFront, cols = 240, matrix = "4x4", className? })`.

- [ ] Client component: hidden `<video muted loop playsInline autoPlay preload="auto">`; on `playing`, a rAF loop draws the video to an offscreen canvas at `cols × rows` (rows from `videoWidth/Height` aspect), `getImageData` → `bayerLuminancePasses` → paint visible canvas cells (front colour where true, back elsewhere; cell = visibleWidth/cols CSS px, DPR≤2, `image-rendering: pixelated` acceptable alternative: draw cells at grid res on a canvas sized cols×rows and scale via CSS with `imageRendering: "pixelated"` — implementer picks the cheaper, visually-crisp option and documents it).
- [ ] Reduced motion: `video.pause()` after first `loadeddata` + single paint. Autoplay rejection: same single-frame path. `src` missing/error: render `children` fallback (the landing passes `DitherFog`).
- [ ] rAF cleanup on unmount; loop only while the element is in-viewport (reuse the lab's InView approach or an internal IntersectionObserver).
- [ ] Verify (tsc/test/build) + commit: `feat: DitherVideo renders any video through the bayer luminance ditherer`

### Task 3: Lab section E (validation before purchase)

- [ ] `/lab/dither` gains **E · Video hero**: `<input type="file" accept="video/*">` → `URL.createObjectURL` → `DitherVideo` full-width (~h-[70vh]) with toggles: palette (ink-on-white / blue-on-white / white-on-ink), cols (160/240/320), matrix (4x4/8x8). Hero copy overlaid (SECTOR4 in Bebas + thesis line + CTA mock button) so the full moment is judged.
- [ ] **Parity proof:** a "capture frame" button grabs the current video frame to a data-URI and renders it side-by-side: paper `ImageDithering` (same 2 colours, `type` matched) vs our `DitherVideo`-paused/`BayerGlyph`-style canvas of the same frame at the same size.
- [ ] Verify + commit: `feat: lab video-hero section with parity proof against paper ImageDithering`

**CHECKPOINT: PR this phase (hidden lab) → owner tests clips + parity → buys b-roll.** Tasks 4-5 may proceed on the same branch meanwhile (fallback hero keeps them shippable).

### Task 4: Ask moves to `/ask` + nav retarget + `?q=` prefill

- [ ] `git mv`-style move: `app/page.tsx` → `app/ask/page.tsx` (content unchanged except: read `useSearchParams().get("q")` on mount → `setQuery(q)` if present, no auto-run; wrap in Suspense if Next requires for useSearchParams in a client page).
- [ ] `SiteNav`: `NAV_LINKS` Ask → `/ask`; `isActiveLink` treats `/` exact (landing) and `/ask` by prefix (existing logic already handles non-"/" prefixes); `emitAskResetIfHome` keys on `href === "/ask" && pathname === "/ask"` (rename to `emitAskResetIfOnAsk`). Ask page listener unchanged (event name same).
- [ ] Temporary `app/page.tsx` placeholder (one-line redirect or minimal stub) so the build stays green until Task 5 replaces it — OR do Task 4+5 in one commit sequence on the branch (implementer's call; the BRANCH must always build).
- [ ] Update nav/link tests (isActiveLink cases for `/` vs `/ask`). Verify + commit: `feat: ask page moves to /ask with query prefill; nav retargeted`

### Task 5: The landing page (design-led)

**Before writing UI, load `frontend-design` and `design-motion-principles` skills.**

- [ ] New `app/page.tsx` (server) per spec §4: hero (full viewport `DitherVideo src="/hero.mp4" poster fallback → DitherFog`; SECTOR4 Bebas wordmark; thesis line; CTA → `/ask`; feathered scrim; scroll cue) + sections: ask-anything chips (deep-link `/ask?q=…`), honest-by-design (live scored-count via `getJson(seasonIndexKey)` server-side, degrade to copy), learn, this-weekend (from `weekend-schedule.json`), minimal footer. Bayer emblems as section markers where apt.
- [ ] Copy: honest-confident, terse; thesis line direction: "An F1 companion that tells you the truth about what it knows." (implementer may refine within tone rules).
- [ ] Entrance motion: restrained, one orchestrated hero moment, all reduced-gated.
- [ ] og/metadata: root metadata updated for the landing (title/description); og-image untouched.
- [ ] Verify tsc/test/build; all routes build; `/ask` works with and without `?q=`.
- [ ] Commit: `feat: sector4.net landing page with dithered-video hero`

---

## Self-Review

- Spec §1 → T1/T2; §2 → T3 (incl. parity proof); §3 → T4; §4 → T5; §5 constraints in Global Constraints; §6 tests distributed (T1 unit, T4 nav/prefill, rest tsc/build+eyeball); §7 rollout = the checkpoint after T3.
- Types: `bayerLuminancePasses` consumed by T2/T3; `DitherVideo` props consumed by T3/T5; reset-event rename touches SiteNav + MobileNav + ask page listener (same event constant).
- No placeholders: T1 has exact test cases; T2/T3 have exact behaviors + implementer-documented choice points; T4 mechanical; T5 is deliberately design-open WITH hard rails (skills, copy rules, structure, fallbacks).
