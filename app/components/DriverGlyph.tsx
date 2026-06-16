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
        {/* shell */}
        <path
          d="M52 20 C75 20 88 35 88 55 C88 66 83 72 73 73 L41 73 C26 73 14 62 14 47 C14 31 30 20 52 20 Z"
          fill={g.helmetFill}
        />
        {/* visor opening (faces right) */}
        <path d="M50 41 C66 39 82 42 90 49 C82 55 66 56 50 53 Z" fill={g.accent} opacity={0.92} />
        {/* chin bar */}
        <path d="M41 73 L73 73 C70 80 60 83 50 82 C45 81 42 78 41 73 Z" fill={g.accent} opacity={0.5} />
        {/* personal number on the shell */}
        {g.number !== null && (
          <text
            x="40"
            y="40"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="var(--font-grotesk)"
            fontSize="26"
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
