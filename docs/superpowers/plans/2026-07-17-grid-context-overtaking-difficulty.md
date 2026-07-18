# Grid-context (overtaking difficulty) in podium narrative — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a podium prediction is issued post-qualifying, let the narrative add one grounded, deterministic sentence about the circuit's overtaking difficulty (front-row counts for more at sticky tracks; grid holds less at high-overtaking tracks).

**Architecture:** A pure Python module computes per-track grid→finish stickiness (Spearman ρ over strictly-prior runnings) from the already-bundled `podium_features`, and composes a fixed grounded sentence. `predict_podium` attaches it (Saturday mode only) as a `grid_context` string. It flows to the frontend automatically via the existing `postJson<PodiumFacts>` cast and `withContext` spread, and the podium narrative prompt is told it may weave that one sentence in. NO model change, NO new build artifact, NO new API route.

**Tech Stack:** Python (pandas, no fastf1, no scipy), TypeScript (Next.js), pytest, vitest.

## Global Constraints

- **The podium MODEL, features, and probabilities are UNCHANGED.** This is a narrative-context feature only (spec §0 records the validation NO-GO that made a model change wrong). Task 3 must assert `p_podium`/`band` are identical with and without the new path.
- **Deterministic, grounded, no invented facts.** The context sentence is composed in Python from fixed templates; the LLM only weaves the provided sentence and must never add overtaking claims of its own (spec §6).
- **Leakage-safe:** stickiness uses only runnings with `year < target_year` (strictly-prior), matching repo methodology (CLAUDE.md house rules).
- **Round every number that reaches output.** (Only `score`/`n` are numeric and stay internal; `grid_context` is a string.)
- **No em-dashes in any user-facing copy** (existing narrative rule).
- **Commits:** conventional style, one logical change; **no Claude/AI attribution, no Co-Authored-By, no robot emoji** (CLAUDE.md).
- Run Python tests with `PYTHONPATH=. .venv/bin/python -m pytest`. Run TS tests with `npm run test` (vitest).

## File Structure

- `src/inference/stickiness.py` (NEW) — pure functions: `circuit_grid_stickiness`, `grid_context_line`. No fastf1, no scipy; reads only the passed DataFrame.
- `src/inference/podium.py` (MODIFY) — attach `grid_context` in `predict_podium` Saturday mode.
- `app/lib/narrative.ts` (MODIFY) — add `grid_context?: string` to `PodiumFacts`; add one line to `PODIUM_SYSTEM`.
- `tests/test_inference_stickiness.py` (NEW) — unit tests for the pure module.
- `tests/test_inference_podium.py` (MODIFY) — attach/no-attach + probabilities-unchanged tests.
- `app/lib/orchestrate.test.ts` (MODIFY) — pass-through guard test.

### Field-naming note (deviation from spec §4)

The spec proposed `gridContext?: string` + an explicit `orchestrate.ts` mapping. During planning we found `predictPodium` does `postJson<PodiumFacts>(...)` (direct cast) and `withContext` spreads `{...facts}`, and `PodiumFacts` already mirrors Python snake_case for API fields (`n_train_races`, driver `p_podium`). So naming the field **`grid_context`** (snake) in both Python and the TS type makes it flow through with **no mapping code**. This plan uses `grid_context` everywhere. Functionally identical to the spec, less code.

---

### Task 1: `circuit_grid_stickiness` — per-track grid→finish stickiness

**Files:**
- Create: `src/inference/stickiness.py`
- Test: `tests/test_inference_stickiness.py`

**Interfaces:**
- Consumes: a `podium_features`-shaped DataFrame with columns `gp`, `year`, `grid_position`, `finish_pos`, `race_id`.
- Produces: `circuit_grid_stickiness(podium_features: pd.DataFrame, gp: str, year: int) -> dict | None` returning `{"score": float, "tier": str, "n": int}` where `tier in {"sticky", "average", "high_overtaking"}`, or `None` when fewer than 2 prior runnings (or ρ is undefined).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_inference_stickiness.py`:

```python
"""Tests for grid-stickiness context (per-track overtaking difficulty)."""
import numpy as np
import pandas as pd

