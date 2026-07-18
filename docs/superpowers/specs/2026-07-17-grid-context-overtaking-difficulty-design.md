# Design — Grid-context (per-track overtaking difficulty) in podium narrative

Date: 2026-07-17
Status: approved (owner), ready for implementation plan
Milestone: M7 (breadth + polish), grid-weight-calibration slice — **re-scoped from a model change to an explainer/context feature after a validation NO-GO** (see §0).

## 0. Origin & the validation NO-GO (why this is NOT a model change)

Owner backlog item #3 asked to (a) increase how strongly `grid_position` weights the
podium post-quali, and (b) tailor grid weight per track — on low-overtaking circuits,
especially at the front, starting position is far more predictive of the finish. The
trigger anecdote: LEC P2 → P1 at Silverstone felt undersold.

Empirical findings before any build:

- **Grid already dominates the podium model.** Standardized logistic coefficients
  (Saturday): `grid_position` −2.505, `champ_rank_before` −0.743, `prior_track_pace`
  −0.141, `form_finish_avg3` −0.095, `champ_points_before` +0.059. Grid is the top
  feature by ~3×. Concern (a) — "grid doesn't weight enough" — is not globally true.
- **Per-track grid→finish stickiness is real and large.** Spearman ρ(grid, finish) over
  2023–2026 ranges ρ≈0.43 (Las Vegas, high-overtaking) to ρ≈0.90 (Japan, Monaco, sticky).
  So the pooled slope applies a fleet-average grid steepness everywhere — the plausible
  root of the "Silverstone front-row undersold" feeling.
- **But a track-stickiness interaction does NOT beat baseline.** Leakage-safe
  rolling-origin CV, full calendar (23 held-out races), grid×stickiness interaction
  (per-fold stickiness from strictly-prior races, shrunk toward the global mean):

  | variant | top3 | Brier | front-row(g≤3) calibration |
  |---|---|---|---|
  | baseline (pooled grid slope) | 0.696 | 0.0773 | pred 0.67 / actual 0.68 ✓ |
  | + grid×stickiness (ρ metric) | 0.696 | 0.0774 | 0.67 / 0.68 |
  | + grid×stickiness (front-retention) | 0.710 | 0.0767 | 0.66 / 0.68 |

  The ρ interaction moves nothing; front-retention gives +0.014 top3 (≈ one podium slot
  over a whole season, pure noise) and slightly worsens front-row calibration. Robust
  across shrinkage-K sweeps. Front-row is already well calibrated on the full calendar
  (pred 0.67 vs actual 0.68); the earlier "0.70 vs 0.76 undersold" gap was a small-sample
  artifact of the DRY-circuit subset.

