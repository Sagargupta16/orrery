// Dependency arrows: finish to start, from a bar's end to the next item's start. Every candidate
// leaves its source by a side the label leaves free, runs straight or turns in the gap between
// rows, and enters its target the same way; the one that clears every bar, marker and label with
// the fewest bends wins. Deterministic: candidates come in a fixed order and ties keep the first.

import { textBlock } from "../../text.ts";
import type { Box, ModelEdge, Point, SceneEdge, SceneNode } from "../../types.ts";
import { SIZES } from "../sizes.ts";
import { round } from "./axis.ts";
import type { TimelineItem } from "./index.ts";

/** A port: where the line meets the item and the way it leaves (out) or arrives (in). */
interface Port {
  p: Point;
  d: Point;
  /** Leaving or arriving across the row (top or bottom) costs a little more than along it. */
  across: boolean;
}

/** What a route must keep clear of. */
export interface Field {
  nodes: SceneNode[];
  items: Map<string, TimelineItem>;
  /** y of the middle of each gap between two rows (in a lane or across lanes): a line runs there. */
  corridors: number[];
  /** The plot the lines stay inside: right of the lane headers, under the axis. */
  plot: Box;
  /** x of the today line: an arrow running down it would vanish into it. */
  today?: number;
}

const STUB = 12;
/** The straight run an arrowhead needs before it (classic heads are 9px). */
const HEAD_RUN = 14;
/** Closer than this a line reads as touching a node (check DG221). */
const SKIM = 10;

const HIT = 1000;
/** What a path pays for each turn, each px of length, and each end that leaves across a row. */
const BEND = 8;
const PER_PX = 0.02;
const ACROSS = 10;

function hitsBox(p: Point, q: Point, b: Box, inset: number): boolean {
  const box = { x: b.x + inset, y: b.y + inset, w: b.w - 2 * inset, h: b.h - 2 * inset };
  if (box.w <= 0 || box.h <= 0) return false;
  const x0 = Math.min(p.x, q.x);
  const x1 = Math.max(p.x, q.x);
  const y0 = Math.min(p.y, q.y);
  const y1 = Math.max(p.y, q.y);
  // Orthogonal segments only: a box test on the segment's own box.
  return x0 < box.x + box.w && box.x < x1 && y0 < box.y + box.h && box.y < y1;
}

function distance(p: Point, q: Point, b: Box): number {
  const x0 = Math.min(p.x, q.x);
  const x1 = Math.max(p.x, q.x);
  const y0 = Math.min(p.y, q.y);
  const y1 = Math.max(p.y, q.y);
  const dx = Math.max(b.x - x1, 0, x0 - (b.x + b.w));
  const dy = Math.max(b.y - y1, 0, y0 - (b.y + b.h));
  return Math.hypot(dx, dy);
}

const real = (b?: Box): b is Box => !!b && b.w > 0 && b.h > 0;

/** The box a segment must reach before cost() charges it anything for the thing inside. */
interface Reach {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The last query that returned it, so a query lists it once however many cells it spans. */
  seen: number;
}

/** A node with its text boxes: a segment within SKIM of the node or 1px of a text box pays. */
interface Obstacle extends Reach {
  nd: SceneNode;
  texts: Box[];
}

/** A segment of an arrow routed before: one within 3px of it pays for running along it. */
interface Track extends Reach {
  p: Point;
  q: Point;
}

function obstacleOf(nd: SceneNode): Obstacle {
  const texts = [nd.labelBox, nd.noteBox, nd.iconBox].filter(
    (tb): tb is Box => real(tb) && tb !== nd.box,
  );
  const b = nd.box;
  return {
    nd,
    texts,
    x0: Math.min(b.x - SKIM, ...texts.map((t) => t.x - 1)),
    y0: Math.min(b.y - SKIM, ...texts.map((t) => t.y - 1)),
    x1: Math.max(b.x + b.w + SKIM, ...texts.map((t) => t.x + t.w + 1)),
    y1: Math.max(b.y + b.h + SKIM, ...texts.map((t) => t.y + t.h + 1)),
    seen: 0,
  };
}

