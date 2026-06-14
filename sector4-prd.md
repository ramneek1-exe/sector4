# Product Requirements Document: Sector 4

**Project Name:** Sector 4 — Predictive Telemetry Intelligence
**Product Owner:** Ramneek Singh
**Timeline:** May 2026 → September 2026 (must be done before fall semester begins)
**Private beta:** Spanish Grand Prix weekend (June 2026)
**Public launch:** Italian Grand Prix weekend (Monza, early September 2026) at the latest — bulk of work wrapped in August so launch doesn't collide with the first week of classes
**Platform:** Web, mobile-responsive, desktop-first

---

## 1. Executive Summary

Formula 1 broadcasts surface-level data, but the real story of a race weekend is buried in raw telemetry and Free Practice long-run pace. Sector 4 is a natural language interface over F1 telemetry that produces ML-backed pace predictions and grounded explanations for each prediction, alongside a curated learning layer that explains the technical concepts behind what the data is showing.

The product serves the casual F1 fan who watches races but skips practice — fans who want predictions that feel rigorous without doing homework, with the option to drill deeper when something piques their curiosity.

The 2026 regulation reset is treated as a feature, not a problem: the model learns the new season as it unfolds, and uncertainty is surfaced visibly rather than hidden behind a confident UI.

---

## 2. Audience

**Primary:** The engaged-but-not-obsessive F1 fan. Watches Sunday races, sometimes quali, rarely practice. Knows the drivers and rough team order but couldn't define tire degradation. Wants predictions that feel impressive without requiring practice-session homework.

**Secondary (served implicitly):**
- Newer fans who want the sport to make more sense — served by the explainer layer surfaced through prediction narratives
- Engaged technical fans — served by the data depth and the honesty of the methodology, even if they're not the primary marketing target

**Explicitly not the primary audience:** the r/F1Technical / FastF1-power-user crowd. That space is over-served, and competing there isn't where Sector 4 wins.

---

## 3. Goals

- Produce race-pace predictions that meaningfully beat naive baselines on 2026 data
- Ground every prediction in explainable model reasoning, not LLM-generated speculation
- Make the underlying F1 concepts accessible through contextual learning content
- Treat regulatory uncertainty as a visible product feature, not a hidden flaw
- Ship something a solo developer can build and maintain alongside a full-time job

## 4. Non-Goals

These are out of scope for v1 and likely beyond:

**ML / prediction:**
- Qualifying predictions
- Lap-by-lap live race prediction
- Driver-specific setup or telemetry deep-dives
- Safety car, weather, or red flag probability modeling
- Fantasy F1 recommendations
- Anything that touches betting odds or gambling regulatory surface
- Multi-season historical research as a primary use case

**Product:**
- User accounts, saved queries, personalization, history
- Comments or social features (corrections form is the only user-generated input)
- Native mobile app (web-responsive only)
- Email notifications, weekend reminders, newsletter
- Multi-language support
- A "simulator" mode for tweaking inputs

**Content:**
- Standalone driver or team biography pages (replaced by contextual callouts; see §6.5)
- Historical driver content beyond what's needed for prediction context
- News aggregation or coverage
- Race result archives (Wikipedia and F1.com cover this)
- Opinions on regulations, controversies, or off-track drama

The rule for non-goals: if any of these start showing up during build, they go in a "future ideas" doc. Not in v1.

---

## 5. Success Metrics

Three metrics, three roles. The split matters because it stops "accuracy" from becoming a single noisy number used to mean different things.

| Metric | Role | Where it appears | v1 target |
|---|---|---|---|
| Pace MAE (s/lap) | Primary engineering metric | Internal dev decisions | < 0.20 s/lap on held-out 2026 races |
| Top-3 accuracy | Primary product metric | Headline claims, in-app accuracy display | >= 60% across 2026 season-to-date |
| Spearman rho | Secondary honesty metric | Field-test write-ups, baseline comparisons | >= 0.65 on held-out races |

**Baselines to beat:**
- For pace/podium: grid position alone (~50-55% top-3 in modern F1)
- For strategy: modal stop count from last 3 years at the same track

