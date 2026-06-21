# M4 — Telemetry Differentiators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sector 4's two validated telemetry contributions — pace gaps + uncertainty (Model A, supporting) and stop-count strategy (Model B, with the deg→stops teachable story) — queryable end-to-end on the deployed app, plus wire the tyre-deg/stint lookups and fix the pit-loss honesty defect.

**Architecture:** Mirrors the M3 podium integration. Two Haiku calls run in the Next server; per-request Python serverless fns under `/api/` do pure inference over bundled parquet tables (never fastf1). New fns `api/pace.py` + `api/strategy.py` carry sklearn; `api/inference.py` stays slim (no sklearn) and gains the deg/stint lookups + pit-loss honesty guard. Helmet team-colour comes from a small `team_map` parquet joined at the serverless boundary (team is glyph metadata, never a model input).

**Tech Stack:** Python (pandas, scikit-learn) under Vercel Python runtime; Next.js App Router + TypeScript; Anthropic Haiku 4.5; pytest + vitest; canvas-2D ASCII glyphs.

## Global Constraints

- Inference code NEVER imports fastf1; the slim `api/inference.py` path NEVER imports scikit-learn (enforced by `tests/test_inference_no_fastf1.py`).
- All model training goes through `store.prior_weekends` (true calendar order, never alphabetical). M4 adds no new training paths — the callables already do this.
- Round every number that reaches output (`round(x, 3)` for seconds, `round(x, 3)` for shares/probabilities; ints stay ints).
- Logic lives in `src/`; the Python serverless fns and `app/lib/*` are thin orchestration.
- ASCII rendering stays on canvas (the `shaders` pkg cannot ASCII-ify DOM — settled in M2/M3); all motion gated behind `prefers-reduced-motion`.
- Never oversell: pace = "supporting context, not a podium call"; strategy = conditions-led + the safety-car caveat (`SC_CAVEAT`) ALWAYS attached and shown.
- No driver photos/faces, no team logos, no Pirelli marks — abstract glyphs + team colours only.
- Commits: conventional style, one logical change each, NO Claude/AI attribution (no trailer, no robot emoji).
- The validated slice is the 8 dry circuits (Bahrain, Saudi Arabia, Spain, Hungary, Italy, Mexico City, Las Vegas, Abu Dhabi) for pace/strategy; pit-loss lookups also cover Monaco (9 curated circuits); deg/stint lookups cover the 8.
- Run Python with the repo venv: `PYTHONPATH=. .venv/bin/python -m pytest …`. Run JS tests with `npm run test` (vitest) and the build with `npm run build`.

---

### Task 1: Pit-loss honesty guard (Python)

Stop presenting the generic 21.0 default as a curated fact for non-curated circuits.

**Files:**
- Modify: `src/features/track.py` (add `CURATED_TRACKS`)
- Modify: `src/inference/lookup.py:19-24` (pit_loss branch)
- Test: `tests/test_lookup.py`, `tests/test_track.py`

**Interfaces:**
- Consumes: `src.features.track._TRACKS`
- Produces: `CURATED_TRACKS: frozenset[str]`; `lookup_stat("pit_loss", gp)` returns `value: None, source: "not available for this circuit"` when `gp not in CURATED_TRACKS`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_lookup.py`:

```python
def test_pit_loss_non_curated_circuit_is_honestly_unavailable():
    out = lookup_stat("pit_loss", "Imola")
    assert out["value"] is None
    assert out["units"] is None
    assert out["source"] == "not available for this circuit"


def test_pit_loss_curated_circuit_still_returns_value():
    out = lookup_stat("pit_loss", "Spain")
    assert out["value"] == 21.0
    assert out["source"] == "curated track features"
```

Add to `tests/test_track.py`:

```python
def test_curated_tracks_are_the_explicit_track_keys():
    from src.features.track import CURATED_TRACKS, _TRACKS
    assert CURATED_TRACKS == frozenset(_TRACKS)
    assert "Monaco" in CURATED_TRACKS
    assert "Imola" not in CURATED_TRACKS
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_lookup.py tests/test_track.py -v`
Expected: FAIL (`CURATED_TRACKS` missing; `Imola` currently returns 21.0).

- [ ] **Step 3: Add `CURATED_TRACKS` to `src/features/track.py`**

After the `_DEFAULTS` definition (line 38), add:

```python
# The circuits we have a real curated pit-loss for. The _DEFAULTS prior stays as a
# graceful fallback for the FEATURE pipeline, but must NEVER be surfaced to a user
# as a curated fact — lookups guard on this set.
CURATED_TRACKS = frozenset(_TRACKS)
```

- [ ] **Step 4: Add the guard to `src/inference/lookup.py`**

Change the import line:

```python
from src.features.track import CURATED_TRACKS, track_features
```

Replace the `pit_loss` branch (the `if stat == PIT_LOSS:` block) with:

```python
    if stat == PIT_LOSS:
        if gp not in CURATED_TRACKS:
            return {"stat": stat, "gp": gp, "value": None, "units": None,
                    "source": "not available for this circuit"}
        tf = track_features(gp)
        return {"stat": stat, "gp": gp, "value": round(float(tf["pit_loss_s"]), 1),
                "units": "s", "source": "curated track features"}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_lookup.py tests/test_track.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/track.py src/inference/lookup.py tests/test_lookup.py tests/test_track.py
git commit -m "fix: honest pit-loss for non-curated circuits instead of the 21.0 default"
```

---

### Task 2: Race-level dominant stop summary (Python)

Add an additive `dominant` field to `predict_stop_counts` so the StrategyCard can lead with the track-level call without re-deriving it in TypeScript.

**Files:**
- Modify: `src/inference/strategy.py`
- Test: `tests/test_inference_strategy.py`

**Interfaces:**
- Consumes: existing `predict_stop_counts(year, gp, table)`.
- Produces: success payload gains `"dominant": {"n_stops": int, "share": float, "n_drivers": int}`; the two early-return (empty-target / sparse-prior) branches gain `"dominant": None`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_inference_strategy.py`:

```python
def test_dominant_summary_is_modal_stop_count_and_share():
    out = predict_stop_counts(2024, "Bahrain", table=_strategy_table())
    dom = out["dominant"]
    assert dom["n_drivers"] == 4
    assert isinstance(dom["n_stops"], int)
    assert 0.0 <= dom["share"] <= 1.0
    assert dom["share"] == round(dom["share"], 3)
    # all four target drivers are high-deg Bahrain -> model leans the same way
    assert dom["share"] >= 0.5


def test_dominant_is_none_in_sparse_prior_branch():
    one_race = _strategy_table()
    one_race = one_race[one_race["race_id"].isin(["2023-Bahrain", "2024-Bahrain"])]
    out = predict_stop_counts(2024, "Bahrain", table=one_race)
    assert out["qualitative"] is True
    assert out["dominant"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_strategy.py -v`
Expected: FAIL with `KeyError: 'dominant'`.

- [ ] **Step 3: Implement the summary in `src/inference/strategy.py`**

Add the import at the top (with the other imports):

```python
from collections import Counter
```

In the two early returns (empty target at ~line 38 and sparse prior at ~line 45), add `"dominant": None,` to each returned dict.

Replace the final success block (from `drivers = [` to the end) with:

