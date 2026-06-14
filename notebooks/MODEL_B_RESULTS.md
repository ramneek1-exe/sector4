# Phase 1 — Model B Spike: Strategy & Compound from FP Deg

**Question.** Do FP degradation features beat the track-historical-norm baseline at
predicting (1) pit-stop strategy and (2) the dominant compound? This is telemetry's
best shot: tyre deg directly drives pit strategy, and deg is what FP long runs
measure.

**Verdict: a split result — and the program's first GO.**
- **STRATEGY (stop count): GO (qualified).** FP deg beats the track-norm baseline by
  **+0.070** accuracy. The only validated telemetry edge in all of Phase 1.
- **COMPOUND (dominant): NO-GO.** FP deg ties the track-norm; runs on history.

Method: 8-circuit dry set, hardened Theil-Sen deg slopes, rolling-origin CV (train
2023, predict 2024-25 = 15 held-out races), leakage guards. Race + FP2 cached. SC
disruption flagged via track status; 0 held-out races exceeded the 10% threshold, so
the held-out set is clean planned strategy.

## Part 1 — Strategy (per-driver stop count)

437 driver-rows / 22 weekends. Target: pit stops = stints − 1.

| Predictor | Accuracy | MAE |
|---|---|---|
| Track-norm baseline (historical modal stops) | 0.641 | 0.389 |
| Model: track features only (pit-loss, abrasiveness, temp, hist-modal) | 0.658 | 0.468 |
| **Model: track + FP deg (overall + per-compound + stint feasibility)** | **0.711** | 0.455 |

- **FP deg adds +0.053 over track-only and +0.070 over the norm.** The gain comes
  specifically from the deg features, which is the causal story (more deg → more
  stops) holding up empirically.
- MAE is slightly worse for the model — an integer-rounding artifact (a regressor
  predicting 1.4 rounds to the correct stop count but carries 0.4 absolute error).
  Accuracy is the right metric for an integer stop count.

## Part 2 — Dominant compound (race-level)

15 held-out races; held-out distribution HARD 11 / SOFT 3 / MEDIUM 1.

| Predictor | Accuracy |
|---|---|
| Track-norm baseline (historical dominant compound) | 0.733 |
| Model (FP deg + track features) | 0.733 |

- **FP deg adds nothing (Δ 0.000).** With 11/15 races HARD-dominant, the baseline is
  effectively "predict the usual compound," and FP deg can't improve on it. The
  sample is too small and too skewed to conclude more.

## Decision gate (independent)

- **Strategy → GO (qualified):** FP deg beats track-norm by ~+0.07 on stop count.
  Model B's stop-count side is a real telemetry-driven capability and can carry
  product weight.
- **Compound → NO-GO:** FP deg ≈ track-norm. Frame the dominant-compound call as
  "typical compound here" (historical), with no telemetry edge.

## Caveats

- Modest magnitude (+0.07) on a small, dry, SC-clean sample. Real races add
  safety-car chaos that degrades any planned-strategy prediction — production must
  surface that uncertainty.
- Compound sample (15, HARD-skewed) is too thin for a strong conclusion beyond
  "majority class is hard to beat."
- Stop count here is the realized count on dry, low-SC races; production should still
  flag SC-forced stops.

## Where this leaves Phase 1 (consolidated, all spikes)

| Capability | Telemetry edge over baseline? |
|---|---|
| Model A — race-pace podium (vs grid) | No |
| Model A — pre-quali podium (vs standings/form) | No |
| Quali-sim → grid (vs standings) | No |
| **Model B — stop-count strategy (vs track norm)** | **Yes (+0.07)** |
| Model B — dominant compound (vs track norm) | No |

**Telemetry's validated value is narrow but real: predicted pace GAPS + uncertainty
(Model A, demoted), and STOP-COUNT STRATEGY (Model B).** Podium ranking and dominant
compound run on non-telemetry baselines (grid / standings / historical norms).
Product implication: lead with the explainer/learning layer and honest probabilities;
let the genuine telemetry differentiator be **strategy (stop count) + pace-gap
context**, not podium accuracy. Phase 2 not started.