**Validation strategy:** rolling-origin time-series CV. Train on races 1..N, validate on race N+1. Never random k-fold (leaks future info into past). The week-over-week accuracy curve this produces also becomes a public-facing artifact (see §6.4).

**Operational metric:**
- P50 query -> render latency: < 4s
- P95 query -> render latency: < 8s

The 60% top-3 target is a commitment, not a hope. If the model can't beat it, the honest move is shipping a smaller claim or no headline accuracy number — not lowering the bar to make the claim true.

---

## 6. Core Features

### 6.1 Natural Language Query Interface

Single search-style input. User types a question, gets a structured answer with a grounded narrative.

Example queries for v1:
- "Who's got the best race pace at Catalunya?"
- "Is it a 1-stop or 2-stop at Spa?"
- "What tyre will most of the field run at Spa?"
- "How much time is lost in the pit lane at Monaco?"
- "How long before the softs drop off at Barcelona?"
- "What is tire degradation?"
- "Why is Monaco so hard to overtake at?"

### 6.2 Two Prediction Models

> **Phase 1 validation outcome (2023–2025 data spikes).** Telemetry has exactly **two validated contributions**: **(1) predicted pace gaps + uncertainty** (Model A) and **(2) stop-count strategy** (Model B). **Podium ranking and dominant-compound** showed **no telemetry edge** over public/historical baselines — grid position (Saturday), championship standings/recent form (Friday), and historical compound norms — and run on those baselines as honest probabilities. Full evidence in `notebooks/*_RESULTS.md`.

**Model A — Race Pace Prediction (regression).**
Predicts each driver's expected race pace as a delta against a reference, with uncertainty intervals per driver. **Validated role: predicted pace gaps (in seconds) + uncertainty** — information no order-based signal can produce. Podium ranking is **not** a telemetry differentiator: across the spikes FP pace did not beat grid (Saturday) or standings/form (Friday), so the top-3 call is shown as honest probabilities built on those public signals. Model A is therefore a **supporting** pace-context feature, not the headline.

Inputs include:
- FP1/FP2 long-run pace (after the feature engineering pipeline in §7.2)
- Grid position (when available)
- Tire degradation slope on the relevant compounds
- Track-intrinsic features (length, abrasiveness, historical pit-loss)
- Historical performance at this track (heavily discounted for regulation continuity)

**Model B — Strategy & Compound Prediction.**
Two outputs, **validated separately** in the Phase 1 spike — the result is a split:

- **Stop count (per driver) — VALIDATED telemetry edge.** FP degradation features beat the track-historical-norm baseline on held-out 2024–25 stop-count accuracy (≈0.71 vs ≈0.64), and the gain isolates to the FP deg features — the causal deg→stops link holding up empirically. This is the **only** validated telemetry edge in Phase 1. Framed as a **supporting, caveated** capability: predict the *likely* strategy **with explicit safety-car uncertainty** — live accuracy will trail the dry/SC-clean backtest, since SC-forced stops aren't strategy. It is also a prime **explainer hook** (deg → stops is teachable).
- **Dominant compound (race-level) — NO-GO (no telemetry edge).** FP deg tied the historical-norm baseline. The call runs on **"the typical compound here"** (historical dominant / median allocated), with the weekend's Pirelli allocation as input. Secondary, presented as historical context, not a telemetry-driven prediction.

Inputs include:
- Track abrasiveness and historical pit-lane time loss
- The weekend's actual Pirelli compound allocation (required input — predictions are among the three compounds actually brought)
- FP-derived degradation curves
- Forecast conditions (pulled from public weather sources); assumes a dry race, with a dry/wet condition flag
- Historical compound usage at the track (track-intrinsic features transfer across the 2026 reset; absolute deg rates do not — see §7.2)

The compound prediction renders through the tire glyph (§8) and is labeled race-level. It is a secondary feature, not a headline — and per the Phase 1 result above it carries no telemetry edge, so it is presented as historical "typical compound here" context.

### 6.3 Grounded Narrative Generation

Every prediction is paired with a 2-sentence narrative that explains the *why*. The narrative is generated by an LLM, but it is **grounded in the model's actual reasoning** — top feature attributions (SHAP values or feature importances) are passed into the prompt as facts the LLM must reference. The narrative cannot invent facts; the prompt enforces this.

