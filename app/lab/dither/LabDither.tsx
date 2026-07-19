"use client";

// Shader evaluation lab, round 3 (owner feedback): transparent colorBack rendered plain
// white, so layers are now OPAQUE white-backed and stacked with multiply blending (white
// passes through, palette dither accumulates — the AsciiFog fog-on-white treatment). The
// hero panels are pointer-reactive like AsciiFog (pattern shifts toward the cursor +
// speeds up on hover). Helmets/emblems lean to a SINGLE fill colour (no originalColors
// noise) with the crisp numeral overlaid exactly like AsciiGlyph does. Reduced motion ->
// static frame, no pointer reactivity.
import { useEffect, useRef, useState } from "react";
import { Dithering, ImageDithering, type DitheringProps } from "@paper-design/shaders-react";
import { AsciiFog } from "@/app/components/AsciiFog";
import { AsciiGlyph } from "@/app/components/AsciiGlyph";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";
import { CardFog } from "@/app/components/CardFog";
import { DitherVideo } from "@/app/components/DitherVideo";
import { resolveGlyph } from "@/app/lib/glyph";
import { HELMET_VIEWBOX, NUMBER_POS, helmetSvgMarkup } from "@/app/lib/helmet";
import { emblemSvgMarkup } from "@/app/lib/emblems";
import { bayerLuminancePasses } from "@/app/lib/bayer";

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

