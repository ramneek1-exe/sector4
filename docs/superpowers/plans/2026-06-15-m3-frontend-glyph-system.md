# M3 Frontend — Driver Glyph System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the barebones podium ranked-list with the PRD §8 abstract driver glyph (team-color helmet + personal number with contrast-guard + 3-letter code), on a new light blue/white themed shell with the 4-role type system and `drivers.json`/`teams.json` as source of truth.

**Architecture:** A small backend touch surfaces each driver's year-correct `team` on the podium response. Two static JSON files (`teams.json`, `drivers.json`) are the source of truth. Glyph color/number resolution lives in a **pure** `resolveGlyph` (using a pure `contrastGuard`), unit-tested without React; `DriverGlyph.tsx` is a thin presentational SVG wrapper verified via build + browser. The app re-skins to a light theme via Tailwind tokens + `next/font`.

**Tech Stack:** Next.js 14 (App Router) + TS, Tailwind, `next/font` (google + local), Vitest, Python/pandas (backend touch), pytest.

**Branch:** `m3-frontend-glyph-system` (spec already committed there).

**Test runners:** TS → `npx vitest run`; Python → `PYTHONPATH=. .venv/bin/python -m pytest`; build → `npm run build`.

**Spec:** `docs/superpowers/specs/2026-06-15-m3-frontend-glyph-system-design.md`.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/pipeline.py` | Modify | `build_podium_table` merges year-correct `team` into each row. |
| `tests/test_pipeline.py` | Modify | Assert `team` column present + correct. |
| `src/inference/podium.py` | Modify | Surface `team` in each `drivers[]` entry. |
| `tests/test_inference_podium.py` | Modify | Assert `team` in driver dicts. |
| `tests/test_api_podium.py` | Modify | Assert `team` round-trips through the handler. |
| `app/lib/contrast.ts` | Create | Pure WCAG `contrastGuard(fg,bg)`. |
| `app/lib/contrast.test.ts` | Create | Boundary tests. |
| `app/data/teams.json` | Create | team → `{primary,secondary}` (source of truth). |
| `app/data/drivers.json` | Create | code → `{name,number,personalColor}` (source of truth). |
| `app/lib/glyph.ts` | Create | Pure `resolveGlyph(code,team)` → render-ready values. |
| `app/lib/glyph.test.ts` | Create | Resolution + degradation + data-integrity tests. |
| `app/lib/fonts.ts` | Create | `next/font` definitions (4 roles). |
| `tailwind.config.ts` | Modify | Brand palette tokens + font families + ASCII ramp. |
| `app/globals.css` | Modify | CSS vars for the palette; base light theme. |
| `app/layout.tsx` | Modify | Apply fonts + light theme; SECTOR 4 wordmark; footer disclaimer. |
| `app/components/DriverGlyph.tsx` | Create | Presentational SVG helmet + number + code. |
| `app/page.tsx` | Modify | Podium card uses `DriverGlyph`; light-theme re-skin of both cards. |
| `app/components/Reveal.tsx` | Modify | Recolor decorative backdrop to the blue ASCII ramp; re-skin attribution. |

---

## Task 1: Backend — `team` in the podium feature table

**Files:**
- Modify: `src/pipeline.py` (`build_podium_table`)
- Test: `tests/test_pipeline.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_pipeline.py` (the `_pace_df()`/`_results()` helpers already exist there from M3 backend):

```python
def test_build_podium_table_includes_year_correct_team():
    t = build_podium_table(_pace_df(), _results())
    assert "team" in t.columns
    # _results() puts every driver on team "T"
    assert set(t["team"].dropna().unique()) == {"T"}
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_pipeline.py::test_build_podium_table_includes_year_correct_team -v`
Expected: FAIL (`'team' not in columns`).

- [ ] **Step 3: Implement**

In `src/pipeline.py`, inside `build_podium_table`, after the `add_friday_features(...)` line and before the `prior_track_pace` list-comp, add the team merge (team is per year+event+driver in the results table):

```python
    # Year-correct team for the glyph (metadata, NOT a feature). Map the feature
    # table's gp key -> results EventName, then left-join the driver's team.
    team_lookup = (
        results.rename(columns={"gp": "event"})[["year", "event", "Driver", "team"]]
        .drop_duplicates()
    )
    df["event"] = df["gp"].map(gp_to_event)
    df = df.merge(team_lookup, on=["year", "event", "Driver"], how="left").drop(columns="event")
