# Data-currency automation + R17 hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make R17 self-update the 2026 calendar + upcoming-weekend schedule (so the owner no longer hand-bumps `RACE_CALENDAR[2026]` and `weekend-schedule.json` each weekend), only deploy when table content actually changed, and smooth thin single-season pit-loss noise.

**Architecture:** A new fastf1-touching module `src/data/schedule.py` derives the live calendar + weekend schedule from `fastf1.get_event_schedule(2026)` by **race-session date** (leak-safe — never inspects lap data). `src/calendar.py` reads the derived list from a committed `src/race_calendar.json` (bundled free via the existing `{src/**}` glob) with a hardcoded fallback. `scripts/build_2026.py` writes both JSON files first and feeds `LIVE_CIRCUITS` from the derived list. R17 gains a content-fingerprint commit gate. A final severable slice smooths thin-sample pit-loss.

**Tech Stack:** Python 3.12, fastf1, pandas/pyarrow, pytest; the two R17 GitHub Actions workflow copies; TypeScript/vitest for regression only.

## Global Constraints

- Inference never imports fastf1; `src/calendar.py` stays pure (JSON read only, no fastf1). Enforced by `tests/test_inference_no_fastf1.py`.
- All training goes through `store.prior_weekends` in true calendar order (never alphabetical); the derived 2026 list stays in real schedule order.
- The occurred-gate never extends past the single upcoming target (fastf1 future-leak guard: British R9 had laps pre-race, so "does fastf1 have laps" is an unsafe signal — only race *dates* are used).
- Round every number that reaches output.
- Logic lives in `src/`; scripts/notebooks only orchestrate.
- Commits: conventional style, one logical change each, **no AI/Claude attribution** of any kind.
- `src/race_calendar.json` is bundled into serverless functions automatically by the existing `{src/**}` `includeFiles` glob in `vercel.json` — do **not** add a `vercel.json` entry.
- The full 2026 schedule order is exactly `STOPS_CIRCUITS` (`src/features/actual_stops.py`); the derived `RACE_CALENDAR[2026]` must always be a contiguous prefix of it.

---

### Task 1: Pure calendar-derivation core (`src/data/schedule.py`)

The fastf1-free logic: given normalized event info + a `now` timestamp, produce the calendar list + weekend-schedule dict. Fully unit-tested with no network/fastf1.

**Files:**
- Create: `src/data/schedule.py` (pure core only in this task)
- Test: `tests/test_schedule_derivation.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) EventInfo(round: int, event_name: str, race_dt: pd.Timestamp, quali_dt: pd.Timestamp, pre_dt: pd.Timestamp)` (all datetimes naive UTC).
  - `pre_quali_time(session_dts: list[pd.Timestamp | None], quali_dt: pd.Timestamp) -> pd.Timestamp`
  - `derive_calendar(events: list[EventInfo], now: pd.Timestamp, year: int, name_to_key: dict[str, str] | None = None) -> dict` returning `{"calendar": list[str], "schedule": dict}` where `schedule = {"year", "gp", "preQuali", "postQuali", "final", "nextGp"}` (ISO `...Z` strings; `nextGp` may be `None`).
  - Module constant `_NAME_TO_KEY: dict[str, str]` = inverse of `src.calendar.GP_TO_EVENT`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_schedule_derivation.py
"""Unit tests for the pure calendar-derivation core (no fastf1)."""
import pandas as pd
import pytest

from src.data.schedule import EventInfo, derive_calendar, pre_quali_time

TS = pd.Timestamp
NAME_TO_KEY = {"Alpha Grand Prix": "Alpha", "Bravo Grand Prix": "Bravo",
               "Charlie Grand Prix": "Charlie", "Delta Grand Prix": "Delta"}


def _ev(rnd, name, race_day):
    race = TS(f"2026-{race_day}T14:00:00")
    return EventInfo(rnd, name, race, race - pd.Timedelta(days=1), race - pd.Timedelta(days=2))


def test_pre_quali_time_picks_last_session_before_quali():
    quali = TS("2026-05-02T15:00:00")
    sess = [TS("2026-05-01T11:00:00"), TS("2026-05-01T15:00:00"),
            TS("2026-05-02T11:00:00"), quali, TS("2026-05-03T14:00:00")]
    assert pre_quali_time(sess, quali) == TS("2026-05-02T11:00:00")


def test_pre_quali_time_falls_back_when_nothing_before_quali():
    quali = TS("2026-05-02T15:00:00")
    assert pre_quali_time([None, quali], quali) == quali - pd.Timedelta(hours=3)


