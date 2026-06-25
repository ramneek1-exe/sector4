import { ImageResponse } from "next/og";

// iOS home-screen / share icon. Generated so there's no binary asset to maintain;
// mirrors the favicon (S4 lettermark + accent underline on ink).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B1020",
          color: "#FAFAFA",
          fontFamily: "sans-serif",
          fontWeight: 800,
        }}
      >
        <div style={{ display: "flex", fontSize: 96, letterSpacing: 2 }}>S4</div>
        <div
          style={{
            display: "flex",
            width: 66,
            height: 9,
            background: "#2E8BFF",
            borderRadius: 5,
            marginTop: 8,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
