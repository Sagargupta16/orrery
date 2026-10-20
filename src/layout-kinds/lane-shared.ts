// What the pool and swimlane modules share: sizes, the flow's axes, box geometry and the bands.

import type { AfterLayout } from "../hooks.ts";
import type {
  Box,
  ModelGroup,
  Point,
  SceneEdge,
  SceneGroup,
  SceneNode,
  TextBlock,
} from "../types.ts";

// Sizes in px. Group labels match layout's (13px semibold); bpmn-js draws pool and lane names in
// a 30px strip.
export const LABEL = 13;
export const EDGE_LABEL = 11.5;
export const EDGE_LABEL_MAX = 150;
export const STEP = 28;
export const STRIP = 30;
/** Across the flow: between a band's border and its deepest layer, and between stacked nodes. */
export const PAD = 24;
export const STACK = 24;
export const MIN_BAND = 96;
/** A pool with nothing in it (a black-box participant that only sends and receives messages). */
export const BLACK_BOX = 64;
/** Between two pools, where message flows cross. */
export const POOL_GAP = 60;
/** Along the flow: between the strip and the first layer, and after the last one. */
export const RUN = 28;
/** Back edges run along a band this far inside its border. */
export const CHANNEL = 12;
/** Nodes keep lines this far away. */
export const CLEAR = 6;
/** What a bend costs a route, in px of length. */
export const BEND = 28;

export const round = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- geometry

export type Key = "x" | "y";
export type Len = "w" | "h";
export interface Axis {
  /** Along the flow. */
  m: Key;
  mw: Len;
  /** Across the flow. */
  c: Key;
  cw: Len;
}

export function union(boxes: (Box | undefined)[]): Box {
  const list = boxes.filter((b): b is Box => !!b && (b.w > 0 || b.h > 0));
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...list.map((b) => b.x + b.w)) - x,
    h: Math.max(...list.map((b) => b.y + b.h)) - y,
  };
}

export const grow = (b: Box, d: number): Box => ({
  x: b.x - d,
  y: b.y - d,
  w: b.w + 2 * d,
  h: b.h + 2 * d,
});

export const hits = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/** Whether segment pq (horizontal or vertical) enters the inside of box b. */
export function cuts(p: Point, q: Point, b: Box): boolean {
  if (Math.abs(p.y - q.y) < 0.01) {
    const [a, c] = p.x < q.x ? [p.x, q.x] : [q.x, p.x];
    return p.y > b.y + 0.01 && p.y < b.y + b.h - 0.01 && a < b.x + b.w - 0.01 && c > b.x + 0.01;
  }
  const [a, c] = p.y < q.y ? [p.y, q.y] : [q.y, p.y];
  return p.x > b.x + 0.01 && p.x < b.x + b.w - 0.01 && a < b.y + b.h - 0.01 && c > b.y + 0.01;
}

/** Runs of overlapping intervals, in order. */
export function clusters<T>(list: T[], span: (t: T) => [number, number]): T[][] {
  const sorted = [...list].sort((a, b) => span(a)[0] - span(b)[0]);
  const out: T[][] = [];
  let end = Number.NEGATIVE_INFINITY;
  for (const t of sorted) {
    const [s, e] = span(t);
    const last = out[out.length - 1];
    if (last && s < end - 0.5) {
      last.push(t);
      end = Math.max(end, e);
    } else {
      out.push([t]);
      end = e;
    }
  }
  return out;
}

export function dropStraight(points: Point[]): Point[] {
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

// ---------------------------------------------------------------- bands

export interface Band {
  /** Unset: a pool's own nodes beside its lanes, or the nodes in no band (both undrawn). */
  group?: ModelGroup;
  kids: Band[];
  items: Item[];
  depth: number;
  /** Across the flow: where the band starts and how deep it is. */
  c0: number;
  size: number;
  /** Along the flow: its label strip, and the strips of the bands around it. */
  strip: number;
  inset: number;
  label?: TextBlock;
  scene?: SceneGroup;
}

/** A node, or an ordinary group with everything in it, that moves as one into a band. */
export interface Item {
  id: string;
  boxes: Box[];
  /** Edges inside a group item, which move with it. */
  inner: SceneEdge[];
  /** Where edges attach, and what lone items center on their band's line. */
  attach: Box;
  foot: Box;
}

export const blackBox = (b: Band) => b.group?.type === "pool" && !b.kids.length && !b.items.length;

export function nodeBoxes(n: SceneNode): Box[] {
  return [n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox].filter((b): b is Box => !!b);
}

export function footOf(n: SceneNode): Box {
  return union([n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox]);
}

/** What the band layout hands the edge router and the label placer. */
export interface Routing {
  ctx: AfterLayout;
  A: Axis;
  sign: number;
  all: Band[];
  items: Item[];
  layers: Map<Band, Item[][]>;
  bands: Map<string, Band>;
  itemOf: Map<string, Item>;
  sceneNode: Map<string, SceneNode>;
  sceneGroup: Map<string, SceneGroup>;
  /** Along the flow: where content starts after the strips, and where the bands end. */
  contentM: number;
  endM: number;
}
