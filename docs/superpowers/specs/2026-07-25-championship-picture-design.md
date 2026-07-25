# Championship Picture — season standings, gap, and the rate it demands

**Date:** 2026-07-25
**Status:** Design (approved in brainstorm, pending spec review)
**Scope:** `/weekend` section + a new `/ask` intent. Frontend + one batch-pipeline addition.
No model, no inference, no cron change.
**PRD:** M7's "optional championship-projection stretch" (§11). Explicitly sanctioned, not a
non-goal.

## Summary

A **title picture**: where the championship actually stands, how far back each driver is, and
what closing that gap demands per remaining round. It is **pure arithmetic over points already
in the pipeline** — no model, nothing to calibrate, nothing that can be miscalibrated.

The one number it produces beyond the standings is the **required rate**: how much a driver
must *out-score the leader by, per remaining round*, to catch them.

## Goals

- Give a casual fan the season context for the race they are already looking at.
- Stay arithmetic. No projection model, no simulation, no probability.
- Share one computation between the page and the natural-language answer so they cannot drift.
- Add no runtime Python, no new API route, and no nav entry.

## Non-goals

- **No title probabilities or odds.** PRD §4 makes "anything that touches betting odds or
  gambling regulatory surface" a non-goal, and a title percentage is also the least honest
  thing the product could show — a single confident number over a season of variance.
- **No projected final standings.** Extrapolating recent points-per-race asserts a precise
  finishing order from a very noisy average.
- **No mathematical-elimination flag.** See §Rejected below — this was designed in and then
  deliberately cut.
- No countback tiebreaks (see §Edge cases).
- No historical seasons — the live season only. (Constructors ARE in scope, as a toggle on the
  same table; what is out of scope is a separate constructors page or route.)

## Rejected during design (recorded so it is not re-litigated)

**Title probability per driver (rejected — dishonest and expensive).** Would need a full
per-driver finishing-position distribution. The podium model produces `p_podium` only, so this
is genuinely new modelling — and Phase 1 (PRD §5.1) already found no telemetry edge over
standings/form, so it would be a standings model wearing a simulation costume.

**Mathematical elimination flag (designed, then cut on owner call).** "Alive / eliminated" via
`points + maxAvailable < leaderPoints`. Cut for a good reason: at round 11 of 24 there are 429
points left, so *every* driver reads "alive" until very late in the season — the column would be
empty of information for most of the year.

Cutting it removed more than a column. `maxAvailable` and the **remaining-sprint count** existed
only to serve it, and that count was the single place where a wrong number could produce a
**false factual claim** (declaring a driver eliminated who is not). Dropping the flag deletes
that entire risk class along with the fiddliest data dependency.

The impossible cases still surface, without being asserted: a driver needing to out-score the
leader by 45 a round is visibly past the 33-point maximum. The reader draws that conclusion; the
product does not claim it.

## Data

New `app/data/standings.json`, written by `scripts/build_2026.py` and committed by the existing
`.github/workflows/refresh-weekend-data.yml` — the same path `grids.json` and
`weekend-schedule.json` already take. No new API route and no runtime Python.

```json
{
  "year": 2026,
  "throughGp": "Hungary",
  "throughRound": 11,
  "totalRounds": 24,
  "remainingRounds": 13,
  "drivers": { "VER": 241, "PIA": 198, "NOR": 187 },
  "teams": { "Red Bull Racing": 300, "McLaren": 385 }
}
```

Driver points are summed from the existing `season_results` table (which already folds in sprint
points — verified 2026-07-07, see `handoff.md` backlog #2). Team points are the sum of that
team's drivers, using the year-correct driver→team mapping the pipeline already builds
(`build_team_map`).

> **Leakage note.** `remainingRounds` and `totalRounds` come from fastf1's full event schedule.
> This is **schedule metadata, not lap data**, so it does not weaken the future-leak guard in
> `src/data/schedule.py` (fastf1 leaks future race *laps* — British R9 had laps pre-race). That
> guard stays exactly as it is: `RACE_CALENDAR[2026]` remains truncated to completed rounds plus
> the single upcoming target, and nothing in the feature pipeline may read the new fields.

## Arithmetic

`app/lib/championship.ts` — pure, no I/O, fully unit tested, the single source both surfaces read.

```ts
export type Standing = {
  key: string;        // driver code ("VER") or team name
  points: number;
  rank: number;       // 1-based; ties share a rank
  gap: number;        // points behind the leader; 0 for the leader
  requiredRate: number | null;  // must out-score the leader by this per remaining round
};
```

`requiredRate = gap / remainingRounds`, `null` for the leader and when `remainingRounds === 0`.

**Wording is load-bearing.** The leader also scores, so this is not "needs 3.3 a round" — it is
**"must out-score VER by 3.3 a round"**. The first is false; the second is true. Every surface
uses the second.

## Surfaces

### `/weekend` section

Server-rendered table under the existing weekend content. Drivers by default, with a
drivers/constructors toggle as the **only** client state on the section.

- Drivers render through the existing abstract glyph system: helmet in team colour, personal
  number in personal colour with the contrast guard, three-letter code in Space Grotesk.
- Constructors render through the existing generic car silhouette in team colours from
  `teams.json`.
- Columns: points, gap, required rate. The leader's row shows "leader" rather than a rate.
- PRD §8 constraints hold unchanged: no team logos, no reproduced liveries, no F1/FOM/FIA marks.

### `/ask` — new intent `championship_picture`

Added to `Intent`, to `ROUTE_TOOL`'s enum, and to the routing description in
`app/lib/parser.ts`; dispatched in `app/lib/orchestrate.ts`. Answers "can Norris still win the
title?", "what's the championship gap?", "who's leading?".

> **This intent is season-scoped, not race-scoped — the first one that is.** It takes no `gp`,
> and the orchestrator's "next race" gp-resolution must NOT be applied to it. Every existing
> intent is race-scoped, so this is a real new shape rather than a copy of an existing branch.

**No `driver` entity is added to the schema.** The narrative generator receives the full computed
table plus the user's question, which contains every fact needed to answer about whoever was
asked. Deliberate simplification: a new entity field is more parser surface for no extra grounding.

The narrative stays under the standing "do not invent facts" constraint — it may only restate
values from the computed table.

## Edge cases

| Case | Behaviour |
|---|---|
| Leader | `gap: 0`, `requiredRate: null`; renders "leader". |
| `remainingRounds === 0` (season over) | No division; `requiredRate: null` for everyone. It is simply the final table. |
| Equal points | Real F1 breaks ties on countback (most wins, then most seconds). We do not implement countback, so equal points **share a rank** and render as genuinely equal rather than inventing an order. |
| `standings.json` missing or malformed | The section does not render and the intent answers that standings are unavailable. Never a constructed or stale guess — same honesty rule as the unknown-circuit path in `api/podium.py`. |
| Driver in `standings.json` absent from `drivers.json` | Skipped rather than rendered without identity; `drivers.json` stays the source of truth for hard facts (PRD learning-layer rule). |

## Verification

- `vitest` for `championship.ts`: rank/gap/rate arithmetic, tie handling, the leader row, the
  zero-remaining-rounds guard, and malformed input.
- A consistency test that the `/weekend` section and the `/ask` intent read the same module, so
  the two surfaces cannot report different numbers.
- `tsc` + `npm run build` clean; full suite green.
- Live check on a prod build that the section renders, the toggle switches, and reduced motion is
  respected.