function trackOf(p: Point, q: Point): Track {
  const x0 = Math.min(p.x, q.x) - 3;
  const y0 = Math.min(p.y, q.y) - 3;
  const x1 = Math.max(p.x, q.x) + 3;
  const y1 = Math.max(p.y, q.y) + 3;
  return { p, q, x0, y0, x1, y1, seen: 0 };
}

const CELL = 64;

/**
 * Reaches bucketed by the CELL squares over the plot that they cover (anything outside lands in
 * the border cells), so a segment looks only at what lies near it, not at every node and arrow.
 */
interface Grid<T extends Reach> {
  x: number;
  y: number;
  cols: number;
  rows: number;
  cells: T[][];
  queries: number;
}

function gridOver<T extends Reach>(area: Box): Grid<T> {
  const cols = Math.max(1, Math.ceil(area.w / CELL));
  const rows = Math.max(1, Math.ceil(area.h / CELL));
  const cells = Array.from({ length: cols * rows }, (): T[] => []);
  return { x: area.x, y: area.y, cols, rows, cells, queries: 0 };
}

/** Every cell a box covers, row by row. */
function cellsOf<T extends Reach>(g: Grid<T>, x0: number, y0: number, x1: number, y1: number) {
  const col = (x: number) => Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.x) / CELL)));
  const row = (y: number) => Math.min(g.rows - 1, Math.max(0, Math.floor((y - g.y) / CELL)));
  const out: T[][] = [];
  for (let j = row(y0); j <= row(y1); j++)
    for (let i = col(x0); i <= col(x1); i++) out.push(g.cells[j * g.cols + i] ?? []);
  return out;
}

function put<T extends Reach>(g: Grid<T>, r: T): void {
  for (const cell of cellsOf(g, r.x0, r.y0, r.x1, r.y1)) cell.push(r);
}

/** Each reach that meets the box from (x0, y0) to (x1, y1), once. */
function nearby<T extends Reach>(g: Grid<T>, x0: number, y0: number, x1: number, y1: number): T[] {
  const q = ++g.queries;
  const out: T[] = [];
  for (const cell of cellsOf(g, x0, y0, x1, y1))
    for (const r of cell)
      if (r.seen !== q && !(x1 < r.x0 || r.x1 < x0 || y1 < r.y0 || r.y1 < y0)) {
        r.seen = q;
        out.push(r);
      }
  return out;
}

/** What every path is scored against: the field, its nodes and the arrows routed so far. */
interface Scan {
  field: Field;
  obstacles: Grid<Obstacle>;
  routed: Grid<Track>;
}

function exits(it: TimelineItem, nd: SceneNode): Port[] {
  const b = nd.box;
  const cy = b.y + b.h / 2;
  const out: Port[] = [];
  if (it.side !== "right")
    out.push({ p: { x: b.x + b.w, y: cy }, d: { x: 1, y: 0 }, across: false });
  const xs =
    it.shape === "bar" && b.w >= 2 * HEAD_RUN
      ? [b.x + b.w - HEAD_RUN, b.x + b.w / 2]
      : [b.x + b.w / 2];
  for (const x of xs) {
    out.push({ p: { x, y: b.y + b.h }, d: { x: 0, y: 1 }, across: true });
    out.push({ p: { x, y: b.y }, d: { x: 0, y: -1 }, across: true });
  }
  return out;
}

function entries(it: TimelineItem, nd: SceneNode): Port[] {
  const b = nd.box;
  const cy = b.y + b.h / 2;
  const out: Port[] = [];
  if (it.side !== "left") out.push({ p: { x: b.x, y: cy }, d: { x: -1, y: 0 }, across: false });
  const xs =
    it.shape === "bar" && b.w >= 2 * HEAD_RUN ? [b.x + HEAD_RUN, b.x + b.w / 2] : [b.x + b.w / 2];
  for (const x of xs) {
    out.push({ p: { x, y: b.y }, d: { x: 0, y: -1 }, across: true });
    out.push({ p: { x, y: b.y + b.h }, d: { x: 0, y: 1 }, across: true });
  }
  return out;
}

