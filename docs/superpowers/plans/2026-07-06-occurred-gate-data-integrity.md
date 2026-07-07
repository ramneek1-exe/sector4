# Occurred-gate + Sprint-in-standings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop fastf1's future-session leak at the two load chokepoints (date-gate), fold sprint points into championship standings, retire the per-table boundary guards, and verify with a build-time assertion + clean rebuild.

**Architecture:** A single date-gate helper (`session_in_future`) guards `load_session` (laps) and `load_season_results` (results), so no build ever ingests an un-raced session. Sprint points are added in `load_season_results`. The now-unnecessary runtime guards (`_has_raced`, `_race_concluded`) are removed and replaced by a build-time assertion that fails R17 if any un-raced row slips through. All shipped together (one PR) so there is never a leaked-table-without-guard window.

**Tech Stack:** Python (pandas, fastf1), pytest; the Vercel Python `/api/` functions; `scripts/build_2026.py` (R17 batch build).

## Global Constraints

- **Every feature table is race-gated** — all builds require the race session; gating the race removes the un-raced target from every table uniformly. Upcoming podium still works via `predict_upcoming_podium`; upcoming strategy correctly falls to the historical norm (a true pre-race Model-B prediction is a separate future slice, out of scope).
- **Form stays main-race-only** — sprint points feed championship `points` only; `finish_pos` (feeding `form_finish_avg3`) stays the race finish.
- **Guard removal ships with the clean rebuild** — same PR, no leaked-table-without-guard window.
- **Fail-safe** — the build-time assertion RAISES on a leak (R17 fails loudly; stale-but-clean beats fresh-but-leaked).
- **Round every number that reaches output** (house rule; unchanged here — points are integers/floats from fastf1).
- **No changes** to the podium/strategy/compound models or their features (only the `points` input value shifts by adding sprint points), R17's schedule/calendar derivation, the cron, or the frontend.

---

### Task 1: `session_in_future` date-gate helper + `load_session` gate

**Files:**
- Modify: `src/data/load.py`
- Test: `tests/test_load_gate.py` (create)

**Interfaces:**
- Produces: `session_in_future(dt, now=None) -> bool` (dt: a session datetime or None; now: optional naive/aware UTC for tests). `load_session(year, gp, session, **kw)` returns `None` for a future-dated session.

- [ ] **Step 1: Write the failing test**

Create `tests/test_load_gate.py`:

```python
from datetime import datetime, timezone

import pandas as pd

import src.data.load as load
from src.data.load import session_in_future


NOW = datetime(2026, 7, 6, tzinfo=timezone.utc)


def test_session_in_future_gates_only_future_dates():
    assert session_in_future(pd.Timestamp("2026-07-19 13:00"), now=NOW) is True   # future race
    assert session_in_future(pd.Timestamp("2026-07-05 14:00"), now=NOW) is False  # already run
    assert session_in_future(None, now=NOW) is False                              # unknown -> not gated
    assert session_in_future(pd.NaT, now=NOW) is False


def test_session_in_future_normalizes_tz_aware_dates():
    aware = pd.Timestamp("2026-07-19 13:00", tz="UTC")
    assert session_in_future(aware, now=NOW) is True


class _FakeSession:
    def __init__(self, date):
        self.date = date
        self.loaded = False

    def load(self, **kw):
        self.loaded = True
        # a leaked future session would still expose laps here
        self.laps = pd.DataFrame({"Driver": ["VER"]})


def test_load_session_skips_a_future_dated_session(monkeypatch):
    fake = _FakeSession(pd.Timestamp("2999-01-01 00:00"))
    monkeypatch.setattr(load.fastf1, "get_session", lambda *a, **k: fake)
    out = load.load_session(2026, "Belgium", "R")
    assert out is None
    assert fake.loaded is False  # gated BEFORE loading the leaked data
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_load_gate.py -q`
Expected: FAIL — `session_in_future` not defined.

- [ ] **Step 3: Implement in `src/data/load.py`**

Add the helper (near the top, after imports) and the gate inside `load_session`. Add `from datetime import datetime, timezone` to the imports if absent.

