// The router lane edges run on: cheapest orthogonal paths over a grid of lines, around obstacles.

import type { Box, Point } from "../types.ts";
import { BEND, cuts } from "./lane-shared.ts";

/** Directions of travel in screen space. */
export type Dir = 0 | 1 | 2 | 3;
export const STEPS: Record<Dir, Point> = {
  0: { x: 1, y: 0 },
  1: { x: -1, y: 0 },
  2: { x: 0, y: 1 },
  3: { x: 0, y: -1 },
};
export const flip = (d: Dir): Dir => (d === 0 ? 1 : d === 1 ? 0 : d === 2 ? 3 : 2);

export interface Port {
  p: Point;
  /** Leaving: the direction it leaves in; arriving: the direction it travels into the end. */
  d: Dir;
  cost: number;
  /** Obstacles around the port's own box (and a label it starts below) its ray leaves through. */
  skip?: Box[];
  /** The end's own label or note the port moved past. */
  through?: Box[];
}

export interface Obstacle {
  box: Box;
  /** Part of an edge end: the fallback route keeps only these. */
  own: boolean;
}

/** An elbow between two points when no grid route exists. */
export function elbow(p: Point, q: Point, horizontal: boolean): Point[] {
  if (horizontal) {
    const mx = (p.x + q.x) / 2;
    return [p, { x: mx, y: p.y }, { x: mx, y: q.y }, q];
  }
  const my = (p.y + q.y) / 2;
  return [p, { x: p.x, y: my }, { x: q.x, y: my }, q];
}

/** The lines a route may run on, and what each stretch of them costs. */
interface Grid {
  xs: number[];
  ys: number[];
  nx: number;
  ny: number;
  at: (i: number, j: number) => Point;
  blocked: (p: Point, q: Point, skip?: Box[]) => boolean;
  penalty: (p: Point, q: Point) => number;
}

/** The search state: best cost and predecessor per (cell, direction), and the open heap. */
interface Search {
  dist: Float64Array;
  prev: Int32Array;
  startOf: Map<number, Point>;
  heap: [number, number][];
  goals: Map<number, { extra: number; port: Port }>;
}

const uniq = (v: number[]) =>
  [...v].sort((a, b) => a - b).filter((x, i, s) => i === 0 || x - (s[i - 1] ?? 0) > 0.5);

const indexOf = (list: number[], v: number) => list.findIndex((x) => Math.abs(x - v) <= 0.5);

const stateOf = (g: Grid, i: number, j: number, d: Dir) => (i * g.ny + j) * 4 + d;

/**
 * The cheapest orthogonal route on the grid of lines `xs` and `ys` from one of the start ports to
 * one of the end ports: length, plus a cost per bend, plus `penalty` per segment. Obstacles are
 * boxes no segment may enter; a port's own ray out of its node skips that node.
 */
export function gridRoute(
  xsIn: number[],
  ysIn: number[],
  starts: Port[],
  ends: Port[],
  obstacles: Obstacle[],
  penalty: (p: Point, q: Point) => number,
): Point[] | undefined {
  const xs = uniq(xsIn);
  const ys = uniq(ysIn);
  const g: Grid = {
    xs,
    ys,
    nx: xs.length,
    ny: ys.length,
    at: (i: number, j: number): Point => ({ x: xs[i] ?? 0, y: ys[j] ?? 0 }),
    blocked: (p: Point, q: Point, skip?: Box[]) =>
      obstacles.some((o) => !skip?.includes(o.box) && cuts(p, q, o.box)),
    penalty,
  };
  const costs = segmentCosts(g);
  const N = g.nx * g.ny * 4;
  const s: Search = {
    dist: new Float64Array(N + 1).fill(Number.POSITIVE_INFINITY),
    prev: new Int32Array(N + 1).fill(-1),
    startOf: new Map<number, Point>(),
    heap: [],
    goals: new Map<number, { extra: number; port: Port }>(),
  };
  seed(g, s, starts, ends);
  return trace(g, s, search(g, s, costs, N));
}

/** Segment costs between neighbors, per edge; Infinity where blocked. */
function segmentCosts(g: Grid): { right: Float64Array; down: Float64Array } {
  const { nx, ny, at, blocked, penalty } = g;
  const right = new Float64Array(nx * ny).fill(Number.POSITIVE_INFINITY);
  const down = new Float64Array(nx * ny).fill(Number.POSITIVE_INFINITY);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const p = at(i, j);
      if (i + 1 < nx) {
        const q = at(i + 1, j);
        if (!blocked(p, q)) right[i * ny + j] = q.x - p.x + penalty(p, q);
      }
      if (j + 1 < ny) {
        const q = at(i, j + 1);
        if (!blocked(p, q)) down[i * ny + j] = q.y - p.y + penalty(p, q);
      }
    }
  return { right, down };
}

function push(heap: [number, number][], cost: number, s: number): void {
  heap.push([cost, s]);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    const a = heap[parent];
    const b = heap[i];
    if (!a || !b || a[0] <= b[0]) break;
    heap[parent] = b;
    heap[i] = a;
    i = parent;
  }
}

