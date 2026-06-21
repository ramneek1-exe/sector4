# Project Handoff: Sector 4

> Living context doc so a fresh session never cold-starts. Read this first, then
> `CLAUDE.md`, `sector4-prd.md`, and `notebooks/*_RESULTS.md`. Last updated 2026-06-20.
> **Status: Phase 1 COMPLETE + product repositioned (explainer-led). M1 (pipeline lib,
> PR #1), M2 (thin slice), M3 BACKEND + live podium integration (PR #3), AND the M3
> FRONTEND (ASCII/dither glyph + UI system) are all MERGED to `main` and live on
> PRODUCTION (`sector4-zeta.vercel.app`).**
>
> **M4 — telemetry differentiators: IMPLEMENTATION COMPLETE on branch
> `m4-telemetry-differentiators`, locally verified, NOT yet deployed or merged.** Pace-gap
> context (Model A, supporting) + stop-count strategy (Model B, race-level call leads, SC
> caveat always on, deg→stops teachable narrative) are wired end-to-end, plus tyre-deg/
> stint-length lookups and a pit-loss honesty fix (non-curated circuits → honest "not
> available", never the 21.0 default). 121 pytest + 51 vitest pass, `npm run build` clean,
> the +0.070 stop-count trust anchor (nb 06) reproduces verbatim, and a whole-branch code
> review came back fix-then-merge (only 2 minors, both fixed). **VERIFIED ON A LIVE VERCEL
> PREVIEW** (branch push → git-integration build `dpl_J1vBUr4NGQpaX5iJk5uhDmVJQxx5`, READY,
> 4 Python lambdas): `/api/pace`, `/api/strategy`, deg/stint lookups, non-curated pit-loss
> (honest `null`), and `/api/ask` end-to-end (pace/strategy/deg, circuit aliases normalized,
> grounded narratives) all return correctly. **REMAINING: merge the branch (owner decision).
> Next milestone after M4: M5 — private beta at a real 2026 weekend (the forcing function).**

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
2. ✅ **M2 — Thin end-to-end slice:** COMPLETE — verified **end-to-end on a live Vercel
   preview deploy** (exceeds the original local-only DoD). Branch `m2-thin-end-to-end-slice`;
   spec/plan in `docs/superpowers/{specs,plans}/2026-06-14-m2-*`.
   Anchor query "How much time is lost in the pit lane at Monaco?" flows
   NL→parser→Python→narrative→ASCII/dither reveal. Build: Next.js (App Router, TS) at
   repo root; the two Haiku calls run in the Next server (`app/lib/{parser,narrative,
   orchestrate}.ts` + `app/api/ask/route.ts`); the Python serverless fn `api/inference.py`
   is pure inference wrapping `src.inference.lookup` (fastf1-free); `app/components/Reveal.tsx`
   is the shared reveal. Added a curated **Monaco** entry to `src/features/track.py`
   (`pit_loss_s 19.5`). 79 pytest + 9 vitest tests pass; `npm run build` clean.
   - **Final paths note:** the Python fn landed at `api/inference.py` (URL `/api/inference`),
     not the design doc's earlier `api/py/lookup.py` text — the plan's File Structure is
     authoritative and the `/api/ask` route targets `/api/inference`.
   - **VERIFIED (2026-06-15) on Vercel preview** `sector4-…vercel.app`: `POST /api/inference`
     → 200 `{value:19.5}` (the Python fn IS reached → **Next ↔ Python `/api` routing coexists
     on real Vercel, no shadow/collision**); `POST /api/ask` → grounded 19.5s narrative;
     off-slice query → honest unsupported message. Browser shows the card + reveal + "Powered
     by Shaders". Also smoke-verified locally: standalone Python HTTP handler, and a guarded
     live-Haiku test (`app/lib/live.smoke.test.ts`).
   - **`vercel dev` caveat (learned):** for a Next.js project `vercel dev` runs only `next dev`
     and does **not** serve top-level Python `/api/*` functions (Next owns `/api/*`, returns
     404). So the Next↔Python hop is **not** testable under `vercel dev` — it must be verified
     on a real deploy (as done). The M2 spec's "vercel dev faithfully emulates prod" assumption
     was wrong for the Next+Python combo.
   - **Deploy mechanics (for next time):** `.vercelignore` now excludes local `.venv/cache/data/
     node_modules/.next/.claude` (the fastf1 cache had a >100MB file that failed upload). The
     `ANTHROPIC_API_KEY` was passed per-deploy via `--env`; for a persistent/prod deploy set it
     as a project env var instead. Preview **Deployment Protection** was relaxed to test (it
     401s server-to-server fetches); owner may re-enable. Deploy was a **preview**, not prod.
   - **DONE (was deferred): Python fn dependency slimming.** `src/inference/__init__.py` is now
     lazy (the `lookup_stat` path no longer imports sklearn — guarded by a subprocess test in
     `tests/test_inference_no_fastf1.py`); `requirements.txt` is the **slim runtime set**
     (pandas/pyarrow/numpy) the function ships, and `requirements-dev.txt` holds fastf1/sklearn/
     scipy/matplotlib/pytest for local dev + the batch pipeline. This is what got the function
     under Vercel's 500MB Python Lambda limit (was ~505MB).
   - **Key finding — §6.7 reveal fidelity:** the `shaders` npm pkg (`shaders/react` v2.5.130)
     `Ascii` node ASCII-ifies a child *shader's* output, NOT arbitrary DOM; the only DOM-
     capture path (`DOMTexture`) is Chrome-Canary-flag-gated and explicitly non-production.
     So a true "card text dissolving from ASCII noise" is not production-viable with this
     package. M2 ships a faithful alternative: a decorative ASCII-over-noise backdrop behind
     an always-readable card + GSAP fade; reduced-motion / no-WebGPU → plain fade.
     **Observed in the deployed app: the card currently renders STATICALLY — no animation.**
     Two causes: (1) the GSAP fade is mis-timed — `page.tsx` sets `active` during `loading`
     too, so the fade fires on the empty loading placeholder and never re-runs when the card
     content mounts (effect deps `[fallback, active]` don't change); (2) the shader path is a
     static, WebGPU-gated decorative backdrop, never a content resolve. **Deferred to M3+**
     (when the reveal goes system-wide): fix the fade timing AND choose the real signature-
     reveal approach (different lib / WebGL ASCII / accept canvas-only content). The fade fix
     is small (fire on the answer mounting, not on the loading placeholder).
     **Open product decision for the owner** stands: how faithful to §6.7 to be.
   - **KNOWN DEFECT (tracked — owner approved merge on condition this is fixed):**
     pit-loss is **only curated for 9 circuits** (the dry spike set + Monaco). Any other
     circuit silently returns the generic `_DEFAULTS` **21.0** — but still labelled
     `source: "curated track features"`, i.e. a confidently-WRONG number (violates the
     honesty principle). Compounded by **no circuit-name normalization**: the Haiku parser
     emits free-text names ("Monza", "Spa", "Mexico", "Italian Grand Prix") that don't match
     the curated keys ("Italy", "Mexico City", …), so even curated circuits miss → 21.0.
     Net: only literal "Monaco" works. **Fix (M3 / data work):** (1) derive pit-loss from data
     for ALL circuits per PRD §7.2 (the real answer); (2) until then, make `lookup_stat`
     return an honest "not available for this circuit" (value None) instead of the 21.0
     default for non-curated GPs; (3) normalize circuit names → canonical keys (or constrain
     the parser to a known list). The `_DEFAULTS` prior can stay for the FEATURE pipeline but
     must not be presented to users as a curated fact.
   - **Remaining follow-ups (not blocking M2):** a persistent/production deploy (set
     `ANTHROPIC_API_KEY` as a project env var; re-enable Deployment Protection if desired);
     the M1-carried cleanups when the API schema grows past lookup (dedup `MIN_TRAIN_RACES`
     across pace.py/strategy.py; normalize the three callables' return shapes).
3. ✅ **M3 — Calibrated podium probabilities (BACKEND slice):** COMPLETE — branch
   `m3-calibrated-podium-probabilities`; spec/plan in `docs/superpowers/{specs,plans}/
   2026-06-15-m3-*`. New fastf1-free callable `src/inference/podium.py:predict_podium`
   (standings + form + prior-track-pace, + grid as available) returns honest qualitative
   bands (`strong` / `in contention` / `outside shot`) that **sharpen Friday→Saturday**
   (auto-mode: Saturday when grid present). Numeric `p_podium` is returned but flagged
   `calibrated: false` so the %-upgrade is pre-wired. Supporting work: `build_podium_table`
   (pure transform, `src/pipeline.py`), `prior_track_pace` (`src/features/friday.py`,
   moved out of nb 05), `GP_TO_EVENT` (`src/calendar.py`), `store.PODIUM_TABLE`, and
   `band_for` + **dropped `class_weight="balanced"`** in `src/models/podium_model.py`.
   100 pytest + 17 vitest pass. Trust anchor `notebooks/07_podium.py` + `PODIUM_M3_RESULTS.md`
   reproduces the production held-out numbers from real data: **Saturday top-3 0.733 /
   Brier 0.071, Friday 0.689 / 0.085** (unbalanced).
   - **Key findings (this slice):** (a) dropping `class_weight="balanced"` nearly **halves
     Brier** (Fri 0.146→0.085, Sat 0.124→0.071) while top-3 holds — the `strong` band now
     delivers ~0.62–0.64 actual (was 0.86-pred/0.49-actual). Bands confirmed honest, no
     threshold change. (b) nb 05's **"0.711 Friday" was a qsim-inner-join artifact** (the
     cut feature dropped ~1 weekend); the honest production Friday is **0.689**. (c) Saturday
     0.733 still trails raw grid (~0.778) — podium stays positioned as honest probabilities,
     not a telemetry edge.
   - **%-transition contract (M5 inherits, spec §5):** showing numeric % is gated on
     **measured** calibration (enough 2026 data to fit isotonic/Platt **and** a passing
     reliability check), NOT on a date. Bands are the honest default; % is an earned upgrade.
   - ✅ **LIVE PREVIEW INTEGRATION (this session, Option B = per-request inference):** podium
     is now queryable end-to-end in the M2 app and **VERIFIED on a real Vercel branch preview**.
     `api/podium.py` is a dedicated serverless fn running `predict_podium` LIVE (ships sklearn +
     the 17KB `api/podium_features.parquet`; the whole fn is **~371MB, well under Vercel's 500MB
     limit** — the M2 overage was batch-only deps (fastf1/matplotlib), NOT the ML stack). Wiring:
     parser gained a `predict_podium` intent + `year` entity; `app/lib/circuits.ts` normalizes
     free-text circuits (Monza→Italy, Jeddah→Saudi Arabia, …) for the 8-circuit slice (defaults
     year→2024); `generatePodiumNarrative` (grounded, probabilistic); a barebones ranked-bands
     card (no glyphs yet) with a "not yet calibrated" note. `requirements.txt` now carries
     scikit-learn/scipy (both `/api` fns still fit). `vercel.json` ships the table via an
     `includeFiles` brace glob. **Verified live:** `POST /api/podium` 200; `POST /api/ask`
     end-to-end for "2024 Italian GP podium", "Monza 2025" (alias+year), and the pit-loss
     regression. **Gotcha (cost a redeploy):** Vercel env vars are per-environment — the key
     was only on Production, so branch previews 500'd until `ANTHROPIC_API_KEY` was added to the
     **Preview** env (then redeploy; existing deploys don't pick up new vars). **MERGED via
     PR #3 to `main` → live on PRODUCTION** (`sector4-zeta.vercel.app`); the rotated
     `ANTHROPIC_API_KEY` is set on prod + preview envs.
4. ✅ **M3 FRONTEND — ASCII/dither glyph + UI system (COMPLETE — MERGED to `main`, live on
   PRODUCTION):** was branch `m3-frontend-glyph-system` (merged `--no-ff` as `d8a559d`, then
   deleted local+remote); spec+plan in `docs/superpowers/{specs,plans}/2026-06-15-m3-frontend-
   glyph-system*` + a polish spec/plan `…/2026-06-18-m3-frontend-polish*` (specs predate the
   ASCII pivot + polish below — treat the code as authoritative). **41 vitest + Python suite
   green, `npm run build` clean on the merged result.** The look went through several owner-driven
   iterations; the CURRENT (shipped) state is:
   - **Background = plain `#FAFAFA`.** The aurora was REMOVED (`AuroraBackdrop.tsx` deleted) — owner
     wanted a flat colour. `tailwind bg`/`body` = `#FAFAFA`.
   - **ASCII technique = 1NCOGNIT0 dot-matrix** (`app/lib/ascii-bitmap.ts`): font-free 5×5 bitmap
     glyphs (dot→plus→x→hash→bigdot) chosen by brightness, lit sub-cells tinted by source colour.
     Ported from the etlaM21/1NCOGNIT0 Spark AR `asciiShader.sca`. Runs on **canvas 2D** (no
     WebGPU/WebGL) — chosen because the `shaders` pkg can't ASCII-ify DOM/SVG (M2 finding, still true).
   - **Fog** `app/components/AsciiFog.tsx` — CONFINED to the action zone under the query bar (NOT
     full-page; owner: "only where the action is"). Field is **domain-warped FBM** (`app/lib/noise.ts`,
     not sines — sines read as a rotating pattern) so it churns organically, + a **cursor-radius
     brighten** (inspired by the reactbits "Dither" background; `MOUSE_RADIUS`/`MOUSE_GAIN`). Edge-
     masked to a soft ellipse in `app/page.tsx`; a radial white scrim sits behind content for legibility.
     Static single frame + no pointer reactivity under `prefers-reduced-motion`.
   - **Helmets** `app/components/AsciiGlyph.tsx` — rasterise the helmet SVG off-screen → sample
     (`app/lib/ascii.ts`, per-cell coverage+colour) → draw a **dither field of coverage-scaled squares**
     (solid where filled, fine particles at edges — NOT the gappy dot-matrix, which read as a lattice).
     Team colour retained; the rasterised numeral is baked OUT and a **crisp contrast-guarded number is
     overlaid** (`NUMBER_POS` in `helmet.ts`) for legibility. **Scattered dither-resolve reveal** (cells
     develop in, numeral fades last); reduced-motion → instant. `DriverGlyph.tsx` (plain SVG, shared
     paths in `helmet.ts`) is the SSR/no-canvas fallback. Verified live: 4 `<canvas>` helmets, 0
     vector fallbacks; numbers 4/81/16/33 legible, team colours correct.
   - **Source of truth + type system (unchanged from first iteration):** `app/data/drivers.json` (codes
     → name/number/personalColor) + `app/data/teams.json` (incl. both `RB` + `Racing Bulls`); year-correct
     `team` comes from the API (`build_podium_table`/`predict_podium`/`api/podium.py`). 4 self-hosted font
     roles via `app/lib/fonts.ts` (`next/font/local`); **Bebas Neue = wordmark ONLY**. Empty (pre-query)
     state = hint + example chips (`app/page.tsx`).
   - **KEY BUILD GOTCHAS FIXED (don't reintroduce):** (a) `next/font/google` fails to fetch gstatic in
     the Vercel build → self-host all fonts. (b) unanchored `data/` in `.vercelignore` stripped
     `app/data/*.json` → root-anchored. (c) Lastik web fonts must be committed (`app/fonts/lastik/*.woff2/
     .woff`; `.otf/.ttf` desktop originals are gitignored). (d) the `shaders` pkg can't ASCII-ify DOM. (e)
     Vercel env vars are per-environment — `ANTHROPIC_API_KEY` must be on **Preview** too (it is). (f)
     canvas `ctx.font` can't resolve CSS vars → numeral overlay uses a concrete `Arial` stack.
   - **POLISH PASS (shipped, branch then merged):** randomized scattered helmet ASCII reveal
     (`app/lib/scatter.ts`); bolder/darker confined fog; **animated suggested-query chips** — one at a
     time, edge-anchored random positions, fade in/out (`app/components/QueryChips.tsx` + `app/lib/chips.ts`);
     removed the shaders.com attribution; **F1-team-radio loading lines** rotating per query
     (`app/lib/loading-lines.ts`, 15 owner-authored lines); an **ORIGINAL spinning racing-tyre Ask-button
     loader** (`app/components/TyreSpinner.tsx` — black slick + white sidewall + 2 red compound stripes
     + SECTOR4 wordmark + 10-spoke rim; rolls in from the left, spins, rolls out right; NO Pirelli marks
     per PRD §8); **query-bar focus underglow** that eases in (transition + delayed breathing keyframes,
     `.bar-shell::after` in `globals.css`); an edgeless `.legible` white wash so answer/empty text reads
     over the fog; wordmark set to `SECTOR4`; pixel fonts (`PP Mondwest` serif, `PP NeueBit`) wired via
     `app/lib/fonts.ts`. **Deleted in polish:** `app/components/Reveal.tsx`, `app/lib/reveal-fallback.ts`,
     `app/components/PixelSpinner.tsx`, and the **`shaders` npm dep** (it could never ASCII-ify DOM). A
     pixel-edge clip-path treatment on the bar/button was tried and DISCARDED (owner: too harsh).
   - **NEXT:** **M4 — telemetry differentiators** (pace-gap context + stop-count strategy). Deferred
     still from the visual system: car/tire/track glyphs (M4 — the `TyreSpinner` glyph is reusable),
     hover callouts (M6), favicon (M7), live-2026.
   - **A future LANDING PAGE** fronting the product is an owner goal (saved to memory) — reuses this
     glyph system + palette; separate effort, not M3.
5. **M4 — Telemetry differentiators (IMPLEMENTATION COMPLETE on branch
   `m4-telemetry-differentiators`; spec+plan in `docs/superpowers/{specs,plans}/
   2026-06-20-m4-*`; SDD ledger in `.superpowers/sdd/progress.md`). Shipped architecture:**
   - **Three Python serverless fns mirror `api/podium.py`:** `api/pace.py`
     (`predict_pace_gaps`, ships `pace_features.parquet`+`team_map.parquet`+sklearn),
     `api/strategy.py` (`predict_stop_counts`, ships `strategy_features.parquet`+
     `team_map.parquet`+sklearn), and the SLIM `api/inference.py` (now also serves
     `tyre_deg`/`stint_length` from the bundled `strategy_features.parquet`, still
     sklearn-free — guarded). `vercel.json` `includeFiles` updated for all four fns.
   - **`predict_stop_counts` gained an additive race-level `dominant` summary** (modal
     n_stops + share + n_drivers; `None` in the qualitative branches) so the StrategyCard
     leads with the track-level call. Per-driver detail is secondary (owner: teams differ,
     strategy is track/conditions-driven). `SC_CAVEAT` always present + rendered.
   - **Team colour for non-podium helmets:** new `src/pipeline.py:build_team_map` (pure
     transform from `season_results` via `GP_TO_EVENT`, keyed on short gp) → `data/team_map
     .parquet`; new `src/inference/teams.py:attach_teams` joins team at the serverless
     boundary (team is glyph metadata, NEVER a model input). New store paths
     `store.SEASON_RESULTS` + `store.TEAM_MAP`; `build_all` writes the team map too.
   - **Honesty fix:** `src/features/track.py:CURATED_TRACKS`; `lookup_stat` pit_loss returns
     `value None`/"not available for this circuit" for non-curated GPs (the `_DEFAULTS` 21.0
     prior stays for the FEATURE pipeline only). `StatAnswer` skips the number block on null.
   - **Frontend:** `circuits.ts` adds `normalizeLookupCircuit(raw, stat)` (pit_loss = 8 +
     Monaco; deg/stint = the 8); `parser.ts` tool descriptions tightened (intents already
     existed); `orchestrate.ts` adds `predict_pace`/`predict_strategy` branches + deg/stint
     lookups (`Answer` union + `AnswerDeps` extended); `narrative.ts` adds grounded
     `generatePaceNarrative` (supporting-not-podium) + `generateStrategyNarrative`
     (deg→stops, SC caveat); `app/api/ask/route.ts` dispatches via a `postJson` helper;
     `app/page.tsx` adds `PaceCard` + `StrategyCard`.
   - **Feature tables regenerated** via `build_all()` (8 dry circuits, 2023–25; from the
     local fastf1 cache) and copied into `api/`. Regen: `PYTHONPATH=. .venv/bin/python -c
     "from src.pipeline import build_all; build_all()"` then `cp data/{pace,strategy}_
     features.parquet data/team_map.parquet api/`.
   - **VERIFIED locally:** 121 pytest + 51 vitest pass, `npm run build` clean, nb 06 trust
     anchor +0.070 verbatim. **VERIFIED on a live Vercel preview** (`sector4-j0tvoxvt6-…
     vercel.app`, deploy `dpl_J1vBUr4NGQpaX5iJk5uhDmVJQxx5`): all four Python lambdas built;
     `/api/pace`, `/api/strategy`, deg/stint lookups, non-curated pit-loss (honest `null`),
     and `/api/ask` end-to-end (pace/strategy/deg, aliases normalized, grounded narratives)
     all correct. **REMAINING: merge the branch (owner decision). Optional: owner browser
     eyeball of the PaceCard/StrategyCard visuals.**
   Then **M5 private beta at a real 2026 weekend (forcing function)**, M6 learning layer,
   M7 breadth+polish. See PRD §11.

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
baseline-driven) and the product as explainer-led, not predictive-edge. **M1/M2/M3-backend
AND the M3 FRONTEND (the ASCII/dither glyph + UI system) are all merged to `main` and live
in production** (see §4 item 4 for the shipped architecture + polish). The immediate next
milestone is **M4 — telemetry differentiators (pace-gap context + stop-count strategy)**.
Start any new build only when the user asks. Preserve the load-bearing
invariants when extending: inference must never import fastf1; all training must go through
`store.prior_weekends` (calendar order, never alphabetical); round every number that reaches
output; keep all logic in `src/`; on the frontend keep the ASCII rendering on canvas (the
`shaders` pkg can't ASCII-ify DOM) and gate all motion behind `prefers-reduced-motion`; and
do not oversell predictions in any code, copy, or UI.
