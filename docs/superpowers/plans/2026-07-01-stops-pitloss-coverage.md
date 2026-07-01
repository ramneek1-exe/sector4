# Stops + Pit-loss Full Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every completed 2026 race an actual pit-stop count, and the next race an honest historical-norm-or-prediction, alongside the already-working pit-lane time loss, all through the ask interface.

**Architecture:** A new bundled `actual_stops` table (per-race stop distribution from race laps, no FP needed) feeds three answer modes. `api/strategy.py` routes one "stops" question by race state — completed → actual, upcoming+dry-FP → Model-B prediction, upcoming otherwise → historical norm — returning a `mode`-tagged `StrategyFacts`. The TS orchestrator/parser stay thin; the frontend renders the mode. Pit-loss already works and only needs coverage verification.

**Tech Stack:** Python (pandas, fastf1 batch-only) in `src/`; Vercel Python serverless `api/`; Next.js/TS `app/`; pytest + node-only vitest.

## Global Constraints

- **Inference never imports fastf1**; only the batch layer (`src/pipeline.py`, `scripts/build_2026.py`) touches fastf1. `api/*` reads bundled parquet only.
- **All training/history through `store.prior_weekends`** (calendar order, never alphabetical); the historical norm uses **strictly-prior seasons only** (leakage guard).
- **Round every number that reaches output.** Logic lives in `src/`, called from scripts.
- **Completed vs upcoming is decided by the presence of an `actual_stops` row** for `(year, gp)` — that is the single completion signal.
- **Answer copy: no em-dashes** (existing Haiku-prompt rule); the SC caveat appears **only** in the `predicted` mode.
- **Non-destructive refresh:** any live-season table merge goes through `src.pipeline.merge_refreshed(base, fresh, key="race_id")` (already on `main`).
- **Commits:** conventional style, one logical change, **no AI attribution**.
- **Trust anchor:** nb06 must still print `Δ +0.070` (this feature must not touch Model-B training).
- `race_id(year, gp)` → `f"{year}-{gp}"`. `count_stops(laps)` → DataFrame with columns `Driver`, `n_stops` (= stints − 1).

---

### Task 1: actual-stops data foundation

**Files:**
- Create: `src/features/actual_stops.py`
- Modify: `src/pipeline.py` (add `build_actual_stops`, wire into `build_all`), `src/store.py` (add `ACTUAL_STOPS`), `scripts/build_2026.py` (add a build step + table to the copy list)
- Test: `tests/test_actual_stops.py`

**Interfaces:**
- Produces: `race_stop_distribution(laps: pd.DataFrame, results: pd.DataFrame) -> dict` with keys `modal_stops:int, n_drivers:int, n_at_modal:int, stops_min:int, stops_max:int` (or `{}` if no classified finishers); `build_actual_stops(seasons: list[int], circuits: list[str]) -> pd.DataFrame` with columns `race_id, year, gp, modal_stops, n_drivers, n_at_modal, stops_min, stops_max`; `STOPS_CIRCUITS: list[str]`; `store.ACTUAL_STOPS = "data/actual_stops.parquet"`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_actual_stops.py`. A pit stop is a COMPOUND CHANGE between consecutive
stints (robust to red-flag phantom stints); only CLASSIFIED finishers (numeric
`ClassifiedPosition`) count.

```python
import pandas as pd

from src.features.actual_stops import race_stop_distribution


def _laps(stints_by_driver):
    # stints_by_driver: {driver: [compound per stint in order]}
    rows = []
    for drv, comps in stints_by_driver.items():
        for i, c in enumerate(comps, start=1):
            rows.append({"Driver": drv, "Stint": i, "Compound": c})
    return pd.DataFrame(rows)


def _results(classified_by_driver):
    # classified_by_driver: {driver: ClassifiedPosition string ("1".."20" or "R" for retired)}
    return pd.DataFrame([
        {"Abbreviation": drv, "ClassifiedPosition": pos}
        for drv, pos in classified_by_driver.items()
    ])