from src.inference.stickiness import circuit_grid_stickiness


def _runnings(gp, years, *, grid_to_finish):
    """Synthetic podium_features rows: for each year, 6 drivers whose finish is a
    function of grid via `grid_to_finish` (a callable position->position)."""
    rows = []
    for y in years:
        for grid in range(1, 7):
            rows.append({
                "race_id": f"{y}-{gp}", "year": y, "gp": gp,
                "grid_position": float(grid),
                "finish_pos": float(grid_to_finish(grid)),
            })
    return pd.DataFrame(rows)


def test_sticky_circuit_high_rho():
    # finish == grid -> perfect rank correlation -> sticky
    df = _runnings("Monaco", [2023, 2024, 2025], grid_to_finish=lambda g: g)
    out = circuit_grid_stickiness(df, "Monaco", 2026)
    assert out["tier"] == "sticky"
    assert out["score"] >= 0.80
    assert out["n"] == 3


def test_high_overtaking_circuit_low_rho():
    # finish reverses grid -> strong NEGATIVE rank corr; but stickiness is about how
    # well grid predicts finish ORDER, so we use the correlation sign as-is: reversed
    # grids are chaotic relative to "hold position" -> low/negative -> high_overtaking.
    df = _runnings("Vegas", [2023, 2024, 2025], grid_to_finish=lambda g: 7 - g)
    out = circuit_grid_stickiness(df, "Vegas", 2026)
    assert out["tier"] == "high_overtaking"
    assert out["score"] < 0.60


def test_average_circuit_mid_rho():
    # a moderate shuffle -> spearman rho ~0.66 (verified): positive but not extreme
    shift = {1: 2, 2: 3, 3: 1, 4: 5, 5: 6, 6: 4}
    df = _runnings("Spain", [2023, 2024, 2025], grid_to_finish=lambda g: shift[g])
    out = circuit_grid_stickiness(df, "Spain", 2026)
    assert out["tier"] == "average"
    assert 0.60 <= out["score"] < 0.80


def test_thin_history_returns_none():
    df = _runnings("NewTrack", [2025], grid_to_finish=lambda g: g)  # 1 running
    assert circuit_grid_stickiness(df, "NewTrack", 2026) is None


def test_leakage_target_year_excluded():
    # A chaotic 2026 running must NOT influence the pre-2026 sticky estimate.
    sticky = _runnings("Monaco", [2023, 2024, 2025], grid_to_finish=lambda g: g)
    leak = _runnings("Monaco", [2026], grid_to_finish=lambda g: 7 - g)
    df = pd.concat([sticky, leak], ignore_index=True)
    out = circuit_grid_stickiness(df, "Monaco", 2026)
    assert out["n"] == 3           # only 2023-2025 counted
    assert out["tier"] == "sticky"


def test_no_rows_for_circuit_returns_none():
    df = _runnings("Monaco", [2023, 2024], grid_to_finish=lambda g: g)
    assert circuit_grid_stickiness(df, "Suzuka", 2026) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_stickiness.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.inference.stickiness'`

- [ ] **Step 3: Write the minimal implementation**

Create `src/inference/stickiness.py`:

