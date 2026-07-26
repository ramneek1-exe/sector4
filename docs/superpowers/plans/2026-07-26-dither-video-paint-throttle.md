# DitherVideo Paint-Loop Throttle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap `DitherVideo`'s per-frame canvas repaint to 30fps (matching the source video's real encode rate) instead of uncapped native display refresh rate, to eliminate the repeated-long-task pattern the SEO audit's performance pass found on `/`.

**Architecture:** A pure, unit-tested `shouldPaint(now, lastPaint, minIntervalMs): boolean` helper in a new `app/lib/frame-throttle.ts`, wired into the existing rAF loop in `app/components/DitherVideo.tsx` — the loop still calls `requestAnimationFrame` every tick, but only calls the expensive `paintFrame()` when the helper says enough time has elapsed.

**Tech Stack:** TypeScript, vitest (existing project conventions — pure logic in `app/lib/*.ts`, tested alongside in `*.test.ts`, called from components).

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-07-26-dither-video-paint-throttle-design.md`.
- Do NOT touch `app/components/StartLights.tsx` or any part of the hero readiness-gate timing (`canplay` listener, `resolveLightsOut`, `HARD_CAP_MS`, etc. in `app/lib/start-lights.ts`) — zero risk to the preloader/curtain-reveal sequence.
- Do NOT change `cols`/`colsDesktop` props, the Bayer matrix algorithm, or sampling resolution — those are tuned visual-quality knobs, out of scope.
- Target rate: 30fps (`1000 / 30` ≈ 33.33ms minimum interval) — matches `public/hero.mp4`'s confirmed `r_frame_rate=30/1` (via `ffprobe`).
- Round every number that reaches output/logs, per house rules — not applicable here (no numeric output), but keep in mind if verification numbers get written anywhere.

---

### Task 1: `shouldPaint` pure throttle helper

**Files:**
- Create: `app/lib/frame-throttle.ts`
- Test: `app/lib/frame-throttle.test.ts`

**Interfaces:**
- Produces: `shouldPaint(now: number, lastPaint: number, minIntervalMs: number): boolean` — pure function, no side effects, no DOM/timer access. Later task (Task 2) imports this exact name and signature from `@/app/lib/frame-throttle`.

- [ ] **Step 1: Write the failing test**

Create `app/lib/frame-throttle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldPaint } from "./frame-throttle";