def test_mid_season_completed_plus_single_target():
    events = [_ev(1, "Alpha Grand Prix", "03-08"), _ev(2, "Bravo Grand Prix", "03-15"),
              _ev(3, "Charlie Grand Prix", "03-29"), _ev(4, "Delta Grand Prix", "04-12")]
    now = TS("2026-03-20T00:00:00")  # after Alpha+Bravo, before Charlie
    out = derive_calendar(events, now, 2026, NAME_TO_KEY)
    assert out["calendar"] == ["Alpha", "Bravo", "Charlie"]  # completed + single target
    assert out["schedule"]["gp"] == "Charlie"
    assert out["schedule"]["nextGp"] == "Delta"
    assert out["schedule"]["year"] == 2026
    assert out["schedule"]["final"] == "2026-03-29T14:00:00Z"


def test_pre_season_target_is_round_one():
    events = [_ev(1, "Alpha Grand Prix", "03-08"), _ev(2, "Bravo Grand Prix", "03-15")]
    out = derive_calendar(events, TS("2026-01-01T00:00:00"), 2026, NAME_TO_KEY)
    assert out["calendar"] == ["Alpha"]
    assert out["schedule"]["gp"] == "Alpha"
    assert out["schedule"]["nextGp"] == "Bravo"


def test_post_season_target_is_finale_no_next():
    events = [_ev(1, "Alpha Grand Prix", "03-08"), _ev(2, "Bravo Grand Prix", "03-15")]
    out = derive_calendar(events, TS("2026-12-31T00:00:00"), 2026, NAME_TO_KEY)
    assert out["calendar"] == ["Alpha", "Bravo"]  # all completed, no dup of target
    assert out["schedule"]["gp"] == "Bravo"
    assert out["schedule"]["nextGp"] is None


def test_unknown_event_is_skipped():
    events = [_ev(1, "Alpha Grand Prix", "03-08"),
              _ev(2, "Unlisted Grand Prix", "03-15"),
              _ev(3, "Bravo Grand Prix", "03-29")]
    out = derive_calendar(events, TS("2026-04-01T00:00:00"), 2026, NAME_TO_KEY)
    assert out["calendar"] == ["Alpha", "Bravo"]  # Unlisted dropped, not crashed
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_schedule_derivation.py -v`
Expected: FAIL with `ModuleNotFoundError` / `ImportError: cannot import name` (module not written yet).

- [ ] **Step 3: Write the pure core**

```python
# src/data/schedule.py
"""Derive the live season's calendar + upcoming-weekend schedule from fastf1's event
schedule — the data-currency automation (handoff TODO #2).

R17 (the only environment with fastf1) calls derive_live_calendar to refresh the committed
src/race_calendar.json + app/data/weekend-schedule.json each weekend, so the calendar is no
longer hand-bumped. Detection is by RACE-SESSION DATE, never lap data: fastf1 leaks future
race laps (British R9 had laps pre-race), so a date/clock gate is the only safe signal.

The pure core (EventInfo/pre_quali_time/derive_calendar) is fastf1-free and fully unit
tested; derive_live_calendar is the thin fastf1 wrapper (added in the next task).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import pandas as pd

from src.calendar import GP_TO_EVENT

logger = logging.getLogger(__name__)

# EventName -> short calendar key (inverse of GP_TO_EVENT; short<->long is 1:1).
_NAME_TO_KEY: dict[str, str] = {v: k for k, v in GP_TO_EVENT.items()}


@dataclass(frozen=True)
class EventInfo:
    """One round's identity + the naive-UTC datetimes the derivation needs."""
    round: int
    event_name: str
    race_dt: pd.Timestamp
    quali_dt: pd.Timestamp
    pre_dt: pd.Timestamp


def pre_quali_time(session_dts: list[pd.Timestamp | None], quali_dt: pd.Timestamp) -> pd.Timestamp:
    """The last practice/session strictly before qualifying (format-agnostic).

    Falls back to 3h before quali when no earlier session datetime is available.
    """
    befores = [d for d in session_dts if d is not None and pd.notna(d) and d < quali_dt]
    return max(befores) if befores else quali_dt - pd.Timedelta(hours=3)


def _iso(ts: pd.Timestamp) -> str:
    """Format a naive-UTC timestamp as the schedule's ISO-Z convention."""
    return pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ")


