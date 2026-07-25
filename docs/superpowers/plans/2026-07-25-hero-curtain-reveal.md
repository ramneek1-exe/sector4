# Hero Curtain Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the landing preloader's flat 300ms opacity dissolve with a vertical curtain lift with parallax, and hold the hero's `.fog-in` reveal until the curtain is ~65% clear so it plays in open air.

**Architecture:** The overlay `<div>` (warm field) and its child gantry row `<div>` each get a `translateY` keyframe. Child transforms compose with the parent, so the field animates `-100%` and the gantry animates only the *extra* `-30vh`, composing to 130vh of total travel — the nearer object travels further. All timing lives in the existing pure module `app/lib/start-lights.ts`; the component only reads it. A one-line CSS addition (`visibility: hidden`) closes a logged a11y minor.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind + `app/globals.css`, vitest.

**Spec:** `docs/superpowers/specs/2026-07-25-hero-curtain-reveal-design.md`

## Global Constraints

- Landing `/` only. Frontend-only — no API, Python, data, or cron change.
- The **arming** path of the preloader is untouched: lamp visuals, housing geometry, `ARM_INTERVAL_MS`, hero-readiness gating, and `HARD_CAP_MS` all stay exactly as tuned.
- `.fog-in` keyframes themselves are NOT modified — the class is used site-wide. Only *when* it is released changes, plus the `[data-preloader-active]` gate rule.
- Reduced-motion, no-JS, repeat-visit, and non-hydrating paths must behave exactly as they do today.
- Timing invariant that must hold: `HARD_CAP_MS + overlayTeardownMs() < HERO_FAILSAFE_MS`.
- The gantry differential must be expressed in `vh`, never `%` — a percentage `translateY` resolves against the element's own height (~150px), which would be a nudge, not a parallax.
- Commits: conventional-style, one logical change each. **No Claude/AI attribution** — no "Generated with", no `Co-Authored-By`, no robot emoji.
- Round every number that reaches output.
- Duration (700ms), differential (30vh) and easing are **starting points**. They are tuned in Task 4 against rendered candidates, with the owner, before the branch merges.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `app/lib/start-lights.ts` | Modify | Single source of all preloader timing. Gains the curtain constants + two derived helpers + `HERO_FAILSAFE_MS`. Stays pure (no `"use client"`, no DOM) so both the client island and the server component may import it. |
| `app/lib/start-lights.test.ts` | Modify | Timing regression guards, including the previously-unguarded failsafe invariant. |
| `app/globals.css` | Modify | The two curtain keyframes (replacing `preloaderDissolve`), the reduced-motion defense-in-depth block, and the `[data-preloader-active] .fog-in` a11y fix. |
| `app/components/StartLights.tsx` | Modify | Splits `release()` from one beat into three and applies the two animations. No change to the arming path. |
| `app/page.tsx` | Modify | Interpolates `HERO_FAILSAFE_MS` into the inline gate string instead of hard-coding `8000`. |

---

### Task 1: Curtain timing constants and derived helpers

The timing module is pure and already the single source for the sequence, so the component and its tests cannot drift. This task extends it and adds the failsafe invariant that nothing currently protects.

**Files:**
- Modify: `app/lib/start-lights.ts`
- Modify: `app/page.tsx:76-81` (the inline gate `<script>`)
- Test: `app/lib/start-lights.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, for Tasks 2 and 3:
  - `LIGHTS_OUT_HOLD_MS: number` (120)
  - `CURTAIN_MS: number` (700)
  - `TEXT_RELEASE_FRAC: number` (0.65)
  - `HERO_FAILSAFE_MS: number` (8000)
  - `textReleaseDelayMs(): number` → 575
  - `overlayTeardownMs(): number` → 820
  - `OUT_MS` (300) is left in place and unused for now. It is deleted in Task 3, together
    with its last usage, so that every commit on this branch typechecks on its own.

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/start-lights.test.ts`, and add the new names to the existing import block at the top of that file (`CURTAIN_MS`, `HERO_FAILSAFE_MS`, `LIGHTS_OUT_HOLD_MS`, `TEXT_RELEASE_FRAC`, `overlayTeardownMs`, `textReleaseDelayMs`):

