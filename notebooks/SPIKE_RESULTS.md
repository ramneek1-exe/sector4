# Phase 1 Data Spike — Results & Go/No-Go

**Question (brief §"Why this spike exists"):** Does engineered FP long-run pace +
track-intrinsic features predict race pace better than the grid-position baseline?

**Verdict: NO-GO — decisive.** Engineered FP long-run pace carries real but modest
signal that is clearly weaker than grid position. Do not start Phase 2 on the
current premise without rethinking the thesis (see "What this means").

---

## Method

- **Data:** 2023–2025. A **representative 8-circuit mix** spanning the overtaking
  spectrum so the grid baseline is not artificially strong:
  - low overtaking: Spain, Hungary, Abu Dhabi
  - medium: Bahrain, Mexico City
  - high overtaking: Saudi Arabia, Italy (Monza), Las Vegas
  - all dry, non-sprint (FP2 exists), recurring across all three years.
- **Sample:** 388 driver-rows, 23 weekends (2025 Las Vegas dropped — unusable data;
  2023 Mexico via FP1 fallback after a wet FP2).
- **Validation:** rolling-origin CV — train on 2023, predict 2024 & 2025 (15
  held-out races). No random k-fold. Leakage guard: grid position is the only
  weekend input taken from the race; race lap times feed the target only.
- **Deg-slope hardened:** per-stint slope fit with the **Theil-Sen** robust
  estimator (median of pairwise slopes), which removes the ±10 s/lap OLS artifacts
  that short stints produced in the first pass.

## HEADLINE DIAGNOSTIC — does engineered FP pace track race pace?

Per-weekend Spearman ρ of each signal vs actual race pace (averaged over all
weekends). This isolates the core question from the model and from DNF/finishing
noise:

| Signal | ρ vs race pace |
|---|---|
| **Engineered FP long-run pace** | **+0.446** |
| Grid position | +0.661 |

FP pace is predictive — but materially *less* predictive than grid alone.

## Model vs baselines (15 held-out races)

| Predictor | Pace MAE (s/lap) | Top-3 | Spearman ρ |
|---|---|---|---|
| Model A (Random Forest) | 0.471 | 0.644 | 0.739 |
| **Grid position (baseline to beat)** | n/a | **0.778** | **0.752** |
| Raw FP pace (engineered, no model) | 0.698 | 0.511 | 0.571 |
| Naive mean (MAE floor) | 0.604 | n/a | n/a |

## Decision gate

| Gate condition | Pass? |
|---|---|
| Model top-3 > grid top-3 | ❌ 0.644 vs 0.778 |
| Model ρ > grid ρ | ❌ 0.739 vs 0.752 |
| Model MAE < naive-mean MAE | ✅ 0.471 vs 0.604 |

Model A has genuine pace signal (beats the naive MAE floor by ~22%) but does **not**
beat grid position on either ranking metric. Adding the FP features to grid makes
the model *worse* than grid alone (0.644 vs 0.778 top-3) — the FP signal is too
noisy to net-improve on grid.

## Feature importances (RF on full data)

| Feature | Importance |
|---|---|
| grid_position | 0.511 |
| fp_pace_delta | 0.193 |
| fp_deg_slope | 0.163 |
| n_corners | 0.046 |
| length_km | 0.043 |
| pit_loss_s | 0.023 |
| abrasiveness | 0.021 |

## What this means (the earlier caveat is now refuted)

The first pass (5 low-overtaking circuits) raised the worry that the circuit
selection inflated the baseline (grid scored 73% top-3 there vs the PRD's stated
~50-55%). **This re-run tests and refutes that worry:** adding high-overtaking
tracks made grid *stronger*, not weaker — grid top-3 rose to **0.778**. Grid
genuinely dominates 2023–2025 race outcomes because it already encodes quali pace
plus track position, and modern F1 races are processional.

**The key product finding:** the PRD's thesis assumes grid is a ~50-55% top-3
baseline that good FP-pace features can beat. Empirically, grid is a **~78%**
baseline on 2023–2025. Beating grid is a far higher bar than the PRD assumed.

## Data-quality surprises (carry forward)

- **2025 Las Vegas dropped** — unusable FP/race data for the pipeline.
- **2023 Mexico used FP1 fallback** (wet FP2). The fallback path works as designed.
- **2023 Monza: only 2 drivers** with usable long runs. Low-downforce, low-deg
  tracks are structurally weak for an FP-long-run method (teams run quali sims).
- **Per-weekend driver attrition (13–20 of 20):** drivers without a qualifying long
  run, or with <5 clean green race laps (DNFs), drop out.

## Honest options before any Phase 2 build

1. **Reframe the headline.** Don't market "we beat grid." Grid is ~78% top-3 and
   hard to beat. A pace product can still be valuable as *explanation + uncertainty
   + the strategy/compound models*, with predictions presented as grid-informed
   rather than grid-beating.
2. **If the thesis must be "beat grid," the feature signal isn't there yet.** FP
   pace at ρ≈0.45 vs grid's ρ≈0.66 is a real gap. Closing it would need materially
   better features (true fuel-burn model, historical compound offsets, per-driver
   multi-stint aggregation, traffic-aware cleaning) — speculative, not demonstrated.
3. **Stop and reconsider** rather than build on an unmet premise.

**Bottom line:** the pipeline is correct, tested (30 unit tests), and leakage-safe;
the method was given a fair, representative test with hardened features, and it does
not beat grid. This is a real NO-GO, not a tooling artifact.
