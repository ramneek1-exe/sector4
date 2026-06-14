# Phase 1 Follow-up — Friday-State Ablation: Does FP Pace Add Value Pre-Quali?

**Why this exists.** The prior spike showed FP long-run pace doesn't beat grid
position. But grid is a Saturday/post-qualifying input, while Sector 4's signature
window (PRD §7.3) is **Friday → pre-quali**, when grid doesn't exist yet. The grid
benchmark tested a proposition the product isn't about. This tests the real one:

> With grid and qualifying excluded entirely, does engineered FP long-run pace add
> incremental predictive value over the signals available on **Friday** (championship
> standings, recent form, historical track results)?

## Method (reused from the prior spike)

Same representative 8-circuit set, same FP feature pipeline (hardened Theil-Sen deg
slope), same rolling-origin CV (train 2023, predict 2024+2025 = 15 held-out races),
same leakage guards. Added Friday features computed **strictly from races prior in
time** (results-only pulls, full calendar):

- `champ_points_before` / `champ_rank_before` — current-season standings before the race
- `form_finish_avg3` — trailing-3-race average finishing position (crosses seasons)
- `track_hist_finish` — driver's average finish at this circuit in prior years

Grid position and all qualifying data are **excluded everywhere**.

## (3) Headline — per-weekend Spearman ρ vs race pace, each signal alone

| Signal (Friday-available) | ρ vs race pace |
|---|---|
| Championship standings (rank) | **+0.711** |
| Recent form (trailing-3 finish) | +0.612 |
| **Engineered FP long-run pace** | **+0.446** |

**FP pace is the weakest of the three Friday signals.** Standings and form predict
race pace materially better than the engineered FP feature.

## (1) Ablation results (15 held-out races)

| Model / baseline | Pace MAE | Top-3 | Spearman ρ |
|---|---|---|---|
| C_combined (Friday + FP) | **0.427** | 0.644 | **0.703** |
| A_friday (Friday only, no FP) | 0.449 | **0.667** | 0.614 |
| B_fp (FP only) | 0.601 | 0.378 | 0.430 |
| Standings-order (non-model baseline) | — | 0.667 | — |
| Trailing-3 form (non-model baseline) | — | 0.644 | 0.668 |
| Naive-mean (MAE floor) | 0.604 | — | — |

## (2) Does FP add incremental value over Friday signals? (C vs A)

| Metric | C_combined | A_friday | Δ |
|---|---|---|---|
| Top-3 | 0.644 | 0.667 | **−0.022** |
| Spearman ρ | 0.703 | 0.614 | **+0.089** |
| Pace MAE | 0.427 | 0.449 | −0.022 (better) |

FP **helps full-field ranking (ρ) and pace MAE**, but **does not help podium top-3**
(−0.022 ≈ one podium slot across 15 races — noise-level).

## (4) C_combined feature importances

| Feature | Importance |
|---|---|
| champ_rank_before | 0.494 |
| form_finish_avg3 | 0.115 |
| fp_pace_delta | 0.108 |
| fp_deg_slope | 0.089 |
| track_hist_finish | 0.067 |
| champ_points_before | 0.056 |
| n_corners / length_km / abrasiveness / pit_loss_s | ≤0.028 each |

Standings rank dominates; the two FP features together (~0.20) are secondary.

## Decision

**NO-GO for prediction-as-headline**, per the predefined gate (which requires C to
beat A on **top-3 AND ρ**; top-3 did not improve, so the conditional-GO bar is not
met — and the bar was not lowered to pass it).

This is **not** the "FP adds literally nothing" case — FP measurably improves ρ
(+0.089) and pace MAE. The accurate one-liner: **FP pace is dominated by standings
and recent form, and is only marginally additive — it sharpens full-field ordering
and pace estimates, but not the podium.**

## (5) Secondary — the one place FP uniquely adds value

C_combined's **MAE 0.427 vs the naive floor 0.604**: predicted **pace gaps in
seconds** are information that **no order-based signal (standings or grid) can
produce**. Model A's defensible role is therefore **predicted pace gaps + visible
uncertainty**, as a *supporting* feature behind Model B (strategy/compound) and the
learning layer — exactly the gate's NO-GO recommendation: demote prediction from the
headline, keep it as supporting context.

## Caveats (not hidden)

- **Small sample:** 8 training weekends growing to 22; metric deltas of ±0.02–0.09
  on 15 held-out races are partly noise. Directionally robust, not precise.
- **Track-history coverage 57%:** Vegas debut, rookies, and first visits impute to a
  neutral mid-grid value, weakening that feature.
- Standings/form are themselves partly downstream of car pace, so "Friday signals
  beat FP" partly reflects that season-long results already encode the car's pace
  more cleanly than one noisy practice session does.

## Bottom line

Across both spikes: engineered FP long-run pace does not carry enough clean signal to
headline a race-ranking product — it loses to grid (Saturday) and to standings/form
(Friday). Its real, defensible value is **pace-gap magnitude + uncertainty**, which
order-based baselines can't provide. Recommend reframing Model A as a supporting
feature, not the headline, before any Phase 2 build. (Phase 2 not started.)
