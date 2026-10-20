// Trees and mind maps as tidy trees: the spanning hierarchy, packed subtree contours, node
// measures and the levels along the flow.

import type { Box, SceneEdge, SceneNode } from "../../types.ts";
import type { AfterLayout } from "../hooks.ts";
import { bodyOf, footOf, moveNode } from "./shared.ts";

// ---------------------------------------------------------------- hierarchy

export interface Hierarchy {
  roots: string[];
  kids: Map<string, string[]>;
  parent: Map<string, string>;
  depth: Map<string, number>;
  /** The edge from each node's parent to it. */
  via: Map<string, SceneEdge>;
}

/**
 * The spanning forest of the node-to-node edges, breadth first, children in edge order. Roots are
 * `first`, then the nodes nothing points at, then (for cycles) whatever is left, in spec order.
 * A mind map follows edges either way round; a tree only from parent to child.
 */
export function hierarchy(ctx: AfterLayout, undirected: boolean, first?: string): Hierarchy {
  const ids = ctx.nodes.map((n) => n.id);
  const known = new Set(ids);
  const free = new Set(ctx.model.edges.filter((e) => !e.constraint).map((e) => e.id));
  const joins = ctx.edges.filter(
    (e) => e.from !== e.to && known.has(e.from) && known.has(e.to) && !free.has(e.id),
  );
  const into = new Set(joins.map((e) => e.to));
  const order = [...(first ? [first] : []), ...ids.filter((id) => !into.has(id)), ...ids];
  const h: Hierarchy = {
    roots: [],
    kids: new Map(),
    parent: new Map(),
    depth: new Map(),
    via: new Map(),
  };
  const seen = new Set<string>();
  for (const root of order) {
    if (seen.has(root)) continue;
    seen.add(root);
    h.roots.push(root);
    h.depth.set(root, 0);
    const queue = [root];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i] ?? "";
      for (const e of joins) {
        const other = e.from === id ? e.to : undirected && e.to === id ? e.from : undefined;
        if (other === undefined || seen.has(other)) continue;
        seen.add(other);
        h.parent.set(other, id);
        h.via.set(other, e);
        h.depth.set(other, (h.depth.get(id) ?? 0) + 1);
        h.kids.set(id, [...(h.kids.get(id) ?? []), other]);
        queue.push(other);
      }
    }
  }
  return h;
}

// ---------------------------------------------------------------- tidy tree

export interface Span {
  lo: number;
  hi: number;
}

/** A span across the flow, with the frames around the outermost node on each side. */
export interface Reach extends Span {
  loIn: string[];
  hiIn: string[];
}
/** A subtree's reach at each depth, its root's level first, relative to the root. */
export type Contour = Reach[];

/** The space two neighbors keep at a depth, given the frames around each (left, right). */
export type Gap = (d: number, left: string[], right: string[]) => number;

const flip = (s: Span): Span => ({ lo: -s.hi, hi: -s.lo });
const mirror = (s: Reach): Reach => ({ lo: -s.hi, hi: -s.lo, loIn: s.hiIn, hiIn: s.loIn });

function addTo(acc: Contour, c: Contour, off: number, from = 0): void {
  c.forEach((s, i) => {
    const d = i + from;
    const at = acc[d];
    const lo = !at || s.lo + off < at.lo;
    const hi = !at || s.hi + off > at.hi;
    acc[d] = {
      lo: lo ? s.lo + off : (at?.lo ?? 0),
      hi: hi ? s.hi + off : (at?.hi ?? 0),
      loIn: lo ? s.loIn : (at?.loIn ?? []),
      hiIn: hi ? s.hiIn : (at?.hiIn ?? []),
    };
  });
}

/** Offsets of side-by-side contours, each as close to those before it as `gap` allows. */
function sweep(cs: Contour[], gap: (d: number, a: string[], b: string[]) => number): number[] {
  const acc: Contour = [];
  return cs.map((c, k) => {
    let off = 0;
    if (k > 0) {
      off = Number.NEGATIVE_INFINITY;
      for (let d = 0; d < Math.min(acc.length, c.length); d++) {
        const a = acc[d];
        const b = c[d];
        if (a && b) off = Math.max(off, a.hi - b.lo + gap(d, a.hiIn, b.loIn));
      }
    }
    addTo(acc, c, off);
    return off;
  });
}

/**
 * Siblings packed from the left and from the right, averaged: both packings keep every gap, so
 * their mean does too, and a small subtree between two large ones sits midway instead of
 * against one of them.
 */
export function spread(cs: Contour[], gap: Gap): number[] {
  const left = sweep(cs, gap);
  // Mirrored, the node on the left of a pair is the right one on the page.
  const right = sweep(
    [...cs].reverse().map((c) => c.map(mirror)),
    (d, a, b) => gap(d, b, a),
  )
    .reverse()
    .map((v) => -v);
  const shift = right[0] ?? 0;
  return left.map((v, i) => (v + (right[i] ?? 0) - shift) / 2);
}

export interface Tidy {
  /** A node's subtree contour; places its descendants relative to it on the way. */
  contour(id: string): Contour;
  /** Cross position of each node, from `id` at `at` down. */
  place(id: string, at: number, out: Map<string, number>): void;
}

