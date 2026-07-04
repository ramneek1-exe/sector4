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
  // `?force=1` overwrites an existing snapshot for the due checkpoint (used to re-issue
  // after a data fix). Still auth-gated; without it the job stays idempotent.
  const force = ["1", "true"].includes(new URL(req.url).searchParams.get("force") ?? "");
  try {
    return await run(force);
  } catch (e) {
    console.error("cron snapshot failed", e);
    return NextResponse.json({ error: "snapshot failed" }, { status: 500 });
  }
}

async function run(force = false) {
  const s = schedule as SessionSchedule;
  const due = dueCheckpoint(new Date(), s);
  if (!due) return NextResponse.json({ status: "no checkpoint due" });

  const key = snapshotKey(s.year, s.gp, due);
  if (!force && (await getJson<WeekendSnapshot>(key))) {
    return NextResponse.json({ status: "already snapshotted", checkpoint: due });
  }

  const snap = await buildSnapshot(s.year, s.gp, due);

  if (due === "final") {
    const actualFinish = await getActualFinish(s.year, s.gp);
    snap.actuals = actualFinish;
    if (actualFinish.length > 0) {
      const idxKey = seasonIndexKey(s.year);
      const idx = (await getJson<unknown[]>(idxKey)) ?? [];
      // Idempotent: never double-count a gp in the calibration index (matters when
      // `force` re-runs a final snapshot that was already scored).
      if (!idx.some((r) => (r as { gp?: string }).gp === s.gp)) {
        const cal = computeCalibrationRow(
          snap.podium as { drivers: { driver: string; p_podium: number }[] },
          actualFinish,
        );
        idx.push({ gp: s.gp, issuedAt: snap.issuedAt, ...cal });
        await putJson(idxKey, idx);
      }
    }
  }

  await putJson(key, snap);
  await putJson(latestKey(s.year, s.gp), snap);
  return NextResponse.json({ status: "snapshotted", checkpoint: due, forced: force });
}
