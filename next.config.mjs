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
};
export default nextConfig;
