# Championship Picture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show where the championship stands — points, gap to the leader, and the rate that gap demands per remaining round — as a `/weekend` section and a new `/ask` intent, from pure arithmetic with no model.

**Architecture:** `scripts/build_2026.py` emits `app/data/standings.json` (points per driver and per team, plus round counts) on the existing weekend-refresh cadence. `app/lib/championship.ts` is the single pure, tested arithmetic module. The `/weekend` section and the `/ask` intent both consume it, so they cannot report different numbers.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, vitest; Python 3 + pandas for the batch emitter, pytest for its tests.

**Spec:** `docs/superpowers/specs/2026-07-25-championship-picture-design.md`

## Global Constraints

- Live season only. No model, no inference, no probability, no odds. PRD §4 makes betting/gambling surface a non-goal.
- **No mathematical-elimination flag, no `maxAvailable`, no sprint counting.** These were designed and deliberately cut (spec §Rejected). Do not reintroduce them.
- **`requiredRate` wording is load-bearing.** It is always "must out-score {leader} by X a round", never "needs X a round" — the leader scores too, so the short form is false. This applies to the table header, the narrative, and any label.
- **Leakage guard is untouchable.** `RACE_CALENDAR[2026]` stays truncated to completed rounds + the single upcoming target. The new round counts are schedule metadata and must never be read by anything in the feature pipeline (`src/features/`, `src/pipeline.py`, `api/*.py` inference paths).
- PRD §8 visual constraints: abstract glyphs only. No team logos, no reproduced liveries, no F1/FOM/FIA marks, no driver likenesses.
- Round every number that reaches output.
- Commits: conventional-style, one logical change each. **No Claude/AI attribution** — no "Generated with", no `Co-Authored-By`, no robot emoji.

## Environment constraints (read before starting)

- **Python cannot be run in this environment** — pandas is not installed, and there is no CI test runner (`.github/workflows/` contains only the data-refresh workflow; nothing runs pytest). Task 1's pytest tests are written for correctness and future value but **cannot be executed here**. Verify Task 1 by inspection against the existing code, and state plainly in the report that its tests were not run.
- Consequently **all runtime-verifiable logic lives in TypeScript**, where `npm test` works. Do not move arithmetic into Python to "keep it near the data".
- `app/data/standings.json` will not exist until the weekend workflow next runs. Every TS consumer must degrade gracefully to "not rendered / unavailable" — that is the shipped behaviour until the first refresh, and it is specified, not a bug. **Do not hand-write a `standings.json` into `app/data/`** — a committed file with invented numbers would ship as fact. Test fixtures live in test files only.
- `npm run dev` overwrites `.next`; always `rm -rf .next && npm run build` before any prod-build check.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/data/schedule.py` | Modify | `derive_calendar` additionally returns `totalRounds` / `remainingRounds`. Pure; already unit-tested. |
| `scripts/build_2026.py` | Modify | New `_write_standings` step emitting `app/data/standings.json`. |
| `tests/test_schedule.py` (or existing schedule test file) | Modify | Round-count assertions. |
| `.github/workflows/refresh-weekend-data.yml` | Modify | Add `app/data/standings.json` to the commit list. |
| `app/lib/championship.ts` | Create | Pure arithmetic: rank, gap, required rate. Single source for both surfaces. |
| `app/lib/championship.test.ts` | Create | Arithmetic, ties, leader, zero remaining rounds, malformed input. |
| `app/components/ChampionshipTable.tsx` | Create | Client island: the table + the drivers/constructors toggle. |
| `app/weekend/page.tsx` | Modify | Render the section. |
| `app/lib/parser.ts` | Modify | New `championship_picture` intent. |
| `app/lib/narrative.ts` | Modify | `ChampionshipFacts` + lede + narrate. |
| `app/lib/orchestrate.ts` | Modify | Season-scoped dispatch branch. |

---

### Task 1: Emit `app/data/standings.json` from the weekend refresh

**Files:**
- Modify: `src/data/schedule.py` (`derive_calendar`)
- Modify: `scripts/build_2026.py`
- Modify: the schedule pytest file under `tests/`
- Modify: `.github/workflows/refresh-weekend-data.yml`

**Interfaces produced (Task 2 depends on this shape):**

```json
{
  "year": 2026, "throughGp": "Hungary", "throughRound": 11,
  "totalRounds": 24, "remainingRounds": 13,
  "drivers": { "VER": 241.0 }, "teams": { "McLaren": 385.0 }
}
```

- [ ] **Step 1: Return round counts from `derive_calendar`**

In `src/data/schedule.py`, `derive_calendar` already computes `known` (all schedulable rounds) and `remaining` (rounds whose race is not yet run). Add both counts to its return dict, leaving `calendar` and `schedule` byte-identical:

```python
    return {
        "calendar": calendar,
        "schedule": schedule,
        # Schedule METADATA, not lap data — safe to expose in full, unlike `calendar`,
        # which stays truncated to completed + the single upcoming target because fastf1
        # leaks future race laps. Nothing in src/features/ or the inference path may read
        # these; they exist only for the championship picture's remaining-round maths.
        "totalRounds": len(known),
        "remainingRounds": len(remaining),
    }