```

(The `df` variable is reassigned by the merge; ensure the subsequent `prior_track_pace`
list-comprehension and imputes still run on this `df`. Team is left out of every feature
column list, so it never reaches the model.)

- [ ] **Step 4: Run it — expect PASS**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_pipeline.py -v`
Expected: PASS (new test + existing pipeline tests).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.py tests/test_pipeline.py
git commit -m "feat: add year-correct team to the podium feature table"
```

---

## Task 2: Backend — surface `team` in `predict_podium`

**Files:**
- Modify: `src/inference/podium.py`
- Test: `tests/test_inference_podium.py`, `tests/test_api_podium.py`

- [ ] **Step 1: Write the failing tests**

In `tests/test_inference_podium.py`, extend the synthetic table helper `_podium_table` to include a team, and assert it surfaces. Add a `"team"` key to the row dict built inside `_podium_table` (find the `rows.append({...})` and add `"team": "TestTeam",` to it). Then add:

```python
def test_predict_podium_surfaces_team_per_driver():
    out = predict_podium(2024, "Bahrain", table=_podium_table())
    assert out["drivers"][0]["team"] == "TestTeam"
    assert set(out["drivers"][0]) == {"driver", "team", "band", "p_podium", "rank"}
```

In `tests/test_api_podium.py` add:

```python
def test_podium_handler_includes_team():
    status, payload = podium_response({"year": 2024, "gp": "Italy"})
    assert status == 200
    assert "team" in payload["drivers"][0]
```

- [ ] **Step 2: Run them — expect FAIL**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_podium.py::test_predict_podium_surfaces_team_per_driver tests/test_api_podium.py::test_podium_handler_includes_team -v`
Expected: FAIL (`KeyError: 'team'`).

- [ ] **Step 3: Implement**

In `src/inference/podium.py`, in `predict_podium`, change the `drivers` list-comprehension to also pull `team` from the target rows. Replace:

```python
    drivers = [
        {"driver": d, "band": band_for(float(p)), "p_podium": round(float(p), 2)}
        for d, p in zip(target["Driver"], proba)
    ]
```

with:

```python
    teams = target["team"] if "team" in target else [None] * len(target)
    drivers = [
        {"driver": d, "team": (None if pd.isna(t) else t),
         "band": band_for(float(p)), "p_podium": round(float(p), 2)}
        for d, p, t in zip(target["Driver"], proba, teams)
    ]
```

(`pd` is already imported in this module.)

- [ ] **Step 4: Run them — expect PASS**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_podium.py tests/test_api_podium.py -v`
Expected: PASS.

- [ ] **Step 5: Rebuild the shipped table so the deployed fn carries `team`**

Run: `PYTHONPATH=. .venv/bin/python notebooks/07_podium.py` then
`cp data/podium_features.parquet api/podium_features.parquet`
Expected: the script prints the §0 numbers and `wrote data/podium_features.parquet`. (The table now has a `team` column.)

- [ ] **Step 6: Commit**

```bash
git add src/inference/podium.py tests/test_inference_podium.py tests/test_api_podium.py api/podium_features.parquet
git commit -m "feat: surface year-correct team in predict_podium response"
```

---

## Task 3: `contrastGuard` utility

**Files:**
- Create: `app/lib/contrast.ts`, `app/lib/contrast.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/lib/contrast.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { contrastGuard, INK, WHITE } from "./contrast";

