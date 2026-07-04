# M7 (slice 3) — Explainers 8 → 24, with "Race control" and "Power & energy" groups

**Status:** design approved 2026-07-03, ready for planning.
**Milestone:** M7 (breadth + polish). Third M7 sub-project (after the `/accuracy` calibration
curve and the dominant-compound wiring). Remaining after this: visual polish, optional
championship projection.

## 1. Purpose

Grow the learning layer (PRD §6.6, the product heart) from **8 to 24 concept-whats** and add
two new thematic groups, **Race control** and **Power & energy**, so the "watches races, skips
practice" audience has broad, grounded explainers by public launch. M7's DoD names "explainers
toward 15"; the owner chose to push to the top of the PRD's 15–25 range with race-watching
concepts (marbles, flags, double-stacking) and the 2026 power-unit story (harvesting, energy
deployment modes), which the product treats as a headline feature.

This is primarily **content authoring** plus small wiring: two new emblems for the two new
groups and the `emblemForGroup` mapping. The concept-what model, `/learn` pages, `TrustBadge`,
the M6-B linkify/popover, and the `app/lib/concepts.ts` accessors are all generic over the
concept array and need no changes.

## 2. The concept set — 16 new, 24 total

Each new concept is authored in the product voice (short `summary`, `body[]` paragraphs,
`whyItMatters`), 2026-accurate (active-aero era, current hybrid power units), **no em-dashes**,
with `aliases`, `related`, allowlisted `sources`, and **`badge: "drafted"`** (owner decision;
the existing 8 stay `verified`, so `/learn` shows an honest mixed badge state).

**Existing 8 (verified, unchanged):** tyre-degradation, undercut-overcut, stop-count-strategy,
pit-lane-time-loss | qualifying-vs-race-pace, track-evolution | dirty-air, drs.

**New 16 (drafted):**

| Group | Slug | One-line scope |
|---|---|---|
| Tyres & strategy | **tyre-compounds** | The C1–C5 range and the soft/medium/hard naming picked per weekend; softer = faster but shorter life; the weekend's Pirelli allocation. Pairs with the dominant-compound feature. |
| Tyres & strategy | **marbles** | Bits of worn rubber flung off the racing line; why off-line is slippery, and what that means for overtaking and restarts. |
| Tyres & strategy | **double-stacking** | Pitting both cars on back-to-back laps in one window (often under a safety car); the extra time the second car loses. |
| Pace & sessions | **fp-session-purpose** | What FP1/FP2/FP3 are each for (setup, long runs, quali sims); why FP2 long runs matter most for race pace. |
| Pace & sessions | **sandbagging** | Teams hiding true pace in practice (heavy fuel, engine modes turned down); why raw FP times can mislead. |
| Pace & sessions | **sector-characteristics** | Tracks split into timed sectors and corner types (low/medium/high-speed); why a car strong in one sector may not be in another. |
| Air & aero | **slipstream-tow** | Running in the wake cuts drag on a straight for a speed boost — the helpful side of following, opposite dirty air's cornering harm. |
| Air & aero | **ground-effect** | The 2022+ underfloor/venturi that makes most of the downforce; why cars can follow a little closer; the porpoising history. |
| Race control | **safety-car-vsc** | Full SC vs Virtual SC; bunching the field, cheaper stops, strategy resets; why it adds the uncertainty behind our SC caveat. |
| Race control | **flags** | The flag and light-panel system: yellow, double-yellow, blue (being lapped), red, and chequered. `blue flags` folded in here, not a separate concept. |
| Race control | **grid-penalties** | Why a driver starts lower than they qualified (power-unit component limits, gearbox, incidents); grid drops vs pit-lane starts. |
| Race control | **dnf-reliability** | "Did Not Finish": mechanical failures, crashes, retirements; why reliability shapes results and the uncertainty in our predictions. |
| Power & energy | **fuel-effect** | Cars start heavy and lighten as fuel burns (~0.03s/kg); why early-stint laps are slower; fuel correction to compare true pace. |
| Power & energy | **lift-and-coast** | Lifting off the throttle before braking to manage the car. In 2026, primarily an ENERGY-management tool (banking battery charge), as well as saving fuel, tyres, and brakes; its laptime cost. Common shorthand: "lico". |
| Power & energy | **energy-harvesting** | Recovering energy under braking into the battery (the MGU-K / ERS). With the 2026 power unit drawing close to half its output from electrical power, harvesting well over a lap is central to both attack and defence. |
| Power & energy | **power-modes** | The 2026 driver-selectable energy deployment: the manual override / "overtake" boost that hands extra electrical power to attack or defend, and how deployment is managed across a lap. Cross-linked to DRS & Active Aero for the aero "straight mode". |

Group balance: **Tyres & strategy 7 / Pace & sessions 5 / Air & aero 4 / Race control 4 /
Power & energy 4 = 24.** (No existing concept changes group; `fuel-effect` and `lift-and-coast`
are new and authored directly into Power & energy.)

## 3. New groups + emblems — `app/lib/emblems.ts`

Add two new emblem kinds for the two new groups. Both are abstract single-color figures
dithered by `AsciiEmblem`, exactly like the existing `tyre`/`airflow` SVG emblems.

