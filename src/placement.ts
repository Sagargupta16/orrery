// Author-controlled placement: which rank, align and cols hints the layout can honor (and why not
// when it cannot), the cell grid of a cols group, layers read back from a scene, the scene
// measures the aspect search compares, and the router for edges drawn after ELK (constraint:
// false, overlay ends, grid cells), which keeps them off nodes, headers and labels.

import type {
  Box,
  Direction,
  IgnoredSetting,
  Model,
  ModelEdge,
  ModelNode,
  Point,
  Scene,
} from "./types.ts";

const round = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- plan

/** What layout() does with the placement hints, and the ones it cannot honor. */
export interface Plan {
  ignored: IgnoredSetting[];
  /** Nodes that share one layer, by block id; members in spec order. */
  blocks: Map<string, string[]>;
  /** The block each member belongs to. */
  blockOf: Map<string, string>;
  /** rank first or last, by the ELK node it applies to: a node, or the block it is in. */
  ends: Map<string, "FIRST" | "LAST">;
  /** Groups whose children sit in a grid, with the column count. */
  grids: Map<string, number>;
}

/** Diagram kinds that place every node themselves, so layer hints have nothing to steer. */
const SELF_PLACED: Partial<Record<Model["kind"], string>> = {
  tree: "a tree places every node itself",
  mindmap: "a mind map places every node itself",
  journey: "a journey places every step in its stage and lane",
};

/** Why rank, align and cols do nothing in this kind of diagram, if they do not. */
export const selfPlaced = (kind: Model["kind"]): string | undefined => SELF_PLACED[kind];

/**
 * Decides which hints hold. `hidden` are the groups ELK never sees (pools and lanes); their
 * members share the graph of the nearest group it does see.
 */
export function planPlacement(model: Model, hidden: Set<string>): Plan {
  const plan: Plan = {
    ignored: [],
    blocks: new Map(),
    blockOf: new Map(),
    ends: new Map(),
    grids: new Map(),
  };
  const ignore = (subject: string, setting: string, reason: string) =>
    plan.ignored.push({ subject, setting, reason });
  const own = selfPlaced(model.kind);
  const groups = new Map(model.groups.map((g) => [g.id, g]));
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  const host = (parent: string | undefined) => {
    let p = parent;
    while (p && hidden.has(p)) p = groups.get(p)?.parent;
    return p;
  };

  for (const g of model.groups) {
    if (g.cols === undefined) continue;
    if (own) ignore(g.id, "cols", own);
    else if (hidden.has(g.id))
      ignore(g.id, "cols", "a pool or lane places its members in its band");
    else if (g.around) ignore(g.id, "cols", "an overlay group is drawn around its members");
    else if (model.groups.some((c) => c.parent === g.id && hidden.has(c.id)))
      ignore(g.id, "cols", "its lanes place their members in their bands");
    else plan.grids.set(g.id, g.cols);
  }
  const cell = (n: ModelNode) => (n.parent && plan.grids.has(n.parent) ? n.parent : undefined);

  // align: union the nodes that share a layer; the block keeps spec order.
  const link = new Map<string, string>();
  const find = (id: string): string => {
    let r = id;
    for (let up = link.get(r); up && up !== r; up = link.get(r)) r = up;
    return r;
  };
  for (const n of model.nodes) {
    const t = n.align === undefined ? undefined : nodes.get(n.align);
    if (!t || t.id === n.id) continue;
    const grid = cell(n) ?? cell(t);
    if (own) ignore(n.id, "align", own);
    else if (grid)
      ignore(
        n.id,
        "align",
        `group "${grid}" places its children in ${plan.grids.get(grid)} columns`,
      );
    else if (host(n.parent) !== host(t.parent))
      ignore(n.id, "align", `"${t.id}" is in another group, and layers only line up inside one`);
    else link.set(find(n.id), find(t.id));
  }
  const byRoot = new Map<string, string[]>();
  for (const n of model.nodes) {
    if (!link.has(n.id) && ![...link.values()].includes(n.id)) continue;
    const r = find(n.id);
    byRoot.set(r, [...(byRoot.get(r) ?? []), n.id]);
  }
  for (const members of byRoot.values()) {
    if (members.length < 2) continue;
    const id = `__align:${members[0]}`;
    plan.blocks.set(id, members);
    for (const m of members) plan.blockOf.set(m, id);
  }

  // rank first and last: ELK's layer constraints, on the block when the node is in one.
  const unit = (id: string) => plan.blockOf.get(id) ?? id;
  const rankedBy = new Map<string, string[]>();
  for (const n of model.nodes) {
    if (n.rank !== "first" && n.rank !== "last") continue;
    const grid = cell(n);
    if (own) {
      ignore(n.id, "rank", own);
      continue;
    }
    if (grid) {
      ignore(
        n.id,
        "rank",
        `group "${grid}" places its children in ${plan.grids.get(grid)} columns`,
      );
      continue;
    }
    const want = n.rank === "first" ? "FIRST" : "LAST";
    const u = unit(n.id);
    const had = plan.ends.get(u);
    if (had && had !== want) {
      ignore(n.id, "rank", `it shares a layer with a node ranked ${had.toLowerCase()}`);
      continue;
    }
    plan.ends.set(u, want);
    rankedBy.set(u, [...(rankedBy.get(u) ?? []), n.id]);
  }
  // Two units in the first (or last) layer joined by an edge cannot both stay there: ELK rejects
  // the graph. The later one in spec order gives way.
  const overlay = new Set(model.groups.filter((g) => g.around?.length).map((g) => g.id));
  const laidOut = (e: ModelEdge) =>
    e.constraint && ![e.from, e.to].some((id) => overlay.has(id) || hidden.has(id));
  const order = new Map(model.nodes.map((n, i) => [n.id, i]));
  const at = (u: string) => order.get(rankedBy.get(u)?.[0] ?? "") ?? 0;
  for (const e of model.edges) {
    if (!laidOut(e)) continue;
    const a = unit(e.from);
    const b = unit(e.to);
    const end = plan.ends.get(a);
    if (a === b || !end || plan.ends.get(b) !== end) continue;
    const [first, second] = at(a) <= at(b) ? [a, b] : [b, a];
    plan.ends.delete(second);
    for (const id of rankedBy.get(second) ?? [])
      ignore(
        id,
        "rank",
        `it links to "${rankedBy.get(first)?.[0]}", also ranked ${end.toLowerCase()}`,
      );
  }
  return plan;
}