```python
    drivers = [
        {"driver": d, "n_stops": int(p), "confidence": round(float(c), 3)}
        for d, p, c in zip(target["Driver"], preds, conf)
    ]
    pred_counts = Counter(int(p) for p in preds)
    mode_stops, mode_n = pred_counts.most_common(1)[0]
    dominant = {"n_stops": int(mode_stops),
                "share": round(mode_n / len(preds), 3),
                "n_drivers": int(len(preds))}
    return {"year": year, "gp": gp, "qualitative": False, "n_train_races": n_train,
            "sc_caveat": SC_CAVEAT, "dominant": dominant, "drivers": drivers}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_strategy.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/inference/strategy.py tests/test_inference_strategy.py
git commit -m "feat: race-level dominant stop-count summary in predict_stop_counts"
```

---

### Task 3: Team map + attach_teams helper (Python)

The pace/strategy feature tables carry only the driver code, but helmets need year-correct team colour. Build a small `team_map` (pure transform from `season_results`) and a fastf1-free helper that joins team onto a prediction payload at the serverless boundary.

**Files:**
- Modify: `src/store.py` (add `TEAM_MAP` path)
- Modify: `src/pipeline.py` (add `build_team_map`)
- Create: `src/inference/teams.py`
- Test: `tests/test_pipeline.py`, `tests/test_inference_teams.py` (new)

**Interfaces:**
- Consumes: `season_results` table (cols `Driver, team, year, gp` where `gp` is the EventName), `src.calendar.GP_TO_EVENT`.
- Produces:
  - `store.TEAM_MAP = "data/team_map.parquet"`
  - `build_team_map(results: pd.DataFrame, gp_to_event: dict = GP_TO_EVENT) -> pd.DataFrame` with columns `["year", "gp", "Driver", "team"]` keyed on the SHORT gp.
  - `attach_teams(drivers: list[dict], team_map: pd.DataFrame, year: int, gp: str) -> list[dict]` — returns each driver dict with a `"team"` key (string, or `None` if not found).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_inference_teams.py`:

```python
"""Tests for attach_teams — year-correct team enrichment (glyph metadata, M4)."""
import pandas as pd

from src.inference.teams import attach_teams


def _team_map():
    return pd.DataFrame(
        {
            "year": [2024, 2024, 2023],
            "gp": ["Italy", "Italy", "Italy"],
            "Driver": ["VER", "NOR", "VER"],
            "team": ["Red Bull Racing", "McLaren", "Red Bull Racing"],
        }
    )


def test_attach_teams_adds_year_correct_team():
    drivers = [{"driver": "VER", "n_stops": 1}, {"driver": "NOR", "n_stops": 2}]
    out = attach_teams(drivers, _team_map(), 2024, "Italy")
    assert out[0]["team"] == "Red Bull Racing"
    assert out[1]["team"] == "McLaren"
    # original keys preserved
    assert out[0]["n_stops"] == 1


def test_attach_teams_uses_none_when_missing():
    drivers = [{"driver": "HAM"}]
    out = attach_teams(drivers, _team_map(), 2024, "Italy")
    assert out[0]["team"] is None
```

Add to `tests/test_pipeline.py`:

```python
def test_build_team_map_keys_on_short_gp():
    import pandas as pd
    from src.pipeline import build_team_map
    results = pd.DataFrame({
        "Driver": ["VER", "NOR"],
        "team": ["Red Bull Racing", "McLaren"],
        "year": [2024, 2024],
        "gp": ["Italian Grand Prix", "Italian Grand Prix"],
    })
    tm = build_team_map(results)
    assert list(tm.columns) == ["year", "gp", "Driver", "team"]
    assert set(tm["gp"]) == {"Italy"}  # EventName -> short key
    # an event outside GP_TO_EVENT is dropped
    other = pd.DataFrame({"Driver": ["VER"], "team": ["Red Bull Racing"],
                          "year": [2024], "gp": ["Japanese Grand Prix"]})
    assert build_team_map(other).empty
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_teams.py tests/test_pipeline.py::test_build_team_map_keys_on_short_gp -v`
Expected: FAIL (modules/functions missing).

- [ ] **Step 3: Add the store path**

In `src/store.py`, after `PODIUM_TABLE` (line 19) add:

```python
TEAM_MAP = "data/team_map.parquet"
```

- [ ] **Step 4: Add `build_team_map` to `src/pipeline.py`**

Ensure `from src.calendar import GP_TO_EVENT` is imported (it is used by `build_podium_table` already). Add:

```python
def build_team_map(results: pd.DataFrame, gp_to_event: dict = GP_TO_EVENT) -> pd.DataFrame:
    """Year-correct driver->team map keyed on the SHORT gp (glyph metadata, no I/O).

    `results.gp` holds the fastf1 EventName ("Italian Grand Prix"); map it back to the
    short feature-table key ("Italy") and drop events outside the curated slice.
    """
    event_to_gp = {event: short for short, event in gp_to_event.items()}
    tm = results.rename(columns={"gp": "event"})[["year", "event", "Driver", "team"]].copy()
    tm["gp"] = tm["event"].map(event_to_gp)
    tm = tm.dropna(subset=["gp"]).drop_duplicates(subset=["year", "gp", "Driver"])
    return tm[["year", "gp", "Driver", "team"]].reset_index(drop=True)
```

Also wire it into `build_all()` so it persists alongside the others. After the strategy write in `build_all()`:

```python
    results = store.read_table(store.SEASON_RESULTS) if hasattr(store, "SEASON_RESULTS") \
        else pd.read_parquet("data/season_results.parquet")
    store.write_table(build_team_map(results), store.TEAM_MAP)
    logger.info("Wrote %s", store.TEAM_MAP)
```

(If `store.SEASON_RESULTS` does not exist, the `pd.read_parquet` fallback is correct — `data/season_results.parquet` already exists in the repo data dir.)

- [ ] **Step 5: Create `src/inference/teams.py`**

```python
"""attach_teams — year-correct team enrichment for driver glyphs (M4).

Team is glyph METADATA, never a model input, so this join happens at the serverless
boundary (like build_podium_table bakes team into the podium table). fastf1-free and
sklearn-free; pandas only.
"""
from __future__ import annotations

import pandas as pd


def attach_teams(drivers: list[dict], team_map: pd.DataFrame,
                 year: int, gp: str) -> list[dict]:
    """Return each driver dict with a 'team' key (str, or None if unknown)."""
    sub = team_map[(team_map["year"] == year) & (team_map["gp"] == gp)]
    by_code = dict(zip(sub["Driver"], sub["team"]))
    out = []
    for d in drivers:
        team = by_code.get(d["driver"])
        out.append({**d, "team": None if team is None or pd.isna(team) else team})
    return out
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_teams.py tests/test_pipeline.py::test_build_team_map_keys_on_short_gp -v`
Expected: PASS.

- [ ] **Step 7: Keep the no-fastf1 guard honest**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_no_fastf1.py -v`
Expected: PASS (importing `src.inference.teams` pulls only pandas).

- [ ] **Step 8: Commit**

```bash
git add src/store.py src/pipeline.py src/inference/teams.py tests/test_inference_teams.py tests/test_pipeline.py
git commit -m "feat: team_map build + attach_teams helper for glyph team colour"
```

