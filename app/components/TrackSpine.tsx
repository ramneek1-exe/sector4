"use client";

// The landing's race-track spine (spec 2b): one continuous SVG track connecting the
// sector numerals S1 -> S4, drawn/scrubbed with scroll, with the abstract car riding
// the path (MotionPath autoRotate keeps its floor parallel to the track). Rendered as
// the first child of the relative sections wrapper; measures [data-sector-anchor]
// elements inside that wrapper. Under prefers-reduced-motion (with JS running) the
// full track renders statically and the car parks at the finish; before JS runs (or
// with JS unavailable), only the empty placeholder renders.
import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "@/app/lib/gsap";
import { buildTrackGeometry, type TrackGeometry } from "@/app/lib/track-path";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";

const CAR_W = 56;
const TRACK = "#251F44"; // ink
const KERB_RED = "#d2504a";

interface Measured {
  geometry: TrackGeometry;
  width: number;
  height: number;
}

export function TrackSpine() {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const carRef = useRef<HTMLDivElement>(null);
  const carInnerRef = useRef<HTMLDivElement>(null);
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
        geometry ? { geometry, width: wrap.width, height: wrap.height } : null,
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
    const carInner = carInnerRef.current;
    const wrapper = rootRef.current?.parentElement;
    if (!svg || !car || !carInner || !wrapper) return;

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
              // The car glyph faces right; autoRotate aligns +x to the tangent, so
              // leftward travel (rotation in (90, 270)) would render it upside down.
              // Mirror the INNER wrapper only — the outer stays the motionPath
              // target — so the floor stays parallel to the track without ever
              // flipping roof-down.
              const r =
                (((gsap.getProperty(car, "rotation") as number) % 360) + 360) % 360;
              gsap.set(carInner, { scaleY: r > 90 && r < 270 ? -1 : 1 });
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

  const { geometry, width, height } = measured;
  const curves = geometry.segments.filter((s) => s.kind === "curve");
  const { start, finish } = geometry;
  // Car-only path: the drawn line stops at `finish`, but the car keeps going and exits
  // the viewport below it (change 2) — never rendered (fill/stroke none).
  const carD = `${geometry.d} L ${finish.x} ${finish.y + 480}`;

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
        {/* Kerbs: red base + offset white dashes, curves only, under the track line. */}
        {curves.map((c, i) => (
          <g key={i} data-kerb opacity={0.55}>
            <path
              d={c.d}
              fill="none"
              stroke={KERB_RED}
              strokeWidth={8}
              strokeDasharray="12 12"
            />
            <path
              d={c.d}
              fill="none"
              stroke="#ffffff"
              strokeWidth={8}
              strokeDasharray="12 12"
              strokeDashoffset={12}
            />
          </g>
        ))}
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
        {/* Grid box: starting-slot bracket, open toward travel (downward). */}
        <path
          d={`M ${start.x - 16} ${start.y + 16} L ${start.x - 16} ${start.y - 8} L ${start.x + 16} ${start.y - 8} L ${start.x + 16} ${start.y + 16}`}
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
        <div ref={carInnerRef}>
          <AsciiEmblem kind="car" size={CAR_W} />
        </div>
      </div>
    </div>
  );
}
