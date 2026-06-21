# M5 — Private Beta at a Real 2026 Weekend: Design

> Spec for PRD §11 **M5**. *Done when:* predictions are issued before quali, sharpened
> after, sent to testers, and outcomes logged. **The forcing function.** Authored
> 2026-06-21. Builds on the M3/M4 per-request inference pattern (`api/*.py` + `app/lib/*`)
> and the M3 calibration contract. This is the first milestone that runs the product
> against **live 2026 data**.

## 1. Goal & positioning

Run the real product against a real, upcoming 2026 race weekend, on a **rolling private
beta** that starts at the **Austrian GP (race Sun 2026-06-28)** and continues through the
**British GP (sprint weekend, race 2026-07-05)** and onward. Each weekend:

1. **Issue** predictions *before qualifying* (podium bands + pace-gap context + stop-count
   strategy), grounded and honesty-caveated.
2. **Sharpen** them *after qualifying* (grid is now known → podium tightens Friday→Saturday,
   the M3 story made real).
3. **Send to testers** as a coherent, frozen, shareable artifact (the `/weekend` page).
4. **Log outcomes** — predicted-vs-actual per weekend, accumulating into the season
   calibration record that powers the "learns the season" promise.

This is the milestone where the "calibration improves with data" claim stops being a slide
and starts accumulating real evidence. It is also the first time telemetry/podium code runs
on the **2026 reg-reset** season as live input rather than 2023–25 backtest.

### 1.1 Why a rolling beta (not one weekend)

The DoD says "a real 2026 weekend" (singular), but a single weekend cannot demonstrate the
product's actual thesis — that **calibration sharpens as the season unfolds**. One outcome
is noise. The rolling beta also forces both structural cases early: Austria is a
**conventional** weekend (proves the deadline-bound path), and Britain one week later is a
**sprint** weekend (forces sprint-aware handling). Austria → Britain → onward.

## 2. Scope (locked in brainstorming)

**In scope:**

| # | Area | What |
|---|---|---|
| A | 2026 readiness | Add 2026 to the calendar/store; generalize the feature pipeline to **any 2026 circuit** (Austria is NOT in the 8 dry circuits); recency-weighted telemetry training; podium-calibration accumulation scaffold. |
| B | Beta delivery | `/weekend` shareable snapshot page; schedule-aware Vercel Cron fn that snapshots at checkpoints + pulls actuals; Vercel Blob persistence; season calibration record. |
| C | Sprint-aware podium | Ingest sprint sessions; conditional sprint-result podium feature, **validated** on 2023–25 sprints before trusting it; sequenced for the British GP, *not* in Austria's critical path. |

**Out of scope (deferred / unchanged non-goals):**

- The full learning layer (concept/entity whats, verification badges) — that is **M6**.
- Showing a numeric podium **`%`** — stays gated on the M3 reliability check (enough 2026
  outcomes to fit + pass isotonic/Platt). Bands remain the honest default through M5.
- Data-derived pit-loss for all circuits (PRD §7.2) — non-curated circuits keep the M4
  honest "not available." Austria/Britain are not curated → pit-loss returns null there.
- Dominant-compound prediction (NO-GO), weather/safety-car *probability* modeling,
  qualifying prediction, betting/odds, user accounts (PRD §4 non-goals).
- Wet-weekend handling beyond the existing caveats; the validated method is dry-only and
  surfaces with caveats, not silence.

## 3. Locked decisions (from brainstorming)