export function tidy(kids: Map<string, string[]>, extent: (id: string) => Reach, gap: Gap): Tidy {
  const rel = new Map<string, number>();
  const memo = new Map<string, Contour>();
  const contour = (id: string): Contour => {
    const known = memo.get(id);
    if (known) return known;
    const children = kids.get(id) ?? [];
    const out: Contour = [extent(id)];
    if (children.length) {
      const cs = children.map(contour);
      const pos = spread(cs, gap);
      // The parent centered over its first and last child.
      const mid = ((pos[0] ?? 0) + (pos[pos.length - 1] ?? 0)) / 2;
      children.forEach((c, i) => {
        const off = (pos[i] ?? 0) - mid;
        rel.set(c, off);
        addTo(out, cs[i] ?? [], off, 1);
      });
    }
    memo.set(id, out);
    return out;
  };
  const place = (id: string, at: number, out: Map<string, number>) => {
    out.set(id, at);
    for (const c of kids.get(id) ?? []) place(c, at + (rel.get(c) ?? 0), out);
  };
  return { contour, place };
}

// ---------------------------------------------------------------- measures

export interface Measure {
  /** The box center: where edges attach across the flow, and the node's place along it. */
  main: number;
  cross: number;
  /** Body (without badge) and footprint along the flow, relative to the center. */
  body: Span;
  foot: Span;
  /** Footprint across the flow, relative to the center. */
  across: Span;
  /** Half the box along the flow, and across it. */
  half: number;
  wide: number;
}

export function measure(n: SceneNode, horizontal: boolean): Measure {
  const b = n.box;
  const body = bodyOf(n);
  const foot = footOf(n);
  const main = horizontal ? b.x + b.w / 2 : b.y + b.h / 2;
  const cross = horizontal ? b.y + b.h / 2 : b.x + b.w / 2;
  const along = (x: Box): Span =>
    horizontal
      ? { lo: x.x - main, hi: x.x + x.w - main }
      : { lo: x.y - main, hi: x.y + x.h - main };
  return {
    main,
    cross,
    body: along(body),
    foot: along(foot),
    across: horizontal
      ? { lo: foot.y - cross, hi: foot.y + foot.h - cross }
      : { lo: foot.x - cross, hi: foot.x + foot.w - cross },
    half: (horizontal ? b.w : b.h) / 2,
    wide: (horizontal ? b.h : b.w) / 2,
  };
}

/** A span along the flow in growth coordinates: `sign` -1 grows toward smaller x or y. */
export const grow = (s: Span, sign: number): Span => (sign > 0 ? s : flip(s));

interface Levels {
  /** Each node's center in growth coordinates. */
  at: Map<string, number>;
  /** Where each level starts, and where the connector bar of the edges out of it runs. */
  starts: number[];
  bars: number[];
}

/**
 * Levels along the flow, one per depth from `start`: as thick as their thickest node, nodes
 * centered in them, against the side toward the root (`near`) or against their top (`top`). The bar of the edges out of a
 * level runs `stem(depth)` past its far side; the next level starts `drop` past the bar, or
 * further when a node needs it (`need`: the label on the edge into it, frames it enters).
 */
export function levels(
  byDepth: string[][],
  m: Map<string, Measure>,
  sign: number,
  opts: {
    start: number;
    align: "center" | "near" | "top";
    stem: (d: number) => number;
    drop: number;
    need: (id: string) => number;
  },
): Levels {
  const at = new Map<string, number>();
  const starts: number[] = [];
  const bars: number[] = [];
  let start = opts.start;
  byDepth.forEach((ids, d) => {
    const spans = ids.map((id) => grow(m.get(id)?.body ?? { lo: 0, hi: 0 }, sign));
    const thick = Math.max(0, ...spans.map((s) => s.hi - s.lo));
    ids.forEach((id, i) => {
      const s = spans[i] ?? { lo: 0, hi: 0 };
      // Growth runs up the page when sign is -1, so a level's top is its far side then.
      const near = opts.align === "near" || (opts.align === "top" && sign > 0);
      const far = opts.align === "top" && sign < 0;
      at.set(
        id,
        near ? start - s.lo : far ? start + thick - s.hi : start + thick / 2 - (s.lo + s.hi) / 2,
      );
    });
    const next = byDepth[d + 1] ?? [];
    const stem = opts.stem(d);
    starts.push(start);
    bars.push(start + thick + stem);
    start += thick + stem + Math.max(opts.drop, ...next.map(opts.need));
  });
  return { at, starts, bars };
}

/** Node ids per depth, in spec order. */
export function depths(ctx: AfterLayout, depth: (id: string) => number | undefined): string[][] {
  const out: string[][] = [];
  for (const n of ctx.nodes) {
    const d = depth(n.id);
    if (d !== undefined) out[d] = [...(out[d] ?? []), n.id];
  }
  return Array.from(out, (ids) => ids ?? []);
}

/** Moves a node so its box center lands on (main, cross). */
export function moveTo(n: SceneNode, main: number, cross: number, horizontal: boolean): void {
  const m = measure(n, horizontal);
  const dm = main - m.main;
  const dc = cross - m.cross;
  moveNode(n, horizontal ? dm : dc, horizontal ? dc : dm);
}