def test_counts_compound_changes_among_classified_finishers():
    laps = _laps({
        "VER": ["SOFT", "HARD"],                 # 1 change -> 1 stop
        "HAM": ["SOFT", "HARD", "SOFT"],         # 2 changes -> 2 stops
        "LEC": ["MEDIUM", "MEDIUM", "HARD"],     # phantom same-compound stint -> 1 real stop
        "RUS": ["SOFT", "HARD"],                 # 1 stop
        "BOT": ["SOFT"],                          # DNF (retired) -> excluded, no 0-stop pollution
    })
    results = _results({"VER": "1", "HAM": "2", "LEC": "3", "RUS": "4", "BOT": "R"})
    d = race_stop_distribution(laps, results)
    assert d["modal_stops"] == 1        # VER, LEC, RUS at 1; HAM at 2
    assert d["n_drivers"] == 4          # BOT excluded
    assert d["n_at_modal"] == 3
    assert d["stops_min"] == 1          # no 0-stop DNF row
    assert d["stops_max"] == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_actual_stops.py -q`
Expected: FAIL — `ModuleNotFoundError`/`ImportError` for `race_stop_distribution`.

- [ ] **Step 3: Implement `src/features/actual_stops.py`**

```python
"""Actual per-race pit-stop counts, derived from race laps + results (no FP, no dry filter).

Unlike the Model-B strategy features (which need a dry FP2 long run), this works for EVERY
completed race — sprint or wet — because it reads only what drivers actually did. Feeds the
"how many stops happened" answer for completed races and the per-circuit historical norm for
upcoming races.

A pit stop is a COMPOUND CHANGE between consecutive stints, NOT a stint transition: red-flag
restarts create phantom same-compound stints that inflate a naive stint count (2026 Monaco
reads 5 stops that way vs 2 real). Only CLASSIFIED finishers count, so retirements do not
pollute the modal with 0-stop rows.
"""
from __future__ import annotations

import pandas as pd

from src.calendar import RACE_CALENDAR, race_id
from src.data.load import load_session

# Completed 2026 rounds + the next race (Great Britain) — enough for completed-race actuals AND
# the per-circuit historical norm. Widen with the calendar as the season progresses (see the
# staying-current task). Great Britain is a real, historical circuit in GP_TO_EVENT.
STOPS_CIRCUITS: list[str] = list(dict.fromkeys(RACE_CALENDAR[2026] + ["Great Britain"]))


