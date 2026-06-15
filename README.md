# Sector 4

Predictive telemetry intelligence for Formula 1 — a natural language interface over F1 telemetry that produces ML-backed race-pace predictions with grounded explanations, plus a curated learning layer. Built for the casual F1 fan who watches races but skips practice.

**Status:** planning complete. Phase 1 (the data spike) is the next build step.

## Start here (for humans and agents)

Read these in order before planning or writing code:

1. **`CLAUDE.md`** — high-signal project context, locked decisions, hard constraints, house rules.
2. **`sector4-prd.md`** — the full product spec. Authoritative on product decisions.
3. **`phase-1-data-spike.md`** — the current task: validate that Model A beats the grid-position baseline before building anything else.

## Stack

Next.js (App Router) + TypeScript monorepo · Python ML in the Vercel Python runtime (`/api/`) · fastf1 / pandas / scikit-learn · Claude Haiku 4.5 for the LLM layer · shaders.com (WebGPU) for visuals · GSAP for motion.

## Phase 1 quickstart

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt   # full toolchain (fastf1, sklearn, pytest, …)
```

> `requirements.txt` is the **slim runtime** set (pandas/pyarrow/numpy) the Vercel
> `/api` lookup function ships with — it must stay under Vercel's 500MB Python
> limit. Local dev, the batch pipeline, and tests use `requirements-dev.txt`.

Then in code, enable the fastf1 cache before any session loads:

```python
import fastf1
fastf1.Cache.enable_cache("cache/")
```

Work the spike per `phase-1-data-spike.md`. Use 2023–2025 historical data (not 2026 — see the brief for why). Stop at the go/no-go decision and report metrics vs. baseline.

## Repo layout

See the suggested structure in `phase-1-data-spike.md`. Keep pipeline logic in `src/`, called from notebooks — not buried in cells.
