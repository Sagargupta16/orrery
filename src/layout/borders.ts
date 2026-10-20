// Runs moved off group border lines once every edge is drawn. ELK gives an edge that leaves a
// group a port on the group's border, at times right by a corner, and the run from that port then
// follows the border under its stroke (DG224). That run moves to the roomiest lane a few px to
// either side, its label with it, when nothing new is crossed and its ends stay on their sides.

import type { Box, Point, SceneEdge } from "../types.ts";
import type { Placed } from "./context.ts";
import { alongBorder, borderHug, HEAD_ROOM, nearTitle } from "./elbows.ts";
import { collinear, meet, round, type Seg, segmentHits, segmentsOf, union } from "./geometry.ts";

/** Lanes tried on each side of the border line, in px off it, the edge's own side first. */
const OFFSETS = [12, 10, 8, 16, 20, 24];
/** Room to the nearest parallel border or node beyond this makes a lane no better. */
const ENOUGH = 12;
/** DG221: a line closer than this to a node it does not connect reads as touching it. */
const SKIM = 10;
/** A line ends this far inside the corners of the side it meets. */
const CORNER = 8;

const real = (b: Box | undefined): b is Box => !!b && b.w > 0 && b.h > 0;
const grow = (b: Box, d: number): Box => ({
  x: b.x - d,
  y: b.y - d,
  w: b.w + 2 * d,
  h: b.h + 2 * d,
});

/** Moves every run that lies on a group border line off it, when a clear lane exists. */
export function clearBorders(ctx: Placed, edges: SceneEdge[]): void {
  if (ctx.model.routing !== "orthogonal") return;
  // Overlay borders step off the edges themselves (clearOverlayBorders).
  const borders = ctx.groups.filter((g) => !g.overlay).map((g) => g.box);
  for (const e of edges)
    for (let tries = 0; tries < 3; tries++) {
      const hug = borderHug(e.points, borders);
      if (!hug || !moveOff(ctx, edges, e, hug, borders)) break;
    }
}

