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

const AURORA: React.CSSProperties = {
  background:
    "radial-gradient(120% 80% at 72% 18%, rgba(46,139,255,0.28) 0%, transparent 58%)," +
    "radial-gradient(120% 90% at 18% 82%, rgba(30,63,208,0.22) 0%, transparent 55%)," +
    "radial-gradient(90% 70% at 88% 92%, rgba(89,200,255,0.20) 0%, transparent 60%)," +
    "linear-gradient(160deg, #EEF6FF 0%, #F5F7FB 45%, #E7EEFF 100%)",
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
      <div aria-hidden className="fixed inset-0 -z-20" style={AURORA} />
      {!fallback && mod && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 opacity-[0.16] mix-blend-multiply"
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