When feature importances are weak or contradictory, the narrative honestly says so ("the model isn't confident — Norris's FP2 pace was strong but his tire deg was inconsistent"). This honesty is a feature, not a fallback.

### 6.4 Visible Uncertainty

The model has seen 8-15 weekends of 2026 data by launch. That's small. Rather than hide this, the product surfaces:
- Confidence intervals on every prediction
- A "model has seen N races of 2026 data" indicator
- A public week-over-week accuracy curve, updated after each race
- A "low confidence — insufficient long run data" output state for unusable sessions (wet FP2, red flags, short programs)

### 6.5 Contextual Driver Callouts

When a prediction mentions a driver, hovering or tapping the name reveals a small structured context card:

- Name, three-letter code, team
- Years in F1, career wins (from a manually-curated 2026-active-grid JSON file)
- Track-specific history at the venue in question (auto-derived from FastF1 race result data — never written prose, never LLM-generated)

These are not bios. They are derived data with a thin frame around them. Wikipedia exists for everything more.

### 6.6 Learning Layer (Explainers)

A library of short technical explainers for the core F1 concepts that show up in prediction narratives. Surfaced through:

- Inline links inside narratives ("driven by strong [tire deg slope](#) on the C4 compound")
- Direct queries handled by a third intent class: `explain_concept` ("what is tire degradation?")

Each explainer follows a fixed structure:
- One-paragraph "what it is" definition
- Two or three concrete examples, including at least one pulled from recent live session data via FastF1
- One "why it matters for predictions" tie-in
- A "common misconception" callout

**Authoring workflow:**
1. Curated source list — a handful of trusted F1 technical sources (the published technical regulations, Pirelli's own publications, a small set of trusted technical writers, Sector 4's own session data). Sources are vetted manually. **No web scraping. No autonomous agents.**
2. For each explainer: ~5 min curating relevant sources, ~5 min writing the prompt, ~5 min generating the LLM draft, ~10 min reviewing for factual accuracy. Anything Ramneek can't verify is deleted, not left in.
3. Drafts ship with a **public verification badge**:
   - **Verified** — checked against primary sources
   - **Drafted, unverified** — LLM-drafted, sources listed, not yet vetted
   - **Community-reviewed** — corrected by a reader and incorporated
4. Every explainer carries a "spotted something wrong?" link that opens a one-field correction form.

The verification badge UI must look like a deliberate design choice, not a disclaimer. If it looks like a disclaimer, readers read it as a hedge; if it looks intentional and well-typeset, readers read it as integrity. Budget design time for it specifically.

**v1 target:** 15 explainers at launch, mostly in "drafted, unverified" status. Promoted to "verified" over time. Concepts to cover: tire degradation, fuel effect, undercut/overcut, dirty air, qualifying vs. race pace, compound choice, pit-lane time loss, sector characteristics, DRS, track evolution, sandbagging, FP session purposes, plus 3 to be picked based on what proves to come up most.

### 6.7 Animated Reveal (universal)

The ASCII/dither reveal is the product's signature motion and applies to **everything rendered to screen, not just predictions** — prediction cards, explainer panels, driver/team/tire glyphs, charts, the accuracy curve, contextual callouts. Any output element animates in via the shaders.com Ascii/Dither effect resolving from noise/low-density into clarity, with GSAP orchestrating motion and timing. This makes the reveal a consistent system-wide signature rather than a one-off on the prediction screen. For primary outputs (the prediction reveal, glyphs) the resolve runs concurrent with the data/API call, so the animation doubles as the loading state and masks latency.

Two guards on "everything animates":
- **Reduced motion:** honor `prefers-reduced-motion` with a static or minimal-fade fallback — the shader resolve must be fully skippable.
- **Restraint + performance:** reserve the full resolve for primary output moments; use a lighter/faster variant (or none) for body text and high-frequency UI, so readability isn't hurt and the GPU isn't running many simultaneous shader passes. Budget the number of concurrent shader surfaces.

