# M4 — Telemetry Differentiators: Design

> Spec for PRD §11 **M4**. *Done when:* pace-gap context (Model A) and stop-count
> strategy (Model B, with safety-car caveat) are live, surfacing **deg → stops** as the
> teachable narrative. Authored 2026-06-20. Builds on the M3 podium integration pattern
> (`api/podium.py` + `app/lib/*`), which this mirrors.

## 1. Goal & positioning

Make Sector 4's **two validated telemetry contributions** queryable end-to-end on the
deployed app:

1. **Pace gaps + uncertainty** (Model A, `predict_pace_gaps`) — demoted to a *supporting*
   feature. NOT a podium ranking. Its honest value is "how far apart are the cars on
   long-run pace, and how sure are we."
2. **Stop-count strategy** (Model B, `predict_stop_counts`) — the **only** signal that
   beats a strong baseline (+0.07 vs track-norm; gain isolates to FP deg features; causal
   deg→stops). This is the genuine telemetry differentiator and the prime explainer hook.

Plus two supporting items that reinforce the deg→stops story and the honesty principle:

3. **Tyre-deg / stint-length lookups** (`lookup_stat`) — already implemented in
   `src/inference/lookup.py`; M4 wires them through the app so the deg number is concrete.
4. **Pit-loss honesty fix** — stop presenting the generic 21.0 default as a curated fact
   for non-curated circuits.

Honesty framing is load-bearing: pace gaps are explicitly "supporting context, not a
podium call"; stop-count carries the safety-car caveat at all times; the strategy story
leads with the **track/conditions-level** call (different teams run different strategies,
so per-driver precision is secondary).

## 2. Scope (locked in brainstorming)

| # | Capability | Render | Notes |
|---|---|---|---|
| 1 | `predict_pace` | Standalone card: ranked helmets + pace-delta + uncertainty band | "Supporting context, not podium" copy |
| 2 | `predict_strategy` | Card: **race-level dominant stop call first** → deg→stops narrative → secondary per-driver detail | SC caveat always visible |
| 3 | `lookup_stat` (tyre_deg, stint_length) | Reuses the M2 stat-lookup card | Python already implemented; wire frontend + ship table |
| 4 | Pit-loss honesty fix | n/a | Non-curated → honest "not available" (`value: None`) |

**Out of scope (unchanged non-goals / deferred):** data-derived pit-loss for all circuits
(PRD §7.2 data work — only the honesty guard lands here), dominant-compound prediction
(NO-GO), weather/safety-car probability modeling, per-driver compound preference, any new
circuits beyond the validated 8-circuit dry slice (+ Monaco for pit-loss only).

## 3. Architecture

Mirrors the M3 podium integration. Per-request inference (not precompute lookup); the two
Haiku calls run in the Next server; Python serverless fns under `/api/` do pure inference
reading bundled parquet tables (never fastf1).

### 3.1 Python serverless functions

Three fns total after M4 (plus the existing `api/podium.py`):

- **`api/inference.py`** — stays **slim** (no sklearn). Currently serves `pit_loss`.
  Extends to serve `tyre_deg` + `stint_length` (these read the strategy feature table, no
  ML) and gains the pit-loss honesty guard. Bundles `strategy_features.parquet`.
- **`api/pace.py`** (NEW) — wraps `src.inference.pace.predict_pace_gaps`. Ships
  `pace_features.parquet` + sklearn. Pattern copied verbatim from `api/podium.py`
  (cold-start `pd.read_parquet`, explicit `table=` pass, `sys.path` bootstrap, HTTP glue
  in `handler`, logic in a `*_response(body)` function).
- **`api/strategy.py`** (NEW) — wraps `src.inference.strategy.predict_stop_counts`. Ships
  `strategy_features.parquet` + sklearn. Same pattern.

Each ML fn carries sklearn/scipy and stays well under Vercel's 500MB Python limit (podium
is ~371MB; the M2 overage was batch-only deps — fastf1/matplotlib — which are excluded).
The slim `inference` fn must NOT pull sklearn (guarded by
`tests/test_inference_no_fastf1.py`; extend it to also assert the deg-lookup path stays
sklearn-free).

**Rejected:** combining pace+strategy into one `api/predict.py`. Each Vercel fn bundles
its own deps regardless, so combining saves nothing on size; separate fns match the podium
pattern, keep each callable's response contract clean, and isolate failures.

### 3.2 Race-level stop summary (additive Python change)