```python
"""Per-track grid-stickiness context for the podium narrative (M7).

Grid->finish "stickiness" = how strongly starting position predicts finishing
position at a circuit (Spearman rank correlation over its PRIOR runnings). It is
NOT a model input (a validated NO-GO, spec 2026-07-17 §0) — only a grounded,
deterministic sentence the narrative may weave in: front-row starts count for more
at hard-to-overtake tracks, less at high-overtaking ones.

Pure pandas; no fastf1, no scipy. Reads only the passed podium_features frame.
"""
from __future__ import annotations

import pandas as pd

# Thresholds anchored to the observed 2023-2026 spread (rho ~0.43 Las Vegas ..
# ~0.90 Monaco/Japan). Extremes speak; the broad middle stays silent (average).
STICKY_MIN = 0.80
HIGH_OVERTAKING_MAX = 0.60
MIN_RUNNINGS = 2  # honesty gate: below this we cannot say anything trustworthy


def circuit_grid_stickiness(podium_features: pd.DataFrame, gp: str,
                            year: int) -> dict | None:
    """Shrink-free Spearman rho(grid, finish) over strictly-prior runnings of `gp`.

    Returns {"score", "tier", "n"} or None when there are fewer than MIN_RUNNINGS
    prior runnings (or the correlation is undefined). `n` counts distinct prior
    race_ids. `tier` is one of "sticky" / "average" / "high_overtaking".
    """
    prior = podium_features[
        (podium_features["gp"] == gp) & (podium_features["year"] < year)
    ].dropna(subset=["grid_position", "finish_pos"])
    n = int(prior["race_id"].nunique())
    if n < MIN_RUNNINGS:
        return None
    rho = prior["grid_position"].corr(prior["finish_pos"], method="spearman")
    if pd.isna(rho):
        return None
    score = round(float(rho), 2)
    if score >= STICKY_MIN:
        tier = "sticky"
    elif score < HIGH_OVERTAKING_MAX:
        tier = "high_overtaking"
    else:
        tier = "average"
    return {"score": score, "tier": tier, "n": n}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_stickiness.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/inference/stickiness.py tests/test_inference_stickiness.py
git commit -m "feat: per-track grid-stickiness (spearman grid->finish over prior runnings)"
```

---

### Task 2: `grid_context_line` — compose the grounded sentence

**Files:**
- Modify: `src/inference/stickiness.py`
- Test: `tests/test_inference_stickiness.py`

**Interfaces:**
- Consumes: a stickiness dict from `circuit_grid_stickiness` (or `None`), and `drivers` — a list of the podium driver dicts as `predict_podium` builds them, each with a `factors` dict that may hold `grid` (int, present in Saturday mode).
- Produces: `grid_context_line(stickiness: dict | None, drivers: list[dict]) -> str | None` — one fixed grounded sentence, or `None` (silent).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_inference_stickiness.py`:

```python
from src.inference.stickiness import grid_context_line


def _drivers(*grids):
    return [{"factors": {"grid": g}} for g in grids]


def test_line_fires_for_sticky_with_front_row():
    st = {"score": 0.9, "tier": "sticky", "n": 4}
    line = grid_context_line(st, _drivers(1, 5, 8))
    assert line is not None
    assert "hardest" in line.lower() or "hard to overtake" in line.lower()
    assert "—" not in line and "–" not in line  # no em/en dashes


def test_line_fires_for_high_overtaking_with_front_row():
    st = {"score": 0.45, "tier": "high_overtaking", "n": 4}
    line = grid_context_line(st, _drivers(2, 4, 6))
    assert line is not None
    assert "passing" in line.lower() or "overtak" in line.lower()


def test_line_silent_for_average_tier():
    st = {"score": 0.7, "tier": "average", "n": 4}
    assert grid_context_line(st, _drivers(1, 2, 3)) is None


def test_line_silent_without_front_row_driver():
    st = {"score": 0.9, "tier": "sticky", "n": 4}
    assert grid_context_line(st, _drivers(5, 6, 7)) is None


def test_line_silent_when_stickiness_none():
    assert grid_context_line(None, _drivers(1, 2)) is None


