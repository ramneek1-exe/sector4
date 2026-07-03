// Cumulative season calibration chart (M7): a dependency-free inline-SVG line chart.
// Primary solid line = cumulative top-3 hit rate (0..1, the headline metric). Secondary
// dashed line = cumulative Brier plotted on the same true 0..1 axis as 1 - meanBrier, so a
// HIGHER line means a LOWER (better) Brier. Server-renderable, static (no motion), theme-token colors.
import type { CumulativePoint } from "@/app/lib/calibration";
import { buildLinePath } from "@/app/lib/chart-path";

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 30, left: 16 };

const shortGp = (gp: string) => (gp.length > 6 ? gp.slice(0, 3).toUpperCase() : gp);

export function CalibrationChart({ series }: { series: CumulativePoint[] }) {
  if (series.length < 2) return null;

  const top3Points = buildLinePath(series.map((p) => p.top3Rate), W, H, PAD);
  const brierPoints = buildLinePath(series.map((p) => 1 - p.meanBrier), W, H, PAD);

  const innerW = W - PAD.left - PAD.right;
  const xAt = (i: number) =>
    PAD.left + (series.length <= 1 ? innerW / 2 : (innerW * i) / (series.length - 1));

  return (
    <figure className="mt-6">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cumulative season calibration by round: top-3 hit rate and Brier score"
        className="w-full"
      >
        <line
          x1={PAD.left}
          y1={H - PAD.bottom}
          x2={W - PAD.right}
          y2={H - PAD.bottom}
          className="stroke-ink/15"
          strokeWidth={1}
        />
        <polyline
          points={brierPoints}
          fill="none"
          className="stroke-muted"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.6}
        />
        <polyline points={top3Points} fill="none" className="stroke-accent" strokeWidth={2.5} />
        {series.map((p, i) => (
          <text
            key={p.round}
            x={xAt(i)}
            y={H - 12}
            textAnchor="middle"
            className="fill-muted font-grotesk"
            fontSize={10}
          >
            {shortGp(p.gp)}
          </text>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 font-grotesk text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-accent" /> top-3 hit rate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-muted opacity-60" /> Brier (lower is
          better)
        </span>
      </figcaption>
    </figure>
  );
}
