"use client";

// Shader evaluation lab, round 3 (owner feedback): transparent colorBack rendered plain
// white, so layers are now OPAQUE white-backed and stacked with multiply blending (white
// passes through, palette dither accumulates — the AsciiFog fog-on-white treatment). The
// hero panels are pointer-reactive like AsciiFog (pattern shifts toward the cursor +
// speeds up on hover). Helmets/emblems lean to a SINGLE fill colour (no originalColors
// noise) with the crisp numeral overlaid exactly like AsciiGlyph does. Reduced motion ->
// static frame, no pointer reactivity.
import { useEffect, useRef, useState } from "react";
import {
  Dithering,
  ImageDithering,
  type DitheringProps,
} from "@paper-design/shaders-react";
import { AsciiFog } from "@/app/components/AsciiFog";
import { AsciiGlyph } from "@/app/components/AsciiGlyph";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";
import { CardFog } from "@/app/components/CardFog";
import { resolveGlyph } from "@/app/lib/glyph";
import { HELMET_VIEWBOX, NUMBER_POS, helmetSvgMarkup } from "@/app/lib/helmet";
import { emblemSvgMarkup } from "@/app/lib/emblems";

// Brand palette (coolors bee2f0-459ae4-2f2e89-addcef-406cd6-251f44).
const INK = "#251f44";
const ACCENT = "#2f2e89";
const BLUE = "#406cd6";
const SKY = "#459ae4";
const LIGHT = "#addcef";
const WHITE = "#fafafa"; // page surface; multiply-blended layers pass it through

type Variant = {
  label: string;
  layers: Partial<DitheringProps>[]; // white-backed, multiply-stacked over the page
};

// A. Hero candidates: WARP in the AsciiFog treatment (palette fog over white).
const HERO_VARIANTS: Variant[] = [
  {
    label: "warp · blue + sky · 4x4",
    layers: [
      { colorBack: WHITE, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.8 },
      { colorBack: WHITE, colorFront: SKY, shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.55 },
    ],
  },
  {
    label: "warp · accent + blue + light · 4x4",
    layers: [
      { colorBack: WHITE, colorFront: ACCENT, shape: "warp", type: "4x4", size: 2, speed: 0.3, scale: 0.9 },
      { colorBack: WHITE, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.6 },
      { colorBack: WHITE, colorFront: LIGHT, shape: "warp", type: "4x4", size: 3, speed: 0.4, scale: 0.45 },
    ],
  },
  {
    label: "warp · ink + sky (high contrast) · 4x4",
    layers: [
      { colorBack: WHITE, colorFront: INK, shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.75 },
      { colorBack: WHITE, colorFront: SKY, shape: "warp", type: "4x4", size: 2, speed: 0.55, scale: 0.5 },
    ],
  },
];

// C. Card corner-bloom mask (CardFog placement).
const CARD_MASK =
  "radial-gradient(120% 120% at 100% 100%, black 0%, black 35%, transparent 72%)";

// B. Identity: real 2026 driver/team pairs, composed of dither from their own SVG sources.
const GLYPHS: { code: string; team: string }[] = [
  { code: "VER", team: "Red Bull Racing" },
  { code: "NOR", team: "McLaren" },
  { code: "LEC", team: "Ferrari" },
  { code: "RUS", team: "Mercedes" },
];

const svgDataUri = (markup: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** White-backed Dithering layers, multiply-stacked so the palette accumulates over white. */
function DitherLayers({
  layers,
  speedFactor,
  offset,
}: {
  layers: Partial<DitheringProps>[];
  speedFactor: number;
  offset?: { x: number; y: number };
}) {
  return (
    <>
      {layers.map((l, i) => (
        <Dithering
          key={i}
          {...l}
          speed={(l.speed ?? 0.5) * speedFactor}
          offsetX={(l.offsetX ?? 0) + (offset?.x ?? 0) * (i + 1) * 0.5}
          offsetY={(l.offsetY ?? 0) + (offset?.y ?? 0) * (i + 1) * 0.5}
          className="absolute inset-0 h-full w-full"
          style={{ mixBlendMode: "multiply" }}
        />
      ))}
    </>
  );
}

/** Hero panel: pointer-reactive like AsciiFog — the pattern drifts toward the cursor and the
 *  motion speeds up on hover. Reduced motion disables both. */
function DitherHeroPanel({
  variant,
  speedFactor,
}: {
  variant: Variant;
  speedFactor: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);
  const interactive = speedFactor > 0;

  const onMove = (e: React.MouseEvent) => {
    if (!interactive || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setOffset({
      x: ((e.clientX - r.left) / r.width - 0.5) * 0.25,
      y: ((e.clientY - r.top) / r.height - 0.5) * 0.25,
    });
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setOffset({ x: 0, y: 0 });
      }}
      className="relative h-72 overflow-hidden rounded-2xl border border-ink/10 bg-white"
    >
      <DitherLayers
        layers={variant.layers}
        speedFactor={speedFactor * (hover ? 1.6 : 1)}
        offset={offset}
      />
      <HeroContent />
      <PanelLabel>{variant.label}</PanelLabel>
    </div>
  );
}