def test_line_silent_when_no_grid_in_factors():
    # Friday-shaped drivers (no grid key) never trigger.
    st = {"score": 0.9, "tier": "sticky", "n": 4}
    assert grid_context_line(st, [{"factors": {}}]) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_stickiness.py -k line -v`
Expected: FAIL with `ImportError: cannot import name 'grid_context_line'`

- [ ] **Step 3: Write the minimal implementation**

Append to `src/inference/stickiness.py`:

```python
FRONT_ROW_MAX = 3  # a front-row-ish start worth contextualizing

_LINES = {
    "sticky": ("This is one of the hardest circuits to overtake on, so a "
               "front-row start counts for more than usual here."),
    "high_overtaking": ("This circuit sees a lot of passing, so grid position "
                        "holds less than the starting order suggests and "
                        "positions can change."),
}


def grid_context_line(stickiness: dict | None, drivers: list[dict]) -> str | None:
    """One grounded sentence about overtaking difficulty, or None (silent).

    Fires only when the tier is informative (sticky / high_overtaking) AND at least
    one driver starts on the front rows (grid <= FRONT_ROW_MAX). `average` tiers and
    Friday-shaped drivers (no grid) stay silent.
    """
    if not stickiness or stickiness["tier"] not in _LINES:
        return None
    has_front = any(
        isinstance(d.get("factors", {}).get("grid"), (int, float))
        and d["factors"]["grid"] <= FRONT_ROW_MAX
        for d in drivers
    )
    if not has_front:
        return None
    return _LINES[stickiness["tier"]]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_stickiness.py -v`
Expected: PASS (12 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/inference/stickiness.py tests/test_inference_stickiness.py
git commit -m "feat: grid_context_line composes grounded overtaking-difficulty sentence"
```

---

### Task 3: Attach `grid_context` in `predict_podium` (Saturday only)

**Files:**
- Modify: `src/inference/podium.py`
- Test: `tests/test_inference_podium.py`

**Interfaces:**
- Consumes: `circuit_grid_stickiness`, `grid_context_line` from Task 1/2; the `table` and `drivers` already present in `predict_podium`.
- Produces: `predict_podium(...)` return dict gains an optional `grid_context: str` key (present only in Saturday mode when a line is composed; absent otherwise). Probabilities/bands unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_inference_podium.py`. First extend the existing `_podium_table` helper so the target circuit has PRIOR sticky runnings — add a keyword and prior rows. Replace the current `_podium_table` definition with:

```python
def _podium_table(n_train_weekends=8, with_grid=True, sticky_prior=False):
    """Synthetic table on REAL calendar race_ids so store.prior_weekends (which
    slices in calendar order) recognizes the prior 2023 weekends. champ rank
    strongly predicts podium. `n_train_weekends` prior 2023 circuits (<= 8) precede
    the 2024-Bahrain target. `sticky_prior` adds prior-year Bahrain runnings where
    finish==grid (a sticky circuit) so grid_context can attach."""
    rows = []
    drivers = ["VER", "NOR", "LEC", "HAM", "PIA", "RUS"]
    weekends = [(2023, c) for c in DRY_CIRCUITS[:n_train_weekends]] + [(2024, "Bahrain")]
    for year, gp in weekends:
        for rank, drv in enumerate(drivers, start=1):
            rows.append({
                "race_id": f"{year}-{gp}", "year": year, "gp": gp,
                "Driver": drv, "podium": int(rank <= 3),
                "champ_rank_before": rank, "champ_points_before": 200 - 30 * rank,
                "form_finish_avg3": float(rank), "prior_track_pace": 0.05 * rank,
                "grid_position": rank if with_grid else float("nan"),
                "finish_pos": rank,
                "team": "TestTeam",
            })
    if sticky_prior:
        for y in (2021, 2022, 2023):
            for rank, drv in enumerate(drivers, start=1):
                rows.append({
                    "race_id": f"{y}-Bahrain", "year": y, "gp": "Bahrain",
                    "Driver": drv, "podium": int(rank <= 3),
                    "champ_rank_before": rank, "champ_points_before": 200 - 30 * rank,
                    "form_finish_avg3": float(rank), "prior_track_pace": 0.05 * rank,
                    "grid_position": float(rank), "finish_pos": float(rank),
                    "team": "TestTeam",
                })
    return pd.DataFrame(rows)