function moveOff(
  ctx: Placed,
  edges: SceneEdge[],
  e: SceneEdge,
  hug: { i: number; line: number; box: Box },
  borders: Box[],
): boolean {
  const { nodes, groups, rel } = ctx;
  const { i, line, box } = hug;
  const pts = e.points;
  const p = pts[i];
  const q = pts[i + 1];
  if (!p || !q) return false;
  const upright = Math.abs(p.x - q.x) < 0.5;
  // The run moves across (k); its span along (j) stays.
  const k = upright ? "x" : "y";
  const j = upright ? "y" : "x";
  const at = p[k];
  const lo = Math.min(p[j], q[j]);
  const hi = Math.max(p[j], q[j]);
  const last = pts.length - 2;
  const ends = new Set([e.from, e.to]);
  const heads = {
    start: e.arrow === "start" || e.arrow === "both",
    end: e.arrow !== "none" && e.arrow !== "start",
  };
  const span = (b: Box) => (upright ? [b.y, b.y + b.h] : [b.x, b.x + b.w]) as [number, number];
  const cross = (b: Box) => (upright ? [b.x, b.x + b.w] : [b.y, b.y + b.h]) as [number, number];
  const overlapsRun = (b: Box) => Math.min(hi, span(b)[1]) - Math.max(lo, span(b)[0]) > 0;

  // A moved end slides along the side it meets and keeps off its corners and other ends there.
  const sideOf = (id: string, pt: Point): [number, number] | undefined => {
    const nd = nodes.find((x) => x.id === id);
    const boxes = nd ? [nd.iconBox, nd.box] : groups.filter((g) => g.id === id).map((g) => g.box);
    for (const b of boxes.filter(real)) {
      if (!span(b).some((v) => Math.abs(v - pt[j]) < 0.5)) continue;
      const [c0, c1] = cross(b);
      if (pt[k] >= c0 - 0.5 && pt[k] <= c1 + 0.5) return [c0, c1];
    }
    return undefined;
  };
  const endsElsewhere = edges.flatMap((o) => (o === e ? [] : [o.points[0], o.points.at(-1)]));
  const endFits = (id: string, pt: Point, v: number) => {
    const side = sideOf(id, pt);
    if (!side || v < side[0] + CORNER || v > side[1] - CORNER) return false;
    const moved = { ...pt, [k]: v };
    return !endsElsewhere.some(
      (o) => !!o && Math.abs(o.x - moved.x) < 4 && Math.abs(o.y - moved.y) < 4,
    );
  };

  // What the moved part must not newly reach: other nodes (10px off their box, 4px off their
  // text), group icons, other labels and its own unless the label moves with the run.
  const others = edges.filter((o) => o !== e);
  const tags = (o: SceneEdge) => [o.labelBox, o.stepBox].filter(real);
  const own = tags(e);
  const carry = own.length > 0 && beside(union(own), at, lo, hi, upright);
  const walls = [
    ...nodes
      .filter((n) => !ends.has(n.id))
      .flatMap((n) => [
        grow(n.box, SKIM),
        grow(union([n.box, n.iconBox, n.labelBox, n.noteBox].filter(real)), 4),
      ]),
    ...groups.flatMap((g) => (g.iconBox ? [grow(g.iconBox, 2)] : [])),
    ...others.flatMap(tags).map((b) => grow(b, 2)),
    ...(carry ? [] : own.map((b) => grow(b, 2))),
  ];
  const titles = groups.filter((g) => !g.overlay && g.label.lines.length).map((g) => g.labelBox);
  const holds = (gid: string) => [...ends].some((id) => id === gid || rel.above(id).includes(gid));
  const strangers = groups.filter((g) => !g.overlay && !holds(g.id)).map((g) => g.box);
  // A run inside a group that holds both ends stays inside it, rather than leave and come back.
  const homes = groups
    .filter(
      (g) => !g.overlay && [...ends].every((id) => id === g.id || rel.above(id).includes(g.id)),
    )
    .map((g) => g.box);
  const within = (path: Point[], b: Box) =>
    path.every(
      (pt) =>
        pt.x >= b.x - 0.5 &&
        pt.x <= b.x + b.w + 0.5 &&
        pt.y >= b.y - 0.5 &&
        pt.y <= b.y + b.h + 0.5,
    );
  const unrelated = others.filter((o) => !ends.has(o.from) && !ends.has(o.to));

  // The run and the two runs either side of it are what moves.
  const part = (path: Point[]) => path.slice(Math.max(0, i - 1), i + 3);
  const before = segmentsOf(part(pts));
  const crowded = nearTitle(part(pts), titles);
  const reaches = (segs: Seg[], b: Box, inset: number) =>
    segs.some(([a, c]) => segmentHits(a, c, b, inset));
  const turnsKept = (path: Point[]) =>
    [i - 1, i + 1].every((m) => {
      const a = path[m];
      const c = path[m + 1];
      const a0 = pts[m];
      const c0 = pts[m + 1];
      if (!a || !c || !a0 || !c0) return true;
      const was = c0[k] - a0[k];
      const now = c[k] - a[k];
      const need = (m === 0 && heads.start) || (m === last && heads.end) ? HEAD_ROOM : 8;
      return Math.sign(now) === Math.sign(was) && Math.abs(now) >= Math.min(need, Math.abs(was));
    });
  const room = (v: number) => {
    let r = ENOUGH;
    for (const b of borders.filter(overlapsRun))
      for (const s of cross(b)) r = Math.min(r, Math.abs(v - s));
    for (const n of nodes) {
      if (ends.has(n.id) || !overlapsRun(n.box)) continue;
      const [c0, c1] = cross(n.box);
      r = Math.min(r, v < c0 ? c0 - v : v > c1 ? v - c1 : 0);
    }
    return r;
  };

  const inward = (upright ? box.x + box.w / 2 : box.y + box.h / 2) > line ? 1 : -1;
  const side = Math.abs(at - line) > 0.5 ? Math.sign(at - line) : inward;
  let best: { path: Point[]; v: number; room: number } | undefined;
  for (const v of OFFSETS.flatMap((d) => [line + side * d, line - side * d]).map(round)) {
    const path = pts.map((pt, m) => (m === i || m === i + 1 ? { ...pt, [k]: v } : pt));
    const segs = segmentsOf(part(path));
    if (i === 0 && !endFits(e.from, p, v)) continue;
    if (i === last && !endFits(e.to, q, v)) continue;
    if (!turnsKept(path)) continue;
    if (borderHug(part(path), borders) || alongBorder(path.slice(i, i + 2), borders)) continue;
    if (!crowded && nearTitle(part(path), titles)) continue;
    if (walls.some((w) => reaches(segs, w, 0) && !reaches(before, w, 0))) continue;
    if (strangers.some((g) => reaches(segs, g, 4) && !reaches(before, g, 4))) continue;
    if (homes.some((b) => within(part(pts), b) && !within(part(path), b))) continue;
    if (unrelated.some((o) => segs.some(([a, c]) => collinear(o.points, a, c)))) continue;
    if (carry && !tagsFit(own, k, v - at, nodes, groups, others, titles)) continue;
    const r = room(v);
    if (!best || r > best.room) best = { path, v, room: r };
  }
  if (!best) return false;
  const dv = best.v - at;
  e.points = best.path;
  if (carry) {
    if (e.labelBox) e.labelBox = { ...e.labelBox, [k]: round(e.labelBox[k] + dv) };
    if (e.stepBox) e.stepBox = { ...e.stepBox, [k]: round(e.stepBox[k] + dv) };
  }
  return true;
}

