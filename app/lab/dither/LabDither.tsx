"use client";

// Shader evaluation lab: paper-design `Dithering` (WebGL2 canvas, 2-color) vs the current
// homegrown ASCII art. Each exhibit recreates a REAL site moment (home hero, glyph identity,
// card hover) so the owner judges a swap in-situ, not in the abstract. All candidate configs
// live in the const arrays below for fast tweaking. Reduced motion -> speed 0 (static frame).
import { useEffect, useState } from "react";
import { Dithering, type DitheringProps } from "@paper-design/shaders-react";
import { AsciiFog } from "@/app/components/AsciiFog";
import { AsciiGlyph } from "@/app/components/AsciiGlyph";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";
import { CardFog } from "@/app/components/CardFog";

// Brand palette (coolors bee2f0-459ae4-2f2e89-addcef-406cd6-251f44).
const INK = "#251f44";
const ACCENT = "#2f2e89";
const BLUE = "#406cd6";
const SKY = "#459ae4";
const LIGHT = "#addcef";
const PALE = "#bee2f0";

type Variant = {
  label: string;
  layers: Partial<DitheringProps>[]; // stacked back-to-front; >1 fakes palette depth
};

// A. Hero candidates. The shader is 2-color, so layered variants blend two instances
// (different shape/speed, top layer screen-blended) to approach AsciiFog's 6-stop sweep.
const HERO_VARIANTS: Variant[] = [
  {
    label: "ink x accent · sphere · 4x4",
    layers: [{ colorBack: INK, colorFront: ACCENT, shape: "sphere", type: "4x4", size: 2, speed: 0.7, scale: 0.7 }],
  },
  {
    label: "ink x light · warp · 4x4",
    layers: [{ colorBack: INK, colorFront: LIGHT, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.8 }],
  },
  {
    label: "layered: ink x blue swirl + transparent x sky wave (screen)",
    layers: [
      { colorBack: INK, colorFront: BLUE, shape: "swirl", type: "4x4", size: 2, speed: 0.4, scale: 0.8 },
      { colorBack: "#00000000", colorFront: SKY, shape: "wave", type: "4x4", size: 3, speed: 0.6, scale: 0.6 },
    ],
  },
];

// D. Playground grid: shapes x dither types at brand colors.
const PLAY_SHAPES: DitheringProps["shape"][] = ["sphere", "warp", "wave", "swirl", "simplex"];
const PLAY_TYPES: DitheringProps["type"][] = ["4x4", "8x8"];

// Glyph identity row: real 2026 driver/team pairs (abstract helmets, PRD §8).
const GLYPHS: { code: string; team: string }[] = [
  { code: "VER", team: "Red Bull Racing" },
  { code: "NOR", team: "McLaren" },
  { code: "LEC", team: "Ferrari" },
  { code: "RUS", team: "Mercedes" },
];

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

/** Stacked Dithering layers filling their parent (absolute). Top layers screen-blend. */
function DitherLayers({ layers, speedFactor }: { layers: Partial<DitheringProps>[]; speedFactor: number }) {
  return (
    <>
      {layers.map((l, i) => (
        <Dithering
          key={i}
          {...l}
          speed={(l.speed ?? 0.5) * speedFactor}
          className="absolute inset-0 h-full w-full"
          style={i > 0 ? { mixBlendMode: "screen" } : undefined}
        />
      ))}
    </>
  );
}

/** The real home-hero moment (h1 + input shell + a chip) overlaid on an art background. */
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
          Evaluating the paper-design Dithering shader against the current ASCII art, on the real
          site moments. Unlinked test page: nothing here ships.
        </p>
      </header>

      <Section
        title="A · Hero swap"
        note="The home hero moment over each background. First panel is the current AsciiFog (control), then the shader candidates at brand colors."
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
        title="B · Identity on dither"
        note="Driver helmets and the car emblem over the dithered texture: does the abstract glyph identity cohere on the new background?"
      >
        <div className="relative overflow-hidden rounded-2xl border border-ink/10 p-8">
          <Dithering
            colorBack={INK}
            colorFront={ACCENT}
            shape="warp"
            type="4x4"
            size={2}
            speed={0.4 * speedFactor}
            scale={0.9}
            className="absolute inset-0 h-full w-full"
          />
          <div className="relative z-10 flex flex-wrap items-end justify-center gap-x-10 gap-y-6">
            {GLYPHS.map((g) => (
              <div key={g.code} className="flex flex-col items-center gap-1.5">
                <AsciiGlyph code={g.code} team={g.team} size={88} />
                <span className="font-grotesk text-sm font-bold tracking-wide text-white">{g.code}</span>
              </div>
            ))}
            <AsciiEmblem kind="car" size={72} cols={30} color={PALE} />
            <AsciiEmblem kind="tyre" size={64} cols={22} color={LIGHT} />
          </div>
        </div>
      </Section>

      <Section
        title="C · Card hover"
        note="Current CardFog hover bloom vs a Dithering-backed card. Hover each."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <HoverFogCard />
          <div className="group relative overflow-hidden rounded-2xl border border-ink/10 bg-white p-6">
            <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-25">
              <Dithering
                colorBack="#ffffff"
                colorFront={BLUE}
                shape="ripple"
                type="4x4"
                size={2}
                speed={0.6 * speedFactor}
                scale={0.7}
                className="h-full w-full"
              />
            </div>
            <div className="relative z-10">
              <h3 className="font-grotesk font-semibold text-ink">Dithering hover</h3>
              <p className="mt-1 font-lastik text-sm text-muted">Ripple dither fading in on hover.</p>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="D · Playground"
        note="Shapes x dither types at ink + accent. Scan for the texture that fits; tweak the const arrays in LabDither.tsx."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {PLAY_TYPES.map((t) =>
            PLAY_SHAPES.map((s) => (
              <div key={`${s}-${t}`} className="relative aspect-square overflow-hidden rounded-xl border border-ink/10">
                <Dithering
                  colorBack={INK}
                  colorFront={ACCENT}
                  shape={s}
                  type={t}
                  size={2}
                  speed={0.5 * speedFactor}
                  scale={0.7}
                  className="h-full w-full"
                />
                <PanelLabel>
                  {s} · {t}
                </PanelLabel>
              </div>
            )),
          )}
        </div>
      </Section>
    </main>
  );
}
