# Phase 1 Follow-up — Quali-Sim → Grid & Probabilistic Podium

**Hypothesis tested.** Quali-sim (low-fuel single-lap) pace might predict the GRID
far better than long-run pace predicts the race — it's like-for-like (one fast lap
→ one fast lap). If so, a Friday quali-sim → predicted-grid gives a differentiated
*pre-quali* podium signal, keeping the podium product alive.

**Verdict: NO differentiated pre-quali edge from practice data.** Quali-sim pace
predicts the grid no better than championship standings, and adding it to a podium
classifier *hurts*. A probabilistic podium is shippable on standings + form + track
history, but with no telemetry moat.

---

## PRIMARY — quali-sim pace vs the grid (qualifying order)

Per-weekend Spearman ρ vs actual qualifying position:

| Signal | all weekends | held-out 2024-25 |
|---|---|---|
| Quali-sim pace | +0.596 | +0.636 |
| Championship standings | +0.602 | **+0.640** |
| Recent form | +0.581 | +0.629 |

Quali-sim delta vs pole gap (like-for-like, seconds): **+0.611**.

**Quali-sim ≈ standings (Δ −0.004).** Quali-sim is a *much* better predictor than
long-run pace was (0.64 vs the earlier 0.45 long-run→race), but it does **not** beat
standings — the championship order already encodes the car's one-lap pace. Even the
cleanest like-for-like check (quali-sim vs pole gap) is only +0.611, because FP2
quali sims are noisy (sandbagging, engine modes, fuel, not every driver runs a
representative sim).

## SECONDARY — probabilistic podium classifier (P(top-3))

373 driver-rows / 22 weekends, 15 held-out (2024-25), podium base-rate 0.16.
Rolling-origin CV (train 2023). Logistic regression, predict_proba.

### Incremental ablation (each candidate must improve held-out top-3 or is cut)

| Feature set | Top-3 | Brier | Decision |
|---|---|---|---|
| standings + form (base) | 0.667 | 0.132 | — |
| + prior-year track race pace | **0.711** | 0.141 | ✅ kept (+0.044) |
| + quali-sim grid (Friday) | 0.667 | 0.128 | ❌ cut (−0.044) |
| + constructor standings | 0.644 | 0.128 | ❌ cut |

The only feature that helped was **prior-year race pace at the circuit** (track
affinity from past *results*, not practice telemetry). Quali-sim grid and
constructor standings both failed to earn their place.

### Friday vs Saturday modes, vs baselines

| | Top-3 | Brier |
|---|---|---|
| Standings-order baseline | 0.667 | — |
| FRIDAY classifier (with quali-sim grid) | 0.667 | 0.128 |
| **Best Friday model (standings+form+track, no practice data)** | **0.711** | 0.141 |
| SATURDAY classifier (actual grid) | 0.733 | 0.122 |
| Grid-order baseline (Saturday) | 0.778 | — |

- The Friday classifier *with* quali-sim grid only matches the standings baseline
  (0.667); the quali-sim feature drags down the better track-history model.
- Saturday's actual grid tightens Friday by +0.067 — but the Saturday model (0.733)
  still **doesn't beat raw grid order (0.778)**: on Saturday, just trusting the grid
  is better than the model (small sample, but notable).

### Probability calibration (Friday, pooled held-out)

| Predicted band | mean predicted | actual podium rate | n |
|---|---|---|---|
| 0.0–0.2 | 0.04 | 0.00 | 148 |
| 0.2–0.5 | 0.32 | 0.14 | 37 |
| 0.5–1.0 | 0.86 | **0.49** | 78 |

**Probabilities are overconfident** — the high-confidence band predicts 0.86 but
delivers 0.49. As-is they don't "mean something." This is an artifact of
`class_weight=balanced` on a tiny sample; honest probabilities need real calibration
(isotonic/Platt) and more data than ~22 weekends give.

## Decision gate

- **GO** needs quali-sim to beat standings at grid **AND** the Friday podium to beat
  ~0.667. **Both fail** → no differentiated pre-quali edge.
- → Gate's second branch: the podium can run on **standings + form + grid + track
  history** as probabilities (shippable: Friday ~0.71, Saturday ~0.73), but with **no
  practice-data moat**, and the Saturday model doesn't even beat raw grid order.

## Recommendation

**Demote podium prediction from the headline.** Across all Phase-1 spikes, no
practice-telemetry signal (FP long-run OR quali-sim) gives a podium-accuracy edge
over grid (Saturday) or standings/form (Friday). What the telemetry pipeline *does*
defensibly add:
- **Predicted pace gaps in seconds + uncertainty** (validated earlier: MAE well below
  the naive floor) — information no order-based signal can produce.
- The strategy/compound **Model B** and the **learning layer** (PRD §6.2/§6.6), which
  don't depend on beating grid.

A standings/form/track podium with honest, *calibrated* probabilities (sharpening
Friday → Saturday as grid arrives) is still a legitimate feature — just not the
telemetry-driven differentiator the PRD headlines. That is a product-positioning
decision for the owner.

## STRETCH — not built

Championship projection was gated on "if the finish predictor works." It doesn't show
a differentiated edge, so per the brief the stretch was not started.

## Caveats

- Small sample (8→22 training weekends; ±0.04–0.07 deltas on 15 held-out races are
  partly noise).
- 8-circuit set is all conventional-format (no sprint corruption).
- Standings/form are themselves downstream of car pace, which is why they're hard to
  beat with one noisy practice session.