---

### Task 4: Generate & bundle the feature tables

Produce the parquet tables the new serverless fns ship, and register them in `vercel.json`.

**Files:**
- Generate: `data/pace_features.parquet`, `data/strategy_features.parquet`, `data/team_map.parquet`
- Copy: `api/pace_features.parquet`, `api/strategy_features.parquet`, `api/team_map.parquet`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `src.pipeline.build_all` (fastf1 batch, reads the present `cache/` 2023–25), `build_team_map`.
- Produces: bundled parquet tables next to the api fns; `vercel.json` `includeFiles` entries.

- [ ] **Step 1: Build the tables**

Run (uses the local fastf1 `cache/`; may make a few schedule calls):

```bash
PYTHONPATH=. .venv/bin/python -c "from src.pipeline import build_all; build_all()"
```

Expected: writes `data/pace_features.parquet`, `data/strategy_features.parquet`, and `data/team_map.parquet`.

- [ ] **Step 2: Verify the tables have the expected shape**

```bash
PYTHONPATH=. .venv/bin/python -c "
import pandas as pd
p = pd.read_parquet('data/pace_features.parquet'); s = pd.read_parquet('data/strategy_features.parquet'); t = pd.read_parquet('data/team_map.parquet')
print('pace cols', list(p.columns)); print('pace circuits', sorted(p['gp'].unique()))
print('strat cols', list(s.columns)); print('strat circuits', sorted(s['gp'].unique()))
print('team_map cols', list(t.columns)); print('team rows', len(t))
assert {'race_id','year','gp','Driver','race_pace_delta'} <= set(p.columns)
assert {'race_id','year','gp','Driver','n_stops','deg_overall'} <= set(s.columns)
assert list(t.columns) == ['year','gp','Driver','team']
print('OK')
"
```

Expected: prints the 8 dry circuits for both feature tables and `OK`.

- [ ] **Step 3: Copy the tables next to the api fns**

```bash
cp data/pace_features.parquet api/pace_features.parquet
cp data/strategy_features.parquet api/strategy_features.parquet
cp data/team_map.parquet api/team_map.parquet
```

- [ ] **Step 4: Register the bundled files in `vercel.json`**

Replace `vercel.json` with:

```json
{
  "functions": {
    "api/inference.py": {
      "includeFiles": "{src/**,api/strategy_features.parquet}"
    },
    "api/podium.py": {
      "includeFiles": "{src/**,api/podium_features.parquet}"
    },
    "api/pace.py": {
      "includeFiles": "{src/**,api/pace_features.parquet,api/team_map.parquet}"
    },
    "api/strategy.py": {
      "includeFiles": "{src/**,api/strategy_features.parquet,api/team_map.parquet}"
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add -f api/pace_features.parquet api/strategy_features.parquet api/team_map.parquet
git add vercel.json
git commit -m "chore: bundle pace/strategy/team feature tables for the api fns"
```

(`-f` because `data/` is gitignored, but the `api/*.parquet` copies must ship — confirm they are not caught by an `api/` ignore; `api/podium_features.parquet` is already tracked, so the path is clear.)

---

### Task 5: `api/pace.py` serverless function

Per-request Model A inference, enriched with team for the helmets.

**Files:**
- Create: `api/pace.py`
- Test: `tests/test_api_pace.py`

**Interfaces:**
- Consumes: `src.inference.pace.predict_pace_gaps`, `src.inference.teams.attach_teams`, bundled `api/pace_features.parquet` + `api/team_map.parquet`.
- Produces: `pace_response(body: dict) -> tuple[int, dict]`; payload `drivers` each have `{driver, pace_delta_s, uncertainty_s, team}`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_api_pace.py`:

```python
"""Tests for the Vercel Python pace endpoint (M4 live inference)."""
from api.pace import pace_response


def test_pace_2024_italy_returns_ranked_gaps_with_team():
    status, payload = pace_response({"year": 2024, "gp": "Italy"})
    assert status == 200
    assert payload["qualitative"] is False
    assert len(payload["drivers"]) > 0
    top = payload["drivers"][0]
    assert {"driver", "pace_delta_s", "uncertainty_s", "team"} <= set(top)
    # sorted fastest-first (lower delta = faster)
    deltas = [d["pace_delta_s"] for d in payload["drivers"]]
    assert deltas == sorted(deltas)


def test_pace_missing_fields_is_400():
    status, payload = pace_response({"gp": "Italy"})
    assert status == 400
    assert "error" in payload


def test_pace_non_integer_year_is_400():
    status, payload = pace_response({"year": "soon", "gp": "Italy"})
    assert status == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_api_pace.py -v`
Expected: FAIL (`api.pace` missing).

- [ ] **Step 3: Create `api/pace.py`**

```python
# api/pace.py
"""Vercel Python serverless function: live pace-gap inference (M4, Model A — supporting).

Per-request inference: calls src.inference.predict_pace_gaps on the bundled feature
table, then attaches year-correct team for the glyphs. Carries scikit-learn; well under
Vercel's 500MB limit (the batch-only deps fastf1/matplotlib are excluded). Logic lives in
`pace_response`; `handler` is HTTP glue.

Regenerate the bundled tables with:
  PYTHONPATH=. .venv/bin/python -c "from src.pipeline import build_all; build_all()"
  cp data/pace_features.parquet api/ && cp data/team_map.parquet api/
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.inference.pace import predict_pace_gaps  # noqa: E402
from src.inference.teams import attach_teams  # noqa: E402

_TABLE = pd.read_parquet(Path(__file__).with_name("pace_features.parquet"))
_TEAMS = pd.read_parquet(Path(__file__).with_name("team_map.parquet"))


def pace_response(body: dict) -> tuple[int, dict]:
    """Map a request body {year, gp} to (status, json-serializable payload)."""
    year, gp = body.get("year"), body.get("gp")
    if year is None or not gp:
        return 400, {"error": "year and gp are required"}
    try:
        year = int(year)
    except (TypeError, ValueError):
        return 400, {"error": "year must be an integer"}
    payload = predict_pace_gaps(year, gp, table=_TABLE)
    payload["drivers"] = attach_teams(payload["drivers"], _TEAMS, year, gp)
    return 200, payload


class handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            status, payload = 400, {"error": "invalid JSON body"}
        else:
            status, payload = pace_response(body)
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_api_pace.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/pace.py tests/test_api_pace.py
git commit -m "feat: api/pace.py live pace-gap serverless endpoint"
```

---

### Task 6: `api/strategy.py` serverless function

Per-request Model B inference (stop counts + dominant call + SC caveat), team-enriched.

**Files:**
- Create: `api/strategy.py`
- Test: `tests/test_api_strategy.py`

**Interfaces:**
- Consumes: `src.inference.strategy.predict_stop_counts`, `attach_teams`, bundled `api/strategy_features.parquet` + `api/team_map.parquet`.
- Produces: `strategy_response(body: dict) -> tuple[int, dict]`; payload has `dominant`, `sc_caveat`, and `drivers` each `{driver, n_stops, confidence, team}`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_api_strategy.py`:

```python
"""Tests for the Vercel Python strategy endpoint (M4 live inference)."""
from api.strategy import strategy_response


def test_strategy_2024_bahrain_returns_dominant_caveat_and_teams():
    status, payload = strategy_response({"year": 2024, "gp": "Bahrain"})
    assert status == 200
    assert payload["sc_caveat"]  # always present and non-empty
    if payload["qualitative"] is False:
        assert payload["dominant"]["n_drivers"] > 0
        top = payload["drivers"][0]
        assert {"driver", "n_stops", "confidence", "team"} <= set(top)
    else:
        assert payload["dominant"] is None


def test_strategy_missing_fields_is_400():
    status, payload = strategy_response({"gp": "Bahrain"})
    assert status == 400
    assert "error" in payload


def test_strategy_non_integer_year_is_400():
    status, payload = strategy_response({"year": "soon", "gp": "Bahrain"})
    assert status == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_api_strategy.py -v`
Expected: FAIL (`api.strategy` missing).

- [ ] **Step 3: Create `api/strategy.py`**

```python
# api/strategy.py
"""Vercel Python serverless function: live stop-count strategy inference (M4, Model B).

