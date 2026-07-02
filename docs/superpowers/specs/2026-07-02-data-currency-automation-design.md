# Data-currency automation + R17 hardening — design

**Date:** 2026-07-02
**Status:** approved (design), pending implementation plan
**Related:** `handoff.md` OPEN TODOs #2 (data-currency automation) and #4 (R17 parquet
non-determinism; China single-sample pit-loss noise); R17 workflow
`.github/workflows/refresh-weekend-data.yml` (+ canonical template `docs/ops/`).

## Problem

Two recurring manual chores + two R17 warts:

1. **Manual calendar bump (the toil).** fastf1's real 2026 data runs ahead of the app's
   canonical calendar. Every race weekend the owner hand-edits `RACE_CALENDAR[2026]`
   (`src/calendar.py`) and `app/data/weekend-schedule.json`. This is not cosmetic:
   `store.prior_weekends` treats a completed round as valid training history **only if its
   `race_id` is in `calendar_order()`**, so a stale `RACE_CALENDAR[2026]` silently drops
   recently-completed rounds from podium training.
2. **R17 deploys every run.** Parquet is not byte-deterministic, so `git diff --cached
   --quiet` is always false and R17 commits/deploys on every scheduled run even when nothing
   changed.
3. **China single-sample pit-loss noise.** Circuits with a thin single-season clean-stop
   sample (e.g. China 2026, n=7) yield a noisy pit-loss median that "latest season held"
   selection surfaces verbatim.

## Non-goals

- No change to the inference read path or the leakage-guard semantics.
- No Blob overlay for R17 (the committed-parquet + auto-deploy path stays; see the R17
  header note).
- No end-of-season rollover to the next year's calendar (existing gap, out of scope).
- China fix does not attempt a per-stop record or a new data source; it reuses the
  existing `n` (clean stop-pair count) already carried by `build_pit_loss`.

## The safe detection signal

`fastf1.get_event_schedule(2026)` yields `EventName`, `EventDate`, and per-session dates for
every round. A round has **occurred** when its **race-session datetime is in the past**
(fallback: `EventDate`). This is a date/clock-based gate — it never inspects lap data, so it
is immune to the known fastf1 future-leak (British R9 had laps pre-race, so
"does fastf1 have laps" is an unsafe signal). R17 runs in the only environment that has
fastf1, so derivation happens there and only there; everything downstream reads committed
files.

## Architecture

One new fastf1-touching derivation module + three small consumers + one severable data fix.

### New — `src/data/schedule.py` (fastf1-touching; never imported by inference)

Sits alongside `src/data/results.py` and `src/data/grid.py`. One function:

```
derive_live_calendar(year: int, now: datetime | None = None) -> dict | None
# returns {
#   "calendar": ["Australia", ..., <target>],          # completed rounds + single target
#   "schedule": {                                       # for app/data/weekend-schedule.json
#     "year": year, "gp": <target>,
#     "preQuali": <iso>, "postQuali": <iso>, "final": <iso>,
#     "nextGp": <event-after-target-or-null>,
#   },
# }
# returns None if the schedule fetch fails (caller then leaves committed files untouched).
```

- **`now`** defaults to `datetime.now(timezone.utc)`; injectable for tests.
- **completed** = rounds whose race-session datetime < `now`, in round order.
- **target** = the earliest round whose race is **not** completed (the current/upcoming
  weekend). If none remain (season over) → `target` = the final round; `calendar` = all
  completed.
- **`calendar`** = completed + `[target]` (deduped) — preserves today's behavior (the target
  is included so telemetry lights up at issuance) while **never** including rounds further
  out than the single target (the leak guard).
- **EventName → short key** via an inverse of `GP_TO_EVENT` (`src/calendar.py`). An event not
  present in the inverse map is **skipped with a warning** (never silently corrupts the
  list). Note both `"Barcelona"→"Barcelona Grand Prix"` and `"Spain"→"Spanish Grand Prix"`
  are distinct 2026 entries; the inverse is well-defined (short↔long is 1:1).
- **`schedule` session times**: from the target event's session-date columns; `nextGp` = the
  short key of the event immediately after `target`, or `null` if `target` is the finale.
- **race-session datetime**: resolved robustly per event (handles sprint layouts) with an
  `EventDate` fallback.

### Consumer 1 — `src/calendar.py` reads the derived 2026 list

- 2023–25 stay hardcoded `DRY_CIRCUITS` (immutable validation sets).
- `RACE_CALENDAR[2026]` loads from **`src/race_calendar.json`** at import via
  `Path(__file__).with_name("race_calendar.json")`, **falling back to the current hardcoded
  list** (`_FALLBACK_2026`) if the file is missing or corrupt.
- Module stays pure (JSON read only, no fastf1). `RACE_CALENDAR` remains a module-level dict
  (many call sites do `from src.calendar import RACE_CALENDAR`), computed once at import.
- **Bundling:** `src/race_calendar.json` is picked up by the existing `{src/**}` glob in
  every `vercel.json` function entry — **no `vercel.json` change needed**, and the path
  resolves identically in local, batch, and serverless contexts.

### Consumer 2 — `scripts/build_2026.py` writes both files first (new step 0)

- Call `derive_live_calendar(2026)`; write `src/race_calendar.json` +
  `app/data/weekend-schedule.json`.