```

Also add the two keys to the early-return above it so the shape is uniform:

```python
    if not known:
        return {"calendar": [], "schedule": None, "totalRounds": 0, "remainingRounds": 0}
```

- [ ] **Step 2: Add the pytest cases**

In the existing schedule test file under `tests/`, add cases asserting that for a fixture of N events with M whose `race_dt >= now`: `totalRounds == N`, `remainingRounds == M`, and — the regression guard that matters — that `calendar` is still truncated to completed + one target and did **not** grow to all N.

```python
def test_round_counts_do_not_widen_the_calendar():
    events = [_event(i, dt) for i, dt in enumerate(_five_race_dates(), start=1)]
    now = _after_round(2)
    out = derive_calendar(events, now, 2026, name_to_key=_KEYS)
    assert out["totalRounds"] == 5
    assert out["remainingRounds"] == 3
    # The leak guard: completed rounds + exactly one upcoming target, never all five.
    assert len(out["calendar"]) == 3
```

Match the existing file's fixture helpers rather than inventing new ones — read it first.

- [ ] **Step 3: Emit the standings file**

In `scripts/build_2026.py`, add the path constant next to `GRIDS_JSON`:

```python
STANDINGS_JSON = os.path.join("app", "data", "standings.json")
```

Change `_refresh_calendar_and_schedule` to return the round counts alongside the calendar. Its current signature is `-> list[str]` returning `cal`; make it `-> tuple[list[str], dict | None]` returning `(cal, {"totalRounds": ..., "remainingRounds": ...})`, and `(RACE_CALENDAR[LIVE_SEASON], None)` on the fetch-failure path. Update the single call site in `main()` to `live_circuits, rounds = _refresh_calendar_and_schedule()`.

Then add:

```python
def _write_standings(results: pd.DataFrame, rounds: dict | None) -> None:
    """Emit app/data/standings.json: live-season points per driver and per team, plus the
    round counts the TS layer needs for the championship picture.

    A pure read of the already-built season_results table (whose `points` column already
    folds in sprint points) — no fastf1, no model, no inference. Leaves the committed file
    untouched rather than writing a partial one when inputs are missing, so the TS side sees
    either good data or the previous good data, never a half-written table.
    """
    if rounds is None:
        print("8/8 standings — no round counts (schedule fetch failed); leaving standings.json.")
        return
    live = results[results["year"] == LIVE_SEASON]
    if live.empty:
        print("8/8 standings — no live-season results yet; leaving standings.json.")
        return
    event_to_gp = {event: short for short, event in GP_TO_EVENT.items()}
    last = live.sort_values("date").iloc[-1]
    payload = {
        "year": LIVE_SEASON,
        # season_results.gp holds the fastf1 EventName ("Hungarian Grand Prix"); map back to
        # the short calendar key the rest of the app uses ("Hungary").
        "throughGp": event_to_gp.get(str(last["gp"]), str(last["gp"])),
        "throughRound": int(last["round"]),
        "totalRounds": int(rounds["totalRounds"]),
        "remainingRounds": int(rounds["remainingRounds"]),
        "drivers": {k: round(float(v), 1)
                    for k, v in sorted(live.groupby("Driver")["points"].sum().items())},
        "teams": {k: round(float(v), 1)
                  for k, v in sorted(live.groupby("team")["points"].sum().items())},
    }
    os.makedirs(os.path.dirname(STANDINGS_JSON), exist_ok=True)
    with open(STANDINGS_JSON, "w") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")
    print(f"8/8 standings — through {payload['throughGp']} (R{payload['throughRound']}), "
          f"{payload['remainingRounds']} of {payload['totalRounds']} rounds left "
          f"-> {STANDINGS_JSON}")
