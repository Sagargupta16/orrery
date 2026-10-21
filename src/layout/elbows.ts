// Candidate routes for an edge drawn after ELK (constraint: false, overlay ends, grid cells, align
// blocks): the tests a route must pass, and laneRoutes, the elbows a free edge may take.

import type { Box, Point } from "../types.ts";
import { round, segmentHits, segmentsOf } from "./geometry.ts";

/** Whether any segment of the path runs through any of the boxes, each shrunk by `inset`. */
export const runsThrough = (points: Point[], boxes: Box[], inset = 1): boolean =>
  segmentsOf(points).some(([p, q]) => boxes.some((b) => segmentHits(p, q, b, inset)));

/** A free edge's end: what a horizontal line meets, and the whole node with its text. */
export interface RouteEnd {
  side: Box;
  full: Box;
  /** What is drawn there (icon, label, note): a detour keeps off these, not the empty corners. */
  parts?: Box[];
}

/** Arrowheads at the start and at the end, which keep a straight run in front of them. */
export interface Heads {
  start: boolean;
  end: boolean;
}

/** Straight run kept in front of an arrowhead so it does not sit on a bend. */
export const HEAD_ROOM = 16;
/** Riser position along the span, a little toward the source so the long run is the one into the head. */
const RISER = 0.45;
/** A line this close to a group border, and parallel to it, reads as running along it. */
const BORDER = 6;

/** A run this close to a group border and parallel to it lies on the border line (DG224). */
const ON_BORDER = 4;
/** ...over more than this; a shorter one is a corner or a crossing. */
const ON_BORDER_ALONG = 24;
/** A line closer than this to a group title's text crowds it (DG225). */
const TITLE_CLEAR = 6;

/**
 * The first straight run of the path that lies on a group border, as check DG224 measures it:
 * within 4px of the border line and parallel to it, over more than 24px. `line` is that border
 * line's x (for an upright run) or y, `box` the group's box.
 */
export function borderHug(
  points: Point[],
  borders: Box[],
): { i: number; line: number; box: Box } | undefined {
  for (const [i, [p, q]] of segmentsOf(points).entries()) {
    const flat = Math.abs(p.y - q.y) < 0.5;
    if (!flat && Math.abs(p.x - q.x) >= 0.5) continue;
    const [lo, hi] = flat
      ? [Math.min(p.x, q.x), Math.max(p.x, q.x)]
      : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
    const at = flat ? p.y : p.x;
    for (const box of borders) {
      const [from, to] = flat ? [box.x, box.x + box.w] : [box.y, box.y + box.h];
      if (Math.min(hi, to) - Math.max(lo, from) <= ON_BORDER_ALONG) continue;
      const sides = flat ? [box.y, box.y + box.h] : [box.x, box.x + box.w];
      const line = sides.find((v) => Math.abs(v - at) <= ON_BORDER);
      if (line !== undefined) return { i, line, box };
    }
  }
  return undefined;
}

/** Whether the path passes through a group title's text or within 6px beside it (DG225). */
export function nearTitle(points: Point[], titles: Box[]): boolean {
  const zones = titles.map((t) => ({
    x: t.x - TITLE_CLEAR,
    y: t.y,
    w: t.w + 2 * TITLE_CLEAR,
    h: t.h,
  }));
  return segmentsOf(points).some(([p, q]) => zones.some((z) => segmentHits(p, q, z, 0)));
}

/** A route off every group border line and clear beside every title (DG224, DG225). */
export const clearOfFrames = (points: Point[], borders: Box[], titles: Box[]): boolean =>
  !borderHug(points, borders) && !nearTitle(points, titles);

/** Whether a segment of the path runs along a group border for more than `min` px. */
export function alongBorder(points: Point[], borders: Box[], min = 12): boolean {
  return segmentsOf(points).some(([p, q]) => {
    const flat = Math.abs(p.y - q.y) < 0.5;
    if (!flat && Math.abs(p.x - q.x) >= 0.5) return false;
    const [lo, hi] = flat
      ? [Math.min(p.x, q.x), Math.max(p.x, q.x)]
      : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
    const at = flat ? p.y : p.x;
    return borders.some((b) => {
      const [from, to] = flat ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
      if (Math.min(hi, to) - Math.max(lo, from) < min) return false;
      const sides = flat ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
      return sides.some((v) => Math.abs(v - at) < BORDER);
    });
  });
}

/**
 * More elbows for a free edge between two boxes: the riser at 0.45 of the span toward the
 * source, kept a head room clear of each arrowhead, moved off group borders it would run along,
 * and next to either stub; then the two L shapes. Every candidate is orthogonal; the caller keeps
 * the first that clears its obstacles. Boxes both side by side and one above the other get both
 * families, the one that follows the flow (`across`) first.
 */