The validated telemetry edge (+0.07 vs track-norm) and the deg->stops explainer hook.
Per-request inference over the bundled strategy table; team attached for the glyphs. The
SC caveat is always present in the payload. Carries scikit-learn; under Vercel's 500MB
limit. Logic lives in `strategy_response`; `handler` is HTTP glue.

Regenerate the bundled tables with:
  PYTHONPATH=. .venv/bin/python -c "from src.pipeline import build_all; build_all()"
  cp data/strategy_features.parquet api/ && cp data/team_map.parquet api/
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.inference.strategy import predict_stop_counts  # noqa: E402
from src.inference.teams import attach_teams  # noqa: E402

_TABLE = pd.read_parquet(Path(__file__).with_name("strategy_features.parquet"))
_TEAMS = pd.read_parquet(Path(__file__).with_name("team_map.parquet"))


def strategy_response(body: dict) -> tuple[int, dict]:
    """Map a request body {year, gp} to (status, json-serializable payload)."""
    year, gp = body.get("year"), body.get("gp")
    if year is None or not gp:
        return 400, {"error": "year and gp are required"}
    try:
        year = int(year)
    except (TypeError, ValueError):
        return 400, {"error": "year must be an integer"}
    payload = predict_stop_counts(year, gp, table=_TABLE)
    payload["drivers"] = attach_teams(payload["drivers"], _TEAMS, year, gp)
    return 200, payload


class handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            status, payload = 400, {"error": "invalid JSON body"}
        else:
            status, payload = strategy_response(body)
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_api_strategy.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/strategy.py tests/test_api_strategy.py
git commit -m "feat: api/strategy.py live stop-count serverless endpoint"
```

---

### Task 7: Extend `api/inference.py` for deg/stint lookups

Serve `tyre_deg` / `stint_length` from the bundled strategy table while keeping the function slim (no sklearn).

**Files:**
- Modify: `api/inference.py`
- Test: `tests/test_api_inference.py`, `tests/test_inference_no_fastf1.py`

**Interfaces:**
- Consumes: `src.inference.lookup.lookup_stat`, bundled `api/strategy_features.parquet`.
- Produces: `lookup_response` now passes the bundled strategy table so deg/stint resolve; pit_loss unchanged (ignores the table).

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_api_inference.py`:

```python
def test_inference_tyre_deg_uses_bundled_strategy_table():
    from api.inference import lookup_response
    status, payload = lookup_response({"stat": "tyre_deg", "gp": "Bahrain"})
    assert status == 200
    assert payload["stat"] == "tyre_deg"
    assert payload["value"] is not None
    assert payload["units"] == "s/lap"


def test_inference_stint_length_returns_laps():
    from api.inference import lookup_response
    status, payload = lookup_response({"stat": "stint_length", "gp": "Spain"})
    assert status == 200
    assert payload["units"] == "laps"
    assert isinstance(payload["value"], int)


def test_inference_pit_loss_non_curated_is_honestly_unavailable():
    from api.inference import lookup_response
    status, payload = lookup_response({"stat": "pit_loss", "gp": "Imola"})
    assert status == 200
    assert payload["value"] is None
```

Add to `tests/test_inference_no_fastf1.py`:

```python
def test_deg_lookup_path_does_not_import_sklearn_or_fastf1():
    # The deg/stint lookup reads the strategy parquet but must stay sklearn/fastf1-free.
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    code = (
        "import sys, pandas as pd\n"
        "from src.inference.lookup import lookup_stat\n"
        "t = pd.DataFrame({'gp':['Bahrain'],'deg_overall':[0.1],'feas_max_stint':[20]})\n"
        "lookup_stat('tyre_deg', 'Bahrain', table=t)\n"
        "bad = [m for m in sys.modules if m.split('.')[0] in ('sklearn', 'fastf1')]\n"
        "assert not bad, bad\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=repo_root, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_api_inference.py tests/test_inference_no_fastf1.py -v`
Expected: deg/stint tests FAIL (the fn does not pass a table, so `store.read_table` looks for a non-bundled path / returns empty → value None).

- [ ] **Step 3: Bundle the strategy table and pass it through**

In `api/inference.py`, add `pathlib` + pandas imports and load the table at cold start; pass it to `lookup_stat`. Replace the import block and `lookup_response`:

```python
from pathlib import Path

import pandas as pd

# Make `src` importable when Vercel runs this file as a standalone script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.inference.lookup import lookup_stat  # noqa: E402

# Strategy feature table for tyre_deg / stint_length lookups (pit_loss ignores it).
_STRATEGY = pd.read_parquet(Path(__file__).with_name("strategy_features.parquet"))


def lookup_response(body: dict) -> tuple[int, dict]:
    """Map a request body to (status, json-serializable payload)."""
    stat, gp = body.get("stat"), body.get("gp")
    if not stat or not gp:
        return 400, {"error": "stat and gp are required"}
    try:
        return 200, lookup_stat(stat, gp, table=_STRATEGY)
    except ValueError as exc:
        return 400, {"error": str(exc)}
```

