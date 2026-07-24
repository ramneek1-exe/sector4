# Landing intro section: About Sector 4 + radio helmet

Date: 2026-07-23
Status: design approved, ready for plan
Scope: frontend only. No pipeline, no Python, no API route, no data change.

## 0. Summary

Add an intro section to the landing page, between the hero and the race-track spine, that
says plainly what Sector 4 is. Its visual weight is a large house helmet glyph carrying a
hover microinteraction: the helmet rises, a faint dither pool appears beneath it as a drop
shadow, and a speech bubble emerges playing a single F1 team-radio line word by word. A
different line every time.

Three copy-paste duplications that this work would otherwise extend to a third instance are
extracted first, as bounded behaviour-preserving refactors.

## 1. Decisions (owner-confirmed 2026-07-23)

| Question | Decision |
|---|---|
| Placement | **Above the spine wrapper.** Hero -> intro -> existing `<div className="relative pt-24 sm:pt-32">`. No `SectorNumeral`, no `data-sector-anchor`, no track line. `TrackSpine` geometry untouched. |
| Helmet identity | **House helmet: brand blue shell, no number, no driver, no team.** Not any real driver; no `drivers.json`/`teams.json` coupling. |
| Hover behaviour | **One message per activation, revealed word by word.** Not a multi-line exchange. |
| No-hover input | **Tap and keyboard focus both play it once.** The helmet is a real `<button>`. |
| Copy angle | **What it is, plainly.** Tight: label + heading + 2 sentences. |
| Layout | **Copy left, helmet right.** The shared helmet silhouette's visor faces right, so it looks outward rather than back into the text, and the bubble opens into clear space. |
| Dither shadow technique | **Shader warp, ellipse-masked, mounted only while active** (the `/ask` and `/weekend` look, `CardFog`'s lifecycle). |
| Helmet renderer | **New dedicated component**, not a mode flag on `AsciiGlyph`. |
| Radio logic | **Pure and unit-tested in `app/lib/`**, presentation in the component. |
| Raster-loop cleanup | **In scope.** |

## 2. Architecture

`AboutSector4()` is a server function in `app/page.tsx`, sitting with the existing
`AskAnything` / `LearnTheSport` / `ThisWeekend` / `HonestByDesign` section functions. It
renders the copy plus one client island.

```
app/page.tsx
  <Hero />
  <AboutSector4 />              server: label, heading, body, SectionReveal
      └── <RadioHelmet />       client island (the only interactive piece)
              ├── <HouseHelmet />     brand-blue thresholded helmet field
              ├── <DitherShadow />    ellipse-masked warp, active-gated mount
              └── bubble + word stepper
  <div className="relative pt-24 sm:pt-32">    spine wrapper, unchanged
      <TrackSpine /> …
```

### New files

| File | Purpose |
|---|---|
| `app/lib/race-radio.ts` | `RADIO_MESSAGES`, `pickRadioMessage(prev)`, `radioSteps(text)`. Pure. |
| `app/lib/race-radio.test.ts` | Unit tests for the above. |
| `app/lib/dither-recipe.ts` | Shared warp colours + layer recipe. |
| `app/lib/use-reduced-motion.ts` | The hook currently duplicated in two components. |
| `app/lib/use-reveal-canvas.ts` | Shared rasterize-to-canvas paint + reveal loop. |
| `app/components/HouseHelmet.tsx` | Brand helmet field. No driver, number, or popover. |
| `app/components/DitherShadow.tsx` | Ellipse-masked warp bloom beneath the helmet. |
| `app/components/RadioHelmet.tsx` | Interaction shell: button, rise, shadow, bubble. |

### Modified files

| File | Change |
|---|---|
| `app/page.tsx` | Add `AboutSector4()`; render it between `<Hero />` and the spine wrapper. |
| `app/components/DitherFog.tsx` | Import the shared recipe + reduced-motion hook. |
| `app/components/CardFog.tsx` | Import the shared recipe + reduced-motion hook. |
| `app/components/AsciiGlyph.tsx` | Use `useRevealCanvas`; pass the numeral overlay. |
| `app/components/AsciiEmblem.tsx` | Use `useRevealCanvas`; no overlay. |

## 3. The three extractions

These come first, each landing as its own commit, each verified before the feature is built
on top. All three are strictly behaviour-preserving.

### 3.1 `dither-recipe.ts`

`DitherFog` and `CardFog` each hardcode the same two-layer warp recipe. `DitherShadow` would
be the third copy.

```ts
export const WHITE = "#fafafa";
export const BLUE  = "#406cd6";
export const SKY   = "#459ae4";
export const ACCENT = "#2f2e89";

export const WARP_LAYERS: Partial<DitheringProps>[] = [
  { colorBack: WHITE, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5,  scale: 0.8  },
  { colorBack: WHITE, colorFront: SKY,  shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.55 },
];
```

Values are copied verbatim from the current files. The lab recipe is locked
(`docs/superpowers/plans/2026-07-18-dither-shader-swap.md`); this changes where it lives, not
what it is. Do not retune here.

### 3.2 `use-reduced-motion.ts`

The identical 10-line `useReducedMotion` hook exists in both `DitherFog.tsx` and
`CardFog.tsx`. Move it out, import it in three places.

### 3.3 `use-reveal-canvas.ts`

The substantial one. `AsciiGlyph` and `AsciiEmblem` each carry a near-identical block: DPR
canvas sizing, the cell paint loop, `easeOut` reveal across `REVEAL_MS`, and the
reduced-motion instant-paint branch.

```ts
useRevealCanvas({
  cells,                                        // BayerCell[] | null
  grid,                                         // { cols, rows } | null
  size,                                         // target CSS width in px
  drawOverlay?,                                 // (ctx, progress, dims) => void
}): RefObject<HTMLCanvasElement>
```

`drawOverlay` is the only genuine difference between the two call sites: `AsciiGlyph` uses it
to paint the crisp numeral that fades in over the final 30% of the reveal. `AsciiEmblem` and
`HouseHelmet` pass nothing.

Constraints:

- `REVEAL_MS` (450), the `easeOut` curve, the DPR clamp (`min(2, devicePixelRatio)`), and the
  reduced-motion branch stay exactly as they are today.
- **No existing test may need editing.** If one does, the extraction is not
  behaviour-preserving and must be reworked.
- `AsciiGlyph` and `AsciiEmblem` render on `/ask`, `/weekend`, `/learn`, and the landing page.
  All four need visual verification after the swap.

## 4. Section copy

Label, in the existing `SECTION_LABEL` treatment, with no sector number since the section sits
outside the S1-S4 run:

> About Sector 4

Heading, `SECTION_HEADING`:

> An F1 companion that shows its working.

Body, `SECTION_BODY`:

> Ask anything about the weekend and get a straight answer with the reasoning attached:
> podium odds as honest probabilities, real strategy calls, and the concepts behind both.
> Where the data is thin, it says so instead of sounding sure.

No link or CTA. The hero already carries the primary CTA and S1-S4 each carry their own; a
fifth would dilute them.

## 5. Radio messages

Owner-supplied. Wording verbatim. Two normalizations applied: terminal punctuation added to
the two lines that lacked it, and ellipses unified to the single `…` character.

```ts
export const RADIO_MESSAGES: readonly string[] = [
  "Box, box.",
  "Box for mediums next lap…",
  "Sector 4 pace is good…",
  "Must be the water…",
  "You are now the race leader.",
  "You're the fastest man on track.",
  "If you speak to me every lap, I will disconnect the radio.",
  "Final lap. Push! Push! Push!",
  "We're on Plan B.",
  "That is P3 currently, purple Sector 4.",
  "We are checking…",
];
```

Note: `"We are checking…"` also appears in `LOADING_LINES` (`app/lib/loading-lines.ts`) as
`"We are checking..."` for the `/ask` spinner. Deliberate overlap, left in place; the two
lists stay independent since they serve different surfaces and tones.

### 5.1 `pickRadioMessage(prev: string | null): string`

Returns a random member of `RADIO_MESSAGES` that is not `prev`. If the list has fewer than two
entries it returns the only entry rather than looping. Follows the `pickLoadingLine` precedent.

### 5.2 `radioSteps(text: string): RadioStep[]`

Splits on whitespace and returns one step per word, each carrying the cumulative delay at
which it appears:

```ts
type RadioStep = { text: string; atMs: number };
```

- `text` is the message truncated to that word, so a consumer renders `steps[i].text` directly
  rather than reassembling.
- Base beat: 130ms per word.
- A word ending in `,` `.` `!` `?` or `…` adds an extra 120ms before the next word, so the
  rhythm breaks at punctuation the way a spoken radio call does.
- First step is at `atMs: 0`.
- Final step's `text` equals the input exactly.
- Empty or whitespace-only input returns `[]`.

## 6. Motion spec

At rest the helmet sits still, there is no shadow, no bubble, and **zero WebGL context is
held**.

| Time | Behaviour |
|---|---|
| 0ms | Activation (hover, tap, or focus). A message is picked, never the one just shown. |
| 0-420ms | Helmet rises 14px, `power2.out`. `DitherShadow` mounts and fades in beneath it. |
| 380ms | Bubble opens: scale 0.94 to 1, opacity 0 to 1, over 220ms, transform-origin at the bottom-left (the tail root, nearest the helmet). |
| 560ms onward | Words appear one at a time per `radioSteps`. |
| Deactivation | Bubble closes over 140ms, helmet settles over 350ms, shadow fades over 500ms and then unmounts. |

Re-activating during the fade-out cancels the pending teardown cleanly and picks a fresh
message. Timers are cleared on unmount.

### 6.1 Reduced motion

Under `prefers-reduced-motion: reduce`:

- The helmet does not rise.
- `DitherShadow` renders as a still frame at `speed: 0` rather than being suppressed — this is
  `CardFog`'s existing choice for the same situation, kept for consistency.
- The bubble appears with the complete message; no word stepping.

Content is never gated behind motion.

### 6.2 Accessibility

- The helmet is a real `<button type="button">` with a focus-visible ring matching the other
  interactive glyphs in the codebase.
- `aria-label` describes the affordance, e.g. "Play a team radio message".
- The animating bubble text is `aria-hidden`. A visually-hidden sibling carries the full
  message string, so a screen reader announces the whole line rather than a stutter of partial
  words.

### 6.3 Layout trap

`SectionReveal` sets `y` on every `[data-reveal]` descendant via gsap. The helmet's rise is
also a transform. **These must not land on the same element** or they overwrite each other —
the same class of bug as the footer parallax transform that had to be moved off the `<p>`.

`[data-reveal]` goes on an outer wrapper; the rise transform goes on an inner element.

## 7. Component detail

### 7.1 `HouseHelmet`

Rasterizes `helmetSvgMarkup` (`app/lib/helmet.ts`) with a house palette instead of a resolved
driver glyph: brand blue shell, the shared dark visor `VISOR_FILL`, an accent vent, and
`number: null` so no numeral is drawn or overlaid. The resulting `ImageData` goes through
`thresholdCells` (`app/lib/bayer.ts`) exactly as `AsciiGlyph` does, then through
`useRevealCanvas`.

No `drivers.json` or `teams.json` read. No entity-what popover. No click handler of its own —
`RadioHelmet` owns interaction.

**SSR fallback:** the plain (undithered) helmet SVG at the same box dimensions, swapped for the
canvas once sampling completes. The box is reserved from the known viewBox aspect ratio so the
swap causes no layout shift.

### 7.2 `DitherShadow`

`WARP_LAYERS` inside a wrapper masked to a soft ellipse, positioned beneath the helmet, sized
wider than the helmet and short in height so it reads as a pool on the ground rather than a
halo.

Follows `CardFog`'s two load-bearing rules verbatim, both learned the hard way in the lab:

- `mixBlendMode: "multiply"` goes on the **masked wrapper**, never only on a canvas inside it.
  A mask creates its own stacking context, which isolates inner blend modes and renders as a
  visible white shape.
- The layers **also** carry their own multiply so the two colours accumulate against each other
  within that context.

Mounted only while `active` or mid-fade-out, then unmounted entirely so the WebGL context is
freed. The browser caps live contexts at roughly 16 and evicts the oldest; the landing page
already runs `DitherVideo` in the hero plus a `CardFog` per `SectorNumeral` hover.

### 7.3 `RadioHelmet`

Owns the state machine: `active`, current message, current step index, and the teardown timer.
Handlers for `pointerenter`/`pointerleave`, `focus`/`blur`, and `click` all feed the same
activate/deactivate path.

The bubble is a styled element with a CSS tail pointing down-left toward the helmet. Open,
close, and rise are CSS transitions; word stepping is a React state index advanced by timers
from `radioSteps`. No GSAP — there is no ScrollTrigger involvement here and the transitions are
simple enough that adding a timeline would buy nothing.

## 8. Testing

### Unit (`app/lib/race-radio.test.ts`)

- `RADIO_MESSAGES` is non-empty.
- `pickRadioMessage` always returns a list member.
- `pickRadioMessage(prev)` never returns `prev` across repeated draws.
- `pickRadioMessage` on a single-entry list returns that entry and terminates.
- `radioSteps` returns one step per whitespace-separated word.
- `radioSteps` delays are cumulative and strictly non-decreasing.
- `radioSteps` first step is at `atMs: 0`.
- `radioSteps` final step's `text` equals the input exactly.
- A word ending in punctuation lengthens the gap before the next word.
- Empty and whitespace-only input return `[]`.

### Refactor guard

The three extractions in §3 ship with **zero changes to existing tests**. The full suite
(currently 243 pass / 2 skip) passes untouched, plus the new `race-radio` cases.

### Browser QA

- Hover, tap, and keyboard-focus paths each play the interaction once and settle.
- Consecutive activations never repeat a message back-to-back.
- Reduced motion: helmet static, shadow a still frame, full message text present.
- SSR to canvas swap causes no layout shift.
- No hydration errors, no console errors.
- No horizontal overflow at 1440px or at approximately 500px.
- `/ask`, `/weekend`, `/learn`, and the landing page glyphs are visually unchanged after the
  `useRevealCanvas` swap.
- The spine's grid box, car, and kerbs are unchanged, confirming the inserted section did not
  disturb `TrackSpine` measurement.

## 9. Visual candidates before commit

Per standing project feedback, visual and design constants are shown as rendered candidates
before being committed, not committed and then iterated. The following are candidate
decisions, not constants to be picked in code review:

- Helmet display size.
- Rise distance and easing.
- Shadow ellipse spread, height, and opacity.
- Bubble shape, tail geometry, and typography.

Two to four rendered options for each cluster, shown live, owner picks, then commit.

## 10. Risks

| Risk | Mitigation |
|---|---|
| `useRevealCanvas` extraction touches four shipped surfaces. | Strictly behaviour-preserving; no test edits permitted; visual verification on all four pages. |
| WebGL context pressure on a page already running `DitherVideo`. | Active-gated mount and full unmount at rest, the pattern `CardFog` already proves. |
| `SectionReveal` gsap `y` colliding with the rise transform. | Separate elements, §6.3. |
| Inserting a section shifts the spine's measured anchors. | The section sits outside the spine wrapper and carries no `data-sector-anchor`; confirmed by QA. |
| Helmet SSR-to-canvas swap causing layout shift. | Box reserved from the known viewBox aspect ratio. |

## 11. Out of scope

- The preloader and hero reveal pass. Still the next item after this; unaffected. The
  `data-hero` hooks in `app/page.tsx` stay untouched.
- Any change to `TrackSpine`, `SectorNumeral`, or the S1-S4 sections.
- Any retune of the locked lab dither recipe.
- A mobile variant of the track spine.
