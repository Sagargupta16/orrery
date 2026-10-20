// Geometry the composition checks share: box and segment tests, rounding, and drawn footprints.
import type { Box, Point, Scene, SceneNode } from "../types.ts";

export const overlaps = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/** Geometry tolerance in px: touching edges and sub-pixel rounding are not findings. */
export const EPS = 0.5;
export const tenth = (v: number) => Math.round(v * 10) / 10;
export const boxOf = (b: Box) => ({ x: tenth(b.x), y: tenth(b.y), w: tenth(b.w), h: tenth(b.h) });
export const pointOf = (p: Point) => ({ x: tenth(p.x), y: tenth(p.y) });
const same = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** A round step badge (its box is the circle's bounding square) against a rectangle. */
export function circleHitsBox(c: Box, b: Box): boolean {
  const r = c.w / 2;
  const cx = c.x + r;
  const cy = c.y + c.h / 2;
  const nx = Math.min(Math.max(cx, b.x), b.x + b.w);
  const ny = Math.min(Math.max(cy, b.y), b.y + b.h);
  return Math.hypot(cx - nx, cy - ny) < r - EPS;
}

/** What the header chip of a group covers: the label, plus an overlay legend's icon on its row. */
export function headerChip(g: Scene["groups"][number]): Box | undefined {
  if (!g.label.lines.length) return undefined;
  const b = g.labelBox;
  const icon = g.overlay ? g.iconBox : undefined;
  const parts = icon && icon.y < b.y + b.h && b.y < icon.y + icon.h ? [b, icon] : [b];
  const x = Math.min(...parts.map((b) => b.x));
  const y = Math.min(...parts.map((b) => b.y));
  const r = Math.max(...parts.map((b) => b.x + b.w));
  const bt = Math.max(...parts.map((b) => b.y + b.h));
  return { x: x - 4, y: y - 1, w: r - x + 8, h: bt - y + 2 };
}

/** The pill a node badge draws: the layout's box, else the renderer's own placement. */
export function badgeRect(n: SceneNode): Box | undefined {
  if (!n.badge) return undefined;
  if (n.badgeBox) return n.badgeBox;
  const anchor = n.look === "icon" ? n.iconBox : n.box;
  if (!anchor) return undefined;
  const w = Math.max(18, 8 + n.badge.length * 6.4);
  return { x: anchor.x + anchor.w - w / 2 - 2, y: anchor.y - 7, w, h: 16 };
}

/** The drawn pieces of a node, most specific first, so a finding can name what was hit. */
export function nodeParts(n: SceneNode): { what: string; box: Box }[] {
  const parts: { what: string; box: Box }[] = [];
  const add = (what: string, box?: Box) => {
    if (box && box.w > 0 && box.h > 0) parts.push({ what, box });
  };
  add("label", n.labelBox);
  add("note", n.noteBox);
  if (n.iconBox && !same(n.iconBox, n.box)) add("icon", n.iconBox);
  add(n.look === "icon" ? "icon" : "shape", n.box);
  return parts;
}

export function segmentHitsBox(p: Point, q: Point, b: Box, inset = 3): boolean {
  const box = { x: b.x + inset, y: b.y + inset, w: b.w - inset * 2, h: b.h - inset * 2 };
  if (box.w <= 0 || box.h <= 0) return false;
  // Liang-Barsky clip of segment pq against the box.
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const edges: [number, number][] = [
    [-dx, p.x - box.x],
    [dx, box.x + box.w - p.x],
    [-dy, p.y - box.y],
    [dy, box.y + box.h - p.y],
  ];
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return false;
    } else {
      const r = qq / pp;
      if (pp < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 < t1;
}

/** The first segment of a path that `hit` accepts, as its two end points. */
export function firstSegment(
  pts: Point[],
  hit: (p: Point, q: Point) => boolean,
): [Point, Point] | undefined {
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    if (p && q && hit(p, q)) return [p, q];
  }
  return undefined;
}

/** Shortest distance between segment pq and box b; 0 when they touch. */
export function segmentBoxDistance(p: Point, q: Point, b: Box): number {
  if (segmentHitsBox(p, q, b, 0)) return 0;
  const toSegment = (x: number, y: number) => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const t = Math.max(
      0,
      Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    return Math.hypot(p.x + t * dx - x, p.y + t * dy - y);
  };
  const toBox = (x: number, y: number) =>
    Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));
  const corners: [number, number][] = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ];
  return Math.min(toBox(p.x, p.y), toBox(q.x, q.y), ...corners.map(([x, y]) => toSegment(x, y)));
}

/** The box around every drawn box (a zero-size one counts when it has width or height). */
export function hull(boxes: (Box | undefined)[]): Box | undefined {
  const bs = boxes.filter((b): b is Box => !!b && (b.w > 0 || b.h > 0));
  if (!bs.length) return undefined;
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...bs.map((b) => b.x + b.w)) - x,
    h: Math.max(...bs.map((b) => b.y + b.h)) - y,
  };
}

/** The box around a path's points. */
export function pathBox(pts: Point[]): Box | undefined {
  if (!pts.length) return undefined;
  const x = Math.min(...pts.map((p) => p.x));
  const y = Math.min(...pts.map((p) => p.y));
  return {
    x,
    y,
    w: Math.max(...pts.map((p) => p.x)) - x,
    h: Math.max(...pts.map((p) => p.y)) - y,
  };
}
