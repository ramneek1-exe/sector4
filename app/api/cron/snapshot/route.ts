// Schedule-aware, idempotent snapshot job (M5). Vercel Cron hits this DAILY (Hobby plan
// allows only daily crons; 0 6 * * *). `dueCheckpoint` returns the latest checkpoint
// whose time has passed, so for a conventional weekend (checkpoints ~23h apart) a single
// daily fire still lands each one in-window; idempotency (snapshot already exists) makes
// extra fires no-ops. Snapshots the live runtime predictions to Blob, and on the final
// checkpoint pulls the actual finishing order to score the podium into the calibration
// record. (For tighter timing / clustered sprint weekends: Pro plan or drive snapshots
// from the GitHub Actions job — R17.)
import { NextResponse } from "next/server";
import schedule from "@/app/data/weekend-schedule.json";
import { dueCheckpoint, type SessionSchedule } from "@/app/lib/weekend-schedule";
import { buildSnapshot } from "@/app/lib/build-snapshot";
import { putJson, getJson } from "@/app/lib/blob";
import {
  snapshotKey,
  latestKey,
  seasonIndexKey,
  type WeekendSnapshot,
} from "@/app/lib/snapshot";
import { computeCalibrationRow } from "@/app/lib/actuals";

export const dynamic = "force-dynamic";

function selfBase(): string {
  const host = process.env.VERCEL_URL ?? process.env.SELF_BASE_URL;
  if (!host) return "";
  return host.startsWith("http") ? host : `https://${host}`;
}

async function getActualFinish(year: number, gp: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${selfBase()}/api/results?year=${year}&gp=${encodeURIComponent(gp)}`,
      { cache: "no-store" },
    );
    return res.ok ? ((await res.json()).finishOrder ?? []) : [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; reject anything else.
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return await run();
  } catch (e) {
    // TEMP diagnostic (force-test): surface the failure instead of a blank 500.
    return NextResponse.json(
      { error: "snapshot failed", detail: String(e), hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN },
      { status: 500 },
    );
  }
}

async function run() {
  const s = schedule as SessionSchedule;
  const due = dueCheckpoint(new Date(), s);
  if (!due) return NextResponse.json({ status: "no checkpoint due" });

  const key = snapshotKey(s.year, s.gp, due);
  if (await getJson<WeekendSnapshot>(key)) {
    return NextResponse.json({ status: "already snapshotted", checkpoint: due });
  }

  const snap = await buildSnapshot(s.year, s.gp, due);

  if (due === "final") {
    const actualFinish = await getActualFinish(s.year, s.gp);
    snap.actuals = actualFinish;
    if (actualFinish.length > 0) {
      const cal = computeCalibrationRow(
        snap.podium as { drivers: { driver: string; p_podium: number }[] },
        actualFinish,
      );
      const idxKey = seasonIndexKey(s.year);
      const idx = (await getJson<unknown[]>(idxKey)) ?? [];
      idx.push({ gp: s.gp, issuedAt: snap.issuedAt, ...cal });
      await putJson(idxKey, idx);
    }
  }

  await putJson(key, snap);
  await putJson(latestKey(s.year, s.gp), snap);
  return NextResponse.json({ status: "snapshotted", checkpoint: due });
}
