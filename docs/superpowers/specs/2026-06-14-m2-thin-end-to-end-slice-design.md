# M2 — Thin End-to-End Slice (Design Spec)

> Date: 2026-06-14 · Status: approved for planning · Milestone: PRD §11 **M2**
> Prereqs read: `handoff.md`, `CLAUDE.md`, `sector4-prd.md` §6.1/§6.3/§6.7/§6.8/§7.1/§8/§11.
> Builds on: M1 (`src/inference/*`, fastf1-free callable surface — already on `main`).

## 1. Goal & Definition of Done

Prove the full product architecture with **one query, end to end**: a single
computed-stat lookup flows **NL → parser → Python → narrative → ASCII/dither
reveal**. This is the walking skeleton — it touches every architectural layer
exactly once, and is deliberately *thin*, not complete.

PRD §11 M2 DoD (literal): *"one computed-stat lookup query flows NL → parser →
Python → narrative → ASCII/dither reveal on the deployed app."*

**Revised DoD for this milestone (owner decision):** the slice is **built and
verified locally** via `vercel dev` with **real Haiku calls**. The actual Vercel
**deploy is explicitly deferred** to a tracked M2 follow-up — it is the one piece
of the literal DoD intentionally moved out of this round to keep the milestone
focused on architecture wiring rather than account/secret friction.

## 2. Scope (locked)

| Decision | Choice |
|---|---|
| Anchor query | **"How much time is lost in the pit lane at Monaco?"** (`lookup_stat` / `pit_loss` / `Monaco`) |
| Why this query | Reads curated track features only — **no parquet/pipeline-output dependency**, fully deterministic. Cleanest skeleton. |
| Deploy scope | **Local-only this round** (`vercel dev`); Vercel deploy deferred to a tracked follow-up. |
| LLM placement | **Approach A** — the two Haiku calls run in the **Next.js server (TS)**; Python `/api/` is **pure inference** (no LLM, no prose). |
| Local Python invocation | **`vercel dev`** emulates the prod `/api/` topology faithfully (CLI only; no account/deploy needed to run it). |
| Monaco data gap | **Add a curated Monaco entry** to `src/features/track.py` (it currently falls back to a generic default). |

**In scope:** Next.js (App Router) + TS scaffold; search UI; one TS orchestration
route (parser + narrative Haiku calls); one Python serverless function wrapping
`src.inference.lookup_stat`; the shared `<Reveal>` ASCII/dither component (applied
to the answer card only); the curated Monaco entry; contract + handler tests; a
real-key manual end-to-end verification.

**Out of scope (deferred — clean extension points, no lying stubs):**

- The actual **Vercel deploy** (tracked follow-up).
- **All other intents/stats/circuits** — only `lookup_stat`/`pit_loss`/`Monaco` is
  guaranteed. Other intents route to an honest "not in this slice yet" card.
- Glyphs (driver/team/tire), charts, the accuracy/calibration curve (M3+).
- Learning-layer cross-links (whys → whats) (M6).
- Podium probabilities / calibration (M3).
- **System-wide** reveal — M2 applies the shader to the single answer card only;
  the universal treatment (§6.7) comes in later milestones.

## 3. Architecture & Flow

```
[search input] "How much time is lost in the pit lane at Monaco?"
   │ POST { query }
   ▼
[Next route /api/ask  (TS, Anthropic SDK)]
   │ ① PARSER Haiku (strict tool-use) → { intent:"lookup_stat", stat:"pit_loss", gp:"Monaco" }
   │ ② fetch ─────────────►  [/api/py/lookup  (Vercel Python)]
   │                            from src.inference import lookup_stat
   │   ◄──── { stat, gp, value:19.5, units:"s", source } (rounded dict)
   │ ③ NARRATIVE Haiku, grounded in that dict + "do not invent facts" → 2 sentences
   ▼
[answer card]  Reveal wrapper plays the ASCII/dither resolve concurrent with the fetch
               (prefers-reduced-motion / no-WebGPU → plain fade)
```

Layers touched once each: NL input → Haiku parser (tool-use) → Python `/api/`
importing `src.inference` → Haiku narrative (grounded) → ASCII/dither Reveal.

## 4. Monorepo Layout (Next at root; existing `src/` untouched)

```
app/page.tsx                 search UI (single input)
app/api/ask/route.ts         TS orchestration: parser + narrative Haiku calls
app/components/Reveal.tsx     shared ASCII/dither wrapper (shaders.com + GSAP)
app/lib/anthropic.ts         Anthropic client + prompt builders
api/py/lookup.py             Vercel Python fn → src.inference.lookup_stat
vercel.json                  Python fn config + includeFiles: src/**
src/…                        unchanged; requirements.txt already exists
package.json / tailwind / tsconfig / next.config
```