describe("shouldPaint", () => {
  it("returns false when less time than minIntervalMs has elapsed", () => {
    expect(shouldPaint(1010, 1000, 33.33)).toBe(false);
  });

  it("returns true when exactly minIntervalMs has elapsed", () => {
    expect(shouldPaint(1033.33, 1000, 33.33)).toBe(true);
  });

  it("returns true when more than minIntervalMs has elapsed", () => {
    expect(shouldPaint(1100, 1000, 33.33)).toBe(true);
  });

  it("returns true on the very first call (lastPaint = 0, now is any real timestamp)", () => {
    expect(shouldPaint(5, 0, 33.33)).toBe(true);
  });

  it("is a pure function: same inputs always produce the same output", () => {
    const a = shouldPaint(2000, 1900, 33.33);
    const b = shouldPaint(2000, 1900, 33.33);
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/frame-throttle.test.ts`
Expected: FAIL — `Cannot find module './frame-throttle'` (the file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `app/lib/frame-throttle.ts`:

```ts
// A pure elapsed-time gate for rAF loops that don't need to do their expensive
// work on every tick — e.g. DitherVideo's paint loop, which re-dithers a video
// frame that itself only updates at the source encode's real frame rate.
// requestAnimationFrame still fires every display refresh (cheap, keeps existing
// pause/visibility semantics); this decides whether the tick should also do the
// expensive work.
export function shouldPaint(now: number, lastPaint: number, minIntervalMs: number): boolean {
  return now - lastPaint >= minIntervalMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/frame-throttle.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/frame-throttle.ts app/lib/frame-throttle.test.ts
git commit -m "feat: add shouldPaint pure rAF-throttle helper"
```

---

### Task 2: Wire the throttle into `DitherVideo`'s paint loop

**Files:**
- Modify: `app/components/DitherVideo.tsx` (the rAF-loop `useEffect`, currently at lines 270-280 — line numbers may have shifted slightly if Task 1 or other work touched the file; locate by the comment `// The rAF paint loop: only while actually playing, near-viewport, and tab-visible.`)

**Interfaces:**
- Consumes: `shouldPaint(now: number, lastPaint: number, minIntervalMs: number): boolean` from `@/app/lib/frame-throttle` (Task 1).

- [ ] **Step 1: Read the current effect to confirm exact current code**

Open `app/components/DitherVideo.tsx` and find:

```tsx
  // The rAF paint loop: only while actually playing, near-viewport, and tab-visible.
  useEffect(() => {
    if (reduced || !playing || !inView || !pageVisible) return;
    let raf = 0;
    const tick = () => {
      paintFrame();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, playing, inView, pageVisible, paintFrame]);
```

If the surrounding code has shifted, this is still the ONLY `useEffect` in the file that calls `requestAnimationFrame` — confirm by searching for `requestAnimationFrame` in the file (there should be exactly one match).

- [ ] **Step 2: Add the import**

At the top of `app/components/DitherVideo.tsx`, alongside the existing imports (near `import { bayerLuminancePasses } from "@/app/lib/bayer";`), add:

```tsx
import { shouldPaint } from "@/app/lib/frame-throttle";
```

- [ ] **Step 3: Replace the effect body**

Replace the effect found in Step 1 with:

```tsx
  // The rAF paint loop: only while actually playing, near-viewport, and tab-visible.
  // Gated to ~30fps (PAINT_INTERVAL_MS), matching the source video's real encode rate
  // (confirmed via ffprobe: public/hero.mp4 is 30fps) -- painting faster just re-dithers
  // the identical decoded frame, which was the cause of a repeated-long-task pattern
  // found by a performance audit (see docs/superpowers/specs/2026-07-26-dither-video-
  // paint-throttle-design.md). requestAnimationFrame still fires every display refresh
  // so the existing pause/visibility semantics are unchanged -- only the expensive
  // paintFrame() call itself is throttled.
  useEffect(() => {
    if (reduced || !playing || !inView || !pageVisible) return;
    let raf = 0;
    let lastPaint = 0;
    const tick = (now: number) => {
      if (shouldPaint(now, lastPaint, PAINT_INTERVAL_MS)) {
        lastPaint = now;
        paintFrame();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, playing, inView, pageVisible, paintFrame]);
```

- [ ] **Step 4: Add the `PAINT_INTERVAL_MS` constant**

Near the top of the file, alongside the other module-level constants (find `let swatchCanvas: HTMLCanvasElement | null = null;` and add before or after it):

```tsx
// Matches public/hero.mp4's real encode rate (ffprobe: r_frame_rate=30/1) -- painting
// the dither canvas faster than the source video's own frame rate is pure waste.
const PAINT_INTERVAL_MS = 1000 / 30;
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests still pass (this component has no existing dedicated test file — confirm via `ls app/components/DitherVideo.test.ts* 2>/dev/null`, expected: no such file, matching the codebase's existing convention of not unit-testing page/component JSX directly).

- [ ] **Step 7: Build and manually verify in-browser**

```bash
rm -rf .next && npm run build
lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill 2>/dev/null
npm start &
sleep 3
```

Then use `chrome-devtools-mcp` (navigate to `http://localhost:3000/`, wait for the hero to be visible and playing) or the `npx lighthouse` CLI (mobile, simulated throttling, `--only-categories=performance`) to capture a trace/report of `/`. Confirm:
- The long-tasks audit / performance trace no longer shows the evenly-spaced ~130ms-apart cluster of same-size tasks that the original SEO audit found (`sector4.net-audit/findings/performance.md`, if that gitignored scratch dir still exists locally — otherwise rely on the description in the design spec).
- The hero visually still plays smoothly (dither texture updates, no visible stutter or frozen frame) — throttling to 30fps should be imperceptible since that's the source's real rate, but confirm by eye.
- CLS is still 0 (unrelated to this change, but cheap to reconfirm).

- [ ] **Step 8: Commit**

```bash
git add app/components/DitherVideo.tsx
git commit -m "perf: throttle DitherVideo paint loop to 30fps

Was calling paintFrame() (canvas drawImage + getImageData + a per-
pixel dither loop + putImageData) on every rAF tick -- uncapped
native display refresh rate. public/hero.mp4 is 30fps (confirmed via
ffprobe), so anything faster was re-dithering the same decoded frame
for no visual benefit. This was the source of a repeated-long-task
pattern a performance audit found on / (evenly-spaced same-size
tasks, no yielding -- an INP risk). requestAnimationFrame still fires
every tick (pause/visibility semantics unchanged); only the expensive
paint work is now gated to ~33ms intervals via the new shouldPaint
helper."
```

---

## Self-review notes

- **Spec coverage:** the design spec's single fix (throttle the paint loop to 30fps, pure helper + wiring, verify with before/after measurement) is fully covered by Task 1 (helper) + Task 2 (wiring + verification). The spec's "what this does NOT touch" list (StartLights, readiness gate, cols/matrix, visual output) is enforced by Task 2 only ever touching the one `useEffect` plus one new constant/import — no other lines in `DitherVideo.tsx` or any line in `StartLights.tsx`/`start-lights.ts` are modified.
- **No placeholders:** every step has literal, complete code — no "add appropriate X" language.
- **Type consistency:** `shouldPaint(now: number, lastPaint: number, minIntervalMs: number): boolean` is identical in Task 1's implementation and Task 2's usage.
