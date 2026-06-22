# M5 — Recency-weighting validation (Task 7)

**Question:** does adding recency `sample_weight` to the telemetry models regress the
validated +0.07 stop-count edge?

**Method:** `scripts/validate_recency_weights.py` reproduces nb 06's PART 1 strategy
anchor faithfully — regressor (`rolling_origin_predict` + round via `acc_mae`), train on
all 2023, walk-forward 2024-25, features `BASE_TRACK + FP_DEG`, baseline
`hist_modal_stops` — on the persisted `strategy_features.parquet` (no fastf1). Then the
SAME loop is re-run with `recency_weights(train, test_year, half_life)` on each fit.

**Result (reproduces the anchor verbatim):**

| Predictor | Acc | Edge vs baseline |
|---|---|---|
| track-norm baseline (modal) | 0.641 | — |
| track+FP deg (UNWEIGHTED, nb06) | **0.711** | **+0.070** |
| track+FP deg (half_life=4.0) | 0.711 | +0.070 ✅ |
| track+FP deg (half_life=3.0) | 0.711 | +0.070 ✅ |
| track+FP deg (half_life=2.0) | 0.711 | +0.070 ✅ |
| track+FP deg (half_life=1.0) | 0.711 | +0.070 ✅ |

**Decision:** every half-life holds the edge. Weighting is a **no-op on the same-era
2023-25 anchor** — early walk-forward folds train only on 2023 (uniform weight within a
fold), and for later folds the rounded RF predictions are unchanged by the decay. The
weighting's real effect only appears once **different-era 2026 rows** enter the training
pool (down-weighting the 2023-25 base), which is the production scenario and is NOT
backtestable until Austria FP runs (~2026-06-26).

**Production default:** `half_life_years = 2.0` (unchanged in `weights.py` / `pace.py` /
`strategy.py`). For a 2026 target this weights 2026 rows 1.0, 2025 ≈0.71, 2024 0.5,
2023 ≈0.35 — a reasonable reg-reset balance: lets 2026 count more as it accumulates
without discarding the history that currently carries the model while 2026 is sparse.
Re-confirm on real 2026 telemetry once it exists.