`predict_stop_counts` currently returns only `drivers: [...]`. Add an **additive**
race-level summary so the StrategyCard can lead with the dominant call without re-deriving
in TS:

```
{
  ...existing fields (year, gp, qualitative, n_train_races, sc_caveat, drivers),
  "dominant": {                  # null in the qualitative / empty-driver branches
    "n_stops": <int>,            # modal predicted stop count across drivers
    "share": <float 0..1>,       # fraction of drivers predicted that count, rounded
    "n_drivers": <int>
  }
}
```

Pure transform over the existing per-driver predictions; computed in
`src/inference/strategy.py`; rounded at the boundary. The qualitative / no-data branches
return `dominant: null` (consistent with the existing `drivers: []` shape).

### 3.3 Feature tables

`src/pipeline.py:build_all()` (the ONLY fastf1 toucher) already writes both
`data/pace_features.parquet` and `data/strategy_features.parquet`. M4:

1. Run `build_all()` to (re)generate the tables.
2. Copy into `api/`: `api/pace_features.parquet`, `api/strategy_features.parquet`.
3. Register in `vercel.json` `includeFiles` (brace glob, like podium).
4. Document the regen command in each fn's docstring (mirrors `api/podium.py`):
   `PYTHONPATH=. .venv/bin/python -c "from src.pipeline import build_all; build_all()"`
   then `cp data/{pace,strategy}_features.parquet api/`.

`strategy_features.parquet` is bundled into BOTH `api/inference.py` (deg/stint lookups) and
`api/strategy.py` (stop counts). It is small (~tens of KB); duplication is acceptable.

### 3.4 Frontend wiring

- **`app/lib/parser.ts`** — `predict_pace`, `predict_strategy` intents and the
  `tyre_deg`/`stint_length` stat enums ALREADY exist. Tighten the tool descriptions so the
  parser reliably routes "who's fastest on long runs / race pace" → `predict_pace`, "how
  many stops / one-stop or two-stop" → `predict_strategy`, "how fast do tyres wear / how
  long do stints last" → `lookup_stat` with the right `stat`.
- **`app/lib/circuits.ts`** — add Monaco aliases (`monaco`, `monte carlo` → `Monaco`).
  Today `normalizeCircuit` is scoped to the 8-circuit podium/pace/strategy slice and
  returns `null` otherwise. Add a second normalizer (or a `scope` arg) for the **lookup**
  path whose valid set is the 9 pit-loss-curated circuits (the 8 + Monaco); deg/stint are
  only valid for the 8 (strategy-table circuits). Lookups currently bypass normalization
  (only literal "Monaco" worked, per the M2 defect) — route them through it so "Monza" →
  Italy resolves.
- **`app/lib/orchestrate.ts`** — add branches for `predict_pace` and `predict_strategy`;
  extend the `lookup_stat` branch to `tyre_deg` + `stint_length`. New deps:
  `predictPace`/`narratePace`, `predictStrategy`/`narrateStrategy`. The `Answer` union
  gains `{ supported: true; pace: PaceFacts; narrative }` and
  `{ supported: true; strategy: StrategyFacts; narrative }`. Unsupported-circuit messages
  reuse the existing honest pattern.
- **`app/lib/narrative.ts`** — `PaceFacts` + `generatePaceNarrative` (grounded; honest
  "supporting, not a podium call"; never name a winner; speak in gaps + uncertainty).
  `StrategyFacts` + `generateStrategyNarrative` (grounded; lead with the dominant
  track-level call; explain **deg → stops** as the teachable mechanism; ALWAYS include the
  SC caveat; "do not invent facts"). Both follow the existing system-prompt shape (use ONLY
  the JSON facts, no invented numbers/drivers/causes; qualitative/no-data → say so plainly).
- **`app/api/ask/route.ts`** — dispatch each new intent to its Python fn (`/api/pace`,
  `/api/strategy`, `/api/inference`) and corresponding narrator, wired through
  `orchestrate`.

### 3.5 Rendering (cards)

- **`PaceCard`** — ranked list of driver helmets (`AsciiGlyph`, reusing the M3 helmet
  system) ordered fastest→slowest with pace-delta (s) and an uncertainty band; header copy
  marks it supporting context, not a podium prediction. Sparse-prior → qualitative band
  message (no fake precision).
- **`StrategyCard`** — order matters (owner decision): (1) **race-level dominant call**
  ("Mostly a one-stop here" with the share), (2) the **deg→stops narrative** as the
  centerpiece, (3) the **SC caveat** visible, (4) **secondary** per-driver detail (helmet +
  N tyre-count glyphs reusing the `TyreSpinner` tyre motif + confidence). Qualitative /
  low-data → honest "not enough prior weekends yet."