**`flag` — Race control (a chequered flag).** PRD §8 compliance: the §8 constraint bars
**national** flags and flags-in-numbers (driver-identity / likeness). A chequered flag is a
generic, nation-agnostic race-control symbol, not a national flag and not in a driver number,
so it does not conflict with §8 (document this in a code comment). Because `AsciiEmblem`
dithers a **single color**, the chequered look is an **alternating filled/transparent
checkerboard of squares** in a waving-flag quad on a vertical pole — lit squares filled `c`,
"white" squares transparent — so the dither reads an unmistakable chequered flag on a stick
(true black/white checkers would vanish on the `#FAFAFA` background).

**`battery` — Power & energy (an abstract battery).** A rounded-rectangle cell with a small
terminal nub and a couple of charge bars (charge bars as filled `c` blocks inside an otherwise
`fill="none"` outline, so the dither reads a battery with charge). Generic component icon, no
branding. (A lightning bolt is an acceptable alternative if the battery reads poorly small;
the implementer picks whichever dithers cleaner, staying single-color and abstract.)

Wiring in `emblems.ts` (mirrors the existing `tyre`/`airflow` entries) for BOTH kinds:
- Add `"flag"` and `"battery"` to `EmblemKind` and `SvgEmblem`.
- Add `VIEWBOX.flag` and `VIEWBOX.battery` (120×120).
- Add `shapes(c).flag` and `shapes(c).battery` SVG markup as described above.
- `emblemForGroup`: add `if (group.startsWith("Race")) return "flag";` and
  `if (group.startsWith("Power")) return "battery";` (keep the existing Tyres/Pace/Air
  mappings; the trailing `return "airflow"` stays the Air default).

`AsciiEmblem` renders any `SvgEmblem` kind generically (rasterise → sample → dither), so no
component change is needed beyond the `emblems.ts` entries. Confirm the `/learn` index group
sections and the concept-page watermark pick up the new groups + emblems automatically.

## 4. Cross-linking (no new mechanism)

M6-B's linkify already surfaces a concept's `aliases` in prediction narratives and opens the
popover; `related` links concepts to each other on their pages. Cross-linking = authoring good
`aliases` + `related` on the 16 new concepts (and adding a new slug to an existing concept's
`related` where natural, e.g. `power-modes` and `energy-harvesting` on `drs`).

- **Aliases** are the terms a fan would type/read (e.g. safety-car-vsc: `["safety car",
  "virtual safety car", "VSC"]`; flags: `["yellow flag", "blue flag", "red flag", "chequered
  flag", "checkered flag", "double yellow"]`; energy-harvesting: `["harvesting", "energy
  recovery", "regen", "ERS", "MGU-K"]`; power-modes: `["overtake mode", "boost mode",
  "override", "manual override"]`; ground-effect: `["ground effect", "underfloor",
  "porpoising"]`; lift-and-coast: `["lift and coast", "lico", "lift-and-coast"]`). Keep
  "straight mode" on `drs` (DRS & Active Aero), NOT power-modes, to avoid a collision.
- **Alias-collision rule:** no new alias may duplicate an existing concept's alias (M6-B
  resolves longest-alias-first / first-occurrence; duplicates would mis-route). Enforced by a
  validation test (§6).
- **`related`** values must be real slugs (existing or new). Enforced by a validation test.

## 5. Non-goals

- No change to the concept-what data model, `/learn` page components, `TrustBadge`, linkify,
  the popover, or the `app/lib/concepts.ts` accessors.
- No entity-what / R17 / pipeline / API changes — this is `concepts.json` + two emblems.
- No promotion workflow changes; new concepts ship `drafted`, promoted later by hand.
- No new query intents; these are learning-layer explainers, surfaced via `/learn` + linkify.

## 6. Testing & verification

- **Concept validation test** (extend the existing concepts test, or add `app/lib/
  concepts.test.ts`): for every concept — required fields present and non-empty; `slug` unique
  and kebab-case; `badge` in the allowed set; `group` in the allowed group set (now five:
  Tyres & strategy, Pace & sessions, Air & aero, Race control, Power & energy); `related`
  entries all resolve to real slugs; `aliases` globally unique across all concepts; **no
  em-dashes** in any user-facing string (`summary`, `body`, `whyItMatters`, `term`). This is
  the TDD anchor for the content.
- **Emblem test** (extend the emblems test if present): `emblemForGroup("Race control")` →
  `"flag"`, `emblemForGroup("Power & energy")` → `"battery"`; `emblemSvgMarkup("flag")` and
  `emblemSvgMarkup("battery")` return non-empty SVG; existing group mappings unchanged.
- `npm run build` + `tsc` clean; existing vitest suite green; `/learn` renders all five groups
  with 24 cards and the chequered-flag + battery emblems on the new sections.
- Manual/preview: spot-check several concept pages (body, whyItMatters, related links,
  `drafted` badge), and confirm a narrative term matching a new alias (e.g. "safety car",
  "overtake mode") linkifies to its popover.

## 7. Files

- **Edited:** `app/data/concepts.json` (+16 concept objects; a few existing concepts' `related`
  gain a new slug); `app/lib/emblems.ts` (new `flag` + `battery` kinds + `emblemForGroup`
  mappings).
- **New:** `app/lib/concepts.test.ts` (if no concept validation test exists yet).
- **Untouched:** `app/lib/concepts.ts` accessors, `/learn` pages, `TrustBadge`, `linkify.ts`,
  `ConceptPopover`, the entity-what pipeline, R17, all Python.
