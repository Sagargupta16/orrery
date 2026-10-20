// What the tree, mind map and state layouts share: box geometry, edge labels and final placement.

import type { AfterLayout } from "../hooks.ts";
import { textBlock } from "../text.ts";
import type { Box, ModelEdge, Point, SceneEdge, SceneNode } from "../types.ts";

// As SIZES in layout.ts: the page margin, edge label text and the step badge.
const PAD = 28;
const EDGE_TEXT = 11.5;
const EDGE_MAX = 150;
const STEP = 28;
/** Gap between an edge label and the bar or node it sits between. */
export const LABEL_GAP = 8;

// ---------------------------------------------------------------- geometry

export const r = (v: number) => Math.round(v * 100) / 100;

export function union(boxes: (Box | undefined)[]): Box | undefined {
  const list = boxes.filter((b): b is Box => !!b && (b.w > 0 || b.h > 0));
  if (!list.length) return undefined;
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  const w = Math.max(...list.map((b) => b.x + b.w)) - x;
  const h = Math.max(...list.map((b) => b.y + b.h)) - y;
  return { x, y, w, h };
}

/** What a node draws apart from its badge: the box, icon, label and note. */
export const bodyOf = (n: SceneNode): Box =>
  union([n.box, n.iconBox, n.labelBox, n.noteBox]) ?? n.box;
/** Everything a node draws. */
export const footOf = (n: SceneNode): Box => union([bodyOf(n), n.badgeBox]) ?? n.box;

export const hits = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/** Whether segment pq crosses box b shrunk by `inset` (Liang-Barsky, as check.ts measures). */
export function crosses(p: Point, q: Point, b: Box, inset: number): boolean {
  const box = { x: b.x + inset, y: b.y + inset, w: b.w - inset * 2, h: b.h - inset * 2 };
  if (box.w <= 0 || box.h <= 0) return false;
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
      if (qq < 0) return false;
    } else {
      const t = qq / pp;
      if (pp < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 < t1;
}

export const segments = (pts: Point[]): [Point, Point][] =>
  pts.slice(1).map((q, i) => [pts[i] ?? q, q] as [Point, Point]);

export const dot = (p: Point): Box => ({ ...p, w: 0.01, h: 0.01 });

/** Points on the line as drawn: a spline's cubic sampled, other routes as they are. */
export function drawnPoints(pts: Point[], spline: boolean): Point[] {
  const [a, b, c, d] = pts;
  if (!spline || pts.length !== 4 || !a || !b || !c || !d) return pts;
  return Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
    return {
      x: k[0] * a.x + k[1] * b.x + k[2] * c.x + k[3] * d.x,
      y: k[0] * a.y + k[1] * b.y + k[2] * c.y + k[3] * d.y,
    };
  });
}

export function moveBoxes(
  boxes: (Box | undefined)[],
  dx: number,
  dy: number,
  seen: Set<Box>,
): void {
  for (const b of boxes) {
    if (!b || seen.has(b)) continue;
    seen.add(b);
    b.x = r(b.x + dx);
    b.y = r(b.y + dy);
  }
}

export const moveNode = (n: SceneNode, dx: number, dy: number) =>
  moveBoxes([n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox], dx, dy, new Set());

/** Drops repeated points and points inside a straight run. */
export function tidyPoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points.map((q) => ({ x: r(q.x), y: r(q.y) }))) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    if (prev && last) {
      const cross = (last.x - prev.x) * (p.y - prev.y) - (last.y - prev.y) * (p.x - prev.x);
      if (Math.abs(cross) < 0.01) out.pop();
    }
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- edges and labels

/** Edges layout dropped (ELK gave them no route) come back, in spec order, for the hook to route. */
export function restoreEdges(ctx: AfterLayout, only: (e: ModelEdge) => boolean = () => true): void {
  const ids = new Set([...ctx.nodes.map((n) => n.id), ...ctx.groups.map((g) => g.id)]);
  for (const e of ctx.model.edges) {
    if (!only(e) || ctx.edges.some((x) => x.id === e.id)) continue;
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    ctx.edges.push({
      id: e.id,
      from: e.from,
      to: e.to,
      points: [],
      line: e.line,
      arrow: e.arrow,
      color: e.color,
      step: e.step,
      ...(e.flow ? { flow: e.flow } : {}),
    });
  }
  const order = new Map(ctx.model.edges.map((e, i) => [e.id, i]));
  ctx.edges.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export interface LabelSize {
  w: number;
  h: number;
  /** Width of the step badge and its gap, at the left of the box. */
  stepW: number;
}

/** The label and step box of an edge, measured as layout.ts measures it. */
export function labelSize(model: ModelEdge | undefined): LabelSize | undefined {
  if (!model || (!model.label && model.step === undefined)) return undefined;
  const block = textBlock(model.label ?? "", EDGE_TEXT, EDGE_MAX);
  const stepW = model.step !== undefined ? STEP + 2 : 0;
  const w = Math.ceil(
    (model.label ? block.width + 12 : 0) + stepW + (model.label && stepW ? 2 : 0),
  );
  const h = Math.ceil(Math.max(model.label ? block.height + 6 : 0, stepW ? STEP : 0));
  return { w, h, stepW };
}

/** Puts an edge's label (and step badge) in `box`, a box of its labelSize. */
export function setLabel(
  e: SceneEdge,
  model: ModelEdge | undefined,
  size: LabelSize,
  box: Box,
): void {
  if (model?.step !== undefined)
    e.stepBox = { x: r(box.x), y: r(box.y + (box.h - STEP) / 2), w: STEP, h: STEP };
  else delete e.stepBox;
  if (model?.label) {
    const gap = size.stepW ? size.stepW + 2 : 0;
    e.label = textBlock(model.label, EDGE_TEXT, EDGE_MAX);
    e.labelBox = { x: r(box.x + gap), y: r(box.y), w: r(size.w - gap), h: size.h };
  } else {
    delete e.label;
    delete e.labelBox;
  }
}

// ---------------------------------------------------------------- placement

/** Moves the drawing so it starts a page margin in from the left and under the title. */
export function settle(ctx: AfterLayout): void {
  const all = union([
    ...ctx.nodes.map(footOf),
    ...ctx.groups.flatMap((g) => [g.box, g.label.lines.length ? g.labelBox : undefined, g.iconBox]),
    ...ctx.edges.flatMap((e) => [e.labelBox, e.stepBox, ...e.points.map(dot)]),
  ]);
  if (!all) return;
  const dx = PAD - all.x;
  const dy = ctx.top + PAD - all.y;
  const seen = new Set<Box>();
  for (const n of ctx.nodes)
    moveBoxes([n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox], dx, dy, seen);
  for (const g of ctx.groups) moveBoxes([g.box, g.labelBox, g.iconBox, g.inner?.box], dx, dy, seen);
  for (const e of ctx.edges) {
    moveBoxes([e.labelBox, e.stepBox], dx, dy, seen);
    e.points = e.points.map((p) => ({ x: r(p.x + dx), y: r(p.y + dy) }));
  }
}

export const point = (main: number, cross: number, horizontal: boolean): Point =>
  horizontal ? { x: r(main), y: r(cross) } : { x: r(cross), y: r(main) };

export const labelBoxAt = (
  main: number,
  cross: number,
  size: LabelSize,
  horizontal: boolean,
): Box =>
  horizontal
    ? { x: main - size.w / 2, y: cross - size.h / 2, w: size.w, h: size.h }
    : { x: cross - size.w / 2, y: main - size.h / 2, w: size.w, h: size.h };
