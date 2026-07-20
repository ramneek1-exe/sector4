# Project Handoff: Sector 4

> Living context doc so a fresh session never cold-starts. Read this first, then
> `CLAUDE.md`, `sector4-prd.md`, and `notebooks/*_RESULTS.md`. Last updated 2026-07-02.
> **Status: Phase 1 COMPLETE + product repositioned (explainer-led). M1 (pipeline lib,
> PR #1), M2 (thin slice), M3 BACKEND + live podium integration (PR #3), AND the M3
> FRONTEND (ASCII/dither glyph + UI system) are all MERGED to `main` and live on
> PRODUCTION (`sector4-zeta.vercel.app`).**
>
> ## 🔴 PICK UP HERE NEXT SESSION — LANDING V2 (branch `landing-page`, PR #37 OPEN, head `7a22fa8`, awaiting owner preview)
> **LANDING V2 BUILT on top of v1 (2026-07-19 second session, owner-brainstormed).** Spec/plan
> `docs/superpowers/{specs,plans}/2026-07-19-landing-v2-hero-sections*`; ledger `.superpowers/sdd/progress.md`.
> Whole-branch review READY FOR OWNER PREVIEW (zero Critical/Important). What changed vs v1:
> (1) **Hero = type-led**: NO wordmark (nav carries brand); thesis IS the hero, verbatim "A lap has three
> sectors. / This is the one where you find out why."; light recipe (#fafafa/#406cd6, cols 240) over REAL
> b-roll — owner bought it, `public/hero.mp4` committed (0.85MB 960x540, recompressed from 46MB original
> via ffmpeg CRF28, audio stripped; original NOT in repo). `data-hero` attrs (video/thesis/cta/cue) =
> stable hooks for the LATER preloader pass. (2) **Sections = sector conceit**, REORDERED S1 Ask ("Formula
> 1, minus the false confidence."), S2 Learn, S3 Weekend, S4 Honest payoff ("The fourth sector is the
> truth."); oversized faded SectorNumeral per section (alternating sides), DrawSVG SectorDivider timing
> lines between. (3) **Motion**: site-wide Lenis smooth scroll (layout `SmoothScroll`, null-rendering,
> synced to ScrollTrigger via gsap ticker) + `SectionReveal` ([data-reveal] stagger, once:true); gsap
> ^3.15 (DrawSVG now free/public) + lenis deps; ALL motion in gsap.matchMedia reduced-motion gates,
> hidden states via gsap.set only (never CSS — no-JS users see everything). `app/lib/gsap.ts` = the one
> client-only plugin-registration point; `app/lib/motion.ts` pure/tested.
> **OWNER PREVIEW CHECKLIST (PR #37, comment posted):** (a) hero over real footage — palette tunable in
> /lab/dither E; (b) S4 numeral anchors viewport-edge (full-width section, unlike S1-S3) — check wide
> viewports; (c) reduced-motion OS check; (d) smooth-scroll feel on all 5 routes; (e) merge call.
> **DEFERRED NEXT PASSES (owner ordering): preloader + hero reveal choreography, THEN footer redesign.**
> **KNOWN FOLLOW-UP (Minor):** MobileNav overlay + wheel on narrow non-touch window accumulates Lenis
> targetScroll (jump on close); fix = lenis.stop()/start() around overlay-open or data-lenis-prevent.
>
> ### Landing v1 (same PR, context)
> All 5 v1 plan tasks complete + review-checked (spec/plan `2026-07-19-landing-page*`).
> **What's on the PR:** (1) `/` = new landing: full-viewport hero (DitherVideo over `/public/hero.mp4`,
> falls back to DitherFog while the file doesn't exist — BY DESIGN), SECTOR4 Bebas wordmark + thesis +
> CTA → /ask, ask-anything chips (deep-link `/ask?q=` prefill, no auto-run), honest-by-design (live
> scored-race count, degrades to copy), learn, this-weekend, footer. `/` is force-dynamic. (2) Ask moved
> VERBATIM to `/ask` (+9 prefill lines, window.location.search on mount). Nav: Ask→/ask,
> `emitAskResetIfOnAsk`. (3) **`app/lib/bayer.ts`** gained the LUMINANCE path + BAYER8 (tested) — math
> identical to paper's ImageDithering 4x4. (4) **`DitherVideo`** renders any <video> per-frame through it
> (cols-grid + pixelated upscale; reduced-motion/autoplay-block → static frame; missing src/error →
> children fallback; InView+tab-visibility-gated rAF). (5) **`/lab/dither` section E** = the b-roll test
> bench: local FILE PICKER (nothing committed) + palette/cols/matrix toggles + hero-copy overlay + a
> "Capture frame" PARITY PROOF (paper ImageDithering vs ours, same frame side-by-side).
> **OWNER NEXT STEPS:** (a) eyeball the PR #37 preview: landing `/`, `/ask` (incl. nav-Ask reset + ?q=),
> lab E with any local test clip; (b) verify the parity A/B; (c) purchase the licensed b-roll → drop at
> `public/hero.mp4` (hero lights up automatically, no code change); (d) merge call.
> **HARD-WON LESSON (this branch):** NEVER import VALUES from a "use client" module into a server
> component — they become client references (`NAV_LINKS.map()` 500'd the landing at request time; build
> passed because the route is dynamic). Pure nav constants now live in server-safe **`app/lib/nav.ts`**
> (SiteNav re-exports for compat). For any new server route: smoke it with a local `next start` + curl,
> not just `npm run build`.
>
> ## ⭐ NEXT-UP BACKLOG (owner-prioritized 2026-07-06 — pick up IN THIS ORDER)
> 1. ✅ **DONE (2026-07-06, PR #22, merge `02f3d5c`) — `src/data/grid.py:load_qualifying_grid` date-gate.**
>    The last ungated fastf1 read is closed: `session_in_future(getattr(s,"date",None))` guard reads `s.date`
>    BEFORE `.load()` and returns `{}` (the existing "no grid yet" degrade) for a future session, same pattern
>    as `load_session`. +2 tests (future → gated before load; past → loads normally). Same PR also flipped the
>    16 new M7 explainer concepts `drafted`→`verified` (owner editorial call; all 24 now verified).
> 2. ✅ **DONE / MOOT (verified 2026-07-07) — Historical-season (2023–25) sprint-points backfill.** The
>    concern was that `build_2026.py` is incremental (`load_results(..., refresh_year=LIVE_SEASON)`, L167)
>    so the sprint-in-standings change only reached the LIVE (2026) season_results. **On inspection the
>    2023–25 rows ALREADY include sprint points** (both `data/` and the deployed `api/season_results.parquet`):
>    e.g. 2023 Azerbaijan/Belgium/Qatar/USA = 33 (25 race + 8 sprint), Austria = 34 (+1 FL); old race-only
>    code could never exceed 26. A fresh full re-pull of 2023 with the current code is **byte-identical** to
>    the committed table (max abs points diff 0.0, 0/439 rows differ). The tables were regenerated with the
>    sprint-folding code in the Jul 6 20:11 rebuild, AFTER this note was first written. `podium_features`
>    (built from the same `results` in the same rebuild) is consistent → train/serve champ_points already
>    aligned. **No action needed; a rebuild would only churn non-deterministic parquet with zero data change.**
> 3. ✅ **RESOLVED (2026-07-17, PR #26) — investigated as a model change, landed as an explainer/context feature after a validation NO-GO.** See the session entry below. The model-weight idea was tested and REJECTED honestly: grid already dominates the podium model (standardized logistic coef −2.5, top feature by 3×), and a per-track grid×stickiness INTERACTION does NOT beat baseline on leakage-safe rolling-origin CV (23 held-out races: top3 0.696 flat / Brier flat-or-worse; front-row already well-calibrated pred 0.67 vs actual 0.68 — the earlier "undersold" feeling was a DRY-subset small-sample artifact). Per house rules (don't tune the bar / don't overfit one Silverstone anecdote) the MODEL IS UNTOUCHED. The real per-track stickiness spread (Spearman ρ 0.43 Las Vegas → 0.90 Monaco/Japan) instead ships as grounded narrative CONTEXT. **Deferred alternatives if ever revisited:** none recommended — the interaction is a genuine no-edge; evidence in the spec §0.
> 4. **M7 runway to public launch:** visual polish + optional championship projection (the last M7 slices).
> 7. ✅ **RESOLVED (2026-07-18, PR #31) — /accuracy chart enriched + GB relabel.** Chart gained y-axis
>    scale/gridlines/point markers/endpoint value label + a faded "pre-launch (not counted)" testing series +
>    clearer Brier legend + a pure-CSS line-draw reveal (reduced-motion gated); stays server-rendered (no hover
>    JS, owner's call). GB relabel via new admin `?reconstructed=0` override. See session entry.
>    **OPEN OWNER DECISION (post-eyeball):** the chart overlays the live + testing lines INDEPENDENTLY (each
>    full-width), not on a shared calendar timeline. Fine as a faded backdrop, but decide after seeing it whether
>    you want the shared-timeline instead (live becomes a short right-side segment; needs an absolute round index
>    threaded through CumulativePoint). Not blocking.
> 8. ✅ **RESOLVED (2026-07-18, PR #30) — cron reordered to due-write → reconcile → rebuild.** The due-write now
>    runs FIRST and claims the current race's `final` LIVE (unflagged); reconcile then no-ops it (`alreadyPresent`)
>    and stays the safety-net for genuinely-missed rounds; rebuild last. Extracted to a testable
>    `app/lib/snapshot-cron.ts:runSnapshotCron` (due-write isolated in its own try/catch) so the ORDER is
>    regression-guarded (test asserts calls == ["write","reconcile","rebuild"]). Missed-final safety preserved
>    (reconcile still runs unconditionally every fire). FORWARD-LOOKING: relabels no existing rows; the first race
>    captured live after deploy becomes a 2nd live row on `/accuracy`, and the live count grows from there. See
>    session entry below.
> 6. ✅ **RESOLVED (2026-07-18, option b, in PR #27) — pre-beta backfill on `/accuracy` labeled, not counted.**
>    The reconciler backfills EVERY completed round including pre-beta rounds (Australia…Barcelona) we never
>    forecast live. Chosen fix (owner, option b): stamp post-hoc backfills `reconstructed` and on `/accuracy`
>    EXCLUDE them from the headline (top3/Brier) + trend chart while still LISTING them labeled **"From testing ·
>    not predicted live"**. See the session entry below. Post-hoc writes (reconciler + admin) stamp
>    `reconstructed:true`; the LIVE cron due-write never does, so a live-captured final (Austria) stays counted.
>    **OWNER STEP after PR #27 deploys:** re-stamp the 8 already-written rows (7 pre-beta + GB) via the admin
>    backfill loop (spec §6; Austria EXCLUDED) — until then they still show as live/counted. Future misses
>    auto-flag via the reconciler.
> 5. ✅ **DONE (2026-07-07, PR #23 MERGED to `main` → live on prod).** See the session entry below. Recommend confirming the *populated* modal on prod (`/weekend`, Belgium setup screen → "Check out Great Britain GP" link). **`/weekend` — show the PREVIOUS GP's predictions during the pre-predictions "setting up" state** (owner
>    idea 2026-07-06; priority vs 2–4 owner's call). While `/weekend` is in the `!snap || concluded` branch —
>    the "We're still setting up our garage at {circuit}… Check back Saturday" screen (`app/weekend/page.tsx`
>    ~L80-124), before this weekend's snapshot exists — give the user a sense of what to expect by surfacing
>    the LAST race's predictions. Owner's mechanism: a **"grow underline" link** (the existing `cta-grow` hover
>    style used site-wide) that opens a **modal/popover** with the previous GP's predictions **table** (podium
>    odds). **Data already exists — read-only, no pipeline/Python/cron change:** the prior weekend's frozen
>    predictions live in Blob at `snapshotKey(year, prevGp, "final")` (exactly what `/accuracy` reads via
>    `loadRaceRows`). Need to (a) resolve "previous GP" — `weekend-schedule.json` has `gp`/`nextGp` but no
>    `prevGp`; derive from `RACE_CALENDAR`/calendar order or add a `prevGp` field; (b) reuse the podium-table
>    markup already in `weekend/page.tsx` (L152-192 — worth extracting a shared `<PodiumTable>`); (c) reuse the
>    existing portalled fade+scale **modal pattern** from the M4 per-driver stops modal. Frontend-only slice
>    (its own spec→plan→build); gate motion behind `prefers-reduced-motion`; the modal must be clearly labelled
>    as the PAST race's call (not the upcoming one). **Note:** the empty/"setting up" branch also fires
>    post-race for `nextGp` (`concluded` at L78), so the "previous GP" it references is context-dependent —
>    resolve it from whichever upcoming gp is being shown.
>
> **Owner Qs answered (2026-07-06), re `/accuracy` (`app/accuracy/page.tsx`):**
> - **Does accuracy update automatically? YES.** The page is `force-dynamic` and reads the LIVE Blob season
>   calibration index (`seasonIndexKey`) that the cron appends to when a race's `final` checkpoint is scored
>   (final → actuals → calibration). So each concluded round shows up on the next page load — no manual step,
>   as long as the daily snapshot cron actually hits the race's `final` window (the `?force=1` re-snapshot from
>   the 07-04 firefight is the manual fallback if a checkpoint is missed).
> - **Is it supposed to have a graph? YES — but only at ≥3 scored races.** `CalibrationChart` renders behind
>   `summary.nRaces >= 3` (L89) — a deliberate honesty gate (don't draw a season trend from 1–2 points). Early
>   season correctly shows the scorecard + race-by-race rows and NO chart; the graph appears once ≥3 rounds are
>   scored. So "no graph yet" is expected behaviour, not a bug.
>
> ## 2026-07-19 session — dither eyeball fixes: PR #36 MERGED + LIVE
> All 3 deferred fixes + 5 more owner findings, iterated on the PR preview:
> (1) **Hero cursor blob** — fog is a pointer-events-none background SIBLING, so React handlers on it
> never fire; now tracks WINDOW pointermove (AsciiFog's pattern), active only inside the fog box.
> (2) **`.legible` scrim saga (3 rounds, the lesson matters):** the visible hard edges were a GEOMETRY
> bug — default radial ellipses size to farthest-corner, so the box edge slices the gradient at ~60-70%
> alpha → sharp rectangles. Fix = **`ellipse closest-side`** (alpha reaches 0 at every side; an edge is
> impossible). Then a hold-then-drop curve read as a white OVAL → final = continuous gaussian-like decay
> (8 stops 0.92→0). DON'T weaken scrims to hide edges (looked terrible over the busy warp) — fix geometry.
> (3) **/learn bloom overflow** — mix-blend child escapes border-radius clip (Chromium); bloom wrapper now
> self-clips (`borderRadius:inherit` + overflow hidden) + card `isolate`. (4) Faint bloom on /accuracy rows
> (`BloomCard` wrapper, CardFog `intensity` prop, 0.3). (5) /learn hover text contrast (muted→ink on
> group-hover). (6) TyreSpinner centering (roll-in span was inline → baseline offset; now inline-flex).
> (7) **Nav-Ask reset** (same-route Links no-op; ASK_RESET_EVENT from nav → page listener). (8) Sentence
> splitter broke on decimals ("spans 7.004 km" → two paragraphs); now splits only at terminator +
> whitespace + capital (`splitSentences`, tested).
>
> ## 2026-07-19 session — LANDING PAGE built (PR #37 OPEN — see 🔴 top block)
> Full detail in the top block. Subagent-driven, 5 tasks; whole-branch review dispatch died at the
> session limit mid-run → controller ran the invariant checklist inline (all pass) — but the
> client-module-value crash slipped through and was caught by the owner on preview + root-caused via
> local next-start repro (see the lesson in the top block).
>
> ## 2026-07-18 session — DITHER ART SWAP: lab (PR #34) + site-wide swap (PR #35) — LIVE, 3 eyeball fixes deferred
> Owner found paper-design's Dithering shader and wanted to test-then-swap the homegrown ASCII art.
> **Lab:** hidden `/lab/dither` (noindex, kept as reference/tuning page) went through **7 owner-reviewed
> rounds** to lock the recipe. Locked: **hero** = warp, blue #406cd6 (size2/speed0.5/scale0.8) + sky #459ae4
> (size2/speed0.35/scale0.55), 4x4, colorBack #fafafa, multiply-stacked over white + a cursor-trailing accent
> #2f2e89 blob (radial 130px mask, rAF lerp 0.12, snap-on-entry, 300ms fade); **card** = same warp masked to
> the CardFog bottom-right corner radial; **identity (helmets/emblems)** = solid exact SVG colours + cell=1
> alpha-Bayer dithered EDGES (deterministic canvas, no shader), crisp numeral overlay.
> **Hard-won lab lessons (do not relearn):** (a) `Dithering` transparent colorBack renders WHITE — use opaque
> white + multiply; (b) a CSS mask creates a stacking context that ISOLATES blending → multiply must go on the
> MASKED WRAPPER, never only on a canvas inside it (white-circle/invisible-bloom bug); (c) browser WebGL
> context cap (~16) evicts oldest canvases — never mount many shaders at once (lab uses InView; CardFog mounts
> only while active); (d) ImageDithering maps LUMINANCE→dot density (washed checker on mid-tone fills) — for
> solid-fill glyphs use the Bayer-alpha approach in `app/lib/bayer.ts` instead.
> **Swap (PR #35, merged + LIVE):** renderer swap INSIDE existing components, APIs unchanged: new
> `DitherFog` replaces AsciiFog on home + /weekend; `CardFog` internals → dither corner bloom ({active} API,
> unmounts at rest); `AsciiGlyph`/`AsciiEmblem` internals → shared `app/lib/bayer.ts` (solid fills, 1px Bayer
> edges, 450ms Bayer-ordered dither-resolve reveal, reduced-motion instant; popover/DriverGlyph-fallback/
> numerals intact; car via coverage→alpha). Untouched: og-image (server, no WebGL — style gap accepted),
> AsciiFog.tsx, lab, TyreSpinner. Dep: `@paper-design/shaders-react` (Apache 2.0). Opus whole-branch review
> READY FOR PREVIEW, no Critical; vitest 206/2skip, tsc+build clean.
> **OPEN: 3 owner-eyeball fixes deferred — see 🔴 PICK UP HERE at the top** (hero blob missing on prod, scrim
> edges visible, /learn bloom overflows rounded corner).
>
> ## 2026-07-18 session — /accuracy chart enrichment + GB live relabel (backlog #7): PR #31
> Spec/plan `docs/superpowers/{specs,plans}/2026-07-18-accuracy-chart-enrichment*`; ledger `.superpowers/sdd/
> progress.md`. Subagent-driven: 4 tasks + reviews (2 inline for trivial, 2 subagent).
> **What shipped:** (1) **GB relabel mechanism** — `app/api/admin/snapshot` accepts `?reconstructed=0` to write a
> snapshot as LIVE (unflagged); mirrors the `force` parse. (2) **`summarize` `cumulativeTesting`** — cumulative
> over reconstructed rows (parallel to live `cumulative`); live values byte-identical (regression-verified).
> (3) **`chart-path.ts` `pointCoords`/`yLevel`** helpers (buildLinePath refactored onto pointCoords, output
> identical). (4) **`CalibrationChart` rewrite** — server component (no hover/JS): y-axis scale + 0/50/100%
> gridlines + point markers (r=4) + endpoint value label + faded "pre-launch (not counted)" testing line +
> "Brier (higher = better-calibrated)" legend; page gate lowered to `index.length>=2`. Pure-CSS reveal
> (`chartDraw` line-draw + local `chartFadeIn` opacity-only keyframe [NOT fogIn — its blur mushes small SVG
> text] + staggered fade), `prefers-reduced-motion` gated with `opacity:1` scoped to `.chart-fade` so the testing
> line keeps its 0.35. No dual-axis, no em-dashes. vitest 195/2skip, tsc+build clean.
> **OWNER STEPS after deploy:** (a) relabel GB live: `curl -sG ".../api/admin/snapshot" --data-urlencode
> "gp=Great Britain" --data-urlencode "checkpoint=final" --data-urlencode "reconstructed=0" -H "Authorization:
> Bearer $CRON_SECRET"` then `curl ".../api/admin/rebuild-calibration" -H "Authorization: Bearer $CRON_SECRET"`
> → GB becomes 2nd live row (Austria+GB live, 7 pre-beta testing). (b) EYEBALL the chart + decide the x-axis
> question (backlog #7 open note: independent-overlay vs shared-timeline).
>
> ## 2026-07-18 session — cron reorder so due-write claims the live final (backlog #8): PR #30
> Fixes the `/accuracy` live-race headline stall found in PR #29's whole-branch review (M2). Spec/plan
> `docs/superpowers/{specs,plans}/2026-07-18-cron-order-live-final-label*`; ledger `.superpowers/sdd/progress.md`.
> Subagent-driven: 1 task + review (Approved, no Critical/Important).
> **Problem:** cron order was reconcile → due-write → rebuild, so `reconcileFinals` front-ran the due-write and
> wrote the current race's `final` as `reconstructed:true` even when the cron fired in its live window (due-write
> then short-circuited `alreadyPresent`). Every future race would be labeled testing → live count stuck at 1.
> **Fix:** reorder to **due-write → reconcile → rebuild**, extracted into `app/lib/snapshot-cron.ts:runSnapshotCron`
> (pure, dep-injected, due-write isolated in its own try/catch) so the order is unit-tested (regression guard:
> asserts `["write","reconcile","rebuild"]`). The due-write passes only `{ force }` (no `reconstructed`) → live
> capture; reconcile stays unconditional (missed-final safety). Route is now thin glue. 3 files; no reconcile/
> rebuild/snapshot-write/admin/vercel/Python change. vitest 190 pass, tsc+build clean.
>
> ## 2026-07-18 session — atomic calibration-index rebuild (prod data-integrity fix): PR #29
> Fixes a prod data bug found while verifying the reconstructed-labeling: `/accuracy` dropped rows (Australia/
> Japan/Canada vanished) and mis-flagged rounds. Root-caused via systematic-debugging; spec/plan
> `docs/superpowers/{specs,plans}/2026-07-18-calibration-index-atomic-rebuild*`; ledger `.superpowers/sdd/progress.md`.
> Subagent-driven: 3 tasks + per-task reviews + opus whole-branch review (READY TO MERGE, zero Critical/Important).
> **Root cause (two defects, one root):** the season calibration index is a SINGLE Blob key that
> `writeWeekendSnapshot` updated via non-atomic read-modify-write, called once-per-round in loops (the reconciler's
> internal loop + the manual restamp shell loop I gave the owner). D1: under Blob eventual consistency, a later
> round reads the index before an earlier round's write is visible → overwrites it → LOST ROWS. D2: the
> `if (!idx.some(gp===gp))` guard made a forced re-stamp a silent no-op for already-present rows. (My restamp-loop
> instruction directly triggered D1 — owned + fixed.)
> **Fix — decouple + atomic projection:** (1) **`writeWeekendSnapshot` stops writing the index entirely** (RMW
> deleted at source); it stamps `reconstructed` onto the SNAPSHOT object instead (`WeekendSnapshot.reconstructed`),
> set by reconciler + admin (post-hoc) but NOT the live cron due-write. (2) **`app/lib/calibration-index.ts:
> rebuildCalibrationIndex`** reads every `final` snapshot in `race_calendar` (calendar) order and writes the whole
> index in ONE `putJson` — race-free by construction; a pure projection that self-heals (a transient
> eventual-consistency miss recovers next rebuild; snapshots are the source of truth, never destructively mutated).
> `safeRebuildCalibrationIndex` guards it. (3) **Cron rebuilds LAST** (reconcile → due-write → rebuild) each fire;
> new **`/api/admin/rebuild-calibration`** (CRON_SECRET) for on-demand recovery. Fixes race-ordering too (your
> "races should appear in order of occurrence" point). No summarize/prediction/Python/vercel/R17 change; 7 files.
> **VERIFIED:** vitest 186 pass/2 skip, tsc+build clean; Python untouched.
> **OWNER STEP after deploy — RUN PROMPTLY (whole-branch review M1):** labels do NOT self-heal, only rows do. The
> 8 pre-existing test snapshots lack `snap.reconstructed` (old code only wrote the flag to the index ROW), so the
> first cron auto-rebuild yields 9 UNFLAGGED rows → the headline over-counts live races until you re-stamp. Recovery
> (spec §6): (a) run the admin-backfill loop over the 8 (7 pre-beta + GB, **Austria excluded**) — now SAFE in a loop
> since it writes only snapshot keys (no index); (b) `curl ".../api/admin/rebuild-calibration" -H "Authorization:
> Bearer $CRON_SECRET"` once → clean 9-row calendar-ordered index (Austria live + 8 labeled testing). See NEW
> BACKLOG #8 (cron ordering / future-live-label stall) + #7 (chart needs more info).
> **DEBUGGING LESSON:** never mutate a shared aggregate (single Blob key) via read-modify-write in a loop over an
> eventually-consistent store — make it a projection rebuilt in one atomic write. The manual admin backfill is safe
> per-round ONLY because each call writes an independent snapshot key; the INDEX must never be a per-round RMW.
>
> ## 2026-07-18 session — /accuracy reconstructed-round labeling (honesty follow-up, backlog #6): PR #27 (stacked)
> Stacked on the reconciler in the SAME PR #27 (ships together so there's no live window where /accuracy blends
> unlabeled reconstructions). Spec/plan `docs/superpowers/{specs,plans}/2026-07-17-accuracy-reconstructed-labeling*`;
> ledger `.superpowers/sdd/progress.md`. Subagent-driven: 4 tasks + per-task reviews + opus whole-slice review
> (READY TO MERGE, zero Critical/Important).
> **Why:** the reconciler backfills pre-beta rounds (Australia…Barcelona) we never forecast live; scoring them on
> `/accuracy` as if live overstates the track record. Owner chose option (b): label + exclude from headline.
> **What shipped:** (1) **post-hoc writes stamp `reconstructed`** — `writeWeekendSnapshot` gains a
> `reconstructed?` option (WriteDeps) that conditionally stamps the calibration index row; the RECONCILER
> (`{force:false,reconstructed:true}`) and ADMIN backfill (`{force,reconstructed:true}`) pass it; the LIVE cron
> due-write NEVER does (Austria's live-captured final stays counted). Default path row shape byte-unchanged.
> (2) **`summarize` (calibration.ts)** aggregates headline top3/Brier + cumulative chart over LIVE rows only
> (`!reconstructed`); adds `nReconstructed`. (3) **`/accuracy` page** lists the FULL index (gates on
> `index.length`, so testing rows show even at 0 live), renders top3/Brier only when `nRaces>0`, "Races scored"
> shows the live count + gloss "plus N from testing, not counted", and reconstructed rows get a chip **"From
> testing · not predicted live"** (middot, no em-dash, never "reconstructed/regenerated" in UI).
> **VERIFIED:** full branch vitest 183 pass/2 skip, tsc+build clean; pytest untouched.
> **OWNER STEP after deploy (spec §6):** the 8 already-written reconstructed rows (7 pre-beta + GB) predate the
> flag → re-stamp via the admin-backfill curl loop over those 8 (Austria EXCLUDED). Until then they show as
> live/counted. Command in the spec. Future misses auto-flag.
>
> ## 2026-07-17 session — snapshot final-capture reconciler (known-gap hardening): PR #27
> Closes the deferred "AUTOMATIC per-race capture is fragile" gap (handoff 2026-07-07). Spec/plan
> `docs/superpowers/{specs,plans}/2026-07-17-snapshot-final-reconciler*`; ledger `.superpowers/sdd/progress.md`.
> Subagent-driven: 3 tasks + per-task reviews + opus whole-branch review (READY TO MERGE, zero Critical/Important).
> **Root cause (systematic, not a fluke):** the daily snapshot cron (`0 6 * * *`) only writes the CURRENT
> `schedule.gp`'s due checkpoint. R17 self-rolls `schedule.gp` to the next race once the race date passes (Sun
> 18:00), BEFORE the next cron fires (Mon 06:00) — so a race's `final` (freezes past-predictions + scores
> calibration) is systematically missed unless the cron happens to fire in the post-race window before the roll.
> Exact GB-2026 failure; every race was exposed; manual backfill was the only recovery.
> **What shipped:** (1) **`app/lib/reconcile-finals.ts`** (new, 6 vitest) — `reconcileFinals(year, rounds, deps)`
> per round: `final` snapshot exists → `alreadyPresent`; else `getActualFinish` empty → `notRaced` (gate that
> excludes the un-raced upcoming target AND self-heals transient `/api/results` failures, retry next day); else
> `writeWeekendSnapshot(..., "final", {force:false})` → `backfilled`. `safeReconcileFinals` wraps it so a reconcile
> failure can NEVER 500 the cron or block the due write. (2) **`snapshot-write.ts`** — export `getActualFinish`
> (behavior-preserving rename) for reuse. (3) **`app/api/cron/snapshot/route.ts`** — run `safeReconcileFinals` on
> EVERY fire, BEFORE the due-checkpoint logic (the missed-final case is exactly when nothing is due for the current
> gp); `reconcile` summary added to the response. Idempotent (existence check + force:false + calibration-index gp
> guard). No new cron / vercel.json / R17 / admin / Python / data change; 4 files.
> **VERIFIED:** vitest 177 pass/2 skip, tsc+build clean. Python untouched.
> **BEHAVIOR ON DEPLOY:** first real cron fire (or manual `curl "<deploy>/api/cron/snapshot" -H "Authorization:
> Bearer $CRON_SECRET"`) backfills EVERY completed 2026 round missing a `final` → `/accuracy` may jump from ~2
> scored races (Austria, GB) to all completed rounds. Backfilled rows are POST-HOC (`issuedAt=now`, leakage-guarded;
> same caveat as admin backfill). Intended self-heal + richer calibration history, but visible. **See NEW BACKLOG
> #6 (honesty follow-up)** re: pre-beta rounds we never forecast live.
>
> ## 2026-07-17 session — grid-context (overtaking difficulty) in podium narrative (backlog #3): PR #26
> **M7 slice.** Owner backlog #3 (weight grid harder post-quali + track-specific tailoring) was INVESTIGATED as a
> model change and REJECTED on honest validation, then RE-SCOPED to a grounded narrative-context feature. Spec/plan
> `docs/superpowers/{specs,plans}/2026-07-17-grid-context-overtaking-difficulty*` (spec §0 records the NO-GO
> evidence in full); ledger `.superpowers/sdd/progress.md`. Subagent-driven: 4 tasks + per-task reviews + opus
> whole-branch review (READY TO MERGE, zero Critical/Important).
> **Why NOT a model change:** grid already DOMINATES the podium model (standardized logistic coef −2.5, top feature
> by 3×), so "grid doesn't weight enough" is not globally true. Per-track grid→finish stickiness is real and large
> (Spearman ρ 0.43 Las Vegas → 0.90 Monaco/Japan), BUT a grid×stickiness interaction does NOT beat baseline on
> leakage-safe rolling-origin CV (23 held-out races: top3 0.696 unchanged, Brier flat/worse, front-row already
> calibrated 0.67/0.68). House rule (surface go/no-go honestly, don't overfit) → MODEL UNTOUCHED.
> **What shipped:** (1) **`src/inference/stickiness.py`** (new, pure, 12 pytest) — `circuit_grid_stickiness(podium_features,
> gp, year)` = Spearman ρ(grid, finish) over STRICTLY-PRIOR runnings (`year < target`, leakage-safe), tiered
> (sticky ρ≥0.80 / high_overtaking ρ<0.60 / average), `n<2` runnings → None. `grid_context_line(stickiness, drivers)`
> composes ONE fixed grounded sentence, symmetric — fires only for sticky/high_overtaking tier AND a front-row
> driver (grid≤3); average/thin/no-front-row/Friday → silent. (2) **`predict_podium`** attaches `grid_context`
> (Saturday mode only); **model/probability path byte-identical** (regression-tested). (3) **Frontend** —
> `PodiumFacts.grid_context` (snake_case; flows via existing `postJson<PodiumFacts>` cast + `withContext` spread,
> ZERO mapping code) + one `PODIUM_SYSTEM` line letting Haiku weave the one sentence, forbidden from inventing
> overtaking claims. No model change, no new build artifact, no new API route, no em-dashes, leakage-safe.
> **VERIFIED:** pytest 223, vitest 171/2-skip, tsc+build clean.
> **CAVEAT (repo pattern, M2 finding):** the end-to-end NARRATIVE text only renders on a real deploy (Haiku +
> Python `/api/*` not served under `next dev`) — eyeball a post-quali podium at a sticky circuit (Silverstone/
> Monaco front-row) on the deploy to confirm the sentence reads well.
> **DEFERRED (spec §8, not built):** a linked `/learn` concept ("why grid matters more at some tracks");
> front-retention concrete phrasing ("N of last M front-row starters held position") — noise/overclaim risk on thin data.
>
> ## 2026-07-07 session — `/weekend` past-predictions modal (backlog #5): MERGED (PR #23, merge `5453dc0`) → live on prod
> Frontend-only, read-only over existing Blob. In `/weekend`'s pre-predictions "setting up" screen, a
> `cta-grow` link **"Check out {name} GP"** opens a portalled fade+scale modal showing the PREVIOUS GP's
> frozen **final** podium call vs the actual result (rank, ASCII helmet, band, p≈, **Finished P#/✓ or DNF**,
> + "N of our top 3 predicted finished on the podium" footer). Spec/plan `docs/superpowers/{specs,plans}/
> 2026-07-07-weekend-past-predictions-modal*`; ledger `.superpowers/sdd/progress.md`. Subagent-driven: 3
> tasks + per-task reviews + opus whole-branch review (READY TO MERGE, no Critical/Important).
> **What shipped:** (1) **`app/lib/past-predictions.ts`** (pure, 7 vitest) — `resolvePrevGp(scheduleGp,
> calendar, concluded)` (concluded → `schedule.gp`; else the `@/src/race_calendar.json` predecessor of
> `schedule.gp`; round-1/absent → null) + `pastPredictionRows(podium, actuals)` (rows + `hasActuals` +
> `{hits, of:3}` summary via reused `raceDetail`; `finishPos = actuals.indexOf+1` or null=DNF; degrades to
> odds-only when actuals absent). (2) **`app/components/PastPredictions.tsx`** — client `cta-grow` link +
> modal cloned 1:1 from `DriverStopsModal` (portal, Esc/backdrop close, `motion-reduce` gated). (3) Wired
> into the `/weekend` **empty branch only** (`app/weekend/page.tsx`): resolve prevGp → server `getJson(
> snapshotKey(year, prevGp, "final"))` → render guarded by `prevGp && pastData` (graceful absence).
> **VERIFIED local:** tsc + `npm run build` clean, `/weekend` still dynamic, vitest 164 pass/2 skip/0 fail.
> **POST-MERGE FINDING (2026-07-07, debugged on prod — NOT a bug; owner then chose to BACKFILL, see RESOLUTION below):** the link does
> NOT currently render on the Belgium setup screen, and that is CORRECT graceful-absence behavior. Root cause
> (all verified on prod `ecb3e27`, READY): we ARE in the empty branch; feature IS deployed; `prevGp` DOES
> resolve to "Great Britain" (deployed `race_calendar.json` = […, "Great Britain", "Belgium"]); the link is
> suppressed because **`pastData` is null — Great Britain has NO `final` snapshot in Blob**. Corroborated by
> `/accuracy` listing ONLY Austria as scored (GB never entered the calibration index, written by the same
> final-checkpoint path). WHY GB's final is missing: the 07-04 firefight only force-wrote GB's PRE-race
> checkpoints, then the schedule rolled to Belgium, so GB's `final` was never captured (Austria R8 is the only
> race with a complete final snapshot — the beta started at Austria). **The prior review's "GB final exists
> (scored round)" claim was an unverified assumption and was WRONG.**
> **RESOLUTION (2026-07-07, PR #24 `backfill-gb-final-snapshot`, open):** owner chose to BACKFILL GB via a new
> admin endpoint. `app/lib/snapshot-write.ts` extracts the cron's build+score+write into `writeWeekendSnapshot`
> (I/O-injectable, 4 vitest); `app/api/admin/snapshot` (CRON_SECRET-gated) writes an explicit gp/checkpoint
> snapshot; the cron now reuses the helper (behavior unchanged). The "add GB grid first" concern was MOOT — GB
> is a completed race (20 rows in `podium_features` with grid), so `/api/podium` routes it to the historical
> `predict_podium` using its real grid → the backfilled podium is already grid-sharpened (and `grids.json`
> already has a space-keyed `"2026-Great Britain"` entry anyway).
> **OWNER STEP once PR #24 deploys:** `curl ".../api/admin/snapshot?gp=Great%20Britain&checkpoint=final" -H
> "Authorization: Bearer $CRON_SECRET"` → writes `weekends/2026-Great-Britain/{final,latest}.json` + scores GB
> into the calibration index → the "Check out Great Britain GP" link appears on `/weekend`; GB shows on
> `/accuracy`. CAVEAT (by design): post-hoc reconstruction (`issuedAt`=now, rebuilt from current bundled data;
> leakage-guarded so close, but not the live-frozen artifact). Deferred alternative if snapshot gaps recur:
> fall back to the latest prior race that HAS a snapshot.
> **DONE (2026-07-07): PR #24 MERGED + GB backfilled live** (owner ran the curl from the PR #24 preview → shared
> Blob; verified GB now on `/weekend` link + `/accuracy`). **PR #25 MERGED** — label fix: the link/modal now read
> the GRAND PRIX label via `gpLabel(gp)` in `app/lib/circuits.ts` ("Great Britain" → "British" → "Check out
> British GP" / "Previous race · British GP 2026"; place-named GPs fall back to the key), not the venue name
> `getCircuitName` returned ("Silverstone Circuit"). Verified live on prod.
> **KNOWN GAP — deferred (2026-07-07, agreed "deal with next time"):** the AUTOMATIC per-race capture is
> fragile. The daily snapshot cron (`0 6 * * *`) only handles the CURRENT `schedule.gp` and fires ONCE a day,
> so a race's `final` (which writes the frozen snapshot AND scores calibration) is captured only if the cron
> fires inside that race's post-race window BEFORE `weekend-schedule.json` rolls to the next GP. Miss that
> window (sprint timing / firefight / early schedule roll — exactly what happened to GB) and that race is
> silently skipped on BOTH `/weekend`'s prev-GP modal and `/accuracy` (graceful, no error). Backstop today =
> the manual `/api/admin/snapshot` backfill. HARDENING IDEAS for later: (a) drive final-snapshot capture from
> R17 (GitHub Actions, which already runs post-race) instead of only the daily Vercel cron; (b) a reconciler
> that backfills any completed round missing a `final` snapshot; (c) the modal's "fall back to latest prior
> race WITH a snapshot" so a single miss never leaves the screen bare.
> **DEPLOY LATENCY — READ BEFORE RE-TRIGGERING (corrected 2026-07-18):** Vercel prod deploys land
> **~2–4 minutes** after a `main` merge, NOT instantly. This is normal build latency, not a fault.
> **Do NOT conclude a "missed deploy" and re-trigger before ~5 minutes have passed.** Investigation on
> 2026-07-18 (backlog: deploy flakiness) found EVERY session merge deployed on its own within 2–4 min
> (562629e 4min, 31e25cb 2min, 3b1429e 4min, R17 8902b15 2.5min); the perceived "flakiness" was polling
> at ~1–2 min, wrongly concluding a miss, and firing premature empty-commit re-triggers (which just added
> churn — e.g. 562629e deployed the same minute the "re-trigger" was pushed). **Correct procedure:** after a
> merge, wait ≥5 min, then check for a Production deployment on the EXACT merge sha:
> `gh api "repos/<owner>/sector4/deployments?environment=Production&per_page=3" --jq '.[]|"\(.sha[0:7]) \(.created_at)"'`.
> Only if the merge sha is still ABSENT after ~5 min is it a genuine miss.
> **GENUINE MISS (rare — one documented, PR #25 `028091b`, 2026-07-07):** Vercel built the PREVIEW but never
> created a prod deploy. FIX (last resort only): an empty commit re-triggers it (`git commit --allow-empty -m ...
> && git push`, e.g. `a596b09`), OR "Promote to Production" on the successful preview in the Vercel dashboard.
> No `ignoreCommand` in vercel.json; nearly every merge deploys normally. NOTE: `[skip ci]` on an R17 commit
> skips GitHub Actions, NOT Vercel — those still deploy (8902b15 did).
> **OPS NOTE (whole-branch review Minor):** the not-concluded predecessor lookup needs `schedule.gp` to be
> present in `race_calendar.json`. R17 writes `weekend-schedule.json` + `race_calendar.json` together so they
> normally stay in sync; if you EVER hand-edit `weekend-schedule.json` to a new upcoming GP, also append it to
> `race_calendar.json` or the past-predictions link silently won't render (degrades gracefully, no crash).
> **Deferred Minors (not fixed):** `of:3` is hard-coded in the footer copy (never fires — real snapshots carry
> ~20 driver probabilities); no focus-trap on the dialog (inherited verbatim from `DriverStopsModal`, out of scope).
>
> ## 2026-07-06 session — OCCURRED-GATE + sprint-in-standings (ROOT fix for the fastf1 leak class): MERGED (PR #21, `827a3e7`)
> The durable fix behind the 07-04 firefight — **retires the per-table boundary guards** (`_has_raced`,
> `_race_concluded`) by stopping the leak at its source. Post-race, GB self-corrected (real data); this is
> forward-looking so the NEXT weekend (Belgium) never re-leaks. Spec/plan `docs/superpowers/{specs,plans}/
> 2026-07-0{5,6}-occurred-gate-data-integrity*`; ledger `.superpowers/sdd/progress.md`. Subagent-driven: 5
> tasks (Task 5 = controller-run fastf1 rebuild) + opus whole-branch review + 1 fix.
> **What shipped:** (1) **date-gate at the two load chokepoints** — `src/data/load.py:session_in_future` +
> gate in `load_session`; gate in `src/data/results.py:load_season_results`. Skips any session whose
> scheduled date (`s.date`, fastf1 naive-UTC, read BEFORE `.load()`) is in the future. The old "no laps"
> guard couldn't catch it (fastf1 returns leaked laps). **Every feature table is race-gated**, so this
> removes the un-raced target from ALL tables uniformly. (2) **Sprint-in-standings** — `load_season_results`
> folds Sprint session points into championship `points` (additive; `finish_pos`/form stay main-race-only;
> verified British GP LEC 29=25+4sprint). (3) **Build-time fail-safe** — `scripts/build_2026.py:
> assert_no_unraced_target` RAISES if an un-raced target leaks into any live-season table (covers pit_loss;
> matches BOTH the short calendar key AND fastf1's LONG EventName — season_results keys gp by "Belgian Grand
> Prix", the fix's key finding). Runs after build, before the api/ copy → R17 fails safe. (4) **Retired
> `_has_raced` + `_race_concluded` + the weekend-schedule vercel bundle** — shipped WITH the clean rebuild
> (no leaked-table-without-guard window). (5) **Regenerated bundled `api/*.parquet`** through the gated
> pipeline; reconciled 2 pre-existing stale-fixture tests (test_actual_stops "Belgium not in RACE_CALENDAR"
> → beyond-calendar skip; grid.test.ts "GB no grid" → Monaco).
> **DESIGN NOTE (corrected mid-build):** there is NO upcoming-strategy target builder (only podium has one),
> and build_strategy_table needs race laps. So the occurred-gate makes the upcoming weekend's STRATEGY fall
> to the **historical norm** (the original contract) — the pre-race Model-B "predicted" mode we'd seen was
> ENTIRELY the leak. A true pre-race stop-count prediction needs its own FP2 target builder (separate future slice).
> **VERIFIED:** pytest 205, vitest 157/2skip, tsc+build clean; gated build_2026 ran clean + assertion PASSED;
> all 7 api tables 0 Belgium rows; end-to-end (guards removed): GB podium saturday/0-null, Belgium podium
> friday/0-null (upcoming builder), Belgium strategy HISTORICAL.
> **FOLLOW-UPS (logged, out of scope):** (a) `src/data/grid.py:load_qualifying_grid` still ungated — a leaked
> future quali could write a premature grid (same leak class; one-line `session_in_future` guard for the
> backlog). (b) Historical-season (2023-25) sprint backfill deferred — build_2026 is incremental so only the
> LIVE season got sprint points (train/serve champ uses RANK → negligible); a one-time build_all would backfill.
> (c) Grid-weight calibration (LEC P2 felt low) — separate tuning slice, still deferred.
>
> ## 2026-07-04 session — RACE-EVE FIREFIGHT (British GP, sprint weekend): 6 PRs MERGED to `origin/main` + live
> Owner hit multiple prod issues the day before the British GP main race. **ONE root cause behind most of
> them: the fastf1 FUTURE-DATA LEAK.** The un-raced GB *main race* leaked into the bundled feature tables
> (fastf1 exposes future/other sessions), producing fabricated rows. Symptoms + fixes (all merged):
> - **Grey driver helmets** (NOT the tyre glyph — a red herring). TWO causes: (a) 2026 team-name strings
>   from the data don't match `teams.json` keys → grey `NEUTRAL` fallback → **PR #14** added a `TEAM_ALIASES`
>   map (`app/lib/glyph.ts`: Red Bull→Red Bull Racing, Alpine F1 Team→Alpine, RB F1 Team→Racing Bulls,
>   AlphaTauri/Alfa Romeo lineage) + **added Audi + Cadillac F1 Team to `teams.json`** (new 2026 teams;
>   colors are sensible defaults, tunable). (b) **THE actual fix — PR #17:** `api/podium.py` routed GB to the
>   HISTORICAL `predict_podium` path because GB leaked into `podium_features` (with fabricated finish but
>   NULL team) → returned 20 null-team rows. New **`_has_raced(rid)` guard** (team populated = genuinely
>   raced) routes leaked GB to the upcoming builder → 22 clean rows WITH teams. **PR #15** hardened
>   `predict_upcoming_podium` to drop leaked target rows from history before concat (was 42 rows/dup drivers;
>   the "42-driver bug"). NOTE: #14 alone didn't fix it (leaked rows had null team, not a mappable name; and
>   #15's path wasn't even reached until #17 fixed the routing — DEBUGGING LESSON: check the LIVE endpoint,
>   don't fix from data analysis alone).
> - **`/weekend` showed no predictions / stayed grey.** `/weekend` reads a FROZEN Blob snapshot written by the
>   **Vercel cron (daily `0 6 * * *`) — a SEPARATE job from R17.** R17 refreshing data does NOT write the
>   snapshot. The daily cron hadn't hit a GB checkpoint window. **PR #16** added an auth-gated **`?force=1`**
>   to `/api/cron/snapshot` (overwrite the frozen snapshot; idempotent calibration append). OWNER ran
>   `curl ".../api/cron/snapshot?force=1" -H "Authorization: Bearer <CRON_SECRET>"` → snapshotted → `/weekend`
>   rebuilt CLEAN (verified: HAM/ANT/RUS/... colored). **Re-run `?force=1` after any data fix to refresh
>   `/weekend`.**
> - **"british gp" query → "United Kingdom" unsupported.** Parser emits "United Kingdom"; not in the circuit
>   aliases. **PR #18** added `united kingdom`/`england` → Great Britain (`app/lib/circuits.ts`).
> - **Strategy showed a fabricated "actual" for GB** (same leak, into `actual_stops` — fully-populated row, no
>   null-field tell). **PR #19** gates the `actual` branch on a DATE signal: bundled `app/data/weekend-schedule.json`
>   into `api/strategy.py` + `_race_concluded(year,gp)` (only serve "actual" once the schedule target's `final`
>   time passes). GB now falls through to Model-B "predicted" — but that's on a SEPARATELY leaked
>   `strategy_features` row (GB is a sprint weekend = no real FP2), so it's still not fully honest → root gate (below).
> **All 6 PRs (#14-#19) merged + live; branches deleted. 197 pytest + full vitest green.**
> **ARCHITECTURE LEARNINGS (load-bearing):** (1) `/weekend` = frozen Blob snapshot (cron), NOT live and NOT R17;
> refresh via `?force=1`. (2) fastf1 leaks future/other sessions → any table built over a calendar that
> includes the un-raced target (the data-currency auto-calendar DOES) can get fabricated rows; the podium
> `_has_raced` + strategy `_race_concluded` are per-table BOUNDARY guards, not the root fix.
> **PARKED — deliberate POST-RACE data-integrity pass (one clean spec→plan→build slice):**
> (a) **ROOT occurred-gate** — stop un-raced targets leaking into ANY feature table (podium/strategy/actual_stops/
> season_results) at BUILD time (date-based; strategy_features is special — FP2 practice IS valid pre-race, but a
> sprint weekend has no FP2). Retires the per-table boundary guards + stops R17 re-leaking each run. Also the GB
> strategy "predicted"-on-leaked-FP is only fully fixed here. (b) **Sprint-in-standings** — fold sprint points into
> `season_results` (currently GP-only: 8 events × 22, no sprint rows; predictions do NOT factor sprint results —
> minor accuracy gap, within-weekend ordering is the fiddly part). (c) **`m7-explainers-expansion` branch**
> (24 concepts, all 7 tasks green, whole-branch review blocked by session limit) — built but NEVER PR'd; interrupted
> by this firefight. Ready to finish/PR.
>
> ## 2026-07-03 session — M7 slice 2: dominant-compound query wiring: MERGED to `origin/main` (PR #12, merge `a774243`) — deploying
> **Second M7 sub-project.** Wires the already-parsed `predict_compound` intent end to end: "what tyre
> compound is usually dominant at circuit X?" now flows NL → parser → `/api/strategy` (compound branch)
> → grounded narrative → a `CompoundCard` with a compound-colored ASCII tyre glyph. **HISTORICAL norm,
> NOT a telemetry prediction** (Phase 1: dominant compound has no edge, 0.733=0.733); every narrative
> carries the **Pirelli-allocation caveat**. Spec/plan `docs/superpowers/{specs,plans}/
> 2026-07-02-m7-dominant-compound*`; ledger `.superpowers/sdd/progress.md`. Subagent-driven: 6 tasks +
> per-task reviews + whole-branch review + 1 fix-wave.
> **What shipped:** (1) **`src/inference/strategy.py:dominant_compound_norm`** — leakage-safe lookup of the
> `hist_dominant` column (mode of the circuit's dominant dry compound over strictly-EARLIER years). No ML,
> no pipeline change, no new table. Upcoming race (no row for its year) falls back to the latest prior
> running (lags by one running, accepted); no history → honest `None`. **v1 uses hist_dominant only — no
> "X of N" share** (owner: the raw per-race `dominant_compound` is intentionally NOT persisted as a leakage
> guard, so a share would need a pipeline change; deferred). (2) **`api/strategy.py`** gains a
> `kind:"compound"` branch via a new `route()` dispatcher — reuses the bundled `strategy_features.parquet`,
> NO new lambda/table. Default (no kind) → unchanged stop-count. (3) **`generateCompoundNarrative` +
> `CompoundFacts`** (`app/lib/narrative.ts`) — grounded, historical framing, mandatory allocation caveat,
> honest degrade on `None`. (4) **`app/lib/compound.ts`** color/letter map (SOFT red / MEDIUM amber / HARD
> light-grey — color-coding only, NO Pirelli marks per §8) + optional **`color` prop on `AsciiEmblem`**
> (defaults to brand blue via `emblemSvgMarkup`'s own default, so existing callers UNCHANGED) + **`CompoundCard.tsx`**
> (compound-tinted ASCII tyre glyph via `AsciiEmblem kind="tyre"` + contrast-guarded S/M/H letter). (5) Wiring:
> orchestrate `predict_compound` branch (mirrors `predict_strategy`), ask-route deps, page render, parser desc.
> **HONESTY FIX (whole-branch review):** for a COMPLETED-race exact-match query, `basis_year==year` and the
> compound is a projection from BEFORE that year; the prompt didn't disambiguate → hardened `COMPOUND_SYSTEM`
> ("never state it as that specific year's own observed result").
> **HOW TO TEST (on the live deploy):** ask e.g. "what tyre is usually dominant at Monza?" or "typical
> compound at Silverstone?" → expect a CompoundCard with a colored tyre glyph (S/M/H) + a narrative that says
> "historically ... has been the X compound" + the Pirelli-allocation caveat. A no-history circuit (e.g. a
> brand-new 2026 circuit) → honest "not enough history". NOTE: NOT testable under `next dev` (Python `/api/*`
> only served on a real deploy — M2 finding). 194 pytest + 146 vitest pass, build clean, zero pipeline/parquet/
> vercel changes. **REMAINING M7 slices (each its own spec→plan→build): explainers 8→15, visual polish,
> optional championship projection.**
>
> ## 2026-07-02 session — M7 slice 1: season calibration curve (`/accuracy`): MERGED to `origin/main` (PR #11, merge `29cbe12`) — deploying
> **First of M7's independent sub-projects.** Makes the honesty thesis VISIBLE: a new `/accuracy`
> "track record" page that scores every issued podium against the real finish and shows the season
> trend (calibration expected to sharpen as 2026 accumulates). Reads the record the M5 cron already
> logs. **DISPLAY-ONLY by owner decision:** no isotonic/Platt fit, no bands→% flip, OWN SCORES ONLY
> (no baseline). Spec/plan `docs/superpowers/{specs,plans}/2026-07-02-m7-calibration-curve*`; ledger
> `.superpowers/sdd/progress.md`. Built subagent-driven: 5 tasks + per-task reviews + opus whole-branch
> review (MERGE-READY, data contract traced exact) + 1 fix-wave.
> **What shipped:** (1) **`app/lib/calibration.ts`** — pure `summarize()`/`calibrationStatus()`/
> `raceDetail()`; ALL rounding centralized here. (2) **`app/lib/chart-path.ts` + `app/components/
> CalibrationChart.tsx`** — dependency-free inline-SVG cumulative trend chart (top-3 hit rate primary
> line, Brier co-metric); server-renderable + static. (3) **`app/accuracy/page.tsx`** — server component
> reading the live Blob season index (`seasonIndexKey`), four honest states by race count (empty /
> reliability banner always-on / scorecard / race-by-race, chart only at ≥3 races); missing snapshot
> degrades to score-only row. (4) **`SiteNav`** gained the "Accuracy" link. **Read-only over Blob — NO
> changes to the cron, `actuals.ts`, the snapshot write path, Python, or R17.**
> **Gate-check wired but held `false` (`CALIBRATION_MIN_RACES`):** the future %-upgrade slice just flips
> `status.ready` on — this v1 never shows a calibrated %. **HONESTY FIX from review:** the Brier line was
> min-max self-normalized (always spanned full height → visually overstated improvement on the honesty
> page); fixed to plot `1 - meanBrier` on the true shared 0..1 axis (Brier is bounded [0,1]).
> **VERIFY ON PROD/PREVIEW:** only the EMPTY state was checkable locally (local Blob is empty); the
> populated scorecard/chart/rows need real Blob data — eyeball `/accuracy` once the deploy lands (Austria
> R8 final was scored, so ≥1 row should exist). 142 vitest pass/2 skip, build clean, `/accuracy` dynamic
> route, zero Python touched. **REMAINING M7 slices (each its own spec→plan→build): dominant-compound
> query type, explainers 8→15, visual polish, optional championship projection.**
>
> ## 2026-07-02 session — data-currency automation + R17 hardening: MERGED + PUSHED to `origin/main` (merge `24761d6`, head `07a3fd8`) — LIVE
> Closes OPEN TODOs #2 (data-currency automation) and #4 (R17 parquet non-determinism + China
> pit-loss noise). Built subagent-driven (spec/plan `docs/superpowers/{specs,plans}/
> 2026-07-02-data-currency-automation*`; ledger `.superpowers/sdd/progress.md`). 7 tasks + a
> whole-branch (opus) review + 1 fix-wave; 185 pytest + 133 vitest green. **PUSHED to `origin/main`
> (head `07a3fd8`) — live on Vercel prod. The live `.github/workflows/refresh-weekend-data.yml` was
> synced via the GitHub web editor (commit `07a3fd8`, "Add content fingerprint computation step",
> committer `GitHub`), and now matches the `docs/ops/` template byte-for-byte.**
> **What shipped:** (1) **`src/data/schedule.py:derive_live_calendar(year)`** derives the live
> calendar + weekend schedule from `fastf1.get_event_schedule` by **race-session DATE** (leak-safe —
> never inspects lap data; fastf1 leaks future laps). (2) **`RACE_CALENDAR[2026]` is now data-driven**
> from committed **`src/race_calendar.json`** (read fastf1-free by `src/calendar.py:_load_2026` with a
> hardcoded `_FALLBACK_2026`; bundled into serverless via the existing `{src/**}` glob — no vercel.json
> change). 2023-25 stay hardcoded `DRY_CIRCUITS`. (3) **`build_2026.py` step 0** writes
> `src/race_calendar.json` + `app/data/weekend-schedule.json` FIRST and feeds the derived list as
> `LIVE_CIRCUITS` (fetch failure → leaves both files untouched). So R17 **self-updates** the calendar +
> upcoming weekend each run — no more manual `RACE_CALENDAR`/`weekend-schedule.json` bumps. **This merge
> also flipped Austria → Great Britain** (round 9, the current target) in both JSONs. (4) **R17
> content-fingerprint deploy gate:** `scripts/data_fingerprint.py` writes `api/data-fingerprint.json`
> (order-independent per-table content hashes); the workflow commits/deploys ONLY when the fingerprint
> or a tracked JSON changed, else discards the non-deterministic parquet churn (`git checkout --
> api/*.parquet`). Both workflow copies updated. (5) **China thin-sample pit-loss:** `lookup._pit_loss`
> blends a multi-year median when the DEFAULT (latest-season) row has `n_stops < 12` (China 7 / Japan 10
> caught; Las Vegas 12+ unaffected); explicit-year requests are never blended.
> **FIX-WAVE (final review):** `race_stop_distribution` now **fails CLOSED** — returns `{}` whenever
> finishers can't be classified (no results / no `ClassifiedPosition` / zero classified), instead of
> counting every driver. This closes a latent fail-open that automation makes riskier: the auto-derived
> calendar always includes the un-raced target (intended, matches the pre-existing "issue before the
> race" design), so if fastf1 leaks pre-race laps for it with unclassified results, the old code would
> have written a bogus actuals row. Regression test added (`test_leaked_target_laps_with_no_
> classification_produce_no_row`). NOTE: the calendar design (target inclusion) is UNCHANGED.
> **OWNER STEP (push): DONE (2026-07-02).** `origin/main` == local `main` at `07a3fd8`; deployed to prod.
> The live `.github/workflows/refresh-weekend-data.yml` was updated through the GitHub web editor (the
> token-scope route around the missing `workflow` scope) and is byte-identical to the `docs/ops/`
> template. Confirm on prod that "next race"/`/weekend` reads Great Britain.
>
> ## 2026-07-01 session — all MERGED to `main` + LIVE on prod
> Shipped, in order: **(1) Mobile hamburger nav** (merge `34ff737`) — below `md` the inline row
> becomes a full-screen GSAP overlay portaled to `document.body` (the header's `backdrop-filter`
> makes it a containing block, so an in-header overlay clamped to 68px — GOTCHA). Later added an
> **open-state focus trap** (`inert` on the background). **(2) De-staled the Python test**
> `test_unrun_race_is_empty_not_error` (assert a far-future season). **(3) 2026 stop-count DATA-LOSS
> fix** (merge `96f597f`): `_merge_live` dropped ALL current-season rows before appending the fresh
> build, so an empty/partial CI fetch wiped 2026 rows — replaced with non-destructive
> `src.pipeline.merge_refreshed` (race_id-keyed) + rebuilt tables. **(4) Stops + pit-loss FULL
> coverage** (merge `b4c1b60`, closes old TODO #1): every completed 2026 race answers "how many pit
> stops" with its ACTUAL distribution; the next race gets a HISTORICAL NORM (sharpens to the Model-B
> telemetry prediction once dry practice exists); pit-loss covers every round. New `actual_stops`
> table (`src/features/actual_stops.py`, `build_actual_stops`) counts COMPOUND CHANGES among
> CLASSIFIED finishers (red-flag-safe; naive stint-count read Monaco as 5 stops). `api/strategy.py`
> routes actual/historical/predicted by race state; `strategyLede` + `StrategyCard` mode label.
> **CRITICAL GOTCHA — the occurred-gate:** `build_actual_stops` builds live-season actuals ONLY for
> `gp in RACE_CALENDAR[live]` because **fastf1 LEAKS future race data** (British R9, 2026-07-05, had
> laps pre-race). NEVER extend `RACE_CALENDAR` to the full schedule — it must stay "rounds run so
> far". `STOPS_CIRCUITS` = full 22-circuit roster (for norms), separate from RACE_CALENDAR. Also
> fixed the Barcelona↔Spain pit-loss collision. **(5) Query fixes + palette re-skin** (merge
> `f28417a`): "next race" resolves for stat lookups; the full roster circuits normalize on the
> frontend (`circuits.ts`, Spa/Belgium/etc.); `explain_concept` ("what is DRS?") now answers with the
> concept summary + /learn link (`matchConcept` in `concepts.ts`, `orchestrate.ts` branch, new
> `ConceptCard` in page.tsx). Applied the owner's coolors palette
> (bee2f0-459ae4-2f2e89-addcef-406cd6-251f44) everywhere: `ink #251F44`, `accent #2F2E89`, `--ramp`
> + ALL fog/art re-derived; home `AsciiFog` sweeps the full palette with LUMINANCE-AWARE alpha, and
> the broad central white scrim was thinned so the fog reads colourful (text keeps its own `.legible`
> backing). 2026-forward tagline + chips; Ask h1 + input bar join the `fog-in` entrance.
> **DATA-CURRENCY NOTE:** fastf1's real 2026 data runs AHEAD of the app's canonical calendar — as
> each round runs, bump `RACE_CALENDAR[2026]` + `app/data/weekend-schedule.json` per weekend (ops
> cadence) so all tables build for it; the occurred-gate + full roster handle the rest.
> **NEXT: M6-C (entity-what pipeline).** Built subagent-driven (specs/plans in
> `docs/superpowers/.../2026-06-28-mobile-*`, `2026-07-01-stops-pitloss-*`).
>
> ## M6-C — entity-what pipeline: COMPLETE, MERGED, LIVE + FULLY WIRED (2026-07-01/02)
> Merge `ecf0128` (`--no-ff`), live on `sector4.net`; branch `m6c-entity-whats` deleted. The entity-what
> pipeline (PRD §6.6): cited/badged whats for circuits+drivers+teams in committed
> `app/data/entity-whats.json` (generated by R17: Wikipedia REST + Haiku paraphrase), surfaced through the
> generalized M6-B popover (inline circuit/team name links + driver-glyph tap) + the `/weekend` block, with
> a "spotted something wrong?" form that opens a GitHub issue. Retired the curated `circuit-facts.json`
> stopgap via the `getCircuitFacts` seam (deleted the dead JSON). Hard facts stay in
> `drivers.json`/`teams.json`, never cached prose. Spec/plan/ledger:
> `docs/superpowers/{specs,plans}/2026-07-01-m6c-entity-whats*`, `.superpowers/sdd/progress.md`.
> All 7 tasks done + reviewed; whole-branch fix-wave (2 Minors: `/api/correction` 502-on-network + slug cap).
>
> **OWNER SETUP — ALL DONE + VERIFIED (2026-07-02):** (1) live `.github/workflows/refresh-weekend-data.yml`
> synced from the `docs/ops` template via the GitHub web UI (commit `00ab9c5`; CI PAT lacks `workflow` scope
> so the controller can't push it — always edit the live workflow via the UI or a scoped token, keep
> `docs/ops` as the canonical template) — this ALSO fixed the pre-existing `pit_loss.parquet` omission from
> the stage step. (2) Vercel env vars `GITHUB_CORRECTIONS_TOKEN` + `GITHUB_CORRECTIONS_REPO` set (Prod+Preview,
> redeployed). (3) `ANTHROPIC_API_KEY` confirmed as a repo Actions secret.
> **VERIFIED LIVE:** `/api/correction` end-to-end (filed + closed test issue #10); the R17 cron (Fri/Sat/Sun
> `0 8,18 * * 5,6,0`) fires (prior scheduled runs visible in Actions).
>
> **GENERATION HAS RUN (2 manual `workflow_dispatch` runs, 2026-07-02):** `entity-whats.json` now holds
> **61 of 62** real records (24/24 circuits, 26/27 drivers, 11/11 teams). Two follow-up fixes shipped after
> the first run: **(a)** throttle + retry — the first run rate-limited (HTTP 429) and skipped 26 entities
> because it fired ~62 Wikipedia requests back-to-back; added a 300ms inter-request gap + 429/503 retry with
> exponential backoff honouring `Retry-After` (commit on `main`); the 2nd run got 61/62 with zero 429 skips.
> **(b)** `LAW` Wikipedia title fixed (`"Liam Lawson (racing driver)"` 404 → `"Liam Lawson"`) — this is the
> only missing entity; **deferred to the weekend R17** (not worth a 3rd full fastf1 build for one driver).
>
> **OWNER-DIRECTED TWEAKS (commit `a6311f9`, 2026-07-02):** **(1) Badge defaults to `verified`** (was
> `drafted`) — owner considers Wikipedia + the allowlisted-source paraphrase editorially verified; `mergeWhat`
> now NEW/changed → `verified`, unchanged keeps prior; the 61 committed records were flipped to `verified`
> too (live now). NOTE: this DEVIATES from PRD §6.6's "auto-badged drafted, unverified" — owner decision,
> update the PRD text if reconciling. **(2) Kept every-run regeneration** (no TTL gate) so facts stay fresh
> (e.g. a driver's win count updates) — the churn is intentional; a `verified` badge will be re-set to
> `verified` each run (human `community-reviewed`/downgrades survive only an *unchanged* regen, which is rare
> since Haiku prose varies). **(3) F1-focused, type-aware paraphrase prompt** — teams focus on their Formula
> One identity/history/results (ignore parent-company/road-car history), drivers on racing career, circuits
> on the track + its grand prix. Prompt only affects NEW generation, so **improved team text lands on the
> weekend R17** (current team summaries are from the old generic prompt). Also fixed the test suite that went
> red when real 61-entity data replaced the 3-record seed (orchestrate pit_loss/podium assert the stable core
> not a deep-equal; `getCircuitName` expects the generated title).
>
> **STILL PENDING (weekend R17, British GP 2026-07-05):** fills in `LAW`, re-drafts all team text with the
> F1-focused prompt, and re-verifies everything. No action needed — it happens on the scheduled run.
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
> **M6-B — inline concept links + in-context popover: MERGED to `main` and LIVE on PRODUCTION.**
> The "whys link to whats" half of the learning layer (PRD §6.6). Narratives in all four answer
> cards (Stat/Podium/Pace/Strategy) now linkify recognized concept terms; clicking opens a popover
> anchored over the word with the concept summary + `TrustBadge` + "Read more →" to `/learn/[slug]`.
> Deterministic post-process (NO Haiku prompt change, zero hallucination risk): `aliases: string[]`
> added per concept (`concepts.json`), pure `app/lib/linkify.ts` (`linkifyNarrative` longest-alias-
> first/word-boundary/first-occurrence + `computePopoverPosition` below/flip-up/clamp, both node-
> tested), `ConceptPopoverProvider`+`useConceptPopover()`+portalled `ConceptPopover`
> (`app/components/ConceptPopover.tsx`), `NarrativeText` renderer. Spec/plan in
> `docs/superpowers/{specs,plans}/2026-06-28-m6b-*`; built subagent-driven, opus whole-branch review
> (1 Important fixed: stale dismiss-timer cleared on unmount + provider `open` `useCallback`).
> **Polish pass (owner-directed, same branch):** highlighted concept words render in **PP NeueBit**
> (`font-pixel`, ~1.15em); **`/learn` cross-page route transition** (`app/learn/template.tsx` re-mounts
> per nav → `.learn-route` opacity crossfade) + **concept-page enter cascade** (`.learn-rise` staggered
> across sections); **bigger "← Learn" back link** (PP NeueBit `text-xl`, growing underline). All motion
> gated by `prefers-reduced-motion`. 109 vitest pass/2 skip, `npm run build` clean.
>
> **Remaining M6:** none — M6-A/B/C all shipped. **M7 (breadth + polish) is UNDERWAY: slice 1 (the
> `/accuracy` season calibration curve) MERGED (PR #11, `29cbe12`) — see the top entry.** Remaining M7
> slices: dominant-compound query type, explainers 8→15, visual polish, optional championship projection.
>
> **OPEN TODOs / known gaps (updated 2026-07-02):** (old TODOs #1 stop-count data + #2 mobile
> hamburger, the `test_unrun_race_is_empty_not_error` failure, AND M6-C are all DONE — see the entries
> above.) Remaining:
> 1. **M7 — breadth + polish (UNDERWAY).** ✅ Slice 1 (`/accuracy` season calibration curve) MERGED
>    (PR #11, `29cbe12`) — verify populated states on the live deploy. Remaining slices (each its own
>    spec→plan→build): dominant-compound query type, explainers 8→15, visual polish, optional
>    championship projection.
> 2. ✅ **Data-currency automation — DONE + PUSHED (2026-07-02, merge `24761d6`, head `07a3fd8`; live on
>    prod). See the session entry above.** R17 now self-derives `RACE_CALENDAR[2026]` +
>    `weekend-schedule.json` from fastf1's schedule by race date. Live workflow synced via the GitHub
>    web editor (matches `docs/ops/` template).
> 3. **Ops hygiene:** rotate the PREVIEW `CRON_SECRET` off the throwaway `s4-cron-test` value.
> 4. ✅ **R17 parquet non-determinism + China pit-loss noise — DONE (2026-07-02, same merge).** Content-
>    fingerprint deploy gate (`api/data-fingerprint.json`) so R17 deploys only on real change; China/thin-
>    sample pit-loss now blends a multi-year median (`n_stops < 12`).

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