**Decision (house rule: surface go/no-go honestly, don't tune the bar):** do NOT change
the model. The stickiness numbers are real and vary a lot, so they earn their keep as
honest, grounded **narrative context** — serving the explainer-led thesis — not a
predictive tweak. Owner approved this re-scope and the symmetric-coverage variant.

## 1. Goal

When a podium prediction is issued **post-qualifying** (grid known), the narrative may add
one grounded sentence about the circuit's overtaking difficulty, **symmetric** in both
directions:

- Front-row start at a **hard-to-overtake** circuit → "a front-row start counts for more
  than usual here."
- Front-row start at a **high-overtaking** circuit → "grid holds less than the order
  suggests, expect movement."

Grounded in the real per-track ρ(grid, finish), deterministic (zero hallucination
surface), honesty-gated on sample size, silent when there's nothing notable to say.

## 2. Non-goals

- No change to `predict_podium` model, features, or probabilities.
- No new build artifact, parquet, JSON, cron, or API route.
- No exact fragile counts quoted ("N of the last M front-row starters…") — tier-based
  qualitative language only.
- No `/learn` concept in v1 (noted as a follow-up in §7).

## 3. Data / computation (Python, leakage-safe)

New pure module `src/inference/stickiness.py` (no fastf1; reads only the passed
`podium_features` frame — already bundled to `api/podium_features.parquet`).

### 3.1 `circuit_grid_stickiness(podium_features, gp, year) -> dict | None`

- Filter `podium_features` to rows where `gp == gp` and `year < year` (strictly-prior
  runnings — leakage-safe, matches repo methodology), dropping rows with null
  `grid_position` or `finish_pos`.
- `n` = number of runnings (distinct `race_id`) used. Rows = driver-rows across those.
- If `n < 2` runnings → return `None` (thin/new circuit; nothing trustworthy to say).
- `score` = Spearman ρ(grid_position, finish_pos) over the pooled driver-rows,
  rounded to 2.
- `tier`:
  - `sticky` if `score >= 0.80`
  - `high_overtaking` if `score < 0.60`
  - else `average`
- Return `{"score": score, "tier": tier, "n": n}`.

Thresholds anchored to the observed 2023–2026 spread (0.43–0.93). Chosen so the extremes
(Monaco/Japan/Silverstone-class vs Las Vegas/Canada-class) fire and the broad middle stays
`average`.

### 3.2 `grid_context_line(stickiness, drivers) -> str | None`

- `drivers` = the Saturday driver dicts from `predict_podium` (each has `factors.grid`).
- Returns `None` (silent) unless ALL hold:
  - `stickiness` is not `None` and `stickiness["tier"] in {"sticky", "high_overtaking"}`
    (`average` → silent: nothing notable),
  - at least one driver has `factors.grid <= 3` (a front-row-ish start to contextualize).
- Compose ONE grounded sentence keyed by tier. Reference the circuit generically ("this
  circuit" / the gp is already in the payload) and the front-row context; do not name a
  specific driver in the line itself (the narrative already leads with drivers, and the
  line is deterministic — keep it driver-agnostic to stay robust):
  - `sticky`: e.g. "This is one of the hardest circuits to overtake on, so a front-row
    start counts for more than usual here."
  - `high_overtaking`: e.g. "This circuit sees a lot of passing, so grid position holds
    less than the starting order suggests and positions can change."
- Wording is fixed templates (no numbers quoted); qualitative + honest.

### 3.3 Attach to response

In `src/inference/podium.py`, `predict_podium`, **Saturday mode only** (grid present):
- Compute `stickiness = circuit_grid_stickiness(table_or_history, gp, year)` and
  `line = grid_context_line(stickiness, drivers)`.
- If `line` is not `None`, add `grid_context = line` to the returned dict. Omit the key
  otherwise. Friday mode (no grid) never sets it.
- Round any number that reaches output (only `score`/`n` are numeric and they stay
  internal; `grid_context` is a string).

For the upcoming-weekend path (`predict_upcoming_podium` → `predict_podium`), stickiness is
computed from the concatenated `table` (history + built target); the target row for a
future race has null finish and is naturally excluded by the `year < year` filter, so the
line reflects strictly-prior runnings. Works uniformly.

## 4. Narrative wiring (frontend)

- `PodiumFacts` (app/lib/narrative.ts) gains `gridContext?: string` — distinct from the
  existing `context?: string[]` (curated circuit facts) so they don't collide.
- `orchestrate.ts` podium branch: map `response.grid_context` → `facts.gridContext`
  (present for historical + upcoming paths alike, since both return through
  `predict_podium`).
- `PODIUM_SYSTEM` gains one instruction: *"If the JSON includes `gridContext`, you MAY
  include it as at most one short sentence, preserving its meaning; never add overtaking
  or track-difficulty claims of your own."* The existing hard rules ("Use ONLY the facts
  in the JSON", "Do not invent … causes …", "never use em-dashes") remain and cover it.

## 5. Example output

- Silverstone (sticky ρ≈0.9), LEC P2: *"…LEC starts second and leads on championship
  position. This is one of the hardest circuits to overtake on, so a front-row start
  counts for more than usual here."*
- Las Vegas (high_overtaking ρ≈0.43), front-row starter: *"…but Las Vegas sees a lot of
  passing, so grid position holds less than the starting order suggests and positions can
  change."*
- Average track / no front-row (grid all > 3) / `n < 2` history → no line, narrative
  unchanged.

## 6. Honesty guards (summary)

- Deterministic composition in Python — the LLM only weaves a fixed grounded sentence, no
  free overtaking claims (prompt-enforced).
- Sample gate: `n >= 2` runnings, else silent. New 2026 circuits with no prior running →
  silent.
- Leakage-safe: strictly-prior runnings only (`year < target year`).
- Only the informative extremes speak; `average` circuits stay silent (no filler).
- No exact/fragile counts; qualitative tier language only.

## 7. Testing

Python (pytest):
- `circuit_grid_stickiness`: sticky / average / high_overtaking fixtures return the right
  tier; `n < 2` → `None`; leakage — a target-year running is excluded from the estimate.
- `grid_context_line`: fires for (front-row present + sticky) and (front-row present +
  high_overtaking); silent for `average`, for no front-row driver, and for `None`
  stickiness.
- `predict_podium`: Saturday mode attaches `grid_context` for a sticky fixture with a
  front-row driver; Friday mode never attaches it.

TS (vitest):
- `orchestrate` maps `grid_context` → `facts.gridContext` on the podium branch.
- `PodiumFacts` type includes `gridContext?`.

Regression: full pytest + vitest green; `predict_podium` probabilities/bands unchanged
(the model is untouched — assert an existing podium fixture's `p_podium`/`band` are
byte-identical with and without the new code path).

## 8. Out of scope / follow-ups

- A linked `/learn` concept ("why starting position matters more at some tracks") — natural
  M7 explainers follow-up; keeps this slice tight.
- Front-retention concrete phrasing ("N of the last M front-row starters held a podium") —
  deferred; needs a robustness/sample pass and risks overclaiming on thin data.

## 9. Files touched

- `src/inference/stickiness.py` (new) — pure functions §3.1, §3.2.
- `src/inference/podium.py` — attach `grid_context` in Saturday mode (§3.3).
- `app/lib/narrative.ts` — `PodiumFacts.gridContext`, `PODIUM_SYSTEM` line.
- `app/lib/orchestrate.ts` — map `response.grid_context`.
- Tests: `tests/` (pytest) + the TS vitest files alongside orchestrate/narrative.

No changes to: the model, `podium_features` build, `api/podium.py` glue (it returns
`predict_podium` output verbatim), pipeline, cron, or any bundled data artifact.