// ---------------------------------------------------------------- grid

/** One child of a cols group: its drawn footprint, and where its ELK box sits inside it. */
export interface GridCell {
  id: string;
  /** Footprint size (box plus an outside label). */
  w: number;
  h: number;
  /** The box ELK lays out, relative to the footprint's top-left. */
  box: Box;
}

/**
 * The aws-archify Grid: row by row in spec order into `cols` equal cells, the cell as wide as the
 * widest child and the row pitch the tallest; each child centered across its cell, and every box
 * centered on one line per row (the icon band), so labels of different lengths hang below it.
 * Returns the content size and each footprint's top-left, relative to the content origin.
 */
export function gridCells(
  cells: GridCell[],
  cols: number,
  gap: number,
): { w: number; h: number; at: Point[] } {
  const n = cells.length;
  const c = Math.max(1, Math.min(cols, n));
  const rows = Math.ceil(n / c);
  const cellW = Math.max(0, ...cells.map((x) => x.w));
  const band = Math.max(0, ...cells.map((x) => x.box.h));
  const lift = (x: GridCell) => (band - x.box.h) / 2 - x.box.y;
  const pitch = Math.max(0, ...cells.map((x) => lift(x) + x.h));
  const at = cells.map((x, i) => ({
    x: round((i % c) * (cellW + gap) + (cellW - x.w) / 2),
    y: round(Math.floor(i / c) * (pitch + gap) + lift(x)),
  }));
  return {
    w: Math.ceil(c * cellW + (c - 1) * gap),
    h: Math.ceil(rows * pitch + (rows - 1) * gap),
    at,
  };
}

// ---------------------------------------------------------------- layers

const horizontalFlow = (d: Direction) => d === "right" || d === "left";

/**
 * Layer index (0 first, in flow order) of each item: items whose spans along the flow overlap
 * share a layer, as ELK's own interactive layering reads positions.
 */
