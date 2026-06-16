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
        {/* shell: rounded dome + chin bar (visor faces right) */}
        <path
          d="M50 16 C74 16 88 34 88 54 C88 63 83 68 74 68 L74 70 C80 73 79 82 69 83 L40 83 C24 83 14 69 14 52 C14 31 28 16 50 16 Z"
          fill={g.helmetFill}
        />
        {/* secondary-color brow stripe above the visor (team accent) */}
        <path d="M30 33 C44 27 60 27 74 33 L74 39 C60 33 44 33 30 39 Z" fill={g.accent} opacity={0.9} />
        {/* visor opening — a DARK window, the silhouette's key cue */}
        <rect x="52" y="38" width="40" height="13" rx="6" fill="#0B1020" opacity={0.62}
              transform="rotate(-4 72 44)" />
        {/* personal number on the shell, left of the visor */}
        {g.number !== null && (
          <text
            x="36"
            y="44"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="var(--font-grotesk)"
            fontSize="22"
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
