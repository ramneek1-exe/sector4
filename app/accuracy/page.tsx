// /accuracy (M7): the season "track record" page. Makes the "calibration improves as the
// season accumulates" thesis visible. Reads the Blob season calibration index (written by
// the cron), summarizes it, and renders our own scored podium record. Display-only: no
// %-flip, no baseline. Server component; reads live Blob so it is force-dynamic.
import Link from "next/link";
import scheduleData from "@/app/data/weekend-schedule.json";
import { getJson } from "@/app/lib/blob";
import { seasonIndexKey, snapshotKey, type WeekendSnapshot } from "@/app/lib/snapshot";
import { summarize, raceDetail, type CalibrationRow, type RaceDetail } from "@/app/lib/calibration";
import { CalibrationChart } from "@/app/components/CalibrationChart";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accuracy" };

const YEAR = (scheduleData as { year: number }).year;

interface ScoredRace {
  gp: string;
  detail: RaceDetail | null;
  brier: number;
}

async function loadRaceRows(index: CalibrationRow[]): Promise<ScoredRace[]> {
  return Promise.all(
    index.map(async (r) => {
      const snap = await getJson<WeekendSnapshot>(snapshotKey(YEAR, r.gp, "final"));
      const detail = snap
        ? raceDetail(
            snap.podium as { drivers: { driver: string; p_podium: number }[] } | null,
            snap.actuals as string[] | null,
          )
        : null;
      return { gp: r.gp, detail, brier: r.brierContrib };
    }),
  );
}

export default async function AccuracyPage() {
  const index = (await getJson<CalibrationRow[]>(seasonIndexKey(YEAR))) ?? [];
  const summary = summarize(index);
  const rows = summary.nRaces > 0 ? await loadRaceRows(index) : [];

  return (
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-10 sm:px-8">
      <header className="mb-8 flex items-center gap-3">
        <AsciiEmblem kind="car" size={52} cols={34} className="shrink-0" />
        <div>
          <h1 className="font-pixel-serif text-5xl text-ink sm:text-6xl">Accuracy</h1>
          <p className="mt-2 max-w-prose font-lastik text-muted">
            Every podium we call is scored against the real finish. Here is the {YEAR} record so
            far. We expect it to sharpen as the season accumulates.
          </p>
        </div>
      </header>

      <p className="mb-8 rounded-md border border-ink/10 bg-ink/[0.03] px-4 py-3 font-grotesk text-sm text-muted">
        {summary.status.reason}
      </p>

      {summary.nRaces === 0 ? (
        <p className="font-lastik text-muted">
          No completed rounds scored yet this season. Predictions are issued each weekend and
          scored here after the race.{" "}
          <Link href="/weekend" className="cta-grow text-accent">
            See this weekend&rsquo;s predictions
          </Link>
          .
        </p>
      ) : (
        <>
          <dl className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Races scored" value={String(summary.nRaces)} />
            <Stat
              label="Top-3 hit rate"
              value={`${Math.round(summary.top3Rate * 100)}%`}
              gloss="share of podium places we called correctly"
            />
            <Stat
              label="Brier score"
              value={summary.meanBrier.toFixed(3)}
              gloss="lower is better-calibrated"
            />
          </dl>

          {summary.nRaces >= 3 && <CalibrationChart series={summary.cumulative} />}

          <ol className="mt-8 space-y-3">
            {rows.map((r) => (
              <li key={r.gp} className="rounded-md border border-ink/10 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-grotesk font-semibold text-ink">{r.gp}</span>
                  <span className="font-grotesk text-xs text-muted">Brier {r.brier.toFixed(3)}</span>
                </div>
                {r.detail ? (
                  <div className="mt-2 grid grid-cols-2 gap-4 font-grotesk text-sm">
                    <div>
                      <span className="text-xs uppercase tracking-wide text-muted">Predicted</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {r.detail.predicted.map((d, i) => (
                          <span key={d} className={r.detail!.hits[i] ? "text-accent" : "text-ink/50"}>
                            {d} {r.detail!.hits[i] ? "✓" : "✗"}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide text-muted">Actual</span>
                      <div className="mt-1 flex flex-wrap gap-2 text-ink">
                        {r.detail.actual.map((d) => (
                          <span key={d}>{d}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 font-grotesk text-sm text-muted">
                    Detail unavailable for this round.
                  </p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, gloss }: { label: string; value: string; gloss?: string }) {
  return (
    <div className="rounded-md border border-ink/10 p-4">
      <dt className="font-grotesk text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-grotesk text-3xl text-ink">{value}</dd>
      {gloss && <dd className="mt-1 font-grotesk text-xs text-muted">{gloss}</dd>}
    </div>
  );
}