export function layersOf(
  items: { id: string; box: Box }[],
  direction: Direction,
): Map<string, number> {
  const h = horizontalFlow(direction);
  const back = direction === "left" || direction === "up";
  const spans = items
    .map((it) => {
      const lo = h ? it.box.x : it.box.y;
      const hi = lo + (h ? it.box.w : it.box.h);
      return back ? { id: it.id, lo: -hi, hi: -lo } : { id: it.id, lo, hi };
    })
    .sort((a, b) => a.lo - b.lo);
  const out = new Map<string, number>();
  let layer = -1;
  let end = Number.NEGATIVE_INFINITY;
  for (const s of spans) {
    if (s.lo >= end - 0.5) layer++;
    end = s.lo >= end - 0.5 ? s.hi : Math.max(end, s.hi);
    out.set(s.id, layer);
  }
  return out;
}

// ---------------------------------------------------------------- scene measures

type Seg = readonly [Point, Point];

const segmentsOf = (points: Point[]): Seg[] =>
  points.slice(1).map((q, i) => [points[i] ?? q, q] as const);

function properCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Segment pairs that cross, between edges that share no endpoint. */
export function sceneCrossings(scene: Scene): number {
  let count = 0;
  const lines = scene.edges.map((e) => ({ ends: [e.from, e.to], segs: segmentsOf(e.points) }));
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (!a || !b || a.ends.some((x) => b.ends.includes(x))) continue;
      for (const [p, q] of a.segs)
        for (const [r, t] of b.segs) if (properCross(p, q, r, t)) count++;
    }
  return count;
}

/** Edges that run through a node they do not connect (DG201 reads the box shrunk by 3px). */
export function edgesThroughNodes(scene: Scene): number {
  let count = 0;
  for (const e of scene.edges)
    for (const n of scene.nodes) {
      if (n.id === e.from || n.id === e.to) continue;
      if (segmentsOf(e.points).some(([p, q]) => segmentHits(p, q, n.box, 3))) count++;
    }
  return count;
}

// ---------------------------------------------------------------- free-edge router

/** Does segment pq pass through the inside of b, shrunk by `inset` (Liang-Barsky)? */
export function segmentHits(p: Point, q: Point, b: Box, inset = 1): boolean {
  const x0 = b.x + inset;
  const y0 = b.y + inset;
  const x1 = b.x + b.w - inset;
  const y1 = b.y + b.h - inset;
  if (x1 <= x0 || y1 <= y0) return false;
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
      if (qq <= 0) return false;
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
  return t1 - t0 > 1e-6;
}

/** Whether any segment of the path runs through any of the boxes. */
export const runsThrough = (points: Point[], boxes: Box[]): boolean =>
  segmentsOf(points).some(([p, q]) => boxes.some((b) => segmentHits(p, q, b)));

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

/** Straight run kept in front of an arrowhead so it does not sit on a bend (aws-archify: 2 cells). */
const HEAD_ROOM = 16;
/** Riser position along the span, a little toward the source so the long run is the one into the head. */
const RISER = 0.45;
/** A line this close to a group border, and parallel to it, reads as running along it. */
const BORDER = 6;

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
 * More elbows for a free edge between two boxes, ported from aws-archify's router: the riser at
 * 0.45 of the span toward the source, kept a head room clear of each arrowhead, moved off group
 * borders it would run along, and next to either stub; then the two L shapes. Every candidate is
 * orthogonal; the caller keeps the first that clears its obstacles. Boxes both side by side and
 * one above the other get both families, the one that follows the flow (`across`) first.
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

interface Face {
  at: Point;
  stub: Point;
  /** Extra cost of ending here: off the center, or on a point another line already uses. */
  cost: number;
}

/**
 * Where a detour may end on a box: the middle of each side and, on a side long enough, 12px to
 * either side of it, so a line in and a line out need not share one point.
 */
