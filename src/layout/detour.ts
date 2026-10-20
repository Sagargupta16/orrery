// The detour router, the last resort for an edge drawn after ELK when no elbow clears: the faces
// each end may leave by, the lines 12px off every obstacle, and a Dijkstra search over them.

import type { Box, Point } from "../types.ts";
import { alongBorder, HEAD_ROOM, type RouteEnd } from "./elbows.ts";
import { round, segmentHits } from "./geometry.ts";

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
  const lines = routeLines([a.full, b.full, ...obstacles], walls, borders, [...starts, ...goals]);
  const found = shortest(lines, walls, borders, starts, goals);
  return found && simplify([found.start.at, ...found.path, found.goal.at]);
}

/** The lines a detour may run on: x positions across, y positions down, in order. */
interface RouteLines {
  xs: number[];
  ys: number[];
}

/**
 * Lines 12px off every wall and 16px either side of each border, through each end's stub, inside
 * a frame 40px around everything, plus the midline of every gap wider than 4px.
 */
function routeLines(all: Box[], walls: Box[], borders: Box[], ends: Face[]): RouteLines {
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
          ...ends.map((f) => pick(f.stub)),
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
  return { xs, ys };
}

/** A search state's cost and id: (point index * 4 + heading 0..3). */
type Entry = [number, number];

/** Adds an entry to a binary min-heap keyed by cost. */
function heapPush(heap: Entry[], cost: number, state: number): void {
  heap.push([cost, state]);
  let c = heap.length - 1;
  while (c > 0) {
    const p = (c - 1) >> 1;
    if ((heap[p]?.[0] ?? 0) <= cost) break;
    [heap[p], heap[c]] = [heap[c] as Entry, heap[p] as Entry];
    c = p;
  }
}

/** Takes the cheapest entry off a binary min-heap. */
function heapPop(heap: Entry[]): Entry | undefined {
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
    [heap[m], heap[c]] = [heap[c] as Entry, heap[m] as Entry];
    c = m;
  }
  return top;
}

const headingOf = (f: Face) =>
  f.stub.x > f.at.x ? 0 : f.stub.x < f.at.x ? 1 : f.stub.y > f.at.y ? 2 : 3;

/**
 * Dijkstra over (point, heading) states on the route lines: a run costs its length, a bend 40px
 * and a run along a group border 200px more. Returns the faces it leaves and enters by and the
 * points between their stubs, or undefined when no goal is reachable.
 */
function shortest(
  lines: RouteLines,
  walls: Box[],
  borders: Box[],
  starts: Face[],
  goals: Face[],
): { start: Face; goal: Face; path: Point[] } | undefined {
  const { xs, ys } = lines;
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
  const heap: Entry[] = [];
  const index = (p: Point) => [xs.indexOf(round(p.x)), ys.indexOf(round(p.y))] as const;
  const startAt = new Map<number, Face>();
  for (const f of starts) {
    const [i, j] = index(f.stub);
    if (i < 0 || j < 0) continue;
    const s = key(i, j) * 4 + headingOf(f);
    if (f.cost >= (dist.get(s) ?? Infinity)) continue;
    dist.set(s, f.cost);
    startAt.set(s, f);
    heapPush(heap, f.cost, s);
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
  for (let next = heapPop(heap); next; next = heapPop(heap)) {
    const [cost, state] = next;
    if (cost > (dist.get(state) ?? Infinity)) continue;
    if (best && cost >= best.cost) break;
    const cellKey = state >> 2;
    const dirNow = state & 3;
    const goal = goalAt.get(cellKey);
    if (goal) {
      // Entering against the face's outward heading is straight; any other heading is a bend.
      const into = headingOf(goal) ^ 1;
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
        heapPush(heap, c, s);
      }
    });
  }
  if (!best) return undefined;
  const { path, origin } = trace(lines, from, best.state);
  const start = startAt.get(origin);
  const goal = goalAt.get(best.state >> 2);
  if (!start || !goal) return undefined;
  return { start, goal, path };
}

/** Walks the search back from its last state: the points in order, and the state it began at. */
function trace(
  lines: RouteLines,
  from: Map<number, number>,
  last: number,
): { path: Point[]; origin: number } {
  const { xs, ys } = lines;
  const W = xs.length;
  const path: Point[] = [];
  let origin = last;
  for (let s: number | undefined = last; s !== undefined; s = from.get(s)) {
    const c = s >> 2;
    path.push({ x: xs[c % W] ?? 0, y: ys[Math.floor(c / W)] ?? 0 });
    origin = s;
  }
  path.reverse();
  return { path, origin };
}

const inside = (p: Point, b: Box) =>
  p.x > b.x + 1 && p.x < b.x + b.w - 1 && p.y > b.y + 1 && p.y < b.y + b.h - 1;
