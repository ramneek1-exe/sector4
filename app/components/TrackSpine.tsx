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
    const wrapper = rootRef.current?.parentElement;
    if (!svg || !car || !wrapper) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const trackPath = svg.querySelector<SVGPathElement>("[data-track-main]");
      if (!trackPath) return;
      // DrawSVG stays on the undashed main line only: DrawSVGPlugin overwrites
      // stroke-dasharray wholesale, which would destroy the kerbs' 12/12 offset
      // red/white stripe pattern. Kerbs reveal via opacity on the same scrubbed
      // timeline instead.
      const strokes = svg.querySelectorAll<SVGPathElement>("[data-track-draw]");
      const kerbs = svg.querySelectorAll<SVGGElement>("[data-kerb]");
      gsap.set(strokes, { drawSVG: "0%" });
      gsap.set(kerbs, { autoAlpha: 0 });
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: wrapper,
          start: "top 60%",
          end: "bottom 75%",
          scrub: 1,
        },
      });
      tl.to(strokes, { drawSVG: "100%", duration: 1 }, 0)
        .to(kerbs, { autoAlpha: 0.55, duration: 0.35 }, 0.15)
        .to(
          car,
          {
            duration: 1,
            motionPath: {
              path: trackPath,
              align: trackPath,
              alignOrigin: [0.5, 0.5],
              autoRotate: true,
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

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden sm:block"
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
        <AsciiEmblem kind="car" size={CAR_W} />
      </div>
    </div>
  );
}
