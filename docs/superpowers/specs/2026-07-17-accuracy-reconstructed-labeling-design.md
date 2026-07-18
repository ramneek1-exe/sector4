# Design — `/accuracy` reconstructed-round labeling + headline exclusion

Date: 2026-07-17
Status: approved (owner), ready for implementation plan
Milestone: honesty follow-up to the snapshot final-capture reconciler (handoff backlog #6, opened from PR #27).

## 0. Problem

The final-capture reconciler (PR #27) backfills every completed 2026 round missing a `final`
snapshot. On its first real run it backfilled 7 pre-beta rounds (Australia, China, Japan,
Miami, Canada, Monaco, Barcelona) — races the product **never forecast live to any user**.
Those, plus the earlier admin-backfilled Great Britain, are **post-hoc reconstructions**
(`issuedAt=now`, rebuilt from current bundled data, leakage-guarded). They are now scored on
`/accuracy` and — critically — folded into the season headline (`top3Rate`, `meanBrier`) and
the cumulative trend chart by `summarize`, exactly as if they were live predictions.

`/accuracy` presents a **track record** of *issued* predictions. Blending reconstructions we
never issued live into that headline overstates the record. Only Austria (R8, the beta's
first weekend) has a genuinely live-captured `final` today.

## 1. Goal

Distinguish reconstructed rounds from live-issued ones on `/accuracy`:
- **Exclude** reconstructed rounds from the season headline (`top3Rate`, `meanBrier`) and the
  trend chart — so the track-record numbers reflect only genuinely live-issued predictions.
- **Still list** reconstructed rounds in the race-by-race table, clearly labeled as **from a
  testing period, not predicted live** (owner's wording — never "regenerated/reconstructed"
  in user-facing copy).
- Show the counts transparently (e.g. "1 live · 7 from testing"), hiding nothing.

## 2. Non-goals

- No change to which rounds the reconciler backfills (that's correct — it self-heals).
- No `/weekend` past-predictions-modal labeling in this slice (possible future; the modal is a
  separate surface). The flag is stamped on the calibration **row**; snapshot-level labeling of
  `/weekend` is out of scope.
- No %-calibration / isotonic changes (v1 stays display-only bands).
- No automatic re-scoring of already-stored rows — the one-time restamp is an explicit owner
  ops step (§6).

## 3. The flag

Add `reconstructed?: boolean` to the calibration index row.

- `CalibrationRow` (app/lib/calibration.ts) gains `reconstructed?: boolean`.
- `writeWeekendSnapshot` (app/lib/snapshot-write.ts) gains a `reconstructed?: boolean` option
  in its existing options bag (`WriteDeps` — the same object that already carries `force`).
  When true, the calibration row it pushes to the season index carries `reconstructed: true`.
  When false/absent, the row is written exactly as today (no `reconstructed` key).

Callers:
- **Reconciler** (`reconcile-finals.ts` default `write`): passes `{ force: false, reconstructed: true }`
  — every reconciler write is post-hoc by definition.
- **Admin backfill** (`app/api/admin/snapshot/route.ts`): passes `{ force, reconstructed: true }`
  — the admin route is always a post-hoc backfill/re-issue by definition.
- **Live cron due-write** (`app/api/cron/snapshot/route.ts`): UNCHANGED — passes `{ force }`,
  never `reconstructed`. A final captured live in-window stays unflagged (Austria).

Semantics: `reconstructed: true` means "this scored row was written by a post-hoc backfill
path, not a live in-window capture." That is precisely the honest distinction.

## 4. `summarize` — exclude reconstructed from the headline

`summarize(index)` (app/lib/calibration.ts) changes so the headline aggregates and the
cumulative series are computed over **live rows only** (`index.filter(r => !r.reconstructed)`):

- `top3Rate`, `meanBrier`: mean over live rows.
- `cumulative`: walk live rows only (so the chart trend is the live track record).
- `nRaces`: the number of **live** rows (drives the "Races scored" stat and the `>= 3` chart
  gate and `CALIBRATION_MIN_RACES`).
- Add `nReconstructed: number` = count of reconstructed rows, for display.
- If there are zero live rows (e.g. only testing rounds so far), the headline degrades exactly
  like the current `nRaces === 0` path (no chart, banner copy), while the race-by-race table
  still lists the reconstructed rows labeled.

`CalibrationSummary` gains `nReconstructed`. The `CalibrationRow.reconstructed` flag is
preserved through `raceDetail`/row loading so the page can label individual rows.

## 5. `/accuracy` page

`app/accuracy/page.tsx`:
- The race-by-race list iterates the FULL index (live + reconstructed), as today. Each
  reconstructed row shows a label/badge: **"From testing · not predicted live"** (exact copy
  TBD-in-plan, but this intent — testing, not live; never "regenerated").
- "Races scored" reflects live rounds; alongside it, surface the testing count, e.g.
  "1 live · 7 from testing" (so the 7 aren't hidden, just correctly categorized).
- The trend chart (already gated at `>= 3`) now uses the live-only `cumulative`, so it appears
  only once ≥3 *live* races are scored.
- The reliability-banner / empty-state copy references live races for its counts.

## 6. One-time restamp (owner ops — documented, not code)

The 8 already-stored reconstructed rows (the 7 pre-beta + Great Britain) predate the flag, so
their saved calibration rows have no `reconstructed` key. The reconciler skips them
(`alreadyPresent`), so they must be rewritten once to pick up the flag. After deploy, the owner
runs the admin backfill for exactly those rounds (which now stamps `reconstructed: true`).
**Austria is deliberately excluded** — its `final` was captured live; restamping would wrongly
flag it as testing.

Command (owner runs; needs `CRON_SECRET`):

```bash
BASE="https://sector4.net"   # or the deploy under test
for gp in Australia China Japan Miami Canada Monaco Barcelona "Great Britain"; do
  curl -sG "$BASE/api/admin/snapshot" \
    --data-urlencode "gp=$gp" --data-urlencode "checkpoint=final" \
    -H "Authorization: Bearer $CRON_SECRET"
  echo
done
```

After this, `/accuracy` shows Austria as the sole live-scored round and the 8 as labeled
testing rows. Future missed-then-backfilled races auto-flag via the reconciler — no repeat ops.

## 7. Tests

`app/lib/calibration.test.ts`:
- `summarize` excludes `reconstructed` rows from `top3Rate`, `meanBrier`, and `cumulative`;
  `nRaces` counts live rows; `nReconstructed` counts the rest.
- A mixed index (some reconstructed, some not) yields headline numbers equal to the live-only
  subset; an all-reconstructed index yields the zero-live degrade with `nReconstructed > 0`.
- `CalibrationRow.reconstructed` round-trips through row loading/`raceDetail` so labeling works.

`app/lib/snapshot-write.test.ts`:
- `writeWeekendSnapshot(..., { reconstructed: true })` writes a calibration row carrying
  `reconstructed: true`; the default (no option) writes a row WITHOUT the key (regression: the
  existing scored-row shape is unchanged for the live path).

`app/lib/reconcile-finals.test.ts`:
- the default `write` invokes `writeWeekendSnapshot` with `reconstructed: true` (assert via an
  injected write spy / the option object).

Regression: existing calibration/snapshot-write/reconcile/cron tests stay green.

## 8. Files touched

- `app/lib/calibration.ts` — `CalibrationRow.reconstructed`, `summarize` live-only aggregates,
  `CalibrationSummary.nReconstructed`.
- `app/lib/snapshot-write.ts` — `WriteDeps.reconstructed`, stamp it on the calibration row.
- `app/lib/reconcile-finals.ts` — default `write` passes `reconstructed: true`.
- `app/api/admin/snapshot/route.ts` — pass `reconstructed: true`.
- `app/accuracy/page.tsx` — per-row label, live/testing counts.
- Tests: calibration, snapshot-write, reconcile-finals.

No change to: the live cron due-write behavior, `build-snapshot.ts`, the Python pipeline,
`vercel.json`, R17, or any bundled data artifact.
