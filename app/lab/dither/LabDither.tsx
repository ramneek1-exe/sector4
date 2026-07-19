"use client";

// Shader evaluation lab, round 2 (owner feedback): warp won the hero but must wear the
// AsciiFog colour treatment (palette fog on the white page); glyphs/emblems are COMPOSED of
// dither via ImageDithering over their existing SVG sources (not placed on a dither bg); the
// card exhibit applies warp with CardFog's bottom-right corner-bloom placement. Configs live
// in const arrays for fast tweaking. Reduced motion -> speed 0 (static frame).
import { useEffect, useState } from "react";
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
import { helmetSvgMarkup } from "@/app/lib/helmet";
import { emblemSvgMarkup } from "@/app/lib/emblems";

// Brand palette (coolors bee2f0-459ae4-2f2e89-addcef-406cd6-251f44).
const INK = "#251f44";
const ACCENT = "#2f2e89";
const BLUE = "#406cd6";
const SKY = "#459ae4";
const LIGHT = "#addcef";
const CLEAR = "#00000000"; // transparent back so layers stack on the white page like fog

type Variant = {
  label: string;
  layers: Partial<DitheringProps>[]; // transparent-back layers stacked over the white page
};

// A. Hero candidates: WARP, coloured like AsciiFog (palette fog over white). The shader is
// 2-color per instance, so stacked transparent-back layers sweep the palette.
const HERO_VARIANTS: Variant[] = [
  {
    label: "warp · blue + sky over white · 4x4",
    layers: [
      { colorBack: CLEAR, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.8 },
      { colorBack: CLEAR, colorFront: SKY, shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.55 },
    ],
  },
  {
    label: "warp · accent + blue + light over white · 4x4",
    layers: [
      { colorBack: CLEAR, colorFront: ACCENT, shape: "warp", type: "4x4", size: 2, speed: 0.3, scale: 0.9 },
      { colorBack: CLEAR, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.6 },
      { colorBack: CLEAR, colorFront: LIGHT, shape: "warp", type: "4x4", size: 3, speed: 0.4, scale: 0.45 },
    ],
  },
  {
    label: "warp · ink + sky over white (high contrast) · 4x4",
    layers: [
      { colorBack: CLEAR, colorFront: INK, shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.75 },
      { colorBack: CLEAR, colorFront: SKY, shape: "warp", type: "4x4", size: 2, speed: 0.55, scale: 0.5 },
    ],
  },
];

// C. Card corner-bloom warp (CardFog placement): masked to the bottom-right, palette on white.
const CARD_MASK =
  "radial-gradient(120% 120% at 100% 100%, black 0%, black 35%, transparent 72%)";

// B. Identity: real 2026 driver/team pairs, composed of dither via their own SVG sources.
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

/** Stacked transparent-back Dithering layers filling their parent (absolute). */
function DitherLayers({ layers, speedFactor }: { layers: Partial<DitheringProps>[]; speedFactor: number }) {
  return (
    <>
      {layers.map((l, i) => (
        <Dithering key={i} {...l} speed={(l.speed ?? 0.5) * speedFactor} className="absolute inset-0 h-full w-full" />
      ))}
    </>
  );
}

/** A driver helmet COMPOSED of dither: ImageDithering over the same team-coloured helmet SVG
 *  AsciiGlyph rasterises, keeping the original team colours. Static (identity, not motion). */
function DitherHelmet({ code, team, size }: { code: string; team: string | null; size: number }) {
  const g = resolveGlyph(code, team);
  const uri = svgDataUri(helmetSvgMarkup(g, true));
  return (
    <ImageDithering
      image={uri}
      originalColors
      type="4x4"
      size={2}
      speed={0}
      style={{ width: size, height: size * (611 / 732) }}
    />
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

/** Candidate card: warp layers in the hero treatment, masked to CardFog's bottom-right bloom. */
function DitherHoverCard({ speedFactor }: { speedFactor: number }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-ink/10 bg-white p-6">
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ maskImage: CARD_MASK, WebkitMaskImage: CARD_MASK }}
      >
        <DitherLayers
          layers={[
            { colorBack: CLEAR, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.8 },
            { colorBack: CLEAR, colorFront: SKY, shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.55 },
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
          Round 2: warp in the AsciiFog colour treatment, dither-composed glyphs, and the
          CardFog-style corner bloom. Unlinked test page: nothing here ships.
        </p>
      </header>

      <Section
        title="A · Hero swap"
        note="The home hero over each background. Control is the current AsciiFog; candidates are WARP layered in the same palette-fog-on-white treatment."
      >
        <div className="space-y-6">
          <div className="relative h-72 overflow-hidden rounded-2xl border border-ink/10">
            <AsciiFog className="absolute inset-0 h-full w-full" />
            <HeroContent />
            <PanelLabel>control · current AsciiFog</PanelLabel>
          </div>
          {HERO_VARIANTS.map((v) => (
            <div key={v.label} className="relative h-72 overflow-hidden rounded-2xl border border-ink/10">
              <DitherLayers layers={v.layers} speedFactor={speedFactor} />
              <HeroContent />
              <PanelLabel>{v.label}</PanelLabel>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="B · Dither-composed identity"
        note="The helmet itself rendered by ImageDithering over the same team-coloured SVG AsciiGlyph uses (original colours kept), next to the current ASCII composition. Tyre emblem below."
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
              <div className="mb-4 font-grotesk text-[10px] uppercase tracking-wide text-muted">candidate · ImageDithering 4x4</div>
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
              <div className="mb-4 font-grotesk text-[10px] uppercase tracking-wide text-muted">candidate · ImageDithering tyre</div>
              <ImageDithering
                image={svgDataUri(emblemSvgMarkup("tyre", BLUE))}
                originalColors
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
        note="Warp parameter sweep at brand colours over white: size and scale variations to dial the texture. Tweak the grid in LabDither.tsx."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((sz) =>
            [0.4, 0.8].map((sc) => (
              <div key={`${sz}-${sc}`} className="relative aspect-square overflow-hidden rounded-xl border border-ink/10">
                <DitherLayers
                  layers={[
                    { colorBack: CLEAR, colorFront: BLUE, shape: "warp", type: "4x4", size: sz, speed: 0.5, scale: sc },
                    { colorBack: CLEAR, colorFront: SKY, shape: "warp", type: "4x4", size: sz, speed: 0.35, scale: sc * 0.7 },
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
