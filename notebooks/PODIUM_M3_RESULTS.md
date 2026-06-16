# M3 — Calibrated Podium Probabilities: Production-Path Trust Anchor

> Manual real-data validation (like `MODEL_B_RESULTS.md`), run from
> `notebooks/07_podium.py`. Proves the **production code path** (`build_podium_table`
> → `rolling_origin_classify` with the shipped unbalanced classifier) reproduces the
> validated podium numbers, and re-measures band reliability against the shipped model.
> Run: `PYTHONPATH=. .venv/bin/python notebooks/07_podium.py`. Last run 2026-06-15.

## Setup

- **Data:** `data/spike_features.parquet` (race pace / grid / finish) + `season_results.parquet`
  (standings / form / track history). **No `qualisim_table` dependency** — quali-sim was
  the Phase-1-cut feature.
- **Sample:** 388 driver-rows / **23 weekends** (8-circuit dry set × 2023–25; one session
  missing upstream), 8 train (2023) + **15 held-out** (2024–25), podium base-rate **0.162**.
- **CV:** rolling-origin (train 1..N, predict N+1), calendar order via `store.prior_weekends`.
- **Model:** standardized logistic regression, **no `class_weight="balanced"`** (the M3
  calibration fix), `predict_proba`.
- **Feature sets:** Friday = `champ_rank_before + champ_points_before + form_finish_avg3 +
  prior_track_pace`; Saturday = Friday + `grid_position`.

## Headline — held-out top-3 + Brier (verbatim run output)

```
rows=388 weekends=23 min_train=8 base_rate=0.162
FRIDAY    top3=0.689 brier=0.085 n=15
SATURDAY  top3=0.733 brier=0.071 n=15
```

| Mode | top-3 | Brier |
|---|---|---|
| FRIDAY (standings + form + prior-track-pace) | **0.689** | **0.085** |
| SATURDAY (+ actual grid) | **0.733** | **0.071** |

These match the spec §0 production numbers exactly → the production code path is faithful.

## The calibration fix is validated (dropping `class_weight="balanced"`)

Same pipeline/sample, balanced vs unbalanced classifier:

| Model | Friday top-3 | Friday Brier | Saturday top-3 | Saturday Brier |
|---|---|---|---|---|
| `balanced` (old Phase-1 config) | 0.667 | 0.146 | 0.733 | 0.124 |
| **`None` — M3 ships this** | **0.689** | **0.085** | **0.733** | **0.071** |

Dropping balancing **nearly halves Brier** (Friday 0.146→0.085, Saturday 0.124→0.071)
while top-3 holds or improves. The overconfidence Phase-1 flagged (high band predicted
0.86, delivered 0.49) is gone (below).

## Band reliability — bands confirmed against the shipped model

```
FRIDAY:    strong        pred=0.72 actual=0.62 n=48
           in contention pred=0.37 actual=0.29 n=34
           outside shot  pred=0.04 actual=0.02 n=182
SATURDAY:  strong        pred=0.74 actual=0.64 n=55
           in contention pred=0.35 actual=0.17 n=23
           outside shot  pred=0.02 actual=0.02 n=186
```

The §6 bands hold up honestly on the unbalanced model:
- **`strong` (p ≥ 0.50)** delivers a **~0.62–0.64** actual podium rate — a genuinely
  strong chance, and the label is honest (mild residual overconfidence ~10 pts, vs the
  balanced model's ~37-pt gap). **Bands confirmed; no threshold change needed.**
- **`in contention` (0.20–0.50)** delivers 0.17–0.29 — a real but minority chance, as intended.
- **`outside shot` (< 0.20)** delivers ~0.02 — correctly longshot.

## Honest caveats (carried forward)

- **Small sample.** 8 train → 23 weekends; ±0.02–0.07 deltas on 15 held-out races are
  partly noise. Directional, not precise.
- **nb 05's "0.711 Friday" was a qsim-filter artifact**, not a target. That number came
  from an inner-join with `qualisim_table` (the cut feature) that dropped ~1 weekend /
  15 rows (373/22 vs the honest 388/23). The production Friday figure is **0.689**.
- **The model still doesn't beat raw grid.** Saturday's 0.733 is below the grid-order
  baseline (~0.778, Phase-1) — exactly why the podium is positioned as honest
  probabilities, not a telemetry edge.
- **Bands, not %.** Reliability is much improved but the product still surfaces
  qualitative bands; numeric `p_podium` is returned `calibrated: false`. The %-upgrade is
  gated on *measured* 2026 calibration (spec §5), not a date.
