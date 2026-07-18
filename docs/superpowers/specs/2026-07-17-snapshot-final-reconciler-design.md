# Design — snapshot `final`-capture reconciler

Date: 2026-07-17
Status: approved (owner), ready for implementation plan
Milestone: known-gap hardening (handoff "KNOWN GAP — deferred 2026-07-07"); ops reliability for `/weekend` + `/accuracy`.

## 0. Problem

A completed race's `final` snapshot is the load-bearing artifact for two honesty surfaces:
it freezes the past-predictions call (`/weekend` prev-GP modal reads
`snapshotKey(year, gp, "final")`) AND scores the race into the season calibration index
(`seasonIndexKey`, read by `/accuracy`). Both are written by the same `final`-checkpoint
path in `writeWeekendSnapshot`.

Today that path only fires from the **daily Vercel cron** (`vercel.json`: `0 6 * * *`),
which snapshots **only the current `schedule.gp`** for the checkpoint due "now". This is
systematically too slow for `final`:

- Snapshot cron: daily **06:00 UTC**, single `schedule.gp`.
- R17 (`refresh-weekend-data.yml`): Fri/Sat/Sun **08:00 & 18:00 UTC**, refreshes data and
  **self-rolls `schedule.gp` to the next race** once the race date passes.
- Timeline: Sunday race ~13:00Z → R17 Sun 18:00 rolls e.g. Belgium → Hungary → Monday
  06:00 cron sees `gp=Hungary` (whose `final` hasn't passed) → **the just-completed race's
  `final` is never captured**. Manual `/api/admin/snapshot` backfill is the only recovery.

This is the exact Great Britain failure (2026-07-07): GB's `final` was never captured, so
GB was absent from both the prev-GP modal and `/accuracy` until a manual backfill. Austria
R8 is currently the only race with a clean automatic `final`. Every race is exposed.

## 1. Goal

Make `final` capture self-healing: the morning after any race, a **reconcile pass**
captures that race's `final` regardless of whether `schedule.gp` has already rolled, and
sweeps up any historical round still missing a `final` on the same run. No manual backfill
in the normal path.

## 2. Non-goals

- No change to pre/post-quali capture (ephemeral in-weekend surfaces; best-effort via the
  existing due-checkpoint step is fine).
- No new Vercel cron entry (Hobby plan cron limits; we augment the existing daily cron).
- No R17/GitHub-Actions changes, no new secret, no deploy-readiness polling.
- No frontend modal-fallback safety net (deferred — the reconciler closes the real hole;
  the prev-GP modal already degrades gracefully in the sub-24h window).
- No live-frozen artifact: backfilled finals are post-hoc rebuilds (`issuedAt=now`), exactly
  like the existing admin backfill — leakage-safe, acceptable.

## 3. Mechanism (delivery)

Augment the existing daily cron route `app/api/cron/snapshot/route.ts`. After it writes the
current `schedule.gp`'s due checkpoint (UNCHANGED behavior), it runs `reconcileFinals(...)`
over the live season's rounds and includes the summary in the JSON response. A reconcile
failure is caught + logged and MUST NOT fail the primary due-checkpoint write (the current
`try/catch` around the due write stays; reconcile gets its own guard).

Steady-state cost: the reconcile pass iterates the season's ~10–24 rounds; rounds already
snapshotted cost one `getJson` existence check each (cheap); only a missing+completed round
does the expensive build. Typically 0–1 builds per day. Comfortably within the cron timeout.

## 4. The reconcile function

New module `app/lib/reconcile-finals.ts`:

```ts
export interface ReconcileDeps {
  getJson?: <T>(key: string) => Promise<T | null>;
  getActualFinish?: (year: number, gp: string) => Promise<string[]>;
  write?: (year: number, gp: string) => Promise<unknown>; // defaults to writeWeekendSnapshot(..., "final")
}

export interface ReconcileResult {
  backfilled: string[];      // finals newly written this run
  alreadyPresent: string[];  // final snapshot already existed
  notRaced: string[];        // no actuals yet (un-raced target / results not ready)
}

export async function reconcileFinals(
  year: number,
  rounds: string[],
  deps?: ReconcileDeps,
): Promise<ReconcileResult>;
```

Per gp in `rounds`, in order:
1. If `getJson(snapshotKey(year, gp, "final"))` returns non-null → `alreadyPresent`, continue.
2. Else `getActualFinish(year, gp)`; if the returned order is empty → `notRaced`, continue
   (this is the gate that excludes the un-raced upcoming target AND rounds whose results
   aren't published yet — we never write a bogus empty-actuals `final`).
3. Else `write(year, gp)` (→ `writeWeekendSnapshot(year, gp, "final")`, which builds, scores
   the calibration row, and writes both the `final` key and `latest`) → `backfilled`.

- `write` defaults to a wrapper calling `writeWeekendSnapshot(year, gp, "final")` with
  `force: false` (never rebuild an existing snapshot; step 1 already guards existence, and
  `force:false` is belt-and-suspenders).
- Idempotency: `writeWeekendSnapshot` already refuses to double-count a gp in the season
  calibration index, so even a redundant call cannot double-score.
- I/O is injectable (defaults: `getJson` from `./blob`; `getActualFinish` reused from
  `snapshot-write.ts` — see §5) so the function is unit-testable without Blob.

## 5. Shared `getActualFinish`

`snapshot-write.ts` currently has a private `realGetActualFinish(year, gp)` that fetches
`/api/results?year&gp` and returns `finishOrder`. Export it (rename to `getActualFinish`)
from `snapshot-write.ts` and reuse it as the reconciler's default so the two callers can't
drift. The cron/admin behavior is unchanged (same function, now exported).

## 6. Candidate rounds source

The cron route reads `@/src/race_calendar.json` (shape `{ "2026": [gp, ...] }`; bundled,
R17-maintained, already imported by `app/weekend/page.tsx`). Rounds = `raceCalendar[String(year)] ?? []`
for `year = schedule.year`. The list includes the upcoming un-raced target (e.g. Belgium);
the §4 step-2 empty-actuals gate correctly classifies it `notRaced`.

## 7. Cron route change (shape)

In `app/api/cron/snapshot/route.ts`, after the existing due-checkpoint `writeWeekendSnapshot`
call:

```ts
const rounds = (raceCalendar as Record<string, string[]>)[String(s.year)] ?? [];
let reconcile: ReconcileResult | { error: string };
try {
  reconcile = await reconcileFinals(s.year, rounds);
} catch (e) {
  console.error("reconcile finals failed", e);
  reconcile = { error: "reconcile failed" };
}
return NextResponse.json({ ...result, reconcile });
```

The primary `result` (due-checkpoint write) is returned even if reconcile throws.

## 8. Tests

`app/lib/reconcile-finals.test.ts` (vitest, injected I/O — no Blob):
- backfills a completed round with no `final` snapshot (getJson→null, getActualFinish→non-empty)
  → appears in `backfilled`, `write` called once for it.
- skips a round whose `final` already exists (getJson→truthy) → `alreadyPresent`, `write` NOT called.
- skips a round with empty actuals (getActualFinish→[]) → `notRaced`, `write` NOT called.
- a mixed rounds list returns the correct 3-way partition.
- `write` default path is called with checkpoint `"final"` and `force:false` (assert via an
  injected `write` spy / or via a `writeWeekendSnapshot` mock).

`app/api/cron/snapshot/route.test.ts` (or the existing cron test file, if present):
- the response JSON includes a `reconcile` summary alongside the due-checkpoint `result`.
- a reconcile that throws does NOT change the HTTP status of the due-checkpoint result
  (still 200 with `result`, `reconcile: { error }`).

Regression: existing cron + admin + snapshot-write tests stay green (the `getActualFinish`
export rename must not break `snapshot-write.ts`'s own usage or tests).

## 9. Files touched

- `app/lib/reconcile-finals.ts` (new) — `reconcileFinals` + `ReconcileDeps`/`ReconcileResult`.
- `app/lib/snapshot-write.ts` (modify) — export `getActualFinish` (renamed from
  `realGetActualFinish`); internal default wiring updated to the new name.
- `app/api/cron/snapshot/route.ts` (modify) — call `reconcileFinals` after the due write,
  include summary, guard failures.
- Tests: `app/lib/reconcile-finals.test.ts` (new); cron route reconcile test.

No changes to: `vercel.json` (no new cron), R17, the admin route, `build-snapshot.ts`, the
Python pipeline, or any bundled data artifact.

## 10. Observability

The cron response now carries `reconcile: { backfilled, alreadyPresent, notRaced }` (or
`{ error }`), so a manual `curl` of the cron endpoint (auth-gated) shows exactly what the
last sweep did — the debugging handle the firefight lacked.
```
