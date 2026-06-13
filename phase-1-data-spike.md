# Sector 4 — Phase 1 Build Brief: The Data Spike

> Handoff doc for the first Claude Code session. Assumes `sector4-prd.md` is in the repo. This brief is the *task*; the PRD is the *spec*. Where they reference each other, the PRD wins on product decisions and this doc wins on the concrete spike plan.

---

## Why this spike exists (read first)

The entire product rests on one unproven assumption: that **compound-normalized, fuel-corrected Free Practice long-run pace + track-intrinsic features can predict race pace better than naive baselines.** Everything else — the glyphs, the reveal animation, the narratives, the learning layer — is decoration on top of predictions that have to be good.

So before any app, frontend, LLM, or API work, this spike answers one question: **does Model A beat the grid-position baseline?** If it can't, we learn that now, cheaply, and rethink features before sinking time into the build.

Do **not** build any UI, LLM, FastAPI, or app scaffolding in this session. Pure data + ML validation. (See PRD §4 Non-Goals.)

---

## Critical: which data to use for the spike

Use **2023–2025 historical seasons** for this spike, NOT 2026 data.

Reasoning: 2026 is the regulation reset (PRD §7.2) and its data is sparse and non-stationary — the wrong thing to validate a *method* on. The spike is **methodology validation**: prove the pipeline + model can beat baseline at all, using the rich historical seasons where there's lots of data and known outcomes. Production will later run transfer learning on 2026 data per PRD §7.2 — that's a separate concern. If you train on sparse 2026 data here and conclude "the method fails," that's a false negative. Validate the method on rich data first.

---

## Definition of done

A reproducible notebook/script that, for a held-out set of historical races, reports:

- **Pace MAE** (s/lap) for Model A
- **Top-3 accuracy** (did the predicted top-3 contain the actual podium?)
- **Spearman rho** between predicted and actual finishing order
- The same three for the **grid-position baseline**
- A **feature-importance** readout for Model A

…plus a one-paragraph **go / no-go** call.

**The spike bar is "beats the baseline meaningfully," not the absolute PRD targets.** The PRD §5 targets (MAE < 0.20 s/lap, top-3 ≥ 60%, rho ≥ 0.65) were set against 2026 production data; on rich historical data you'd hope to clear them, but the decision gate is: *does the model beat grid-position-alone on top-3 and rho, and is MAE materially better than a naive pace baseline?* If no, stop and reconsider features before building anything.

---

## Environment

- Python 3.11+, virtual environment
- Dependencies: `fastf1`, `pandas`, `numpy`, `scikit-learn`, `scipy` (Spearman), `matplotlib` (EDA only). Defer `shap` to later — use `feature_importances_` for the spike.
- Enable the fastf1 cache early: `fastf1.Cache.enable_cache("cache/")`. Gitignore `cache/`.

## Suggested repo structure

```
sector4/
  cache/                  # fastf1 cache — gitignore
  data/                   # intermediate parquet — gitignore
  notebooks/
    01_eda.ipynb          # exploration
    02_spike.ipynb        # the end-to-end spike + results
  src/
    data/load.py          # session loading wrappers
    features/stints.py     # stint detection + lap cleaning
    features/pace.py       # fuel / compound / evolution corrections
    features/track.py      # track-intrinsic features
    features/assemble.py   # build the model feature table
    models/pace_model.py   # train + rolling-origin CV
    eval/baseline.py       # grid-position baseline
    eval/metrics.py        # MAE, top-3, Spearman
  CLAUDE.md                # project context for the agent (see note below)
  requirements.txt
  README.md
```

Build reusable functions in `src/` and call them from the notebook, rather than burying logic in cells — it makes the eventual production port (PRD §7.1) far easier.

---

## The work, step by step

Each step lists intent and the gotchas to respect. Implement the code in-session; this is the spec, not the implementation.

