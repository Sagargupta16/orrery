// Routes every lane edge again on a grid of the gaps between layers and the bands' lines.

import { textBlock } from "../../text.ts";
import type { Box, ModelEdge, Point, SceneEdge } from "../../types.ts";
import { elbow, flip, gridRoute, type Obstacle, type Port, STEPS } from "./grid.ts";
import { placeLabels } from "./labels.ts";
import { type End, endOf, type Ports, portsFor, portsOf } from "./ports.ts";
import {
  type Band,
  CHANNEL,
  CLEAR,
  clusters,
  cuts,
  dropStraight,
  EDGE_LABEL,
  EDGE_LABEL_MAX,
  footOf,
  grow,
  type Routing,
  round,
} from "./shared.ts";

interface Placed {
  edge: SceneEdge;
  p: Point;
  q: Point;
}

/** The grid lines along and across the flow, and the stretches across it between pools. */
interface Lines {
  mLines: Set<number>;
  cLines: Set<number>;
  /** Bands with a frame or items in them. */
  drawn: Band[];
  poolGaps: [number, number][];
}

/** What routing every edge shares. */
interface Router {
  r: Routing;
  lines: Lines;
  ports: Ports;
  /** What lines stay out of: label strips and group headers. */
  strips: { band: Band; box: Box }[];
  groupHeads: Box[];
  placed: Placed[];
  /** Across the flow: the inside of every framed band. */
  inside: (readonly [number, number])[];
  joins: Map<string, number>;
}

// A split shares its trunk and a join its last run, but only between edges drawn alike.
const kindOf = (e: { flow?: string; line: string }) => `${e.flow ?? "sequence"} ${e.line}`;
const related = (a: SceneEdge, b: SceneEdge) =>
  (a.from === b.from || a.to === b.to) && kindOf(a) === kindOf(b);

export function routeEdges(r: Routing): SceneEdge[] {
  const { ctx } = r;
  const { model } = ctx;
  const existing = new Map(ctx.edges.map((e) => [e.id, e]));
  const lines = gridLines(r);

  // What lines stay out of: other nodes, label strips, black boxes, group headers.
  const strips = r.all.flatMap((b) =>
    b.scene?.lane ? [{ band: b, box: b.scene.lane.header }] : [],
  );
  const groupHeads = ctx.groups
    .filter((g) => !g.lane && g.label.lines.length && g.labelBox.w > 0)
    .map((g) => grow(g.labelBox, 2));
  const ports = portsOf(r);
  const joins = new Map<string, number>();
  for (const e of model.edges) joins.set(e.to, (joins.get(e.to) ?? 0) + 1);
  const rt: Router = {
    r,
    lines,
    ports,
    strips,
    groupHeads,
    placed: [],
    inside: lines.drawn.filter((b) => b.group).map((b) => [b.c0, b.c0 + b.size] as const),
    joins,
  };

  const out: SceneEdge[] = [];
  const order = model.edges.map((me, i) => {
    const a = endOf(r, me.from);
    const b = endOf(r, me.to);
    const msg = me.flow === "message";
    const span = a && b ? Math.abs(ports.mMid(b.box) - ports.mMid(a.box)) : 0;
    const rank = msg ? 2 : a?.band || b?.band ? 3 : 0;
    return { me, i, a, b, rank, span };
  });
  order.sort((p, q) => p.rank - q.rank || p.span - q.span || p.i - q.i);
  const result = new Map<string, SceneEdge>();
  for (const { me, a, b } of order) {
    const prior = existing.get(me.id);
    // Inside one group item the edge moved with it.
    if (prior && r.items.some((it) => it.inner.includes(prior))) {
      result.set(me.id, prior);
      continue;
    }
    const edge = sceneEdgeFor(me, prior);
    if (!a || !b) {
      if (prior) result.set(me.id, prior);
      continue;
    }
    ports.kind = kindOf(me);
    // A message, or an association to data, leaves across the flow and keeps a point of its own.
    const msg = me.flow === "message" || me.flow === "association";
    const points = routeOne(rt, me, edge, a, b, msg);
    if (!points) {
      if (prior) result.set(me.id, prior);
      continue;
    }
    edge.points = dropStraight(points.map((p) => ({ x: round(p.x), y: round(p.y) })));
    ports.claim(me, edge.points[0], edge.points[edge.points.length - 1], msg);
    for (let k = 1; k < edge.points.length; k++) {
      const p = edge.points[k - 1];
      const q = edge.points[k];
      if (p && q) rt.placed.push({ edge, p, q });
    }
    result.set(me.id, edge);
  }
  for (const me of model.edges) {
    const e = result.get(me.id);
    if (e) out.push(e);
  }
  placeLabels(r, out);
  return out;
}

/**
 * Grid lines along the flow: the gaps between layers (a few tracks each), and before and after
 * them; across it: every node's center line, each band's center and channels, pool gaps.
 */