```python
def _to_naive_utc(ts) -> pd.Timestamp:
    t = pd.Timestamp(ts)
    return t.tz_convert("UTC").tz_localize(None) if t.tzinfo is not None else t


def session_in_future(dt, now=None) -> bool:
    """True when a session's scheduled datetime is later than `now` (UTC).

    fastf1 exposes future/other sessions and returns leaked laps for them, so a date check
    is the only safe occurred-gate. Unknown dates (None/NaT) are NOT gated (fall through to
    the existing no-laps check).
    """
    if dt is None or pd.isna(dt):
        return False
    if now is None:
        now = datetime.now(timezone.utc)
    return _to_naive_utc(dt) > _to_naive_utc(now)
```

In `load_session`, insert the gate right after `s = fastf1.get_session(...)` and BEFORE `s.load(...)`:

```python
        s = fastf1.get_session(year, gp, session)
        if session_in_future(getattr(s, "date", None)):
            logger.info("Skipping %s %s %s: session not yet held (future date)", year, gp, session)
            return None
        s.load(**kwargs)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_load_gate.py -q`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/load.py tests/test_load_gate.py
git commit -m "feat: date-gate load_session against fastf1 future-session leaks"
```

---

### Task 2: `load_season_results` date-gate + sprint points

**Files:**
- Modify: `src/data/results.py`
- Test: `tests/test_results_sprint.py` (create)

**Interfaces:**
- Consumes: `session_in_future` (Task 1).
- Produces: `_sprint_points(year, rnd) -> dict[str, float]` (driver→sprint points, `{}` if no sprint / not yet held); `load_season_results` skips future rounds and adds sprint points to `points`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_results_sprint.py`:

```python
import pandas as pd

import src.data.results as results


class _FakeSession:
    def __init__(self, date, res):
        self.date = date
        self._res = res

    def load(self, **kw):
        pass

    @property
    def results(self):
        return self._res


def _sprint_res(points):
    return pd.DataFrame({"Abbreviation": list(points), "Points": list(points.values())})


def test_sprint_points_returns_driver_points(monkeypatch):
    fake = _FakeSession(pd.Timestamp("2026-07-05 10:00"), _sprint_res({"VER": 8.0, "NOR": 7.0}))
    monkeypatch.setattr(results.fastf1, "get_session", lambda *a, **k: fake)
    assert results._sprint_points(2026, 9) == {"VER": 8.0, "NOR": 7.0}


def test_sprint_points_empty_when_no_sprint(monkeypatch):
    def _raise(*a, **k):
        raise ValueError("no Sprint session this weekend")
    monkeypatch.setattr(results.fastf1, "get_session", _raise)
    assert results._sprint_points(2026, 3) == {}


def test_sprint_points_empty_when_future(monkeypatch):
    fake = _FakeSession(pd.Timestamp("2999-01-01 00:00"), _sprint_res({"VER": 8.0}))
    monkeypatch.setattr(results.fastf1, "get_session", lambda *a, **k: fake)
    assert results._sprint_points(2026, 9) == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_results_sprint.py -q`
Expected: FAIL — `_sprint_points` not defined.

- [ ] **Step 3: Implement in `src/data/results.py`**

Add `from src.data.load import session_in_future` to the imports. Add `_sprint_points`, gate the race fetch, and add sprint points in `load_season_results`.

```python
def _sprint_points(year: int, rnd: int) -> dict:
    """Driver -> sprint points for a round, or {} if the weekend has no sprint or it has not
    run yet. Sprint points count toward the championship; a driver's round points = race +
    sprint. Non-sprint weekends and future/absent sprints contribute nothing."""
    try:
        sp = fastf1.get_session(year, rnd, "Sprint")
        if session_in_future(getattr(sp, "date", None)):
            return {}
        sp.load(laps=False, telemetry=False, weather=False, messages=False)
        res = sp.results
    except Exception:  # noqa: BLE001 - no sprint this weekend / API hiccup -> no points
        return {}
    if res is None or res.empty:
        return {}
    return {str(d): float(p) for d, p in zip(res["Abbreviation"], res["Points"])}
```

In `load_season_results`, gate the race session and fold in sprint points. Change the race-load block:

```python
        try:
            s = fastf1.get_session(year, rnd, "R")
            if session_in_future(getattr(s, "date", None)):
                continue  # race not yet held; do not ingest leaked results
            s.load(laps=False, telemetry=False, weather=False, messages=False)
            res = s.results
        except Exception as e:  # noqa: BLE001
            logger.warning("No results for %s round %s: %s", year, rnd, e)
            continue
```

