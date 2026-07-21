"use client";

// The landing's race-track spine (spec 2b): one continuous SVG track connecting the
// sector numerals S1 -> S4, drawn/scrubbed with scroll, with the abstract car riding
// the path (MotionPath autoRotate banks it with the curve; a separate mirror ACROSS
// the track's own axis toggles at each connector's own inflection point, since
// S1..S4 alternate sides so consecutive bends alternate which way they curve - see
// the scrub timeline for the parity math). Rendered as the first child of the
// relative sections wrapper;
// measures [data-sector-anchor] elements inside that wrapper. Under
// prefers-reduced-motion (with JS running) the full track renders statically and the
// car parks at the finish; before JS runs (or with JS unavailable), only the empty
// placeholder renders.
import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "@/app/lib/gsap";
import { buildTrackGeometry, type TrackGeometry } from "@/app/lib/track-path";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";

const CAR_W = 56;
const TRACK = "#251F44"; // ink
const KERB_RED = "#d2504a";
// Each curve connector is an S-curve (ogee) with a VERTICAL tangent at both ends
// (see track-path.ts): curvature is HIGHEST near each end, where the path peels
// away from straight, and crosses zero at the middle (the inflection point, where
// the S reverses bend direction) - the middle is the straightest part, not the
// bendiest. So kerbs stripe TWO zones per connector, near the exit of one sector
// and the entry of the next, leaving the near-straight middle third bare.
const KERB_ZONES: [number, number][] = [
  [0.05, 0.35],
  [0.65, 0.95],
];

interface Measured {
  geometry: TrackGeometry;
  width: number;
  height: number;
  viewportH: number;
}

interface Pt {
  x: number;
  y: number;
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// De Casteljau split of a cubic bezier at parameter t: returns the two cubics
// covering [0,t] and [t,1].
function splitCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number) {
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const f = lerp(d, e, t);
  return {
    left: [p0, a, d, f] as [Pt, Pt, Pt, Pt],
    right: [f, e, c, p3] as [Pt, Pt, Pt, Pt],
  };
}

// Extract the sub-curve of a cubic bezier covering parameter range [t0, t1] —
// two sequential De Casteljau splits (a bezier's sub-range is itself a bezier).
function subCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t0: number, t1: number) {
  const right = splitCubic(p0, p1, p2, p3, t0).right;
  const s1 = (t1 - t0) / (1 - t0);
  return splitCubic(right[0], right[1], right[2], right[3], s1).left;
}

// Point on a cubic bezier at parameter t (standard Bernstein form).
function cubicPointAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

const CURVE_RE =
  /^M (-?[\d.]+) (-?[\d.]+) C (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)$/;

// Each connector's control points are built symmetrically (see track-path.ts), so
// t=0.5 is exactly its inflection point - the instant curvature reverses sign,
// i.e. where the bend's "chirality" (which way it turns) flips. That's also the one
// point on a bend where a corrective mirror is least jarring: the path is at its
// most vertical there, same as the straights on either side.
function curveMidpoint(d: string): Pt | null {
  const m = CURVE_RE.exec(d);
  if (!m) return null;
  const [x0, y0, x1, y1, x2, y2, x3, y3] = m.slice(1).map(Number);
  return cubicPointAt({ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }, 0.5);
}