function gridLines(r: Routing): Lines {
  const { A } = r;
  const mLines = new Set<number>();
  const cLines = new Set<number>();
  const columns = clusters(
    r.items,
    (it) => [it.foot[A.m], it.foot[A.m] + it.foot[A.mw]] as [number, number],
  );
  const spans = columns.map((col) => [
    Math.min(...col.map((it) => it.foot[A.m])),
    Math.max(...col.map((it) => it.foot[A.m] + it.foot[A.mw])),
  ]);
  const gaps: [number, number][] = [];
  let prevEnd = r.contentM;
  for (const [s = 0, e = 0] of spans) {
    gaps.push([prevEnd, s]);
    prevEnd = e;
  }
  gaps.push([prevEnd, r.endM]);
  for (const [s, e] of gaps) {
    const mid = (s + e) / 2;
    if (e - s > 2) mLines.add(round(mid));
    for (let k = 1; k <= 3; k++)
      for (const v of [mid + 12 * k, mid - 12 * k])
        if (v > s + 8 && v < e - 8) mLines.add(round(v));
  }
  for (const it of r.items) {
    mLines.add(round(it.attach[A.m] + it.attach[A.mw] / 2));
    cLines.add(round(it.attach[A.c] + it.attach[A.cw] / 2));
  }
  const drawn = r.all.filter((b) => b.group || b.items.length);
  for (const b of drawn) {
    cLines.add(round(b.c0 + b.size / 2));
    cLines.add(round(b.c0 + CHANNEL));
    cLines.add(round(b.c0 + b.size - CHANNEL));
  }
  const tops = r.all.filter((b) => b.depth === 0 && (b.group || b.items.length));
  const outer0 = Math.min(...tops.map((b) => b.c0));
  const outer1 = Math.max(...tops.map((b) => b.c0 + b.size));
  cLines.add(round(outer0 - 16));
  cLines.add(round(outer1 + 16));
  const sortedTops = [...tops].sort((a, b) => a.c0 - b.c0);
  const poolGaps: [number, number][] = [];
  for (let i = 1; i < sortedTops.length; i++) {
    const a = sortedTops[i - 1];
    const b = sortedTops[i];
    if (!a || !b) continue;
    const s = a.c0 + a.size;
    if (b.c0 - s <= 16) continue;
    poolGaps.push([s, b.c0]);
    for (const v of [(s + b.c0) / 2, (s + b.c0) / 2 - 12, (s + b.c0) / 2 + 12])
      cLines.add(round(v));
  }
  for (const cols of r.layers.values())
    for (const col of cols)
      for (let i = 1; i < col.length; i++) {
        const a = col[i - 1];
        const b = col[i];
        if (a && b) cLines.add(round((a.foot[A.c] + a.foot[A.cw] + b.foot[A.c]) / 2));
      }
  return { mLines, cLines, drawn, poolGaps };
}

/** The scene edge to route: ELK's, or a new one for an edge ELK never saw; labels placed later. */
function sceneEdgeFor(me: ModelEdge, prior: SceneEdge | undefined): SceneEdge {
  const edge: SceneEdge = prior ?? {
    id: me.id,
    from: me.from,
    to: me.to,
    points: [],
    line: me.line,
    arrow: me.arrow,
    color: me.color,
    step: me.step,
    ...(me.flow ? { flow: me.flow } : {}),
  };
  if (me.label && !edge.label) edge.label = textBlock(me.label, EDGE_LABEL, EDGE_LABEL_MAX);
  edge.labelBox = undefined;
  edge.stepBox = undefined;
  return edge;
}

/** One edge's route between its ports, or a plain elbow when the grid has none. */
function routeOne(
  rt: Router,
  me: ModelEdge,
  edge: SceneEdge,
  a: End,
  b: End,
  msg: boolean,
): Point[] | undefined {
  const { mLines, cLines } = rt.lines;
  const horizontal = rt.r.ctx.horizontal;
  const xsOf = () => [...(horizontal ? mLines : cLines)];
  const ysOf = () => [...(horizontal ? cLines : mLines)];
  const addX = (v: number) => (horizontal ? mLines : cLines).add(round(v));
  const addY = (v: number) => (horizontal ? cLines : mLines).add(round(v));
  const { starts, ends } = portsFor(rt.r, rt.ports, me, a, b, msg);
  const obstacles = obstaclesFor(rt, me, a, b, starts, ends);
  for (const port of [...starts, ...ends]) {
    if (STEPS[port.d].x) addY(port.p.y);
    else addX(port.p.x);
  }
  const pref = (rt.joins.get(me.to) ?? 0) > 1 ? ends : starts;
  const prefM = pref[0] ? (horizontal ? pref[0].p.x : pref[0].p.y) : 0;
  const penalty = penaltyOf(rt, me, edge, prefM);
  let points = gridRoute(xsOf(), ysOf(), starts, ends, obstacles, penalty);
  if (!points)
    points = gridRoute(
      xsOf(),
      ysOf(),
      starts,
      ends,
      obstacles.filter((o) => o.own),
      () => 0,
    );
  const s0 = starts[0];
  const e0 = ends[0];
  if (!points && s0 && e0) points = elbow(s0.p, e0.p, horizontal);
  return points;
}

