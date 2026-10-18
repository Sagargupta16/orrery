// Layout for the hierarchy and state kinds. tree (org charts, decision trees, taxonomies) and
// mindmap let ELK measure the nodes, then place every node themselves: a tidy tree with org-chart
// connectors, or a two-sided map with branch curves. state keeps the layered layout and redraws
// each self-transition as a loop on a corner of its state, with the label beside it.

import type { AfterLayout, LayoutHooks } from "./hooks.ts";
import { textBlock } from "./text.ts";
import type { Box, ModelEdge, Point, SceneEdge, SceneGroup, SceneNode } from "./types.ts";

// As SIZES in layout.ts: the page margin, edge label text and the step badge.
const PAD = 28;
const EDGE_TEXT = 11.5;
const EDGE_MAX = 150;
const STEP = 28;
/** Gap between an edge label and the bar or node it sits between. */
const LABEL_GAP = 8;

/**
 * First-level branch colors of a mind map, in order. Each keeps 3:1 against the light, dark,
 * paper and ink canvases, so a line in it reads in every theme and skin.
 */
const BRANCH_COLORS = ["#2f7fe0", "#d9480f", "#2f9e44", "#8b5cf6", "#0c8599", "#d6336c", "#b45309"];

export const kindHooks: LayoutHooks = {
  elkOptions(model): Record<string, string> {
    // ELK only measures a tree or mind map (the hook places every node), so it must not size the
    // canvas: layout sizes it from what the hook placed.
    if (model.kind === "tree") return { "elk.nodeSize.fixedGraphSize": "true" };
    // One routing for every theme, so each ELK run is the same graph.
    if (model.kind === "mindmap")
      return { "elk.nodeSize.fixedGraphSize": "true", "elk.edgeRouting": "SPLINES" };
    // A loop on its own ports goes on the north side, where it is redrawn.
    if (model.kind === "state") return { "elk.layered.edgeRouting.selfLoopDistribution": "NORTH" };
    return {};
  },
  after(ctx) {
    if (ctx.model.kind === "tree") placeTree(ctx);
    else if (ctx.model.kind === "mindmap") placeMindmap(ctx);
    else if (ctx.model.kind === "state") {
      restoreEdges(ctx, (e) => e.from === e.to);
      selfLoops(ctx, false);
    }
  },
};

// ---------------------------------------------------------------- geometry

const r = (v: number) => Math.round(v * 100) / 100;

function union(boxes: (Box | undefined)[]): Box | undefined {
  const list = boxes.filter((b): b is Box => !!b && (b.w > 0 || b.h > 0));
  if (!list.length) return undefined;
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  const w = Math.max(...list.map((b) => b.x + b.w)) - x;
  const h = Math.max(...list.map((b) => b.y + b.h)) - y;
  return { x, y, w, h };
}

/** What a node draws apart from its badge: the box, icon, label and note. */
const bodyOf = (n: SceneNode): Box => union([n.box, n.iconBox, n.labelBox, n.noteBox]) ?? n.box;
/** Everything a node draws. */
const footOf = (n: SceneNode): Box => union([bodyOf(n), n.badgeBox]) ?? n.box;