Routing note: the Python serverless function lives under `api/py/*` and the Next
route handler under `app/api/ask` to avoid the `/api` namespace collision between
Vercel Python functions and Next route handlers. `vercel.json` ensures `src/**` is
shipped with the Python function (`includeFiles`).

## 5. The Two Haiku Calls (`claude-haiku-4-5-20251001`)

- **Parser** — strict tool-use. One tool `route_query` with an `intent` enum
  (`predict_pace`/`predict_strategy`/`predict_compound`/`lookup_stat`/`explain_concept`)
  plus `stat` and `gp` entity fields. M2 **handles** only `lookup_stat`+`pit_loss`;
  any other parsed intent → graceful "not in this slice yet" card. The parser still
  runs for every query so the tool-use contract is genuinely proven.
- **Narrative** — grounded generation, adapted for a no-ML lookup. There are no
  feature importances here, so the **only** facts passed to the model are the
  returned stat dict (`value`, `units`, `gp`, `source`), under a hard *"you may only
  state the number and circuit given; do not invent facts"* constraint. This is
  §6.3's grounding principle applied to the lookup path.

## 6. Python Inference Endpoint

`api/py/lookup.py`: parse `{stat, gp}` from the request, call
`lookup_stat(stat, gp)`, return its already-rounded dict as JSON. **Stays
fastf1-free** — the M1 invariant (`tests/test_inference_no_fastf1.py`) must keep
passing. For Monaco `pit_loss` the path touches only `src.features.track` + pandas
(light, deterministic, no parquet).

## 7. Reveal Component (§6.7)

A single shared `<Reveal>` wrapper, defined once: shaders.com `shaders` npm
Ascii/Dither pass, GSAP for timing. The resolve runs **concurrent with the fetch**
so it doubles as the loading state (no separate spinner). `disableTelemetry` set;
the required **"Powered by Shaders"** attribution included in code (§7.1).

Guards: honor **`prefers-reduced-motion`** *and* **no-WebGPU** → plain fade
fallback (the shader must be fully skippable). For M2 the shader is applied to the
**single answer card only** — not yet system-wide.

## 8. Monaco Curated Entry

Add to `_TRACKS` in `src/features/track.py`:

```
"Monaco": {"length_km": 3.337, "n_corners": 19, "abrasiveness": 2, "pit_loss_s": 19.5}
```

`pit_loss_s = 19.5` is a **curated spike-grade approximation**: Monaco's pit-lane
loss sits on the lower side of the grid (~19–20 s) — a short pit lane offset by the
reduced 60 kph limit (vs the usual 80 kph). Source label stays *"curated track
features"*; the file already flags that production should derive pit-loss from data.
The value will be sanity-checked against public timing references at implementation,
not asserted blindly.

## 9. Error & Scope Guards

- Missing `ANTHROPIC_API_KEY` → clear surfaced error, never a crash. A clearly
  marked **dev-stub** path lets tests/CI run without a key; the manual end-to-end
  verification uses a real key.
- Non-`lookup_stat` or non-`pit_loss` parse → honest "not supported in this slice"
  card (the architecture still ran end to end).
- The slice **guarantees** only the Monaco `pit_loss` path.

## 10. Testing

- **Python:** extend track tests for the Monaco entry; a handler test for
  `api/py/lookup` asserting the Monaco dict round-trips; the no-fastf1 invariant
  still passes.
- **TS:** a parser-contract test (mocked Anthropic) asserting query →
  `{lookup_stat, pit_loss, Monaco}`; a narrative-grounding test asserting the
  narrative uses **only** the provided facts.
- **Manual gate:** one real-key end-to-end run via `vercel dev`, observed resolving
  through the ASCII/dither reveal.

## 11. Done-When (this milestone)

The Monaco pit-loss query runs **NL → parser → Python → narrative → ASCII/dither
reveal locally via `vercel dev` with real Haiku calls**, with the reduced-motion /
no-WebGPU fade fallback working and all tests green. The Vercel deploy is recorded
as the tracked M2 follow-up.

## 12. Dependencies / Assumptions

- Vercel CLI installed locally (for `vercel dev`; no account/deploy needed to run).
- An `ANTHROPIC_API_KEY` available for the manual end-to-end verification.
- Node toolchain for the Next.js app; existing Python venv + `requirements.txt`.
