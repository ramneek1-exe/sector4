import { ImageResponse } from "next/og";

// Link-preview card (iMessage, WhatsApp, Slack, Discord, X, …). Generated on-brand from
// the palette + tyre compound-stripe motif so there's no static binary to maintain.
export const alt = "Sector 4 — an explainer-led F1 weekend companion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B1020",
          color: "#FAFAFA",
          fontFamily: "sans-serif",
          padding: 80,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 8,
            color: "#2E8BFF",
          }}
        >
          F1 WEEKEND COMPANION
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 168,
            fontWeight: 800,
            letterSpacing: 6,
            lineHeight: 1,
            marginTop: 22,
          }}
        >
          SECTOR 4
        </div>
        {/* tyre compound-stripe accent (red + accent blue) */}
        <div style={{ display: "flex", marginTop: 26, marginBottom: 30 }}>
          <div style={{ display: "flex", width: 96, height: 9, borderRadius: 5, background: "#E10600" }} />
          <div style={{ display: "flex", width: 96, height: 9, borderRadius: 5, background: "#2E8BFF", marginLeft: 12 }} />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 40,
            textAlign: "center",
            maxWidth: 880,
            color: "rgba(250,250,250,0.74)",
          }}
        >
          Honest podium odds, strategy, and the numbers behind them.
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 50,
            display: "flex",
            fontSize: 26,
            letterSpacing: 3,
            color: "rgba(250,250,250,0.5)",
          }}
        >
          sector4.net
        </div>
      </div>
    ),
    { ...size },
  );
}