/** A driver helmet COMPOSED of dither in a SINGLE team fill (no originalColors noise):
 *  ImageDithering maps the helmet SVG silhouette to white/team-colour, and the crisp
 *  numeral is overlaid exactly like AsciiGlyph does (NUMBER_POS, numberColor). Static. */
function DitherHelmet({ code, team, size }: { code: string; team: string | null; size: number }) {
  const g = resolveGlyph(code, team);
  const heightPx = size * (HELMET_VIEWBOX.h / HELMET_VIEWBOX.w);
  const uri = svgDataUri(helmetSvgMarkup(g, false)); // no baked number; overlaid crisp below
  return (
    <div className="relative" style={{ width: size, height: heightPx }}>
      <ImageDithering
        image={uri}
        colorBack={WHITE}
        colorFront={g.helmetFill}
        colorSteps={2}
        type="4x4"
        size={2}
        speed={0}
        style={{ width: size, height: heightPx }}
      />
      {g.number !== null && (
        <span
          className="pointer-events-none absolute select-none"
          style={{
            left: NUMBER_POS.x * size,
            top: NUMBER_POS.y * heightPx,
            transform: "translate(-50%, -50%)",
            color: g.numberColor,
            fontFamily: "Arial, Helvetica, sans-serif",
            fontWeight: 800,
            fontSize: Math.round(NUMBER_POS.size * heightPx),
            lineHeight: 1,
          }}
        >
          {g.number}
        </span>
      )}
    </div>
  );
}

/** The real home-hero moment (h1 + input shell + chip) overlaid on an art background. */
function HeroContent() {
  return (
    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="legible self-center rounded-2xl px-4 py-1 font-pixel-serif text-5xl text-ink">Ask</h1>
      <div className="bar-shell w-full max-w-md">
        <div className="flex h-12 w-full items-center rounded-full border border-ink/15 bg-white px-5 font-grotesk text-sm text-muted shadow-sm">
          What&rsquo;s on your mind this race weekend?
        </div>
      </div>
      <span className="legible rounded-full px-3 py-1 font-grotesk text-xs text-muted">
        Who&rsquo;s likely to podium at the next race?
      </span>
    </div>
  );
}

/** Control card: the existing CardFog bloom, hover-driven like ConceptCard does it. */
function HoverFogCard() {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative overflow-hidden rounded-2xl border border-ink/10 bg-white p-6"
    >
      <CardFog active={hover} />
      <div className="relative z-10">
        <h3 className="font-grotesk font-semibold text-ink">Current CardFog</h3>
        <p className="mt-1 font-lastik text-sm text-muted">The existing bottom-right bloom on hover.</p>
      </div>
    </div>
  );
}

