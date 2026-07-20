"use client";

// Renders any <video> through the shared ordered-Bayer luminance ditherer (app/lib/bayer.ts).
//
// PAINT APPROACH (documented per plan Task 2): the visible canvas's PIXEL BUFFER is the
// low-res cols x rows grid itself (not a full-resolution canvas with cell rects drawn on
// top). Each frame we: (1) drawImage the video's current frame into an offscreen cols x
// rows sample canvas (cover-cropped, see below), (2) getImageData that tiny buffer,
// (3) run it through bayerLuminancePasses, (4) build a cols*rows*4 RGBA byte buffer
// (front colour where the pass is true, back colour elsewhere) and paint it in ONE
// putImageData call. The visible canvas is then scaled up purely with CSS
// (width/height: 100%, imageRendering: "pixelated") to fill the box. This is cheaper than
// looping cols*rows fillRect calls per frame (a single typed-array fill + one putImageData
// beats thousands of draw calls) and keeps the "chunky pixel" dither look crisp since the
// browser does nearest-neighbour upscaling.
//
// COVER-CROP MATH: the grid's aspect ratio is taken from the component's own box (its
// rendered clientWidth/clientHeight), falling back to the video's native aspect before
// layout is known. Because the grid's pixel aspect ratio already matches the CSS box's
// aspect ratio, the canvas can just be width/height: 100% with no distortion - no reliance
// on `object-fit` support for <canvas>. The crop happens once, upstream, on the VIDEO
// SOURCE rect passed into drawImage (the same math as CSS `object-fit: cover`): if the
// video is relatively wider than the box, crop its left/right edges; if relatively taller,
// crop its top/bottom edges; then draw that cropped rect to fill the entire cols x rows
// destination.
import { useCallback, useEffect, useRef, useState } from "react";
import { bayerLuminancePasses } from "@/app/lib/bayer";

type Matrix = "4x4" | "8x8";