```

Then add these tests:

```python
def test_saturday_attaches_grid_context_for_sticky_circuit():
    out = predict_podium(2024, "Bahrain", table=_podium_table(sticky_prior=True))
    assert out["mode"] == "saturday"
    assert "grid_context" in out
    assert "front-row" in out["grid_context"]


def test_friday_never_attaches_grid_context():
    out = predict_podium(2024, "Bahrain", mode="friday",
                         table=_podium_table(sticky_prior=True))
    assert out["mode"] == "friday"
    assert "grid_context" not in out


def test_no_grid_context_when_no_prior_history():
    # No prior Bahrain runnings -> stickiness None -> no line.
    out = predict_podium(2024, "Bahrain", table=_podium_table())
    assert "grid_context" not in out


def test_grid_context_does_not_change_probabilities():
    base = predict_podium(2024, "Bahrain", table=_podium_table())
    withctx = predict_podium(2024, "Bahrain", table=_podium_table(sticky_prior=True))
    # Same model inputs (SATURDAY_COLS) -> identical per-driver probabilities/bands;
    # the sticky_prior rows are a different circuit and cannot enter Bahrain's train
    # slice OR change its features.
    b = {d["driver"]: (d["p_podium"], d["band"]) for d in base["drivers"]}
    w = {d["driver"]: (d["p_podium"], d["band"]) for d in withctx["drivers"]}
    assert b == w
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_podium.py -k grid_context -v`
Expected: FAIL — `grid_context` not in output (the attach code doesn't exist yet).

Note: `test_grid_context_does_not_change_probabilities` should PASS already (that is the regression guarantee). If it FAILS at this step, the sticky_prior rows are wrongly influencing the model — stop and investigate before writing Step 3.

- [ ] **Step 3: Write the minimal implementation**

In `src/inference/podium.py`, add the import near the top (after the existing `from src.models.podium_model import ...`):

```python
from src.inference.stickiness import circuit_grid_stickiness, grid_context_line
```

Then, in `predict_podium`, locate the Saturday-mode return (the final `return` that builds the result dict with `drivers`). Replace this block:

```python
    drivers.sort(key=lambda r: r["p_podium"], reverse=True)
    for i, d in enumerate(drivers, start=1):
        d["rank"] = i
    return {"year": year, "gp": gp, "mode": resolved, "qualitative": True,
            "calibrated": False, "n_train_races": n_train, "drivers": drivers}
```

with:

```python
    drivers.sort(key=lambda r: r["p_podium"], reverse=True)
    for i, d in enumerate(drivers, start=1):
        d["rank"] = i
    result = {"year": year, "gp": gp, "mode": resolved, "qualitative": True,
              "calibrated": False, "n_train_races": n_train, "drivers": drivers}
    if saturday:
        line = grid_context_line(
            circuit_grid_stickiness(table, gp, year), drivers)
        if line:
            result["grid_context"] = line
    return result
```

(`saturday` is the existing local `bool` set from `resolved == "saturday"`; `table` is the resolved feature table already in scope.)

- [ ] **Step 4: Run the full podium test file**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_podium.py -v`
Expected: PASS (all existing tests + the 4 new ones).

