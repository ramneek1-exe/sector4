"use client";

import { useEffect, useState, type ComponentType } from "react";
import { readRevealEnv, shouldUseFallback } from "@/app/lib/reveal-fallback";

/**
 * Full-bleed, fixed aurora + ASCII "fog" behind all content (PRD §6.7 / §8). A blue
 * aurora gradient is ALWAYS painted (it is also the reduced-motion / no-WebGPU
 * fallback). When WebGPU is available, a low-opacity shaders.com Ascii(FractalNoise)
 * pass is layered over it for the living-ASCII texture. Content renders on top in
 * plain DOM — there are no cards; output appears to emerge from the fog.
 *
 * Note (from the M2 investigation): the `shaders` package's Ascii node only stylizes
 * another shader's output, never arbitrary DOM/text — so this is a decorative ASCII
 * FOG, not literal text-from-ASCII. `disableTelemetry` set; attribution lives in the
 * layout footer.
 */
type ShaderModule = {
  Shader: ComponentType<any>;
  Ascii: ComponentType<any>;
  FractalNoise: ComponentType<any>;
};

export function AuroraBackdrop() {
  const [fallback, setFallback] = useState(true);
  const [mod, setMod] = useState<ShaderModule | null>(null);

  useEffect(() => {
    const useFallback = shouldUseFallback(readRevealEnv());
    setFallback(useFallback);
    if (!useFallback) {
      import("shaders/react")
        .then((m) => setMod({ Shader: m.Shader, Ascii: m.Ascii, FractalNoise: m.FractalNoise }))
        .catch(() => setFallback(true));
    }
  }, []);

  return (
    <>
      {/* Base wash + drifting aurora light (visible on every browser). */}
      <div
        aria-hidden
        className="fixed inset-0 -z-20 overflow-hidden"
        style={{ background: "linear-gradient(160deg, #EAF1FF 0%, #F3F6FC 50%, #E6ECFF 100%)" }}
      >
        <div
          className="aurora-a absolute -left-[15%] -top-[20%] h-[80vh] w-[80vh] rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(46,139,255,0.55), transparent 62%)" }}
        />
        <div
          className="aurora-b absolute -right-[12%] top-[6%] h-[70vh] w-[70vh] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(89,200,255,0.6), transparent 62%)" }}
        />
        <div
          className="aurora-a absolute -bottom-[25%] left-[18%] h-[80vh] w-[80vh] rounded-full opacity-55 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(30,63,208,0.5), transparent 62%)" }}
        />
      </div>
      {/* Optional living-ASCII fog over the aurora (WebGPU only). */}
      {!fallback && mod && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 opacity-[0.18] mix-blend-multiply"
        >
          <mod.Shader disableTelemetry style={{ width: "100%", height: "100%" }}>
            <mod.Ascii characters="·:+=*#%@" cellSize={12}>
              <mod.FractalNoise colorA="#0b1e6b" colorB="#59c8ff" />
            </mod.Ascii>
          </mod.Shader>
        </div>
      )}
    </>
  );
}