/** Drops repeated and collinear points; undefined when the path turns back on itself. */
function tidy(points: Point[]): Point[] | undefined {
  const pts: Point[] = [];
  for (const p of points) {
    const q = { x: round(p.x), y: round(p.y) };
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - q.x) < 0.01 && Math.abs(last.y - q.y) < 0.01) continue;
    pts.push(q);
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a && b && Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) return undefined;
  }
  const out: Point[] = [];
  for (const p of pts) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    if (a && b) {
      const along =
        (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - p.x) < 0.01) ||
        (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - p.y) < 0.01);
      if (along) {
        // Same line: a turn back is a U on itself, else the middle point goes.
        const back = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) < 0;
        if (back) return undefined;
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out.length >= 2 ? out : undefined;
}

const segs = (pts: Point[]) => pts.slice(1).map((q, i) => [pts[i] ?? q, q] as [Point, Point]);

const length = (pts: Point[]) =>
  segs(pts).reduce((s, [p, q]) => s + Math.abs(q.x - p.x) + Math.abs(q.y - p.y), 0);

/**
 * Every orthogonal path from port to port that could still cost less than `limit`: straight, one
 * turn, or a jog along a row gap. `clear` holds the columns just clear of each item's ends.
 */
function candidates(a: Port, b: Port, field: Field, clear: number[], limit: number): Point[][] {
  // The least a path through column m can cost (every cost() term only adds): its ends, its
  // length to m and on to the target (less 1px for the rounding in tidy), and the two turns it
  // takes to come back when m lies beyond both ports.
  const ends = (a.across ? ACROSS : 0) + (b.across ? ACROSS : 0);
  const rise = Math.abs(a.p.y - b.p.y);
  const least = (m: number) => {
    const back = m > Math.max(a.p.x, b.p.x) + 0.5 || m < Math.min(a.p.x, b.p.x) - 0.5;
    const run = Math.abs(m - a.p.x) + Math.abs(m - b.p.x) + rise - 1;
    return ends + (back ? 2 * BEND : 0) + run * PER_PX;
  };
  // Every path starts at x = a.p.x, so this bounds them all.
  if (least(a.p.x) >= limit) return [];
  const open = (m: number) => least(m) < limit;
  const s = { x: a.p.x + a.d.x * STUB, y: a.p.y + a.d.y * STUB };
  const t = { x: b.p.x + b.d.x * STUB, y: b.p.y + b.d.y * STUB };
  const mids: Point[][] = [[{ x: t.x, y: s.y }], [{ x: s.x, y: t.y }]];
  for (const c of field.corridors)
    mids.push([
      { x: s.x, y: c },
      { x: t.x, y: c },
    ]);
  // Columns a line can drop down: evenly between the ports, and just clear of each item's ends.
  const { plot } = field;
  const columns = [
    ...Array.from({ length: 7 }, (_, k) => s.x + ((t.x - s.x) * (k + 1)) / 8).filter(
      (m) => m > plot.x + 2 && m < plot.x + plot.w - 2,
    ),
    ...clear,
  ].filter(open);
  for (const m of columns)
    mids.push([
      { x: m, y: s.y },
      { x: m, y: t.y },
    ]);
  // Around an item in the way: along the gap next to the source, down a clear column, along the
  // gap next to the target.
  const near = (y: number) =>
    [...field.corridors].sort((u, v) => Math.abs(u - y) - Math.abs(v - y) || u - v).slice(0, 2);
  const around = clear.filter(open);
  for (const c1 of near(s.y))
    for (const c2 of near(t.y))
      for (const m of around)
        mids.push([
          { x: s.x, y: c1 },
          { x: m, y: c1 },
          { x: m, y: c2 },
          { x: t.x, y: c2 },
        ]);
  const out: Point[][] = [];
  // The straight line first: a row to the next item in it.
  if (Math.abs(a.p.y - b.p.y) < 0.01 && !a.across && !b.across && b.p.x > a.p.x)
    out.push([a.p, b.p]);
  for (const mid of mids) {
    const path = tidy([a.p, s, ...mid, t, b.p]);
    if (path) out.push(path);
  }
  return out;
}