- **2026 data is available** via fastf1 (results/standings + the weekend's FP sessions).
  Training rolls forward; the Phase-1 "don't train on 2026" rule was scoped to the
  *validation spike* (now complete), not to production.
- **Generalize to any 2026 circuit.** The 8 dry circuits were a validation convenience, not
  a product constraint. Austria forces this immediately.
- **Recency-weighted blend** for the telemetry models (pace, stop-count): train on
  2023–25 + prior-2026 with `sample_weight` decaying by recency. Re-validate on 2023–25
  rolling-origin to confirm the **+0.07 stop-count anchor** does not regress *with weights*
  before trusting it on 2026.
- **Podium calibration** accumulates 2026 outcomes; bands until the reliability check
  passes. Inputs sharpen every weekend regardless (standings/form are 2026-derived).
- **Distribution:** a frozen, shareable `/weekend` page is the canonical *issued* artifact;
  the interactive app stays open for tester exploration (combination of both).
- **Logging:** Vercel Cron + Vercel Blob, automated. Schedule-aware cron, idempotent
  per-checkpoint snapshots, actuals pulled post-race, calibration computed.
- **Sprint-aware podium:** build + validate for the British GP; ship only if it improves GP
  podium. Telemetry cards always caveat reduced confidence on sprints (only one practice
  session → thin long-run FP).

## 4. Hard de-risk gate (Step 0, before any build)

The repo has **zero 2026 support** today and we have not verified fastf1's 2026 data
firsthand. Before building anything, confirm:

1. fastf1 returns the **2026 event schedule** (and Austria/Britain are on it with the
   expected dates + session structure).
2. The **2026 Austrian GP sessions** are fetchable (FP for telemetry; results/standings
   from 2026 races so far for podium inputs).
3. **2025/2024 Austria** is fetchable for prior-track-pace (Austria's historical priors).

If any of these fail, scope changes materially (e.g. degraded telemetry, or a simulated
stand-in) — so this gate runs first and its result is reported before Phase A proceeds.

## 5. Architecture

### 5.1 Phase A — 2026 readiness (`src/` + `api/`)

Preserve all load-bearing invariants: inference never imports fastf1; all training goes
through `store.prior_weekends` (calendar order, never alphabetical); leakage guards intact
(nothing race-derived feeds that race; standings/form/track-history from strictly prior
races; FP from this weekend only); round every number that reaches output.

- **`src/calendar.py`** — add `2026` to `SEASONS`; replace the 8-circuit
  `DRY_CIRCUITS`/`GP_TO_EVENT` assumption with **full-calendar coverage**. The leakage
  guard depends on true calendar order, so the 2026 calendar must be in real season order
  (year-major already holds; within-year order must be the real schedule, not a fixed dry
  list). Austria and Britain must resolve to their canonical `gp` keys + `EventName`.
- **`src/pipeline.py`** — generalize `build_all` / feature builders to construct features
  for an **arbitrary circuit** and its historical priors, not just the dry set. The dry set
  stays the *validation* set; production builds whatever weekend is targeted (+ priors).
- **Recency-weighted training** — add `sample_weight` (recency decay across seasons /
  weekends) to the pace + stop-count `fit` calls. Decay scheme defined in the plan; the
  guard is the re-validation in §6.
- **Podium calibration accumulation** — scaffold storing per-weekend predicted-vs-actual so
  isotonic/Platt can be fit once enough 2026 outcomes exist. No `%` shown until the M3
  reliability check passes; this milestone *accumulates*, it does not flip the switch.
- **`api/*`** — the existing `podium.py` / `pace.py` / `strategy.py` / `inference.py`
  serverless fns stay pure inference reading bundled parquet. Regenerate the bundled
  feature tables to include 2026 + the target circuits. The `year` entity already exists
  (M3); default/normalization extends to 2026 + Austria/Britain in `app/lib/circuits.ts`.

### 5.2 Phase B — Beta delivery (frontend + infra)

- **`/weekend` page** — a coherent issued artifact for the current weekend: podium bands,
  pace-gap context, stop-count strategy, each with its existing honesty caveat, rendered
  through the existing glyph system. Reads the **latest snapshot from Blob** (not live
  per-request) so what testers see is exactly what was frozen at the checkpoint. Clearly
  labels the checkpoint ("issued Friday, pre-qualifying" / "sharpened Saturday,
  post-qualifying") and timestamp. Shareable URL. The interactive app is unchanged and
  remains available.
- **Schedule-aware Vercel Cron fn** — runs frequently during race weekends; reads the
  weekend's real session schedule (fastf1/F1 schedule) and fires each checkpoint **exactly
  once** (idempotent via a marker in Blob):
  - **pre-quali snapshot** — after final practice, before qualifying (so FP telemetry is in
    for pace/stop-count; podium on standings/form/prior-track, no grid yet).
  - **post-quali snapshot** — after qualifying (grid known → podium sharpened).
  - **post-race actuals** — after the race, pull finishing order + actual stop counts,
    write the outcome record.
  Fixed cron times cannot align with every circuit's session schedule/timezone, hence the
  schedule-aware guard rather than hardcoded times.
- **Vercel Blob persistence** — per-weekend JSON snapshot docs + a season index; outcome
  records keyed by weekend. Runtime-writable from the cron fn (no deploy per checkpoint).
- **Season calibration record** — accumulates predicted (bands + raw `p_podium`) vs actual,
  the substrate for the eventual reliability check and the season accuracy curve (M7).

### 5.3 Phase C — Sprint-aware podium (British GP)

- Ingest **sprint sessions** (sprint qualifying + sprint race) via fastf1.
- Add a **conditional** podium feature: on sprint weekends, the sprint result (a
  current-car, this-circuit short-race-pace observation, available before GP quali) feeds
  GP podium prediction. Absent on conventional weekends (feature is null → model unaffected).
- **Validate before trusting** (§6): backtest on the 2023–25 sprint weekends deliberately
  excluded from Phase 1. Ship the feature only if it improves GP podium Brier/top-3;
  otherwise fall back to standard inputs with a caveat.
- Sprint checkpoint nuance: on a sprint weekend the sharpening gains a step
  (FP1 + SQ → **sprint result** → GP grid). The pre-GP-quali snapshot on a sprint is
  *richer* than a normal Friday. Telemetry cards (pace/stop-count) carry a reduced-confidence
  caveat on sprints regardless (only FP1 of long-run data).

## 6. Validation & honesty gates

- **Recency-weighted training:** re-run the rolling-origin stop-count anchor (nb 06) **with
  the recency weights** on 2023–25; the +0.07 edge must hold (not regress) before the
  weighted model is trusted for 2026. Report the number.
- **Sprint-result feature:** backtest on held-out 2023–25 sprints; keep only if GP podium
  Brier/top-3 improves. Report both with/without.
- **Calibration `%`:** stays OFF. Bands only, until the M3 reliability check passes on
  accumulated 2026 outcomes. M5 builds the accumulation, not the switch.
- **No overselling:** every card keeps its caveat (podium = honest probabilities not a
  telemetry edge; stop-count = SC caveat; pace = supporting context; pit-loss null on
  non-curated Austria/Britain; sprint telemetry = reduced confidence).

## 7. Deadline-driven sequencing

Austria qualifying is **Sat 2026-06-27**; the pre-quali snapshot must fire before it, so the
generation path + page + snapshot mechanism must be **deployed before Fri 2026-06-26**.

1. **Step 0 — de-risk gate** (§4). Immediately. Blocks everything.
2. **Phase A core** — 2026 calendar + Austria feature generation + regenerated tables, so
   Austria predictions are *generatable* end-to-end. (Long pole.)
3. **Phase B core** — `/weekend` page + snapshot code + Blob; deploy the schedule-aware cron
   so it can fire at Austria's real checkpoints. **Fallback:** if cron automation is at risk
   for Austria, the *same* snapshot code can be triggered manually for the first weekend,
   with cron taking over for Britain — the snapshot artifact is identical either way.
4. **Recency-weighted training + re-validation** — fold in before relying on the telemetry
   cards for issued predictions (Austria can issue podium first if needed; telemetry cards
   follow once re-validated).
5. **Phase C — sprint-aware podium** — after Austria is live, before British GP (2026-07-05).

## 8. File-level plan (indicative — finalized in the implementation plan)

- `src/calendar.py` — 2026 + full-calendar `GP_TO_EVENT`, real season order.
- `src/pipeline.py` — arbitrary-circuit feature builds; team map for any circuit.
- `src/models/{pace,strategy}*` — `sample_weight` recency decay.
- `src/inference/podium.py` (+ calibration accumulation helper) — sprint-result feature
  (conditional), calibration record write.
- `src/features/*` — sprint session features; prior-track-pace for arbitrary circuits.
- `api/*` — regenerated bundled tables incl. 2026 + Austria/Britain; `includeFiles` updated.
- `app/lib/circuits.ts` — Austria/Britain + 2026 normalization/default.
- `app/weekend/` (new route) + components reusing the glyph/card system.
- `app/api/cron/*` (or a Vercel cron fn) — schedule-aware snapshot/actuals job.
- `vercel.json` — cron schedule + Blob; `vercel.ts` migration optional, not required.
- Blob read/write helper; season calibration record module.

## 9. Open items to resolve in planning (not blockers)

- Exact recency-decay scheme (per-season step vs continuous; half-life).
- Blob layout (one doc per weekend+checkpoint vs a single growing season doc) and the
  idempotency marker shape.
- Cron cadence (how often it polls during a weekend) and how it reads the session schedule
  (fastf1 schedule vs a static per-weekend config committed ahead of time).
- Tester roster + how the `/weekend` link is shared (out of band; not a code concern).
