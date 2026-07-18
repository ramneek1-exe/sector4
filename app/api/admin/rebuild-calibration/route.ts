// One-shot atomic rebuild of the season calibration index from the final snapshots — for
// recovery after the index is corrupted or a snapshot's reconstructed flag is re-stamped. The
// daily cron also rebuilds every fire; this is the on-demand handle. Auth-gated like the other
// admin routes (Bearer CRON_SECRET). Writes seasonIndexKey in a single putJson.
//
//   curl "https://<deploy>/api/admin/rebuild-calibration" -H "Authorization: Bearer $CRON_SECRET"
import { NextResponse } from "next/server";
import raceCalendar from "@/src/race_calendar.json";
import schedule from "@/app/data/weekend-schedule.json";
import { rebuildCalibrationIndex } from "@/app/lib/calibration-index";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? (schedule as { year: number }).year);
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "year must be a number" }, { status: 400 });
  }
  const rounds = (raceCalendar as Record<string, string[]>)[String(year)] ?? [];
  try {
    const result = await rebuildCalibrationIndex(year, rounds);
    return NextResponse.json({ ...result, year });
  } catch (e) {
    console.error("admin rebuild-calibration failed", e);
    return NextResponse.json({ error: "rebuild failed" }, { status: 500 });
  }
}