**Step 0 — Sanity load.** Load one session (e.g. Barcelona 2024, FP2). Confirm fastf1 works and inspect the `laps` dataframe columns (`Driver`, `LapTime`, `Stint`, `Compound`, `TyreLife`, `PitInTime`/`PitOutTime`, `TrackStatus`, `IsAccurate`, `Deleted`). Understand the shape before writing pipeline code.

**Step 1 — Stint detection & lap cleaning.** Group laps into stints (same driver, same compound, no pit between). Keep only stints ≥ 5 laps (the "long run" threshold, PRD §7.2). Within each stint: drop the out-lap and in-lap, drop laps where `TrackStatus` isn't green (yellow/SC/red), drop deleted laps, drop laps slower than 107% of the stint median (traffic/mistakes). fastf1 helpers like `pick_quicklaps` and `pick_track_status` can assist but verify what they actually filter.

**Step 2 — Per-stint pace model.** For each cleaned stint, fit lap time vs. lap-number-in-stint (linear). Extract two features: the **slope** (tyre deg + fuel-burn effect) and the **intercept / adjusted clean pace**. Remember the sign: lap times trend *down* as fuel burns, *up* as tyres degrade — the slope is the net.

**Step 3 — Compound & track-evolution correction.** Normalize stint pace across compounds (a C3 run and a C5 run aren't comparable raw) using per-track historical compound offsets. Correct for track evolution by comparing each stint to the session-wide rolling median, removing the "track rubbered in between runs" effect.

**Step 4 — Track-intrinsic features.** Per circuit: length, a tyre-abrasiveness proxy, historical pit-lane time loss, and anything else cheap and circuit-stable. These are the features that *transfer* across regulation eras (PRD §7.2).

**Step 5 — Feature table & target.** Assemble one row per driver per race weekend: adjusted FP long-run pace, deg slope, grid position, track-intrinsic features. **Target** = the driver's actual race pace (median green-flag race lap, fuel-corrected) — define this carefully and document it. Guard against leakage: nothing race-derived may be an input feature.

**Step 6 — Baseline.** Predict finishing order from grid position alone (and optionally a second baseline: "fastest cleaned FP long-run wins"). Compute top-3 and Spearman rho for the baseline. This is the number to beat.

**Step 7 — Model A.** Train a `RandomForestRegressor` on pace delta. Evaluate with **rolling-origin CV** (train races 1..N, validate N+1; never random k-fold — it leaks the future into the past). Derive predicted ranking from predicted pace → top-3 and rho. Record MAE.

**Step 8 — Compare & inspect.** Model vs. baseline on all three metrics. Pull `feature_importances_` to see what's actually driving predictions — sanity-check that it's the FP-pace and track features, not something leaky.

**Step 9 — Report & decide.** Results table + go/no-go paragraph. If go: note which features mattered (informs the production model). If no-go: note what's weak before proposing feature changes.

---

## Guardrails / common failure modes

- **Don't train on 2026 data for the spike** (see above). Method validation uses 2023–2025.
- **No random k-fold** on this small, time-ordered sample — rolling-origin only.
- **Leakage**: race-derived quantities must never be features predicting that race.
- **fastf1 quirks**: `LapTime` can be `NaT`; some sessions have partial data; deleted/invalidated laps exist; track status codes matter. Handle defensively.
- **Sandbagging / quali sims** pollute FP — the ≥5-lap stint filter mitigates but won't fully remove; eyeball a few stints in EDA.
- **Be polite to the API**: cache aggressively; don't refetch sessions you already have cached.

---

## What to hand back

The metrics table, the go/no-go call, the feature-importance notes, and any data-quality surprises worth carrying into the production model. That output is the input to writing the real §11 milestones in the PRD.

---

## Note on CLAUDE.md

For the Claude Code workflow, add a short `CLAUDE.md` at the repo root with: the one-paragraph product summary, the locked decisions that affect code (pace *regression* not winner classification; Claude Haiku 4.5 for LLM later; Next.js + Vercel Python; shaders.com for visuals; the §5 metrics), and a pointer to read `sector4-prd.md` and this brief before planning. Keep it tight — it's always-on context, not a second copy of the PRD. (Happy to generate this stub next if you want it.)
