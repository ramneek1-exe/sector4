// Full-bleed aurora wash behind all content — a calm blue light gradient with
// slowly drifting blobs. It is intentionally NOT animated ASCII: the living-ASCII
// texture is confined to the action zone (see AsciiFog), not the whole page, so
// the motion stays where the user is looking. Works on every browser; the drift
// is disabled under prefers-reduced-motion (globals.css).
export function AuroraBackdrop() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-20 overflow-hidden"
      style={{ background: "linear-gradient(160deg, #EAF1FF 0%, #F3F6FC 50%, #E6ECFF 100%)" }}
    >
      <div
        className="aurora-a absolute -left-[15%] -top-[20%] h-[80vh] w-[80vh] rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(46,139,255,0.45), transparent 62%)" }}
      />
      <div
        className="aurora-b absolute -right-[12%] top-[6%] h-[70vh] w-[70vh] rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(89,200,255,0.5), transparent 62%)" }}
      />
      <div
        className="aurora-a absolute -bottom-[25%] left-[18%] h-[80vh] w-[80vh] rounded-full opacity-45 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(30,63,208,0.4), transparent 62%)" }}
      />
    </div>
  );
}