/** Ordered-dither glyph: the coloured SVG drawn to a cell grid, with a 4x4 Bayer threshold
 *  applied to the ALPHA channel only. Interior cells (alpha 1) always pass -> SOLID exact
 *  colours (shell, visor, vent); only the antialiased edge dithers. Deterministic, static —
 *  the control's look with a refined ordered-dither edge. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function BayerGlyph({
  markup,
  width,
  height,
  cell = 1,
}: {
  markup: string;
  width: number;
  height: number;
  cell?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const cols = Math.max(1, Math.round(width / cell));
    const rows = Math.max(1, Math.round(height / cell));
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const off = document.createElement("canvas");
      off.width = cols;
      off.height = rows;
      const octx = off.getContext("2d");
      const ctx = canvas.getContext("2d");
      if (!octx || !ctx) return;
      octx.drawImage(img, 0, 0, cols, rows);
      const data = octx.getImageData(0, 0, cols, rows).data;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const a = data[i + 3] / 255;
          const threshold = (BAYER4[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
          if (a >= threshold) {
            ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
            ctx.fillRect(x * cell, y * cell, cell, cell);
          }
        }
      }
    };
    img.src = svgDataUri(markup);
    return () => {
      cancelled = true;
    };
  }, [markup, width, height, cell]);
  return <canvas ref={canvasRef} style={{ width, height }} aria-hidden />;
}

/** Helmet with the gapless dither fill + the crisp numeral overlay AsciiGlyph uses. */
function DitherHelmet({ code, team, size }: { code: string; team: string | null; size: number }) {
  const g = resolveGlyph(code, team);
  const heightPx = size * (HELMET_VIEWBOX.h / HELMET_VIEWBOX.w);
  return (
    <div className="relative" style={{ width: size, height: heightPx }}>
      <BayerGlyph markup={helmetSvgMarkup(g, false)} width={size} height={heightPx} />
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


/** Mounts children only while near the viewport, releasing WebGL contexts offscreen.
 *  (~30 always-mounted shader canvases exceeded the browser context cap — the oldest were
 *  evicted, which is why the hero/card panels went blank while the playground rendered.) */
function InView({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setVisible(e.isIntersecting),
      { rootMargin: "150px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {visible ? children : null}
    </div>
  );
}

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
function DitherLayers({ layers, speedFactor }: { layers: Partial<DitheringProps>[]; speedFactor: number }) {
  return (
    <>
      {layers.map((l, i) => (
        <Dithering
          key={i}
          {...l}
          speed={(l.speed ?? 0.5) * speedFactor}
          className="absolute inset-0 h-full w-full"
          style={{ mixBlendMode: "multiply" }}
        />
      ))}
    </>
  );
}

/** Hero panel: the base warp stays put; an extra dither layer, masked to a soft radial
 *  BLOB, trails the cursor (rAF-lerped, like AsciiFog's cursor brighten). The blob has no
 *  fixed shape: the mask is soft and the pattern inside it is animating warp. */
function DitherHeroPanel({
  variant,
  speedFactor,
}: {
  variant: Variant;
  speedFactor: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: -9999, y: -9999, active: false });
  const posRef = useRef({ x: -9999, y: -9999 });
  const interactive = speedFactor > 0;

  useEffect(() => {
    if (!interactive) return;
    let raf = 0;
    const tick = () => {
      const t = target.current;
      const p = posRef.current;
      // Snap to the first entry point instead of lerping across the panel.
      if (p.x < -1000 && t.active) {
        p.x = t.x;
        p.y = t.y;
      }
      p.x += (t.x - p.x) * 0.12;
      p.y += (t.y - p.y) * 0.12;
      const el = blobRef.current;
      if (el) {
        el.style.opacity = t.active ? "1" : "0";
        el.style.setProperty("--mx", `${p.x}px`);
        el.style.setProperty("--my", `${p.y}px`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [interactive]);

  const onMove = (e: React.MouseEvent) => {
    if (!interactive || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    target.current = { x: e.clientX - r.left, y: e.clientY - r.top, active: true };
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => {
        target.current = { ...target.current, active: false };
      }}
      className="relative h-72 overflow-hidden rounded-2xl border border-ink/10 bg-white"
    >
      <InView className="absolute inset-0">
        <DitherLayers layers={variant.layers} speedFactor={speedFactor} />
        {interactive && (
          <div
            ref={blobRef}
            className="absolute inset-0 opacity-0 transition-opacity duration-300"
            style={{
              // multiply on the MASKED WRAPPER: the mask creates a stacking context that
              // isolates blending, so an inner multiply blended against transparent and the
              // white back showed as a visible circle. Blending the wrapper as a unit
              // multiplies the white out against the panel instead.
              mixBlendMode: "multiply",
              maskImage:
                "radial-gradient(circle 130px at var(--mx, -9999px) var(--my, -9999px), black 0%, black 30%, transparent 75%)",
              WebkitMaskImage:
                "radial-gradient(circle 130px at var(--mx, -9999px) var(--my, -9999px), black 0%, black 30%, transparent 75%)",
            }}
          >
            <Dithering
              colorBack={WHITE}
              colorFront={ACCENT}
              shape="warp"
              type="4x4"
              size={2}
              speed={0.9 * speedFactor}
              scale={0.5}
              className="absolute inset-0 h-full w-full"
            />
          </div>
        )}
      </InView>
      <HeroContent />
      <PanelLabel>{variant.label}</PanelLabel>
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
        style={{ mixBlendMode: "multiply", maskImage: CARD_MASK, WebkitMaskImage: CARD_MASK }}
      >
        <InView className="absolute inset-0">
          <DitherLayers
            layers={[
              { colorBack: WHITE, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.8 },
              { colorBack: WHITE, colorFront: SKY, shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.55 },
            ]}
            speedFactor={speedFactor}
          />
        </InView>
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

// E. Video hero: three lab-styled palette options against the real DitherVideo component.
const VIDEO_PALETTES: { label: string; front: string; back: string }[] = [
  { label: "ink on white", front: INK, back: WHITE },
  { label: "blue on white", front: BLUE, back: WHITE },
  { label: "white on ink", front: WHITE, back: INK },
];
const HERO_COLS_OPTIONS = [160, 240, 320] as const;
const HERO_MATRIX_OPTIONS = ["4x4", "8x8"] as const;
// Both parity panels render at this fixed CSS width so paper's `size` (px per dither cell)
// and our `cols` (cell count across the width) can be put on equal footing: size = width / cols.
const PARITY_WIDTH = 320;

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-grotesk text-xs transition-colors ${
        active ? "border-accent bg-accent text-white" : "border-ink/15 bg-white text-ink hover:border-ink/30"
      }`}
    >
      {children}
    </button>
  );
}

let parityCanvas: HTMLCanvasElement | null = null;

/** Resolve any CSS colour string to packed RGBA bytes via a cached 1x1 canvas readback
 *  (same technique DitherVideo uses internally, duplicated here since it isn't exported). */
function colorToRgba(color: string): [number, number, number, number] {
  if (!parityCanvas) {
    parityCanvas = document.createElement("canvas");
    parityCanvas.width = 1;
    parityCanvas.height = 1;
  }
  const ctx = parityCanvas.getContext("2d");
  if (!ctx) return [0, 0, 0, 255];
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a];
}

/** Our own dither path applied to a still captured frame (not a live video): draws the
 *  frame into a cols x rows offscreen sample, runs it through the shared
 *  bayerLuminancePasses, and paints the result in one putImageData - mirroring
 *  DitherVideo's per-frame approach exactly, just once instead of on a rAF loop. This is
 *  the "ours" half of the parity proof against paper's ImageDithering shader. */
function DitherFrame({
  image,
  cols,
  matrix,
  front,
  back,
}: {
  image: string;
  cols: number;
  matrix: "4x4" | "8x8";
  front: string;
  back: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rows = Math.max(1, Math.round(cols * (img.naturalHeight / img.naturalWidth)));

      const sample = document.createElement("canvas");
      sample.width = cols;
      sample.height = rows;
      const sctx = sample.getContext("2d", { willReadFrequently: true });
      const ctx = canvas.getContext("2d");
      if (!sctx || !ctx) return;
      sctx.drawImage(img, 0, 0, cols, rows);
      const data = sctx.getImageData(0, 0, cols, rows).data;
      const passes = bayerLuminancePasses(data, cols, rows, matrix);

      canvas.width = cols;
      canvas.height = rows;
      const front4 = colorToRgba(front);
      const back4 = colorToRgba(back);
      const out = new Uint8ClampedArray(cols * rows * 4);
      for (let i = 0; i < passes.length; i++) {
        const o = i * 4;
        const [r, g, b, a] = passes[i] ? front4 : back4;
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = b;
        out[o + 3] = a;
      }
      ctx.putImageData(new ImageData(out, cols, rows), 0, 0);
    };
    img.src = image;
    return () => {
      cancelled = true;
    };
  }, [image, cols, matrix, front, back]);

  return <canvas ref={canvasRef} className="h-full w-full" style={{ imageRendering: "pixelated" }} />;
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

  // E. Video hero state: the file picker is the only input, nothing gets committed.
  const [heroSrc, setHeroSrc] = useState<string | undefined>(undefined);
  const [heroPaletteIdx, setHeroPaletteIdx] = useState(0);
  const [heroCols, setHeroCols] = useState<(typeof HERO_COLS_OPTIONS)[number]>(240);
  const [heroMatrix, setHeroMatrix] = useState<(typeof HERO_MATRIX_OPTIONS)[number]>("4x4");
  const [heroCapture, setHeroCapture] = useState<{ uri: string; width: number; height: number } | null>(null);
  const heroObjectUrlRef = useRef<string | null>(null);
  // A second, independent <video> (DitherVideo hides its own internally, with no ref
  // escape hatch) purely so "Capture frame" has a real HTMLVideoElement to draw from.
  const heroVideoRef = useRef<HTMLVideoElement>(null);

  // Revoke the previous object URL on unmount (change is handled inline in onHeroFile,
  // since it needs the OLD value before setHeroSrc overwrites it).
  useEffect(() => {
    return () => {
      if (heroObjectUrlRef.current) URL.revokeObjectURL(heroObjectUrlRef.current);
    };
  }, []);

  const onHeroFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (heroObjectUrlRef.current) URL.revokeObjectURL(heroObjectUrlRef.current);
    const url = URL.createObjectURL(file);
    heroObjectUrlRef.current = url;
    setHeroSrc(url);
    setHeroCapture(null);
  };

  const onCaptureFrame = () => {
    const video = heroVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const width = 480;
    const height = Math.max(1, Math.round(width * (video.videoHeight / video.videoWidth)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    setHeroCapture({ uri: canvas.toDataURL("image/png"), width, height });
  };

  const heroPalette = VIDEO_PALETTES[heroPaletteIdx];

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
        note="Control is the current AsciiFog (cursor brightens the field). Candidates are warp in the palette-on-white treatment with a soft dither BLOB trailing the cursor."
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
        note="Solid exact colours in the fill (shell, visor, vent), ordered 4x4 Bayer dither on the edges only. The control look, refined."
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
              <div className="mb-4 font-grotesk text-[10px] uppercase tracking-wide text-muted">candidate · gapless two-tone dither</div>
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
              <div className="mb-4 font-grotesk text-[10px] uppercase tracking-wide text-muted">candidate · gapless two-tone dither</div>
              <BayerGlyph markup={emblemSvgMarkup("tyre", BLUE)} width={96} height={96} />
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
                <InView className="absolute inset-0">
                  <DitherLayers
                    layers={[
                      { colorBack: WHITE, colorFront: BLUE, shape: "warp", type: "4x4", size: sz, speed: 0.5, scale: sc },
                      { colorBack: WHITE, colorFront: SKY, shape: "warp", type: "4x4", size: sz, speed: 0.35, scale: sc * 0.7 },
                    ]}
                    speedFactor={speedFactor}
                  />
                </InView>
                <PanelLabel>
                  size {sz} · scale {sc}
                </PanelLabel>
              </div>
            )),
          )}
        </div>
      </Section>

      <Section
        title="E · Video hero"
        note="Validate the look and the dither parity BEFORE buying the b-roll. Pick any local clip - nothing here gets committed, the file picker is the only input."
      >
        <div className="space-y-6">
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2 font-grotesk text-xs text-ink hover:border-ink/30">
            <input type="file" accept="video/*" onChange={onHeroFile} className="hidden" />
            Choose a video file
          </label>

          {heroSrc ? (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-grotesk text-[10px] uppercase tracking-wide text-muted">palette</span>
                  {VIDEO_PALETTES.map((p, i) => (
                    <ToggleButton key={p.label} active={i === heroPaletteIdx} onClick={() => setHeroPaletteIdx(i)}>
                      {p.label}
                    </ToggleButton>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-grotesk text-[10px] uppercase tracking-wide text-muted">cols</span>
                  {HERO_COLS_OPTIONS.map((c) => (
                    <ToggleButton key={c} active={c === heroCols} onClick={() => setHeroCols(c)}>
                      {c}
                    </ToggleButton>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-grotesk text-[10px] uppercase tracking-wide text-muted">matrix</span>
                  {HERO_MATRIX_OPTIONS.map((m) => (
                    <ToggleButton key={m} active={m === heroMatrix} onClick={() => setHeroMatrix(m)}>
                      {m}
                    </ToggleButton>
                  ))}
                </div>
              </div>

              <div className="relative h-[70vh] w-full overflow-hidden rounded-2xl border border-ink/10 bg-ink">
                <InView className="absolute inset-0">
                  <DitherVideo
                    src={heroSrc}
                    colorBack={heroPalette.back}
                    colorFront={heroPalette.front}
                    cols={heroCols}
                    matrix={heroMatrix}
                    className="absolute inset-0 h-full w-full"
                  />
                </InView>
                {/* Off-screen, independent of DitherVideo's own hidden video - exists only
                    so "Capture frame" below has an HTMLVideoElement to draw from. */}
                <video
                  ref={heroVideoRef}
                  src={heroSrc}
                  muted
                  loop
                  playsInline
                  autoPlay
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden opacity-0"
                />
                <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
                  <div className="legible flex flex-col items-center gap-5 rounded-[2rem] px-10 py-10 text-center">
                    <h1 className="font-bebas text-7xl tracking-wide text-ink">SECTOR4</h1>
                    <p className="max-w-md font-lastik text-lg text-ink">
                      An F1 companion that tells you the truth about what it knows.
                    </p>
                    <button
                      type="button"
                      className="rounded-full bg-accent px-6 py-3 font-grotesk text-sm font-semibold text-white"
                    >
                      Ask your first question
                    </button>
                  </div>
                </div>
                <PanelLabel>
                  {heroPalette.label} · cols {heroCols} · {heroMatrix}
                </PanelLabel>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onCaptureFrame}
                  className="rounded-full border border-ink/15 bg-white px-4 py-2 font-grotesk text-xs text-ink hover:border-ink/30"
                >
                  Capture frame
                </button>
                <span className="font-grotesk text-xs text-muted">
                  grabs the current frame (~480px wide) for the parity check below
                </span>
              </div>

              {heroCapture && (
                <InView>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <div className="mb-2 font-grotesk text-[10px] uppercase tracking-wide text-muted">
                        paper · ImageDithering (real shader)
                      </div>
                      <div
                        className="overflow-hidden rounded-xl border border-ink/10"
                        style={{ width: PARITY_WIDTH, aspectRatio: `${heroCapture.width} / ${heroCapture.height}` }}
                      >
                        <ImageDithering
                          image={heroCapture.uri}
                          colorBack={heroPalette.back}
                          colorFront={heroPalette.front}
                          colorHighlight={heroPalette.front}
                          type={heroMatrix}
                          size={PARITY_WIDTH / heroCols}
                          colorSteps={2}
                          speed={0}
                          className="h-full w-full"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 font-grotesk text-[10px] uppercase tracking-wide text-muted">
                        ours · bayerLuminancePasses (same cols)
                      </div>
                      <div
                        className="overflow-hidden rounded-xl border border-ink/10"
                        style={{ width: PARITY_WIDTH, aspectRatio: `${heroCapture.width} / ${heroCapture.height}` }}
                      >
                        <DitherFrame
                          image={heroCapture.uri}
                          cols={heroCols}
                          matrix={heroMatrix}
                          front={heroPalette.front}
                          back={heroPalette.back}
                        />
                      </div>
                    </div>
                  </div>
                </InView>
              )}
            </>
          ) : (
            <p className="font-lastik text-sm text-muted">Pick a clip above to preview the hero.</p>
          )}
        </div>
      </Section>
    </main>
  );
}