interface DitherVideoProps {
  src?: string;
  poster?: string;
  colorBack: string;
  colorFront: string;
  cols?: number;
  matrix?: Matrix;
  /** Linear luminance boost for dark footage (1 = neutral); see bayerLuminancePasses. */
  gain?: number;
  className?: string;
  children?: React.ReactNode;
  "data-hero"?: string;
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

/** `src="/hero.mp4"` (local /public asset) omits crossOrigin; only a remote absolute URL needs it. */
function isRemoteSrc(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

let swatchCanvas: HTMLCanvasElement | null = null;

/** Resolve any CSS colour string to packed RGBA bytes via a cached 1x1 canvas readback. */
function colorToRgba(color: string): [number, number, number, number] {
  if (!swatchCanvas) {
    swatchCanvas = document.createElement("canvas");
    swatchCanvas.width = 1;
    swatchCanvas.height = 1;
  }
  const ctx = swatchCanvas.getContext("2d");
  if (!ctx) return [0, 0, 0, 255];
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a];
}

/**
 * Full-box video ditherer: hidden video decodes off-DOM, a rAF loop (gated to
 * near-viewport + tab-visible) samples its current frame onto a cols x rows grid and
 * thresholds it through the shared Bayer matrix. Falls back to `children` (e.g.
 * `DitherFog`) when there is no `src` or the video fails to load, and to a single static
 * dithered frame under reduced motion or a blocked autoplay.
 */
export function DitherVideo({
  src,
  poster,
  colorBack,
  colorFront,
  cols = 240,
  matrix = "4x4",
  gain = 1,
  className = "",
  children,
  "data-hero": dataHero,
}: DitherVideoProps) {
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteRef = useRef<{
    back: [number, number, number, number];
    front: [number, number, number, number];
  }>({ back: [0, 0, 0, 255], front: [255, 255, 255, 255] });

  // Reset per-src state so a new src gets a clean load/error cycle.
  useEffect(() => {
    setFailed(false);
    setPlaying(false);
  }, [src]);

  // Resolve the palette once per colour change (not per frame - avoids a canvas
  // readback in the hot paint loop).
  useEffect(() => {
    paletteRef.current = { back: colorToRgba(colorBack), front: colorToRgba(colorFront) };
  }, [colorBack, colorFront]);

  // Mount/paint only near the viewport (rootMargin mirrors the lab's InView pattern).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      rootMargin: "150px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Pause the paint loop when the tab is backgrounded.
  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const paintFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return; // metadata not loaded yet

    const box = rootRef.current;
    const boxAspect =
      box && box.clientWidth > 0 && box.clientHeight > 0
        ? box.clientWidth / box.clientHeight
        : vw / vh; // pre-layout fallback: the video's own aspect
    const rows = Math.max(1, Math.round(cols / boxAspect));

    // Cover-crop the video source rect to the grid's aspect (object-fit: cover math).
    const videoAspect = vw / vh;
    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;
    if (videoAspect > boxAspect) {
      sw = vh * boxAspect;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / boxAspect;
      sy = (vh - sh) / 2;
    }

    let sample = sampleCanvasRef.current;
    if (!sample) {
      sample = document.createElement("canvas");
      sampleCanvasRef.current = sample;
    }
    if (sample.width !== cols || sample.height !== rows) {
      sample.width = cols;
      sample.height = rows;
    }
    const sctx = sample.getContext("2d", { willReadFrequently: true });
    if (!sctx) return;
    sctx.drawImage(video, sx, sy, sw, sh, 0, 0, cols, rows);

    let data: Uint8ClampedArray;
    try {
      data = sctx.getImageData(0, 0, cols, rows).data;
    } catch {
      // Tainted canvas (e.g. a remote src without proper CORS headers): fall back.
      setFailed(true);
      return;
    }

    const passes = bayerLuminancePasses(data, cols, rows, matrix, gain);

    if (canvas.width !== cols || canvas.height !== rows) {
      canvas.width = cols;
      canvas.height = rows;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { back, front } = paletteRef.current;
    const out = new Uint8ClampedArray(cols * rows * 4);
    for (let i = 0; i < passes.length; i++) {
      const o = i * 4;
      const [r, g, b, a] = passes[i] ? front : back;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
    ctx.putImageData(new ImageData(out, cols, rows), 0, 0);
  }, [cols, matrix, gain]);

  // Wire up the video element: attempt playback once data is available; reduced motion
  // and blocked-autoplay both fall back to a single painted frame, no loop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const onLoadedData = () => {
      if (reduced) {
        video.pause();
        paintFrame();
        return;
      }
      const p = video.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          // Autoplay blocked: stay paused, single-frame fallback.
          paintFrame();
        });
      }
    };
    const onPlaying = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => setFailed(true);

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onError);
    };
  }, [src, reduced, paintFrame]);

  // If reduced motion turns on mid-playback (media query change), stop and freeze.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !reduced || video.paused) return;
    video.pause();
    paintFrame();
  }, [reduced, paintFrame]);

  // The rAF paint loop: only while actually playing, near-viewport, and tab-visible.
  useEffect(() => {
    if (reduced || !playing || !inView || !pageVisible) return;
    let raf = 0;
    const tick = () => {
      paintFrame();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, playing, inView, pageVisible, paintFrame]);

  // Repaint a single frame when a control prop changes while not actively looping
  // (reduced motion, blocked autoplay, or simply paused) - e.g. the lab's cols/matrix/
  // palette toggles.
  useEffect(() => {
    if (playing && !reduced) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    paintFrame();
  }, [playing, reduced, paintFrame]);

  const showFallback = !src || failed;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-hero={dataHero}
      className={`overflow-hidden ${className}`}
    >
      {src ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          {...(isRemoteSrc(src) ? { crossOrigin: "anonymous" as const } : {})}
          className="absolute left-0 top-0 h-px w-px overflow-hidden opacity-0"
          style={{ pointerEvents: "none" }}
        />
      ) : null}
      {showFallback ? (
        (children ?? null)
      ) : (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: "pixelated" }}
        />
      )}
    </div>
  );
}
