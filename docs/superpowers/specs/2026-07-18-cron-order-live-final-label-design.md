# Design — cron reorder so the due-write claims the live final (backlog #8)

Date: 2026-07-18
Status: approved (owner), ready for implementation plan
Milestone: honesty follow-up (whole-branch review M2 of the atomic-rebuild slice; handoff backlog #8).

## 0. Problem

The daily snapshot cron currently runs `safeReconcileFinals → due-write → rebuild`. When the
current race has just finished (results published, `s.final` passed), `reconcileFinals` iterates
`schedule.gp` FIRST: it finds no `final` snapshot yet, fetches actuals, and writes the final as
`reconstructed: true`. The due-write then short-circuits (`already snapshotted`, `force:false`),
so the current race is permanently labeled **reconstructed** even though the cron fired inside
its live post-race window and would have captured it live.

Net effect: essentially every future race gets labeled "From testing · not predicted live", so
`/accuracy`'s live-race headline count stalls at 1 (Austria, captured before the reconciler
existed). That defeats the calibration-track-record the page is meant to accumulate. Pre-existing
(the old reconciler also stamped the row); surfaced by the atomic-rebuild review.

## 1. Goal

The **due-write owns the live final**: when the cron fires in a race's post-race window, that
race's `final` is captured **live** (no `reconstructed` flag). The reconciler remains the safety
net that backfills genuinely-missed finals (honestly labeled reconstructed). So the `/accuracy`
live count grows as races are captured in-cadence.

## 2. Non-goals

- No change to `reconcileFinals`, `rebuildCalibrationIndex`, `writeWeekendSnapshot`, or the admin
  routes — this is purely the cron's orchestration order + failure isolation.
- No change to how "reconstructed" is defined or stamped (still: reconciler/admin → true; live
  due-write → absent).
- No new cron entry / schedule change.

## 3. Fix — reorder + isolate, extracted into a testable orchestrator

Reorder the cron to **due-write → reconcile → rebuild**, and isolate the due-write so a failure
can't skip reconcile + rebuild. To make the ordering **regression-tested** (rather than living
untested in a route handler), extract the orchestration into a pure, dependency-injected function
and leave the route as thin glue — matching the repo's "logic in testable libs, routes are glue"
pattern.

### 3.1 `app/lib/snapshot-cron.ts` (new)

```ts
export interface RunCronInput {
  schedule: SessionSchedule;
  rounds: string[];
  now: Date;
  force: boolean;
}
export interface RunCronDeps {
  write?: typeof writeWeekendSnapshot;
  reconcile?: typeof safeReconcileFinals;
  rebuild?: typeof safeRebuildCalibrationIndex;
}
export async function runSnapshotCron(
  input: RunCronInput,
  deps?: RunCronDeps,
): Promise<Record<string, unknown>>;
```

Logic (defaults wire to the real functions):
1. `const due = dueCheckpoint(now, schedule)`.
2. **Due-write FIRST, isolated:** if `due`, `try { result = await write(year, gp, due, { force }) }
   catch { console.error(...); result = { error: "due write failed" } }`; else
   `result = { status: "no checkpoint due" }`. The due-write passes only `{ force }` (NO
   `reconstructed`), so a captured final is **live**.
3. **Reconcile** any other missed finals: `const reconcile = await reconcile(year, rounds)`. The
   current gp — if the due-write just captured it — is now `alreadyPresent`, so reconcile skips it
   (it only backfills genuinely-missing rounds, as reconstructed).
4. **Rebuild LAST:** `const rebuild = await rebuild(year, rounds)`.
5. Return `{ ...result, reconcile, rebuild }`.

### 3.2 `app/api/cron/snapshot/route.ts` (thin glue)

Keep the auth gate + `force` parse. Derive `s` (schedule) and `rounds`, then:

```ts
  try {
    const s = schedule as SessionSchedule;
    const rounds = (raceCalendar as Record<string, string[]>)[String(s.year)] ?? [];
    const payload = await runSnapshotCron({ schedule: s, rounds, now: new Date(), force });
    return NextResponse.json(payload);
  } catch (e) {
    console.error("cron snapshot failed", e);
    return NextResponse.json({ error: "snapshot failed" }, { status: 500 });
  }
```

The outer try/catch stays for unexpected errors; the due-write's own try/catch (in
`runSnapshotCron`) keeps a due-write failure from skipping reconcile + rebuild.

## 4. Missed-final safety (preserved)

If the cron never fires in a race's post-race window (the schedule rolls to the next gp first),
that race's `final` snapshot never gets written by the due-write. On a later fire, `reconcile`
(which still runs every fire over all `rounds`) backfills it as `reconstructed: true` — which is
now **honest**: it genuinely was not captured live. So the reorder keeps the self-heal and only
changes WHICH path labels the current race.

## 5. Tests

`app/lib/snapshot-cron.test.ts` (new, injected spies — no Blob):
- **Ordering (the regression guard):** with a `now` past `schedule.final`, inject `write` +
  `reconcile` spies that push to a shared `calls` array; assert `write` is invoked BEFORE
  `reconcile`. This fails if anyone reorders back to reconcile-first.
- **Live capture:** with `due === "final"`, assert `write` called with `(year, gp, "final",
  { force })` and NO `reconstructed` key in the options object (proving the live-label path).
- **Failure isolation:** a `write` that throws → the payload still contains `reconcile` and
  `rebuild` results (both deps were called) and `result` is `{ error: "due write failed" }`.
- **No-due path:** with `now` before `preQuali`, `write` is NOT called, `result` is
  `{ status: "no checkpoint due" }`, and `reconcile` + `rebuild` still ran.

Regression: existing reconcile / rebuild / snapshot-write / calibration tests stay green. The
cron route has no existing test (thin glue).

## 6. Files touched

- `app/lib/snapshot-cron.ts` (new) — `runSnapshotCron`.
- `app/lib/snapshot-cron.test.ts` (new).
- `app/api/cron/snapshot/route.ts` (modify) — becomes thin glue calling `runSnapshotCron`.

No change to: `reconcile-finals.ts`, `calibration-index.ts`, `snapshot-write.ts`, admin routes,
`vercel.json`, R17, Python, or bundled data.

## 7. Deploy note

Forward-looking only: the reorder changes how the NEXT captured race is labeled. It does not
relabel existing rows (those are set by their snapshots' `reconstructed` bit). The first race
captured live after deploy will appear as a 2nd live row on `/accuracy`, and the headline grows
from there.