/**
 * Penalty of a path: what it runs through, how close it passes, its bends and its length.
 * Infinite once the sum reaches `limit`: every term only adds, so the path cannot win.
 */
function cost(
  path: Point[],
  from: string,
  to: string,
  scan: Scan,
  a: Port,
  b: Port,
  limit: number,
): number {
  const bends = (path.length - 2) * BEND;
  const run = length(path) * PER_PX;
  const aEnd = a.across ? ACROSS : 0;
  const bEnd = b.across ? ACROSS : 0;
  const tail = bends + run + aEnd + bEnd;
  if (tail >= limit) return Number.POSITIVE_INFINITY;
  let c = 0;
  const ss = segs(path);
  const { field } = scan;
  const { plot } = field;
  for (const [i, [p, q]] of ss.entries()) {
    const x0 = Math.min(p.x, q.x);
    const x1 = Math.max(p.x, q.x);
    const y0 = Math.min(p.y, q.y);
    const y1 = Math.max(p.y, q.y);
    // The terms are whole numbers, so the order the grid lists things in cannot change the sum.
    for (const o of nearby(scan.obstacles, x0, y0, x1, y1)) {
      const { nd } = o;
      const own = nd.id === from || nd.id === to;
      // Its own bar only at the ends: the first segment leaves it, the last arrives.
      const skip = (nd.id === from && i === 0) || (nd.id === to && i === ss.length - 1);
      if (!skip && hitsBox(p, q, nd.box, own ? 1 : -2)) c += HIT;
      if (!own && distance(p, q, nd.box) < SKIM) c += 40;
      for (const tb of o.texts) if (hitsBox(p, q, tb, -1)) c += HIT;
    }
    if (field.today !== undefined && Math.abs(p.x - q.x) < 0.01 && Math.abs(p.x - field.today) < 5)
      c += 30;
    for (const pt of [p, q])
      if (
        pt.x < plot.x - 0.5 ||
        pt.x > plot.x + plot.w + 0.5 ||
        pt.y < plot.y ||
        pt.y > plot.y + plot.h
      )
        c += HIT;
    if (c + tail >= limit) return Number.POSITIVE_INFINITY;
    for (const { p: u, q: v } of nearby(scan.routed, x0, y0, x1, y1)) {
      const ph = Math.abs(p.y - q.y) < 0.01;
      const uh = Math.abs(u.y - v.y) < 0.01;
      if (ph === uh) {
        // Running along another line on the same track reads as one line.
        const same = ph ? Math.abs(p.y - u.y) < 3 : Math.abs(p.x - u.x) < 3;
        const lo = ph
          ? Math.max(Math.min(p.x, q.x), Math.min(u.x, v.x))
          : Math.max(Math.min(p.y, q.y), Math.min(u.y, v.y));
        const hi = ph
          ? Math.min(Math.max(p.x, q.x), Math.max(u.x, v.x))
          : Math.min(Math.max(p.y, q.y), Math.max(u.y, v.y));
        if (same && hi - lo > 1) c += 60;
      } else {
        const [h0, h1, vv0, vv1] = ph ? [p, q, u, v] : [u, v, p, q];
        const x = vv0.x;
        const y = h0.y;
        if (
          x > Math.min(h0.x, h1.x) + 0.5 &&
          x < Math.max(h0.x, h1.x) - 0.5 &&
          y > Math.min(vv0.y, vv1.y) + 0.5 &&
          y < Math.max(vv0.y, vv1.y) - 0.5
        )
          c += 12;
      }
    }
    if (c + tail >= limit) return Number.POSITIVE_INFINITY;
  }
  const last = ss[ss.length - 1];
  if (last) {
    const [p, q] = last;
    if (Math.abs(q.x - p.x) + Math.abs(q.y - p.y) < HEAD_RUN) c += 300;
  }
  return c + bends + run + aEnd + bEnd;
}