// Binary search for the arc length along `path` whose point has the given Y — the
// whole track runs monotonically downward (S1..S4 stack top to bottom), so this
// always converges.
function lengthAtY(path: SVGPathElement, targetY: number, total: number): number {
  let lo = 0;
  let hi = total;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (path.getPointAtLength(mid).y < targetY) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Trim a curve connector down to its two bend zones (exit of one sector, entry of
// the next) - see KERB_ZONES. Falls back to the full segment (as a single zone) if
// the "M x y C x1 y1 x2 y2 x3 y3" shape ever doesn't match (defensive;
// buildTrackGeometry always emits exactly this shape).
function kerbD(d: string): string[] {
  const m = CURVE_RE.exec(d);
  if (!m) return [d];
  const [x0, y0, x1, y1, x2, y2, x3, y3] = m.slice(1).map(Number);
  const p0 = { x: x0, y: y0 };
  const p1 = { x: x1, y: y1 };
  const p2 = { x: x2, y: y2 };
  const p3 = { x: x3, y: y3 };
  return KERB_ZONES.map(([t0, t1]) => {
    const [a, b, c, dd] = subCubic(p0, p1, p2, p3, t0, t1);
    return `M ${a.x} ${a.y} C ${b.x} ${b.y} ${c.x} ${c.y} ${dd.x} ${dd.y}`;
  });
}

export function TrackSpine() {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const carRef = useRef<HTMLDivElement>(null);
  const carFlipRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);

  // Measure the wrapper + numeral anchors; rebuild on resize (rAF-debounced).
  useEffect(() => {
    const root = rootRef.current;
    const wrapper = root?.parentElement;
    if (!root || !wrapper) return;

    let raf = 0;
    const measure = () => {
      const wrap = wrapper.getBoundingClientRect();
      const anchors = Array.from(
        wrapper.querySelectorAll<HTMLElement>("[data-sector-anchor]"),
      ).map((el) => {
        // Layout coordinates (offsetLeft/offsetTop), not getBoundingClientRect:
        // gBCR includes CSS transforms, and SectionReveal's [data-reveal] entrance
        // transform on these same numerals would skew the track before it settles.
        // offsetLeft/offsetTop ignore transforms entirely.
        let x = 0;
        let y = 0;
        let node: HTMLElement | null = el;
        while (node && node !== wrapper) {
          x += node.offsetLeft;
          y += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        return {
          x: x + el.offsetWidth / 2,
          y: y + el.offsetHeight / 2,
        };
      });
      const geometry = buildTrackGeometry(anchors);
      setMeasured(
        geometry
          ? { geometry, width: wrap.width, height: wrap.height, viewportH: window.innerHeight }
          : null,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(wrapper);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Scrubbed timeline: DrawSVG the track + kerbs while the car motion-paths along,
  // sharing one progress. Rebuilt whenever the measured geometry changes.
  useEffect(() => {
    if (!measured) return;
    const svg = svgRef.current;
    const car = carRef.current;
    const carFlip = carFlipRef.current;
    const wrapper = rootRef.current?.parentElement;
    if (!svg || !car || !carFlip || !wrapper) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const trackPath = svg.querySelector<SVGPathElement>("[data-track-main]");
      const carPath = svg.querySelector<SVGPathElement>("[data-car-path]");
      if (!trackPath || !carPath) return;
      // DrawSVG stays on the undashed main line only: DrawSVGPlugin overwrites
      // stroke-dasharray wholesale, which would destroy the kerbs' 12/12 offset
      // red/white stripe pattern. Kerbs reveal via opacity on the same scrubbed
      // timeline instead.
      const strokes = svg.querySelectorAll<SVGPathElement>("[data-track-draw]");
      const kerbs = svg.querySelectorAll<SVGGElement>("[data-kerb]");
      gsap.set(strokes, { drawSVG: "0%" });
      gsap.set(kerbs, { autoAlpha: 0 });
      // The car rides an EXTENDED path (main line + an exit leg past the finish, never
      // drawn) so it zooms past the chequered strip instead of stopping on it. Both
      // paths share one scrubbed timeline at constant car speed, so scaling the draw
      // tween's duration by the track/car length ratio makes the line finish drawing
      // at exactly the moment the car crosses the finish point.
      const trackLen = trackPath.getTotalLength();
      const carLen = carPath.getTotalLength();

      // Mirror-flip progress thresholds: every connector's S-bend reverses its own
      // curvature at its midpoint (see curveMidpoint), and S1..S4 alternate sides
      // (right/left/right/left), so consecutive connectors alternate WHICH way they
      // bend too - S1->S2 and S3->S4 curve the same direction, S2->S3 curves the
      // opposite way. autoRotate alone banks correctly within a single bend, but a
      // side-view car glyph needs an extra mirror ACROSS the track's own axis (roof
      // for floor, not nose for tail) to keep reading "upright" once the bend's own
      // chirality flips - toggled exactly at each connector's midpoint (the one
      // point on a bend that's momentarily as vertical as the straights either side
      // of it, so the mirror lands invisibly).
      const flipThresholds = measured.geometry.segments
        .filter((s) => s.kind === "curve")
        .map((c) => curveMidpoint(c.d))
        .filter((p): p is Pt => p !== null)
        .map((p) => lengthAtY(trackPath, p.y, trackLen) / carLen)
        .sort((a, b) => a - b);

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: wrapper,
          start: "top 60%",
          end: "bottom 75%",
          scrub: 1,
        },
      });
      tl.to(strokes, { drawSVG: "100%", duration: trackLen / carLen }, 0)
        .to(kerbs, { autoAlpha: 0.55, duration: 0.35 }, 0.15)
        .to(
          car,
          {
            duration: 1,
            motionPath: {
              path: carPath,
              align: carPath,
              alignOrigin: [0.5, 0.5],
              autoRotate: true,
            },
            onUpdate: () => {
              // scaleY, not scaleX: carFlip sits inside `car` (the autoRotate
              // target), so its local frame is already rotated with the tangent -
              // local +x IS the direction of travel. Mirroring on X would flip
              // nose-for-tail; the correction needed here is roof-for-floor,
              // perpendicular to travel - i.e. across the track's own axis - which
              // is local Y.
              const passed = flipThresholds.filter((t) => tl.progress() >= t).length;
              gsap.set(carFlip, { scaleY: passed % 2 === 1 ? -1 : 1 });
            },
          },
          0,
        );
      // ScrollTrigger measures on creation; a rebuild after resize needs fresh math.
      ScrollTrigger.refresh();
    });
    return () => mm.revert();
  }, [measured]);

  if (!measured) {
    return (
      <div
        ref={rootRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden sm:block"
      />
    );
  }

  const { geometry, width, height, viewportH } = measured;
  const curves = geometry.segments.filter((s) => s.kind === "curve");
  const { start, finish } = geometry;
  // Car-only path: the drawn line stops at `finish`, but the car keeps going and exits
  // the viewport below it (change 2) — never rendered (fill/stroke none). Scaled to the
  // viewport's own height so it clears a fullscreen browser, not just a fixed distance
  // that reads as "barely dips off" on a tall screen.
  const carD = `${geometry.d} L ${finish.x} ${finish.y + Math.max(480, viewportH)}`;

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block"
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${Math.round(width)} ${Math.round(height)}`}
        className="absolute inset-0"
      >
        {/* Kerbs: red base + offset white dashes, at the two BEND zones of each curve
            connector (exiting one sector, entering the next — see KERB_ZONES),
            under the track line. */}
        {curves.flatMap((c, i) =>
          kerbD(c.d).map((d, z) => (
            <g key={`${i}-${z}`} data-kerb opacity={0.55}>
              <path d={d} fill="none" stroke={KERB_RED} strokeWidth={8} strokeDasharray="12 12" />
              <path
                d={d}
                fill="none"
                stroke="#ffffff"
                strokeWidth={8}
                strokeDasharray="12 12"
                strokeDashoffset={12}
              />
            </g>
          )),
        )}
        {/* The racing line itself. */}
        <path
          data-track-main
          data-track-draw
          d={geometry.d}
          fill="none"
          stroke={TRACK}
          strokeOpacity={0.18}
          strokeWidth={3}
        />
        {/* Invisible car-only path: the exit leg past the finish is never drawn. */}
        <path data-car-path d={carD} fill="none" stroke="none" />
        {/* Grid box: starting-slot bracket. Closed side sits at the track's start
            (where the car is parked, facing into the drawn line); open side faces
            back up the straight, away from the track - a closed-bottom "⊔", not a
            closed-top "⊓" (which reads upside down: closed end facing away from
            the track it's meant to open onto). Sized around CAR_W (the car's
            rotated nose-tail length runs close to that) with margin, since the
            scrub centers the car exactly on `start` (motionPath alignOrigin
            [0.5,0.5]) - too tight a box and the nose/tail poke out either end. */}
        <path
          d={`M ${start.x - 20} ${start.y - CAR_W / 2 - 8} L ${start.x - 20} ${start.y + CAR_W / 2 - 8} L ${start.x + 20} ${start.y + CAR_W / 2 - 8} L ${start.x + 20} ${start.y - CAR_W / 2 - 8}`}
          fill="none"
          stroke={TRACK}
          strokeOpacity={0.5}
          strokeWidth={3}
        />
        {/* Chequered finish strip, perpendicular to the final (vertical) straight. */}
        <g transform={`translate(${finish.x - 24} ${finish.y - 2})`} opacity={0.7}>
          {[0, 1].map((row) =>
            [0, 1, 2, 3, 4, 5].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={col * 8}
                y={row * 6}
                width={8}
                height={6}
                fill={(row + col) % 2 === 0 ? TRACK : "#ffffff"}
              />
            )),
          )}
        </g>
      </svg>
      {/* The car. Reduced-motion/no-JS default: parked at the finish, floor parallel
          to the (vertical) final straight; the scrubbed MotionPath overrides this
          transform entirely when motion is allowed. */}
      <div
        ref={carRef}
        className="absolute left-0 top-0"
        style={{
          width: CAR_W,
          transform: `translate(${finish.x - CAR_W / 2}px, ${finish.y - CAR_W / 4}px) rotate(90deg)`,
        }}
      >
        {/* carFlipRef: the roof/floor mirror (scaleY, toggled by the scrub timeline
            - see its onUpdate for why it's Y, not X). Parked default is scaleY(-1):
            the car rests at `finish` (S4), which is on the same side/chirality
            group as S2 - the "flipped" state in the scrub's own parity (S1/S3 =
            scaleY(1) baseline, S2/S4 = scaleY(-1)). */}
        <div ref={carFlipRef} style={{ transform: "scaleY(-1)" }}>
          {/* CAR_SILHOUETTE is drawn nose-LEFT (front wing left, rear wing right); this
              PERMANENT mirror corrects it to nose-right. Unlike carFlipRef above, this
              one never toggles - it's a fixed property of the source asset, not of
              which bend the car is currently in. */}
          <div style={{ transform: "scaleX(-1)" }}>
            <AsciiEmblem kind="car" size={CAR_W} />
          </div>
        </div>
      </div>
    </div>
  );
}