function faces(end: RouteEnd, room: number, used: Point[]): Face[] {
  const { side, full } = end;
  const cx = side.x + side.w / 2;
  const cy = side.y + side.h / 2;
  const taken = (p: Point) => used.some((u) => Math.abs(u.x - p.x) < 1 && Math.abs(u.y - p.y) < 1);
  const along = (len: number) => (len >= 36 ? [0, -12, 12] : [0]);
  const out: Face[] = [];
  const add = (at: Point, dx: number, dy: number, off: number) => {
    const p = { x: round(at.x), y: round(at.y) };
    out.push({
      at: p,
      stub: { x: round(p.x + dx * room), y: round(p.y + dy * room) },
      cost: (off ? 8 : 0) + (taken(p) ? 300 : 0),
    });
  };
  for (const d of along(side.h)) {
    add({ x: side.x, y: cy + d }, -1, 0, d);
    add({ x: side.x + side.w, y: cy + d }, 1, 0, d);
  }
  for (const d of along(side.w)) {
    add({ x: cx + d, y: full.y }, 0, -1, d);
    add({ x: cx + d, y: full.y + full.h }, 0, 1, d);
  }
  return out;
}

/** Drops repeated points and points inside a straight run. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    const prev = out[out.length - 2];
    if (prev && last) {
      const flat = Math.abs(prev.x - last.x) < 0.01 && Math.abs(last.x - p.x) < 0.01;
      const level = Math.abs(prev.y - last.y) < 0.01 && Math.abs(last.y - p.y) < 0.01;
      if (flat || level) out.pop();
    }
    out.push(p);
  }
  return out;
}

/**
 * The last resort when no lane clears: the shortest orthogonal path with the fewest bends from a
 * face of `a` to a face of `b` on the grid of lines 12px off every obstacle (Dijkstra, a bend
 * costs 40px, a run along a group border 200px more). Both ends leave through a straight stub a
 * head room long. Undefined when the obstacles wall one end in.
 */
