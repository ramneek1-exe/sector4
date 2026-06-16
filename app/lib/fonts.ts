import { Bebas_Neue, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";

// Display — the SECTOR 4 wordmark ONLY.
export const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
// Data labels, driver codes, card headers.
export const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
// ASCII / mono numerals.
export const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
// Serif body — self-hosted Lastik (owner-supplied web fonts).
export const lastik = localFont({
  src: [
    { path: "../fonts/lastik/Lastik-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/lastik/Lastik-Regular.woff", weight: "400", style: "normal" },
  ],
  variable: "--font-lastik",
  display: "swap",
});

export const fontVars = `${bebas.variable} ${grotesk.variable} ${mono.variable} ${lastik.variable}`;