For the prediction flow specifically, the reveal doubles as the loading state: the animation runs concurrent with the API call, so at warm-instance speeds the user never sees a separate spinner — the reveal *is* the load. For already-loaded content (e.g. navigating to an explainer), the same effect plays as a fast entrance animation.

Implementation note: a single shared `Reveal` wrapper component applies the effect to whatever it wraps, so the treatment stays uniform and is defined once. Respect `prefers-reduced-motion` with a simple fade fallback for accessibility.

### 6.8 Computed-stat lookups (no ML)

A small class of queries are answered by surfacing values the pipeline already computes, with no ML inference — analogous to how `explain_concept` skips the models. These are near-free because they ride existing rails:

- **Pit-lane time loss per race** — already a Model B input (§6.2); mostly circuit-intrinsic and highly stable year to year. Surfaced directly.
- **Tyre degradation / expected stint length per compound** — the FP feature pipeline already computes per-compound deg slopes (§7.2); "how long before the softs drop off here?" is a view of that value. Renders through the tire glyph (§8).

Routed via a `lookup_stat` intent. Both are secondary features, not headlines, and neither expands the Phase 1 spike.

---

## 7. Tech Stack & Architecture

### 7.1 Stack

**Frontend:**
- Next.js (App Router) + TypeScript
- Tailwind CSS, minimalist high-contrast Geist-inspired direction
- GSAP for animation/timeline orchestration (Framer Motion removed — GSAP covers the reveal, telemetry traces, and inline transitions; one animation library is one less thing to reason about)
- shaders.com (`shaders` npm package) for WebGPU visual effects — Ascii, Dither, and the CRT/film-grain/glitch family. Free tier covers npm component use in production/commercial projects; Pro is only needed for editor code-export and premium presets, which this project doesn't require. Set `disableTelemetry`. Note the required "Powered by Shaders" attribution in code, and revisit the license's SaaS/OEM clause if Sector 4 is ever monetized as a subscription product.

**Backend (same Next.js repo):**
- Vercel Python runtime in `/api/` for ML inference
- No separate FastAPI service. Single deploy, single mental model. Migrate later only if scale demands.

**Data & ML:**
- `fastf1` for telemetry access
- `pandas` for feature engineering
- `scikit-learn` for the prediction models (Random Forest as a starting point; revisit if MAE plateaus)
- `shap` (or `feature_importances_` for v1) for narrative grounding