describe("contrastGuard", () => {
  it("keeps the personal color when it contrasts enough with the helmet", () => {
    // white number on a dark navy helmet -> high contrast -> keep white
    expect(contrastGuard("#FFFFFF", "#0B1E6B")).toBe("#FFFFFF");
  });

  it("falls back to ink on a light helmet when the personal color is too pale", () => {
    // pale yellow number on a near-white helmet -> too low -> fall back to ink
    expect(contrastGuard("#FFF6B0", "#F2F2F2")).toBe(INK);
  });

  it("falls back to white on a dark helmet when the personal color is too dark", () => {
    // dark navy number on a black-ish helmet -> too low -> fall back to white
    expect(contrastGuard("#101522", "#0B1020")).toBe(WHITE);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run app/lib/contrast.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `app/lib/contrast.ts`:

```typescript
// WCAG contrast guard for glyph numerals (PRD §8). Keeps the driver's personal
// color when it reads on the team-color helmet; otherwise falls back to the better
// of ink / white. Ink is the brand near-black (never pure #000000).
export const INK = "#0B1020";
export const WHITE = "#FFFFFF";

// Minimum contrast ratio for the large glyph numeral (WCAG "large text" floor is 3.0).
const MIN_RATIO = 3.0;

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Return `fg` if it reads on `bg`, else the better-contrasting of ink/white. */
export function contrastGuard(fg: string, bg: string): string {
  if (ratio(fg, bg) >= MIN_RATIO) return fg;
  return ratio(INK, bg) >= ratio(WHITE, bg) ? INK : WHITE;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run app/lib/contrast.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/contrast.ts app/lib/contrast.test.ts
git commit -m "feat: WCAG contrastGuard for glyph numerals"
```

---

## Task 4: Source-of-truth data files (`teams.json`, `drivers.json`)

**Files:**
- Create: `app/data/teams.json`, `app/data/drivers.json`

- [ ] **Step 1: Create `app/data/teams.json`**

Exact 2024–25 team strings (verified against the data), colors only — no marks (§8). Hex are representative public team colors; adjust later if desired:

```json
{
  "Red Bull Racing": { "primary": "#223971", "secondary": "#E2002A" },
  "Ferrari": { "primary": "#E8002D", "secondary": "#FFEB00" },
  "Mercedes": { "primary": "#00D7B6", "secondary": "#0B1020" },
  "McLaren": { "primary": "#FF8000", "secondary": "#47C7FC" },
  "Aston Martin": { "primary": "#229971", "secondary": "#00352F" },
  "Alpine": { "primary": "#0093CC", "secondary": "#FF87BC" },
  "Williams": { "primary": "#1868DB", "secondary": "#64C4FF" },
  "RB": { "primary": "#6692FF", "secondary": "#1634CB" },
  "Racing Bulls": { "primary": "#6692FF", "secondary": "#2B4562" },
  "Kick Sauber": { "primary": "#52E252", "secondary": "#006B2D" },
  "Haas F1 Team": { "primary": "#9CA3AF", "secondary": "#DA0000" }
}
```

- [ ] **Step 2: Create `app/data/drivers.json`**

All 27 codes present in 2024–25 data. `number` = personal career number (factual — source of truth); `personalColor` is the helmet-numeral color:

```json
{
  "VER": { "name": "Max Verstappen", "number": 33, "personalColor": "#1E41FF" },
  "NOR": { "name": "Lando Norris", "number": 4, "personalColor": "#FFE600" },
  "LEC": { "name": "Charles Leclerc", "number": 16, "personalColor": "#E8002D" },
  "HAM": { "name": "Lewis Hamilton", "number": 44, "personalColor": "#00D7B6" },
  "RUS": { "name": "George Russell", "number": 63, "personalColor": "#0B1020" },
  "PIA": { "name": "Oscar Piastri", "number": 81, "personalColor": "#FF8000" },
  "SAI": { "name": "Carlos Sainz", "number": 55, "personalColor": "#E8002D" },
  "PER": { "name": "Sergio Perez", "number": 11, "personalColor": "#E2002A" },
  "ALO": { "name": "Fernando Alonso", "number": 14, "personalColor": "#0033A0" },
  "STR": { "name": "Lance Stroll", "number": 18, "personalColor": "#229971" },
  "GAS": { "name": "Pierre Gasly", "number": 10, "personalColor": "#0093CC" },
  "OCO": { "name": "Esteban Ocon", "number": 31, "personalColor": "#FF87BC" },
  "ALB": { "name": "Alexander Albon", "number": 23, "personalColor": "#1868DB" },
  "SAR": { "name": "Logan Sargeant", "number": 2, "personalColor": "#64C4FF" },
  "TSU": { "name": "Yuki Tsunoda", "number": 22, "personalColor": "#E2002A" },
  "RIC": { "name": "Daniel Ricciardo", "number": 3, "personalColor": "#6692FF" },
  "HUL": { "name": "Nico Hulkenberg", "number": 27, "personalColor": "#52E252" },
  "MAG": { "name": "Kevin Magnussen", "number": 20, "personalColor": "#9CA3AF" },
  "BOT": { "name": "Valtteri Bottas", "number": 77, "personalColor": "#0B1020" },
  "ZHO": { "name": "Zhou Guanyu", "number": 24, "personalColor": "#52E252" },
  "BEA": { "name": "Oliver Bearman", "number": 87, "personalColor": "#DA0000" },
  "COL": { "name": "Franco Colapinto", "number": 43, "personalColor": "#1868DB" },
  "ANT": { "name": "Andrea Kimi Antonelli", "number": 12, "personalColor": "#00D7B6" },
  "DOO": { "name": "Jack Doohan", "number": 7, "personalColor": "#0093CC" },
  "BOR": { "name": "Gabriel Bortoleto", "number": 5, "personalColor": "#52E252" },
  "HAD": { "name": "Isack Hadjar", "number": 6, "personalColor": "#6692FF" },
  "LAW": { "name": "Liam Lawson", "number": 30, "personalColor": "#6692FF" }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/data/teams.json app/data/drivers.json
git commit -m "feat: drivers.json + teams.json source of truth (2024-25 grid)"
```

---

## Task 5: Pure `resolveGlyph` + data-integrity tests

**Files:**
- Modify: `vitest.config.ts` (add the `@/` alias)
- Create: `app/lib/glyph.ts`, `app/lib/glyph.test.ts`

- [ ] **Step 0: Add the `@/` alias to Vitest (the test JSON imports use it)**

`vitest.config.ts` currently has no path alias, so `@/app/...` imports fail under
Vitest. Replace `vitest.config.ts` with:

```typescript
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
```

Verify the existing suite still resolves: `npx vitest run` → existing tests PASS.

- [ ] **Step 1: Write the failing test**

Create `app/lib/glyph.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveGlyph } from "./glyph";
import drivers from "@/app/data/drivers.json";
import teams from "@/app/data/teams.json";

describe("resolveGlyph", () => {
  it("resolves a known driver+team to helmet fill, number, and contrast-guarded numeral", () => {
    const g = resolveGlyph("VER", "Red Bull Racing");
    expect(g.code).toBe("VER");
    expect(g.number).toBe(33);
    expect(g.helmetFill).toBe("#223971");
    expect(g.accent).toBe("#E2002A");
    expect(g.numberColor).toMatch(/^#([0-9A-Fa-f]{6})$/);
    expect(g.known).toBe(true);
  });

  it("degrades an unknown driver to grey + raw code, no fabricated number", () => {
    const g = resolveGlyph("XXX", "Red Bull Racing");
    expect(g.code).toBe("XXX");
    expect(g.number).toBeNull();
    expect(g.known).toBe(false);
  });

  it("degrades an unknown/absent team to a neutral grey helmet", () => {
    const g = resolveGlyph("VER", null);
    expect(g.helmetFill).toBe("#9CA3AF");
  });
});

describe("data integrity", () => {
  it("every driver has an integer number and a valid hex personal color", () => {
    for (const [code, d] of Object.entries(drivers as Record<string, any>)) {
      expect(Number.isInteger(d.number), `${code} number`).toBe(true);
      expect(d.personalColor, `${code} color`).toMatch(/^#([0-9A-Fa-f]{6})$/);
      expect(typeof d.name).toBe("string");
    }
  });

  it("every team has valid primary+secondary hex", () => {
    for (const [name, t] of Object.entries(teams as Record<string, any>)) {
      expect(t.primary, `${name} primary`).toMatch(/^#([0-9A-Fa-f]{6})$/);
      expect(t.secondary, `${name} secondary`).toMatch(/^#([0-9A-Fa-f]{6})$/);
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run app/lib/glyph.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `app/lib/glyph.ts`:

```typescript
import drivers from "@/app/data/drivers.json";
import teams from "@/app/data/teams.json";
import { contrastGuard } from "./contrast";

const NEUTRAL = "#9CA3AF"; // grey helmet for unknown/absent team

export type ResolvedGlyph = {
  code: string;
  number: number | null;
  helmetFill: string;
  accent: string;
  numberColor: string;
  known: boolean;
};

type Driver = { name: string; number: number; personalColor: string };
type Team = { primary: string; secondary: string };

/** Resolve a 3-letter code + team name to render-ready glyph values. Pure. */
export function resolveGlyph(code: string, team: string | null): ResolvedGlyph {
  const d = (drivers as Record<string, Driver>)[code];
  const t = team ? (teams as Record<string, Team>)[team] : undefined;
  const helmetFill = t?.primary ?? NEUTRAL;
  const accent = t?.secondary ?? NEUTRAL;
  const personal = d?.personalColor ?? "#FFFFFF";
  return {
    code,
    number: d?.number ?? null,
    helmetFill,
    accent,
    numberColor: contrastGuard(personal, helmetFill),
    known: Boolean(d),
  };
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run app/lib/glyph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts app/lib/glyph.ts app/lib/glyph.test.ts
git commit -m "feat: pure resolveGlyph + drivers/teams integrity tests"
```

---

## Task 6: Type system (`next/font`) + theme tokens

**Files:**
- Create: `app/lib/fonts.ts`
- Modify: `tailwind.config.ts`, `app/globals.css`

- [ ] **Step 1: Define the fonts**

Create `app/lib/fonts.ts` (Bebas Neue = wordmark ONLY; Lastik self-hosted from the owner-supplied files):

```typescript
import { Bebas_Neue, Space_Grotesk, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

// Display — the SECTOR 4 wordmark ONLY.
export const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
// Data labels, driver codes, card headers.
export const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
// ASCII / mono numerals.
export const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
// Serif body — self-hosted Lastik (owner-supplied web fonts).
export const lastik = localFont({
  src: [
    { path: "../fonts/lastik/Lastik-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/lastik/Lastik-Regular.woff", weight: "400", style: "normal" },
  ],
  variable: "--font-lastik",
  display: "swap",
});

export const fontVars = `${bebas.variable} ${grotesk.variable} ${mono.variable} ${lastik.variable}`;
```

(If `Geist_Mono` is unavailable in this Next version's font data, switch the import to
`JetBrains_Mono` — same usage. Lastik file names must match what's in `app/fonts/lastik/`.)

- [ ] **Step 2: Wire Tailwind tokens**

Replace `tailwind.config.ts` with:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F5F7FB",
        ink: "#0B1020",
        accent: "#2348E0",
        "accent-bright": "#2E8BFF",
        muted: "#5B6B8C",
      },
      fontFamily: {
        bebas: ["var(--font-bebas)", "sans-serif"],
        grotesk: ["var(--font-grotesk)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        lastik: ["var(--font-lastik)", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 3: Base light theme in CSS**

Replace `app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* ASCII / Dither ramp, dark -> light (PRD §8 reference image) */
  --ramp-0: #0b1e6b;
  --ramp-1: #1e3fd0;
  --ramp-2: #2e8bff;
  --ramp-3: #59c8ff;
  --ramp-4: #b8e2ff;
  --ramp-5: #eef6ff;
}

body {
  background: #f5f7fb;
  color: #0b1020;
}
```

- [ ] **Step 4: Verify build wiring**

Run: `npm run build`
Expected: clean build (fonts fetched, no type errors). If `Geist_Mono` errors as unavailable, swap to `JetBrains_Mono` in `app/lib/fonts.ts` and rebuild.

- [ ] **Step 5: Commit**

```bash
git add app/lib/fonts.ts tailwind.config.ts app/globals.css
git commit -m "feat: 4-role type system + light blue/white theme tokens"
```

---

## Task 7: Layout — fonts, light theme, wordmark, footer disclaimer

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Implement**

Replace `app/layout.tsx` with:

```tsx
import "./globals.css";
import type { ReactNode } from "react";
import { fontVars } from "@/app/lib/fonts";

export const metadata = { title: "Sector 4", description: "F1 weekend companion" };

const DISCLAIMER =
  "Sector 4 is an independent project, not affiliated with or endorsed by Formula 1, " +
  "FOM, the FIA, or any team. All driver and team names are used for editorial reference. " +
  "Data sourced from publicly available timing.";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body className="min-h-screen bg-bg text-ink antialiased font-lastik">
        <header className="mx-auto max-w-2xl px-6 pt-10">
          {/* The ONLY use of Bebas Neue: the wordmark. */}
          <span className="font-bebas text-4xl tracking-wide text-ink">SECTOR 4</span>
        </header>
        {children}
        <footer className="mx-auto max-w-2xl px-6 py-10 font-grotesk text-[11px] leading-relaxed text-muted">
          {DISCLAIMER}
        </footer>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: clean. (Visual check happens in Task 10.)

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: light-theme layout shell with wordmark + footer disclaimer"
```

---

## Task 8: `DriverGlyph` component

**Files:**
- Create: `app/components/DriverGlyph.tsx`

- [ ] **Step 1: Implement (presentational; logic already tested in `resolveGlyph`)**

Create `app/components/DriverGlyph.tsx`:

```tsx
import { resolveGlyph } from "@/app/lib/glyph";

/**
 * Abstract driver glyph (PRD §8): one shared side-profile helmet (visor right) filled
 * in the team color, the personal number in a contrast-guarded numeral, and the
 * 3-letter code beside it in Space Grotesk. No likeness, no marks — shapes + color only.
 */
export function DriverGlyph({
  code,
  team,
  size = 40,
}: {
  code: string;
  team: string | null;
  size?: number;
}) {
  const g = resolveGlyph(code, team);
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${code} helmet`}>
        {/* shell */}
        <path
          d="M52 20 C75 20 88 35 88 55 C88 66 83 72 73 73 L41 73 C26 73 14 62 14 47 C14 31 30 20 52 20 Z"
          fill={g.helmetFill}
        />
        {/* visor opening (faces right) */}
        <path d="M50 41 C66 39 82 42 90 49 C82 55 66 56 50 53 Z" fill={g.accent} opacity={0.92} />
        {/* chin bar */}
        <path d="M41 73 L73 73 C70 80 60 83 50 82 C45 81 42 78 41 73 Z" fill={g.accent} opacity={0.5} />
        {/* personal number on the shell */}
        {g.number !== null && (
          <text
            x="40"
            y="40"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="var(--font-grotesk)"
            fontSize="26"
            fontWeight="700"
            fill={g.numberColor}
          >
            {g.number}
          </text>
        )}
      </svg>
      <span className="font-grotesk text-sm font-semibold tracking-wide text-ink">{g.code}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: clean (component is imported in Task 9; a standalone build still type-checks the file once imported). If building before Task 9, it's fine — unused module still type-checks.

- [ ] **Step 3: Commit**

```bash
git add app/components/DriverGlyph.tsx
git commit -m "feat: DriverGlyph — abstract helmet + number + code"
```

---

## Task 9: Podium card + pit-loss card on the light theme, using glyphs

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Implement**

In `app/page.tsx`: (a) import the glyph + the team field; (b) re-skin both cards to the light theme; (c) replace the podium row's code/number text with `DriverGlyph`. Apply these edits:

Add imports at the top (after the existing imports):

```tsx
import { DriverGlyph } from "@/app/components/DriverGlyph";
```

Update `PodiumFacts`'s driver shape usage: the API now returns `team` per driver. In `app/lib/narrative.ts`, the `PodiumDriver` type must include it — change:

```typescript
export type PodiumDriver = { driver: string; band: string; p_podium: number; rank: number };
```
to:
```typescript
export type PodiumDriver = { driver: string; team: string | null; band: string; p_podium: number; rank: number };
```

Replace the `BAND_STYLE` map (light-theme chip colors) in `app/page.tsx`:

```tsx
const BAND_STYLE: Record<string, string> = {
  strong: "bg-emerald-100 text-emerald-800 border-emerald-300",
  "in contention": "bg-amber-100 text-amber-800 border-amber-300",
  "outside shot": "bg-slate-100 text-slate-500 border-slate-300",
};
```

Replace the `PodiumCard` body's row mapping so each row uses the glyph. Replace the `<ol>...</ol>` block with:

```tsx
        <ol className="mt-4 space-y-2">
          {podium.drivers.slice(0, 6).map((d) => (
            <li key={d.driver} className="flex items-center gap-3">
              <span className="w-5 text-right font-mono text-sm tabular-nums text-muted">{d.rank}</span>
              <DriverGlyph code={d.driver} team={d.team} />
              <span
                className={`rounded border px-2 py-0.5 font-grotesk text-xs font-medium ${
                  BAND_STYLE[d.band] ?? BAND_STYLE["outside shot"]
                }`}
              >
                {d.band}
              </span>
              <span className="ml-auto font-mono text-xs tabular-nums text-muted">p≈{d.p_podium}</span>
            </li>
          ))}
        </ol>
```

Re-skin the card containers and headers from the dark palette to light. In `PodiumCard`, change the outer `div` className `rounded border border-zinc-800 p-5` → `rounded-lg border border-slate-200 bg-white p-5 shadow-sm`; the `<h2>` className to `font-grotesk text-lg font-bold tracking-tight text-ink`; the mode `<span>` and the trailing note `text-zinc-*` classes → `text-muted`. Do the same dark→light swap for the pit-loss `facts` card block (the `rounded border border-zinc-800 p-5` div, its `text-zinc-300`/`text-zinc-600` → `text-ink`/`text-muted`, value text stays bold `text-ink`). The unsupported/`error` paragraphs: `text-zinc-400`→`text-muted`, `text-red-400`→`text-red-600`.

(Keep the form input/button re-skin minimal but legible on white: the input border `border-zinc-700 bg-zinc-900` → `border-slate-300 bg-white text-ink`; the button `bg-zinc-100 text-black` → `bg-accent text-white`.)

- [ ] **Step 2: Run TS tests (the narrative type change)**

Run: `npx vitest run`
Expected: PASS. The `orchestrate.test.ts` `PODIUM` fixture already omits `team` on its driver objects — add `team: "McLaren"` (or any string) to each driver in that fixture's `drivers` array so it matches the updated `PodiumDriver` type. Re-run until green.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/lib/narrative.ts app/lib/orchestrate.test.ts
git commit -m "feat: podium card uses DriverGlyph; light-theme re-skin of cards"
```

---

## Task 10: Reveal backdrop recolor + final verification

**Files:**
- Modify: `app/components/Reveal.tsx`

- [ ] **Step 1: Recolor the decorative backdrop to the blue ramp**

In `app/components/Reveal.tsx`, change the `FractalNoise` colors from the greyscale to the brand ramp, and re-skin the attribution for the light theme. Replace:

```tsx
            <FractalNoise colorA="#000000" colorB="#3a3a3a" />
```
with:
```tsx
            <FractalNoise colorA="#0b1e6b" colorB="#59c8ff" />
```

And in `ShadersAttribution`, change `text-zinc-600` → `text-muted`.

- [ ] **Step 2: Run the full suites**

Run: `PYTHONPATH=. .venv/bin/python -m pytest -q`
Expected: all pass (Task 1–2 backend additions included).

Run: `npx vitest run`
Expected: all pass.

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Browser verification (the visual gate)**

Run: `npm run dev`, open the app, and submit "Who is likely to podium at the 2024 Italian Grand Prix?". Confirm:
- Light off-white background, "SECTOR 4" wordmark in Bebas Neue (and Bebas appears nowhere else).
- Podium rows render team-colored helmets with legible personal numbers (contrast-guard working — check a light-helmet driver like Haas/McLaren), 3-letter codes, band chips, `p≈`.
- Footer disclaimer present. Pit-loss query still renders on the light theme.

If a helmet shape reads poorly, adjust the SVG path control points in `DriverGlyph.tsx` (visual polish; logic/tests unaffected).

- [ ] **Step 4: Commit**

```bash
git add app/components/Reveal.tsx
git commit -m "feat: recolor reveal backdrop to the blue ASCII ramp"
```

---

## Self-Review notes (for the executor)

- **Spec coverage:** §5 data files → Task 4; backend `team` → Tasks 1–2; `DriverGlyph` + contrast-guard → Tasks 3,5,8; type system + tokens → Task 6; light re-skin + wordmark + footer → Tasks 7,9; reveal recolor → Task 10; testing → throughout.
- **Bebas Neue is wordmark-only:** the single use is the layout header (Task 7); the podium header uses Space Grotesk (Task 9). No other Bebas usage anywhere.
- **Type consistency:** `resolveGlyph` returns `{code,number,helmetFill,accent,numberColor,known}` (Task 5), consumed verbatim by `DriverGlyph` (Task 8). `PodiumDriver` gains `team: string | null` (Task 9) — matches the backend `team` field (Task 2) and the orchestrate fixture update.
- **No React test infra added:** all logic is in pure `contrastGuard`/`resolveGlyph` (unit-tested); the SVG component is build- + browser-verified (Task 10 Step 3).
- **Deferred (not in any task):** car/tire/track glyphs, hover callouts, favicon, reveal fidelity fix, landing page, live-2026 data.
```
