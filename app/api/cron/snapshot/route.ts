// Schedule-aware, idempotent snapshot job (M5). Vercel Cron hits this DAILY (Hobby plan
// allows only daily crons; 0 6 * * *). `dueCheckpoint` returns the latest checkpoint
// whose time has passed, so for a conventional weekend (checkpoints ~23h apart) a single
// daily fire still lands each one in-window; idempotency (snapshot already exists) makes
// extra fires no-ops. The build + final-checkpoint scoring + Blob writes live in
// writeWeekendSnapshot (shared with the admin backfill route); this route only decides
// WHICH checkpoint is due from the bundled schedule. (For tighter timing / clustered sprint
// weekends: Pro plan or drive snapshots from the GitHub Actions job — R17.)
import { NextResponse } from "next/server";
import schedule from "@/app/data/weekend-schedule.json";
import { dueCheckpoint, type SessionSchedule } from "@/app/lib/weekend-schedule";
import { writeWeekendSnapshot } from "@/app/lib/snapshot-write";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; reject anything else.
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // `?force=1` overwrites an existing snapshot for the due checkpoint (used to re-issue
  // after a data fix). Still auth-gated; without it the job stays idempotent.
  const force = ["1", "true"].includes(new URL(req.url).searchParams.get("force") ?? "");
  try {
    const s = schedule as SessionSchedule;
    const due = dueCheckpoint(new Date(), s);
    if (!due) return NextResponse.json({ status: "no checkpoint due" });
    const result = await writeWeekendSnapshot(s.year, s.gp, due, { force });
    return NextResponse.json(result);
  } catch (e) {
    console.error("cron snapshot failed", e);
    return NextResponse.json({ error: "snapshot failed" }, { status: 500 });
  }
}
