// Shared geometry for the measures: rounding, boxes, segments and paths, and the drawn parts of
// nodes and groups.
import type { Box, Direction, Point, SceneGroup, SceneNode } from "../types.ts";

export const EPS = 0.5;
export const r1 = (v: number) => Math.round(v * 10) / 10;
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const real = (b?: Box): b is Box => !!b && b.w > 0 && b.h > 0;

export function union(list: (Box | undefined)[]): Box | undefined {
  const l = list.filter(real);
  if (!l.length) return undefined;
  const x = Math.min(...l.map((b) => b.x));
  const y = Math.min(...l.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...l.map((b) => b.x + b.w)) - x,
    h: Math.max(...l.map((b) => b.y + b.h)) - y,
  };
}

export function interArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export const inBox = (x: number, y: number, b: Box) =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** Length of segment pq inside box b shrunk by inset (Liang-Barsky). */
function clipLen(p: Point, q: Point, b: Box, inset = 0): number {
  const box = { x: b.x + inset, y: b.y + inset, w: b.w - 2 * inset, h: b.h - 2 * inset };
  if (box.w <= 0 || box.h <= 0) return 0;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const sides: [number, number][] = [
    [-dx, p.x - box.x],
    [dx, box.x + box.w - p.x],
    [-dy, p.y - box.y],
    [dy, box.y + box.h - p.y],
  ];
  for (const [pp, qq] of sides) {
    if (pp === 0) {
      if (qq < 0) return 0;
    } else {
      const r = qq / pp;
      if (pp < 0) {
        if (r > t1) return 0;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return 0;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 < t1 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
}

export function pathClipLen(points: Point[], b: Box, inset = 0): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i];
    const q = points[i + 1];
    if (p && q) total += clipLen(p, q, b, inset);
  }
  return total;
}

export const segments = (points: Point[]): [Point, Point][] =>
  points.slice(1).flatMap((q, i) => {
    const p = points[i];
    return p ? [[p, q] as [Point, Point]] : [];
  });

export const pathLen = (points: Point[]) =>
  segments(points).reduce((s, [p, q]) => s + Math.hypot(q.x - p.x, q.y - p.y), 0);

/** Drops repeated and collinear points, so a jog is a real bend. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Point, Point, Point];
      if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 0.01)
        out.splice(out.length - 2, 1);
      else break;
    }
  }
  return out;
}

/** The point half way along a path. */
export function midpoint(points: Point[]): Point {
  const half = pathLen(points) / 2;
  let walked = 0;
  for (const [p, q] of segments(points)) {
    const l = Math.hypot(q.x - p.x, q.y - p.y);
    if (walked + l >= half && l > 0) {
      const t = (half - walked) / l;
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    }
    walked += l;
  }
  return points[0] ?? { x: 0, y: 0 };
}

export const horizontalFlow = (d: Direction) => d === "right" || d === "left";
export const along = (d: Direction, dx: number, dy: number) =>
  d === "right" ? dx : d === "left" ? -dx : d === "down" ? dy : -dy;

export function footprint(n: SceneNode): Box {
  return union([n.box, n.iconBox, n.labelBox, n.noteBox]) ?? n.box;
}

/** The surface-colored chip a group header draws over edges (as check.ts and svg.ts do). */
export function headerChip(g: SceneGroup): Box | undefined {
  if (!g.label.lines.length) return undefined;
  const parts = g.overlay && g.iconBox ? [g.labelBox, g.iconBox] : [g.labelBox];
  const u = union(parts);
  return u ? { x: u.x - 4, y: u.y - 1, w: u.w + 8, h: u.h + 2 } : undefined;
}

/** The badge pill: the layout's box, else where the renderer puts it. */
export function badgeRect(n: SceneNode): Box | undefined {
  if (!n.badge) return undefined;
  if (n.badgeBox) return n.badgeBox;
  const anchor = n.look === "icon" ? n.iconBox : n.box;
  if (!anchor) return undefined;
  const w = Math.max(18, 8 + n.badge.length * 6.4);
  return { x: anchor.x + anchor.w - w / 2 - 2, y: anchor.y - 7, w, h: 16 };
}

/** Where a group's content may start: below its header. */
function headerBottom(g: SceneGroup): number {
  if (g.overlay) return g.box.y;
  const parts = [g.labelBox, g.iconBox].filter(real);
  return Math.max(g.box.y, ...parts.map((b) => b.y + b.h));
}

/** The top left of a group's content: a pool or lane keeps its label strip across the flow. */
export function contentStart(g: SceneGroup): Point {
  if (!g.lane) return { x: g.box.x, y: headerBottom(g) };
  const s = g.lane.header;
  return g.lane.horizontal ? { x: s.x + s.w, y: g.box.y } : { x: g.box.x, y: s.y + s.h };
}

interface Run {
  axis: "h" | "v";
  len: number;
  sign: number;
}

/** An edge's straight runs, or undefined when one is neither horizontal nor vertical. */
export function orthogonalRuns(points: Point[]): Run[] | undefined {
  const out: Run[] = [];
  for (const [p, q] of segments(simplify(points))) {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    if (Math.abs(dy) < EPS) out.push({ axis: "h", len: Math.abs(dx), sign: Math.sign(dx) });
    else if (Math.abs(dx) < EPS) out.push({ axis: "v", len: Math.abs(dy), sign: Math.sign(dy) });
    else return undefined;
  }
  return out;
}
