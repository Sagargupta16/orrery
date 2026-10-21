// Where an edge end meets what it points at. Each node and group has four faces: an icon node's
// are its tile's (the text under the icon is no face: a line from the bottom leaves below it, and
// the strip beside the icon is free, so a side line meets the tile at its center line); a card,
// shape or group's are its box's. An end's face is read from its last run, and the ends on one
// face take slots around its center. Layout (straighten.ts, bends.ts) and the review share these.

import type { Box, Point, SceneEdge, SceneGroup, SceneNode } from "../types.ts";
import { ENDS } from "./sizes.ts";

export type Side = "top" | "bottom" | "left" | "right";

export interface Face {
  side: Side;
  /** The face's line: the y of a top or bottom face, the x of a left or right one. */
  line: number;
  /** Its span along that line. */
  lo: number;
  hi: number;
}

/** Top and bottom faces run along x. */
export const level = (side: Side) => side === "top" || side === "bottom";
/** Outward from the face, along its normal: -1 for top and left. */
export const outward = (side: Side) => (side === "top" || side === "left" ? -1 : 1);

const real = (b: Box | undefined): b is Box => !!b && b.w > 0 && b.h > 0;

/** What an end can be on: a node or a group. */
export type Item = SceneNode | SceneGroup;
const isNode = (it: Item): it is SceneNode => "look" in it;

/** The drawn box an end touches: an icon node's tile, else the box. */
export function faceBox(it: Item): Box {
  return isNode(it) && it.look === "icon" && real(it.iconBox) ? it.iconBox : it.box;
}

/**
 * The four faces. An icon node's top and bottom lie past any text above or below its tile, its
 * left and right past any text beside it; every span is the tile's.
 */
export function facesOf(it: Item): Record<Side, Face> {
  const t = faceBox(it);
  const text =
    isNode(it) && it.look === "icon"
      ? [
          it.label.lines.length ? it.labelBox : undefined,
          it.note?.lines.length ? it.noteBox : undefined,
        ].filter(real)
      : [];
  const acrossX = (b: Box) => b.x < t.x + t.w - 0.5 && t.x < b.x + b.w - 0.5;
  const acrossY = (b: Box) => b.y < t.y + t.h - 0.5 && t.y < b.y + b.h - 0.5;
  // In a vertical flow an icon node's box is the tile with its text under it (rounded up).
  const stack = isNode(it) && it.look === "icon" ? [...text, it.box] : text;
  const top = Math.min(t.y, ...stack.filter((b) => acrossX(b) && b.y < t.y).map((b) => b.y));
  const bottom = Math.max(
    t.y + t.h,
    ...stack.filter((b) => acrossX(b) && b.y + b.h > t.y + t.h).map((b) => b.y + b.h),
  );
  const left = Math.min(t.x, ...text.filter((b) => acrossY(b) && b.x < t.x).map((b) => b.x));
  const right = Math.max(
    t.x + t.w,
    ...text.filter((b) => acrossY(b) && b.x + b.w > t.x + t.w).map((b) => b.x + b.w),
  );
  return {
    top: { side: "top", line: top, lo: t.x, hi: t.x + t.w },
    bottom: { side: "bottom", line: bottom, lo: t.x, hi: t.x + t.w },
    left: { side: "left", line: left, lo: t.y, hi: t.y + t.h },
    right: { side: "right", line: right, lo: t.y, hi: t.y + t.h },
  };
}

/** The face a run from `prev` into `p` meets: a run heading down meets a top face. */
export function sideOf(p: Point, prev: Point): Side | undefined {
  const dx = p.x - prev.x;
  const dy = p.y - prev.y;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) >= 0.5) return dy > 0 ? "top" : "bottom";
  if (Math.abs(dy) < 0.5 && Math.abs(dx) >= 0.5) return dx > 0 ? "left" : "right";
  return undefined;
}

/** One end of an edge: the point, its neighbor on the route, and which end it is. */
export interface End {
  e: SceneEdge;
  at: "from" | "to";
  /** Index of the end point in e.points, and of its neighbor. */
  i: number;
  j: number;
}

export const endsOf = (e: SceneEdge): End[] => {
  const n = e.points.length;
  return n < 2
    ? []
    : [
        { e, at: "from", i: 0, j: 1 },
        { e, at: "to", i: n - 1, j: n - 2 },
      ];
};

/** Where an end sits on its face: how far short of it (negative: past it), and along it. */
export interface Landing {
  face: Face;
  /** Distance from the tip to the face line, toward the face: positive when it stops short. */
  gap: number;
  /** The tip's coordinate along the face. */
  along: number;
}

export function landingOf(it: Item, end: End): Landing | undefined {
  const p = end.e.points[end.i];
  const q = end.e.points[end.j];
  const side = p && q ? sideOf(p, q) : undefined;
  if (!p || !q || !side) return undefined;
  const face = facesOf(it)[side];
  const at = level(side) ? p.y : p.x;
  return { face, gap: (face.line - at) * -outward(side), along: level(side) ? p.x : p.y };
}

/** The part of a face an end may use: clear of the corners by ENDS.inset, or its middle third. */
export function window(face: Face): [number, number] {
  const inset = Math.min(ENDS.inset, (face.hi - face.lo) / 3);
  return [face.lo + inset, face.hi - inset];
}

/**
 * Where n ends go on a face: around its center, ENDS.pitch apart, closer when that would put the
 * outer ones past the window.
 */
export function slotsOn(face: Face, n: number): number[] {
  const [lo, hi] = window(face);
  const c = (face.lo + face.hi) / 2;
  const pitch = n > 1 ? Math.min(ENDS.pitch, (hi - lo) / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => c + (i - (n - 1) / 2) * pitch);
}

/** The closest two ends on one face may sit; closer, two arrowheads read as one. */
export const MIN_PITCH = 8;

/**
 * Where ends go on a face when some cannot move (a straight line, held by the node at its other
 * end): one pitch through the pinned ones, as near ENDS.pitch and the center as the window
 * allows. `pins` holds the fixed position of each slot that has one. Undefined when no even
 * spacing at MIN_PITCH or more fits.
 */
export function slotsAround(
  face: Face,
  n: number,
  pins: (number | undefined)[],
): number[] | undefined {
  const fixed = pins.flatMap((v, i) => (v === undefined ? [] : [[i, v] as const]));
  if (!fixed.length) return slotsOn(face, n);
  const [lo, hi] = window(face);
  const [[k0, v0] = [0, 0]] = fixed;
  let pitch: number;
  if (fixed.length > 1) {
    const [k1, v1] = fixed.at(-1) ?? [k0, v0];
    pitch = (v1 - v0) / (k1 - k0);
  } else {
    // Off the pin to either side as far as the window allows, at most ENDS.pitch.
    const room = Math.min(
      k0 > 0 ? (v0 - lo) / k0 : Infinity,
      k0 < n - 1 ? (hi - v0) / (n - 1 - k0) : Infinity,
    );
    pitch = Math.min(ENDS.pitch, room);
  }
  const at = Array.from({ length: n }, (_, i) => v0 + (i - k0) * pitch);
  const even = fixed.every(([i, v]) => Math.abs((at[i] ?? v) - v) < 0.5);
  const inside = at.every((v) => v >= lo - 0.01 && v <= hi + 0.01);
  return n === 1 || (even && inside && pitch >= MIN_PITCH - 0.01) ? at : undefined;
}
