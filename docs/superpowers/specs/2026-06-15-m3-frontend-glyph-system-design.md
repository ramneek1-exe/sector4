# M3 Frontend — Driver Glyph System (Design Spec)

> Date: 2026-06-15 · Status: approved for planning · Milestone: PRD §11 **M3** (frontend follow-up)
> Prereqs read: `handoff.md`, `CLAUDE.md`, `sector4-prd.md` §8 (visual identity) + §6.2.
> Builds on: M3 backend (`predict_podium` + `/api/podium` + the podium card in `app/page.tsx`).

## 1. Goal & Definition of Done

Replace the barebones podium ranked-list with Sector 4's **abstract driver glyph** (PRD §8) and stand up the reusable visual foundation the rest of the app will share: a `drivers.json`/`teams.json` source of truth, the 4-role type system, and the blue/white brand palette. The driver glyph is the unit; the podium card is its first real home.

**DoD:**
- A reusable `DriverGlyph` renders the §8 mark: shared side-profile helmet filled in the **year-correct team color**, the driver's **personal number** in their personal color with a **contrast-guard** fallback, and the **3-letter code** in Space Grotesk.
- `drivers.json` (code → name/number/personalColor) and `teams.json` (team → colors) exist as the source of truth; `predict_podium` now returns each driver's `team`.
- The app is re-skinned to the **light blue/white theme**; the 4 type faces load (Lastik self-hosted); the podium card uses glyph rows; the reveal backdrop uses the blue ASCII ramp; the §8 footer disclaimer is present.
- Vitest + pytest green; `npm run build` clean.

## 2. Scope (locked)

**In scope:** `drivers.json` + `teams.json`; the `team` field added to the podium table/response; `DriverGlyph` (helmet SVG + number + contrast-guard + code); `contrastGuard` util; the 4-role type system via `next/font`; the Tailwind theme tokens + light-theme re-skin of the shell, the pit-loss card, and the podium card; recolor of the existing reveal backdrop to the blue ramp; the §8 footer disclaimer.

**Out of scope (deferred):** car silhouette (team glyph) and tire glyphs (M4); track layouts; the **system-wide reveal *fidelity* fix** (its own known defect — only the *recolor* is in scope here); contextual hover callouts (§6.5, M6); the "S4" favicon monogram (M7); any live-2026 data. **A marketing/landing page** that fronts the product (owner goal, noted 2026-06-15) is a separate future effort — when built, the "SECTOR 4" Bebas Neue wordmark is the natural anchor; the glyph system here is the visual vocabulary it will reuse.

## 3. Locked palette (owner-approved)

Brand palette skins the **site chrome + the ASCII reveal**. **Driver helmets fill with team colors** (data-driven) — the brand blue does not override team identity.

| Role | Value |
|---|---|
| Background | `#F5F7FB` (cool off-white — mainly white, never `#000000`) |
| Ink / text | `#0B1020` (deep blue-black, **not** pure black) |
| Brand accent | `#2348E0` |
| Accent-bright (hover/emphasis) | `#2E8BFF` |
| Muted (secondary text) | `#5B6B8C` |
| **ASCII/Dither ramp** (dark→light) | `#0B1E6B` → `#1E3FD0` → `#2E8BFF` → `#59C8FF` → `#B8E2FF` → `#EEF6FF` |

## 4. Architecture & data flow

```
/api/podium  (drivers[] now include `team`)
      │
      ▼
PodiumCard ── DriverGlyph(code, team)
                ├─ teams.json   : team → { primary, secondary }     → helmet fill / accent
                └─ drivers.json : code → { name, number, personalColor }
                      └─ contrastGuard(personalColor, teamPrimary)  → number color
```

`DriverGlyph` is pure/presentational: given a `code` and `team`, it resolves colors/number from the two static files and renders. No network, no state.

## 5. Data files (source of truth)

### `app/data/teams.json`
Keyed by the **exact team-name strings the data emits** for 2024–25 (verified against `season_results.parquet`) — note both `RB` (2024) and `Racing Bulls` (2025) appear and both need entries:

```
Alpine · Aston Martin · Ferrari · Haas F1 Team · Kick Sauber · McLaren ·
Mercedes · RB · Racing Bulls · Red Bull Racing · Williams
```

Shape: `{ "<team>": { "primary": "#RRGGBB", "secondary": "#RRGGBB" } }`. Colors only — **no logos/marks/livery art** (§8 hard rule). Values finalized in implementation against a public color reference.

### `app/data/drivers.json`
Keyed by 3-letter FIA code; covers the **27 codes** present in 2024–25 data
(`ALB ALO ANT BEA BOR BOT COL DOO GAS HAD HAM HUL LAW LEC MAG NOR OCO PER PIA RIC RUS SAI SAR STR TSU VER ZHO`):