def derive_calendar(events: list[EventInfo], now: pd.Timestamp, year: int,
                    name_to_key: dict[str, str] | None = None) -> dict:
    """Completed rounds + the single upcoming target, plus the weekend-schedule dict.

    `calendar` = every round whose race is in the past, followed by the earliest round whose
    race is not yet complete (the current/upcoming target). Never includes rounds beyond that
    single target — the fastf1 future-leak guard. Season over -> target is the finale and
    `calendar` is every completed round. Events not in `name_to_key` are skipped with a warning.
    """
    name_to_key = name_to_key if name_to_key is not None else _NAME_TO_KEY
    known: list[tuple[str, EventInfo]] = []
    for e in sorted(events, key=lambda x: x.round):
        key = name_to_key.get(e.event_name)
        if key is None:
            logger.warning("event %r not in GP_TO_EVENT inverse; skipping", e.event_name)
            continue
        known.append((key, e))
    if not known:
        return {"calendar": [], "schedule": None}

    completed = [k for k, e in known if e.race_dt < now]
    remaining = [(k, e) for k, e in known if e.race_dt >= now]
    if remaining:
        target = remaining[0][0]
        next_gp = remaining[1][0] if len(remaining) > 1 else None
    else:
        target = known[-1][0]  # season over -> finale
        next_gp = None

    calendar = completed + ([target] if target not in completed else [])
    tev = dict(known)[target]
    schedule = {
        "year": year,
        "gp": target,
        "preQuali": _iso(tev.pre_dt),
        "postQuali": _iso(tev.quali_dt),
        "final": _iso(tev.race_dt),
        "nextGp": next_gp,
    }
    return {"calendar": calendar, "schedule": schedule}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_schedule_derivation.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/schedule.py tests/test_schedule_derivation.py
git commit -m "feat: pure calendar-derivation core for data-currency automation"
```

---

### Task 2: fastf1 wrapper `derive_live_calendar`

Adds the thin fastf1-touching wrapper that builds `EventInfo`s from the real schedule and calls the pure core. Verified against the local warm cache (reads schedule dates only — cheap, leak-free).

**Files:**
- Modify: `src/data/schedule.py` (append the wrapper + fastf1 helpers)

**Interfaces:**
- Consumes: `EventInfo`, `derive_calendar`, `pre_quali_time`, `_NAME_TO_KEY` from Task 1.
- Produces: `derive_live_calendar(year: int, now=None) -> dict | None` (returns `None` on schedule-fetch failure so callers leave committed files untouched).

- [ ] **Step 1: Append the wrapper**

```python
# --- appended to src/data/schedule.py ---
from datetime import datetime, timezone  # add to the import block at the top

import fastf1  # add to the import block at the top

from src.data.load import enable_cache  # add to the import block at the top


def _session_dt(event, name: str) -> pd.Timestamp | None:
    """A session's naive-UTC datetime by fastf1 session name, or None if unavailable."""
    try:
        ts = event.get_session_date(name, utc=True)
    except Exception:  # noqa: BLE001 - missing/unknown session degrades to None
        return None
    return None if ts is None or pd.isna(ts) else pd.Timestamp(ts)


def _col_dt(event, col: str) -> pd.Timestamp | None:
    """A schedule DateUtc column value as a naive Timestamp, or None."""
    val = event.get(col)
    return None if val is None or pd.isna(val) else pd.Timestamp(val)


def _event_info(rnd: int, event) -> EventInfo | None:
    """Build an EventInfo from a fastf1 Event row; None if no race datetime resolvable."""
    race_dt = _session_dt(event, "Race")
    if race_dt is None:
        ed = _col_dt(event, "EventDate")
        race_dt = ed + pd.Timedelta(hours=22) if ed is not None else None  # end-of-race-day
    if race_dt is None:
        return None
    quali_dt = _session_dt(event, "Qualifying") or (race_dt - pd.Timedelta(days=1))
    sess_dts = [_col_dt(event, f"Session{i}DateUtc") for i in range(1, 6)]
    return EventInfo(rnd, event["EventName"], race_dt, quali_dt, pre_quali_time(sess_dts, quali_dt))


def derive_live_calendar(year: int, now: pd.Timestamp | None = None) -> dict | None:
    """Fetch the season schedule (fastf1) and derive {calendar, schedule}; None on failure.

    Reads only get_event_schedule (dates), never lap data, so it is leak-safe and cheap.
    """
    if now is None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
    now = pd.Timestamp(now)
    enable_cache()
    try:
        sched = fastf1.get_event_schedule(year, include_testing=False)
    except Exception as e:  # noqa: BLE001 - a transient fetch failure must not corrupt files
        logger.warning("schedule fetch failed for %s: %s", year, e)
        return None
    events: list[EventInfo] = []
    for rnd in sorted({int(r) for r in sched["RoundNumber"] if int(r) != 0}):
        info = _event_info(rnd, sched.get_event_by_round(rnd))
        if info is not None:
            events.append(info)
    if not events:
        return None
    return derive_calendar(events, now, year)
