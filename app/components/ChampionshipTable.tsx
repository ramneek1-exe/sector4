"use client";

// The championship picture: season standings, gap to the leader, and the rate that gap
// demands per remaining round. Pure arithmetic (app/lib/championship.ts) rendered through
// the site's existing table language and abstract glyph system — no new visual vocabulary,
// no model, nothing to calibrate. See
// docs/superpowers/specs/2026-07-25-championship-picture-design.md.

import { useState } from "react";
import teams from "@/app/data/teams.json";
import { AsciiGlyph } from "@/app/components/AsciiGlyph";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";
import { driverName } from "@/app/lib/glyph";
import { gpLabel } from "@/app/lib/circuits";
import {
  driverStandings,
  teamStandings,
  visibleDriverRows,
  type Standing,
  type StandingsFile,
} from "@/app/lib/championship";

type View = "drivers" | "constructors";
type TeamInfo = { primary: string; secondary: string };

const SECTION_LABEL =
  "mb-3 font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted";

// The single most important correctness detail in this feature: the leader keeps scoring
// too, so "needs X a round" is a false statement about the world -- only the out-scoring
// form is true. Exported (rather than inlined in JSX) so a test can pin the wording and
// fail if a future edit drifts back to the false short form.
export const RATE_HEADER_LABEL = "Must out-score leader by / round";

/** Gap cell text: an em dash for the leader (0 gap), else the deficit. Pure, tested. */
export function gapCellText(gap: number): string {
  return gap === 0 ? "—" : `-${gap}`;
}

/**
 * Rate cell text. Branches on `gap` FIRST: `requiredRate` is null both for the leader and
 * for every row once the season is over (remainingRounds === 0), so branching on the rate
 * first would mislabel a finished, non-leader row "leader". Only a true 0 gap reads "leader".
 */
export function rateCellText(r: Pick<Standing, "gap" | "requiredRate">): string {
  if (r.gap === 0) return "leader";
  if (r.requiredRate === null) return "—";
  return `+${r.requiredRate}`;
}

/**
 * The season standings table + drivers/constructors toggle — the only client state in this
 * section. Drivers render through the existing helmet glyph (AsciiGlyph) + personal number +
 * three-letter code, coloured by the driver's current team via `file.driverTeams` (each
 * driver's most-recent team this season); a driver missing from that optional map (older
 * emitter, or genuinely unknown) still renders with correct identity, just the glyph's own
 * neutral-grey "unknown team" fallback (app/lib/glyph.ts) rather than being skipped.
 * Constructors render through the existing generic car silhouette (AsciiEmblem) in team
 * colour from teams.json. Both are the same abstract glyph system used everywhere else on
 * the page (PRD §8) -- no new glyph code.
 */
export function ChampionshipTable({ file }: { file: StandingsFile }) {
  const [view, setView] = useState<View>("drivers");
  const rows = view === "drivers" ? driverStandings(file) : teamStandings(file);
  const visibleRows = view === "drivers" ? visibleDriverRows(rows) : rows;

  return (
    <section className="mb-10" aria-labelledby="championship-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="championship-heading" className={`${SECTION_LABEL} m-0`}>
          Championship
        </h2>
        <div role="group" aria-label="Championship view" className="flex gap-2">
          {(["drivers", "constructors"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded-full border px-3 py-1 font-grotesk text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                view === v
                  ? "border-accent bg-accent text-white"
                  : "border-ink/15 bg-white text-ink hover:border-ink/30"
              }`}
            >
              {v === "drivers" ? "Drivers" : "Constructors"}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 font-grotesk text-sm text-muted">
        {/* gpLabel, not the raw key: `throughGp` is the short calendar key ("Hungary"), and
            most GP names are adjectival, so "${key} Grand Prix" would read "Hungary Grand
            Prix" / "Australia Grand Prix". gpLabel maps those and falls through for the
            place-named ones (Monaco, Miami) that already read correctly. */}
        {`After the ${gpLabel(file.throughGp)} Grand Prix · ${file.remainingRounds} of ${file.totalRounds} rounds remaining`}
      </p>

      <table className="w-full border-collapse font-grotesk text-sm">
        <thead>
          <tr className="border-b border-ink/15 text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">{view === "drivers" ? "Driver" : "Team"}</th>
            <th className="py-2 pr-3 text-right font-medium">Points</th>
            <th className="py-2 pr-3 text-right font-medium">Gap</th>
            {/* Never "needs / round" -- the leader scores too, so that phrasing is false. */}
            <th className="py-2 text-right font-medium">{RATE_HEADER_LABEL}</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r, i) => (
            <tr key={r.key} className={i % 2 ? "bg-ink/[0.03]" : ""}>
              <th scope="row" className="py-2 pr-3 align-middle font-normal">
                {view === "drivers" ? (
                  <div className="flex items-center gap-2">
                    <AsciiGlyph code={r.key} team={file.driverTeams?.[r.key] ?? null} size={40} />
                    <span>
                      <span className="font-bold tracking-wide">{r.key}</span>{" "}
                      <span className="hidden text-muted sm:inline">{driverName(r.key)}</span>
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {/* 96, not the 40 used by the driver helmet beside it. AsciiEmblem derives
                        its sampling grid as size / DEFAULT_CELL_PX (2), and the car silhouette
                        is 144x31 — so size 40 sampled it at 20x4 cells, a four-pixel-tall blob
                        with no readable nose, cockpit or wing. 96 samples at 48x10, which reads
                        as an F1 car while still standing only ~21px tall, so the row height is
                        essentially unchanged. A helmet is square and survives 40; a car is not. */}
                    <AsciiEmblem
                      kind="car"
                      color={(teams as Record<string, TeamInfo>)[r.key]?.primary}
                      size={96}
                    />
                    <span className="font-bold tracking-wide">{r.key}</span>
                  </div>
                )}
              </th>
              <td className="py-2 pr-3 text-right align-middle tabular-nums">{r.points}</td>
              <td className="py-2 pr-3 text-right align-middle tabular-nums">
                {gapCellText(r.gap)}
              </td>
              <td className="py-2 text-right align-middle tabular-nums">{rateCellText(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