- Both reuse the existing reveal/legibility treatment, the `drivers.json`/`teams.json`
  source of truth (codes → name/number/personalColor; year-correct team from the API), and
  the canvas ASCII rendering. No new DOM-ASCII attempts (the `shaders` pkg can't ASCII-ify
  DOM — settled in M2/M3).

### 3.6 Pit-loss honesty fix

Today `track_features(gp)` returns `_DEFAULTS` (pit_loss 21.0) for unknown circuits and
`lookup_stat` labels it `source: "curated track features"` — a confidently-wrong number.
Fix in the lookup layer (NOT by deleting `_DEFAULTS`, which the feature pipeline still
needs as a prior):

- Expose the curated circuit set (e.g. a `CURATED_TRACKS` membership check derived from
  `_TRACKS` keys in `src/features/track.py`).
- In `lookup_stat`'s `pit_loss` branch, if the circuit is NOT curated, return
  `{stat, gp, value: None, units: None, source: "not available for this circuit"}`.
- The narrative + card already handle `value: None` (the M2 unsupported path); confirm the
  copy reads as an honest "we don't have a measured pit-loss for this circuit yet," not an
  error.

## 4. Data flow (per query)

```
NL query
  → /api/ask (Next server)
    → parseQuery (Haiku #1, tool-use → intent + entities)
    → normalizeCircuit (slice/scope guard; honest reject if out of slice)
    → POST the matching Python fn:  predict_pace → /api/pace
                                    predict_strategy → /api/strategy
                                    lookup_stat → /api/inference
    → narrate (Haiku #2, grounded in ONLY the returned JSON facts)
  → Answer { supported, <facts>, narrative }
  → PaceCard | StrategyCard | StatCard  (canvas glyphs + reveal)
```

## 5. Testing & verification

- **pytest:** race-level `dominant` summary (modal + share + null branches); pit-loss
  honesty guard (non-curated → `value None`, curated unchanged); deg/stint lookup wiring
  reads the strategy table correctly; extend `tests/test_inference_no_fastf1.py` so the
  deg-lookup path stays sklearn-free *and* fastf1-free. Existing pace/strategy callable
  tests stay green; the trust anchor (`notebooks/06_strategy_compound.py`) must still
  reproduce the +0.07 stop-count edge verbatim.
- **vitest:** orchestrate `predict_pace`/`predict_strategy`/deg-lookup branches;
  `narrative` grounding (no invented facts; SC caveat present in strategy; "not a podium
  call" in pace); `circuits` Monaco alias + lookup-scope normalization; card rendering
  smoke (helmets present, numbers legible, dominant call rendered first).
- **Build:** `npm run build` clean.
- **Live preview deploy (required):** the Next↔Python hop is NOT testable under
  `vercel dev` (Next owns `/api/*`), so verify on a real Vercel branch preview —
  `POST /api/pace`, `POST /api/strategy`, `POST /api/inference` (deg/stint) return 200; the
  end-to-end `/api/ask` flow renders each card; an out-of-slice circuit returns the honest
  message; a non-curated pit-loss returns "not available" (not 21.0). Ensure
  `ANTHROPIC_API_KEY` is on the **Preview** env (per-environment; M3 gotcha).

## 6. Invariants (must not regress)

- Inference NEVER imports fastf1; the slim `api/inference.py` path NEVER imports sklearn.
- All training goes through `store.prior_weekends` (true calendar order, never
  alphabetical) — already enforced by the callables; M4 adds no new training paths.
- Round every number that reaches output.
- Logic lives in `src/`; the app/Python fns are thin orchestration.
- ASCII rendering stays on canvas; all motion gated behind `prefers-reduced-motion`.
- Never oversell: pace = supporting context not podium; strategy = caveated, conditions-led.

## 7. Risks / open items

- **Small-sample caveat** (~22 weekends; ±0.02–0.09 partly noise) — keep copy honest;
  don't over-claim per-driver stop precision (owner's exact concern → race-level-led card).
- **SC uncertainty** — the +0.07 is dry/SC-clean; live accuracy is lower. Caveat always on.
- **Deployment size** — three ML fns now (podium/pace/strategy); each independently under
  500MB. If a future fn approaches the limit, revisit consolidation.
- **Calibration** — pace uncertainty is a per-tree std (honest band, not a calibrated
  interval); do not present it as a confidence interval.