```ts
describe("textReleaseDelayMs", () => {
  it("releases the hero partway through the curtain, not at its start", () => {
    // 120ms dark-gantry beat + 65% of the 700ms lift.
    expect(textReleaseDelayMs()).toBe(575);
  });
  it("stays derived from the constants rather than hard-coded", () => {
    expect(textReleaseDelayMs()).toBe(LIGHTS_OUT_HOLD_MS + CURTAIN_MS * TEXT_RELEASE_FRAC);
  });
  it("lands before the overlay unmounts, so the hero never reveals into a gap", () => {
    expect(textReleaseDelayMs()).toBeLessThan(overlayTeardownMs());
  });
});

describe("overlayTeardownMs", () => {
  it("is the dark beat plus the full curtain", () => {
    expect(overlayTeardownMs()).toBe(820);
    expect(overlayTeardownMs()).toBe(LIGHTS_OUT_HOLD_MS + CURTAIN_MS);
  });
});

describe("failsafe invariant", () => {
  // app/page.tsx's inline gate force-reveals the hero at HERO_FAILSAFE_MS in case React
  // never hydrates. If the sequence ever outgrew that, the failsafe would fire DURING the
  // curtain and reveal the hero mid-lift. Nothing else guards this.
  it("finishes the worst-case sequence before the inline failsafe fires", () => {
    expect(HARD_CAP_MS + overlayTeardownMs()).toBeLessThan(HERO_FAILSAFE_MS);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/lib/start-lights.test.ts`
Expected: FAIL — the new imports are not exported yet (`No "textReleaseDelayMs" export is defined`).

- [ ] **Step 3: Implement the constants and helpers**

In `app/lib/start-lights.ts`, leave the existing `OUT_MS` line alone for now (Task 3 deletes
it along with its last usage, so this commit still typechecks) and append:

```ts
// --- Lights-out → hero curtain ------------------------------------------------
// See docs/superpowers/specs/2026-07-25-hero-curtain-reveal-design.md.
// Replaces the old flat opacity dissolve (OUT_MS): the warm field lifts straight up
// out of frame while the gantry lifts further on top of it (parallax).

/** A beat on the dark gantry after the lamps go out, before the lift starts — the "GO". */
export const LIGHTS_OUT_HOLD_MS = 120;
/** How long the curtain itself takes to clear the viewport. */
export const CURTAIN_MS = 700;
/** How far through the curtain the hero's paused .fog-in is released. */
export const TEXT_RELEASE_FRAC = 0.65;
/**
 * The inline gate in app/page.tsx force-reveals the hero this long after parse, so a
 * bundle that never hydrates can't strand it invisible behind a paused .fog-in. Exported
 * from here (rather than hard-coded in that JS string) so the page interpolates one value
 * and the invariant below stays testable.
 */
export const HERO_FAILSAFE_MS = 8000;

/**
 * Delay after lights-out at which [data-preloader-active] is dropped, releasing the hero's
 * .fog-in. Deliberately mid-curtain, not at its start: fog-in runs 0.7s, so releasing it
 * with the lift would spend most of that reveal hidden behind an opaque overlay.
 */
export function textReleaseDelayMs(): number {
  return LIGHTS_OUT_HOLD_MS + CURTAIN_MS * TEXT_RELEASE_FRAC;
}

/** Delay after lights-out at which the overlay unmounts (the curtain has fully cleared). */
export function overlayTeardownMs(): number {
  return LIGHTS_OUT_HOLD_MS + CURTAIN_MS;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/lib/start-lights.test.ts`
Expected: PASS, all cases including the pre-existing `armSchedule` / `pickHold` / `resolveLightsOut` suites.

- [ ] **Step 5: Remove the magic number from the inline gate**