And after `df["date"] = pd.to_datetime(ev["EventDate"])`, before `frames.append(df)`:

```python
        sprint = _sprint_points(year, rnd)
        if sprint:
            df["points"] = df["points"] + df["Driver"].map(sprint).fillna(0.0)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_results_sprint.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/results.py tests/test_results_sprint.py
git commit -m "feat: date-gate load_season_results + fold sprint points into standings"
```

---

### Task 3: Build-time no-un-raced-rows assertion

**Files:**
- Modify: `scripts/build_2026.py`
- Test: `tests/test_build_assert.py` (create)

**Interfaces:**
- Produces: `assert_no_unraced_target(tables, target_gp, target_raced, live_season)` — raises `RuntimeError` if any live-season table has a row for the un-raced current target.

- [ ] **Step 1: Write the failing test**

Create `tests/test_build_assert.py`:

```python
import pandas as pd
import pytest

from scripts.build_2026 import assert_no_unraced_target


def _tbl(gps):
    return pd.DataFrame({"year": [2026] * len(gps), "gp": gps, "Driver": ["X"] * len(gps)})


def test_raises_when_unraced_target_present():
    tables = {"podium": _tbl(["Austria", "Belgium"])}
    with pytest.raises(RuntimeError, match="Belgium"):
        assert_no_unraced_target(tables, "Belgium", target_raced=False, live_season=2026)


def test_ok_when_target_absent():
    tables = {"podium": _tbl(["Austria", "Great Britain"])}
    assert_no_unraced_target(tables, "Belgium", target_raced=False, live_season=2026)  # no raise


def test_ok_when_target_has_raced():
    tables = {"podium": _tbl(["Austria", "Belgium"])}
    assert_no_unraced_target(tables, "Belgium", target_raced=True, live_season=2026)  # concluded -> allowed
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_build_assert.py -q`
Expected: FAIL — `assert_no_unraced_target` not importable.

- [ ] **Step 3: Implement in `scripts/build_2026.py`**

Add the function (module level) and call it in `main()` after the tables are built, before the api/ copy. `derive_calendar` guarantees the only possibly-un-raced round is the single current target, so the check reduces to "no live table has the target's rows unless it has raced":

```python
def assert_no_unraced_target(tables: dict, target_gp: str, target_raced: bool,
                             live_season: int = LIVE_SEASON) -> None:
    """Fail the build if any live-season table carries the current target's rows before its
    race has concluded (a fastf1 leak past the load-level date-gate). Fail-safe: R17 stops
    rather than deploying leaked data."""
    if target_raced:
        return
    for name, df in tables.items():
        if df is None or df.empty or "gp" not in df.columns or "year" not in df.columns:
            continue
        if ((df["year"] == live_season) & (df["gp"] == target_gp)).any():
            raise RuntimeError(
                f"{name}: un-raced target '{target_gp}' present in a live-season table "
                f"(fastf1 leak past the occurred-gate); refusing to deploy leaked data."
            )
```

In `main()`, after the tables are built and before copying to `api/`, gather them and call the assertion. Use the derived schedule (already available from `_refresh_calendar_and_schedule` / `derive_live_calendar`) for the target gp + its `final` time:

```python
    import pandas as _pd
    from datetime import datetime as _dt, timezone as _tz
    sched = json.load(open(SCHEDULE_JSON)) if os.path.exists(SCHEDULE_JSON) else None
    if sched:
        target_raced = _pd.Timestamp(sched["final"].replace("Z", "+00:00")) <= _dt.now(_tz.utc)
        built = {p: _pd.read_parquet(os.path.join(DATA_DIR, f"{p}.parquet"))
                 for p in ("podium_features", "strategy_features", "actual_stops",
                           "pace_features", "season_results")
                 if os.path.exists(os.path.join(DATA_DIR, f"{p}.parquet"))}
        assert_no_unraced_target(built, sched["gp"], target_raced)
        print("check — no un-raced target rows in the live-season tables.")
```

