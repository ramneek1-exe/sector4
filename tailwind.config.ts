import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FAFAFA",
        ink: "#0B1020",
        accent: "#2348E0",
        "accent-bright": "#2E8BFF",
        muted: "#5B6B8C",
      },
      fontFamily: {
        bebas: ["var(--font-bebas)", "sans-serif"],
        grotesk: ["var(--font-grotesk)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        lastik: ["var(--font-lastik)", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
