# CLAUDE.md — Sector 4

Always-on context for Claude Code working on this repo. This is a high-signal summary, not the full spec. **Before planning any work, read `sector4-prd.md` (the spec) and `handoff.md` (current state).** Phase 1 (data/ML validation) is **complete**; `phase-1-data-spike.md` is historical. The build starts at PRD §11 **M1**. Product decisions: PRD wins.

## What this is

Sector 4 is an **explainer-led F1 weekend companion** — a natural-language interface that helps casual fans *understand* a race weekend, pairing honest, calibrated predictions with grounded explanations and a learning layer. It competes on **experience, honesty, and explanation, not predictive edge**: Phase 1 found telemetry gives no podium edge over public baselines (grid/standings/form — see PRD §5.1). Audience: the casual F1 fan who watches races but skips practice. The 2026 reset is a visible feature — the model learns the season as it unfolds and **calibration improves with data**, not hidden behind a confident UI.

## Locked decisions that affect code

- **Model A is pace regression (per-driver pace delta), DEMOTED to a supporting role.** Its validated value is predicted pace **gaps + uncertainty**, NOT podium ranking. The **podium is presented as honest, CALIBRATED probabilities** from public signals (championship standings + recent form + prior-year-track-pace + actual grid as available), **sharpening Friday → Saturday** — not a telemetry edge (FP pace doesn't beat grid/standings; PRD §5.1). Early-season, show qualitative bands until calibration matures.
- **Model B is strategy + compound**, two outputs, validated separately (Phase 1, see findings below): **stop count (per driver) is a VALIDATED telemetry edge** (+0.07 over track-norm; gain isolates to FP deg features; causal deg→stops) — ship as a *supporting, caveated* capability (likely strategy WITH explicit safety-car uncertainty; live accuracy trails the dry/SC-clean backtest) and a prime explainer hook. **Dominant compound is NO-GO** — no telemetry edge; runs on historical "typical compound here" (Pirelli allocation still required as input).
- **Computed-stat lookups (no ML):** pit-lane time loss and tyre deg / stint length are surfaced from already-computed pipeline values via a `lookup_stat` intent.
- **Feature engineering is the hard part**, not model choice. The FP long-run pipeline (stint detection → lap cleaning → fuel correction → compound normalization → track-evolution correction) is in PRD §7.2. Random Forest is the starting point.
- **LLM layer: Claude Haiku 4.5** (`claude-haiku-4-5-20251001`), two calls per query — query parser (intent + entities, strict tool-use/JSON) and grounded narrative generator (fed feature importances, "do not invent facts" constraint). Intents: `predict_pace` / `predict_strategy` / `predict_compound` / `lookup_stat` / `explain_concept`.
- **Learning layer = whats + whys** (PRD §6.6, the product heart). **Whys** = grounded per-prediction narratives (feature attributions; "do not invent facts"), linked inline to the whats they reference. **Whats**, two types: (1) ~15–25 **concept whats** authored/verified by hand, evergreen; (2) **entity whats** (drivers/teams/circuits) dynamically retrieved from an **allowlist**, summarized by Haiku as a short **original paraphrase, always cited + linked, cached**, auto-badged "drafted, unverified". Hard facts (driver→team, number) come from **`drivers.json`** (source of truth), NEVER cached prose. Per-content-type TTL; entity whats refresh on the race-weekend ops cadence (no separate scheduler); on change, reset badge to "drafted, unverified". Hard rule: original paraphrase only, never reproduced passages, allowlist sources, keep the corrections form.
- **Stack:** Next.js (App Router) + TypeScript monorepo; Python ML in Vercel Python runtime under `/api/` (no separate FastAPI service); fastf1 / pandas / scikit-learn; shaders.com (`shaders` npm) for WebGPU Ascii/Dither visuals; GSAP for motion.
- **Metrics (PRD §5):** **calibration (Brier/reliability) is the primary product-honesty metric** (improves across the season); pace MAE is the validated engineering metric (pace gaps); top-3 is reported **alongside** the standings/grid baselines for honesty, **not** a "beat the baseline" target.
- **Visual system is fully abstract** (PRD §8): side-profile helmet glyph in team color + personal number in personal color (contrast-guard fallback to black/white) + three-letter code in Space Grotesk alongside. Generic car silhouette in team colors; color-coded tires; everything can run through the Ascii/Dither reveal.
- **Type system (4 roles):** Bebas Neue (display/logo), Lastik (serif body), Space Grotesk (data labels), a mono (ASCII characters). Wordmark only — no pictorial logo.

## Hard constraints (do not violate)

- **No driver photos, no faces, no signatures, no flags-in-numbers.** Visual identity is abstract glyphs only — this is a deliberate rights decision (PRD §8). Don't reintroduce likeness imagery.
- **No team logos, no F1 / FOM / FIA marks, no reproduced liveries.** Team colors on generic shapes only.
- **No Pirelli branding** on tire glyphs — color coding + compound letter only.
- **Honor the non-goals (PRD §4):** no qualifying prediction, no lap-by-lap live prediction, no betting/odds, no user accounts, no native app, no news aggregation, no standalone driver bios. New feature ideas go to §12 fast-follow, not into v1.
- **Narrative must be grounded** in actual model feature attributions; never let the LLM invent facts.

## House rules for the agent

- **Don't train on 2026 data for the Phase 1 spike.** Validate the method on rich 2023–2025 historical data. 2026 is the sparse reg-reset season and would produce a false-negative result. (See spike brief.)
- **No random k-fold** on the small, time-ordered race sample — use rolling-origin CV (train races 1..N, validate N+1).
- **Guard against leakage:** nothing race-derived may be an input feature for predicting that race.
- **Logic lives in `src/`**, called from notebooks — don't bury pipeline logic in notebook cells. It makes the production port far easier.
- **Cache fastf1 aggressively** (`fastf1.Cache.enable_cache("cache/")`); gitignore `cache/` and `data/`. Be polite to the API — don't refetch cached sessions.
- **Round every number that reaches output.** Float artifacts leak otherwise.
- **Phase discipline:** the Phase 1 spike is pure data/ML validation — no frontend, no LLM, no API, no app scaffolding. Stop at the go/no-go decision and report.
- **Plan before building.** Propose the approach, confirm against the PRD/spike brief, then implement. Surface go/no-go honestly — if Model A can't beat the baseline, say so rather than tuning the bar.
- **Commits:** small, focused, conventional-style messages (e.g. `feat:`, `fix:`, `chore:`); one logical change per commit. **Do not add any Claude/AI attribution** — no "Generated with Claude Code" line, no "Co-Authored-By: Claude" trailer, no robot emoji. Commit messages contain only the change description.

## Phase 1 findings (resolved — 2023–2025 data spikes)

Phase 1 is complete. Telemetry has **two validated contributions**, and several capabilities showed **no telemetry edge** over public/historical baselines. Full evidence in `notebooks/*_RESULTS.md`.

| Capability | Telemetry edge over baseline? |
|---|---|
| Model A — podium vs grid (Saturday) | No |
| Model A — pre-quali podium vs standings/form (Friday) | No |
| Quali-sim → grid vs standings | No |
| **Model B — stop-count strategy vs track-norm** | **Yes (+0.07)** |
| Model B — dominant compound vs track-norm | No |

- **Validated telemetry value:** (1) **predicted pace gaps + uncertainty** (Model A, demoted to a supporting feature), and (2) **stop-count strategy** (Model B) — the latter is the only signal that beats a strong baseline, exactly where the causal deg→stops link predicts.
- **Runs on public/historical baselines (no telemetry edge):** podium ranking (grid / standings / form, as honest probabilities) and dominant compound (historical "typical compound here").
- **Product implication:** lead with the explainer/learning layer + honest probabilities; let the genuine telemetry differentiator be **stop-count strategy + pace-gap context**, not podium accuracy or compound.

Methodology note for any future ML work here: rolling-origin CV (never random k-fold), strict leakage guards (nothing race-derived as an input for that race; historical/standings features from strictly prior races; FP from this weekend only), Theil-Sen deg slopes, dry representative circuit set, surface go/no-go honestly rather than tuning the bar.