def race_stop_distribution(laps: pd.DataFrame, results: pd.DataFrame) -> dict:
    """Actual stop distribution among classified finishers, robust to red-flag phantom stints.

    Returns {} if there are no classified finishers (so the builder skips the race).
    """
    classified = None
    if results is not None and "ClassifiedPosition" in results:
        classified = set(
            results.loc[
                results["ClassifiedPosition"].astype(str).str.fullmatch(r"\d+"), "Abbreviation"
            ]
        )
    counts: dict[str, int] = {}
    for drv, d in laps.groupby("Driver"):
        if classified is not None and drv not in classified:
            continue
        comp = d.sort_values("Stint").groupby("Stint")["Compound"].first()
        counts[drv] = max(int((comp != comp.shift()).sum() - 1), 0)  # compound changes
    stops = pd.Series(counts)
    if stops.empty:
        return {}
    modal = int(stops.mode().iloc[0])
    return {
        "modal_stops": modal,
        "n_drivers": int(len(stops)),
        "n_at_modal": int((stops == modal).sum()),
        "stops_min": int(stops.min()),
        "stops_max": int(stops.max()),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_actual_stops.py -q`
Expected: PASS (1 test).

- [ ] **Step 5: Add `build_actual_stops` to `src/pipeline.py`**

Add the import near the other `src.features` imports at the top of `src/pipeline.py`:

```python
from src.features.actual_stops import race_stop_distribution
```

Add this function after `build_strategy_table` (near line 136):

```python
def build_actual_stops(seasons: list[int] = SEASONS,
                       circuits: list[str] = DRY_CIRCUITS) -> pd.DataFrame:
    """Per-race actual stop-count distribution. Loads fastf1 (batch only). Skips races with no
    laps (future/unrun) or no classified finishers so the builder is safe across the calendar."""
    rows = []
    for year in seasons:
        for gp in circuits:
            race = load_session(year, gp, "R")
            if race is None or race.laps.empty:
                continue
            d = race_stop_distribution(race.laps, race.results)
            if not d:  # no classified finishers
                continue
            rows.append({"race_id": race_id(year, gp), "year": year, "gp": gp, **d})
    return pd.DataFrame(rows)
```

In `build_all()` (near line 195), add a line that writes the actual-stops table alongside the others (match the existing `store.write_table(...)` style used there):

```python
    store.write_table(build_actual_stops(), store.ACTUAL_STOPS)
```

- [ ] **Step 6: Add the store path**

In `src/store.py`, after the `PIT_LOSS = ...` line (near line 22):

```python
ACTUAL_STOPS = "data/actual_stops.parquet"
```

- [ ] **Step 7: Wire into `scripts/build_2026.py`**

In `scripts/build_2026.py`: add `build_actual_stops` to the `from src.pipeline import (...)` block; add `"actual_stops.parquet"` to the `TABLES` list; and add a build step in `main()` after the pit-loss step (step 4), using the season list and the dedicated circuit set, merged non-destructively:

```python
    from src.features.actual_stops import STOPS_CIRCUITS  # local import: script-level constant
    print(f"4b/7 actual stops — fetch {LIVE_SEASON} only, merge...")
    stops = _merge_live(store.ACTUAL_STOPS, build_actual_stops([LIVE_SEASON], STOPS_CIRCUITS))
    store.write_table(stops, store.ACTUAL_STOPS)
    print(f"    {len(stops)} rows, {stops['race_id'].nunique()} races")
```

(Also build the historical seasons the first time: see Step 8.)

- [ ] **Step 8: Build the table for real (history + 2026) and bundle it**

Run (fetches fastf1; builds 2023-2026 for the stops circuits so the historical norm exists):

```bash
PYTHONPATH=. .venv/bin/python -c "from src.pipeline import build_actual_stops; from src.features.actual_stops import STOPS_CIRCUITS; from src import store; store.write_table(build_actual_stops([2023,2024,2025,2026], STOPS_CIRCUITS), store.ACTUAL_STOPS)"
cp data/actual_stops.parquet api/actual_stops.parquet
```

Verify coverage:

```bash
.venv/bin/python -c "import pandas as pd; d=pd.read_parquet('api/actual_stops.parquet'); print('2026:', sorted(d[d.year==2026].gp.tolist())); print('GB seasons:', sorted(d[d.gp=='Great Britain'].year.tolist()))"
```
Expected: 2026 lists the completed rounds (Australia … Austria); `Great Britain` shows 2023, 2024, 2025.

- [ ] **Step 9: Commit**

```bash
git add src/features/actual_stops.py src/pipeline.py src/store.py scripts/build_2026.py tests/test_actual_stops.py api/actual_stops.parquet data/actual_stops.parquet
git commit -m "feat: actual per-race pit-stop distribution table"
```
(Note: `data/` is gitignored, so only the `api/` copy + code commit. If `git add data/...` errors on the ignore, drop it.)

---

### Task 2: actual + historical-norm inference

**Files:**
- Create: `src/inference/stops.py`
- Test: `tests/test_inference_stops.py`

**Interfaces:**
- Consumes: `store.ACTUAL_STOPS` schema from Task 1 (`race_id, year, gp, modal_stops, n_drivers, n_at_modal, stops_min, stops_max`).
- Produces: `actual_stops(year: int, gp: str, table: pd.DataFrame) -> dict | None` (the row as a dict, or None if no row); `historical_stop_norm(gp: str, table: pd.DataFrame, before_year: int | None = None) -> dict | None` returning `{"modal_stops": int, "n_seasons": int}` from strictly-prior seasons.

- [ ] **Step 1: Write the failing test**

Create `tests/test_inference_stops.py`:

```python
import pandas as pd

from src.inference.stops import actual_stops, historical_stop_norm


def _table():
    return pd.DataFrame([
        {"race_id": "2023-Great Britain", "year": 2023, "gp": "Great Britain",
         "modal_stops": 1, "n_drivers": 20, "n_at_modal": 12, "stops_min": 1, "stops_max": 2},
        {"race_id": "2024-Great Britain", "year": 2024, "gp": "Great Britain",
         "modal_stops": 2, "n_drivers": 20, "n_at_modal": 11, "stops_min": 1, "stops_max": 3},
        {"race_id": "2025-Great Britain", "year": 2025, "gp": "Great Britain",
         "modal_stops": 2, "n_drivers": 20, "n_at_modal": 14, "stops_min": 1, "stops_max": 2},
        {"race_id": "2026-Austria", "year": 2026, "gp": "Austria",
         "modal_stops": 2, "n_drivers": 22, "n_at_modal": 14, "stops_min": 1, "stops_max": 3},
    ])


def test_actual_stops_returns_row_or_none():
    t = _table()
    assert actual_stops(2026, "Austria", t)["modal_stops"] == 2
    assert actual_stops(2026, "Great Britain", t) is None  # no 2026 GB row -> upcoming


def test_historical_norm_uses_strictly_prior_seasons():
    t = _table()
    # Predicting 2026 Great Britain -> modal across 2023-25 (1,2,2) = 2, over 3 seasons.
    norm = historical_stop_norm("Great Britain", t, before_year=2026)
    assert norm == {"modal_stops": 2, "n_seasons": 3}
    # No leakage: with before_year=2024 only 2023 counts.
    assert historical_stop_norm("Great Britain", t, before_year=2024) == {"modal_stops": 1, "n_seasons": 1}
    assert historical_stop_norm("Narnia", t, before_year=2026) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_inference_stops.py -q`
Expected: FAIL — module/functions missing.

- [ ] **Step 3: Implement `src/inference/stops.py`**

```python
"""Actual + historical-norm stop-count reads over the bundled actual_stops table. No fastf1."""
from __future__ import annotations

import pandas as pd


def actual_stops(year: int, gp: str, table: pd.DataFrame) -> dict | None:
    """The completed race's stop distribution as a dict, or None if there is no row."""
    rows = table[(table["year"] == year) & (table["gp"] == gp)]
    if rows.empty:
        return None
    r = rows.iloc[0]
    return {
        "modal_stops": int(r["modal_stops"]), "n_drivers": int(r["n_drivers"]),
        "n_at_modal": int(r["n_at_modal"]), "stops_min": int(r["stops_min"]),
        "stops_max": int(r["stops_max"]),
    }


def historical_stop_norm(gp: str, table: pd.DataFrame,
                         before_year: int | None = None) -> dict | None:
    """Modal stop count across STRICTLY-PRIOR seasons at this circuit (leakage-safe)."""
    rows = table[table["gp"] == gp]
    if before_year is not None:
        rows = rows[rows["year"] < before_year]
    if rows.empty:
        return None
    return {"modal_stops": int(rows["modal_stops"].mode().iloc[0]), "n_seasons": int(len(rows))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_inference_stops.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/inference/stops.py tests/test_inference_stops.py
git commit -m "feat: actual-stops and historical-norm inference reads"
```

---

### Task 3: Python routing — one stops question, three modes

**Files:**
- Modify: `api/strategy.py`, `vercel.json`
- Test: `tests/test_api_strategy_modes.py`

**Interfaces:**
- Consumes: `actual_stops`, `historical_stop_norm` (Task 2); `predict_stop_counts` (existing, returns `{... "dominant": {"n_stops","share","n_drivers"} | None, "sc_caveat": str, "drivers": [...], "qualitative": bool, "reason"?}`).
- Produces: `strategy_response(body: dict) -> tuple[int, dict]` returning a payload with a `mode: "actual" | "historical" | "predicted"` field plus the fields each mode needs (see below). Consumed by the frontend in Task 4.

- [ ] **Step 1: Write the failing test**

Create `tests/test_api_strategy_modes.py`:

```python
from api.strategy import strategy_response


def test_completed_race_returns_actual_mode():
    # Austria 2026 has an actual_stops row (it ran).
    status, p = strategy_response({"year": 2026, "gp": "Austria"})
    assert status == 200
    assert p["mode"] == "actual"
    assert p["dominant"]["n_stops"] >= 1
    assert p["dominant"]["n_drivers"] >= 1
    assert p["sc_caveat"] == ""  # SC caveat only on predicted mode


def test_upcoming_next_race_returns_historical_mode():
    # Great Britain has no 2026 row and no dry-FP row -> historical norm.
    status, p = strategy_response({"year": 2026, "gp": "Great Britain"})
    assert status == 200
    assert p["mode"] == "historical"
    assert p["dominant"]["n_stops"] >= 1


def test_missing_fields_is_400():
    status, p = strategy_response({"gp": "Austria"})
    assert status == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_api_strategy_modes.py -q`
Expected: FAIL — current `strategy_response` returns `predict_stop_counts` output with no `mode`.

- [ ] **Step 3: Rewrite `strategy_response` in `api/strategy.py`**

Add the actual-stops table load next to the existing `_TABLE`/`_TEAMS` (near line 28) and the new imports (near line 25):

```python
from src.inference.stops import actual_stops, historical_stop_norm  # noqa: E402
...
_ACTUAL = pd.read_parquet(Path(__file__).with_name("actual_stops.parquet"))
```

Replace the body of `strategy_response` (currently near line 32-44) with:

```python
def strategy_response(body: dict) -> tuple[int, dict]:
    """Route a stops question by race state: completed -> actual, upcoming+dry-FP -> Model-B
    prediction, otherwise -> historical norm. All return a `mode`-tagged StrategyFacts shape."""
    year, gp = body.get("year"), body.get("gp")
    if year is None or not gp:
        return 400, {"error": "year and gp are required"}
    try:
        year = int(year)
    except (TypeError, ValueError):
        return 400, {"error": "year must be an integer"}

    act = actual_stops(year, gp, _ACTUAL)
    if act is not None:
        share = round(act["n_at_modal"] / act["n_drivers"], 2) if act["n_drivers"] else None
        return 200, {
            "year": year, "gp": gp, "mode": "actual", "qualitative": False, "sc_caveat": "",
            "dominant": {"n_stops": act["modal_stops"], "share": share,
                         "n_drivers": act["n_drivers"]},
            "stops_min": act["stops_min"], "stops_max": act["stops_max"], "drivers": [],
        }

    pred = predict_stop_counts(year, gp, table=_TABLE)
    if pred.get("dominant"):
        pred["mode"] = "predicted"
        return 200, pred

    norm = historical_stop_norm(gp, _ACTUAL, before_year=year)
    if norm is not None:
        return 200, {
            "year": year, "gp": gp, "mode": "historical", "qualitative": False, "sc_caveat": "",
            "dominant": {"n_stops": norm["modal_stops"], "share": None, "n_drivers": None},
            "n_seasons": norm["n_seasons"], "drivers": [],
        }

    # No actuals, no FP row, no history: honest low-data state (keep predict_stop_counts' shape).
    pred["mode"] = "historical"
    return 200, pred
```

- [ ] **Step 4: Ship the new table with the function**

In `vercel.json`, add `api/actual_stops.parquet` to the `includeFiles` glob for the strategy function (mirror how `strategy_features.parquet`/`team_map.parquet` are listed).

Run: `.venv/bin/python -m pytest tests/test_api_strategy_modes.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add api/strategy.py vercel.json tests/test_api_strategy_modes.py
git commit -m "feat: strategy endpoint routes actual/historical/predicted stop counts"
```

---

### Task 4: Frontend — mode field, narrative, card

**Files:**
- Modify: `app/lib/narrative.ts` (extend `StrategyFacts`, add mode branches to `generateStrategyNarrative`), `app/page.tsx` (`StrategyCard` mode label)
- Test: `app/lib/narrative.test.ts` (extend), `app/lib/orchestrate.test.ts` (extend if it fixtures strategy)

**Interfaces:**
- Consumes: the `mode`-tagged payload from Task 3.
- Produces: `StrategyFacts` gains `mode?: "actual" | "historical" | "predicted"`, `stops_min?: number`, `stops_max?: number`, `n_seasons?: number`, and `dominant.share: number | null`.

- [ ] **Step 1: Extend the `StrategyFacts` type**

In `app/lib/narrative.ts`, change the `StrategyFacts` type (near line 132) to:

```typescript
export type StrategyFacts = {
  year: number;
  gp: string;
  mode?: "actual" | "historical" | "predicted";
  qualitative: boolean;
  n_train_races?: number;
  n_seasons?: number;
  reason?: string;
  sc_caveat: string;
  stops_min?: number;
  stops_max?: number;
  dominant: { n_stops: number; share: number | null; n_drivers: number | null } | null;
  drivers: StrategyDriver[];
  context?: string[];
};
```

- [ ] **Step 2: Write the failing test (narrative copy is grounded + mode-aware)**

Add to `app/lib/narrative.test.ts` (follow the existing test style there; if `generateStrategyNarrative` is prompt-only and hard to unit-test, instead test a new pure helper `strategyLede(facts)` — implement whichever the file's pattern supports). Minimal pure helper test:

```typescript
import { strategyLede } from "./narrative";

test("actual mode ledes with what happened", () => {
  const f = { year: 2026, gp: "Austria", mode: "actual", qualitative: false, sc_caveat: "",
    stops_min: 1, stops_max: 3, dominant: { n_stops: 2, share: 0.7, n_drivers: 20 }, drivers: [] } as const;
  expect(strategyLede(f)).toMatch(/most drivers ran 2 stops/i);
});

test("historical mode ledes with the norm", () => {
  const f = { year: 2026, gp: "Great Britain", mode: "historical", qualitative: false, sc_caveat: "",
    n_seasons: 3, dominant: { n_stops: 2, share: null, n_drivers: null }, drivers: [] } as const;
  expect(strategyLede(f)).toMatch(/usually a 2-stop/i);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/lib/narrative.test.ts`
Expected: FAIL — `strategyLede` not exported.

- [ ] **Step 4: Implement `strategyLede` and use it in the narrative**

Add to `app/lib/narrative.ts`:

```typescript
// A grounded, mode-aware one-liner the narrative generator (and the card) lead with. No
// invented facts: every number comes straight from the StrategyFacts JSON. No em-dashes.
export function strategyLede(f: StrategyFacts): string {
  const n = f.dominant?.n_stops;
  if (n == null) return "There is not enough data to call the stops for this race yet.";
  const stops = `${n} stop${n === 1 ? "" : "s"}`;
  if (f.mode === "actual") {
    const range = f.stops_min != null && f.stops_max != null && f.stops_min !== f.stops_max
      ? ` (spread ${f.stops_min} to ${f.stops_max})` : "";
    return `At the ${f.year} ${f.gp}, most drivers ran ${stops}${range}.`;
  }
  if (f.mode === "historical") {
    return `Usually a ${stops.replace(" ", "-")} race here, based on recent seasons.`;
  }
  return `The stop-count model points to a ${stops.replace(" ", "-")} race.`;
}
```

Then, in the strategy narrative path, prepend `strategyLede(facts)` to the grounded context handed to Haiku (or, if the file already builds a lede string, replace it). Keep the "do not invent facts" + no-em-dash system prompt lines. The SC caveat continues to be appended only when `facts.mode === "predicted"` (or `facts.sc_caveat` is non-empty, which now happens only in predicted mode).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/lib/narrative.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the mode label to `StrategyCard`**

In `app/page.tsx` `StrategyCard` (near line 185), add a small label above the dominant call that reads from `strategy.mode`: `"actual result"` / `"historical norm"` / `"prediction"`. Render the SC caveat block only when `strategy.mode === "predicted"`. Keep the existing per-driver modal gated on `strategy.drivers.length > 0` (actual/historical modes have empty `drivers`, so it simply won't show).

- [ ] **Step 7: Verify build + tests**

Run: `npx vitest run` (expect all green) and `npm run build` (clean).

- [ ] **Step 8: Commit**

```bash
git add app/lib/narrative.ts app/page.tsx app/lib/narrative.test.ts
git commit -m "feat: mode-aware stop-count narrative and card (actual/historical/predicted)"
```

---

### Task 5: Pit-loss coverage + circuit normalization

**Files:**
- Modify: `app/lib/circuits.ts` (only if a gap is found)
- Test: `app/lib/circuits.test.ts` (extend)

**Interfaces:**
- Consumes: `normalizeLookupCircuit(raw, stat)` (existing).

- [ ] **Step 1: Enumerate the coverage gap**

Run this to see which completed 2026 rounds + Great Britain return a pit-loss number today:

```bash
.venv/bin/python -c "
from src.inference.lookup import lookup_stat
import pandas as pd
pit = pd.read_parquet('api/pit_loss.parquet')
for gp in ['Australia','China','Japan','Miami','Canada','Monaco','Barcelona','Austria','Great Britain']:
    r = lookup_stat('pit_loss', gp, table=pit, year=2026)
    print(gp, '->', r.get('value'))
"
```
Expected: every completed 2026 round returns a number; Great Britain returns its latest historical value (~22.6). Note any that return `None`.

- [ ] **Step 2: Write the failing test for any normalization gap**

If Step 1 shows a circuit that returns `None` because the free-text name did not map (e.g. "Silverstone" → "Great Britain", "Spain" vs "Barcelona"), add a case to `app/lib/circuits.test.ts` asserting `normalizeLookupCircuit("Silverstone", "pit_loss") === "Great Britain"` (use the actual failing alias). If Step 1 shows full coverage, record that in the commit message and skip to Task 6 (no code change needed).

- [ ] **Step 3: Run test to verify it fails**, then **Step 4: add the alias** to the normalization map in `app/lib/circuits.ts`, then **Step 5: run to verify it passes**:

Run: `npx vitest run app/lib/circuits.test.ts`

- [ ] **Step 6: Commit (only if a gap was fixed)**

```bash
git add app/lib/circuits.ts app/lib/circuits.test.ts
git commit -m "fix: normalize circuit aliases so pit-loss covers every 2026 round"
```

---

### Task 6: Data refresh, bundle, and end-to-end verification

**Files:**
- Modify: `api/*.parquet` (refreshed bundle), as produced by the build

- [ ] **Step 1: Full refresh through the fixed builder**

Run (rebuilds the live season for all tables INCLUDING actual_stops via the Task-1 step, non-destructively):

```bash
PYTHONPATH=. .venv/bin/python scripts/build_2026.py
```
Watch the output: the new `4b/7 actual stops` step prints a row/race count; the run ends `DONE`.

- [ ] **Step 2: Verify the three modes end to end (Python)**

```bash
.venv/bin/python -c "
from api.strategy import strategy_response
for y,gp in [(2026,'Austria'),(2026,'Monaco'),(2026,'China'),(2026,'Great Britain')]:
    s,p = strategy_response({'year':y,'gp':gp})
    print(y, gp, '->', p.get('mode'), p.get('dominant'))
"
```
Expected: Austria/Monaco/China → `actual` with a `dominant.n_stops` (Monaco and China previously returned nothing); Great Britain → `historical`.

- [ ] **Step 3: Full suites + trust anchor**

Run and confirm each:
- `.venv/bin/python -m pytest -q` → all pass.
- `PYTHONPATH=. .venv/bin/python notebooks/06_strategy_compound.py 2>&1 | grep "PART 1 strategy"` → prints `Δ +0.070`.
- `npx vitest run` → all pass. `npm run build` → clean.

- [ ] **Step 4: Commit the refreshed bundle**

```bash
git add api/pace_features.parquet api/strategy_features.parquet api/actual_stops.parquet api/pit_loss.parquet api/podium_features.parquet api/season_results.parquet api/team_map.parquet
git commit -m "data: refresh feature bundle with actual-stops table"
```

---

### Task 7: Staying current — extend the 2026 calendar (optional, do last)

**Files:**
- Modify: `src/calendar.py` (`RACE_CALENDAR[2026]`, `GP_TO_EVENT`), `src/features/actual_stops.py` (`STOPS_CIRCUITS`)
- Test: `tests/test_calendar.py` (extend or create)

This widens pace/strategy/pit-loss coverage to rounds 9+ as the real season runs (actual_stops already covers them via `STOPS_CIRCUITS`). It changes calendar ordering, so it goes last and is gated on the full suite.

- [ ] **Step 1: Derive the real full 2026 schedule**

```bash
PYTHONPATH=. .venv/bin/python -c "
import fastf1
s = fastf1.get_event_schedule(2026, include_testing=False)
print([e for e in s['EventName'].tolist()])
"
```
Record the exact `EventName` strings (these are the fastf1 keys `load_session` needs).

- [ ] **Step 2: Write the failing test**

In `tests/test_calendar.py`:

```python
from src.calendar import RACE_CALENDAR, GP_TO_EVENT, calendar_order


def test_2026_calendar_is_full_season_and_ordered():
    cal = RACE_CALENDAR[2026]
    assert "Great Britain" in cal
    assert cal.index("Austria") < cal.index("Great Britain")  # true schedule order
    for gp in cal:
        assert gp in GP_TO_EVENT  # every round maps to a fastf1 EventName
    assert calendar_order()  # still builds without error
```

- [ ] **Step 3: Run to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_calendar.py -q`
Expected: FAIL — `Great Britain` not in `RACE_CALENDAR[2026]`.

- [ ] **Step 4: Extend `src/calendar.py`**

Replace `RACE_CALENDAR[2026]` with the full ordered schedule from Step 1 (short keys), and add the corresponding `GP_TO_EVENT` entries mapping each short key to its fastf1 `EventName`. Simplify `STOPS_CIRCUITS` in `src/features/actual_stops.py` to `list(RACE_CALENDAR[2026])` now that the calendar is complete.

- [ ] **Step 5: Run to verify it passes + full regression**

Run: `.venv/bin/python -m pytest -q` (ALL — the calendar touches podium/pace ordering) and `PYTHONPATH=. .venv/bin/python notebooks/06_strategy_compound.py 2>&1 | grep "PART 1 strategy"` (must still be `Δ +0.070`).

- [ ] **Step 6: Rebuild bundle + commit**

```bash
PYTHONPATH=. .venv/bin/python scripts/build_2026.py
git add src/calendar.py src/features/actual_stops.py tests/test_calendar.py api/*.parquet
git commit -m "feat: extend 2026 calendar to the full season so coverage stays current"
```

---

## Self-Review

**Spec coverage:**
- Decision 1 (actual for completed) → Task 1 (data) + Task 3 (actual mode). ✓
- Decision 2 (NL surface, full coverage) → Task 3 routing + Task 5 pit-loss coverage; parser unchanged. ✓
- Decision 3 (historical norm then sharpen) → Task 2 (`historical_stop_norm`) + Task 3 (historical vs predicted branch). ✓
- Decision 4 (historical actuals free) → falls out of Task 1's multi-season table. ✓
- Data foundation / inference / routing / pit-loss / staying-current (spec §1-5) → Tasks 1/2/3/5/7. ✓
- Narrative + card mode labels (spec §3) → Task 4. ✓
- Testing (spec) → each task's tests + Task 6 full suites + nb06 anchor. ✓

**Placeholder scan:** every code step shows full code; verification steps give exact commands + expected output. Task 5 is conditional (fix only if a gap exists) with an explicit enumeration step — not a placeholder. ✓

**Type consistency:** `race_stop_distribution` keys (`modal_stops, n_drivers, n_at_modal, stops_min, stops_max`) defined in Task 1 are the exact keys read in Task 2 (`actual_stops`) and surfaced in Task 3, and the Task-3 payload fields (`mode`, `dominant.share: number|null`, `stops_min/max`, `n_seasons`) match the Task-4 `StrategyFacts` extension. `STOPS_CIRCUITS` defined in Task 1, simplified in Task 7. `store.ACTUAL_STOPS` consistent across Tasks 1/3/6. ✓

**Note on task independence:** Tasks 1-6 ship the feature for the current 8 rounds + Great Britain without touching `RACE_CALENDAR`; Task 7 (the riskier calendar change) is last and independently gated, so the core feature lands even if Task 7 is deferred.
