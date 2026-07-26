# Sector 4

An explainer-led F1 weekend companion: a natural-language interface that helps casual
fans *understand* a race weekend, pairing honest, calibrated podium odds and strategy
calls with grounded, plain-English explanations. Built for the fan who watches races
but skips practice.

**Status:** live at [sector4.net](https://sector4.net). M1–M7 shipped — pipeline,
`/ask`, `/weekend`, the learning layer, the landing page, and the season championship
picture are all in production.

## Start here (for humans and agents)

Read these in order before planning or writing code:

1. **`CLAUDE.md`** — high-signal project context, locked decisions, hard constraints, house rules.
2. **`sector4-prd.md`** — the full product spec. Authoritative on product decisions.
3. **`handoff.md`** — current state: what's shipped, what's in flight, what's next.

`phase-1-data-spike.md` and the `notebooks/*_RESULTS.md` files are historical — Phase 1
(the ML validation spike) is complete. Its findings (what has a genuine telemetry edge
and what doesn't) are folded into `CLAUDE.md` and drive the product's honesty framing.

## Stack

Next.js (App Router) + TypeScript · Python ML in the Vercel Python runtime (`api/`) ·
fastf1 / pandas / scikit-learn · Claude Haiku 4.5 for the LLM layer (query parsing +
grounded narrative generation) · WebGPU/canvas for the abstract Ascii/Dither visual
system · GSAP for motion.

## Repo layout

- `app/` — the Next.js site: routes (`/`, `/ask`, `/weekend`, `/learn`, `/accuracy`),
  components, and pure logic in `app/lib/*.ts` (tested alongside, `*.test.ts`).
- `api/` — Python inference endpoints (podium, pace, strategy/compound) and the
  prebuilt feature/lookup parquet files they read.
- `src/` — the Python ML pipeline (feature engineering, models, eval) — logic lives
  here, called from notebooks, not buried in cells.
- `notebooks/` — Phase 1 validation notebooks and their `*_RESULTS.md` writeups.
- `scripts/` — data build/refresh scripts (`build_2026.py` and friends), run on the
  weekend-refresh cadence.
- `docs/superpowers/` — design specs and implementation plans for each shipped feature.

## Quickstart (site)

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest
```

## Quickstart (Python / ML pipeline)

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt   # full toolchain (fastf1, sklearn, pytest, …)
```

> `requirements.txt` is the **slim runtime** set (pandas/pyarrow/numpy) the Vercel
> `/api` lookup function ships with — it must stay under Vercel's 500MB Python
> limit. Local dev, the batch pipeline, and tests use `requirements-dev.txt`.

Enable the fastf1 cache before any session loads:

```python
import fastf1
fastf1.Cache.enable_cache("cache/")
```
