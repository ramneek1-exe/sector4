import localFont from "next/font/local";

// All four faces are SELF-HOSTED via next/font/local — no build-time fetch to
// fonts.gstatic.com (that fetch fails in the Vercel build environment, so
// next/font/google is not usable here). The woff2 originate from the OFL-licensed
// Bebas Neue / Space Grotesk / JetBrains Mono (via Fontsource) + owner-supplied Lastik.

// Display — the SECTOR 4 wordmark ONLY.
export const bebas = localFont({
  src: [{ path: "../fonts/google/bebas-neue-400.woff2", weight: "400", style: "normal" }],
  variable: "--font-bebas",
  display: "swap",
});
// Data labels, driver codes, card headers.
export const grotesk = localFont({
  src: [
    { path: "../fonts/google/space-grotesk-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/google/space-grotesk-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-grotesk",
  display: "swap",
});
// ASCII / mono numerals.
export const mono = localFont({
  src: [{ path: "../fonts/google/jetbrains-mono-400.woff2", weight: "400", style: "normal" }],
  variable: "--font-mono",
  display: "swap",
});
// Serif body — self-hosted Lastik (owner-supplied web fonts).
export const lastik = localFont({
  src: [
    { path: "../fonts/lastik/Lastik-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/lastik/Lastik-Regular.woff", weight: "400", style: "normal" },
  ],
  variable: "--font-lastik",
  display: "swap",
});

// Pixel serif — display moments (answer numbers, section headers, future landing). PP Mondwest.
// WOFF2 (~52% smaller than the .otf) — the .otf stays on disk for app/opengraph-image.tsx,
// which uses satori and can't read WOFF2.
export const pixelSerif = localFont({
  src: [{ path: "../fonts/bitmap/PPMondwest-Regular.woff2", weight: "400", style: "normal" }],
  variable: "--font-pixel-serif",
  display: "swap",
});
// Pixel sans — small "computer" accents. PP NeueBit Bold. WOFF2, same reasoning as above
// (no satori consumer needs this one's .otf, but it's left on disk regardless).
export const pixel = localFont({
  src: [{ path: "../fonts/bitmap/PPNeueBit-Bold.woff2", weight: "700", style: "normal" }],
  variable: "--font-pixel",
  display: "swap",
});

export const fontVars = `${bebas.variable} ${grotesk.variable} ${mono.variable} ${lastik.variable} ${pixelSerif.variable} ${pixel.variable}`;
