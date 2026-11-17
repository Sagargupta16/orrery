// The scene measures the aspect search and the hint fallbacks compare: crossings, edges through
// nodes, arrowheads against the flow, the longest edge, and the hard defects the review counts
// (sceneDefects).

import type { Box, Point, Scene } from "../types.ts";
import { clip, meet, type Seg, segmentHits, segmentsOf } from "./geometry.ts";
import { horizontalFlow } from "./plan.ts";

/**
 * Whether segments pq and st cross more than 1.5px inside both, as the review's layout.crossings
 * counts them (review/layout.ts edgeCrossings): two edges that share a node cross too when their
 * lines do, away from the shared end.
 */
function crosses(p: Point, q: Point, s: Point, t: Point): boolean {
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = t.x - s.x;
  const sy = t.y - s.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return false;
  const u = ((s.x - p.x) * sy - (s.y - p.y) * sx) / den;
  const v = ((s.x - p.x) * ry - (s.y - p.y) * rx) / den;
  const e1 = 1.5 / (Math.hypot(rx, ry) || 1);
  const e2 = 1.5 / (Math.hypot(sx, sy) || 1);
  return u > e1 && u < 1 - e1 && v > e2 && v < 1 - e2;
}

/** Segment pairs of two edges that cross, counted as the review counts them. */
export function sceneCrossings(scene: Scene): number {
  let count = 0;
  const lines = scene.edges.map((e) => segmentsOf(e.points));
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++)
      for (const [p, q] of lines[i] ?? [])
        for (const [s, t] of lines[j] ?? []) if (crosses(p, q, s, t)) count++;
  return count;
}

/** Arrowheads that point back against the flow by more than 8px, as layout.against-flow counts. */
export function againstFlow(scene: Scene): number {
  const along = (dx: number, dy: number) =>
    scene.direction === "right"
      ? dx
      : scene.direction === "left"
        ? -dx
        : scene.direction === "down"
          ? dy
          : -dy;
  return scene.edges.filter((e) => {
    const a = e.points[0];
    const b = e.points.at(-1);
    return e.arrow === "end" && !!a && !!b && along(b.x - a.x, b.y - a.y) < -8;
  }).length;
}

/** The length of the longest edge route, in px. */
export function longestEdge(scene: Scene): number {
  return Math.max(
    0,
    ...scene.edges.map((e) =>
      segmentsOf(e.points).reduce((t, [p, q]) => t + Math.hypot(q.x - p.x, q.y - p.y), 0),
    ),
  );
}

/** Edges that run through a node they do not connect (DG201 reads the box shrunk by 3px). */
export function edgesThroughNodes(scene: Scene): number {
  let count = 0;
  for (const e of scene.edges)
    for (const n of scene.nodes) {
      if (n.id === e.from || n.id === e.to) continue;
      if (segmentsOf(e.points).some(([p, q]) => segmentHits(p, q, n.box, 3))) count++;
    }
  return count;
}

const real = (b: Box | undefined): b is Box => !!b && b.w > 0 && b.h > 0;
const unionOf = (list: Box[]): Box => {
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...list.map((b) => b.x + b.w)) - x,
    h: Math.max(...list.map((b) => b.y + b.h)) - y,
  };
};
/** How much of the path runs inside b shrunk by `inset`, in px. */
const inLength = (segs: Seg[], b: Box, inset: number) =>
  segs.reduce((t, [p, q]) => {
    const c = clip(p, q, b, inset);
    return t + (c ? (c[1] - c[0]) * Math.hypot(q.x - p.x, q.y - p.y) : 0);
  }, 0);

/**
 * What the review counts as a hard defect and layout can see: an edge through a node, a header
 * or a label (another edge's, or a node's text), a label on a node or another label, and an
 * arrowhead under text or a node. Mirrors check.ts (DG201, DG202, DG209, DG212) and the review's
 * text and arrowhead checks, so a layout can tell which of two candidates is cleaner.
 */
export function sceneDefects(scene: Scene): number {
  const across = horizontalFlow(scene.direction);
  const tags = scene.edges.flatMap((e) =>
    [e.labelBox, e.stepBox].filter(real).map((box) => ({ id: e.id, box })),
  );
  const chips = scene.groups.flatMap((g) => {
    if (!g.label.lines.length) return g.iconBox ? [g.iconBox] : [];
    const icon = g.overlay ? g.iconBox : undefined;
    const b = g.labelBox;
    const u = unionOf(icon && icon.y < b.y + b.h && b.y < icon.y + icon.h ? [b, icon] : [b]);
    return [{ x: u.x - 4, y: u.y - 1, w: u.w + 8, h: u.h + 2 }, ...(g.iconBox ? [g.iconBox] : [])];
  });
  const feet = scene.nodes.map((n) =>
    unionOf([n.box, n.iconBox, n.labelBox, n.noteBox].filter(real)),
  );
  let count = 0;
  for (const e of scene.edges) {
    const segs = segmentsOf(e.points);
    for (const n of scene.nodes) {
      const own = n.id === e.from || n.id === e.to;
      if (!own && segs.some(([p, q]) => segmentHits(p, q, n.box, 3))) count++;
      // An icon node's own text only counts across the flow, where a line leaves beside it.
      if (own && (n.look !== "icon" || !across)) continue;
      for (const b of [n.labelBox, n.noteBox]) if (real(b) && inLength(segs, b, 1) > 1) count++;
    }
    for (const t of tags) if (t.id !== e.id && inLength(segs, t.box, 0.5) > 1) count++;
    for (const c of chips) if (inLength(segs, c, 0.5) > 1) count++;
    // Arrowheads (9 by 9 px) under a label, a step, a header or text, or on a node they miss.
    const ends: [Point | undefined, Point | undefined, string][] = [];
    if (e.arrow === "end" || e.arrow === "both")
      ends.push([e.points.at(-1), e.points.at(-2), e.to]);
    if (e.arrow === "start" || e.arrow === "both") ends.push([e.points[0], e.points[1], e.from]);
    for (const [tip, prev, target] of ends) {
      if (!tip || !prev) continue;
      const L = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
      const [ux, uy] = [(tip.x - prev.x) / L, (tip.y - prev.y) / L];
      const [bx, by] = [tip.x - ux * 9, tip.y - uy * 9];
      const head = unionOf([
        { x: tip.x, y: tip.y, w: 0, h: 0 },
        { x: bx - uy * 4.5, y: by + ux * 4.5, w: 0, h: 0 },
        { x: bx + uy * 4.5, y: by - ux * 4.5, w: 0, h: 0 },
      ]);
      const under = (b: Box | undefined) => {
        if (!real(b)) return false;
        const w = Math.min(head.x + head.w, b.x + b.w - 0.5) - Math.max(head.x, b.x + 0.5);
        const h = Math.min(head.y + head.h, b.y + b.h - 0.5) - Math.max(head.y, b.y + 0.5);
        return w > 0 && h > 0 && w * h > 0.5;
      };
      const covers = [
        ...tags.map((t) => t.box),
        ...chips,
        ...scene.nodes.flatMap((n) => [
          n.labelBox,
          n.noteBox,
          n.badgeBox,
          n.id === target ? undefined : (n.iconBox ?? n.box),
        ]),
      ];
      if (covers.some(under)) count++;
    }
  }
  for (const t of tags) for (const f of feet) if (meet(t.box, f, -1)) count++;
  for (let i = 0; i < tags.length; i++)
    for (let j = i + 1; j < tags.length; j++) {
      const [a, b] = [tags[i], tags[j]];
      if (a && b && a.id !== b.id && meet(a.box, b.box, -1)) count++;
    }
  return count;
}