```

- [ ] **Step 2: Verify against the real cache (schedule-only, leak-free)**

Run:
```bash
PYTHONPATH=. .venv/bin/python -c "
import pandas as pd
from src.data.schedule import derive_live_calendar
out = derive_live_calendar(2026, now=pd.Timestamp('2026-07-02T00:00:00'))
print('target:', out['schedule']['gp'], '| nextGp:', out['schedule']['nextGp'])
print('calendar:', out['calendar'])
from src.features.actual_stops import STOPS_CIRCUITS
cal = out['calendar']
assert cal == STOPS_CIRCUITS[:len(cal)], 'calendar must be a schedule prefix'
assert out['schedule']['gp'] == 'Great Britain', out['schedule']['gp']
print('final:', out['schedule']['final'], 'postQuali:', out['schedule']['postQuali'])
print('OK')
"
```
Expected: target `Great Britain`, `nextGp` `Belgium`, calendar = the 9-round prefix through Great Britain, `OK` printed. (As of 2026-07-02 Austria has raced and Great Britain is the upcoming target.)

- [ ] **Step 3: Confirm inference stays fastf1-free**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_no_fastf1.py -v`
Expected: PASS (schedule.py imports fastf1 but is under `src/data/`, never on the inference path).

- [ ] **Step 4: Commit**

```bash
git add src/data/schedule.py
git commit -m "feat: derive_live_calendar fastf1 wrapper"
```

---

### Task 3: `src/calendar.py` reads the derived 2026 list

`RACE_CALENDAR[2026]` loads from `src/race_calendar.json` (bundled free via `{src/**}`) with a hardcoded fallback; 2023–25 unchanged. The two calendar tests that encoded the old "Austria-last / Great Britain absent" invariant are rewritten to the new "contiguous schedule prefix" invariant.

**Files:**
- Modify: `src/calendar.py`
- Create: `src/race_calendar.json`
- Modify: `tests/test_calendar.py`

**Interfaces:**
- Consumes: `derive_live_calendar` (Task 2) to generate the initial JSON.
- Produces: `RACE_CALENDAR[2026]` sourced from `src/race_calendar.json`, hardcoded `_FALLBACK_2026` when absent/corrupt.

- [ ] **Step 1: Generate the initial `src/race_calendar.json` from real data**

Run:
```bash
PYTHONPATH=. .venv/bin/python -c "
import json
from src.data.schedule import derive_live_calendar
cal = derive_live_calendar(2026)['calendar']
with open('src/race_calendar.json', 'w') as f:
    json.dump({'2026': cal}, f, indent=2); f.write('\n')
print(cal)
"
```
Expected: writes `src/race_calendar.json` with the current prefix (through Great Britain as of 2026-07-02).

- [ ] **Step 2: Write the failing calendar tests (rewrite the two stale ones, add loader tests)**

Replace `test_2026_austria_is_last_and_after_every_prior_season` and
`test_race_calendar_stays_completed_rounds_only` in `tests/test_calendar.py` with these, and
append the loader tests:

```python
# replaces test_2026_austria_is_last_and_after_every_prior_season
def test_2026_rounds_follow_2025_and_end_at_the_current_target():
    order = calendar_order()
    first_2026 = min(i for i, r in enumerate(order) if r.startswith("2026-"))
    last_2025 = max(i for i, r in enumerate(order) if r.startswith("2025-"))
    assert first_2026 > last_2025  # true calendar order, no leakage
    # The last listed 2026 round is whatever the current target is (data-driven).
    assert order[-1] == race_id(2026, RACE_CALENDAR[2026][-1])


# replaces test_race_calendar_stays_completed_rounds_only
def test_race_calendar_2026_is_a_contiguous_schedule_prefix():
    # The derived live calendar is always completed-rounds + the single target, i.e. a
    # contiguous prefix of the real schedule order (STOPS_CIRCUITS). It must never skip a
    # round or reach past the target into the future (the fastf1 future-leak guard).
    cal = RACE_CALENDAR[2026]
    assert cal == STOPS_CIRCUITS[: len(cal)]
    assert len(cal) >= 8  # at least through Austria (already run)


# appended: the JSON loader
from pathlib import Path

from src.calendar import _FALLBACK_2026, _load_2026


def test_load_2026_reads_valid_json(tmp_path):
    p = tmp_path / "race_calendar.json"
    p.write_text('{"2026": ["Australia", "China", "Japan"]}')
    assert _load_2026(p) == ["Australia", "China", "Japan"]


def test_load_2026_falls_back_when_missing(tmp_path):
    assert _load_2026(tmp_path / "nope.json") == _FALLBACK_2026


def test_load_2026_falls_back_on_corrupt_json(tmp_path):
    p = tmp_path / "race_calendar.json"
    p.write_text("{not json")
    assert _load_2026(p) == _FALLBACK_2026
```