function pop(heap: [number, number][]): [number, number] | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (!top || !last) return undefined;
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const rr = l + 1;
      let m = i;
      if ((heap[l]?.[0] ?? Number.POSITIVE_INFINITY) < (heap[m]?.[0] ?? 0)) m = l;
      if ((heap[rr]?.[0] ?? Number.POSITIVE_INFINITY) < (heap[m]?.[0] ?? 0)) m = rr;
      if (m === i) break;
      const a = heap[m];
      const b = heap[i];
      if (!a || !b) break;
      heap[m] = b;
      heap[i] = a;
      i = m;
    }
  }
  return top;
}

/** Rays: from a start port out to each line it crosses, until something blocks it. */
function ray(
  g: Grid,
  port: Port,
  back: boolean,
  visit: (i: number, j: number, cost: number) => void,
): void {
  const { xs, ys, blocked, penalty } = g;
  const step = STEPS[port.d];
  const s = back ? -1 : 1;
  const p = port.p;
  if (step.x) {
    const j = indexOf(ys, p.y);
    if (j < 0) return;
    const order = xs.map((x, i) => [x, i] as const).filter(([x]) => (x - p.x) * step.x * s > 0.5);
    order.sort((a, b) => Math.abs(a[0] - p.x) - Math.abs(b[0] - p.x));
    for (const [x, i] of order) {
      const q = { x, y: p.y };
      if (blocked(p, q, port.skip)) break;
      visit(i, j, Math.abs(x - p.x) + penalty(p, q));
    }
  } else {
    const i = indexOf(xs, p.x);
    if (i < 0) return;
    const order = ys.map((y, j) => [y, j] as const).filter(([y]) => (y - p.y) * step.y * s > 0.5);
    order.sort((a, b) => Math.abs(a[0] - p.y) - Math.abs(b[0] - p.y));
    for (const [y, j] of order) {
      const q = { x: p.x, y };
      if (blocked(p, q, port.skip)) break;
      visit(i, j, Math.abs(y - p.y) + penalty(p, q));
    }
  }
}

/** Opens the search at every line the start ports reach, and marks what the end ports reach. */
function seed(g: Grid, srch: Search, starts: Port[], ends: Port[]): void {
  const { dist, prev, startOf, heap, goals } = srch;
  for (const port of starts)
    ray(g, port, false, (i, j, len) => {
      const s = stateOf(g, i, j, port.d);
      const cost = port.cost + len;
      if (cost < (dist[s] ?? 0)) {
        dist[s] = cost;
        prev[s] = -1;
        startOf.set(s, port.p);
        push(heap, cost, s);
      }
    });
  for (const port of ends)
    ray(g, port, true, (i, j, len) => {
      const s = stateOf(g, i, j, port.d);
      const extra = port.cost + len;
      const had = goals.get(s);
      if (!had || extra < had.extra) goals.set(s, { extra, port });
    });
}

/** Dijkstra over (cell, direction) states; the state the best route reaches its goal from. */
function search(
  g: Grid,
  srch: Search,
  costs: { right: Float64Array; down: Float64Array },
  N: number,
): number {
  const { nx, ny } = g;
  const { right, down } = costs;
  const { dist, prev, heap, goals } = srch;
  const GOAL = N;
  let goalFrom = -1;
  for (;;) {
    const top = pop(heap);
    if (!top) break;
    const [cost, s] = top;
    if (cost > (dist[s] ?? 0)) continue;
    if (s === GOAL) break;
    const goal = goals.get(s);
    if (goal && cost + goal.extra < (dist[GOAL] ?? 0)) {
      dist[GOAL] = cost + goal.extra;
      goalFrom = s;
      push(heap, dist[GOAL] ?? 0, GOAL);
    }
    const d = (s % 4) as Dir;
    const cell = (s - d) / 4;
    const i = Math.floor(cell / ny);
    const j = cell % ny;
    const relax = (t: number, c: number) => {
      if (c < (dist[t] ?? 0)) {
        dist[t] = c;
        prev[t] = s;
        push(heap, c, t);
      }
    };
    // Straight on.
    if (d === 0 && i + 1 < nx) relax(stateOf(g, i + 1, j, 0), cost + (right[i * ny + j] ?? 0));
    if (d === 1 && i > 0) relax(stateOf(g, i - 1, j, 1), cost + (right[(i - 1) * ny + j] ?? 0));
    if (d === 2 && j + 1 < ny) relax(stateOf(g, i, j + 1, 2), cost + (down[i * ny + j] ?? 0));
    if (d === 3 && j > 0) relax(stateOf(g, i, j - 1, 3), cost + (down[i * ny + j - 1] ?? 0));
    // Turns.
    for (const t of (d < 2 ? [2, 3] : [0, 1]) as Dir[]) relax(stateOf(g, i, j, t), cost + BEND);
  }
  return goalFrom;
}

/** The route back from the goal through each predecessor to its start port. */
function trace(g: Grid, srch: Search, goalFrom: number): Point[] | undefined {
  const { ny, at } = g;
  const { prev, startOf, goals } = srch;
  if (goalFrom < 0) return undefined;
  const goal = goals.get(goalFrom);
  if (!goal) return undefined;
  const path: Point[] = [goal.port.p];
  let s = goalFrom;
  let first = s;
  while (s >= 0) {
    const cell = (s - (s % 4)) / 4;
    path.push(at(Math.floor(cell / ny), cell % ny));
    first = s;
    s = prev[s] ?? -1;
  }
  const origin = startOf.get(first);
  if (origin) path.push(origin);
  return path.reverse();
}