`app/lib/start-lights.ts` has no `"use client"` directive, so importing it from the server component `app/page.tsx` is safe — it will not turn its exports into client references the way `app/lib/gsap.ts` would (see that file's header comment).

Add to the imports at the top of `app/page.tsx`:

```tsx
import { HERO_FAILSAFE_MS } from "@/app/lib/start-lights";
```

Then replace the `__html` string (currently ends `...},8000)}}catch(e){}})();`) so the timeout reads from the constant. Only a number is interpolated:

```tsx
      <script
        dangerouslySetInnerHTML={{
          __html:
            "(function(){try{if(!sessionStorage.getItem('s4-preloaded')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){var d=document.documentElement;d.setAttribute('data-preloader-active','');setTimeout(function(){d.removeAttribute('data-preloader-active')}," +
            HERO_FAILSAFE_MS +
            ")}}catch(e){}})();",
        }}
      />
```

Also update that `<script>`'s existing comment block directly above it: the phrase "well past the ~5s sequence" is now stale — the worst case is ~6.3s. Change it to read "well past the worst-case ~6.3s sequence (guarded by a test in start-lights.test.ts)".

- [ ] **Step 6: Verify the build still compiles**

Run: `npx tsc --noEmit`
Expected: no errors. `OUT_MS` is still exported and still imported by `StartLights.tsx`; that is intentional at this point.

- [ ] **Step 7: Commit**

```bash
git add app/lib/start-lights.ts app/lib/start-lights.test.ts app/page.tsx
git commit -m "feat: curtain timing constants and hero-failsafe invariant"
```

---

### Task 2: Curtain keyframes and the hero a11y fix

Declarative CSS only. There is no unit test for keyframes — this task's gate is that the build compiles and that Task 4's browser pass confirms the motion. Its correctness-critical part is the `vh` unit and the `visibility` addition, both of which a reviewer can check by reading.

**Files:**
- Modify: `app/globals.css:41-56`

**Interfaces:**
- Consumes: nothing at runtime. The durations/delays are supplied by Task 3 from `app/lib/start-lights.ts`; these keyframes declare only the transforms.
- Produces, for Task 3: animation names `preloaderCurtain` and `preloaderCurtainGantry`, and the class hook `.start-lights-gantry`.

- [ ] **Step 1: Add `visibility: hidden` to the existing preloader gate rule**

The hero's h1, CTA and scroll cue sit at `opacity: 0` while `.fog-in` is paused. An `opacity: 0` element is still focusable and still in the accessibility tree, so a keyboard user tabbing during the sequence lands on an invisible CTA beneath an opaque overlay (logged minor, handoff.md). `visibility: hidden` removes an element from both the tab order and the a11y tree, applies pre-paint, and reverts automatically when the attribute drops — so unlike `inert` there is no teardown path that could strand the hero permanently unfocusable.

In `app/globals.css`, the rule currently reads:

```css
[data-preloader-active] .fog-in {
  animation-play-state: paused;
}
```

Change it to:

```css
[data-preloader-active] .fog-in {
  animation-play-state: paused;
  /* Not just invisible — unfocusable. opacity:0 leaves the hero CTA in the tab order and
     the a11y tree beneath the opaque overlay; visibility:hidden removes it from both.
     Reverts on its own when the attribute drops, and fogIn starts at opacity 0 so
     becoming visible again shows nothing until the animation paints it. */
  visibility: hidden;
}
```

- [ ] **Step 2: Replace the dissolve keyframes with the curtain keyframes**

Delete:

```css
@keyframes preloaderDissolve {
  from { opacity: 1; }
  to { opacity: 0; }
}
```

Replace with:

```css
/* Lights-out handoff: the warm field lifts straight up out of frame, and the gantry —
   drawn ON the field, so the nearer object — lifts further on top of it. Child transforms
   compose with the parent, so the gantry keyframe carries only the EXTRA travel, giving
   130vh total against the field's 100vh.

   The gantry travel MUST be vh, not %: a percentage translateY resolves against the
   element's own height, and the gantry row is only ~150px tall, so -30% would be a ~45px
   nudge rather than a parallax. */
@keyframes preloaderCurtain {
  to { transform: translateY(-100%); }
}
@keyframes preloaderCurtainGantry {
  to { transform: translateY(-30vh); }
}
```

- [ ] **Step 3: Extend the reduced-motion defense-in-depth block**

The block currently reads:

```css
@media (prefers-reduced-motion: reduce) {
  /* The overlay is JS-gated off under reduced-motion; keep the dissolve inert
     as defense-in-depth. */
  .start-lights-overlay {
    animation: none !important;
  }
}
```

Change it to cover the gantry too:

```css
@media (prefers-reduced-motion: reduce) {
  /* The overlay is JS-gated off under reduced-motion; keep the curtain inert
     as defense-in-depth. */
  .start-lights-overlay,
  .start-lights-gantry {
    animation: none !important;
  }
}
```

- [ ] **Step 4: Verify no stale references remain**

Run: `grep -rn "preloaderDissolve" app/`
Expected: no output. (If `StartLights.tsx` still matches, that is expected at this point — Task 3 replaces it. Note it and move on; do not re-add the keyframe.)

Run: `npx tsc --noEmit`
Expected: unchanged from Task 1 — CSS is not typechecked.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat: curtain-lift keyframes, hide paused hero content from focus"
```

---

### Task 3: Split the release into three beats and drive the curtain

**Files:**
- Modify: `app/components/StartLights.tsx`
- Modify: `app/lib/start-lights.ts` (delete the now-unused `OUT_MS`)

**Interfaces:**
- Consumes from Task 1: `LIGHTS_OUT_HOLD_MS`, `CURTAIN_MS`, `textReleaseDelayMs()`, `overlayTeardownMs()`.
- Consumes from Task 2: `preloaderCurtain`, `preloaderCurtainGantry`, `.start-lights-gantry`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the imports**

In `app/components/StartLights.tsx`, the import block currently reads:

```tsx
import {
  HARD_CAP_MS,
  LIGHT_COUNT,
  OUT_MS,
  armSchedule,
  pickHold,
  resolveLightsOut,
} from "@/app/lib/start-lights";
```

Change it to:

```tsx
import {
  CURTAIN_MS,
  HARD_CAP_MS,
  LIGHTS_OUT_HOLD_MS,
  LIGHT_COUNT,
  armSchedule,
  overlayTeardownMs,
  pickHold,
  resolveLightsOut,
  textReleaseDelayMs,
} from "@/app/lib/start-lights";
```

- [ ] **Step 2: Add the easing constant**

Alongside the other visual constants near the top of the file (after `BACKDROP`), add:

```tsx
// Weighty ease-in-out for the curtain — it should feel like mass being lifted, not a
// fade. Tuned with the owner against rendered candidates (see the plan's Task 4).
const CURTAIN_EASE = "cubic-bezier(0.76, 0, 0.24, 1)";
```

- [ ] **Step 3: Split `release()` into three beats**

`release()` currently drops the attribute immediately and unmounts after `OUT_MS`:

```tsx
    const release = () => {
      if (released.current) return;
      released.current = true;
      setPhase("out");
      root.removeAttribute("data-preloader-active"); // un-pause hero fog-in
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* private mode / disabled storage: still reveal, just replay next visit */
      }
      timers.push(window.setTimeout(() => setPhase("done"), OUT_MS));
    };