(Update the module docstring's slim-deps note to mention `src/inference/__init__.py` is already lazy, so this path stays sklearn-free even though it now reads a parquet.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_api_inference.py tests/test_inference_no_fastf1.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/inference.py tests/test_api_inference.py tests/test_inference_no_fastf1.py
git commit -m "feat: serve tyre_deg/stint_length lookups from the bundled strategy table"
```

---

### Task 8: Circuit normalization for the lookup path (TS)

Route lookups through normalization (so "Monza" → Italy resolves) and add Monaco for pit-loss.

**Files:**
- Modify: `app/lib/circuits.ts`
- Test: `app/lib/circuits.test.ts`

**Interfaces:**
- Consumes: existing `normalizeCircuit` cleaning logic.
- Produces: `normalizeLookupCircuit(raw: string | undefined, stat: string): string | null` — resolves to a canonical key; pit_loss accepts the 9 curated circuits (8 + Monaco), tyre_deg/stint_length accept only the 8.

- [ ] **Step 1: Write the failing tests**

Add to `app/lib/circuits.test.ts`:

```ts
import { normalizeLookupCircuit } from "./circuits";

describe("normalizeLookupCircuit", () => {
  it("resolves aliases for pit_loss including Monaco", () => {
    expect(normalizeLookupCircuit("Monaco", "pit_loss")).toBe("Monaco");
    expect(normalizeLookupCircuit("Monza", "pit_loss")).toBe("Italy");
  });

  it("excludes Monaco for deg/stint (strategy-table circuits only)", () => {
    expect(normalizeLookupCircuit("Monaco", "tyre_deg")).toBeNull();
    expect(normalizeLookupCircuit("Bahrain", "stint_length")).toBe("Bahrain");
  });

  it("returns null for an unknown circuit", () => {
    expect(normalizeLookupCircuit("Narnia", "pit_loss")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- circuits`
Expected: FAIL (`normalizeLookupCircuit` is not exported).

- [ ] **Step 3: Refactor the cleaning into a helper and add the lookup normalizer**

In `app/lib/circuits.ts`, extract the cleaning logic and add the new export. Replace the body of `normalizeCircuit` and append:

```ts
function clean(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ")
    .trim();
}

/** Free-text circuit name → canonical podium-table key, or null if not one of the 8. */
export function normalizeCircuit(raw: string | undefined): string | null {
  if (!raw) return null;
  return ALIASES[clean(raw)] ?? null;
}

// Pit-loss is curated for the 8 podium circuits PLUS Monaco; deg/stint only have data
// for the 8 strategy-table circuits.
const LOOKUP_ALIASES: Record<string, string> = {
  ...ALIASES,
  monaco: "Monaco",
  "monte carlo": "Monaco",
};

/** Free-text circuit → canonical key for a lookup_stat, scoped by stat, or null. */
export function normalizeLookupCircuit(
  raw: string | undefined,
  stat: string,
): string | null {
  if (!raw) return null;
  const c = LOOKUP_ALIASES[clean(raw)] ?? null;
  if (!c) return null;
  if (stat === "pit_loss") return c; // 8 + Monaco
  return c === "Monaco" ? null : c; // deg / stint: strategy-table 8 only
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- circuits`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/circuits.ts app/lib/circuits.test.ts
git commit -m "feat: scoped lookup circuit normalization (Monza->Italy, Monaco for pit-loss)"
```

---

### Task 9: Pace + strategy narrative generators (TS)

Grounded, honest narrators for the two new answers.

**Files:**
- Modify: `app/lib/narrative.ts`
- Test: `app/lib/narrative.test.ts`

**Interfaces:**
- Consumes: `HAIKU`, `LlmClient`.
- Produces: types `PaceDriver`, `PaceFacts`, `StrategyDriver`, `StrategyFacts`; `generatePaceNarrative(client, facts)`, `generateStrategyNarrative(client, facts)`.

- [ ] **Step 1: Write the failing test**

Look at the existing `app/lib/narrative.test.ts` for the fake-client pattern, then add:

```ts
import { generatePaceNarrative, generateStrategyNarrative, type PaceFacts, type StrategyFacts } from "./narrative";

const fakeClient = (text: string) => ({
  messages: { create: async () => ({ content: [{ type: "text", text }] }) },
}) as any;

const PACE: PaceFacts = {
  year: 2024, gp: "Italy", qualitative: false, n_train_races: 12,
  drivers: [{ driver: "NOR", team: "McLaren", pace_delta_s: -0.21, uncertainty_s: 0.08 }],
};

const STRATEGY: StrategyFacts = {
  year: 2024, gp: "Bahrain", qualitative: false, n_train_races: 12,
  sc_caveat: "Stop-count edge is measured on a dry, safety-car-clean backtest…",
  dominant: { n_stops: 2, share: 0.75, n_drivers: 20 },
  drivers: [{ driver: "VER", team: "Red Bull Racing", n_stops: 2, confidence: 0.7 }],
};

describe("generatePaceNarrative", () => {
  it("returns the model's text", async () => {
    const out = await generatePaceNarrative(fakeClient("NOR holds a small long-run edge."), PACE);
    expect(out).toBe("NOR holds a small long-run edge.");
  });
});

describe("generateStrategyNarrative", () => {
  it("returns the model's text", async () => {
    const out = await generateStrategyNarrative(fakeClient("Bahrain leans two-stop."), STRATEGY);
    expect(out).toBe("Bahrain leans two-stop.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- narrative`
Expected: FAIL (functions/types missing).

- [ ] **Step 3: Add the types and generators to `app/lib/narrative.ts`**

Append:

```ts
export type PaceDriver = { driver: string; team: string | null; pace_delta_s: number; uncertainty_s: number };

export type PaceFacts = {
  year: number;
  gp: string;
  qualitative: boolean;
  n_train_races?: number;
  reason?: string;
  drivers: PaceDriver[];
};

const PACE_SYSTEM = [
  "You write a two-sentence, honest explanation of a Formula 1 long-run PACE-GAP estimate.",
  "You may use ONLY the facts in the JSON the user provides (driver codes, pace_delta_s where lower = faster, and uncertainty_s).",
  "This is SUPPORTING CONTEXT about long-run pace gaps and how confident we are — it is NOT a podium or race-result prediction. Never say who will finish where.",
  "Name the few fastest drivers by three-letter code and describe the gap in seconds and the uncertainty. Do not invent drivers, teams, numbers, causes, or comparisons not in the JSON.",
  "If the JSON has no drivers (a qualitative/low-data state), say plainly there isn't enough data for this weekend yet.",
].join(" ");

export async function generatePaceNarrative(client: LlmClient, facts: PaceFacts): Promise<string> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 220,
    system: PACE_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  return msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}

export type StrategyDriver = { driver: string; team: string | null; n_stops: number; confidence: number };

export type StrategyFacts = {
  year: number;
  gp: string;
  qualitative: boolean;
  n_train_races?: number;
  reason?: string;
  sc_caveat: string;
  dominant: { n_stops: number; share: number; n_drivers: number } | null;
  drivers: StrategyDriver[];
};

const STRATEGY_SYSTEM = [
  "You write a two-to-three-sentence, honest explanation of a Formula 1 STOP-COUNT strategy prediction.",
  "You may use ONLY the facts in the JSON the user provides (the dominant stop call, per-driver n_stops + confidence, and sc_caveat).",
  "Lead with the race-level / track-level call from `dominant` (e.g. mostly a one- or two-stop here) — strategy is driven more by the track and conditions than by individual teams, so keep per-driver detail secondary.",
  "Explain the teachable mechanism: higher tyre degradation pushes toward MORE stops. You MUST mention the safety-car caveat from sc_caveat.",
  "Do not invent drivers, teams, numbers, causes, or comparisons not in the JSON. Speak in terms of likelihood, never certainty.",
  "If the JSON has no drivers / dominant is null (a low-data state), say plainly there isn't enough data for this weekend yet.",
].join(" ");

export async function generateStrategyNarrative(client: LlmClient, facts: StrategyFacts): Promise<string> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 260,
    system: STRATEGY_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  return msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- narrative`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/narrative.ts app/lib/narrative.test.ts
git commit -m "feat: grounded pace + strategy narrative generators"
```

---

### Task 10: Orchestrator branches for pace, strategy, deg/stint (TS)

Route the new intents and the extended lookups through `answerQuery`.

**Files:**
- Modify: `app/lib/orchestrate.ts`
- Test: `app/lib/orchestrate.test.ts`

**Interfaces:**
- Consumes: `normalizeCircuit`, `normalizeLookupCircuit`, `PaceFacts`, `StrategyFacts`, `StatFacts`.
- Produces: `AnswerDeps` gains `predictPace`, `narratePace`, `predictStrategy`, `narrateStrategy`; `lookup`/`narrate` now also serve tyre_deg/stint_length; `Answer` union gains `{ supported: true; pace: PaceFacts; narrative }` and `{ supported: true; strategy: StrategyFacts; narrative }`.

- [ ] **Step 1: Write the failing tests**

Add to `app/lib/orchestrate.test.ts` (extend the `deps` factory with the new deps first):

```ts
// In the deps() factory add these defaults:
//   predictPace: async () => PACE,
//   narratePace: async () => "NOR holds a small long-run edge.",
//   predictStrategy: async () => STRATEGY,
//   narrateStrategy: async () => "Bahrain leans two-stop.",
// with PACE / STRATEGY fixtures imported from ./narrative types.

it("routes a pace question to a supported pace answer (normalizing the circuit)", async () => {
  let askedGp = "";
  const out = await answerQuery(
    deps({
      parse: async () => ({ intent: "predict_pace", gp: "Monza", year: 2024 }),
      predictPace: async (_y, gp) => { askedGp = gp; return PACE; },
    }),
    "long run pace at Monza 2024?",
  );
  expect(askedGp).toBe("Italy");
  expect(out.supported).toBe(true);
  if (out.supported && "pace" in out) expect(out.narrative).toMatch(/long-run/);
});

it("routes a strategy question to a supported strategy answer", async () => {
  const out = await answerQuery(
    deps({ parse: async () => ({ intent: "predict_strategy", gp: "Bahrain", year: 2024 }) }),
    "how many stops at Bahrain 2024?",
  );
  expect(out.supported).toBe(true);
  if (out.supported && "strategy" in out) expect(out.strategy.sc_caveat).toBeTruthy();
});

it("routes a tyre-deg lookup through the lookup path", async () => {
  let askedStat = "";
  const out = await answerQuery(
    deps({
      parse: async () => ({ intent: "lookup_stat", stat: "tyre_deg", gp: "Bahrain" }),
      lookup: async (stat) => { askedStat = stat; return { stat, gp: "Bahrain", value: 0.12, units: "s/lap", source: "FP long-run Theil-Sen deg" }; },
    }),
    "how fast do tyres wear at Bahrain?",
  );
  expect(askedStat).toBe("tyre_deg");
  expect(out.supported).toBe(true);
});

it("rejects a deg lookup for Monaco (not in the strategy slice)", async () => {
  let called = false;
  const out = await answerQuery(
    deps({
      parse: async () => ({ intent: "lookup_stat", stat: "tyre_deg", gp: "Monaco" }),
      lookup: async () => { called = true; return FACTS; },
    }),
    "tyre deg at Monaco?",
  );
  expect(out.supported).toBe(false);
  expect(called).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- orchestrate`
Expected: FAIL (new deps/branches missing).

- [ ] **Step 3: Rewrite `app/lib/orchestrate.ts`**

```ts
import type { ParsedQuery } from "./parser";
import type { StatFacts, PodiumFacts, PaceFacts, StrategyFacts } from "./narrative";
import { normalizeCircuit, normalizeLookupCircuit } from "./circuits";

// Year used when a prediction question names no season. 2024 has all 8 circuits with a
// real (non-warmup) prediction, so it's the safest default for this historical slice.
const DEFAULT_YEAR = 2024;
const LOOKUP_STATS = ["pit_loss", "tyre_deg", "stint_length"];

export type AnswerDeps = {
  parse: (query: string) => Promise<ParsedQuery>;
  lookup: (stat: string, gp: string) => Promise<StatFacts>;
  narrate: (facts: StatFacts) => Promise<string>;
  predictPodium: (year: number, gp: string) => Promise<PodiumFacts>;
  narratePodium: (facts: PodiumFacts) => Promise<string>;
  predictPace: (year: number, gp: string) => Promise<PaceFacts>;
  narratePace: (facts: PaceFacts) => Promise<string>;
  predictStrategy: (year: number, gp: string) => Promise<StrategyFacts>;
  narrateStrategy: (facts: StrategyFacts) => Promise<string>;
};

export type Answer =
  | { supported: true; facts: StatFacts; narrative: string }
  | { supported: true; podium: PodiumFacts; narrative: string }
  | { supported: true; pace: PaceFacts; narrative: string }
  | { supported: true; strategy: StrategyFacts; narrative: string }
  | { supported: false; message: string };

const UNSUPPORTED =
  "Try a podium prediction (e.g. “Who’s likely to podium at the 2024 Italian Grand Prix?”), " +
  "long-run pace gaps, a stop-count strategy call, or a stat lookup (pit-lane time loss, tyre " +
  "degradation, or stint length) for one of the supported circuits.";

const unsupportedSlice = (raw: string) =>
  `Predictions cover these 8 circuits for 2024–25: Bahrain, Saudi Arabia, Spain, Hungary, ` +
  `Italy, Mexico City, Las Vegas, Abu Dhabi. “${raw}” isn’t one of them yet.`;

const unsupportedLookup = (raw: string) =>
  `That stat isn’t available for “${raw}” yet — supported circuits are the 8 dry-weekend ` +
  `tracks (plus Monaco for pit-lane time loss).`;

export async function answerQuery(deps: AnswerDeps, query: string): Promise<Answer> {
  const parsed = await deps.parse(query);

  if (parsed.intent === "lookup_stat" && parsed.stat && LOOKUP_STATS.includes(parsed.stat) && parsed.gp) {
    const gp = normalizeLookupCircuit(parsed.gp, parsed.stat);
    if (!gp) return { supported: false, message: unsupportedLookup(parsed.gp) };
    const facts = await deps.lookup(parsed.stat, gp);
    const narrative = await deps.narrate(facts);
    return { supported: true, facts, narrative };
  }

  if (parsed.intent === "predict_podium" && parsed.gp) {
    const gp = normalizeCircuit(parsed.gp);
    if (!gp) return { supported: false, message: unsupportedSlice(parsed.gp) };
    const podium = await deps.predictPodium(parsed.year ?? DEFAULT_YEAR, gp);
    const narrative = await deps.narratePodium(podium);
    return { supported: true, podium, narrative };
  }

  if (parsed.intent === "predict_pace" && parsed.gp) {
    const gp = normalizeCircuit(parsed.gp);
    if (!gp) return { supported: false, message: unsupportedSlice(parsed.gp) };
    const pace = await deps.predictPace(parsed.year ?? DEFAULT_YEAR, gp);
    const narrative = await deps.narratePace(pace);
    return { supported: true, pace, narrative };
  }

  if (parsed.intent === "predict_strategy" && parsed.gp) {
    const gp = normalizeCircuit(parsed.gp);
    if (!gp) return { supported: false, message: unsupportedSlice(parsed.gp) };
    const strategy = await deps.predictStrategy(parsed.year ?? DEFAULT_YEAR, gp);
    const narrative = await deps.narrateStrategy(strategy);
    return { supported: true, strategy, narrative };
  }

  return { supported: false, message: UNSUPPORTED };
}
```

Note: the existing test `returns an honest unsupported message for other intents` uses intent `predict_pace` with NO gp — it still falls through to `UNSUPPORTED` (no gp), so update that test's assertion from `/pit-lane/i` to `/stat lookup/i` or `/podium/i` to match the new copy. The `does not call lookup` test (intent `explain_concept`) stays valid.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- orchestrate`
Expected: PASS (fix the one copy assertion noted above if it fails).

- [ ] **Step 5: Commit**

```bash
git add app/lib/orchestrate.ts app/lib/orchestrate.test.ts
git commit -m "feat: orchestrate pace/strategy intents + deg/stint lookups"
```

---

### Task 11: Tighten parser tool descriptions (TS)

Help Haiku route the new query shapes reliably. No schema change (intents/stats already exist).

**Files:**
- Modify: `app/lib/parser.ts:13-49`
- Test: `app/lib/parser.test.ts`

**Interfaces:**
- Consumes/Produces: unchanged `ParsedQuery`; only `description` strings change.

- [ ] **Step 1: Add an assertion the descriptions mention the new routing**

Add to `app/lib/parser.test.ts`:

```ts
import { ROUTE_TOOL } from "./parser";

it("documents pace, strategy, and deg/stint routing in the tool schema", () => {
  const props: any = ROUTE_TOOL.input_schema.properties;
  expect(props.intent.description).toMatch(/predict_strategy/);
  expect(props.stat.description).toMatch(/tyre_deg/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- parser`
Expected: FAIL (descriptions don't yet mention these).

- [ ] **Step 3: Update the descriptions in `app/lib/parser.ts`**

Set the `intent` description to:

```ts
        description:
          "predict_podium for who-will-finish-on-the-podium / top-3 / who-will-win. " +
          "predict_pace for long-run / race-pace gap questions (who is fastest over a stint). " +
          "predict_strategy for how-many-pit-stops / one-stop-or-two questions. " +
          "lookup_stat for a single computed circuit stat. explain_concept for 'what is …' questions.",
```

Set the `stat` description to:

```ts
        description:
          "For lookup_stat only: pit_loss (pit-lane time loss), tyre_deg (how fast tyres wear), " +
          "or stint_length (how many laps a stint lasts).",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- parser`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/parser.ts app/lib/parser.test.ts
git commit -m "feat: parser tool descriptions for pace/strategy/deg routing"
```

---

### Task 12: Wire the new endpoints in the ask route (TS)

Dispatch each new intent to its Python fn from the Next server.

**Files:**
- Modify: `app/api/ask/route.ts`

**Interfaces:**
- Consumes: `answerQuery` (new deps), the narrative generators, the Python fns `/api/pace`, `/api/strategy`, `/api/inference`.
- Produces: a fully wired `/api/ask` for all M4 intents.

- [ ] **Step 1: Update `app/api/ask/route.ts`**

Add the imports:

```ts
import {
  generateNarrative,
  generatePodiumNarrative,
  generatePaceNarrative,
  generateStrategyNarrative,
  type StatFacts,
  type PodiumFacts,
  type PaceFacts,
  type StrategyFacts,
} from "@/app/lib/narrative";
```

Add a small helper above `POST` to DRY the per-fn fetch:

```ts
async function postJson<T>(origin: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return (await res.json()) as T;
}
```

Extend the `answerQuery` deps object with the new entries (keep the existing `lookup`, `narrate`, `predictPodium`, `narratePodium`):

```ts
        predictPace: (year, gp) => postJson<PaceFacts>(origin, "/api/pace", { year, gp }),
        narratePace: (facts) => generatePaceNarrative(client, facts),
        predictStrategy: (year, gp) => postJson<StrategyFacts>(origin, "/api/strategy", { year, gp }),
        narrateStrategy: (facts) => generateStrategyNarrative(client, facts),
```

(Optionally refactor the existing `lookup`/`predictPodium` to use `postJson` for consistency — same behavior.)

- [ ] **Step 2: Verify the build typechecks**

Run: `npm run build`
Expected: clean build (no TS errors).

- [ ] **Step 3: Commit**

```bash
git add app/api/ask/route.ts
git commit -m "feat: dispatch pace/strategy endpoints from /api/ask"
```

---

### Task 13: PaceCard + StrategyCard rendering (TS)

Render the two new answers through the glyph system. StrategyCard leads with the race-level call, then the deg→stops narrative, then the SC caveat, then secondary per-driver detail.

**Files:**
- Modify: `app/page.tsx`
- Test: `app/page.test.tsx` (create if absent) — light render smoke via the card functions, OR rely on `npm run build` + the live check in Task 14 if the project has no component test harness. Check for an existing `*.test.tsx` first.

**Interfaces:**
- Consumes: `Answer` union (now with `pace` / `strategy`), `AsciiGlyph`, `TyreSpinner` (tyre motif), `PaceFacts`, `StrategyFacts`.
- Produces: `PaceCard`, `StrategyCard` components + render branches in `Home`.

- [ ] **Step 1: Add the type imports in `app/page.tsx`**

```ts
import type { PodiumFacts, StatFacts, PaceFacts, StrategyFacts } from "@/app/lib/narrative";
```

- [ ] **Step 2: Add the `PaceCard` component**

Place near `PodiumLineup`:

```tsx
/** Pace-gap answer: ranked helmets fastest-first with delta + uncertainty. Supporting, not a podium. */
function PaceCard({ pace, narrative }: { pace: PaceFacts; narrative: string }) {
  return (
    <div className="fog-in flex flex-col items-center gap-9 text-center">
      <div className={`font-pixel-serif text-sm tracking-[0.12em] text-muted ${LEGIBLE} px-3 py-1`}>
        {pace.year} {pace.gp} · long-run pace gaps
      </div>
      {pace.drivers.length > 0 ? (
        <div className="flex items-end justify-center gap-6 sm:gap-10">
          {pace.drivers.slice(0, 5).map((d) => (
            <div key={d.driver} className="flex flex-col items-center gap-1.5">
              <AsciiGlyph code={d.driver} team={d.team} size={88} />
              <div className="mt-2 font-grotesk text-lg font-bold tracking-wide text-ink">{d.driver}</div>
              <div className="font-mono text-[11px] text-muted">
                {d.pace_delta_s > 0 ? "+" : ""}{d.pace_delta_s}s ±{d.uncertainty_s}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted">{pace.reason ?? "Not enough data for this weekend yet."}</p>
      )}
      <p className={`max-w-xl font-lastik text-lg leading-relaxed text-ink/90 ${LEGIBLE} px-4 py-2`}>{narrative}</p>
      <p className={`max-w-md font-grotesk text-[11px] text-muted ${LEGIBLE} px-3 py-1.5`}>
        Supporting context — long-run pace gaps and their uncertainty, not a podium or result prediction
        {typeof pace.n_train_races === "number" && ` · trained on ${pace.n_train_races} prior weekends`}.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Add the `StrategyCard` component**

```tsx
/** Strategy answer: race-level stop call first, then deg->stops narrative, SC caveat, secondary per-driver. */
function StrategyCard({ strategy, narrative }: { strategy: StrategyFacts; narrative: string }) {
  const dom = strategy.dominant;
  return (
    <div className="fog-in flex flex-col items-center gap-7 text-center">
      <div className={`font-pixel-serif text-sm tracking-[0.12em] text-muted ${LEGIBLE} px-3 py-1`}>
        {strategy.year} {strategy.gp} · stop-count strategy
      </div>
      {dom ? (
        <div className={`font-pixel-serif text-5xl font-bold tracking-tight text-ink ${LEGIBLE} px-5 py-2`}>
          Mostly a {dom.n_stops}-stop
          <span className="ml-2 align-middle font-mono text-base text-muted">
            {Math.round(dom.share * 100)}% of the grid
          </span>
        </div>
      ) : (
        <p className="text-muted">{strategy.reason ?? "Not enough data for this weekend yet."}</p>
      )}
      <p className={`max-w-xl font-lastik text-lg leading-relaxed text-ink/90 ${LEGIBLE} px-4 py-2`}>{narrative}</p>
      <p className={`max-w-lg font-grotesk text-[11px] text-amber-700 ${LEGIBLE} px-3 py-1.5`}>{strategy.sc_caveat}</p>
      {strategy.drivers.length > 0 && (
        <details className="mt-1 w-full max-w-lg text-center">
          <summary className="cursor-pointer font-grotesk text-[11px] uppercase tracking-wide text-muted">
            Per-driver detail
          </summary>
          <div className="mt-4 flex flex-wrap items-end justify-center gap-5">
            {strategy.drivers.map((d) => (
              <div key={d.driver} className="flex flex-col items-center gap-1">
                <AsciiGlyph code={d.driver} team={d.team} size={64} />
                <div className="font-grotesk text-sm font-bold text-ink">{d.driver}</div>
                <div className="font-mono text-[11px] text-muted">{d.n_stops}-stop · {Math.round(d.confidence * 100)}%</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
```

(The tyre-count motif may reuse the `TyreSpinner` tyre drawing in a later polish pass; the per-driver `n_stops` label is sufficient and honest for M4.)

- [ ] **Step 4: Add the render branches in `Home`**

After the existing `"podium" in answer` branch, add:

```tsx
        {answer && "supported" in answer && answer.supported && "pace" in answer && (
          <PaceCard pace={answer.pace} narrative={answer.narrative} />
        )}
        {answer && "supported" in answer && answer.supported && "strategy" in answer && (
          <StrategyCard strategy={answer.strategy} narrative={answer.narrative} />
        )}
```

- [ ] **Step 5: Add example chips for the new query types**

In the `EXAMPLES` array in `app/page.tsx`, add:

```ts
  "Stop strategy for the 2024 Bahrain Grand Prix",
  "Long-run pace at the 2024 Spanish Grand Prix",
  "How fast do tyres wear at Bahrain?",
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 7: Run the full JS test suite**

Run: `npm run test`
Expected: all vitest pass.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "feat: PaceCard + StrategyCard rendering through the glyph system"
```

---

### Task 14: Full verification + live preview deploy

The Next↔Python hop is NOT testable under `vercel dev` (Next owns `/api/*`), so verify on a real Vercel branch preview (per the M2 finding).

**Files:** none (verification only).

- [ ] **Step 1: Run the full Python + JS suites green**

Run: `PYTHONPATH=. .venv/bin/python -m pytest -q`
Run: `npm run test`
Run: `npm run build`
Expected: all green, clean build. Confirm the trust anchor still holds:
`PYTHONPATH=. .venv/bin/python notebooks/06_strategy_compound.py` still reports the +0.07 stop-count edge.

- [ ] **Step 2: Deploy a preview**

Deploy to a Vercel preview (the owner runs the deploy / or via the Vercel MCP). Ensure `ANTHROPIC_API_KEY` is set on the **Preview** environment (per-environment; redeploy after adding — existing deploys don't pick up new vars).

- [ ] **Step 3: Verify each Python endpoint returns 200 on the preview**

```bash
BASE=<preview-url>
curl -s -X POST $BASE/api/pace -H 'content-type: application/json' -d '{"year":2024,"gp":"Italy"}' | head -c 400
curl -s -X POST $BASE/api/strategy -H 'content-type: application/json' -d '{"year":2024,"gp":"Bahrain"}' | head -c 400
curl -s -X POST $BASE/api/inference -H 'content-type: application/json' -d '{"stat":"tyre_deg","gp":"Bahrain"}' | head -c 200
curl -s -X POST $BASE/api/inference -H 'content-type: application/json' -d '{"stat":"pit_loss","gp":"Imola"}' | head -c 200
```

Expected: pace → ranked drivers with `team`; strategy → `dominant` + `sc_caveat` + drivers with `team`; tyre_deg → a value in s/lap; Imola pit_loss → `"value": null`, source "not available for this circuit".

- [ ] **Step 4: Verify end-to-end through `/api/ask`**

```bash
curl -s -X POST $BASE/api/ask -H 'content-type: application/json' -d '{"query":"long run pace at the 2024 Italian Grand Prix"}' | head -c 500
curl -s -X POST $BASE/api/ask -H 'content-type: application/json' -d '{"query":"how many stops at Bahrain 2024"}' | head -c 500
curl -s -X POST $BASE/api/ask -H 'content-type: application/json' -d '{"query":"how fast do tyres wear at Monza"}' | head -c 300
```

Expected: pace + strategy supported answers with grounded narratives; the deg query resolves Monza→Italy and returns a value. Open the preview in a browser and confirm PaceCard + StrategyCard render (helmets with team colour, legible codes, dominant call first, SC caveat visible).

- [ ] **Step 5: Update the handoff**

Append M4 status to `handoff.md` (shipped capabilities, the team_map addition, the three-fn layout, the honesty fix, any deferrals). Commit:

```bash
git add handoff.md
git commit -m "docs: M4 telemetry differentiators shipped + verified on preview"
```

- [ ] **Step 6: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to merge `m4-telemetry-differentiators` (PR or `--no-ff` per the project's convention) once the owner approves the preview.

---

## Self-Review notes

- **Spec coverage:** pace card (Tasks 5,9,10,11,12,13) ✓; stop-count strategy w/ race-level lead + deg→stops + SC caveat (Tasks 2,6,9,13) ✓; deg/stint lookups (Tasks 7,8,10,11) ✓; pit-loss honesty fix (Tasks 1,8,10) ✓; team colour for non-podium helmets (Task 3) ✓; three-fn layout + tables + vercel.json (Tasks 4,5,6,7) ✓; live verification (Task 14) ✓.
- **Invariants:** no-fastf1 / no-sklearn guards extended (Task 7); training path unchanged (callables already use `store.prior_weekends`); rounding done in callables + cards; motion/`prefers-reduced-motion` unchanged (cards reuse existing `fog-in`/glyph behavior).
- **Type consistency:** `PaceFacts`/`StrategyFacts`/`StrategyDriver` defined in Task 9 are consumed unchanged in Tasks 10/12/13; `attach_teams` signature defined in Task 3 is used identically in Tasks 5/6; `normalizeLookupCircuit(raw, stat)` defined in Task 8 is used in Task 10.