(`SCHEDULE_JSON` and `DATA_DIR` are existing module constants in `scripts/build_2026.py`; place this block after the tables are written to `DATA_DIR` and before the `shutil.copy(... API_DIR ...)` loop near the end of `main()`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_build_assert.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/build_2026.py tests/test_build_assert.py
git commit -m "feat: build-time assertion refusing un-raced target rows (fail-safe)"
```

---

### Task 4: Retire the boundary guards

**Files:**
- Modify: `api/podium.py`, `api/strategy.py`, `vercel.json`
- Modify: `tests/test_api_podium.py`, `tests/test_api_strategy_modes.py`

**Interfaces:**
- Consumes: nothing new. Restores the pre-firefight routing now that the source tables are clean.

- [ ] **Step 1: Update the tests first (to the post-guard contract)**

In `tests/test_api_podium.py`, DELETE `test_leaked_unraced_target_routes_to_upcoming_with_teams` (the leaked scenario no longer exists).

In `tests/test_api_strategy_modes.py`, replace the whole file with the stable, guard-free contract:

```python
from api.strategy import strategy_response


def test_completed_race_returns_actual_mode():
    # A completed race has an actual_stops row.
    status, p = strategy_response({"year": 2024, "gp": "Italy"})
    assert status == 200
    assert p["mode"] == "actual"
    assert p["dominant"]["n_stops"] >= 1


def test_upcoming_or_absent_returns_historical_norm():
    # A future/absent season has no actual + no strategy row -> honest historical norm.
    status, p = strategy_response({"year": 2027, "gp": "Great Britain"})
    assert status == 200
    assert p["mode"] == "historical"
    assert p["dominant"]["n_stops"] >= 1


def test_missing_fields_is_400():
    status, p = strategy_response({"gp": "Austria"})
    assert status == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_api_strategy_modes.py -q`
Expected: FAIL — `_race_concluded` still gates and `2024 Italy` may route via the old path; behavior differs until Step 3.

- [ ] **Step 3: Remove the guards**

**`api/strategy.py`** — remove `_race_concluded`, the `_SCHEDULE` load block, and the `from datetime import datetime, timezone` import; revert the actual branch. Change:

```python
    act = actual_stops(year, gp, _ACTUAL) if _race_concluded(year, gp) else None
    if act is not None:
```
back to:
```python
    act = actual_stops(year, gp, _ACTUAL)
    if act is not None:
```
Delete the `_SCHEDULE = json.loads(...)` block and the entire `_race_concluded` function.

**`api/podium.py`** — remove `_has_raced` and restore membership routing. Delete the `_has_raced` function; restore `_RACE_IDS = set(_TABLE["race_id"])` after the table loads; change `if _has_raced(race_id(year, gp)):` back to `if race_id(year, gp) in _RACE_IDS:`.

**`vercel.json`** — remove `,app/data/weekend-schedule.json` from `api/strategy.py`'s `includeFiles`, restoring:
```json
    "api/strategy.py": {
      "includeFiles": "{src/**,api/strategy_features.parquet,api/team_map.parquet,api/actual_stops.parquet}"
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_api_strategy_modes.py tests/test_api_podium.py -q`
Expected: PASS. Also `python3 -c "import json;json.load(open('vercel.json'))"` (valid).

- [ ] **Step 5: Commit**

```bash
git add api/strategy.py api/podium.py vercel.json tests/test_api_strategy_modes.py tests/test_api_podium.py
git commit -m "refactor: retire per-table boundary guards (occurred-gate makes source tables clean)"
```

---

### Task 5: Regenerate the clean tables + full verification

**Files:**
- Modify: `api/*.parquet` (regenerated), `data/*.parquet` (regenerated)

**Interfaces:** none (data + verification).

- [ ] **Step 1: Rebuild season_results across all seasons (adds sprint points)**

The sprint change affects every season's standings, so rebuild the full results table (not just the live season). Run:

```bash
PYTHONPATH=. .venv/bin/python -c "
from src.data.results import load_results
from src.calendar import SEASONS
import pandas as pd
df = load_results(list(SEASONS) + [2026], refresh_year=None) if False else None
# Force a full re-pull of every season so sprint points are folded in everywhere:
import os
if os.path.exists('data/season_results.parquet'): os.remove('data/season_results.parquet')
from src.data.results import load_season_results
frames = [load_season_results(y) for y in list(SEASONS) + [2026]]
out = pd.concat([f for f in frames if not f.empty], ignore_index=True).dropna(subset=['finish_pos']).sort_values('date').reset_index(drop=True)
out.to_parquet('data/season_results.parquet')
print('season_results rows:', len(out), '| 2026 events:', sorted(out[out.year==2026]['gp'].unique()))
"
```
Expected: completes (may fetch sprint sessions — polite, cached); prints the 2026 events.

- [ ] **Step 2: Rebuild the live-season feature tables through the gated pipeline**

Run: `PYTHONPATH=. .venv/bin/python scripts/build_2026.py`
Expected: runs clean, prints the "no un-raced target rows" check, and copies tables into `api/`. (If it RAISES on the assertion, a leak got past the gate — investigate before proceeding; do not force.)

- [ ] **Step 3: Verify no un-raced rows + sprint points landed**

```bash
PYTHONPATH=. .venv/bin/python -c "
import pandas as pd, json
sched = json.load(open('app/data/weekend-schedule.json'))
tgt = sched['gp']
for p in ('podium_features','strategy_features','actual_stops','season_results','pace_features'):
    t = pd.read_parquet(f'api/{p}.parquet')
    n = ((t.get('year')==2026) & (t.get('gp')==tgt)).sum() if 'gp' in t.columns else 0
    print(f'{p}: rows for un-raced target {tgt} = {n} (expect 0 unless it has raced)')
s = pd.read_parquet('api/season_results.parquet')
print('a completed sprint weekend keeps >0 points; 2026 events:', sorted(s[s.year==2026]['gp'].unique()))
"
```
Expected: 0 un-raced-target rows in each table; season_results present.

- [ ] **Step 4: Full suite + build**

Run: `PYTHONPATH=. .venv/bin/python -m pytest -q`
Expected: all pass (new gate/sprint/assert tests + existing, minus the retired guard tests).

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: green (the frontend is untouched; confirms nothing broke).

- [ ] **Step 5: Commit the regenerated tables**

```bash
git add api/podium_features.parquet api/strategy_features.parquet api/actual_stops.parquet api/season_results.parquet api/pace_features.parquet api/team_map.parquet api/pit_loss.parquet data/season_results.parquet
git commit -m "data: regenerate feature tables through the occurred-gate + sprint standings"
```

- [ ] **Step 6: Sanity-check the live-style routing locally**

```bash
PYTHONPATH=. .venv/bin/python -c "
from api.podium import podium_response
from api.strategy import strategy_response
print('GB podium (raced):', podium_response({'year':2026,'gp':'Great Britain'})[1]['mode'])
print('Belgium podium (upcoming):', podium_response({'year':2026,'gp':'Belgium'})[1].get('mode'))
print('Belgium strategy (upcoming):', strategy_response({'year':2026,'gp':'Belgium'})[1]['mode'])
"
```
Expected: GB podium a normal mode with real teams; Belgium podium a friday/qualitative band (upcoming builder), Belgium strategy `historical` (no leaked predicted). No grey/None teams.

---

## Self-Review

**Spec coverage:**
- §2 occurred-gate (`load_session` + `load_season_results` date-gate, shared helper) → Tasks 1, 2.
- §3 sprint-in-standings (points += sprint; form main-race-only) → Task 2.
- §4 retire guards (podium/strategy/vercel + tests) + build-time assertion → Tasks 3, 4.
- §5 rebuild + verify + R17 (build_2026 runs the gated pipeline) → Task 5.
- §6 non-goals (no model change; frontend untouched) → Global Constraints + Task 5 Step 4.

**Placeholder scan:** none — every step has concrete code or an exact command. The Task 3 `main()` wiring names the exact tables + uses the existing schedule JSON path (noted to adapt to the file's constant name).

**Type/name consistency:** `session_in_future(dt, now=None)` identical across Task 1 (def), Task 2 (import/use). `_sprint_points(year, rnd) -> dict` matches its test. `assert_no_unraced_target(tables, target_gp, target_raced, live_season)` matches its test and `main()` call. Guard-removal reverts to names that exist pre-firefight (`_RACE_IDS`, `actual_stops(...)`). The retired guard tests are deleted in the same task that removes the guards.
