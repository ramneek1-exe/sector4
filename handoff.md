# Project Handoff: Sector 4

> Living context doc so a fresh session never cold-starts. Read this first, then
> `CLAUDE.md`, `sector4-prd.md`, and `notebooks/*_RESULTS.md`. Last updated 2026-06-14.
> **Status: Phase 1 COMPLETE + product repositioned (explainer-led). Build STARTED:
> PRD §11 M1 (productionize the pipeline as a callable library) is COMPLETE on branch
> `m1-productionize-pipeline`. Next action is PRD §11 M2 (thin end-to-end slice).**

## 🎯 1. Current Goal & Status

**Ultimate goal of Phase 1:** Decide — cheaply, on rich 2023–2025 historical data —
whether FP-telemetry features can power Sector 4's predictions, *before* building any
app. Pure data/ML validation; no frontend/LLM/API (phase discipline).

**Where we are now: Phase 1 is COMPLETE.** Five spikes run, go/no-go reached on every
capability, all work committed and pushed to `origin/main`. The consolidated result:

| Capability | Telemetry edge over baseline? |
|---|---|
| Model A — podium vs grid (Saturday) | **No** (FP pace ρ≈0.45 vs grid ρ≈0.66; grid ≈0.78 top-3) |
| Model A — pre-quali podium vs standings/form (Friday) | **No** (FP dominated by standings ρ0.71 / form ρ0.61) |
| Quali-sim pace → grid vs standings | **No** (0.636 ≈ 0.640) |
| **Model B — stop-count strategy vs track-norm** | **YES (+0.07: 0.711 vs 0.641)** |
| Model B — dominant compound vs track-norm | **No** (0.733 = 0.733) |

**Telemetry's two VALIDATED contributions:** (1) predicted **pace gaps + uncertainty**
(Model A, demoted to supporting), and (2) **stop-count strategy** (Model B). Podium
ranking and dominant compound run on public/historical baselines (grid, standings,
form, historical compound norms) with no telemetry edge.

**Repositioning (this session, docs-only):** the product pivots from "Predictive
Telemetry Intelligence" (an oracle) to an **explainer-led F1 weekend companion** — it
competes on experience, honesty, and explanation, not predictive edge. `sector4-prd.md`
(§1, §3, §5 + new §5.1 findings, §6.2, §6.4, §6.6 learning-layer redesign, §7.2, §11
M1–M7 milestones, §12) and `CLAUDE.md` were rewritten to match; this `handoff.md`
refreshed. **51 unit tests still pass; no code changed.** The full Phase-1 pipeline,
tests, and `notebooks/*_RESULTS.md` evidence are on `main`.

## 🚫 2. Failed Approaches & Experiments (DO NOT REPEAT)

- **Sorting weekends by `race_id` (alphabetical) before rolling-origin CV** → silent
  **look-ahead leakage** (trained on December races to predict March). FIX: pass an
  explicit *calendar-ordered* race list (`ordered_races`) into the CV/baselines.
- **Selecting each driver's *fastest* FP stint + OLS deg slope** → garbage features:
  fastest stint = low-fuel quali sim (misrepresents race pace); OLS on 4–5 laps
  produced physically impossible ±11 s/lap slopes. FIX: use the *longest* stint +
  **Theil-Sen** robust slope + clip to [-0.5, 1.0].
- **First circuit set (5 all-low-overtaking tracks)** made the grid baseline look
  artificially strong (73% top-3) and raised a false "circuit bias" worry. FIX:
  representative 8-circuit set spanning the overtaking spectrum — which *refuted* the
  worry (grid rose to 78%, i.e. grid is genuinely dominant).
- **Quali-sim-predicted grid as a podium-classifier feature** → *hurt* held-out top-3
  (−0.044); cut. **Constructor standings** → no gain; cut. (Incremental ablation works.)
- **`class_weight="balanced"` logistic for podium probabilities** → overconfident
  (predicts 0.86 where actual rate is 0.49). Probabilities are NOT yet calibrated.
- **Infra gotchas already fixed:** `to_parquet` needs `pyarrow` (now pinned); fastf1
  `enable_cache` requires the dir to exist first; running a script from `notebooks/`
  breaks `import src` without a sys.path bootstrap; unanchored `data/` in `.gitignore`
  silently ignored `src/data/` (now `/data/`).

## 🔑 3. Key Decisions & Rationale

- **Validate on 2023–2025, never 2026** — 2026 is the sparse reg-reset; training there
  would be a false negative. (House rule.)
- **Rolling-origin CV only** (train races 1..N, predict N+1); never random k-fold on a
  small time-ordered sample. **Strict leakage guards:** nothing race-derived feeds the
  prediction of that race; standings/form/track-history from strictly prior races; FP
  from this weekend only.
- **Evaluation contract:** MAE judged on actual *race pace*; top-3 and Spearman judged
  on actual *finishing order* (DNFs/strategy matter for the product metric).