const hits = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/** Whether segment pq crosses box b shrunk by `inset` (Liang-Barsky, as check.ts measures). */
function crosses(p: Point, q: Point, b: Box, inset: number): boolean {
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

const segments = (pts: Point[]): [Point, Point][] =>
  pts.slice(1).map((q, i) => [pts[i] ?? q, q] as [Point, Point]);

const dot = (p: Point): Box => ({ ...p, w: 0.01, h: 0.01 });

/** Points on the line as drawn: a spline's cubic sampled, other routes as they are. */
function drawnPoints(pts: Point[], spline: boolean): Point[] {
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

function moveBoxes(boxes: (Box | undefined)[], dx: number, dy: number, seen: Set<Box>): void {
  for (const b of boxes) {
    if (!b || seen.has(b)) continue;
    seen.add(b);
    b.x = r(b.x + dx);
    b.y = r(b.y + dy);
  }
}

const moveNode = (n: SceneNode, dx: number, dy: number) =>
  moveBoxes([n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox], dx, dy, new Set());

/** Drops repeated points and points inside a straight run. */
function tidyPoints(points: Point[]): Point[] {
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
function restoreEdges(ctx: AfterLayout, only: (e: ModelEdge) => boolean = () => true): void {
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

interface LabelSize {
  w: number;
  h: number;
  /** Width of the step badge and its gap, at the left of the box. */
  stepW: number;
}

/** The label and step box of an edge, measured as layout.ts measures it. */
function labelSize(model: ModelEdge | undefined): LabelSize | undefined {
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
function setLabel(e: SceneEdge, model: ModelEdge | undefined, size: LabelSize, box: Box): void {
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

/**
 * Orthogonal connectors between two boxes, for links outside the hierarchy, best first: an elbow
 * through the gap between them, then round the right, left, bottom or top of what lies between.
 */
function links(a: Box, b: Box, feet: Box[]): Point[][] {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const out: Point[][] = [];
  if (a.x + a.w <= b.x || b.x + b.w <= a.x) {
    const right = a.x + a.w <= b.x;
    const sx = right ? a.x + a.w : a.x;
    const ex = right ? b.x : b.x + b.w;
    const mx = (sx + ex) / 2;
    out.push([
      { x: sx, y: ac.y },
      { x: mx, y: ac.y },
      { x: mx, y: bc.y },
      { x: ex, y: bc.y },
    ]);
  }
  if (a.y + a.h <= b.y || b.y + b.h <= a.y) {
    const down = a.y + a.h <= b.y;
    const sy = down ? a.y + a.h : a.y;
    const ey = down ? b.y : b.y + b.h;
    const my = (sy + ey) / 2;
    out.push([
      { x: ac.x, y: sy },
      { x: ac.x, y: my },
      { x: bc.x, y: my },
      { x: bc.x, y: ey },
    ]);
  }
  const [y0, y1] = [Math.min(ac.y, bc.y), Math.max(ac.y, bc.y)];
  const [x0, x1] = [Math.min(ac.x, bc.x), Math.max(ac.x, bc.x)];
  const rows = [a, b, ...feet.filter((f) => f.y < y1 && f.y + f.h > y0)];
  const columns = [a, b, ...feet.filter((f) => f.x < x1 && f.x + f.w > x0)];
  const right = Math.max(...rows.map((f) => f.x + f.w)) + 20;
  const left = Math.min(...rows.map((f) => f.x)) - 20;
  const bottom = Math.max(...columns.map((f) => f.y + f.h)) + 20;
  const top = Math.min(...columns.map((f) => f.y)) - 20;
  out.push(
    [
      { x: a.x + a.w, y: ac.y },
      { x: right, y: ac.y },
      { x: right, y: bc.y },
      { x: b.x + b.w, y: bc.y },
    ],
    [
      { x: a.x, y: ac.y },
      { x: left, y: ac.y },
      { x: left, y: bc.y },
      { x: b.x, y: bc.y },
    ],
    [
      { x: ac.x, y: a.y + a.h },
      { x: ac.x, y: bottom },
      { x: bc.x, y: bottom },
      { x: bc.x, y: b.y + b.h },
    ],
    [
      { x: ac.x, y: a.y },
      { x: ac.x, y: top },
      { x: bc.x, y: top },
      { x: bc.x, y: b.y },
    ],
  );
  return out;
}

// ---------------------------------------------------------------- hierarchy

interface Hierarchy {
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
function hierarchy(ctx: AfterLayout, undirected: boolean, first?: string): Hierarchy {
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

interface Span {
  lo: number;
  hi: number;
}

/** A span across the flow, with the frames around the outermost node on each side. */
interface Reach extends Span {
  loIn: string[];
  hiIn: string[];
}
/** A subtree's reach at each depth, its root's level first, relative to the root. */
type Contour = Reach[];

/** The space two neighbors keep at a depth, given the frames around each (left, right). */
type Gap = (d: number, left: string[], right: string[]) => number;

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
function spread(cs: Contour[], gap: Gap): number[] {
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

interface Tidy {
  /** A node's subtree contour; places its descendants relative to it on the way. */
  contour(id: string): Contour;
  /** Cross position of each node, from `id` at `at` down. */
  place(id: string, at: number, out: Map<string, number>): void;
}

function tidy(kids: Map<string, string[]>, extent: (id: string) => Reach, gap: Gap): Tidy {
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

interface Measure {
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

function measure(n: SceneNode, horizontal: boolean): Measure {
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
const grow = (s: Span, sign: number): Span => (sign > 0 ? s : flip(s));

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
function levels(
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
function depths(ctx: AfterLayout, depth: (id: string) => number | undefined): string[][] {
  const out: string[][] = [];
  for (const n of ctx.nodes) {
    const d = depth(n.id);
    if (d !== undefined) out[d] = [...(out[d] ?? []), n.id];
  }
  return Array.from(out, (ids) => ids ?? []);
}

// ---------------------------------------------------------------- groups

interface Margin {
  l: number;
  t: number;
  r: number;
  b: number;
}

interface Frames {
  /** The frames around a node, innermost first. */
  chain(id: string): string[];
  /** What each frame keeps around its members (the header is in the top margin). */
  margin: Map<string, Margin>;
}

/** The groups that frame tree or map nodes, and the margins ELK gave them. */
function frames(ctx: AfterLayout, before: Map<string, Box>): Frames {
  const margin = new Map<string, Margin>();
  const all = [...ctx.model.nodes, ...ctx.model.groups];
  for (const g of ctx.groups) {
    if (g.overlay || g.lane) continue;
    const members = all.filter((x) => x.parent === g.id).map((x) => before.get(x.id));
    const inner = union(members);
    if (!inner) continue;
    const b = g.box;
    margin.set(g.id, {
      l: inner.x - b.x,
      t: inner.y - b.y,
      r: b.x + b.w - (inner.x + inner.w),
      b: b.y + b.h - (inner.y + inner.h),
    });
  }
  const parentOf = new Map(all.map((x) => [x.id, x.parent]));
  const chain = (id: string) => {
    const out: string[] = [];
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) if (margin.has(p)) out.push(p);
    return out;
  };
  return { chain, margin };
}

/**
 * Room the frames need along and across the flow: neighbors in different frames stand apart by
 * the margins between them, and the gap into a node grows by the near margin (header) of each
 * frame it enters and the far margin of each it leaves.
 */
function room(f: Frames, h: Hierarchy, horizontal: boolean, sign: number) {
  const near = (m: Margin) => (horizontal ? (sign > 0 ? m.l : m.r) : sign > 0 ? m.t : m.b);
  const far = (m: Margin) => (horizontal ? (sign > 0 ? m.r : m.l) : sign > 0 ? m.b : m.t);
  const sum = (ids: string[], side: (m: Margin) => number) =>
    ids.reduce((a, g) => a + side(f.margin.get(g) ?? { l: 0, t: 0, r: 0, b: 0 }), 0);
  const parentChain = (id: string) => {
    const p = h.parent.get(id);
    return p ? f.chain(p) : [];
  };
  return {
    chain: f.chain,
    /** Extra space between two neighbors: the margins of the frames only one of them is in. */
    between: (left: string[], right: string[]) =>
      sum(
        left.filter((g) => !right.includes(g)),
        (m) => (horizontal ? m.b : m.r),
      ) +
      sum(
        right.filter((g) => !left.includes(g)),
        (m) => (horizontal ? m.t : m.l),
      ),
    /** Frames entered on the way into a node, near margins summed. */
    enter: (id: string) => {
      const from = parentChain(id);
      return sum(
        f.chain(id).filter((g) => !from.includes(g)),
        near,
      );
    },
    /** Frames left on the way into a node, far margins summed. */
    leave: (id: string) => {
      const to = f.chain(id);
      return sum(
        parentChain(id).filter((g) => !to.includes(g)),
        far,
      );
    },
  };
}

/** Each node's footprint and each group's box before the hook moved anything. */
function snapshot(ctx: AfterLayout): Map<string, Box> {
  return new Map<string, Box>([
    ...ctx.nodes.map((n): [string, Box] => [n.id, { ...footOf(n) }]),
    ...ctx.groups.map((g): [string, Box] => [g.id, { ...g.box }]),
  ]);
}

/**
 * Frames follow their members: each group keeps the margins it had around them, innermost
 * first, overlays last. Header label and icon keep their place in the frame (centered ones stay
 * centered).
 */
function refit(ctx: AfterLayout, before: Map<string, Box>): void {
  const now = (id: string): Box | undefined => {
    const n = ctx.nodes.find((x) => x.id === id);
    return n ? footOf(n) : ctx.groups.find((g) => g.id === id)?.box;
  };
  const rank = (g: SceneGroup) => (g.overlay ? -1 : g.depth);
  const order = ctx.groups.filter((g) => !g.lane).sort((a, b) => rank(b) - rank(a));
  for (const g of order) {
    const model = ctx.model.groups.find((x) => x.id === g.id);
    const members = g.overlay
      ? (model?.around ?? [])
      : [...ctx.model.nodes, ...ctx.model.groups].filter((x) => x.parent === g.id).map((x) => x.id);
    const was = union(members.map((id) => before.get(id)));
    const is = union(members.map(now));
    const old = before.get(g.id);
    if (!was || !is || !old) continue;
    // Sideways a frame is as wide as ELK made it, or its members and ELK's 20px padding, centered
    // on them; top and bottom keep their margins (the header is in the top one).
    const w = g.overlay ? is.w + (old.w - was.w) : Math.max(old.w, is.w + 40);
    const box = {
      x: r(g.overlay ? is.x - (was.x - old.x) : is.x + is.w / 2 - w / 2),
      y: r(is.y - (was.y - old.y)),
      w: r(w),
      h: r(is.h + (old.h - was.h)),
    };
    const slide = (b: Box | undefined) => {
      if (!b) return;
      const centered = Math.abs(b.x + b.w / 2 - (old.x + old.w / 2)) < 1;
      b.x = r(centered ? box.x + (box.w - b.w) / 2 : b.x + box.x - old.x);
      b.y = r(b.y + box.y - old.y);
    };
    slide(g.labelBox);
    slide(g.iconBox);
    if (g.inner) {
      const ib = g.inner.box;
      g.inner.box = {
        x: r(box.x + ib.x - old.x),
        y: r(box.y + ib.y - old.y),
        w: r(box.w - (old.w - ib.w)),
        h: r(box.h - (old.h - ib.h)),
      };
    }
    Object.assign(g.box, box);
  }
}

/**
 * Slides a group's header label (and an inline icon) off the connectors that run through it,
 * inside the frame: layout would only slide it within where the frame was before the hook.
 */
function clearHeaders(ctx: AfterLayout): void {
  for (const g of ctx.groups) {
    if (g.lane || !g.label.lines.length) continue;
    const corner =
      g.iconBox !== undefined &&
      Math.abs(g.iconBox.x - g.box.x) < 0.5 &&
      Math.abs(g.iconBox.y - g.box.y) < 0.5;
    const icon = g.iconBox && !corner ? g.iconBox : undefined;
    for (let round = 0; round < 4; round++) {
      const u = union([g.labelBox, icon]) ?? g.labelBox;
      const chip = { x: u.x - 6, y: u.y - 1, w: u.w + 12, h: u.h + 2 };
      const cut = ctx.edges
        .flatMap((e) => segments(e.points))
        .find(([p, q]) => crosses(p, q, chip, 0.5));
      if (!cut) break;
      const lo = (corner && g.iconBox ? g.iconBox.x + g.iconBox.w + 8 : g.box.x + 12) - u.x;
      const hi = g.box.x + g.box.w - 12 - (u.x + u.w);
      const right = Math.max(cut[0].x, cut[1].x) + 8 - u.x;
      const left = Math.min(cut[0].x, cut[1].x) - 8 - (u.x + u.w);
      const dx = right <= hi ? right : left >= lo ? left : undefined;
      if (dx === undefined) break;
      g.labelBox.x = r(g.labelBox.x + dx);
      if (icon) icon.x = r(icon.x + dx);
    }
  }
}

// ---------------------------------------------------------------- placement

/** Moves the drawing so it starts a page margin in from the left and under the title. */
function settle(ctx: AfterLayout): void {
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

/** Moves a node so its box center lands on (main, cross). */
function moveTo(n: SceneNode, main: number, cross: number, horizontal: boolean): void {
  const m = measure(n, horizontal);
  const dm = main - m.main;
  const dc = cross - m.cross;
  moveNode(n, horizontal ? dm : dc, horizontal ? dc : dm);
}

const point = (main: number, cross: number, horizontal: boolean): Point =>
  horizontal ? { x: r(main), y: r(cross) } : { x: r(cross), y: r(main) };

const labelBoxAt = (main: number, cross: number, size: LabelSize, horizontal: boolean): Box =>
  horizontal
    ? { x: main - size.w / 2, y: cross - size.h / 2, w: size.w, h: size.h }
    : { x: cross - size.w / 2, y: main - size.h / 2, w: size.w, h: size.h };

/** Routes the edges outside the hierarchy: links across it, then loops. */
function routeRest(ctx: AfterLayout, h: Hierarchy, spline: boolean): void {
  const tree = new Set([...h.via.values()].map((e) => e.id));
  const boxOf = (id: string) =>
    ctx.nodes.find((n) => n.id === id)?.box ?? ctx.groups.find((g) => g.id === id)?.box;
  for (const e of ctx.edges) {
    if (tree.has(e.id) || e.from === e.to) continue;
    const a = boxOf(e.from);
    const b = boxOf(e.to);
    if (!a || !b) continue;
    const feet = ctx.nodes.filter((n) => n.id !== e.from && n.id !== e.to).map(footOf);
    const routes = links(a, b, feet);
    const pts =
      routes.find((route) =>
        segments(route).every(([p, q]) => !feet.some((f) => crosses(p, q, f, 3))),
      ) ??
      routes[0] ??
      [];
    // As a spline the elbow's two bends are the curve's controls: a smooth S.
    e.points = spline ? pts.map((p) => ({ x: r(p.x), y: r(p.y) })) : tidyPoints(pts);
    const model = ctx.model.edges.find((x) => x.id === e.id);
    const size = labelSize(model);
    const p = pts[1];
    const q = pts[2];
    if (size && p && q)
      setLabel(e, model, size, {
        x: (p.x + q.x) / 2 - size.w / 2,
        y: (p.y + q.y) / 2 - size.h / 2,
        w: size.w,
        h: size.h,
      });
  }
  selfLoops(ctx, true);
}

// ---------------------------------------------------------------- tree

/**
 * Org chart: levels along the flow, siblings evenly spaced, each parent centered over its
 * children, and connectors from the parent's far side to a shared bar, along it and into each
 * child, without arrowheads. Labels (decision tree answers) sit on each child's drop.
 */
function placeTree(ctx: AfterLayout): void {
  const { model, horizontal } = ctx;
  const s = model.spacing;
  const sign = model.direction === "up" || model.direction === "left" ? -1 : 1;
  restoreEdges(ctx);
  const before = snapshot(ctx);
  const h = hierarchy(ctx, false);
  const m = new Map(ctx.nodes.map((n) => [n.id, measure(n, horizontal)]));
  const sizes = new Map<string, LabelSize>();
  for (const [child, e] of h.via) {
    const size = labelSize(model.edges.find((x) => x.id === e.id));
    if (size) sizes.set(child, size);
  }
  const along = (z: LabelSize) => (horizontal ? z.w : z.h);
  const fr = room(frames(ctx, before), h, horizontal, sign);
  // A child is as wide across the flow as the label on its drop, so neighboring labels never meet.
  const extent = (id: string): Reach => {
    const a = m.get(id)?.across ?? { lo: 0, hi: 0 };
    const z = sizes.get(id);
    const half = z ? (horizontal ? z.h : z.w) / 2 + 4 : 0;
    const frame = fr.chain(id);
    return { lo: Math.min(a.lo, -half), hi: Math.max(a.hi, half), loIn: frame, hiIn: frame };
  };
  // Teams (cousins) stand further apart than siblings, so each parent's children read as a set.
  const sibling = Math.round(28 * s);
  const cousin = Math.round(44 * s);
  const between = (a: string[], b: string[]) => fr.between(a, b);
  const t = tidy(h.kids, extent, (d, a, b) => (d === 0 ? sibling : cousin) + between(a, b));
  const offsets = spread(
    h.roots.map((id) => t.contour(id)),
    (_, a, b) => cousin + between(a, b),
  );
  const cross = new Map<string, number>();
  h.roots.forEach((id, i) => {
    t.place(id, offsets[i] ?? 0, cross);
  });
  const byDepth = depths(ctx, (id) => h.depth.get(id));
  const stem = Math.round(26 * s);
  const drop = Math.round(30 * s);
  // The bar runs clear of the frames the edges leave, the labels clear of those they enter.
  const leave = (d: number) => Math.max(0, ...(byDepth[d + 1] ?? []).map(fr.leave));
  const lv = levels(byDepth, m, sign, {
    start: 0,
    // Rows of an org chart share their top line; columns of a sideways tree their center line.
    align: horizontal ? "center" : "top",
    stem: (d) => stem + leave(d),
    drop,
    need: (id) => {
      const z = sizes.get(id);
      const me = m.get(id);
      const enter = fr.enter(id);
      // A badge pokes out toward the bar; the label clears it too.
      const poke = me ? grow(me.body, sign).lo - grow(me.foot, sign).lo : 0;
      const label = z ? along(z) + 2 * LABEL_GAP + poke : 0;
      return enter ? Math.max(drop, label) + enter + LABEL_GAP : label;
    },
  });
  for (const n of ctx.nodes)
    moveTo(n, sign * (lv.at.get(n.id) ?? 0), cross.get(n.id) ?? 0, horizontal);
  refit(ctx, before);

  for (const [child, e] of h.via) {
    const parent = h.parent.get(child) ?? "";
    const pm = m.get(parent);
    const cm = m.get(child);
    if (!pm || !cm) continue;
    const pu = lv.at.get(parent) ?? 0;
    const cu = lv.at.get(child) ?? 0;
    const pc = cross.get(parent) ?? 0;
    // A child just off the parent's center takes a straight line from it, not a jog on the bar.
    const off = (cross.get(child) ?? 0) - pc;
    const cc = Math.abs(off) < Math.min(12, cm.wide - 6) ? pc : pc + off;
    const bar = lv.bars[h.depth.get(parent) ?? 0] ?? pu;
    e.points = tidyPoints([
      point(sign * (pu + pm.half), pc, horizontal),
      point(sign * bar, pc, horizontal),
      point(sign * bar, cc, horizontal),
      point(sign * (cu - cm.half), cc, horizontal),
    ]);
    e.arrow = "none";
    const z = sizes.get(child);
    if (z) {
      // Between the bar and the child's level, above any frame the edge enters.
      const next = (lv.starts[h.depth.get(child) ?? 0] ?? cu) - fr.enter(child);
      const at = fr.enter(child) ? next - LABEL_GAP : next;
      const me = model.edges.find((x) => x.id === e.id);
      setLabel(e, me, z, labelBoxAt(sign * ((bar + at) / 2), cc, z, horizontal));
    }
  }
  routeRest(ctx, h, ctx.routing === "spline");
  clearHeaders(ctx);
  settle(ctx);
}

// ---------------------------------------------------------------- mind map

/** The root's label size, and how much bigger its icon gets. */
const ROOT_TEXT = 16;
const ROOT_ICON = 4 / 3;

/**
 * Draws the root larger: a 16px label, and a bigger box (or icon) around it. Its parts keep their
 * arrangement: centered text in a shape, text after the icon in a card, label under an icon.
 */
function enlargeRoot(n: SceneNode, text: string, horizontal: boolean): void {
  if (n.bpmn) return;
  const label = text ? textBlock(text, ROOT_TEXT, 220, 600) : n.label;
  const b = n.box;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const note = n.noteBox;
  const textW = Math.max(label.width, note?.w ?? 0);
  const textH = label.height + (note ? note.h + 2 : 0);
  const stack = (left: number, top: number, middle: boolean) => {
    n.labelBox = {
      x: r(middle ? left + (textW - label.width) / 2 : left),
      y: r(top),
      w: r(label.width),
      h: r(label.height),
    };
    if (note)
      n.noteBox = {
        ...note,
        x: r(middle ? left + (textW - note.w) / 2 : left),
        y: r(top + label.height + 2),
      };
  };
  if (n.look === "icon" && n.iconBox) {
    const size = Math.round(n.iconBox.w * ROOT_ICON);
    const ic = { x: n.iconBox.x + n.iconBox.w / 2, y: n.iconBox.y + n.iconBox.h / 2 };
    const icon = { x: r(ic.x - size / 2), y: r(ic.y - size / 2), w: size, h: size };
    n.iconBox = icon;
    stack(ic.x - textW / 2, icon.y + size + 6, true);
    n.box = horizontal
      ? { ...icon }
      : {
          x: r(ic.x - Math.max(size, textW) / 2),
          y: icon.y,
          w: r(Math.max(size, textW)),
          h: r(size + 6 + textH),
        };
  } else if (n.look === "card") {
    const iconW = n.iconBox ? n.iconBox.w + 12 : 0;
    const w = Math.max(b.w, 20 + iconW + textW + 22);
    const h = Math.max(b.h + 12, Math.max(textH, n.iconBox?.h ?? 0) + 32);
    n.box = { x: r(cx - w / 2), y: r(cy - h / 2), w: r(w), h: r(h) };
    if (n.iconBox) n.iconBox = { ...n.iconBox, x: r(n.box.x + 20), y: r(cy - n.iconBox.h / 2) };
    stack(n.box.x + 20 + iconW, cy - textH / 2, false);
  } else {
    const iconW = n.iconBox ? 28 : 0;
    const w = Math.max(b.w + 24, textW + iconW + 48);
    const h = Math.max(b.h + 12, textH + 34);
    n.box = { x: r(cx - w / 2), y: r(cy - h / 2), w: r(w), h: r(h) };
    const left = cx - (textW + iconW) / 2;
    if (n.iconBox) n.iconBox = { ...n.iconBox, x: r(left), y: r(cy - n.iconBox.h / 2) };
    stack(left + iconW, cy - textH / 2, true);
  }
  n.label = label;
  if (n.badgeBox) {
    const anchor = n.look === "icon" && n.iconBox ? n.iconBox : n.box;
    const w = n.badgeBox.w;
    n.badgeBox = {
      ...n.badgeBox,
      x: r(Math.max(anchor.x + anchor.w - w / 2 - 2, anchor.x + anchor.w / 2 + 6)),
      y: r(anchor.y - 7),
    };
  }
}

/**
 * A two-sided map: the root in the middle, its branches split between the two halves in spec
 * order, each to the half with less in it so far, and each half a tidy tree growing away from the
 * root. Edges are curves, thick out of the root, one color per branch, without arrowheads.
 */
function placeMindmap(ctx: AfterLayout): void {
  const { model, horizontal } = ctx;
  const s = model.spacing;
  // The renderers draw an edge's points as Bezier controls only when the routing is spline.
  ctx.routing = "spline";
  restoreEdges(ctx);
  const before = snapshot(ctx);
  const known = new Set(ctx.nodes.map((n) => n.id));
  const into = new Set(
    model.edges.filter((e) => e.from !== e.to && known.has(e.from)).map((e) => e.to),
  );
  const root = ctx.nodes.find((n) => !into.has(n.id))?.id ?? ctx.nodes[0]?.id;
  if (!root) return;
  const h = hierarchy(ctx, true, root);
  const rootNode = ctx.nodes.find((n) => n.id === root);
  const rootModel = model.nodes.find((n) => n.id === root);
  if (rootNode && rootModel) enlargeRoot(rootNode, rootModel.label, horizontal);

  const m = new Map(ctx.nodes.map((n) => [n.id, measure(n, horizontal)]));
  const sizes = new Map<string, LabelSize>();
  for (const [child, e] of h.via) {
    const size = labelSize(model.edges.find((x) => x.id === e.id));
    if (size) sizes.set(child, size);
  }
  const f = frames(ctx, before);
  const across = room(f, h, horizontal, 1);
  const sibling = Math.round(12 * s);
  const cousin = Math.round(20 * s);
  const drop = Math.round(48 * s);
  const gap: Gap = (d, a, b) => (d === 0 ? sibling : cousin) + across.between(a, b);
  const t = tidy(
    h.kids,
    (id) => {
      const frame = f.chain(id);
      return { ...(m.get(id)?.across ?? { lo: 0, hi: 0 }), loIn: frame, hiIn: frame };
    },
    gap,
  );

  // Other trees (nodes no edge joins to the root) hang off it like branches, without a line.
  const branches = [...(h.kids.get(root) ?? []), ...h.roots.filter((id) => id !== root)];
  const first = model.direction === "left" || model.direction === "up" ? -1 : 1;
  const halves = new Map<number, string[]>([
    [first, []],
    [-first, []],
  ]);
  const load = new Map<number, number>([
    [first, 0],
    [-first, 0],
  ]);
  for (const b of branches) {
    const c = t.contour(b);
    const span = Math.max(...c.map((x) => x.hi)) - Math.min(...c.map((x) => x.lo)) + cousin;
    const side = (load.get(first) ?? 0) <= (load.get(-first) ?? 0) ? first : -first;
    halves.get(side)?.push(b);
    load.set(side, (load.get(side) ?? 0) + span);
  }

  const cross = new Map<string, number>([[root, 0]]);
  const at = new Map<string, number>([[root, 0]]);
  const sideOf = new Map<string, number>();
  const rm = m.get(root);
  for (const [sign, list] of halves) {
    if (!list.length || !rm) continue;
    const pos = spread(
      list.map((b) => t.contour(b)),
      gap,
    );
    // The root sits across from the middle of its first and last branch on this side.
    const mid = ((pos[0] ?? 0) + (pos[pos.length - 1] ?? 0)) / 2;
    list.forEach((b, i) => {
      t.place(b, (pos[i] ?? 0) - mid, cross);
    });
    const depth = new Map<string, number>();
    const visit = (id: string, d: number) => {
      sideOf.set(id, sign);
      depth.set(id, d);
      for (const c of h.kids.get(id) ?? []) visit(c, d + 1);
    };
    for (const b of list) visit(b, 0);
    const fr = room(f, h, horizontal, sign);
    // A label on the curve into a node, and the frames the curve leaves and enters, widen the gap.
    const need = (id: string) => {
      const z = sizes.get(id);
      const label = z ? (horizontal ? z.w : z.h) + 24 : 0;
      const frame = fr.enter(id) + fr.leave(id);
      return frame ? Math.max(drop, label) + frame + LABEL_GAP : label;
    };
    const lv = levels(
      depths(ctx, (id) => depth.get(id)),
      m,
      sign,
      {
        start: grow(rm.body, sign).hi + Math.max(Math.round(64 * s), ...list.map(need)),
        align: "near",
        stem: () => 0,
        drop,
        need,
      },
    );
    for (const [id, u] of lv.at) at.set(id, u);
  }
  for (const n of ctx.nodes) {
    const sign = sideOf.get(n.id) ?? 1;
    moveTo(n, sign * (at.get(n.id) ?? 0), cross.get(n.id) ?? 0, horizontal);
  }
  refit(ctx, before);

  // One color per first-level branch, unless the spec colored the node or edge itself.
  const branchOf = new Map<string, number>();
  const mark = (id: string, i: number) => {
    branchOf.set(id, i);
    for (const c of h.kids.get(id) ?? []) mark(c, i);
  };
  branches.forEach((b, i) => {
    mark(b, i);
  });
  const colorOf = (id: string) => {
    const i = branchOf.get(id);
    return i === undefined ? undefined : BRANCH_COLORS[i % BRANCH_COLORS.length];
  };
  for (const n of ctx.nodes)
    if (!model.nodes.find((x) => x.id === n.id)?.color) n.color = colorOf(n.id) ?? n.color;

  for (const [child, e] of h.via) {
    const parent = h.parent.get(child) ?? "";
    const pm = m.get(parent);
    const cm = m.get(child);
    const sign = sideOf.get(child) ?? 1;
    if (!pm || !cm) continue;
    const pu = (at.get(parent) ?? 0) + pm.half;
    const cu = (at.get(child) ?? 0) - cm.half;
    const pc = cross.get(parent) ?? 0;
    const cc = cross.get(child) ?? 0;
    const k = (cu - pu) / 2;
    const pts = [
      point(sign * pu, pc, horizontal),
      point(sign * (pu + k), pc, horizontal),
      point(sign * (cu - k), cc, horizontal),
      point(sign * cu, cc, horizontal),
    ];
    e.points = e.from === child ? pts.reverse() : pts;
    e.arrow = "none";
    const me = model.edges.find((x) => x.id === e.id);
    if (parent === root && e.line === "solid") e.line = "thick";
    if (!me?.color) e.color = colorOf(child) ?? e.color;
    const z = sizes.get(child);
    // On the curve's midpoint: halfway along the flow and across it.
    if (z) setLabel(e, me, z, labelBoxAt(sign * ((pu + cu) / 2), (pc + cc) / 2, z, horizontal));
  }
  routeRest(ctx, h, true);
  clearHeaders(ctx);
  settle(ctx);
}

// ---------------------------------------------------------------- state

interface Corner {
  right: boolean;
  top: boolean;
}

/**
 * A self-transition as a loop on one corner of its state: out of the top (or bottom) side, round
 * the corner and back into the right (or left) side. `k` nests further loops on the same corner.
 */
function loopPoints(b: Box, c: Corner, k: number, spline: boolean): Point[] {
  const size = 18 + 10 * k;
  const inset = Math.max(4, Math.min(14 + 6 * k, b.w / 2 - 2, b.h / 2 - 2));
  const sx = c.right ? 1 : -1;
  const sy = c.top ? -1 : 1;
  const cx = c.right ? b.x + b.w : b.x;
  const cy = c.top ? b.y : b.y + b.h;
  const a = { x: cx - sx * inset, y: cy };
  const z = { x: cx, y: cy - sy * inset };
  const pts = spline
    ? [a, { x: a.x, y: cy + sy * 2 * size }, { x: cx + sx * 2 * size, y: z.y }, z]
    : [
        a,
        { x: a.x, y: cy + sy * size },
        { x: cx + sx * size, y: cy + sy * size },
        { x: cx + sx * size, y: z.y },
        z,
      ];
  return pts.map((p) => ({ x: r(p.x), y: r(p.y) }));
}

/**
 * Where a loop's label may go, best first: beside the loop on its outer side, then past it (above
 * a top loop), centered on it, flush with its outer side, flush with its inner side.
 */
function loopLabelSpots(loop: Box, c: Corner, w: number, h: number): Box[] {
  const beside = c.right ? loop.x + loop.w + 6 : loop.x - 6 - w;
  const past = c.top ? loop.y - 4 - h : loop.y + loop.h + 4;
  const outer = c.right ? loop.x + loop.w - w : loop.x;
  const inner = c.right ? loop.x : loop.x + loop.w - w;
  return [
    { x: beside, y: loop.y + loop.h / 2 - h / 2 },
    { x: loop.x + loop.w / 2 - w / 2, y: past },
    { x: outer, y: past },
    { x: inner, y: past },
  ].map((p) => ({ x: r(p.x), y: r(p.y), w, h }));
}

/**
 * Redraws every self-transition as a corner loop. The first corner whose loop and label clear
 * every node, label and line wins; ELK's own route says which side it kept room on, so those
 * corners go first (`fresh`: the hook moved the nodes, so that route means nothing).
 */
function selfLoops(ctx: AfterLayout, fresh: boolean): void {
  const spline = ctx.routing === "spline";
  const count = new Map<string, number>();
  for (const e of ctx.edges) {
    if (e.from !== e.to) continue;
    const n = ctx.nodes.find((x) => x.id === e.from);
    const box = n?.box ?? ctx.groups.find((g) => g.id === e.from)?.box;
    if (!box) continue;
    const k = count.get(e.from) ?? 0;
    count.set(e.from, k + 1);
    const model = ctx.model.edges.find((x) => x.id === e.id);
    const size = labelSize(model);
    const below =
      !fresh &&
      e.points.some((p) => p.y > box.y + box.h + 0.5) &&
      !e.points.some((p) => p.y < box.y - 0.5);
    const tops: Corner[] = [
      { right: true, top: true },
      { right: false, top: true },
    ];
    const bottoms: Corner[] = [
      { right: true, top: false },
      { right: false, top: false },
    ];
    const corners = below ? [...bottoms, ...tops] : [...tops, ...bottoms];
    const own = n ? footOf(n) : box;
    const feet = ctx.nodes.filter((x) => x.id !== e.from).map(footOf);
    const others = ctx.edges.filter((x) => x !== e);
    const labels = [
      ...others.flatMap((x) => [x.labelBox, x.stepBox]),
      ...ctx.groups.flatMap((g) => [g.label.lines.length ? g.labelBox : undefined, g.iconBox]),
    ].filter((b): b is Box => !!b);
    const lines = others.flatMap((x) => segments(x.points));
    const loopClear = (pts: Point[]) =>
      segments(pts).every(
        ([p, q]) =>
          !feet.some((f) => crosses(p, q, f, 3)) && !labels.some((l) => crosses(p, q, l, 0.5)),
      );
    const spotClear = (b: Box, pts: Point[]) =>
      !hits(b, own, 2) &&
      !feet.some((f) => hits(b, f, 2)) &&
      !labels.some((l) => hits(b, l, 2)) &&
      ![...lines, ...segments(pts)].some(([p, q]) => crosses(p, q, b, -2));
    const elk = fresh ? undefined : union([e.labelBox, e.stepBox]);
    // A loop through something costs more than a label on something; ties keep corner order.
    let chosen: { pts: Point[]; spot?: Box; cost: number } | undefined;
    for (const c of corners) {
      const pts = loopPoints(box, c, k, spline);
      const bounds = union(drawnPoints(pts, spline).map(dot)) ?? box;
      const spots = size
        ? [...loopLabelSpots(bounds, c, size.w, size.h), ...(elk ? [elk] : [])]
        : [];
      const spot = spots.find((b) => spotClear(b, pts));
      const cost = (loopClear(pts) ? 0 : 2) + (size && !spot ? 1 : 0);
      if (!chosen || cost < chosen.cost) chosen = { pts, spot: spot ?? spots[0], cost };
      if (cost === 0) break;
    }
    if (!chosen) continue;
    e.points = chosen.pts;
    if (size && chosen.spot) setLabel(e, model, size, chosen.spot);
  }
}