/** The dependency arrows, in spec order; each sees the ones routed before it. */
export function routeEdges(edges: ModelEdge[], field: Field): SceneEdge[] {
  const byId = new Map(field.nodes.map((nd) => [nd.id, nd]));
  const { plot } = field;
  // The same for every arrow: the columns just clear of each item's ends, and the nodes. Items
  // that share a date share a column, and a repeat could only tie with the path it repeats.
  const clear = [
    ...new Set(field.nodes.flatMap((nd) => [nd.box.x - SKIM - 2, nd.box.x + nd.box.w + SKIM + 2])),
  ].filter((m) => m > plot.x + 2 && m < plot.x + plot.w - 2);
  const scan: Scan = { field, obstacles: gridOver(plot), routed: gridOver(plot) };
  for (const nd of field.nodes) put(scan.obstacles, obstacleOf(nd));
  const out: SceneEdge[] = [];
  for (const e of edges) {
    const an = byId.get(e.from);
    const bn = byId.get(e.to);
    const ai = field.items.get(e.from);
    const bi = field.items.get(e.to);
    if (!an || !bn || !ai || !bi || e.from === e.to) continue;
    let best: Point[] | undefined;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const a of exits(ai, an))
      for (const b of entries(bi, bn))
        for (const path of candidates(a, b, field, clear, bestCost)) {
          const c = cost(path, e.from, e.to, scan, a, b, bestCost);
          if (c < bestCost - 1e-9) {
            best = path;
            bestCost = c;
          }
        }
    if (!best) continue;
    for (const [p, q] of segs(best)) put(scan.routed, trackOf(p, q));
    out.push({
      id: e.id,
      from: e.from,
      to: e.to,
      points: best,
      line: e.line,
      arrow: e.arrow,
      ...(e.color ? { color: e.color } : {}),
      ...(e.label ? { label: textBlock(e.label, SIZES.edgeLabel, SIZES.edgeLabelMax) } : {}),
    });
  }
  return out;
}

/** Each labelled arrow's label at the first clear spot along its longest runs, else its first. */
export function placeEdgeLabels(edges: SceneEdge[], field: Field): void {
  const taken: Box[] = [];
  const blocked = field.nodes.flatMap((nd) =>
    [nd.box, nd.labelBox, nd.noteBox, nd.iconBox].filter(real),
  );
  for (const e of edges) {
    const label = e.label;
    if (!label) continue;
    const w = Math.ceil(label.width + 12);
    const h = Math.ceil(label.height + 6);
    const spots: Box[] = [];
    const runs = segs(e.points).sort(
      ([p, q], [u, v]) =>
        Math.abs(v.x - u.x) + Math.abs(v.y - u.y) - (Math.abs(q.x - p.x) + Math.abs(q.y - p.y)),
    );
    for (const [p, q] of runs) {
      const flat = Math.abs(p.y - q.y) < 0.01;
      for (const f of [0.5, 0.3, 0.7]) {
        const mx = p.x + (q.x - p.x) * f;
        const my = p.y + (q.y - p.y) * f;
        if (flat)
          spots.push({ x: mx - w / 2, y: my - h - 3, w, h }, { x: mx - w / 2, y: my + 3, w, h });
        else spots.push({ x: mx + 4, y: my - h / 2, w, h }, { x: mx - 4 - w, y: my - h / 2, w, h });
      }
    }
    const clear = (b: Box) =>
      b.x >= field.plot.x &&
      b.x + b.w <= field.plot.x + field.plot.w &&
      b.y >= field.plot.y &&
      b.y + b.h <= field.plot.y + field.plot.h &&
      ![...blocked, ...taken].some((o) =>
        hitsBox({ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, o, -3),
      ) &&
      !edges.some((o) =>
        segs(o.points).some(([p, q]) =>
          hitsBox(p, q, { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 }, 0),
        ),
      );
    const spot = spots.find(clear) ?? spots[0];
    if (!spot) continue;
    const box = { x: round(spot.x), y: round(spot.y), w, h };
    taken.push(box);
    e.labelBox = box;
  }
}