/** Whether a label sits beside the run at `at` over lo..hi, within 12px of it. */
function beside(b: Box, at: number, lo: number, hi: number, upright: boolean): boolean {
  const [s0, s1] = upright ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
  if (Math.min(hi, s1) - Math.max(lo, s0) <= 0) return false;
  const [c0, c1] = upright ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
  return (c0 >= at - 1 && c0 - at <= 12) || (c1 <= at + 1 && at - c1 <= 12);
}

/** Whether a label moved with its run stays clear of nodes, headers, other labels and lines. */
function tagsFit(
  tags: Box[],
  k: "x" | "y",
  d: number,
  nodes: Placed["nodes"],
  groups: Placed["groups"],
  others: SceneEdge[],
  titles: Box[],
): boolean {
  const moved = tags.map((b) => ({ ...b, [k]: b[k] + d }));
  const blocks = [
    ...nodes.map((n) => union([n.box, n.iconBox, n.labelBox, n.noteBox].filter(real))),
    ...nodes.flatMap((n) => (real(n.badgeBox) ? [n.badgeBox] : [])),
    ...titles.map((t) => grow(t, 4)),
    ...groups.flatMap((g) => (real(g.iconBox) ? [g.iconBox] : [])),
    ...others.flatMap((o) => [o.labelBox, o.stepBox].filter(real)),
  ];
  // DG220: a label's chip on a border line breaks the frame there.
  const straddles = (b: Box) =>
    groups.filter(({ box: r }) => {
      const inside = (v: number, lo: number, len: number) => v > lo + 1 && v < lo + len - 1;
      const spans = (lo: number, len: number, a: number, alen: number) =>
        lo < a + alen - 0.5 && a < lo + len - 0.5;
      return (
        ((inside(r.y, b.y, b.h) || inside(r.y + r.h, b.y, b.h)) && spans(r.x, r.w, b.x, b.w)) ||
        ((inside(r.x, b.x, b.w) || inside(r.x + r.w, b.x, b.w)) && spans(r.y, r.h, b.y, b.h))
      );
    }).length;
  return moved.every(
    (b, m) =>
      straddles(b) <= straddles(tags[m] ?? b) &&
      !blocks.some((o) => meet(b, o, -1)) &&
      !others.some((o) => segmentsOf(o.points).some(([a, c]) => segmentHits(a, c, b, 0.5))),
  );
}
