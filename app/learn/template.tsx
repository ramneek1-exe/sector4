// Route-transition wrapper for all /learn pages (M6-B polish). Unlike layout.tsx, a
// template.tsx re-mounts on every navigation, so the `.learn-route` CSS animation replays
// each time the route changes within /learn — a short opacity crossfade that carries
// continuity between pages. The destination page's own `.learn-rise` cascade carries the
// directional motion, so this stays opacity-only (cheap, no full-page blur rasterization).
// Reduced-motion is handled in globals.css.
export default function LearnTemplate({ children }: { children: React.ReactNode }) {
  return <div className="learn-route">{children}</div>;
}
