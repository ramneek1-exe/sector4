import { resolveGlyph } from "@/app/lib/glyph";
import { HELMET_VIEWBOX, SHELL, VENT, VISOR, VISOR_FILL } from "@/app/lib/helmet";

// Plain vector helmet glyph. Paths live in app/lib/helmet.ts so the ASCII
// renderer (AsciiGlyph) can rasterise the exact same shapes. No likeness, no
// marks — shapes + team colour only (PRD §8).
export function DriverGlyph({
  code,
  team,
  size = 56,
}: {
  code: string;
  team: string | null;
  size?: number;
}) {
  const g = resolveGlyph(code, team);
  const { w, h } = HELMET_VIEWBOX;
  return (
    <svg
      width={size}
      height={Math.round((size * h) / w)}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`${code} helmet`}
    >
      <path d={SHELL} fill={g.helmetFill} />
      <path d={VISOR} fill={VISOR_FILL} />
      <path d={VENT} fill={g.accent} />
      {g.number !== null && (
        <text
          x="265"
          y="330"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="var(--font-grotesk)"
          fontSize="190"
          fontWeight="800"
          fill={g.numberColor}
        >
          {g.number}
        </text>
      )}
    </svg>
  );
}
