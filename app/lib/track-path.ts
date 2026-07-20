// Pure geometry for the landing's race-track spine (spec 2b). Given the sector
// numerals' centre points (in container pixel coords, S1..S4 order), produce one
// continuous SVG path: a short vertical straight at each anchor, smooth cubic
// S-curves between them. Segments are returned individually so the renderer can
// stripe kerbs onto the CURVE connectors only. Pure and server-safe by design.

export interface TrackAnchor {
  x: number;
  y: number;
}

export interface TrackSegment {
  d: string;
  kind: "straight" | "curve";
}

export interface TrackGeometry {
  d: string;
  segments: TrackSegment[];
  start: TrackAnchor;
  finish: TrackAnchor;
}

const fmt = (n: number) => String(Math.round(n));

export function buildTrackGeometry(
  anchors: TrackAnchor[],
  straightHalf = 60,
): TrackGeometry | null {
  if (anchors.length < 2) return null;

  // A straight may extend at most 40% of the tightest anchor gap, so the
  // connector between two close anchors always has positive span.
  let minGap = Infinity;
  for (let i = 1; i < anchors.length; i++) {
    minGap = Math.min(minGap, anchors[i].y - anchors[i - 1].y);
  }
  const half = Math.min(straightHalf, Math.max(8, minGap * 0.4));

  const segments: TrackSegment[] = [];
  const parts: string[] = [];

  const start = { x: anchors[0].x, y: anchors[0].y - half };
  parts.push(`M ${fmt(start.x)} ${fmt(start.y)}`);

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    // Straight through the anchor: top -> bottom.
    const top = { x: a.x, y: a.y - half };
    const bottom = { x: a.x, y: a.y + half };
    segments.push({
      d: `M ${fmt(top.x)} ${fmt(top.y)} L ${fmt(bottom.x)} ${fmt(bottom.y)}`,
      kind: "straight",
    });
    parts.push(`L ${fmt(bottom.x)} ${fmt(bottom.y)}`);

    // Connector to the next anchor's straight (cubic; vertical tangents at both
    // ends so it meets the straights smoothly).
    const next = anchors[i + 1];
    if (next) {
      const from = bottom;
      const to = { x: next.x, y: next.y - half };
      const span = to.y - from.y;
      const c1 = { x: from.x, y: from.y + span * 0.5 };
      const c2 = { x: to.x, y: to.y - span * 0.5 };
      const d =
        `M ${fmt(from.x)} ${fmt(from.y)} C ${fmt(c1.x)} ${fmt(c1.y)} ` +
        `${fmt(c2.x)} ${fmt(c2.y)} ${fmt(to.x)} ${fmt(to.y)}`;
      segments.push({ d, kind: from.x === to.x ? "straight" : "curve" });
      parts.push(
        `C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(to.x)} ${fmt(to.y)}`,
      );
    }
  }

  const last = anchors[anchors.length - 1];
  const finish = { x: last.x, y: last.y + half };

  return {
    d: parts.join(" "),
    segments,
    start: { x: Math.round(start.x), y: Math.round(start.y) },
    finish: { x: Math.round(finish.x), y: Math.round(finish.y) },
  };
}
