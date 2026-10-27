// Candidate routes for an edge drawn after ELK (constraint: false, overlay ends, grid cells, align
// blocks): the tests a route must pass, and laneRoutes, the elbows a free edge may take.

import type { Box, Point } from "../types.ts";
import { round, segmentHits, segmentsOf, within } from "./geometry.ts";

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
  /** How long that run is: HEAD_ROOM unless the skin draws a longer head (headRoomFor). */
  room?: number;
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

/** The stage skin draws its open chevrons at this length per hairline (render/stage/draw-edges.ts). */
const STAGE_HEAD = 6;
/** The display width the stage skin scales its hairline to (render/stage/index.ts). */
const STAGE_DISPLAY = 880;

/** How long the stage skin draws an arrowhead on a drawing `width` px wide (check DG222 too). */
export const stageHead = (width: number): number => STAGE_HEAD * Math.max(1, width / STAGE_DISPLAY);

/**
 * The straight run kept in front of an arrowhead on a drawing `width` px wide: HEAD_ROOM, or on
 * the stage skin, whose head grows with the width past its display width, that head and 1px.
 */
export const headRoomFor = (skin: string | undefined, width: number): number =>
  skin === "stage" ? Math.max(HEAD_ROOM, Math.ceil(stageHead(width)) + 1) : HEAD_ROOM;

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
  label?: { w: number; h: number },
): Point[][] {
  const out = exits(a, b, label);
  if (out.length) return out;
  const sideBySide = a.full.x + a.full.w <= b.full.x || b.full.x + b.full.w <= a.full.x;
  const stacked = a.full.y + a.full.h <= b.full.y || b.full.y + b.full.h <= a.full.y;
  const order = across ? [sideBySide, !sideBySide && stacked] : [!stacked && sideBySide, stacked];
  out.push(
    ...(order[0] ? lanesFor(a, b, heads, borders, true) : []),
    ...(order[1] ? lanesFor(a, b, heads, borders, false) : []),
  );
  // The other family as a fallback when the boxes allow it.
  if (sideBySide && stacked) out.push(...lanesFor(a, b, heads, borders, !across));
  return out;
}

/**
 * When one end lies inside the other (a node and the group around it), the straight runs from
 * the inner end out to the outer one's border, the nearest side first: a side face at the icon's
 * center line, or the top or bottom of the node with its text. A run too short for the edge's
 * label beside it (`label`, its width and height) and 12px goes last. None otherwise.
 */
export function exits(a: RouteEnd, b: RouteEnd, label = { w: 0, h: 0 }): Point[][] {
  if (within(b.full, a.full)) return exits(b, a, label).map((p) => [...p].reverse());
  if (!within(a.full, b.full)) return [];
  const { side, full } = a;
  const outer = b.full;
  const cx = round(side.x + side.w / 2);
  const cy = round(side.y + side.h / 2);
  const [left, right] = [side.x, side.x + side.w];
  const [top, bottom] = [full.y, full.y + full.h];
  const across = label.w + 12;
  const down = label.h + 12;
  return [
    {
      d: left - outer.x,
      need: across,
      p: [
        { x: left, y: cy },
        { x: outer.x, y: cy },
      ],
    },
    {
      d: outer.x + outer.w - right,
      need: across,
      p: [
        { x: right, y: cy },
        { x: outer.x + outer.w, y: cy },
      ],
    },
    {
      d: top - outer.y,
      need: down,
      p: [
        { x: cx, y: top },
        { x: cx, y: outer.y },
      ],
    },
    {
      d: outer.y + outer.h - bottom,
      need: down,
      p: [
        { x: cx, y: bottom },
        { x: cx, y: outer.y + outer.h },
      ],
    },
  ]
    .sort((m, n) => Number(m.d < m.need) - Number(n.d < n.need) || m.d - n.d)
    .map((w) => w.p);
}

/**
 * A self loop on each corner of an end, the top right one first as ELK draws it: out of the top
 * (or bottom) face 14px in from the corner, round the corner 18px out, and back into the side
 * face 14px from the corner.
 */
export function loops(end: RouteEnd): Point[][] {
  const { side, full } = end;
  const size = 18;
  const inset = Math.max(4, Math.min(14, side.w / 2 - 2, side.h / 2 - 2));
  return [true, false].flatMap((top) =>
    [true, false].map((right) => {
      const sx = right ? 1 : -1;
      const sy = top ? -1 : 1;
      const x = right ? side.x + side.w : side.x;
      const y = top ? full.y : full.y + full.h;
      const into = top ? side.y + inset : side.y + side.h - inset;
      return [
        { x: x - sx * inset, y },
        { x: x - sx * inset, y: y + sy * size },
        { x: x + sx * size, y: y + sy * size },
        { x: x + sx * size, y: into },
        { x, y: into },
      ].map((p) => ({ x: round(p.x), y: round(p.y) }));
    }),
  );
}

/** h: risers run across x between side faces; otherwise across y between top and bottom faces. */
function lanesFor(a: RouteEnd, b: RouteEnd, heads: Heads, borders: Box[], h: boolean): Point[][] {
  const out: Point[][] = [];
  const room = heads.room ?? HEAD_ROOM;
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
      (u - s) * dir >= (heads.start ? room : 8) && (t - u) * dir >= (heads.end ? room : 8);
    const mid = s + (t - s) * RISER;
    const roomy = dir > 0 ? Math.min(mid, t - room) : Math.max(mid, t + room);
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
      s + room * dir,
      t - room * dir,
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
    if ((u - s) * dir >= 8 && Math.abs(end - s0) >= (heads.end ? room : 8))
      out.push([pt(s, s0), pt(u, s0), pt(u, end)]);
  }
  const [a0, a1] = cross(h ? a.full : a.side);
  if (t0 < a0 || t0 > a1) {
    const u = h ? cx(a.side) : cy(a.side);
    const start = t0 < a0 ? a0 : a1;
    if ((t - u) * dir >= (heads.end ? room : 8) && Math.abs(t0 - start) >= 8)
      out.push([pt(u, start), pt(u, t0), pt(t, t0)]);
  }
  return out;
}