```
{ "VER": { "name": "Max Verstappen", "number": 33, "personalColor": "#RRGGBB" }, ... }
```

`number` is the **personal career number** (VER 33, NOR 4 — §8 accepts this over on-car numbers). `drivers.json` is the **source of truth for hard facts** (name/number) — never invented, never LLM-generated. `team` is intentionally *not* here (it's year-dependent → comes from the API).

### Backend touch — `team` on the podium response
Join each driver's actual `team` for that weekend into the podium feature table (`build_podium_table`, from the results data it already loads) and pass it through `predict_podium`'s `drivers[]` (and `api/podium.py`). `predict_pace`/`lookup` untouched. Unknown/missing team must not crash inference — the row still returns, `team` may be absent and the glyph degrades (see §6).

## 6. `DriverGlyph` component (`app/components/DriverGlyph.tsx`)

- **Helmet:** one shared inline **SVG** side-profile helmet (visor right), `fill = teams[team].primary`, with a thin secondary-color visor/stripe accent. Authored as a clean abstract path (no real-helmet likeness) that stays legible at glyph size and under the ASCII/dither pass.
- **Personal number:** overlaid on the shell in `drivers[code].personalColor`, run through **`contrastGuard`** vs `teams[team].primary`; on failure, use whichever of `#0B1020`/`#FFFFFF` scores higher. Set in Space Grotesk (tabular).
- **3-letter code:** beside the helmet in **Space Grotesk**, sized as part of the mark (not a caption).
- **Graceful degradation:** unknown `code` → grey helmet + the raw code, no number; unknown/absent `team` → neutral grey fill. Never crash, never fabricate a number/color.
- Sizing via a `size` prop (the podium row vs. potential larger uses) so it's reusable.

### `contrastGuard` (`app/lib/contrast.ts`)
`contrastGuard(fg: hex, bg: hex): hex` — WCAG relative-luminance contrast ratio; returns `fg` if ratio ≥ threshold (4.5 target, 3.0 floor for large glyph numerals — exact constant set in implementation), else the better of black-ink/white. Pure, unit-tested at the boundaries.

## 7. Type system + theme tokens

- **`next/font`:** Space Grotesk + Bebas Neue + a mono (Geist Mono) via `next/font/google`; **Lastik via `next/font/local`**, self-hosted from `app/fonts/lastik/` (`.woff2` + `.woff`; owner-supplied). Four roles, no more (§8): **Bebas Neue = the "SECTOR 4" wordmark ONLY** (nothing else uses it), Lastik = serif body, Space Grotesk = data labels / driver codes / card headers, mono = ASCII set.
- **Tailwind tokens** (`tailwind.config.ts`) for the §3 palette: `bg`, `ink`, `accent`, `accent-bright`, `muted`, plus the ASCII `ramp` as a named array and the four font families. CSS variables in `globals.css`.
- **Light-theme re-skin:** `layout.tsx` flips `bg-black text-zinc-100` → `bg / ink`; the existing pit-loss card and podium card restyled to the light theme (band chips re-tuned for legibility on white).

## 8. Podium card, reveal, footer

- **Podium card** (`app/page.tsx` `PodiumCard`): glyph rows — `rank · DriverGlyph(code, team) · band chip · p≈` — replacing the current code-string list. Header (`year gp — podium odds`) in **Space Grotesk** (a data label, not the wordmark); "not yet calibrated" note retained. The only Bebas Neue on the page is the "SECTOR 4" wordmark in the layout header.
- **Reveal recolor:** the existing decorative ASCII/noise backdrop in `Reveal.tsx` uses the §3 blue ramp. The deferred system-wide *fidelity* redesign is untouched.
- **Footer disclaimer:** the verbatim §8 disclaimer, always present, in the layout.

## 9. Testing

- **Vitest:** `contrastGuard` boundaries (low-contrast personal color → correct black/white fallback); data-integrity (every `drivers.json` number is an int, every color is valid hex; the 11 team keys + 27 codes present); `DriverGlyph` renders code + number + the resolved team fill; unknown-code / unknown-team degradation.
- **Pytest:** `team` now present in the podium table (`test_pipeline`/`build_podium_table`) and the response (`test_inference_podium`, `test_api_podium`); existing leakage/fastf1-free guards stay green.
- `npm run build` clean (fonts load, no type errors).

## 10. Dependencies / assumptions

- Owner supplies Lastik files in `app/fonts/lastik/`. Until present, the body role falls back to a system serif so the build never breaks (a one-line swap once the files land).
- Team/personal colors are finalized in implementation against a public reference; **colors only, no marks** (§8).
- WebGPU/reduced-motion fallback for the reveal is the existing M2 behavior (plain fade) — unchanged.
