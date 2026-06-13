# CLAUDE.md — Sector 4

Always-on context for Claude Code working on this repo. This is a high-signal summary, not the full spec. **Before planning any work, read `sector4-prd.md` (the spec) and `phase-1-data-spike.md` (the current task).** Product decisions: PRD wins. Spike plan: the spike brief wins.

## What this is

Sector 4 is a natural language interface over F1 telemetry that produces ML-backed race-pace predictions with grounded explanations, plus a curated learning layer. Audience: the casual F1 fan who watches races but skips practice. The 2026 regulation reset is treated as a visible product feature (the model learns the season as it unfolds), not hidden behind a confident UI.

## Locked decisions that affect code

- **Model A is pace regression, not winner classification.** Predict each driver's race-pace delta; rank to get the podium. Top-3 falls out of the ranking.
- **Model B is strategy + compound**, one model, two outputs: per-driver stop count (1 vs 2) and a race-level dominant-compound call. Compound prediction needs the weekend's Pirelli allocation as an input.
- **Computed-stat lookups (no ML):** pit-lane time loss and tyre deg / stint length are surfaced from already-computed pipeline values via a `lookup_stat` intent.
- **Feature engineering is the hard part**, not model choice. The FP long-run pipeline (stint detection → lap cleaning → fuel correction → compound normalization → track-evolution correction) is in PRD §7.2. Random Forest is the starting point.
- **LLM layer: Claude Haiku 4.5** (`claude-haiku-4-5-20251001`), two calls per query — query parser (intent + entities, strict tool-use/JSON) and grounded narrative generator (fed feature importances, "do not invent facts" constraint). Intents: `predict_pace` / `predict_strategy` / `predict_compound` / `lookup_stat` / `explain_concept`.
- **Stack:** Next.js (App Router) + TypeScript monorepo; Python ML in Vercel Python runtime under `/api/` (no separate FastAPI service); fastf1 / pandas / scikit-learn; shaders.com (`shaders` npm) for WebGPU Ascii/Dither visuals; GSAP for motion.
- **Metrics (PRD §5):** pace MAE (engineering), top-3 accuracy (product headline), Spearman rho (honesty). Baseline to beat: grid position alone.
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

## Decision gate (Phase 1)

If Model A beats the grid-position baseline on top-3 and Spearman rho, and MAE is materially better than a naive pace baseline → proceed to Phase 2. If not → stop, report which features are weak, and reconsider before any app build.
