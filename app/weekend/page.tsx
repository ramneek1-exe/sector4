// The issued artifact (M5): this weekend's frozen predictions, read from the latest Blob
// snapshot — NOT live per-request, so testers see exactly what was frozen at the
// checkpoint. Static server render (no client motion). Fun facts are a curated stopgap;
// M6 replaces them with the dynamic entity-what pipeline.
import schedule from "@/app/data/weekend-schedule.json";
import { getJson } from "@/app/lib/blob";
import { latestKey, type WeekendSnapshot } from "@/app/lib/snapshot";
import { AsciiGlyph } from "@/app/components/AsciiGlyph";
import { BAND_TEXT } from "@/app/lib/bands";
import { driverName } from "@/app/lib/glyph";
import { getCircuitFacts } from "@/app/lib/circuit-facts";

export const dynamic = "force-dynamic";

const CHECKPOINT_LABEL: Record<string, string> = {
  "pre-quali": "Issued Friday — pre-qualifying",
  "post-quali": "Sharpened Saturday — post-qualifying",
  final: "Final — race complete",
};

type PodiumDriver = {
  rank?: number;
  driver: string;
  team?: string | null;
  band?: string;
  p_podium?: number;
};
type Podium = { mode?: string; drivers?: PodiumDriver[]; reason?: string };
type Strategy = { dominant?: { n_stops: number; share: number } | null; sc_caveat?: string };
type Pace = { drivers?: { driver: string; pace_delta_s: number }[] };

const SHELL = "mx-auto max-w-3xl px-6 py-12";

export default async function WeekendPage() {
  const snap = await getJson<WeekendSnapshot>(latestKey(schedule.year, schedule.gp));

  if (!snap) {
    return (
      <main className={`legible ${SHELL}`}>
        <h1 className="font-bebas text-5xl tracking-wide">
          {schedule.gp} Grand Prix {schedule.year}
        </h1>
        <p className="mt-4 text-muted">
          No prediction issued yet — check back after Friday practice.
        </p>
      </main>
    );
  }

  const podium = (snap.podium ?? {}) as Podium;
  const strategy = (snap.strategy ?? {}) as Strategy;
  const pace = (snap.pace ?? {}) as Pace;
  const facts = getCircuitFacts(snap.gp);
  const drivers = podium.drivers ?? [];

  return (
    <main className={`legible ${SHELL}`}>
      <header className="mb-8">
        <h1 className="font-bebas text-5xl tracking-wide">
          {snap.gp} Grand Prix {snap.year}
        </h1>
        <p className="mt-1 font-grotesk text-sm text-muted">
          {CHECKPOINT_LABEL[snap.checkpoint] ?? snap.checkpoint} ·{" "}
          {new Date(snap.issuedAt).toUTCString()}
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-4 font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted">
          Podium odds{podium.mode ? ` · ${podium.mode}` : ""}
        </h2>
        {drivers.length > 0 ? (
          <table className="w-full border-collapse font-grotesk text-sm">
            <thead>
              <tr className="border-b border-ink/15 text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium"></th>
                <th className="py-2 pr-3 font-medium">Driver</th>
                <th className="py-2 pr-3 font-medium">Team</th>
                <th className="py-2 pr-3 font-medium">Chance</th>
                <th className="py-2 text-right font-medium">p≈</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d, i) => (
                <tr key={d.driver} className={i % 2 ? "bg-ink/[0.03]" : ""}>
                  <td className="py-2 pr-2 align-middle font-mono text-muted">{d.rank ?? i + 1}</td>
                  <td className="py-1 pr-2 align-middle">
                    <AsciiGlyph code={d.driver} team={d.team ?? null} size={48} />
                  </td>
                  <td className="py-2 pr-3 align-middle">
                    <span className="font-bold tracking-wide">{d.driver}</span>{" "}
                    <span className="text-muted">{driverName(d.driver)}</span>
                  </td>
                  <td className="py-2 pr-3 align-middle text-muted">{d.team ?? ""}</td>
                  <td
                    className={`py-2 pr-3 align-middle font-semibold uppercase tracking-wide ${
                      BAND_TEXT[d.band ?? "outside shot"] ?? BAND_TEXT["outside shot"]
                    }`}
                  >
                    {d.band}
                  </td>
                  <td className="py-2 text-right align-middle font-mono text-muted">
                    {typeof d.p_podium === "number" ? d.p_podium : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">{podium.reason ?? "Not enough data yet."}</p>
        )}
      </section>

      {strategy.dominant && (
        <section className="mb-10">
          <h2 className="mb-3 font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            Strategy
          </h2>
          <p>
            Likely a {strategy.dominant.n_stops}-stop race (
            {Math.round(strategy.dominant.share * 100)}% of the field).
          </p>
          {strategy.sc_caveat && <p className="mt-1 text-sm text-muted">{strategy.sc_caveat}</p>}
        </section>
      )}

      {pace.drivers && pace.drivers.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            Long-run pace{" "}
            <span className="normal-case text-muted">(supporting context, not a result)</span>
          </h2>
          <ol className="font-grotesk text-sm">
            {pace.drivers.slice(0, 6).map((d) => (
              <li key={d.driver} className="py-0.5">
                <span className="font-bold tracking-wide">{d.driver}</span>{" "}
                <span className="text-muted">{d.pace_delta_s}s</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {facts.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            About {snap.gp}
          </h2>
          <ul className="space-y-2 font-lastik text-sm leading-relaxed">
            {facts.map((f) => (
              <li key={f} className="border-l-2 border-ink/15 pl-3">
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted">{snap.calibrationNote}</p>
    </main>
  );
}
