import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette (coolors: bee2f0-459ae4-2f2e89-addcef-406cd6-251f44). bg stays flat
        // near-white for legibility; ink/accent/fog carry the palette.
        bg: "#FAFAFA",
        ink: "#251F44", // darkest palette navy (was #0B1020)
        accent: "#2F2E89", // deep indigo — buttons, active nav, links (darker, was #406CD6)
        "accent-bright": "#406CD6", // royal blue for brighter/hover accents
        muted: "#6A6A93", // palette-tinted slate (was #5B6B8C)
      },
      fontFamily: {
        bebas: ["var(--font-bebas)", "sans-serif"],
        grotesk: ["var(--font-grotesk)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        lastik: ["var(--font-lastik)", "serif"],
        "pixel-serif": ["var(--font-pixel-serif)", "serif"],
        pixel: ["var(--font-pixel)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