```

`GP_TO_EVENT` is already imported in this file (check; import it from `src.calendar` if not). Call `_write_standings(results, rounds)` in `main()` immediately after `_refresh_grid()`.

- [ ] **Step 4: Commit the new file from the workflow**

In `.github/workflows/refresh-weekend-data.yml`, the `git add` list currently names `api/data-fingerprint.json app/data/grids.json app/data/entity-whats.json app/data/weekend-schedule.json src/race_calendar.json`. Add `app/data/standings.json` to it.

- [ ] **Step 5: Verify by inspection (pytest cannot run here)**

Run `npx tsc --noEmit` and `npm test` to confirm nothing TS-side broke (nothing should have). Do **not** claim the pytest cases pass — they cannot be executed in this environment. In your report, state explicitly which Python changes were verified by reading only.

Check by eye: `_refresh_calendar_and_schedule`'s tuple return is destructured at its one call site; `json`, `os`, and `GP_TO_EVENT` are imported; no `src/features/` or `api/` file reads the new keys.

- [ ] **Step 6: Commit**

```bash
git add src/data/schedule.py scripts/build_2026.py tests/ .github/workflows/refresh-weekend-data.yml
git commit -m "feat: emit season standings and round counts for the championship picture"
```

---

### Task 2: `app/lib/championship.ts` — the arithmetic

**Files:**
- Create: `app/lib/championship.ts`
- Create: `app/lib/championship.test.ts`

**Interfaces:**
- Consumes: the Task 1 JSON shape.
- Produces, for Tasks 3 and 4: types `Standing` and `StandingsFile`, and functions `buildStandings`, `isStandingsFile`, `loadStandings`, `driverStandings`, `teamStandings`. (`ChampionshipTable` is the Task 3 React component, not an export of this module.)

- [ ] **Step 1: Write the failing tests**

Create `app/lib/championship.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildStandings } from "@/app/lib/championship";

