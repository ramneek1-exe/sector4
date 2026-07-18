// Season calibration chart (M7): a dependency-free, server-rendered inline-SVG chart. ONE
// continuous cumulative top-3 line over ALL scored rounds; the pre-launch (reconstructed) segment
// is faded and the live segment is solid with markers, the two sharing the boundary point so the
// line is continuous. A dashed muted line shows 1 - Brier on the same 0..1 axis (higher =
// better-calibrated). X-axis = round numbers, thinned as rounds accumulate. The HEADLINE stats
// (elsewhere) count live races only; this line is a whole-season trend. Reveal is pure CSS
// (globals.css), gated by prefers-reduced-motion. No client JS.
import type { CumulativePoint } from "@/app/lib/calibration";
import { plotPoints, yLevel, labelStride, type ChartPad } from "@/app/lib/chart-path";

const W = 640;
const H = 240;
const PAD: ChartPad = { top: 16, right: 44, bottom: 30, left: 34 };
const LEVELS = [0, 0.5, 1];
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function CalibrationChart({ all }: { all: CumulativePoint[] }) {
  const total = all.length;
  if (total < 2) return null;

  const pts = plotPoints(all.map((p) => p.top3Rate), all.map((_, i) => i), total, W, H, PAD);
  const brierPts = plotPoints(all.map((p) => 1 - p.meanBrier), all.map((_, i) => i), total, W, H, PAD);
  const toStr = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");

  // Split the single line into a faded pre-launch sub-path and a solid live sub-path that share the
  // boundary point (continuous). Pre-launch rounds precede live rounds in calendar order.
  let firstLiveIdx = all.findIndex((p) => !p.reconstructed);
  if (firstLiveIdx === -1) firstLiveIdx = total; // no live rounds -> everything faded
  const fadedPts = firstLiveIdx > 0 ? pts.slice(0, firstLiveIdx + 1) : [];
  const solidPts = firstLiveIdx < total ? pts.slice(firstLiveIdx) : [];
  const markers = pts.filter((_, i) => !all[i].reconstructed);
  const lastPt = pts[total - 1];
  const stride = labelStride(total);

  return (
    <figure className="mt-6">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cumulative top-3 hit rate across all rounds (pre-launch rounds faded, live rounds solid) and Brier score"
        className="w-full"
      >
        {LEVELS.map((lv) => {
          const y = yLevel(lv, H, PAD);
          return (
            <g key={lv} className="chart-fade">
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} className="stroke-ink/10" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" className="fill-muted font-grotesk" fontSize={10}>
                {pct(lv)}
              </text>
            </g>
          );
        })}

        {/* Brier (dashed, all rounds, fades in) */}
        <polyline
          points={toStr(brierPts)}
          fill="none"
          className="stroke-muted chart-fade"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.5}
        />

        {/* single continuous top-3 line: faded pre-launch sub-path + solid live sub-path */}
        {fadedPts.length >= 2 && (
          <polyline
            points={toStr(fadedPts)}
            fill="none"
            pathLength={1}
            className="stroke-muted chart-draw chart-draw--testing"
            strokeWidth={2}
            opacity={0.4}
          />
        )}
        {solidPts.length >= 2 && (
          <polyline
            points={toStr(solidPts)}
            fill="none"
            pathLength={1}
            className="stroke-accent chart-draw"
            strokeWidth={2.5}
          />
        )}
        {markers.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r={4} className="fill-accent chart-fade" />
        ))}

        {/* endpoint value = final all-rounds cumulative */}
        {lastPt && (
          <text
            x={Math.min(lastPt.x + 6, W - 2)}
            y={lastPt.y - 6}
            textAnchor="end"
            className="fill-ink font-grotesk chart-fade"
            fontSize={11}
            fontWeight={600}
          >
            {pct(all[total - 1].top3Rate)}
          </text>
        )}

        {/* x-axis: round numbers, thinned; live rounds always labeled */}
        {all.map((p, i) => {
          if (p.reconstructed && i % stride !== 0) return null;
          return (
            <text
              key={p.gp}
              x={pts[i].x}
              y={H - 10}
              textAnchor="middle"
              className="fill-muted font-grotesk chart-fade"
              fontSize={10}
              opacity={p.reconstructed ? 0.5 : 1}
            >
              {`R${p.round}`}
            </text>
          );
        })}
      </svg>

      <figcaption className="mt-2 flex flex-wrap gap-4 font-grotesk text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-accent" /> live top-3 (cumulative)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-muted opacity-40" /> pre-launch (not counted)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-muted opacity-60" /> Brier (higher = better-calibrated)
        </span>
      </figcaption>
    </figure>
  );
}
