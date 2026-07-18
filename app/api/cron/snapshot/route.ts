// Schedule-aware, idempotent snapshot job (M5). Vercel Cron hits this DAILY (0 6 * * *). The
// orchestration (due-write -> reconcile -> rebuild) lives in runSnapshotCron so its ordering is
// unit-tested; this route is auth + input glue.
import { NextResponse } from "next/server";
import schedule from "@/app/data/weekend-schedule.json";
import type { SessionSchedule } from "@/app/lib/weekend-schedule";
import raceCalendar from "@/src/race_calendar.json";
import { runSnapshotCron } from "@/app/lib/snapshot-cron";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; reject anything else.
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // `?force=1` overwrites an existing snapshot for the due checkpoint (re-issue after a fix).
  const force = ["1", "true"].includes(new URL(req.url).searchParams.get("force") ?? "");
  try {
    const s = schedule as SessionSchedule;
    const rounds = (raceCalendar as Record<string, string[]>)[String(s.year)] ?? [];
    const payload = await runSnapshotCron({ schedule: s, rounds, now: new Date(), force });
    return NextResponse.json(payload);
  } catch (e) {
    console.error("cron snapshot failed", e);
    return NextResponse.json({ error: "snapshot failed" }, { status: 500 });
  }
}
