// The issued artifact (M5): this weekend's frozen predictions, read from the latest Blob
// snapshot — NOT live per-request, so testers see exactly what was frozen at the
// checkpoint. Content rises in via a one-shot reveal and is nested between two blue ASCII
// fog strips. Fun facts are a curated stopgap; M6 replaces them with the entity-what pipeline.
import schedule from "@/app/data/weekend-schedule.json";
import { getJson } from "@/app/lib/blob";
import { latestKey, type WeekendSnapshot } from "@/app/lib/snapshot";
import { AsciiFog } from "@/app/components/AsciiFog";
import { AsciiGlyph } from "@/app/components/AsciiGlyph";
import { BAND_TEXT } from "@/app/lib/bands";
import { driverName } from "@/app/lib/glyph";
import { getCircuitFacts, getCircuitName } from "@/app/lib/circuit-facts";

export const dynamic = "force-dynamic";

const CHECKPOINT_LABEL: Record<string, string> = {
  "pre-quali": "Issued Friday, pre-qualifying",
  "post-quali": "Sharpened Saturday, post-qualifying",
  final: "Final, race complete",
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

const SHELL = "mx-auto max-w-3xl px-6 pb-12 pt-20";
const SECTION_LABEL =
  "mb-3 font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted";

/** Two blue ASCII fog strips flanking the content, fading toward the centre. */
function SideFog() {
  return (
    <>
      {/* Desktop: animated ASCII fog in the gutters. Hidden on mobile — a fixed canvas
          repaints on every mobile address-bar resize, which glitches during scroll. */}
      <div
        aria-hidden
        className="weekend-fog-left pointer-events-none fixed inset-y-0 left-0 -z-10 hidden w-[max(1.75rem,calc((100vw-48rem)/2))] sm:block"
      >
        <AsciiFog className="h-full w-full" />
      </div>
      <div
        aria-hidden
        className="weekend-fog-right pointer-events-none fixed inset-y-0 right-0 -z-10 hidden w-[max(1.75rem,calc((100vw-48rem)/2))] sm:block"
      >
        <AsciiFog className="h-full w-full" />
      </div>
      {/* Mobile: a static CSS inner-glow on each edge — sticky, no canvas, no scroll
          glitch. Runs past the bottom of the screen (h > viewport) so it never cuts off. */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 -z-10 h-[130vh] w-10 bg-gradient-to-r from-[#1e3fd0]/15 to-transparent sm:hidden"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed right-0 top-0 -z-10 h-[130vh] w-10 bg-gradient-to-l from-[#1e3fd0]/15 to-transparent sm:hidden"
      />
    </>
  );
}

export default async function WeekendPage() {
  const snap = await getJson<WeekendSnapshot>(latestKey(schedule.year, schedule.gp));

  // After the race (Monday onwards — ~18h past the Sunday `final`), stop showing the
  // finished weekend and look forward to the next round, even if its snapshot still
  // exists in Blob. `nextGp` bridges the gap until the owner rolls weekend-schedule.json
  // to the next race (after which the no-snapshot branch takes over for the new gp).
  const concluded = Date.now() > new Date(schedule.final).getTime() + 18 * 3600 * 1000;

  if (!snap || concluded) {
    const upcomingGp = concluded ? schedule.nextGp ?? schedule.gp : schedule.gp;
    const upcomingFacts = getCircuitFacts(upcomingGp);
    return (
      <>
        <SideFog />
        <main className={`legible weekend-reveal relative z-10 ${SHELL}`}>
          <p className="font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            Next up
          </p>
          <h1 className="mt-4 font-pixel text-5xl leading-[1.05] tracking-tight sm:text-6xl">
            We&apos;re still setting up our garage at {getCircuitName(upcomingGp)}…
          </h1>
          <p className="mt-4 font-grotesk text-base text-muted">Check back Saturday.</p>

          {upcomingFacts.length > 0 && (
            <section className="mt-12">
              <h2 className={SECTION_LABEL}>About {upcomingGp}</h2>
              <ul className="space-y-3 font-pixel-serif text-lg leading-relaxed">
                {upcomingFacts.map((f) => (
                  <li key={f} className="border-l-2 border-ink/15 pl-3">
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </>
    );
  }

  const podium = (snap.podium ?? {}) as Podium;
  const strategy = (snap.strategy ?? {}) as Strategy;
  const pace = (snap.pace ?? {}) as Pace;
  const facts = getCircuitFacts(snap.gp);
  const drivers = (podium.drivers ?? []).slice(0, 10);

  return (
    <>
      <SideFog />
      <main className={`legible weekend-reveal relative z-10 ${SHELL}`}>
        <header className="mb-8">
          <h1 className="font-pixel-serif text-6xl tracking-tight">
            {snap.gp} Grand Prix {snap.year}
          </h1>
          <p className="mt-1 font-grotesk text-sm text-muted">
            {CHECKPOINT_LABEL[snap.checkpoint] ?? snap.checkpoint} ·{" "}
            {new Date(snap.issuedAt).toUTCString()}
          </p>
        </header>

        <section className="mb-10">
          <h2 className={SECTION_LABEL}>
            Podium odds{podium.mode ? ` · ${podium.mode}` : ""}
          </h2>
          {drivers.length > 0 ? (
            <table className="w-full border-collapse font-grotesk text-sm">
              <thead>
                <tr className="border-b border-ink/15 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="py-2 pr-2 font-medium"></th>
                  <th className="py-2 pr-3 font-medium">Driver</th>
                  <th className="hidden py-2 pr-3 font-medium sm:table-cell">Team</th>
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
                      <span className="hidden text-muted sm:inline">{driverName(d.driver)}</span>
                    </td>
                    <td className="hidden py-2 pr-3 align-middle text-muted sm:table-cell">{d.team ?? ""}</td>
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
            <h2 className={SECTION_LABEL}>Strategy</h2>
            <p>
              Likely a {strategy.dominant.n_stops}-stop race (
              {Math.round(strategy.dominant.share * 100)}% of the field).
            </p>
            {strategy.sc_caveat && <p className="mt-1 text-sm text-muted">{strategy.sc_caveat}</p>}
          </section>
        )}

        {pace.drivers && pace.drivers.length > 0 && (
          <section className="mb-10">
            <h2 className={SECTION_LABEL}>
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
            <h2 className={SECTION_LABEL}>About {snap.gp}</h2>
            <ul className="space-y-3 font-pixel-serif text-lg leading-relaxed">
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
    </>
  );
}