**LLM layer:**
- Anthropic API, **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) for both LLM jobs. Chosen over Gemini Flash for prose quality on the narrative (the product's differentiator) and the 90% prompt-cache discount, which fits the explainer-drafting workflow where large curated source contexts are reused. Cost is negligible at this project's query volume, so cost-per-token was not the deciding factor.
- Strict JSON / tool-use (function calling) for structured output.
- Two calls per query:
  1. Query parser — extracts intent (`predict_pace` / `predict_strategy` / `predict_compound` / `lookup_stat` / `explain_concept`) plus entities (track, year, driver names). `predict_compound` routes to Model B's secondary output; `lookup_stat` routes to the no-ML computed-stat lookups (§6.8).
  2. Narrative generator — receives model output + feature importances + a "do not invent facts" constraint, returns the grounded 2-sentence commentary
- Routing (a cheaper model for the parser) is a possible post-launch optimization, not a v1 concern — volume makes the savings immaterial.

### 7.2 ML Pipeline

The prediction quality lives or dies on feature engineering, not model choice. RF on raw FP2 averages will lose to grid position. RF on properly engineered features can win.

**FP long-run feature pipeline:**
1. **Stint detection** — group consecutive laps by compound + no pit, drop stints under 5 laps
2. **Lap filtering** — drop out-laps, in-laps, and any lap >107% of the stint's median (traffic, mistakes, yellows)
3. **Fuel correction** — fit a linear model per stint, use slope (deg + fuel effect) and intercept (adjusted pace) as separate features
4. **Compound normalization** — normalize across compounds using historical Pirelli offsets at the track
5. **Track evolution correction** — compare each driver's stint to the session-wide rolling median to remove the "track ramped up" effect

**Output of the pipeline (per driver, per session):** compound-normalized, fuel-corrected, evolution-adjusted median pace on stints >=5 laps. *This* is the feature that actually predicts race pace. Raw FP2 averages are not.

**2026 data strategy (transfer learning + visible uncertainty):**
- Track-intrinsic features (circuit length, abrasiveness, elevation, historical pit-loss) transfer fine from pre-2026 data and are used as priors
- Car/driver/regulation-intrinsic features (lap times, top speeds, deg rates per compound) do not transfer and are weighted heavily toward 2026 data only
- 2024-2025 data is used as a base, with exponentially decaying sample weights on recent 2026 sessions
- Uncertainty grows when 2026 data for a track is sparse (first visit) and shrinks as the season progresses — this is surfaced in the UI

### 7.3 Race Weekend Operations

The high-value window for predictions is the gap between FP2 ending Friday evening and quali Saturday afternoon. Pipeline:

1. FP2 ends -> fastf1 cache populated within ~30 min
2. Pull session, run feature engineering, regenerate predictions: target < 5 min runtime
3. Predictions written to a KV store or JSON blob the frontend reads
4. Optional FP3 data refresh Saturday morning for a "pre-quali update" moment

**Fallback:** if FP2 data isn't fully available within 60 min of session end, fall back to FP1 features with a confidence penalty. Surface this clearly in the UI.

All scheduling is in UTC. Display is in the user's local time zone.

---

## 8. Visual Identity

**Direction:** Data-forward / terminal aesthetic, rendered with shaders.com WebGPU effects (Ascii + Dither + CRT-family) over a Geist-inspired minimalist base.

**Typography & branding:**
- Logo: a **wordmark only** — no separate pictorial/icon logo — set in **Bebas Neue** (tall, condensed, all-caps; reads like a timing board, which fits the product).
- Body / written content (explainers, narratives, UI copy): **Lastik**, a serif face chosen for sustained reading. (Verify its license terms and webfont availability before committing.)
- Driver codes / data labels: Space Grotesk (see driver glyph below).
- ASCII/Dither character set: a monospace face (Geist Mono or a shaders.com mono option).
- A compact monogram (e.g. "S4") is worth deriving for square contexts only — favicon, social avatar, app icon. That is the full extent of the mark system; no standalone logo work beyond it.
- Four type roles, each with a distinct job: Bebas Neue (display / logo), Lastik (serif body), Space Grotesk (data labels), mono (ASCII characters). This is the full type system — hold the line at four.

Fully abstract, generated from shapes (not photos), so the Ascii/Dither pass produces consistent, recognizable output across the grid and there is no copyright or image-rights exposure anywhere in the visual system. All driver-facing data is driven from a single `drivers.json` — the same source of truth that feeds the contextual callouts (§6.5).

**Driver glyph:**
- Side-profile racing helmet silhouette (visor facing right), filled in the team's primary color. One shared silhouette across all drivers; only the color and number vary.
- The driver's **personal career number** on the helmet shell, rendered in the driver's personal color, with a **contrast-guard fallback** to black or white whenever the personal color fails a contrast check against the team-color helmet. (Note: personal numbers mean Norris shows 4 and Verstappen 33, vs. their on-car 1 and 3 this season — accepted for identity stability.)
- The three-letter FIA code (HAM, NOR, VER) set alongside the helmet in **Space Grotesk**, larger than a caption so it reads as part of the mark rather than a footnote.
- No flags, no faces, no signatures — these were considered and dropped (faces/signatures for image-rights exposure; flag-fill numbers because the detail collapses under the Ascii/Dither pass at glyph size).

**Other elements:**
- Teams: a single generic F1 car silhouette filled in team colors (primary + secondary accent). No sponsor logos, no reproduction of actual livery artwork — colors and a generic shape only.
- Tire compounds: colored disc/ring + compound letter (S/M/H/I/W) using the standard compound color coding, no Pirelli wordmark or logo.
- Tracks: vector layouts, optionally run through the Ascii shader.
- No F1 / FOM / FIA marks anywhere.

**WebGPU note:** verify graceful fallback on browsers without WebGPU, and specifically check mobile WebGPU support given the mobile-responsive requirement.

**Footer disclaimer (always present):**
> Sector 4 is an independent project, not affiliated with or endorsed by Formula 1, FOM, the FIA, or any team. All driver and team names are used for editorial reference. Data sourced from publicly available timing.

A short Methodology / About page lays out the data sources, the modeling approach in plain language, and the disclaimer.

---

## 9. Risks & Assumptions

**1. The 2026 regulation reset reduces predictive value of historical data.**
Mitigation: transfer learning with heavily discounted historical priors + visible uncertainty as a product feature. Track-intrinsic features still transfer; car-intrinsic features don't.

**2. FP long-run data is genuinely noisy and sometimes unusable.**
Mitigation: feature engineering pipeline in §7.2; "low confidence" output state; FP1 fallback path.

**3. LLM narrative generation can hallucinate confidently.**
Mitigation: strict feature-importance grounding, explicit "do not invent facts" prompt constraint, low-confidence honesty path.

**4. Solo developer + full-time job = limited build hours.**
Mitigation: scope tightly bounded by non-goals; sequenced rather than parallel feature delivery; explainer authoring workflow designed around ~25-min-per-explainer rather than write-from-scratch.

**5. fastf1 API instability or data lag.**
Mitigation: aggressive caching (built into fastf1), FP1 fallback, 60-min freshness target that allows for normal lag.

**6. Vercel Python cold starts.**
Mitigation: reveal animation (~2.5-3s) runs concurrent with the API call. Warm-instance pre-warming on race weekends.

**7. FOM branding/data exposure if visibility grows.**
Mitigation: no FOM/FIA marks, no team logos, footer disclaimer, Methodology page. Enforcement scales with visibility — clean on branding from day one.

**8. LLM-drafted explainers may contain errors the author can't catch.**
Mitigation: public verification badges, "delete what you can't verify" rule, reader corrections form.

---

## 10. Open Decisions

| # | Decision | Status |
|---|---|---|
| — | None currently blocking | — |

Visual identity is resolved (§8). Exact reveal-animation choreography and the helmet/glyph motifs are execution details to prototype during Phase 2/3, not open decisions. New blocking decisions get logged here as they surface rather than buried in body prose.

---

## 11. Phases (placeholder for week-by-week milestones)

- **Phase 1 — Data sandbox (May -> mid June):** environment setup, fastf1 connection, historical data pulls, feature engineering pipeline working in a notebook
- **Phase 2 — Model + private beta (mid June -> mid July):** Model A trained, backend wired up, frontend reveal flow working, abstract driver glyph component built (helmet + number + code), **Spanish GP private beta** with predictions sent to the test group
- **Phase 3 — Strategy model + learning layer (mid July -> mid August):** Model B, transfer learning + uncertainty visualization, explainer system architecture, first 8 explainers
- **Phase 4 — Polish + public launch (mid August -> early September):** narrative quality, explainer count to 15+, **public launch at the Italian GP (Monza), before fall semester**

To be replaced with concrete week-by-week deliverables in a follow-up, anchored to the real calendar (work commitments, race weekends, travel).

---

## 12. Fast-follow candidates (not in v1)

Good ideas that don't meet the "genuinely cheap" bar for v1 — captured here so they're not lost, explicitly deferred so they don't expand the build. The cheap test: (1) fastf1 gives the data cleanly, (2) it reuses an existing pipeline value or model, (3) it renders through an existing glyph.

- **Fastest pit stop / team crew speed.** fastf1 exposes pit-*lane* transit, not isolated *stationary* stop times; clean crew-speed data needs a separate source (F1 official / DHL timing) and is a season-level ranking rather than an FP-telemetry prediction. Defer until there's a reliable data source.
- **Single-lap / qualifying pace ranking.** The clean-pace feature exists, but this drifts into qualifying prediction — an explicit non-goal (§4). Revisit only if the non-goal is reconsidered.
- **Track-characteristic readouts** ("how abrasive is this circuit?"). Cheap, but overlaps the learning layer more than the prediction models — likely emerges there organically rather than as a standalone feature.
- **Per-driver compound preference / start-tyre prediction.** A more granular cousin of the Model B compound output; defer until the race-level compound prediction is validated.

Rule: a candidate graduates to a real feature only when it clears the three-part cheap test or earns a deliberate scope decision — not because it "seems small."