```

Replace it with:

```tsx
    const release = () => {
      if (released.current) return;
      released.current = true;
      setPhase("out"); // lamps go dark; the curtain animation starts after its own delay
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* private mode / disabled storage: still reveal, just replay next visit */
      }
      // Hold the hero's paused fog-in until the curtain is mostly clear, so its 0.7s
      // reveal plays in open air instead of behind an opaque overlay.
      timers.push(
        window.setTimeout(() => root.removeAttribute("data-preloader-active"), textReleaseDelayMs()),
      );
      timers.push(window.setTimeout(() => setPhase("done"), overlayTeardownMs()));
    };
```

Both timers go through the existing `timers` array, so the effect's existing cleanup (`timers.forEach(clearTimeout)`) still clears them on unmount.

- [ ] **Step 4: Apply the curtain animations**

The overlay's returned JSX currently reads:

```tsx
    <div
      className="start-lights-overlay fixed inset-0 z-50 flex items-center justify-center"
      aria-hidden
      style={{
        background: BACKDROP,
        animation: phase === "out" ? `preloaderDissolve ${OUT_MS}ms ease forwards` : undefined,
      }}
    >
      <div className="flex max-w-full items-center px-3" style={{ gap: ROW_GAP }}>
```

Replace those two opening tags with:

```tsx
    <div
      className="start-lights-overlay fixed inset-0 z-50 flex items-center justify-center"
      aria-hidden
      style={{
        background: BACKDROP,
        willChange: "transform",
        animation:
          phase === "out"
            ? `preloaderCurtain ${CURTAIN_MS}ms ${CURTAIN_EASE} ${LIGHTS_OUT_HOLD_MS}ms forwards`
            : undefined,
      }}
    >
      <div
        className="start-lights-gantry flex max-w-full items-center px-3"
        style={{
          gap: ROW_GAP,
          willChange: "transform",
          // Child transforms compose with the parent's, so this carries only the EXTRA
          // travel over the field — the gantry is the nearer object and clears the top
          // edge first, with the field trailing it out.
          animation:
            phase === "out"
              ? `preloaderCurtainGantry ${CURTAIN_MS}ms ${CURTAIN_EASE} ${LIGHTS_OUT_HOLD_MS}ms forwards`
              : undefined,
        }}
      >