- **Representative 8-circuit dry set:** Bahrain, Saudi Arabia, Spain, Hungary, Italy,
  Mexico City, Las Vegas, Abu Dhabi (all conventional/non-sprint, recurring 2023–25).
- **Logic lives in `src/`**, notebooks/scripts only orchestrate (eases production port).
- **Model A demoted** to pace-gaps + uncertainty (no podium edge). **Model B is a
  split:** stop-count = validated telemetry edge → ship as *supporting + SC-caveated*
  capability and an explainer hook (deg→stops is teachable); dominant compound = NO-GO,
  runs on historical "typical compound here."
- **Product pivot (owner-driven, now LOCKED into PRD/CLAUDE):** explainer-led product
  with honest **calibrated** podium probabilities (standings + form + prior-year-track-
  pace + grid-as-available, sharpening Friday→Saturday; qualitative bands until
  calibration matures); telemetry differentiator = stop-count strategy + pace-gap
  context, not podium. Calibration improves as 2026 data accumulates ("learns the season").
- **Learning layer design (PRD §6.6):** **whats** (knowledge, trusted by verification) +
  **whys** (per-prediction grounded narratives, trusted by grounding, linked to whats).
  Whats = hand-authored **concept whats** (evergreen) + dynamically-retrieved **entity
  whats** (allowlist → Haiku short original paraphrase → cite+link → cache, auto
  "drafted, unverified"). Hard facts from `drivers.json`, never cached prose; per-type
  TTL refresh on the race-weekend ops cadence; badge resets to "drafted" on change.

## 🛠️ 4. Immediate Next Steps & Open Questions

**M1 is COMPLETE (branch `m1-productionize-pipeline`). Build continues at PRD §11 M2 (dependency-ordered, no dates):**
1. ✅ **M1 — Productionize the Phase 1 pipeline:** DONE. Callable core library (no app
   scaffolding yet — that's M2). Spec/plan in `docs/superpowers/{specs,plans}/2026-06-14-m1-*`.
   - **Batch layer** `src/pipeline.py` (the ONLY code that imports fastf1 + touches `cache/`)
     builds & persists parquet feature tables via `src/store.py`.
   - **Inference layer** `src/inference/{lookup,pace,strategy}.py` reads ONLY the parquet
     tables (never fastf1 — enforced by `tests/test_inference_no_fastf1.py`), trains the
     cheap model at call time on strictly-prior weekends through the single leakage
     chokepoint `store.prior_weekends` (true calendar order from `src/calendar.py`).
   - Three callables: `lookup_stat` (no ML), `predict_pace_gaps` (Model A, demoted —
     deltas + per-tree uncertainty), `predict_stop_counts` (Model B, +0.07 edge, always
     with `SC_CAVEAT`). Sparse-prior → qualitative band, not fake precision.
   - 74 tests pass; nb 06 still reproduces the validated **+0.07** stop-count edge verbatim.
   - **Deferred to M2 (when the API response schema is defined):** dedup `MIN_TRAIN_RACES`
     (declared in both pace.py + strategy.py) and the per-callable target-row lookup into a
     shared home (e.g. `store.target_weekend`); normalize return shapes across the 3
     callables (the empty-target qualitative branch omits `n_train_races`).
2. **M2 — Thin end-to-end slice:** one computed-stat lookup query NL→parser→Python→
   narrative→ASCII/dither reveal on the deployed app (proves the architecture). Wire the
   `/api/` path to `from src.inference import ...`. **Start here.**
3. **M3 — Calibrated podium probabilities** (the headline feature), then M4 telemetry
   differentiators, **M5 private beta at a real 2026 weekend (forcing function)**, M6
   learning layer, M7 breadth+polish. See PRD §11.

**Open questions / uncertainties to validate later:**
- **Podium probability calibration** — current probs are overconfident; needs
  isotonic/Platt + more data before any "%” is shown in UI.
- **Safety-car uncertainty for strategy** — the +0.07 stop-count edge is on a dry,
  SC-clean backtest; live accuracy will be lower. Need an explicit SC-uncertainty band.
- **Small-sample caveat everywhere** — ~22 weekends; deltas of ±0.02–0.09 are partly
  noise. Re-confirm on more circuits/seasons before over-committing.
- **Compound sample is thin** (15 races, HARD-skewed) — "no edge" is directional only.

## 🚦 5. Instructions for the Next Session

Phase 1 is finished and the repositioning is locked into the PRD/CLAUDE; treat the
validated split as settled (stop-count strategy = real telemetry edge; podium/compound =
baseline-driven) and the product as explainer-led, not predictive-edge. **M1 is done** —
the pipeline is now a callable library (`src/pipeline.py` batch build + `src/inference/*`,
fastf1-free). The next build task is **M2** (thin end-to-end slice) — start there only
when the user asks. Preserve the load-bearing invariants when extending: inference must
never import fastf1; all training must go through `store.prior_weekends` (calendar order,
never alphabetical); round every number that reaches output; keep all logic in `src/`; and
do not oversell predictions in any code, copy, or UI.