/** Candidate card: warp layers in the hero treatment, masked to CardFog's corner bloom. */
function DitherHoverCard({ speedFactor }: { speedFactor: number }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-ink/10 bg-white p-6">
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ maskImage: CARD_MASK, WebkitMaskImage: CARD_MASK }}
      >
        <DitherLayers
          layers={[
            { colorBack: WHITE, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.8 },
            { colorBack: WHITE, colorFront: SKY, shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.55 },
          ]}
          speedFactor={speedFactor}
        />
      </div>
      <div className="relative z-10">
        <h3 className="font-grotesk font-semibold text-ink">Dither warp bloom</h3>
        <p className="mt-1 font-lastik text-sm text-muted">Same corner placement, warp texture. Hover.</p>
      </div>
    </div>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute bottom-2 left-3 z-20 rounded bg-white/80 px-1.5 py-0.5 font-grotesk text-[10px] uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="font-grotesk text-xs font-semibold uppercase tracking-[0.18em] text-muted">{title}</h2>
      <p className="mt-1 max-w-prose font-lastik text-sm text-muted">{note}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function LabDither() {
  const reduced = useReducedMotion();
  const speedFactor = reduced ? 0 : 1;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-8">
      <header>
        <h1 className="font-pixel-serif text-4xl text-ink">Dither lab</h1>
        <p className="mt-2 max-w-prose font-lastik text-muted">
          Round 3: multiply-stacked palette warp (white-out fixed), pointer-reactive hero,
          single-fill dither glyphs with crisp numerals. Unlinked test page: nothing here ships.
        </p>
      </header>

      <Section
        title="A · Hero swap"
        note="Control is the current AsciiFog (cursor brightens the field). Candidates are warp in the same palette-on-white treatment; the pattern drifts toward your cursor and speeds up on hover."
      >
        <div className="space-y-6">
          <div className="relative h-72 overflow-hidden rounded-2xl border border-ink/10">
            <AsciiFog className="absolute inset-0 h-full w-full" />
            <HeroContent />
            <PanelLabel>control · current AsciiFog</PanelLabel>
          </div>
          {HERO_VARIANTS.map((v) => (
            <DitherHeroPanel key={v.label} variant={v} speedFactor={speedFactor} />
          ))}
        </div>
      </Section>

      <Section
        title="B · Dither-composed identity"
        note="The helmet rendered by ImageDithering as a single team-colour fill (dithered edges), numeral overlaid crisp exactly like AsciiGlyph. Side-by-side with the current ASCII composition."
      >
        <div className="space-y-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink/10 p-6">
              <div className="mb-4 font-grotesk text-[10px] uppercase tracking-wide text-muted">control · AsciiGlyph</div>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                {GLYPHS.map((g) => (
                  <div key={g.code} className="flex flex-col items-center gap-1.5">
                    <AsciiGlyph code={g.code} team={g.team} size={88} />
                    <span className="font-grotesk text-sm font-bold tracking-wide text-ink">{g.code}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-ink/10 p-6">
              <div className="mb-4 font-grotesk text-[10px] uppercase tracking-wide text-muted">candidate · single-fill dither</div>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                {GLYPHS.map((g) => (
                  <div key={g.code} className="flex flex-col items-center gap-1.5">
                    <DitherHelmet code={g.code} team={g.team} size={88} />
                    <span className="font-grotesk text-sm font-bold tracking-wide text-ink">{g.code}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink/10 p-6">
              <div className="mb-4 font-grotesk text-[10px] uppercase tracking-wide text-muted">control · AsciiEmblem tyre</div>
              <AsciiEmblem kind="tyre" size={96} cols={26} />
            </div>
            <div className="rounded-2xl border border-ink/10 p-6">
              <div className="mb-4 font-grotesk text-[10px] uppercase tracking-wide text-muted">candidate · single-fill dither tyre</div>
              <ImageDithering
                image={svgDataUri(emblemSvgMarkup("tyre", BLUE))}
                colorBack={WHITE}
                colorFront={BLUE}
                colorSteps={2}
                type="4x4"
                size={2}
                speed={0}
                style={{ width: 96, height: 96 }}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="C · Card hover"
        note="Current CardFog bloom vs the warp in the same bottom-right corner placement and hero colour treatment. Hover each."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <HoverFogCard />
          <DitherHoverCard speedFactor={speedFactor} />
        </div>
      </Section>

      <Section
        title="D · Playground"
        note="Warp parameter sweep (size x scale) in the multiply palette treatment. Tweak the grid in LabDither.tsx."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((sz) =>
            [0.4, 0.8].map((sc) => (
              <div key={`${sz}-${sc}`} className="relative aspect-square overflow-hidden rounded-xl border border-ink/10 bg-white">
                <DitherLayers
                  layers={[
                    { colorBack: WHITE, colorFront: BLUE, shape: "warp", type: "4x4", size: sz, speed: 0.5, scale: sc },
                    { colorBack: WHITE, colorFront: SKY, shape: "warp", type: "4x4", size: sz, speed: 0.35, scale: sc * 0.7 },
                  ]}
                  speedFactor={speedFactor}
                />
                <PanelLabel>
                  size {sz} · scale {sc}
                </PanelLabel>
              </div>
            )),
          )}
        </div>
      </Section>
    </main>
  );
}
