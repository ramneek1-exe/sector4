import { resolveGlyph } from "@/app/lib/glyph";
import { HELMET_VIEWBOX, SHELL, VENT, VISOR, VISOR_FILL } from "@/app/lib/helmet";

// Plain vector helmet glyph. Paths live in app/lib/helmet.ts so the ASCII
// renderer (AsciiGlyph) can rasterise the exact same shapes. No likeness, no
// marks — shapes + team colour only (PRD §8).
//
// When `onGlyphClick` + `ariaLabel` are provided (set by AsciiGlyph when a
// driver entity-what exists), the glyph is wrapped in an accessible button
// that opens the popover. Otherwise it renders as a plain presentational
// element (no dead affordance when no what exists).
export function DriverGlyph({
  code,
  team,
  size = 56,
  onGlyphClick,
  ariaLabel,
}: {
  code: string;
  team: string | null;
  size?: number;
  onGlyphClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
}) {
  const g = resolveGlyph(code, team);
  const { w, h } = HELMET_VIEWBOX;
  const svg = (
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

  if (onGlyphClick && ariaLabel) {
    return (
      <button
        type="button"
        onClick={onGlyphClick}
        aria-label={ariaLabel}
        className="cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/60"
      >
        {svg}
      </button>
    );
  }
  return svg;
}