- [ ] **Step 5: Run the api podium test to confirm the response still serializes**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_api_podium.py -v`
Expected: PASS (the handler returns `predict_podium` output verbatim; an extra string key is JSON-safe).

- [ ] **Step 6: Commit**

```bash
git add src/inference/podium.py tests/test_inference_podium.py
git commit -m "feat: attach grid_context to Saturday podium predictions"
```

---

### Task 4: Frontend — carry `grid_context` and let the narrative use it

**Files:**
- Modify: `app/lib/narrative.ts`
- Modify: `app/lib/orchestrate.test.ts`

**Interfaces:**
- Consumes: the `grid_context` string on the `/api/podium` JSON (Task 3).
- Produces: `PodiumFacts.grid_context?: string`; `PODIUM_SYSTEM` instruction permitting one grounded sentence from it. Flows through `postJson<PodiumFacts>` (direct cast) and `withContext` (spread) with no mapping code.

- [ ] **Step 1: Write the failing test**

Add to `app/lib/orchestrate.test.ts`, inside the `describe("answerQuery", ...)` block:

```javascript
  it("passes grid_context through to the podium facts", async () => {
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "predict_podium", gp: "Italy", year: 2024 }),
        predictPodium: async () => ({
          ...PODIUM,
          grid_context: "This is one of the hardest circuits to overtake on, so a front-row start counts for more than usual here.",
        }),
      }),
      "who podiums at Monza?",
    );
    expect(out.supported).toBe(true);
    if (out.supported && "podium" in out) {
      expect(out.podium.grid_context).toContain("front-row start counts for more");
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- orchestrate`
Expected: FAIL — TypeScript error: `grid_context` does not exist on type `PodiumFacts` (the object literal / property access is rejected).

- [ ] **Step 3: Add the type field**

In `app/lib/narrative.ts`, in the `PodiumFacts` type, add the field after `context?: string[];`:

```typescript
  context?: string[];
  grid_context?: string; // grounded per-track overtaking-difficulty sentence (Saturday only)
```

- [ ] **Step 4: Add the narrative instruction**

In `app/lib/narrative.ts`, in the `PODIUM_SYSTEM` array, add this line immediately after the existing `context` line (`"If the JSON includes \`context\` ..."`):

```typescript
  "If the JSON includes `grid_context`, you MAY include it as at most one short sentence, preserving its meaning; never add overtaking or track-difficulty claims of your own.",
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- orchestrate`
Expected: PASS.

- [ ] **Step 6: Run the full vitest suite + typecheck + build**

Run: `npm run test`
Expected: all pass (no regressions).

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add app/lib/narrative.ts app/lib/orchestrate.test.ts
git commit -m "feat: carry grid_context into podium narrative and allow one grounded sentence"
```

---

## Self-Review

**Spec coverage:**
- §3.1 `circuit_grid_stickiness` (ρ, tier, n, `n<2`→None, leakage) → Task 1. ✓
- §3.2 `grid_context_line` (front-row + tier gates, symmetric sticky/high_overtaking, average/None silent) → Task 2. ✓
- §3.3 attach in Saturday mode, omit otherwise, upcoming path covered (same `predict_podium`) → Task 3. ✓
- §4 narrative wiring (type field + prompt line); mapping folded away by the `grid_context` snake-case naming (documented deviation) → Task 4. ✓
- §6 honesty guards (deterministic, sample gate, leakage, only extremes speak) → enforced across Tasks 1–3. ✓
- §7 tests (Python tiers/gate/leakage, line triggers, predict_podium attach/no-attach, probabilities-unchanged, TS pass-through) → Tasks 1–4. ✓
- §2 non-goals (no model change, no new artifact/route) → honored; Task 3 Step 1 adds the probabilities-unchanged regression. ✓

**Placeholder scan:** none — every step has concrete code/commands/expected output.

**Type consistency:** `circuit_grid_stickiness` returns `{"score","tier","n"}` used identically in Tasks 2–3; `grid_context_line(stickiness, drivers)` signature consistent across Tasks 2–3; the driver dict shape (`factors.grid`) matches `_driver_factors` in `podium.py`; the response key `grid_context` is identical in Python (Task 3) and the TS `PodiumFacts` field (Task 4).

**Out of v1 (spec §8):** `/learn` concept link and front-retention concrete phrasing — intentionally not planned.
