// Hidden shader-evaluation lab (not linked from SiteNav; noindex). Compares the current
// homegrown ASCII/dither art (AsciiFog, CardFog, glyphs) against @paper-design/shaders-react's
// Dithering shader, tuned to the brand palette, so the owner can judge a swap in-situ.
// Delete this route (and the dep) if the shader is rejected.
import type { Metadata } from "next";
import { LabDither } from "./LabDither";

export const metadata: Metadata = {
  title: "Dither lab",
  robots: { index: false, follow: false },
};

export default function LabDitherPage() {
  return <LabDither />;
}
