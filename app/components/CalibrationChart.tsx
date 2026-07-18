// Cumulative season calibration chart (M7): a dependency-free, server-rendered inline-SVG line
// chart with a y-axis scale, point markers, an endpoint value label, and a faded "pre-launch"
// (reconstructed) series. Primary solid line = cumulative live top-3 hit rate (0..1). Dashed
// line = live Brier as 1 - meanBrier on the SAME 0..1 axis (higher = better-calibrated). Faded
// solid line = pre-launch (testing) top-3, shown for context, NOT counted in the headline.
// Reveal animation is pure CSS (see globals.css), gated by prefers-reduced-motion. No client JS.
import type { CumulativePoint } from "@/app/lib/calibration";
import { buildLinePath, pointCoords, yLevel, type ChartPad } from "@/app/lib/chart-path";

const W = 640;
const H = 240;
const PAD: ChartPad = { top: 16, right: 44, bottom: 30, left: 34 };
const LEVELS = [0, 0.5, 1];

const shortGp = (gp: string) => (gp.length > 6 ? gp.slice(0, 3).toUpperCase() : gp);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function CalibrationChart({
  live,
  testing,
}: {
  live: CumulativePoint[];
  testing: CumulativePoint[];
}) {
  if (live.length < 2 && testing.length < 2) return null;

  const liveTop3 = buildLinePath(live.map((p) => p.top3Rate), W, H, PAD);
  const liveBrier = buildLinePath(live.map((p) => 1 - p.meanBrier), W, H, PAD);
  const testTop3 = buildLinePath(testing.map((p) => p.top3Rate), W, H, PAD);
  const liveMarks = pointCoords(live.map((p) => p.top3Rate), W, H, PAD);
  const last = live.length >= 1 ? live[live.length - 1] : null;
  const lastMark = liveMarks.length ? liveMarks[liveMarks.length - 1] : null;

  return (
    <figure className="mt-6">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cumulative season calibration by round: live top-3 hit rate and Brier score, with pre-launch rounds shown for context"
        className="w-full"
      >
        {/* y-axis gridlines + labels (0 / 50% / 100%) */}
        {LEVELS.map((lv) => {
          const y = yLevel(lv, H, PAD);
          return (
            <g key={lv} className="chart-fade">
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                className="stroke-ink/10"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-muted font-grotesk"
                fontSize={10}
              >
                {pct(lv)}
              </text>
            </g>
          );
        })}

        {/* faded pre-launch (testing) top-3 line -- context only, no markers */}
        {testing.length >= 2 && (
          <polyline
            points={testTop3}
            fill="none"
            pathLength={1}
            className="stroke-muted chart-draw chart-draw--testing"
            strokeWidth={1.5}
            opacity={0.35}
          />
        )}

        {/* live Brier (dashed, fades in -- not line-drawn since dash pattern is in use) */}
        {live.length >= 2 && (
          <polyline
            points={liveBrier}
            fill="none"
            className="stroke-muted chart-fade"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.6}
          />
        )}

        {/* live top-3 (primary, line-drawn) + markers */}
        {live.length >= 2 && (
          <polyline
            points={liveTop3}
            fill="none"
            pathLength={1}
            className="stroke-accent chart-draw"
            strokeWidth={2.5}
          />
        )}
        {liveMarks.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r={3} className="fill-accent chart-fade" />
        ))}

        {/* endpoint value label on the live line */}
        {last && lastMark && (
          <text
            x={Math.min(lastMark.x + 6, W - 2)}
            y={lastMark.y - 6}
            textAnchor="end"
            className="fill-ink font-grotesk chart-fade"
            fontSize={11}
            fontWeight={600}
          >
            {pct(last.top3Rate)}
          </text>
        )}

        {/* x-axis: live round labels */}
        {live.map((p, i) => (
          <text
            key={p.round}
            x={liveMarks[i]?.x ?? 0}
            y={H - 10}
            textAnchor="middle"
            className="fill-muted font-grotesk chart-fade"
            fontSize={10}
          >
            {shortGp(p.gp)}
          </text>
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap gap-4 font-grotesk text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-accent" /> live top-3 hit rate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-muted opacity-60" /> Brier (higher =
          better-calibrated)
        </span>
        {testing.length >= 2 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-muted opacity-40" /> pre-launch (not
            counted)
          </span>
        )}
      </figcaption>
    </figure>
  );
}
