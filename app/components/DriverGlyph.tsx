import { resolveGlyph } from "@/app/lib/glyph";

/**
 * Abstract driver glyph (PRD §8): one shared side-profile helmet (visor right) filled
 * in the team color, the personal number in a contrast-guarded numeral, and the
 * 3-letter code beside it in Space Grotesk. No likeness, no marks — shapes + color only.
 */
export function DriverGlyph({
  code,
  team,
  size = 40,
}: {
  code: string;
  team: string | null;
  size?: number;
}) {
  const g = resolveGlyph(code, team);
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${code} helmet`}>
        {/* full-face shell: rounded dome + forward chin bar (visor faces right) */}
        <path
          d="M22 40 C24 21 42 12 58 14 C75 16 87 28 89 44 C90 52 89 58 86 63 C91 67 90 76 83 78 L60 81 C45 84 29 83 21 75 C13 65 13 49 22 40 Z"
          fill={g.helmetFill}
        />
        {/* team-accent brow stripe over the dome (livery nod / §8 secondary accent) */}
        <path d="M30 33 C44 26 58 26 72 32" fill="none" stroke={g.accent} strokeWidth={4}
              opacity={0.9} strokeLinecap="round" />
        {/* big visor — a dark tinted window, the silhouette's key cue */}
        <path d="M55 34 C72 33 87 41 88 53 C88 60 81 64 69 64 L55 62 C52 53 52 43 55 34 Z" fill="#16233f" />
        {/* mirrored-visor sheen highlight */}
        <path d="M57 38 C69 37 80 42 84 50" fill="none" stroke="#59C8FF" strokeWidth={3}
              opacity={0.6} strokeLinecap="round" />
        {/* personal number centered on the dome side */}
        {g.number !== null && (
          <text
            x="38"
            y="49"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="var(--font-grotesk)"
            fontSize="21"
            fontWeight="700"
            fill={g.numberColor}
          >
            {g.number}
          </text>
        )}
      </svg>
      <span className="font-grotesk text-sm font-semibold tracking-wide text-ink">{g.code}</span>
    </div>
  );
}