describe("buildStandings", () => {
  it("ranks by points, leader first, with the gap to the leader", () => {
    const rows = buildStandings({ VER: 241, PIA: 198, NOR: 187 }, 13);
    expect(rows.map((r) => r.key)).toEqual(["VER", "PIA", "NOR"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.gap)).toEqual([0, 43, 54]);
  });

  it("states the rate as points per remaining round, rounded", () => {
    const [, pia] = buildStandings({ VER: 241, PIA: 198 }, 13);
    // 43 / 13 = 3.307... -> the leader also scores, so this is an OUT-SCORING rate.
    expect(pia.requiredRate).toBe(3.3);
  });

  it("gives the leader no rate", () => {
    const [ver] = buildStandings({ VER: 241, PIA: 198 }, 13);
    expect(ver.requiredRate).toBeNull();
    expect(ver.gap).toBe(0);
  });

  it("has no rate once the season is over", () => {
    const rows = buildStandings({ VER: 241, PIA: 198 }, 0);
    expect(rows.every((r) => r.requiredRate === null)).toBe(true);
  });

  it("shares a rank on equal points and never invents an order", () => {
    const rows = buildStandings({ VER: 200, PIA: 200, NOR: 150 }, 5);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(rows[0].gap).toBe(0);
    expect(rows[1].gap).toBe(0);
  });

  it("returns nothing for an empty table rather than throwing", () => {
    expect(buildStandings({}, 13)).toEqual([]);
  });

  it("treats a negative remaining-round count as no rounds left", () => {
    const rows = buildStandings({ VER: 241, PIA: 198 }, -1);
    expect(rows.every((r) => r.requiredRate === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/lib/championship.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/lib/championship.ts`:

```ts
// The championship picture: where the season stands, how far back each competitor is, and
// what closing that gap demands. Pure arithmetic over points already in the pipeline — no
// model, no probability, nothing to calibrate. See
// docs/superpowers/specs/2026-07-25-championship-picture-design.md.
//
// `requiredRate` is an OUT-SCORING rate, not a scoring rate: the leader keeps scoring too,
// so "needs 3.3 a round" would be false where "must out-score the leader by 3.3 a round"
// is true. Every label built from this value must use the second form.

export type Standing = {
  key: string; // driver code ("VER") or team name ("McLaren")
  points: number;
  rank: number; // 1-based; equal points share a rank
  gap: number; // points behind the leader; 0 for the leader (and for anyone tied with them)
  requiredRate: number | null; // null for the leader and when no rounds remain
};

export type StandingsFile = {
  year: number;
  throughGp: string;
  throughRound: number;
  totalRounds: number;
  remainingRounds: number;
  drivers: Record<string, number>;
  teams: Record<string, number>;
};

/** Points table -> ranked standings. `remainingRounds` <= 0 means no rate is defined. */
export function buildStandings(
  points: Record<string, number>,
  remainingRounds: number,
): Standing[] {
  const entries = Object.entries(points).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return [];
  const leaderPoints = entries[0][1];
  const rounds = Math.max(0, Math.floor(remainingRounds));
  return entries.map(([key, pts], i) => {
    // Equal points share the rank of the first competitor on that score — real F1 breaks
    // these on countback (most wins, then most seconds) and we deliberately do not, so a
    // tie renders as a genuine tie rather than an invented order.
    const rank = entries.findIndex(([, p]) => p === pts) + 1;
    const gap = Math.round((leaderPoints - pts) * 10) / 10;
    const requiredRate =
      gap > 0 && rounds > 0 ? Math.round((gap / rounds) * 10) / 10 : null;
    return { key, points: pts, rank, gap, requiredRate };
  });
}

/** True when the payload has every field the table needs, with the right types. */
export function isStandingsFile(x: unknown): x is StandingsFile {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<StandingsFile>;
  const nums = [s.year, s.throughRound, s.totalRounds, s.remainingRounds];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  if (typeof s.throughGp !== "string" || !s.throughGp) return false;
  const isPointMap = (m: unknown) =>
    !!m &&
    typeof m === "object" &&
    Object.values(m as Record<string, unknown>).every(
      (v) => typeof v === "number" && Number.isFinite(v),
    );
  return isPointMap(s.drivers) && isPointMap(s.teams);
}
```

Note the unused-variable lint: `i` is not needed in the `map` — drop it if the linter objects.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run app/lib/championship.test.ts`
Expected: PASS, 7 cases.

- [ ] **Step 5: Add the loader with graceful absence**

`app/data/standings.json` does not exist yet and must not be hand-created. Load it defensively and append to `championship.ts`:

```ts
/**
 * The committed standings, or null when the file is absent or malformed. Absent is the
 * NORMAL state until the weekend refresh first writes it, so every caller must handle null
 * — the section simply does not render, and the intent says standings are unavailable. We
 * never construct or stale-guess a table, matching api/podium.py's unknown-circuit rule.
 */
export function loadStandings(): StandingsFile | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data: unknown = require("@/app/data/standings.json");
    return isStandingsFile(data) ? data : null;
  } catch {
    return null;
  }
}

export function driverStandings(file: StandingsFile): Standing[] {
  return buildStandings(file.drivers, file.remainingRounds);
}

export function teamStandings(file: StandingsFile): Standing[] {
  return buildStandings(file.teams, file.remainingRounds);
}
```

If `require` of a missing JSON does not fail gracefully under the project's bundler, fall back to reading it with `fs` in a server context and passing the parsed object down as a prop — but try the simple form first and only change if the build actually breaks.

- [ ] **Step 6: Add loader tests**

Append to `championship.test.ts` cases for `isStandingsFile`: accepts a well-formed payload; rejects `null`, a payload with a string where a number belongs, and one whose `drivers` map holds a non-numeric value.

- [ ] **Step 7: Verify and commit**

Run: `npm test` (expect the suite to grow by the new cases), then `npx tsc --noEmit`.

```bash
git add app/lib/championship.ts app/lib/championship.test.ts
git commit -m "feat: championship standings arithmetic — rank, gap, required rate"
```

---

### Task 3: The `/weekend` section

**Files:**
- Create: `app/components/ChampionshipTable.tsx`
- Modify: `app/weekend/page.tsx`

**Interfaces:**
- Consumes from Task 2: `loadStandings`, `driverStandings`, `teamStandings`, `Standing`, `StandingsFile`.
- Produces: nothing consumed later.

- [ ] **Step 1: Read the surrounding code first**

Read `app/weekend/page.tsx` in full, plus the podium table markup it already contains, and `app/components/` for the existing driver glyph component and the car silhouette. **Match the existing table's classes and spacing** rather than inventing a new visual language — this section sits directly beneath them.

- [ ] **Step 2: Build the client island**

Create `app/components/ChampionshipTable.tsx` as a `"use client"` component. Contract:

```tsx
export function ChampionshipTable({ file }: { file: StandingsFile }) // default view: drivers
```

Requirements:
- A drivers/constructors toggle — **the only client state in this section**. Two buttons with `aria-pressed`, or a radiogroup; visible focus states.
- Columns: competitor, points, gap, and the rate. The rate column header must read **"must out-score leader by / round"** or equivalent — never "needs / round".
- The leader's rate cell renders `leader`, not a dash or `0`.
- Points and gap use `font-variant-numeric: tabular-nums` (or the project's Tailwind equivalent) so the columns do not jitter when the toggle switches.
- Drivers render with the existing helmet glyph + personal number + three-letter code. Constructors render with the existing car silhouette in team colours from `teams.json`. Do not write new glyph code — reuse the components.
- A driver key present in `standings.json` but absent from `drivers.json` is **skipped**, not rendered without identity (`drivers.json` is the source of truth for hard facts).
- A caption stating the basis: through which GP, and how many rounds remain — e.g. "After the Hungarian Grand Prix · 13 of 24 rounds remaining".

Skeleton to build on — fill the glyph and class details from the surrounding code you read in Step 1:

```tsx
"use client";

import { useState } from "react";
import {
  driverStandings,
  teamStandings,
  type Standing,
  type StandingsFile,
} from "@/app/lib/championship";

type View = "drivers" | "constructors";

export function ChampionshipTable({ file }: { file: StandingsFile }) {
  const [view, setView] = useState<View>("drivers");
  const rows: Standing[] = view === "drivers" ? driverStandings(file) : teamStandings(file);

  return (
    <section aria-labelledby="championship-heading">
      <h2 id="championship-heading">Championship</h2>
      <p>
        {`After the ${file.throughGp} Grand Prix · ${file.remainingRounds} of ${file.totalRounds} rounds remaining`}
      </p>

      <div role="group" aria-label="Championship view">
        {(["drivers", "constructors"] as View[]).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
            {v === "drivers" ? "Drivers" : "Constructors"}
          </button>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th scope="col">{view === "drivers" ? "Driver" : "Team"}</th>
            <th scope="col">Points</th>
            <th scope="col">Gap</th>
            {/* Never "needs / round" — the leader scores too, so that phrasing is false. */}
            <th scope="col">Must out-score leader by / round</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{/* glyph + code (drivers) or silhouette + name (teams) */}</th>
              <td>{r.points}</td>
              <td>{r.gap === 0 ? "—" : `-${r.gap}`}</td>
              {/* `requiredRate` is null for the leader AND for everyone once the season is
                  over, so branch on gap first — otherwise a finished season labels every
                  row "leader". */}
              <td>
                {r.gap === 0 ? "leader" : r.requiredRate === null ? "—" : `+${r.requiredRate}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

Add a test for that season-over branch: with `remainingRounds: 0` and a non-zero gap, the rate cell must read `—`, and only the actual leader's row may read `leader`.

- [ ] **Step 3: Render it on the page**

In `app/weekend/page.tsx`, load the file server-side and render the section only when it is present:

```tsx
const standings = loadStandings();
// ...
{standings && <ChampionshipTable file={standings} />}
```

Absent standings render nothing at all — no empty shell, no placeholder.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npm test
rm -rf .next && npm run build
```

All clean. The section will not appear locally because `app/data/standings.json` does not exist yet — that is expected. To eyeball it, temporarily point the component at a literal fixture object in a scratch edit, confirm the layout and toggle, then **revert that scratch edit before committing**.

- [ ] **Step 5: Commit**

```bash
git add app/components/ChampionshipTable.tsx app/weekend/page.tsx
git commit -m "feat: championship picture section on the weekend page"
```

---

### Task 4: The `championship_picture` `/ask` intent

**Files:**
- Modify: `app/lib/parser.ts`
- Modify: `app/lib/narrative.ts`
- Modify: `app/lib/orchestrate.ts`
- Modify: the corresponding `.test.ts` files

**Interfaces:**
- Consumes from Task 2: `loadStandings`, `driverStandings`.

- [ ] **Step 1: Add the intent to the parser**

In `app/lib/parser.ts`, add `"championship_picture"` to the `Intent` union and to `ROUTE_TOOL`'s `intent` enum, and extend the routing description with:

```
"championship_picture for season-standings questions — who leads the championship, how far
back a driver is, whether someone can still win the title. Season-scoped: do NOT set gp."
```

- [ ] **Step 2: Add the facts type and lede to `narrative.ts`**

Follow the shape of the existing `StrategyFacts` / `strategyLede` pair:

```ts
import type { Standing } from "@/app/lib/championship";

export type ChampionshipFacts = {
  kind: "championship";
  year: number;
  throughGp: string;
  remainingRounds: number;
  totalRounds: number;
  rows: Standing[]; // reuse the type — do not restate the shape and let it drift
};

/** Deterministic one-liner; the LLM narrative expands on it but may not contradict it. */
export function championshipLede(f: ChampionshipFacts): string {
  const [leader, second] = f.rows;
  if (!leader) return "Championship standings are not available yet.";
  if (!second) return `${leader.key} leads the ${f.year} championship on ${leader.points} points.`;
  return (
    `${leader.key} leads the ${f.year} championship on ${leader.points} points, ` +
    `${second.gap} clear of ${second.key} with ${f.remainingRounds} of ${f.totalRounds} rounds left.`
  );
}
```

Add a narrate function mirroring the existing ones. Its system prompt must carry:

```
"Use ONLY the facts in the JSON. `gap` is points behind the leader and `requiredRate` is how
many points per remaining round that competitor must OUT-SCORE THE LEADER BY to catch them —
never describe it as points they simply need to score, which would be false because the leader
scores too. Do not estimate title chances, probabilities or odds; this is arithmetic, not a
forecast."
```

- [ ] **Step 3: Dispatch it in `orchestrate.ts`**

Add `| { supported: true; championship: ChampionshipFacts; narrative: string }` to the `Answer` union. Add **two** entries to `AnswerDeps` — `narrateChampionship: (facts: ChampionshipFacts) => Promise<string>` and `loadStandings?: () => StandingsFile | null` (optional, defaulting to the real loader, so tests can inject both the present and absent cases). Then this branch:

```ts
  if (parsed.intent === "championship_picture") {
    // Season-scoped, unlike every other intent: no circuit, and deliberately NOT run
    // through resolveTarget / the "next race" gp-resolution.
    const file = deps.loadStandings ? deps.loadStandings() : loadStandings();
    if (!file) return { supported: false, message: standingsUnavailable };
    const championship: ChampionshipFacts = {
      kind: "championship",
      year: file.year,
      throughGp: file.throughGp,
      remainingRounds: file.remainingRounds,
      totalRounds: file.totalRounds,
      rows: driverStandings(file),
    };
    const narrative = await deps.narrateChampionship(championship);
    return { supported: true, championship, narrative };
  }
```

Add a `standingsUnavailable` message alongside the existing fallback strings, worded honestly ("I don't have the current championship standings yet.").

- [ ] **Step 4: Tests**

In `orchestrate`'s test file, add cases asserting: the branch returns `supported: false` with the unavailable message when `loadStandings` yields null; it returns the facts and narrative when it yields a file; and — the regression guard for the season-scoped rule — that **no `gp` resolution happens**, i.e. a query parsed with no `gp` does not call the upcoming-race resolver. Follow the existing tests' dependency-injection style.

In `parser`'s test file, add a routing case for a championship question.

- [ ] **Step 5: Render it on `/ask`**

Add a branch in the `/ask` answer rendering for `championship` that shows the lede, the narrative, and a compact table (points / gap / rate). Reuse the `/weekend` table component if it drops in cleanly; duplicate only the minimum if it does not.

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit
npm test
rm -rf .next && npm run build
```

```bash
git add app/lib/parser.ts app/lib/narrative.ts app/lib/orchestrate.ts app/ask app/lib/*.test.ts
git commit -m "feat: championship_picture intent for season standings questions"
```

---

### Task 5: Whole-feature verification

**Files:** none changed unless a defect is found.

- [ ] **Step 1: Full suite**

```bash
npx tsc --noEmit
npm test
rm -rf .next && npm run build
```

- [ ] **Step 2: Confirm the leak guard is intact**

```bash
grep -rn "totalRounds\|remainingRounds" src/ api/
```

Expected: matches ONLY in `src/data/schedule.py`. Any hit inside `src/features/`, `src/pipeline.py`, or an `api/*.py` inference path is a leak-guard violation and must be removed.

- [ ] **Step 3: Confirm the wording rule**

```bash
grep -rni "needs .* a round\|needs .* per round" app/
```

Expected: no output. The only correct phrasing is out-scoring the leader.

- [ ] **Step 4: Confirm graceful absence**

With `app/data/standings.json` still absent, load `/weekend` and `/ask` on a prod build: the section is absent (not a broken shell), and a championship question answers that standings are unavailable. Neither path throws.

- [ ] **Step 5: Report what is NOT verified**

State plainly in the final report: the Python emitter has not been executed (no pandas, no CI runner), so the real `standings.json` will first appear after the next weekend-refresh workflow run. Until then the feature is shipped-but-invisible by design. The first refresh is the moment to check the numbers against the real championship table.

---

## Notes for the reviewer

- The elimination flag, `maxAvailable`, and sprint counting are **deliberately absent**. If the diff contains them, that is scope creep against an explicit design decision.
- `requiredRate` phrasing is the single most important correctness detail in this feature — "needs X a round" is a false statement about the world. Check every string.
- `RACE_CALENDAR[2026]` must still be truncated. The new counts are a separate field for a reason.
- Nothing here may call fastf1 at runtime, add an API route, or touch the cron.
