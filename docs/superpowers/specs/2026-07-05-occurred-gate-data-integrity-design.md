# Occurred-gate + sprint-in-standings — data-integrity pass

**Status:** design approved 2026-07-05, ready for planning.
**Context:** the root fix for the fastf1 future-data leak class that caused the 2026-07-04
race-eve firefight (grey helmets, `/weekend` no predictions, fabricated strategy "actual").
Retires the per-table boundary guards shipped that night (`_has_raced`, `_race_concluded`).

## 1. Purpose & root cause

fastf1 exposes **future/other sessions**: for an un-raced weekend it can return leaked laps
(and sometimes results). The pipeline builds feature tables by looping a calendar that
**includes the un-raced target** (the data-currency auto-calendar does, by design), so leaked
rows enter the bundled parquets. The existing `load_session` "no laps → None" guard misses
this because fastf1 *does* return leaked laps.

Everything flows through **two load chokepoints**:
- `src/data/load.py:load_session` (laps → pace, strategy, actual-stops; and podium via
  `build_podium_table(pace_df, results)` — a leaked pace row joined against a resultless
  round is what produced the null-team GB podium rows).
- `src/data/results.py:load_season_results` (results → season-results → standings/form).

**Fix: a date-gate at both chokepoints** — never build a row from a session whose scheduled
date is in the future. This closes the whole class in two places.

**Every feature table is race-gated.** `build_strategy_table` (and podium/pace/actual-stops/
season-results) all require the *race* session for their label/data — there is no
FP2-only or upcoming target builder for strategy (only podium has `build_podium_target`).
So gating the *race* session removes the un-raced target from every table uniformly. The
correct pre-race behavior then follows the original design contract:
- **Podium** still works pre-race via `predict_upcoming_podium` (builds a runtime target from
  standings/form/prior-pace — needs no table row).
- **Strategy** falls to the **historical norm** for the upcoming weekend — exactly what the
  pre-existing test `test_upcoming_next_race_returns_historical_mode` asserts. (The "predicted"
  mode we saw pre-race was *entirely* the leak; Model-B stop-count prediction only has a row
  for completed races. A true pre-race Model-B prediction would need a strategy-upcoming
  builder like podium's — a SEPARATE future slice, out of scope here.)

## 2. Occurred-gate

**`load_session`** — after `fastf1.get_session(...)`, before `s.load()`, check the session's
scheduled datetime (`s.date`, fastf1's naive-UTC convention). If it is in the future relative
to now (UTC), return `None`. If `s.date` is missing/`NaT`, fall through to the existing
"no laps" behavior (do not gate on unknown dates). One added guard, ahead of the leaked-laps
path.

**`load_season_results`** — the schedule row already carries the session dates; skip any round
whose **race date** is in the future (results-based defense; also gates the sprint fetch in §3).

Both use a single shared helper (e.g. `src/data/load.py:session_in_future(dt, now=None)`), so
the "future" definition lives in one place and is unit-testable with an injected `now`.

## 3. Sprint-in-standings

`load_season_results` currently fetches only the **race ("R")** session per round, so
championship `points` and `form` reflect main races only — sprints are invisible.

- **Standings include sprints:** for each round, additionally fetch the **"Sprint"** session
  (date-gated per §2; absent on non-sprint weekends → contribute 0) and **add its points** to
  that round's per-driver `points`. So `champ_points_before` reflects the real championship.
- **Form stays main-race-only:** `finish_pos` (feeding `form_finish_avg3`) remains the *race*
  finish. Form is a race-result trend; folding in shorter sprints muddies it. (Owner decision.)
- Sprint fetch failures / non-sprint weekends degrade to 0 sprint points, never an error.

Note: this is standings accuracy, not a model change. It slightly shifts `champ_points_before`
/ `champ_rank_before`; the podium model is unchanged.

## 4. Retire the boundary guards (ship WITH the clean rebuild)

Once the source tables are gated clean, last night's runtime guards are redundant:
- Remove `_has_raced` + its use in `api/podium.py` (route by table membership as before).
- Remove `_race_concluded` + `_SCHEDULE` load in `api/strategy.py`, and revert the
  `app/data/weekend-schedule.json` entry from `api/strategy.py`'s `vercel.json` includeFiles.
- Update/remove the guard-specific tests (`test_api_podium.py` leaked-target test;
  `test_api_strategy_modes.py` `_race_concluded` tests) — the leaked scenario no longer exists.

**Ordering (critical):** the guard removal MUST ship in the **same change** that rebuilds and
commits the clean parquets, so there is never a window of "leaked table + no guard." One PR,
one deploy.

**Replacement safety — a build-time assertion (stronger than a runtime patch):** in
`scripts/build_2026.py`, after the tables are built, assert that **no live-season row exists
for a round whose race has not occurred** (compare each live-season table's gps against the
date-derived completed set from `src/data/schedule.py:derive_live_calendar`). On violation,
**raise** — R17 fails loudly and does NOT deploy leaked data (fail-safe: stale-but-clean beats
fresh-but-leaked). This verifies the gate is working every run.

## 5. Rebuild, verify, R17

- Regenerate the bundled parquets through the gated pipeline (`build_all` / `build_2026.py`),
  copy into `api/`, and commit the clean tables (same PR as §4).
- Verify no un-raced rows in the rebuilt tables; verify a sprint weekend's driver `points`
  now include sprint points.
- R17 (`scripts/build_2026.py`) runs the gated pipeline going forward — no re-leak; the new
  build-time assertion runs each cron.
- **Race-day self-correction:** when GB's race occurs, `s.date` is in the past → the gate
  admits it → the next build includes real GB. No manual intervention.

## 6. Non-goals

- **Grid-weight calibration** (how strongly quali sharpens the podium) — a separate tuning
  slice; no model change here.
- No change to the podium/strategy/compound models or their features (only the `points`
  input value shifts, from adding sprint points).
- No change to R17's schedule/calendar derivation, the cron, or the frontend.
- Not fixing the currently-deployed leaked tables by hand — the rebuild replaces them.

## 7. Testing

- **Date-gate unit tests** (`tests/`): `session_in_future` with injected `now` (past →
  admit, future → gate, `None`/`NaT` → not gated); a `load_session` test that a future-dated
  session returns `None` even when fastf1 yields laps (mock/stub fastf1); a
  `load_season_results` test that a future-dated round is skipped.
- **Sprint test:** a sprint weekend's per-driver `points` = race points + sprint points; a
  non-sprint weekend is unchanged; sprint fetch failure → race points only.
- **Build-time assertion test:** the assertion flags a table containing an un-raced live-season
  round and passes on a clean table.
- **Guard removal:** `api/podium.py` / `api/strategy.py` still return correct modes for
  historical + upcoming (existing mode tests, minus the retired guard-specific ones).
- Full pytest + vitest green; `npm run build` clean.

## 8. Files

- **Edited:** `src/data/load.py` (date-gate + `session_in_future` helper);
  `src/data/results.py` (`load_season_results`: date-gate + sprint points);
  `api/podium.py` (remove `_has_raced`); `api/strategy.py` (remove `_race_concluded` +
  schedule load); `vercel.json` (revert the strategy weekend-schedule bundle);
  `scripts/build_2026.py` (build-time no-un-raced-rows assertion); the bundled `api/*.parquet`
  (regenerated clean); guard-specific tests updated/removed.
- **New:** date-gate + sprint + assertion tests.
- **Untouched:** the podium/strategy/compound models + features; R17 workflow; the cron; the
  frontend; the calendar/schedule derivation.
