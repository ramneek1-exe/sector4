# Project Handoff: Sector 4

> Living context doc so a fresh session never cold-starts. Read this first, then
> `CLAUDE.md`, `sector4-prd.md`, and `notebooks/*_RESULTS.md`. Last updated 2026-06-28.
> **Status: Phase 1 COMPLETE + product repositioned (explainer-led). M1 (pipeline lib,
> PR #1), M2 (thin slice), M3 BACKEND + live podium integration (PR #3), AND the M3
> FRONTEND (ASCII/dither glyph + UI system) are all MERGED to `main` and live on
> PRODUCTION (`sector4-zeta.vercel.app`).**
>
> **M4 — telemetry differentiators: MERGED to `main` and live on PRODUCTION
> (`sector4-zeta.vercel.app`).** Pace-gap context (Model A, supporting) + stop-count strategy
> (Model B, race-level call leads, SC caveat always on, deg→stops teachable narrative) are
> wired end-to-end, plus tyre-deg/stint-length lookups and a pit-loss honesty fix (non-curated
> circuits → honest "not available", never the 21.0 default), with legibility/UX polish (bigger
> number labels, interleaved suggested-query chips, a portalled compact per-driver stops modal
> with fade+scale transition). 121 pytest + 51 vitest pass, `npm run build` clean, the +0.070
> stop-count trust anchor (nb 06) reproduces verbatim, whole-branch review fix-then-merge (2
> minors fixed), and verified on a live Vercel preview before merge. Branch
> `m4-telemetry-differentiators` merged `--no-ff` (merge `986a422`) and DELETED (local + remote).
>
> **Production custom domain: `https://sector4.net`** (GoDaddy DNS: A `@`→76.76.21.21,
> CNAME `www`→cname.vercel-dns.com; `www`→apex 308 redirect). GOTCHA: the www→apex redirect
> lives in `next.config.mjs` `redirects()`, NOT `vercel.json` — **Vercel ignores
> `vercel.json` redirects/rewrites/headers for Next.js projects** (use next.config). The
> `*.vercel.app` URLs still work.
>
> **M5 — private beta: MERGED to `main` and LIVE on PRODUCTION** (`sector4-zeta.vercel.app`;
> merge `4bced64`, branch `m5-private-beta` deleted). Runtime calibrated podium for live
> 2026 weekends (HAM strong 0.68 for Austria, verified on prod), snapshot/cron/Blob
> delivery loop, `/weekend` issued-artifact page, telemetry differentiators, mobile +
> visual polish. See §6 for architecture + the OWNER TODO list below. Spec/plan in
> `docs/superpowers/{specs,plans}/2026-06-21-m5-*`.
>
> **OWNER TODO before the real Austria weekend (June 26):** (1) **delete the test blobs**
> `weekends/2026-Austria/{pre-quali,latest}.json` or the cron skips the real pre-quali
> snapshot; (2) rotate the PREVIEW `CRON_SECRET` off `s4-cron-test` (prod still holds the
> original secure value). **R17 is now LIVE** — `.github/workflows/refresh-weekend-data.yml`
> runs green (verified); it auto-refreshes live data + telemetry each weekend and deploys.
> `scripts/build_2026.py` is now INCREMENTAL (reuses committed history, fetches only the live
> season) — required because CI has no fastf1 cache and old sessions aren't fetchable fresh.
> Minor wart: parquet isn't byte-deterministic, so R17 commits/deploys every scheduled run
> even with no data change (harmless; tighten with a content check later).
> Next milestone after the beta runs: **M6 — learning layer** (incl. replacing the curated
> `/weekend` facts with the entity-what pipeline).
>
> **Qualifying-grid wiring — MERGED (PR #5) and LIVE.** Post-quali podium sharpening: a
> committed `app/data/grids.json` (written by R17's `build_2026.py` step 7 via fastf1's
> qualifying classification, livery/marks irrelevant) is read by `app/lib/grid.ts:getGrid`
> and passed into `/api/podium` by `buildSnapshot` + `orchestrate`, flipping Friday→Saturday
> (verified live for Austria: RUS 0.27→0.58, LEC 0.23→0.47). fastf1 NEVER runs serverless;
> the grid is produced in CI and read from the bundle. `_DEFAULTS`/`round→ceil` etc. detailed
> in PR #5.
>
> **M6-A — concept whats + `/learn`: MERGED (PR #6) and LIVE; polished (PR #7, #8).** The
> learning-layer foundation (PRD §6.6): `app/data/concepts.json` (the `what` model + accessors
> in `app/lib/concepts.ts`), 8 teaching concepts, `TrustBadge`, `/learn` index + `/learn/[slug]`
> pages (SSG). Visual system: single-row persistent `SiteNav` (SECTOR4 + Ask/Learn/Upcoming-
> weekend, PP NeueBit, growing-underline hover); PP Mondwest page headers; subtle brand-fog
> card hover (`CardFog`, blooms bottom-right, RAF only while active, reduced-motion off);
> `/learn` enter cascade; and ASCII **emblems** per group (tyre + wind-icon SVGs; an
> **F1-car silhouette** traced from an alpha mask to a coverage bitmap `app/lib/car-silhouette.ts`,
> rendered monochrome brand-blue by `AsciiEmblem` — generic silhouette only, livery/marks
> stripped per PRD §8) shown as heading markers + large faded right-of-centre concept-page
> watermarks. Built subagent-driven (specs/plans in `docs/superpowers/.../2026-06-27-m6a-*`),
> opus whole-branch reviews before each merge. **Polish (PR #7/#8):** all 8 concepts promoted
> `drafted`→`verified`; the 4 review nits fixed; nav enlarged; **DRS concept rewritten for 2026**
> ("DRS & Active Aero": DRS retired after 2025, active-aero straight/downforce modes, override
> "overtake" boost, regen/battery); and **em-dashes removed from ALL user-facing copy** + a
> "never use em-dashes" rule added to every Haiku narrative prompt (owner wants natural,
> non-AI-tell text). All branches deleted; remote is just `main`.
>
> **Remaining M6:** **M6-B** (inline narrative→concept linking + in-context drawer; the `summary`
> field and `getConcept(slug)` seam are already built for it) and **M6-C** (entity-what
> retrieval→Haiku-paraphrase→cite→cache→per-type-TTL pipeline + corrections form; replaces the
> curated `circuit-facts.json` stopgap on `/weekend` via the `getCircuitFacts(gp)` seam). Each is
> its own spec→plan→build cycle.

## ✨ Post-M5 fine-tuning (2026-06-22) — output quality, NOT M6

Owner-directed tuning pass before the learning layer. Branch `fine-tune-output-pitloss`
(committed, **not merged/deployed** — owner decision). 152 pytest + 78 vitest (+2 skipped
live-smoke), `npm run build` + `tsc` clean. Four changes:

1. **"Next race" resolves** (`app/lib/next-race.ts`). "Who's gonna be on the podium at the
   next race?" used to error; now the parser emits `gp:"next race"` and the orchestrator
   maps it (and a bare "who's gonna podium?") to the upcoming weekend from
   `app/data/weekend-schedule.json` (Austria now, auto-rolls to `nextGp` once the race
   finishes). Applies to podium/pace/strategy.
2. **Pit-lane time loss is now DATA-DERIVED for ALL circuits** (`src/features/pit_loss.py` →
   `build_pit_loss` → `data/pit_loss.parquet`, bundled to `api/`; read by `lookup_stat`
   with a `pit_table`/`year`). Replaces the curated spike estimates AND the null fallback.
   The number is the FULL stop cost INCLUDING the ~2.5s stationary change (the F1-website
   convention — owner + web-confirmed). **Red Bull Ring → 20.8s (2025)** vs F1's 20.3 (within
   margin; owner accepted derived-with-margin over exact curated). **Year-aware**: defaults
   to the latest season held; `year` threads parser→orchestrate→`/api/inference`. Carries
   grounded **insights** (the ~2.5s stationary share + calendar ranking "shortest/longest
   pit-lane loss", computed from our own table). Caveat: single-sample 2026 circuits are
   noisy (China 15.4, n=7). NOT shipped: per-track fastest-stop record + team (fastf1 has no
   reliable stationary/stop duration — owner accepted the longest/shortest pit-lane facts as
   the alternative). `track.py` Austria curated prior also corrected 21.0→20.3 (feature-only).
3. **Smarter narratives ACROSS the platform** (podium, pace, strategy, stat lookups).
   `predict_podium` now surfaces per-driver `factors` (champ_rank, recent_form_avg_finish,
   track_pace_delta_s, grid) so the narrative explains the *why* ("leads on championship
   position, quick here last year") not just odds. All four `*_SYSTEM` prompts rewritten to
   be insightful + grounded, and may use ≤1 sentence from an **allowlisted** array only —
   curated `circuit-facts.json` wired via `withContext` in `orchestrate.ts` + the new
   `insights` field. Hard rule kept: never free LLM recall / invented facts.
4. **R17 refresh wired** — `build_pit_loss` added to `build_all` AND `scripts/build_2026.py`
   (incremental step 4/6, live-season merge, validated: picks up 7 completed 2026 rounds,
   preserves 48 history rows, skips unraced Austria gracefully). Both workflow copies
   (`.github/workflows/` + `docs/ops/`) stage `pit_loss.parquet`; `git add api/*.parquet`
   already caught it. So live pit-loss now refreshes each weekend with the other tables.

**Follow-ups:** China/single-sample 2026 noise (consider a min-stop threshold or multi-year
median if "latest" reads wrong); Barcelona↔Spain key collision means a 2026-Barcelona
pit-loss row is unreachable via the "Spain"-normalized lookup (harmless, pre-existing).

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

## 🏁 6. M5 — Private beta (IN PROGRESS, branch `m5-private-beta`, NOT merged)

**Goal:** issue predictions for a real 2026 weekend before quali, sharpen after, send to
testers, log outcomes. Rolling beta: **Austrian GP (race 2026-06-28, non-sprint)** first,
then **British GP (2026-07-05, sprint)**. Spec/plan/ledger paths in the header above.

### De-risk gate (PASSED, `scripts/derisk_2026.py`)
2026 is REAL in fastf1: 22 rounds, **Austria = round 8**, **7 rounds completed** with
results (Australia, China, Japan, Miami, Canada, Monaco, Barcelona — note: no Bahrain/Saudi/
Imola at the front this season; 2026 has BOTH "Barcelona GP" round 7 AND "Spanish GP"/Madrid
later, as distinct keys). **Austria FP is pending** (weekend runs ~Jun 26) → telemetry lights
up at issuance; podium is buildable now. Prior Austria (2024/2025) loads fine.

### Architecture pivot (locked with owner): hybrid-staged
A plan gap surfaced: the backtest builders derive a weekend's row from COMPLETED sessions
(race pace + finish + grid), so they **cannot predict a future weekend**. Resolution:
- **Podium = runtime target-row construction, no fastf1, no redeploy.** `src/inference/
  upcoming.py` builds the Austria target row from `season_results` (standings/form) +
  bundled historical pace (`prior_track_pace`) + entry list + optional grid (None → Friday
  mode, filled → Saturday). `predict_upcoming_podium` appends it to history and runs
  `predict_podium`. **This is the "issue before quali, sharpen after" mechanism.**
- **Telemetry = scheduled GitHub Actions fastf1 job → Vercel Blob** (the "right after"
  stage); `api/{pace,strategy}` read FP features from Blob. fastf1 NEVER runs serverless.
- **Cron snapshots** the runtime predictions to Blob at checkpoints; `/weekend` reads latest.

### DONE this session (18 commits; 137 pytest + 64 vitest + clean tsc)
- Real 2026 calendar (`RACE_CALENDAR`, full `GP_TO_EVENT`; `calendar_order()` default now
  flattens it). Austria + Britain curated track facts. `circuits.ts` 2026 normalization +
  `DEFAULT_YEAR=2026` (orchestrate uses it).
- **Recency-weighted training** (`src/inference/weights.py`, wired into pace + stop-count
  `half_life_years=2.0`). **Re-validated: +0.070 stop-count edge holds with weights**
  (`scripts/validate_recency_weights.py`, `notebooks/M5_RECENCY_RESULTS.md`). NOTE: the
  plan's first validation script used the wrong model/metric (0.507) — the committed one
  faithfully reproduces nb06's regressor+round anchor (0.641 baseline / 0.711 / +0.070).
- **`src/inference/upcoming.py`** — target-row builder + runtime upcoming-podium (gap fixed:
  real ranked bands, Fri→Sat sharpening; bands stay `calibrated:false`).
- `load_results` gained `refresh_year` (live-season staleness).
- Pure delivery cores: `app/lib/{snapshot,weekend-schedule,actuals,build-snapshot}.ts`
  (schema/keys, checkpoint resolver, Brier+top-3 scoring, snapshot builder) +
  `app/data/weekend-schedule.json` (Austria session times — UPDATE per weekend).

### R8 (data build) + R11-glue: DONE + verified on real data
`scripts/build_2026.py` ran clean (after a load fix — `load_session` now returns None when
a session loads but has no laps; fastf1 doesn't raise for future races). Tables rebuilt +
copied to `api/` (incl. NEW `api/season_results.parquet`). 2026 has **22 drivers/round**
(11 teams — reg reset). `api/podium.py` now routes: historical → `predict_podium`; KNOWN
upcoming circuit (in `GP_TO_EVENT`, no table row) → `predict_upcoming_podium` (optional
`grid` in body); unknown → empty qualitative. **VERIFIED:** `predict_upcoming_podium(2026,
Austria)` → mode `friday`, 29 train weekends, bands HAM strong 0.68 / ANTONELLI,PIASTRI,
RUSSELL,LEC,VER in contention; full-grid request → `saturday`. 144 pytest + 64 vitest + tsc
clean. To rebuild tables (e.g. after a new round): rerun `build_2026.py` then the `cp` lines
it prints.

### Delivery layer — BUILT + LIVE-VERIFIED on preview (branch `m5-private-beta`, PR #4)
`app/lib/blob.ts` (`@vercel/blob` putJson/getJson), `app/api/cron/snapshot/route.ts`
(idempotent, CRON_SECRET-auth, dueCheckpoint→buildSnapshot→Blob; final→actuals→calibration),
`api/results.py` (finishing order), `app/weekend/page.tsx` (reads latest snapshot),
`vercel.json` crons. Verified live on preview `sector4-git-m5-private-beta-…vercel.app`:
`/api/podium {2026,Austria}`→HAM strong 0.68 friday; `/api/ask`→grounded narrative;
`/api/results`→order; `/api/cron/snapshot` (authed, force-test)→snapshotted; `/weekend`
rendered the frozen Blob snapshot. **Full cron→Blob→/weekend loop confirmed.**

**Deploy gotchas learned (load-bearing):** (a) **Hobby plan allows only DAILY crons** —
`vercel.json` cron MUST be daily (`0 6 * * *`); a sub-daily expr makes EVERY deploy fail
silently (no deployment record). (b) **Blob store must be PUBLIC** — `putJson` uses
`access:"public"` and `/weekend` reads via plain fetch; a private store throws "Cannot use
public access on a private store". (c) `BLOB_READ_WRITE_TOKEN` is the var the SDK needs
(not BLOB_STORE_ID/BLOB_WEBHOOK_PUBLIC_KEY) — on Prod+Preview. (d) env changes need a
redeploy to take effect.

### REMAINING
1. **OWNER cleanup from the force-test:** delete test blobs `weekends/2026-Austria/
   {pre-quali,latest}.json` (else idempotency skips the real Jun-26 snapshot); rotate
   `CRON_SECRET` off the throwaway `s4-cron-test` back to a random sensitive value (redeploy).
2. **R17 — SCAFFOLDED as a TEMPLATE (activate + verify at the first real weekend).**
   **ACTIVATION (owner):** the workflow lives at `docs/ops/refresh-weekend-data.yml` because
   the controller's git/gh token lacked GitHub's `workflow` scope (can't push under
   `.github/workflows/`). To enable it: copy that file to
   `.github/workflows/refresh-weekend-data.yml` and push with a token that has `workflow`
   scope (or paste it via the GitHub web "Add file" UI). Then it's a
   scheduled (Fri/Sat/Sun) + manual GH Actions job that runs
   `scripts/build_2026.py`, copies tables into `api/`, commits, and pushes → Vercel
   auto-deploys. Telemetry (pace/stop-count) lights up automatically once Austria's FP rows
   exist in the rebuilt tables (the bundled-parquet API already returns qualitative until a
   target row exists — no api changes needed). **Deliberate simplification of the spec's
   "fastf1→Blob overlay"** (commit+deploy reuses the working bundled path, no Blob upload
   from Python, no extra secret). UNVERIFIED until live 2026 FP (June 26); caveats in the
   workflow header (fastf1-in-CI is slow; parquet-in-git grows history; needs Actions
   contents:write + Vercel Git deploy-on-push, both already in place).
3. **Polish — DONE this pass:** `/weekend` now renders a styled podium-odds **table** with
   ASCII helmet glyphs (`AsciiGlyph`) + driver names + band colours, an "About <circuit>"
   facts block, and the home page has a top-right **CTA** → `/weekend`. Spec/plan
   `docs/superpowers/{specs,plans}/2026-06-21-m5-weekend-visual-upgrade*`. Still optional:
   grounded narratives on `/weekend` (snapshots don't carry narratives yet).
4. **Merge decision** — PR #4 → `main` (production cron fires daily; prod env already has the
   keys). Update `weekend-schedule.json` per weekend before each beta round.

### M6 hand-off note (fun facts)
`/weekend` "About <circuit>" facts are a **curated hand-authored stopgap**
(`app/data/circuit-facts.json` + `app/lib/circuit-facts.ts`; seeded Austria + Great Britain,
added by hand per weekend). **M6's learning layer must replace them** with the entity-what
pipeline: allowlist source → Haiku original paraphrase → inline citation + link → cache
(per-type TTL) → auto "drafted, unverified" badge + corrections form; hard facts from
`drivers.json`. The `getCircuitFacts(gp)` seam stays; swap its implementation.

**Phase C (sprint-aware podium for British GP) is a separate later plan.**