/** Other nodes, strips and headers, and each end's own parts, which only its port's ray skips. */
function obstaclesFor(
  rt: Router,
  me: ModelEdge,
  a: End,
  b: End,
  starts: Port[],
  ends: Port[],
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const n of rt.r.ctx.nodes) {
    if (n.id === me.from || n.id === me.to) continue;
    obstacles.push({ box: grow(footOf(n), CLEAR), own: false });
  }
  for (const s of rt.strips) {
    if (s.band.group && (s.band.group.id === me.from || s.band.group.id === me.to)) continue;
    obstacles.push({ box: s.box, own: false });
  }
  for (const h of rt.groupHeads) obstacles.push({ box: h, own: false });
  // An end's own box keeps lines a little away, except the ray out of its port, which only its
  // own label or note in the way stops.
  for (const [end, ports, out] of [
    [a, starts, true],
    [b, ends, false],
  ] as const)
    for (const part of end.parts) {
      const o = { box: grow(part, part === end.box ? 4 : 2), own: true };
      obstacles.push(o);
      for (const port of ports) {
        const step = STEPS[out ? port.d : flip(port.d)];
        const far = { x: port.p.x + step.x * 1e4, y: port.p.y + step.y * 1e4 };
        const mine = part === end.box || part === end.frame || port.through?.includes(part);
        if (mine || !cuts(port.p, far, part)) port.skip = [...(port.skip ?? []), o.box];
      }
    }
  return obstacles;
}

/** What a segment of this edge's route costs beyond its length. */
function penaltyOf(
  rt: Router,
  me: ModelEdge,
  edge: SceneEdge,
  prefM: number,
): (p: Point, q: Point) => number {
  const horizontal = rt.r.ctx.horizontal;
  const { inside, placed } = rt;
  const { poolGaps } = rt.lines;
  return (p: Point, q: Point): number => {
    let cost = 0;
    const flat = Math.abs(p.y - q.y) < 0.01;
    // Turns across the flow near the preferred end: a split turns at once, a join at the end.
    const crossFlow = flat !== horizontal;
    if (crossFlow) cost += 0.02 * Math.abs((horizontal ? p.x : p.y) - prefM);
    // A message runs along the flow in the gap between pools, not through a band.
    if (me.flow === "message" && !crossFlow) {
      const at = horizontal ? p.y : p.x;
      const len = flat ? Math.abs(q.x - p.x) : Math.abs(q.y - p.y);
      if (inside.some(([c0, c1]) => at > c0 && at < c1)) cost += 0.25 * len;
      // Its middle, where a label fits above or below the line.
      const gap = poolGaps.find(([g0, g1]) => at > g0 && at < g1);
      if (gap) cost += 0.02 * len * Math.abs(at - (gap[0] + gap[1]) / 2);
    }
    for (const s of placed) {
      if (related(s.edge, edge)) continue;
      const sFlat = Math.abs(s.p.y - s.q.y) < 0.01;
      if (sFlat === flat) {
        const at = flat ? p.y : p.x;
        const sAt = flat ? s.p.y : s.p.x;
        const [a0, a1] = flat
          ? [Math.min(p.x, q.x), Math.max(p.x, q.x)]
          : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
        const [b0, b1] = flat
          ? [Math.min(s.p.x, s.q.x), Math.max(s.p.x, s.q.x)]
          : [Math.min(s.p.y, s.q.y), Math.max(s.p.y, s.q.y)];
        const shared = Math.min(a1, b1) - Math.max(a0, b0);
        // On one line, or so close the two read as one.
        if (shared > 0.5 && Math.abs(at - sAt) < 1) cost += 400 + 4 * shared;
        else if (shared > 0.5 && Math.abs(at - sAt) < 8) cost += 300 + 3 * shared;
        else if (shared > 0.5 && Math.abs(at - sAt) < 11) cost += 40 + 1.2 * shared;
      } else {
        const h = flat ? { p, q } : { p: s.p, q: s.q };
        const v = flat ? { p: s.p, q: s.q } : { p, q };
        const x = v.p.x;
        const y = h.p.y;
        if (
          x > Math.min(h.p.x, h.q.x) + 0.5 &&
          x < Math.max(h.p.x, h.q.x) - 0.5 &&
          y > Math.min(v.p.y, v.q.y) + 0.5 &&
          y < Math.max(v.p.y, v.q.y) - 0.5
        )
          cost += 14;
      }
    }
    return cost;
  };
}