export function detour(
  a: RouteEnd,
  b: RouteEnd,
  obstacles: Box[],
  borders: Box[] = [],
  used: Point[] = [],
): Point[] | undefined {
  const walls = [...obstacles, ...(a.parts ?? [a.full]), ...(b.parts ?? [b.full])];
  const starts = faces(a, HEAD_ROOM, used).filter(
    (f) => !walls.some((w) => segmentHits(f.at, f.stub, w) || inside(f.stub, w)),
  );
  const goals = faces(b, HEAD_ROOM, used).filter(
    (f) => !walls.some((w) => segmentHits(f.stub, f.at, w) || inside(f.stub, w)),
  );
  if (!starts.length || !goals.length) return undefined;
  const all = [a.full, b.full, ...obstacles];
  const x0 = Math.min(...all.map((r) => r.x)) - 40;
  const y0 = Math.min(...all.map((r) => r.y)) - 40;
  const x1 = Math.max(...all.map((r) => r.x + r.w)) + 40;
  const y1 = Math.max(...all.map((r) => r.y + r.h)) + 40;
  const coords = (
    pick: (p: Point) => number,
    lo: (r: Box) => number,
    hi: (r: Box) => number,
    min: number,
    max: number,
  ) =>
    [
      ...new Set(
        [
          min,
          max,
          ...[...starts, ...goals].map((f) => pick(f.stub)),
          ...walls.flatMap((r) => [lo(r) - 12, hi(r) + 12]),
          ...borders.flatMap((r) => [lo(r) - 16, lo(r) + 16, hi(r) - 16, hi(r) + 16]),
        ].map(round),
      ),
    ]
      .filter((v) => v >= min && v <= max)
      .sort((m, n) => m - n)
      // Midlines too, so a path can run down the middle of a gap between two obstacles.
      .flatMap((v, i, all) => {
        const next = all[i + 1];
        return next !== undefined && next - v > 4 ? [v, round((v + next) / 2)] : [v];
      });
  const xs = coords(
    (p) => p.x,
    (r) => r.x,
    (r) => r.x + r.w,
    x0,
    x1,
  );
  const ys = coords(
    (p) => p.y,
    (r) => r.y,
    (r) => r.y + r.h,
    y0,
    y1,
  );
  const W = xs.length;
  const key = (i: number, j: number) => j * W + i;
  const free = (i: number, j: number) => {
    const p = { x: xs[i] ?? 0, y: ys[j] ?? 0 };
    return !walls.some((w) => inside(p, w));
  };
  const step = (i: number, j: number, k: number, l: number) =>
    !walls.some((w) =>
      segmentHits({ x: xs[i] ?? 0, y: ys[j] ?? 0 }, { x: xs[k] ?? 0, y: ys[l] ?? 0 }, w),
    );
  // States are (point, heading 0..3); a heap keyed by cost.
  const BEND = 40;
  const dist = new Map<number, number>();
  const from = new Map<number, number>();
  const heap: [number, number][] = [];
  const push = (cost: number, state: number) => {
    heap.push([cost, state]);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if ((heap[p]?.[0] ?? 0) <= cost) break;
      [heap[p], heap[c]] = [heap[c] as [number, number], heap[p] as [number, number]];
      c = p;
    }
  };
  const pop = (): [number, number] | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (!top || !last || !heap.length) return top;
    heap[0] = last;
    let c = 0;
    for (;;) {
      const l = 2 * c + 1;
      const r = l + 1;
      let m = c;
      if ((heap[l]?.[0] ?? Infinity) < (heap[m]?.[0] ?? Infinity)) m = l;
      if ((heap[r]?.[0] ?? Infinity) < (heap[m]?.[0] ?? Infinity)) m = r;
      if (m === c) break;
      [heap[m], heap[c]] = [heap[c] as [number, number], heap[m] as [number, number]];
      c = m;
    }
    return top;
  };
  const index = (p: Point) => [xs.indexOf(round(p.x)), ys.indexOf(round(p.y))] as const;
  const heading = (f: Face) =>
    f.stub.x > f.at.x ? 0 : f.stub.x < f.at.x ? 1 : f.stub.y > f.at.y ? 2 : 3;
  const startAt = new Map<number, Face>();
  for (const f of starts) {
    const [i, j] = index(f.stub);
    if (i < 0 || j < 0) continue;
    const s = key(i, j) * 4 + heading(f);
    if (f.cost >= (dist.get(s) ?? Infinity)) continue;
    dist.set(s, f.cost);
    startAt.set(s, f);
    push(f.cost, s);
  }
  const goalAt = new Map<number, Face>();
  for (const f of goals) {
    const [i, j] = index(f.stub);
    if (i >= 0 && j >= 0) goalAt.set(key(i, j), f);
  }
  const moves = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  let best: { state: number; cost: number } | undefined;
  for (let next = pop(); next; next = pop()) {
    const [cost, state] = next;
    if (cost > (dist.get(state) ?? Infinity)) continue;
    if (best && cost >= best.cost) break;
    const cellKey = state >> 2;
    const dirNow = state & 3;
    const goal = goalAt.get(cellKey);
    if (goal) {
      // Entering against the face's outward heading is straight; any other heading is a bend.
      const into = heading(goal) ^ 1;
      const total = cost + (into === dirNow ? 0 : BEND) + goal.cost;
      if (!best || total < best.cost) best = { state, cost: total };
    }
    const i = cellKey % W;
    const j = Math.floor(cellKey / W);
    moves.forEach(([di, dj], d) => {
      const k = i + di;
      const l = j + dj;
      if (k < 0 || l < 0 || k >= W || l >= ys.length || !free(k, l) || !step(i, j, k, l)) return;
      const len = Math.abs((xs[k] ?? 0) - (xs[i] ?? 0)) + Math.abs((ys[l] ?? 0) - (ys[j] ?? 0));
      const run = [
        { x: xs[i] ?? 0, y: ys[j] ?? 0 },
        { x: xs[k] ?? 0, y: ys[l] ?? 0 },
      ];
      const c = cost + len + (d === dirNow ? 0 : BEND) + (alongBorder(run, borders, 0.5) ? 200 : 0);
      const s = key(k, l) * 4 + d;
      if (c < (dist.get(s) ?? Infinity)) {
        dist.set(s, c);
        from.set(s, state);
        push(c, s);
      }
    });
  }
  if (!best) return undefined;
  const path: Point[] = [];
  let origin = best.state;
  for (let s: number | undefined = best.state; s !== undefined; s = from.get(s)) {
    const c = s >> 2;
    path.push({ x: xs[c % W] ?? 0, y: ys[Math.floor(c / W)] ?? 0 });
    origin = s;
  }
  path.reverse();
  const start = startAt.get(origin);
  const goal = goalAt.get(best.state >> 2);
  if (!start || !goal) return undefined;
  return simplify([start.at, ...path, goal.at]);
}

const inside = (p: Point, b: Box) =>
  p.x > b.x + 1 && p.x < b.x + b.w - 1 && p.y > b.y + 1 && p.y < b.y + b.h - 1;