- Use the **returned `calendar` list directly** as `LIVE_CIRCUITS` — not the module-level
  `RACE_CALENDAR[2026]`, which is import-cached and would be stale within the same process.
- Table-building does **not** invoke `store.prior_weekends` (the leakage guard is
  inference-time only), so in-process calendar staleness during the build is a non-issue; the
  **committed JSON** is what the deployed serverless functions read.
- If `derive_live_calendar` returns `None` (fetch failure), **leave both files untouched**
  and log a warning — a transient failure never corrupts the committed calendar.
- Ordering: step 0 runs before the existing table builds and before `_refresh_grid` (which
  reads `weekend-schedule.json`), so the grid fetch targets the freshly-derived weekend.

### Consumer 3 — R17 workflow: content-based commit gate

Replace the byte-diff commit gate with a content fingerprint.

- New **`scripts/data_fingerprint.py`** writes stable per-table content hashes (order-
  independent, e.g. hash of a canonicalized `to_csv`/`hash_pandas_object` per table) to
  committed **`api/data-fingerprint.json`**.
- R17 commit step becomes:
  1. `git add api/data-fingerprint.json app/data/*.json src/race_calendar.json` (the
     meaningful, deterministic files).
  2. If `git diff --cached --quiet` → nothing real changed → `git checkout -- api/*.parquet`
     (discard the noisy re-serialization) and **skip commit/deploy**.
  3. Else → `git add api/*.parquet`, commit all, push (triggers Vercel deploy).
- The fingerprint is the "did content actually change" oracle; JSON diffs
  (`grids.json`, `entity-whats.json`, `weekend-schedule.json`, `race_calendar.json`) capture
  currency/entity changes. Update **both** workflow copies (`.github/workflows/` and the
  canonical `docs/ops/` template); per the handoff, the live `.github/workflows/` file must be
  edited via the GitHub web UI or a `workflow`-scoped token (the CI PAT lacks that scope).

### Slice 4 (severable) — China single-sample pit-loss noise

- `build_pit_loss` already carries `n` (clean stop-pair count) per `(gp, year)`.
- Add a **min-sample threshold**: when the latest season's `n` for a circuit is below it,
  prefer a **multi-year median** across that circuit's available seasons rather than the thin
  single-year number. Exact threshold chosen by inspecting the `n` distribution during
  implementation.
- Kept as an independent final slice so it cannot hold up the currency work; touches
  user-facing numbers, so it gets its own verification.

## Data flow

```
R17 (Fri/Sat/Sun cron, has fastf1)
  build_2026.py
    step 0: derive_live_calendar(2026)  ── fastf1.get_event_schedule ──┐
            └─ write src/race_calendar.json                            │ date/clock gate,
            └─ write app/data/weekend-schedule.json                    │ no lap inspection
            └─ LIVE_CIRCUITS = returned calendar                       │
    steps 1..7: build tables (LIVE_CIRCUITS), grid, entity-whats ──────┘
  data_fingerprint.py: write api/data-fingerprint.json
  commit gate: fingerprint/JSON changed? → commit parquet+json → push → Vercel deploy
                                          else → discard parquet churn → no deploy

Serverless (no fastf1)
  src/calendar.py reads src/race_calendar.json (bundled via {src/**})
    → RACE_CALENDAR[2026] current → calendar_order()/prior_weekends correct
```

## Testing

- **`derive_live_calendar`** — pure logic over a mock schedule DataFrame + injected `now`:
  mid-season (completed + target), pre-season (empty completed → target = round 1),
  post-season (no upcoming → target = final round, calendar = all completed), unknown-event
  skip (+ warning), sprint-layout race-datetime resolution, transient-failure → `None`.
- **`src/calendar.py`** — loads JSON when present; falls back to `_FALLBACK_2026` when the
  file is absent or corrupt; 2023–25 lists unchanged; `calendar_order()` reflects the loaded
  2026 list.
- **`data_fingerprint.py`** — identical content → identical hash; a changed cell → changed
  hash; column/row reorder does not change the hash (order-independent).
- **China fix** — a circuit with `n` below threshold uses the multi-year median; a circuit
  with adequate `n` is unchanged.
- **Regression** — 121 pytest / 51 vitest stay green; nb 06 `+0.070` stop-count anchor
  reproduces verbatim; `npm run build` clean; inference still imports no fastf1
  (`tests/test_inference_no_fastf1.py`).

## Load-bearing invariants (do not violate)

- Inference never imports fastf1; `src/calendar.py` stays pure (JSON read only).
- All training goes through `store.prior_weekends` in true calendar order (never
  alphabetical); the derived list stays in real schedule order.
- The occurred-gate never extends past the single upcoming target (fastf1 future-leak guard).
- Round every number that reaches output.

## Known edge cases (spec'd, not hidden)

- **Season over:** `target = None` → calendar = all completed; `weekend-schedule.json` points
  at the final round. Rollover to next season is out of scope (existing gap).
- **Sprint weekends:** race-session datetime resolution handles varied session layouts.
- **Fetch failure:** committed files left untouched; deployed calendar unaffected.
- **Barcelona vs Spain (Madrid):** distinct 2026 events; inverse map keeps them separate.