```

The `animation-delay` of `LIGHTS_OUT_HOLD_MS` is what produces the dark-gantry beat: `phase` flips to `"out"` (all lamps dark, since the render already gates `lit={phase === "arming" && i < lit}`) and the lift begins 120ms later.

- [ ] **Step 5: Update the component's header comment**

The file header currently ends "...then all extinguish and the field dissolves to release the hero's fog-in reveal." Replace that clause with:

```
// ...then all extinguish, hold a beat, and the field lifts up out of frame — the
// gantry lifting further on top of it (parallax) — releasing the hero's fog-in
// partway through so its reveal plays in the clear. See
// docs/superpowers/specs/2026-07-25-hero-curtain-reveal-design.md.
```

- [ ] **Step 6: Delete the now-unused `OUT_MS`**

Its last usage is gone as of Step 4, so remove the line from `app/lib/start-lights.ts`:

```ts
export const OUT_MS = 300;
```

- [ ] **Step 7: Verify typecheck, tests and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: full suite passes (264 pass / 2 skip as of the branch point, plus Task 1's new cases).

Run: `grep -rn "OUT_MS\|preloaderDissolve" app/`
Expected: matches only `LIGHTS_OUT_HOLD_MS`. No bare `OUT_MS`, no `preloaderDissolve`.

Run: `rm -rf .next && npm run build`
Expected: build succeeds. (`npm run dev` overwrites `.next` with dev artifacts that make a later `npm start` serve broken output — always rebuild before any prod-build verification.)

- [ ] **Step 8: Commit**

```bash
git add app/components/StartLights.tsx app/lib/start-lights.ts
git commit -m "feat: lift the preloader field as a parallax curtain"
```

---

### Task 4: Live verification and the owner's visual pass

The three tuning knobs are deliberately not locked by this plan. The owner reviews rendered candidates before the branch merges, and has asked to see all three together in one pass rather than one at a time.

**Files:**
- Modify (only if the owner's pass changes values): `app/lib/start-lights.ts` (`CURTAIN_MS`), `app/components/StartLights.tsx` (`CURTAIN_EASE`), `app/globals.css` (the `-30vh` in `preloaderCurtainGantry`).

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: the merge-ready branch.

- [ ] **Step 1: Serve a real production build**

```bash
rm -rf .next && npm run build && npm start
```

`pkill -f "next start"` does **not** kill this server — the process renames itself to `next-server`. To stop or restart it, kill by PID: `kill $(lsof -ti tcp:3000 -sTCP:LISTEN)`, then confirm the listener actually changed before trusting any screenshot.

- [ ] **Step 2: Verify the sequence in a fresh browser context**

The preloader is once-per-session, so every run needs a fresh isolated context (or `sessionStorage.removeItem('s4-preloaded')` followed by a reload).

Confirm, in order:
- Five housings arm left to right, ~800ms apart (unchanged from before this branch).
- All lamps go dark, then a brief beat before anything moves.
- The field lifts straight **up**; the gantry visibly outruns it and clears the top edge first.
- The hero thesis begins its rise **after** the curtain is mostly gone — not behind it.
- The overlay is fully gone by the time the CTA settles.

- [ ] **Step 3: Verify the a11y fix**

With the preloader running, press Tab repeatedly. Expected: focus never lands on the hero's "Ask your first question" CTA while the overlay is up. After the release, Tab reaches it normally.

Then confirm the release actually restores it, in the console during the sequence:

```js
getComputedStyle(document.querySelector('[data-hero="cta"]')).visibility
// -> "hidden" during the sequence, "visible" after the release
```

- [ ] **Step 4: Verify the untouched paths**

- **Repeat visit:** reload in the same context. Expected: no overlay, hero immediate, zero added delay.
- **Reduced motion:** reduced-motion cannot be emulated through the Chrome DevTools tooling — override `window.matchMedia` in a navigation `initScript`, delegating every method to the real MQL (bound) and overriding only `matches`, or `addEventListener` throws `Illegal invocation`. Expected: no overlay at all, hero present immediately, no curtain.
- **No JS:** disable JavaScript and load `/`. Expected: hero renders, `.fog-in` runs, nothing stuck hidden.

- [ ] **Step 5: Owner visual pass**

Present rendered candidates varying all three knobs together, and let the owner pick:

| Knob | Current | Candidates to show |
|---|---|---|
| `CURTAIN_MS` | 700 | 550 (snappy) · 700 · 900 (weighty) |
| gantry differential | `-30vh` | `-15vh` (subtle) · `-30vh` · `-50vh` (gantry rockets away) |
| `CURTAIN_EASE` | `cubic-bezier(0.76, 0, 0.24, 1)` | that (ease-in-out quart) · `cubic-bezier(0.16, 1, 0.3, 1)` (fast out, long settle) · `cubic-bezier(0.65, 0, 0.35, 1)` (softer) |

Show real rendered candidates before committing anything — do not commit a value and iterate on it afterward.

If the owner changes `CURTAIN_MS`, re-run `npx vitest run app/lib/start-lights.test.ts`: `textReleaseDelayMs`/`overlayTeardownMs` assert exact values (575 / 820) and those expectations must be updated to match the new constants. The derived-from-constants and failsafe-invariant cases should keep passing untouched — if the failsafe case fails, the sequence has outgrown the 8000ms gate and the duration must come back down.

- [ ] **Step 6: Full verification before merge**

```bash
npx tsc --noEmit
npm test
rm -rf .next && npm run build
```

Expected: all clean.

- [ ] **Step 7: Commit any tuning changes**

```bash
git add -A
git commit -m "fix: tune curtain duration, parallax depth and easing"
```

(Skip this commit if the owner's pass changed nothing.)

---

## Notes for the reviewer

- The **arming** path must come out of this branch byte-identical. A diff touching lamp geometry, colors, `ARM_INTERVAL_MS`, `HARD_CAP_MS`, or the hero-readiness gating is out of scope.
- Watch for `%` sneaking into `preloaderCurtainGantry`. It will look almost-right — a ~45px nudge instead of a parallax — which is exactly the kind of thing that survives a quick eyeball.
- `willChange` is gated to the `"out"` phase so the layers are only promoted for the curtain itself, not for the whole arming sequence.
- The `visibility: hidden` addition is scoped to `[data-preloader-active] .fog-in`, which only ever matches on `/` during the sequence. It cannot affect `.fog-in` anywhere else on the site.