- [ ] **Step 3: Run to verify failure**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_calendar.py -v`
Expected: FAIL — `ImportError: cannot import name '_load_2026'` (loader not written yet).

- [ ] **Step 4: Add the loader to `src/calendar.py`**

Add imports at the top (below the existing docstring/`from __future__` line):

```python
import json
from pathlib import Path
```

Replace the `RACE_CALENDAR` block's 2026 entry. Add above the `RACE_CALENDAR` definition:

```python
# 2026 is the live season; its round list is data-driven (R17 refreshes src/race_calendar.json
# from fastf1's schedule — see src/data/schedule.py). Read here fastf1-free with a static
# fallback so the module stays pure and degrades gracefully if the file is missing/corrupt.
_FALLBACK_2026 = ["Australia", "China", "Japan", "Miami", "Canada", "Monaco",
                  "Barcelona", "Austria"]


def _load_2026(path: Path | None = None) -> list[str]:
    path = path if path is not None else Path(__file__).with_name("race_calendar.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return _FALLBACK_2026
    val = data.get("2026")
    if isinstance(val, list) and val and all(isinstance(x, str) for x in val):
        return val
    return _FALLBACK_2026
```

Then change the `RACE_CALENDAR` dict's 2026 value from the hardcoded list to `_load_2026()`:

```python
RACE_CALENDAR: dict[int, list[str]] = {
    2023: DRY_CIRCUITS,
    2024: DRY_CIRCUITS,
    2025: DRY_CIRCUITS,
    2026: _load_2026(),
}
```

(Delete the old inline `2026: ["Australia", ..., "Austria"]` literal and its round-1-8 comment.)

- [ ] **Step 5: Run to verify pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_calendar.py -v`
Expected: PASS (all calendar tests, including the 3 new loader tests).

- [ ] **Step 6: Commit**

```bash
git add src/calendar.py src/race_calendar.json tests/test_calendar.py
git commit -m "feat: RACE_CALENDAR[2026] reads derived race_calendar.json"
```

---

### Task 4: `build_2026.py` step 0 — write both JSONs, feed LIVE_CIRCUITS

`build_2026.py` derives the calendar/schedule first, writes `src/race_calendar.json` + `app/data/weekend-schedule.json`, and uses the derived list as `LIVE_CIRCUITS`. On fetch failure it keeps the committed files. Also regenerates `weekend-schedule.json` to current reality (Austria → Great Britain).

**Files:**
- Modify: `scripts/build_2026.py`

**Interfaces:**
- Consumes: `derive_live_calendar` (Task 2).
- Produces: `src/race_calendar.json` + `app/data/weekend-schedule.json` refreshed at build time; `main()` uses the derived circuit list.

- [ ] **Step 1: Add the step-0 helper + wire it into `main`**

In `scripts/build_2026.py`, add to the imports:

```python
from src.data.schedule import derive_live_calendar
```

Add the path constant near `SCHEDULE_JSON`:

```python
RACE_CALENDAR_JSON = os.path.join("src", "race_calendar.json")
```

Add this helper above `main`:

```python
def _refresh_calendar_and_schedule() -> list[str]:
    """Derive the live calendar + weekend schedule from fastf1 and persist both JSON files.

    Returns the derived circuit list to use as LIVE_CIRCUITS (NOT the import-cached
    RACE_CALENDAR[LIVE_SEASON], which would be stale within this process). On a schedule
    fetch failure, leaves both committed files untouched and returns the committed calendar.
    """
    derived = derive_live_calendar(LIVE_SEASON)
    if derived is None or not derived.get("calendar"):
        print("0/7 calendar — schedule fetch failed; keeping committed calendar/schedule.")
        return RACE_CALENDAR[LIVE_SEASON]
    cal = derived["calendar"]
    with open(RACE_CALENDAR_JSON, "w") as f:
        json.dump({str(LIVE_SEASON): cal}, f, indent=2)
        f.write("\n")
    os.makedirs(os.path.dirname(SCHEDULE_JSON), exist_ok=True)
    with open(SCHEDULE_JSON, "w") as f:
        json.dump(derived["schedule"], f, indent=2)
        f.write("\n")
    print(f"0/7 calendar — {len(cal)} rounds, target {derived['schedule']['gp']} "
          f"(next {derived['schedule']['nextGp']}) -> {RACE_CALENDAR_JSON}, {SCHEDULE_JSON}")
    return cal
```

Delete the now-unused module-level constant (grep confirms `LIVE_CIRCUITS` is referenced only inside this script):

```python
LIVE_CIRCUITS = RACE_CALENDAR[LIVE_SEASON]  # only the live season's circuits are fetched
```

In `main()`, insert one new line as the **first** statement, immediately *before* the existing `_seed_data_from_api()` call (do not duplicate `_seed_data_from_api()`):

```python
    live_circuits = _refresh_calendar_and_schedule()
```

so the top of `main()` reads:

```python
def main() -> None:
    live_circuits = _refresh_calendar_and_schedule()
    _seed_data_from_api()
    ...
```

Then change the three `build_*` calls that currently pass `LIVE_CIRCUITS` to pass `live_circuits` instead:
`build_pace_table([LIVE_SEASON], live_circuits)`, `build_strategy_table([LIVE_SEASON], live_circuits)`, `build_pit_loss([LIVE_SEASON], live_circuits)`. (Leave `build_actual_stops(..., STOPS_CIRCUITS)` as-is — the occurred-gate inside it already keys on `RACE_CALENDAR`, and the full roster is intentional there.)

- [ ] **Step 2: Verify step 0 in isolation (schedule-only, no full build)**

Run:
```bash
PYTHONPATH=. .venv/bin/python -c "
import json, scripts.build_2026 as b
cal = b._refresh_calendar_and_schedule()
print('LIVE_CIRCUITS:', cal)
sched = json.load(open('app/data/weekend-schedule.json'))
assert sched['gp'] == 'Great Britain', sched['gp']
assert set(sched) == {'year','gp','preQuali','postQuali','final','nextGp'}, sched
print('weekend-schedule.json:', sched)
print('OK')
"
```
Expected: `LIVE_CIRCUITS` = the current prefix, `weekend-schedule.json` now targets Great Britain with all six keys, `OK`.

- [ ] **Step 3: Full regression (Python + TS) — the schedule change must not break anything**

Run:
```bash
PYTHONPATH=. .venv/bin/python -m pytest -q
npm run test -- --run
```
Expected: Python suite green; vitest green (the TS schedule/next-race tests use inline fixtures, not the real JSON, so the Great Britain flip does not affect them).

- [ ] **Step 4: Commit**

```bash
git add scripts/build_2026.py src/race_calendar.json app/data/weekend-schedule.json
git commit -m "feat: build_2026 auto-derives calendar + weekend schedule (step 0)"
```

---

### Task 5: Content fingerprint (`scripts/data_fingerprint.py`)

A stable, order-independent per-table content hash so R17 can tell whether table *content* (not just non-deterministic parquet bytes) changed.

**Files:**
- Create: `scripts/data_fingerprint.py`
- Create: `api/data-fingerprint.json`
- Test: `tests/test_data_fingerprint.py`

**Interfaces:**
- Produces:
  - `fingerprint_table(df: pd.DataFrame) -> str` (order-independent sha256 of the table's values)
  - `compute_fingerprints(api_dir: str = "api") -> dict[str, str]` (keyed by parquet filename)
  - CLI `python scripts/data_fingerprint.py` writes `api/data-fingerprint.json` (sorted keys).

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_data_fingerprint.py
import pandas as pd

from scripts.data_fingerprint import fingerprint_table


def test_row_order_does_not_change_fingerprint():
    a = pd.DataFrame({"race_id": ["x", "y"], "v": [1.0, 2.0]})
    b = a.iloc[::-1].reset_index(drop=True)
    assert fingerprint_table(a) == fingerprint_table(b)


def test_column_order_does_not_change_fingerprint():
    a = pd.DataFrame({"race_id": ["x"], "v": [1.0]})
    b = a[["v", "race_id"]]
    assert fingerprint_table(a) == fingerprint_table(b)


def test_changed_value_changes_fingerprint():
    a = pd.DataFrame({"race_id": ["x"], "v": [1.0]})
    b = pd.DataFrame({"race_id": ["x"], "v": [1.1]})
    assert fingerprint_table(a) != fingerprint_table(b)
```

- [ ] **Step 2: Run to verify failure**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_data_fingerprint.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.data_fingerprint'`.

- [ ] **Step 3: Write the script**

```python
# scripts/data_fingerprint.py
"""Stable, order-independent content fingerprints for the bundled api/ parquet tables.

Parquet is not byte-deterministic, so a raw `git diff` on api/*.parquet is always dirty and
R17 would deploy every run. This fingerprint hashes each table's VALUES (canonicalized: sorted
columns, sorted rows) so R17 can commit/deploy only when content actually changed.

Run: PYTHONPATH=. python scripts/data_fingerprint.py   # writes api/data-fingerprint.json
"""
from __future__ import annotations

import glob
import hashlib
import json
import os

import pandas as pd

API_DIR = "api"
OUT = os.path.join(API_DIR, "data-fingerprint.json")


def fingerprint_table(df: pd.DataFrame) -> str:
    """sha256 of a table's values, independent of row/column order."""
    canon = df.reindex(sorted(df.columns), axis=1)
    canon = canon.sort_values(list(canon.columns)).reset_index(drop=True)
    return hashlib.sha256(canon.to_csv(index=False).encode("utf-8")).hexdigest()


def compute_fingerprints(api_dir: str = API_DIR) -> dict[str, str]:
    """Fingerprint every parquet table in `api_dir`, keyed by filename."""
    out: dict[str, str] = {}
    for path in sorted(glob.glob(os.path.join(api_dir, "*.parquet"))):
        out[os.path.basename(path)] = fingerprint_table(pd.read_parquet(path))
    return out


def main() -> None:
    fps = compute_fingerprints()
    with open(OUT, "w") as f:
        json.dump(fps, f, indent=2, sort_keys=True)
        f.write("\n")
    print(f"wrote {OUT} ({len(fps)} tables)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run to verify pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_data_fingerprint.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Generate the committed baseline fingerprint**

Run: `PYTHONPATH=. .venv/bin/python scripts/data_fingerprint.py`
Expected: writes `api/data-fingerprint.json` with one sha256 per bundled parquet table.

- [ ] **Step 6: Commit**

```bash
git add scripts/data_fingerprint.py tests/test_data_fingerprint.py api/data-fingerprint.json
git commit -m "feat: content fingerprint for api parquet tables"
```

---

### Task 6: R17 workflow content-based commit gate

Both workflow copies compute the fingerprint and commit/deploy only when the fingerprint or a tracked JSON changed; otherwise the non-deterministic parquet churn is discarded and nothing deploys.

**Files:**
- Modify: `.github/workflows/refresh-weekend-data.yml`
- Modify: `docs/ops/refresh-weekend-data.yml`

**Interfaces:**
- Consumes: `scripts/data_fingerprint.py` (Task 5), `src/race_calendar.json` + `app/data/weekend-schedule.json` (Tasks 3–4).

- [ ] **Step 1: Add a fingerprint step after the tables are staged**

In **both** files, immediately after the `Stage refreshed tables into api/` step (and before or after `Generate entity whats` — either works; place it after), add:

```yaml
      - name: Compute content fingerprint
        run: PYTHONPATH=. python scripts/data_fingerprint.py
```

- [ ] **Step 2: Replace the commit step with the content gate**

In **both** files, replace the entire `Commit & push if changed (triggers Vercel deploy)` step's `run:` block with:

```yaml
      - name: Commit & push if content changed (triggers Vercel deploy)
        run: |
          git config user.name "sector4-bot"
          git config user.email "actions@users.noreply.github.com"
          # Stage the deterministic, meaningful files first; the fingerprint captures any
          # real parquet CONTENT change, JSON diffs capture calendar/schedule/entity changes.
          git add api/data-fingerprint.json app/data/grids.json app/data/entity-whats.json \
                  app/data/weekend-schedule.json src/race_calendar.json
          if git diff --cached --quiet; then
            echo "No content changes — discarding non-deterministic parquet churn."
            git checkout -- api/*.parquet || true
          else
            git add api/*.parquet
            git commit -m "data: refresh weekend feature tables [skip ci]"
            git pull --rebase --autostash origin "${GITHUB_REF_NAME}" || true
            git push origin "HEAD:${GITHUB_REF_NAME}"
          fi
```

- [ ] **Step 3: Lint the YAML**

Run:
```bash
PYTHONPATH=. .venv/bin/python -c "
import yaml
for p in ('.github/workflows/refresh-weekend-data.yml', 'docs/ops/refresh-weekend-data.yml'):
    yaml.safe_load(open(p))
    print('valid:', p)
"
```
Expected: both `valid:` lines print (no YAML errors).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/refresh-weekend-data.yml docs/ops/refresh-weekend-data.yml
git commit -m "ci: R17 deploys only when table content changed"
```

> **Owner action at merge (handoff gotcha):** the CI PAT lacks GitHub's `workflow` scope, so the live `.github/workflows/refresh-weekend-data.yml` change must be applied via the GitHub web UI (or pushed with a `workflow`-scoped token). `docs/ops/` is the canonical template and commits normally.

---

### Task 7 (SEVERABLE): China single-sample pit-loss noise

When the default (latest-season) pit-loss row for a circuit rests on a thin clean-stop sample, blend a multi-year median instead, with an honesty insight. An explicitly-requested year is always respected verbatim.

**Files:**
- Modify: `src/inference/lookup.py`
- Modify: `tests/test_lookup.py`

**Interfaces:**
- Consumes: the `n_stops` column already present in the pit-loss table (`build_pit_loss`).
- Produces: unchanged `_pit_loss` return shape; blended `value` + an insight when the latest sample is thin.

- [ ] **Step 1: Inspect the real `n_stops` distribution to sanity-check the threshold**

Run:
```bash
PYTHONPATH=. .venv/bin/python -c "
import pandas as pd
p = pd.read_parquet('api/pit_loss.parquet')
print(p.sort_values('n_stops')[['gp','year','pit_loss_s','n_stops']].to_string())
"
```
Expected: prints per-(gp, year) `n_stops`; confirm the thin single-season rows (e.g. China 2026 ≈ 7) sit below full-race rows (typically well above 12). If the split differs materially from 12, set `MIN_PIT_LOSS_SAMPLES` to a value cleanly between the thin and full rows and use it in Step 3.

- [ ] **Step 2: Write the failing tests**

```python
# appended to tests/test_lookup.py
import pandas as pd

from src.inference.lookup import lookup_stat


def _pit_df(rows):
    return pd.DataFrame(rows)


def test_thin_latest_sample_blends_multi_year_median():
    # Latest (2026) has a thin sample; a prior full-sample year exists -> blend the median.
    pit = _pit_df([
        {"race_id": "2025-China", "year": 2025, "gp": "China", "pit_loss_s": 22.0, "n_stops": 30},
        {"race_id": "2026-China", "year": 2026, "gp": "China", "pit_loss_s": 15.4, "n_stops": 5},
    ])
    out = lookup_stat("pit_loss", "China", pit_table=pit)
    assert out["value"] == 18.7  # median(22.0, 15.4), rounded
    assert any("season" in i.lower() for i in out["insights"])


def test_adequate_latest_sample_is_unchanged():
    pit = _pit_df([
        {"race_id": "2025-China", "year": 2025, "gp": "China", "pit_loss_s": 22.0, "n_stops": 30},
        {"race_id": "2026-China", "year": 2026, "gp": "China", "pit_loss_s": 20.5, "n_stops": 28},
    ])
    out = lookup_stat("pit_loss", "China", pit_table=pit)
    assert out["value"] == 20.5  # latest respected; no blend


def test_explicit_year_is_respected_even_if_thin():
    pit = _pit_df([
        {"race_id": "2025-China", "year": 2025, "gp": "China", "pit_loss_s": 22.0, "n_stops": 30},
        {"race_id": "2026-China", "year": 2026, "gp": "China", "pit_loss_s": 15.4, "n_stops": 5},
    ])
    out = lookup_stat("pit_loss", "China", pit_table=pit, year=2026)
    assert out["value"] == 15.4  # asked for 2026 explicitly -> no blend
```

- [ ] **Step 3: Run to verify failure**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_lookup.py -k pit -v`
Expected: FAIL — `test_thin_latest_sample_blends_multi_year_median` returns 15.4 (no blend yet).

- [ ] **Step 4: Implement the blend in `_pit_loss`**

In `src/inference/lookup.py`, add the threshold constant near the other module constants:

```python
# Below this many clean stop-pair samples, a single season's pit-loss median is noisy; the
# default (latest-season) lookup blends a multi-year median instead (China 2026 ~ 7 samples).
MIN_PIT_LOSS_SAMPLES = 12
```

Replace lines 46–54 (from `if year is not None ...` through the `return {...}` block) with this complete version:

```python
    blended = False
    if year is not None and (rows["year"] == year).any():
        row = rows[rows["year"] == year].iloc[0]  # explicit year -> respect verbatim
        value, rep_year = round(float(row["pit_loss_s"]), 1), int(row["year"])
    else:
        row = rows.sort_values("year").iloc[-1]  # default: latest season we hold
        rep_year = int(row["year"])
        if int(row["n_stops"]) < MIN_PIT_LOSS_SAMPLES and len(rows) > 1:
            value = round(float(rows["pit_loss_s"].median()), 1)  # thin sample -> multi-year median
            blended = True
        else:
            value = round(float(row["pit_loss_s"]), 1)
    insights = _pit_loss_insights(pit, value)
    if blended:
        insights.append(
            f"This weekend's sample was small, so this is a median across {len(rows)} recent seasons."
        )
    return {"stat": PIT_LOSS, "gp": gp, "value": value, "units": "s",
            "year": rep_year,
            "source": "derived from race pit-stop laps (incl. the stationary stop)",
            "insights": insights}
```

- [ ] **Step 5: Run to verify pass + no regression**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_lookup.py -v`
Expected: PASS (new pit tests + all existing lookup tests).

- [ ] **Step 6: Commit**

```bash
git add src/inference/lookup.py tests/test_lookup.py
git commit -m "fix: blend multi-year pit-loss median for thin single-season samples"
```

---

## Final verification (after all tasks)

- [ ] **Full Python suite:** `PYTHONPATH=. .venv/bin/python -m pytest -q` → all green (≥ 124 tests: prior 121 + new schedule/fingerprint/loader).
- [ ] **Full TS suite + build:** `npm run test -- --run && npm run build` → green.
- [ ] **Trust anchor intact:** `PYTHONPATH=. .venv/bin/python notebooks/06_*.py` (or the stop-count validation script) still reports the `+0.070` edge verbatim.
- [ ] **Leakage guard intact:** `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_no_fastf1.py -v` → PASS.
- [ ] **Currency check:** `app/data/weekend-schedule.json` and `src/race_calendar.json` reflect the current target (Great Britain as of 2026-07-02), and `RACE_CALENDAR[2026]` is a contiguous `STOPS_CIRCUITS` prefix.
