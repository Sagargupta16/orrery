// Box and point helpers the layout phases share.

import type { Box, Point } from "../types.ts";

export const round = (v: number) => Math.round(v * 100) / 100;

export const segmentBox = (p: Point, q: Point): Box => ({
  x: Math.min(p.x, q.x),
  y: Math.min(p.y, q.y),
  w: Math.abs(q.x - p.x),
  h: Math.abs(q.y - p.y),
});

export const contains = (outer: Box, b: Box): boolean =>
  b.x >= outer.x - 0.01 &&
  b.y >= outer.y - 0.01 &&
  b.x + b.w <= outer.x + outer.w + 0.01 &&
  b.y + b.h <= outer.y + outer.h + 0.01;

export function union(boxes: (Box | undefined)[]): Box {
  const list = boxes.filter((b): b is Box => !!b);
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  const w = Math.max(...list.map((b) => b.x + b.w)) - x;
  const h = Math.max(...list.map((b) => b.y + b.h)) - y;
  return { x, y, w, h };
}

/** Drops repeated points and points inside a straight run (draw.io would make them bends). */
export function dropStraightPoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    if (prev && last) {
      const cross = (last.x - prev.x) * (p.y - prev.y) - (last.y - prev.y) * (p.x - prev.x);
      const ahead = (last.x - prev.x) * (p.x - last.x) + (last.y - prev.y) * (p.y - last.y) >= 0;
      if (Math.abs(cross) < 0.01 && ahead) out.pop();
    }
    out.push(p);
  }
  return out.length >= 2 ? out : points;
}

/** A straight run of 16px in front of each arrowhead, so the head does not sit on a bend. */
export function headRoom(points: Point[], heads: { start: boolean; end: boolean }): boolean {
  const run = (p: Point | undefined, q: Point | undefined) =>
    p && q ? Math.abs(p.x - q.x) + Math.abs(p.y - q.y) : 0;
  const n = points.length;
  return (
    n < 3 ||
    ((!heads.start || run(points[0], points[1]) >= 16) &&
      (!heads.end || run(points[n - 2], points[n - 1]) >= 16))
  );
}

/** Whether a segment of the path runs on top of segment pq (parallel, within 6px, overlapping). */
export function collinear(points: Point[], p: Point, q: Point): boolean {
  const v = Math.abs(p.x - q.x) < 0.5;
  if (!v && Math.abs(p.y - q.y) >= 0.5) return false;
  const at = v ? p.x : p.y;
  const [b0, b1] = (v ? [p.y, q.y] : [p.x, q.x]).sort((m, n) => m - n);
  return points.slice(1).some((s, i) => {
    const r = points[i] ?? s;
    if (Math.abs(r.x - s.x) < 0.5 !== v || (!v && Math.abs(r.y - s.y) >= 0.5)) return false;
    if (Math.abs((v ? r.x : r.y) - at) >= 6) return false;
    const [a0, a1] = (v ? [r.y, s.y] : [r.x, s.x]).sort((m, n) => m - n);
    return Math.min(a1 ?? 0, b1 ?? 0) - Math.max(a0 ?? 0, b0 ?? 0) > 0.5;
  });
}

export function midpoint(points: Point[]): Point {
  const i = Math.max(0, Math.floor((points.length - 1) / 2));
  const a = points[i] ?? { x: 0, y: 0 };
  const b = points[i + 1] ?? a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Two boxes overlap once each grows by `pad` (a negative pad lets them touch). */
export const meet = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

export type Seg = readonly [Point, Point];

export const segmentsOf = (points: Point[]): Seg[] =>
  points.slice(1).map((q, i) => [points[i] ?? q, q] as const);

/** Does segment pq pass through the inside of b, shrunk by `inset` (Liang-Barsky)? */
export function segmentHits(p: Point, q: Point, b: Box, inset = 1): boolean {
  const c = clip(p, q, b, inset);
  return !!c && c[1] - c[0] > 1e-6;
}

/** The part of segment pq inside b shrunk by `inset`, as [t0, t1] along it (Liang-Barsky). */
export function clip(p: Point, q: Point, b: Box, inset: number): [number, number] | undefined {
  const x0 = b.x + inset;
  const y0 = b.y + inset;
  const x1 = b.x + b.w - inset;
  const y1 = b.y + b.h - inset;
  if (x1 <= x0 || y1 <= y0) return undefined;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [pp, qq] of [
    [-dx, p.x - x0],
    [dx, x1 - p.x],
    [-dy, p.y - y0],
    [dy, y1 - p.y],
  ] as const) {
    if (pp === 0) {
      if (qq <= 0) return undefined;
    } else {
      const r = qq / pp;
      if (pp < 0) {
        if (r > t1) return undefined;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return undefined;
        if (r < t1) t1 = r;
      }
    }
  }
  return t1 > t0 ? [t0, t1] : undefined;
}
