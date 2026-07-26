/** @type {import('next').NextConfig} */
const nextConfig = {
  // Redirect www.sector4.net -> apex (308). Lives here, not vercel.json: Next.js owns
  // routing on Vercel, so vercel.json `redirects` are ignored for this project.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.sector4.net" }],
        destination: "https://sector4.net/:path*",
        permanent: true,
      },
    ];
  },
  // Baseline security headers beyond the HSTS Vercel already sets. No CSP yet — the
  // WebGPU/canvas dither shaders on `/` and `/lab/dither` would need script-src/worker-src
  // allowlisted carefully first; treat as a follow-up.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default nextConfig;