export function laneRoutes(
  a: RouteEnd,
  b: RouteEnd,
  heads: Heads,
  borders: Box[],
  across = true,
): Point[][] {
  const sideBySide = a.full.x + a.full.w <= b.full.x || b.full.x + b.full.w <= a.full.x;
  const stacked = a.full.y + a.full.h <= b.full.y || b.full.y + b.full.h <= a.full.y;
  const order = across ? [sideBySide, !sideBySide && stacked] : [!stacked && sideBySide, stacked];
  const out = [
    ...(order[0] ? lanesFor(a, b, heads, borders, true) : []),
    ...(order[1] ? lanesFor(a, b, heads, borders, false) : []),
  ];
  // The other family as a fallback when the boxes allow it.
  if (sideBySide && stacked) out.push(...lanesFor(a, b, heads, borders, !across));
  return out;
}

/** h: risers run across x between side faces; otherwise across y between top and bottom faces. */
function lanesFor(a: RouteEnd, b: RouteEnd, heads: Heads, borders: Box[], h: boolean): Point[][] {
  const out: Point[][] = [];
  const cx = (r: Box) => r.x + r.w / 2;
  const cy = (r: Box) => r.y + r.h / 2;
  const A = h ? a.side : a.full;
  const B = h ? b.side : b.full;
  const along = (r: Box) => (h ? r.x : r.y);
  const size = (r: Box) => (h ? r.w : r.h);
  const forward = along(A) + size(A) <= along(B);
  const s = forward ? along(A) + size(A) : along(A);
  const t = forward ? along(B) : along(B) + size(B);
  const dir = forward ? 1 : -1;
  const s0 = h ? cy(a.side) : cx(a.side);
  const t0 = h ? cy(b.side) : cx(b.side);
  const pt = (u: number, v: number): Point =>
    h ? { x: round(u), y: round(v) } : { x: round(v), y: round(u) };
  if (Math.abs(s0 - t0) >= 1) {
    const ok = (u: number) =>
      (u - s) * dir >= (heads.start ? HEAD_ROOM : 8) &&
      (t - u) * dir >= (heads.end ? HEAD_ROOM : 8);
    const mid = s + (t - s) * RISER;
    const roomy = dir > 0 ? Math.min(mid, t - HEAD_ROOM) : Math.max(mid, t + HEAD_ROOM);
    const [lo, hi] = [Math.min(s0, t0), Math.max(s0, t0)];
    const lines = borders.flatMap((g) => {
      const [from, to] = h ? [g.y, g.y + g.h] : [g.x, g.x + g.w];
      if (hi <= from + BORDER || lo >= to - BORDER) return [];
      return h ? [g.x, g.x + g.w] : [g.y, g.y + g.h];
    });
    const onLine = (u: number) => lines.some((l) => Math.abs(u - l) <= BORDER);
    const off = (u: number) => {
      if (!onLine(u)) return u;
      for (const d of [-dir, dir])
        for (const k of [12, 24]) if (!onLine(u + d * k)) return u + d * k;
      return u;
    };
    const lanes = [
      off(roomy),
      roomy,
      mid,
      s + 24 * dir,
      t - 24 * dir,
      s + HEAD_ROOM * dir,
      t - HEAD_ROOM * dir,
    ];
    for (const u of new Set(lanes.map(round)))
      if (ok(u)) out.push([pt(s, s0), pt(u, s0), pt(u, t0), pt(t, t0)]);
  }
  // L shapes: leave A's facing side and enter B through the face across the flow, or the reverse.
  const cross = (r: Box): [number, number] => (h ? [r.y, r.y + r.h] : [r.x, r.x + r.w]);
  const [b0, b1] = cross(h ? b.full : b.side);
  if (s0 < b0 || s0 > b1) {
    const u = h ? cx(b.side) : cy(b.side);
    const end = s0 < b0 ? b0 : b1;
    if ((u - s) * dir >= 8 && Math.abs(end - s0) >= (heads.end ? HEAD_ROOM : 8))
      out.push([pt(s, s0), pt(u, s0), pt(u, end)]);
  }
  const [a0, a1] = cross(h ? a.full : a.side);
  if (t0 < a0 || t0 > a1) {
    const u = h ? cx(a.side) : cy(a.side);
    const start = t0 < a0 ? a0 : a1;
    if ((t - u) * dir >= (heads.end ? HEAD_ROOM : 8) && Math.abs(t0 - start) >= 8)
      out.push([pt(u, start), pt(u, t0), pt(t, t0)]);
  }
  return out;
}
