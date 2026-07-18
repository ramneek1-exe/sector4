// One-off backfill / re-issue of a weekend snapshot for an EXPLICIT gp + checkpoint — for a
// race the scheduled daily cron never captured (e.g. a checkpoint missed during a firefight,
// or a round that predates a schedule roll). Not on any cron; call it manually. Auth-gated
// exactly like the cron (Bearer CRON_SECRET). Writes to the same Blob store the cron and
// /weekend read, so a snapshot written here (even from a preview deploy) is visible to prod.
//
//   curl "https://<deploy>/api/admin/snapshot?gp=Great%20Britain&checkpoint=final" \
//        -H "Authorization: Bearer $CRON_SECRET"
//
// NOTE: the podium/pace/strategy are rebuilt from CURRENT bundled data (issuedAt = now), so
// this is a post-hoc reconstruction, not the call frozen live during that weekend.
import { NextResponse } from "next/server";
import schedule from "@/app/data/weekend-schedule.json";
import { writeWeekendSnapshot } from "@/app/lib/snapshot-write";
import type { Checkpoint } from "@/app/lib/snapshot";

export const dynamic = "force-dynamic";

const CHECKPOINTS: Checkpoint[] = ["pre-quali", "post-quali", "final"];

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const gp = url.searchParams.get("gp")?.trim();
  if (!gp) {
    return NextResponse.json({ error: "gp query param is required" }, { status: 400 });
  }
  const checkpoint = (url.searchParams.get("checkpoint") ?? "final") as Checkpoint;
  if (!CHECKPOINTS.includes(checkpoint)) {
    return NextResponse.json(
      { error: `checkpoint must be one of: ${CHECKPOINTS.join(", ")}` },
      { status: 400 },
    );
  }
  const year = Number(url.searchParams.get("year") ?? (schedule as { year: number }).year);
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "year must be a number" }, { status: 400 });
  }
  // Backfill defaults to overwrite (that's the point); pass force=0 to respect idempotency.
  const force = !["0", "false"].includes(url.searchParams.get("force") ?? "1");
  // Admin backfills are post-hoc by default (reconstructed=true). Pass reconstructed=0 to write a
  // snapshot as LIVE (unflagged) -- used to correct a beta-era race whose final was backfilled
  // (e.g. Great Britain: forecast live, but its final snapshot was an admin backfill).
  const reconstructed = !["0", "false"].includes(url.searchParams.get("reconstructed") ?? "1");

  try {
    const result = await writeWeekendSnapshot(year, gp, checkpoint, { force, reconstructed });
    return NextResponse.json({ ...result, year, gp });
  } catch (e) {
    console.error("admin snapshot failed", e);
    return NextResponse.json({ error: "snapshot failed" }, { status: 500 });
  }
}
