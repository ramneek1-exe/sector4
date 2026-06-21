// The issued artifact (M5): this weekend's frozen predictions, read from the latest
// Blob snapshot — NOT live per-request, so testers see exactly what was frozen at the
// checkpoint. Functional first; reusing the full glyph cards + grounded narratives is a
// tracked polish follow-up. All motion-free (static server render).
import schedule from "@/app/data/weekend-schedule.json";
import { getJson } from "@/app/lib/blob";
import { latestKey, type WeekendSnapshot } from "@/app/lib/snapshot";

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

export default async function WeekendPage() {
  const snap = await getJson<WeekendSnapshot>(latestKey(schedule.year, schedule.gp));

  if (!snap) {
    return (
      <main className="legible" style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <h1>{schedule.gp} Grand Prix {schedule.year}</h1>
        <p className="text-muted">
          No prediction issued yet — check back after Friday practice.
        </p>
      </main>
    );
  }

  const podium = (snap.podium ?? {}) as Podium;
  const strategy = (snap.strategy ?? {}) as Strategy;
  const pace = (snap.pace ?? {}) as Pace;

  return (
    <main className="legible" style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>{snap.gp} Grand Prix {snap.year}</h1>
        <p className="text-muted">
          {CHECKPOINT_LABEL[snap.checkpoint] ?? snap.checkpoint} ·{" "}
          {new Date(snap.issuedAt).toUTCString()}
        </p>
      </header>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>Podium odds{podium.mode ? ` · ${podium.mode}` : ""}</h2>
        {podium.drivers && podium.drivers.length > 0 ? (
          <ol>
            {podium.drivers.slice(0, 6).map((d) => (
              <li key={d.driver}>
                <strong>{d.driver}</strong>
                {d.team ? ` · ${d.team}` : ""} — {d.band}
                {typeof d.p_podium === "number" ? ` (p≈${d.p_podium})` : ""}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted">{podium.reason ?? "Not enough data yet."}</p>
        )}
      </section>

      {strategy.dominant && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2>Strategy</h2>
          <p>
            Likely a {strategy.dominant.n_stops}-stop race ({Math.round(strategy.dominant.share * 100)}%
            of the field).
          </p>
          {strategy.sc_caveat && <p className="text-muted">{strategy.sc_caveat}</p>}
        </section>
      )}

      {pace.drivers && pace.drivers.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2>Long-run pace (supporting context, not a result)</h2>
          <ol>
            {pace.drivers.slice(0, 6).map((d) => (
              <li key={d.driver}>
                <strong>{d.driver}</strong> — {d.pace_delta_s}s
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-muted" style={{ fontSize: "0.85rem" }}>{snap.calibrationNote}</p>
    </main>
  );
}
