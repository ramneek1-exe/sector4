import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Favicon: "S4" in Bebas Neue (the wordmark face) on the ink background. Generated as a
// PNG via satori so the real font is rasterised in — an SVG <text> favicon can't load the
// web font, and PNG favicons render everywhere.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  const bebas = readFileSync(join(process.cwd(), "app/fonts/og/bebas.ttf"));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B1020",
          border: "2px solid #39477F", // holds the tile edge on dark chrome; subtle on light
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", fontFamily: "Bebas", fontSize: 46, letterSpacing: 1, lineHeight: 1, color: "#FAFAFA" }}>
          S4
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Bebas", data: bebas, style: "normal", weight: 400 }] },
  );
}
