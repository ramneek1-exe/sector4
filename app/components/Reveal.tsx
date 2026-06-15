"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import gsap from "gsap";
import { readRevealEnv, shouldUseFallback } from "@/app/lib/reveal-fallback";

/**
 * Confirmed shaders.com API (v2.5.130, node_modules/shaders/dist/react):
 * - `Shader` (root) accepts `disableTelemetry`, `style`, `className`, and renders a
 *   <canvas> into its container. It establishes the WebGPU context.
 * - `Ascii` is a "Stylize" node with `requiresChild: true` / `requiresRTT: true`:
 *   it converts the RENDERED OUTPUT OF ITS CHILD SHADER NODE to ASCII art. It does
 *   NOT accept arbitrary React/DOM children as the thing being ASCII-ified.
 * - `DOMTexture` (the only path to capturing arbitrary DOM as a texture) is marked
 *   `experimental` in its component definition: "Requires Chrome Canary with
 *   chrome://flags/#canvas-draw-element enabled... Do not use for production use."
 *
 * Given this, ASCII-ifying the answer card's actual DOM content is not a viable,
 * production-safe option. Instead, the shader branch renders an ASCII-over-noise
 * decorative backdrop (`Ascii` wrapping a `FractalNoise` source, inside `Shader`
 * with `disableTelemetry`) behind the answer card during the reveal -- a faithful
 * use of what the package supports -- while the card content itself stays in
 * normal, always-readable DOM and fades in via GSAP exactly like the fallback path.
 *
 * The `shaders/react` module transitively imports `three/webgpu` at module scope,
 * so it is loaded via a runtime `import("shaders/react")` inside an effect
 * (client-only, after the fallback check), keeping SSR/no-WebGPU/build paths clean.
 */

type ShaderModule = {
  Shader: ComponentType<any>;
  Ascii: ComponentType<any>;
  FractalNoise: ComponentType<any>;
};

export function Reveal({ children, active }: { children: ReactNode; active: boolean }) {
  const [fallback, setFallback] = useState(true);
  const [shaderMod, setShaderMod] = useState<ShaderModule | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const useFallback = shouldUseFallback(readRevealEnv());
    setFallback(useFallback);
    if (!useFallback) {
      import("shaders/react")
        .then((mod) => {
          setShaderMod({ Shader: mod.Shader, Ascii: mod.Ascii, FractalNoise: mod.FractalNoise });
        })
        .catch(() => {
          // If the shader module fails to load for any reason, stay on the
          // GSAP fallback rather than breaking the reveal.
          setFallback(true);
        });
    }
  }, []);

  useEffect(() => {
    if (active && ref.current) {
      gsap.fromTo(ref.current, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" });
    }
  }, [fallback, active]);

  if (!active) return null;

  const useShader = !fallback && shaderMod;

  if (!useShader) {
    return (
      <div ref={ref}>
        {children}
        <ShadersAttribution />
      </div>
    );
  }

  const { Shader, Ascii, FractalNoise } = shaderMod;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-lg opacity-40">
        <Shader disableTelemetry style={{ width: "100%", height: "100%" }}>
          <Ascii characters="@%#*+=-:." cellSize={14}>
            <FractalNoise colorA="#000000" colorB="#3a3a3a" />
          </Ascii>
        </Shader>
      </div>
      <div ref={ref} className="relative">
        {children}
      </div>
      <ShadersAttribution />
    </div>
  );
}

function ShadersAttribution() {
  return (
    <a
      href="https://shaders.com"
      className="mt-2 block text-[10px] uppercase tracking-widest text-zinc-600"
      rel="noopener noreferrer"
      target="_blank"
    >
      Powered by Shaders
    </a>
  );
}
