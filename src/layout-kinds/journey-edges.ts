// Journey edges: each link planned across the stages, down a column or bridged over the cards
// between, its ports spread along the card sides, then routed, lines sharing a gutter on own tracks.

import type { Box, ModelEdge, Point, SceneEdge } from "../types.ts";
import { type Card, type Grid, round } from "./journey-grid.ts";

type Side = "left" | "right" | "top" | "bottom";

interface Plan {
  e: ModelEdge;
  a: Card;
  b: Card;
  from: Side;
  to: Side;
  /**
   * h: across stages, straight or with one elbow in a gutter; bridge: over or under the cards
   * between, through a corridor; v: straight down or up a column; side: down a gutter beside it.
   */
  kind: "h" | "bridge" | "v" | "side";
  /** For h: which elbow, if any. */
  elbow?: "none" | "late" | "early";
  /** Gutters (by the column on their left) the line leaves and enters by; the corridor's y. */
  g1: number;
  g2: number;
  cy?: number;
  ps: Point;
  pt: Point;
}

/** A segment that may slide sideways (in a gutter or a corridor), by its first point. */
interface Movable {
  id: string;
  i: number;
  vertical: boolean;
  at: number;
}

/** The gutters and corridors lines run in, and the cards in their way. */
interface Paths {
  /** x of the gutter right of column c; -1 is left of the first stage, the last is the margin. */
  gutterX(c: number): number;
  /** Horizontal corridors: the gutters above, between and below the rows. */
  corridors: number[];
  /** Another card of the column stands between the two. */
  between(a: Card, b: Card): boolean;
  /** A horizontal line at y from x0 to x1 is clear of every card but the ones it links. */
  clearH(yy: number, x0: number, x1: number, skip: Card[]): boolean;
  stackOf(c: Card): number;
}

const center = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const across = (s: Side) => s === "left" || s === "right";

/** Every edge between two cards, routed; edges to a row or to the same step are left out. */
export function journeyEdges(grid: Grid): SceneEdge[] {
  const paths = pathsOf(grid);
  const plans = planEdges(grid, paths);
  spreadPorts(plans);
  const { routes, movable } = routePlans(paths, plans);
  separateTracks(grid, routes, movable);
  return sceneEdges(plans, routes);
}

function pathsOf(grid: Grid): Paths {
  const { G, colX, colW, gut, lastCol, gridRight, rowY, rowsBottom, cards, cells } = grid;
  return {
    gutterX: (c: number) =>
      c < 0
        ? round((colX[0] ?? 0) - G / 2)
        : c >= lastCol
          ? round(gridRight + G / 2)
          : round((colX[c] ?? 0) + (colW[c] ?? 0) + (gut[c] ?? G) / 2),
    corridors: [...rowY.map((ry) => round(ry - G / 2)), round(rowsBottom + G / 2)],
    between: (a: Card, b: Card) =>
      cards.some((c) => {
        if (c === a || c === b || c.col !== a.col) return false;
        const lo = Math.min(a.box.y, b.box.y);
        const hi = Math.max(a.box.y + a.box.h, b.box.y + b.box.h);
        return c.box.y > lo && c.box.y < hi;
      }),
    clearH: (yy: number, x0: number, x1: number, skip: Card[]) =>
      !cards.some(
        (c) =>
          !skip.includes(c) &&
          c.box.y - 4 < yy &&
          yy < c.box.y + c.box.h + 4 &&
          c.box.x < Math.max(x0, x1) &&
          Math.min(x0, x1) < c.box.x + c.box.w,
      ),
    stackOf: (c: Card) => cells.get(`${c.row}:${c.col}`)?.length ?? 1,
  };
}

/** A plan per edge between two cards, in spec order. */
function planEdges(grid: Grid, paths: Paths): Plan[] {
  const { model, byId } = grid;
  const { gutterX, corridors, between, clearH, stackOf } = paths;
  const plans: Plan[] = [];
  const sides: { e: ModelEdge; a: Card; b: Card }[] = [];
  for (const e of model.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    // Edges to a row (a group) or to the same step have no place in the grid.
    if (!a || !b || a === b) continue;
    const base = { e, a, b, ps: { x: 0, y: 0 }, pt: { x: 0, y: 0 } };
    if (a.col === b.col) {
      if (between(a, b)) sides.push({ e, a, b });
      else {
        const down = a.box.y < b.box.y;
        plans.push({
          ...base,
          from: down ? "bottom" : "top",
          to: down ? "top" : "bottom",
          kind: "v",
          g1: a.col,
          g2: a.col,
        });
      }
      continue;
    }
    const forward = a.col < b.col;
    const [from, to]: [Side, Side] = forward ? ["right", "left"] : ["left", "right"];
    const g1 = forward ? a.col : a.col - 1;
    const g2 = forward ? b.col - 1 : b.col;
    const sx = forward ? a.box.x + a.box.w : a.box.x;
    const tx = forward ? b.box.x : b.box.x + b.box.w;
    const ys = center(a.box).y;
    const yt = center(b.box).y;
    const elbow =
      Math.abs(ys - yt) < 0.5 && clearH(ys, sx, tx, [a, b])
        ? "none"
        : clearH(ys, sx, gutterX(g2), [a, b])
          ? "late"
          : clearH(yt, gutterX(g1), tx, [a, b])
            ? "early"
            : undefined;
    if (elbow) {
      plans.push({ ...base, from, to, kind: "h", elbow, g1, g2 });
      continue;
    }
    // A card in the way: bridge over (or under) it through the corridor nearest both ends. An end
    // that is the top (bottom) card of its cell, next to that corridor, leaves straight up (down).
    const mid = (ys + yt) / 2;
    const cy = [...corridors].sort((m, q) => Math.abs(m - mid) - Math.abs(q - mid))[0] ?? mid;
    const upright = (c: Card): Side | undefined =>
      cy === corridors[c.row] && c.k === 0
        ? "top"
        : cy === corridors[c.row + 1] && c.k === stackOf(c) - 1
          ? "bottom"
          : undefined;
    plans.push({
      ...base,
      from: upright(a) ?? from,
      to: upright(b) ?? to,
      kind: "bridge",
      g1,
      g2,
      cy,
    });
  }
  detours(plans, sides);
  // Spec order, so ports and tracks do not depend on which kind an edge turned out to be.
  const order = new Map(model.edges.map((e, i) => [e.id, i]));
  plans.sort((m, q) => (order.get(m.e.id) ?? 0) - (order.get(q.e.id) ?? 0));
  return plans;
}

/** A detour down its own column takes the less busy of the two gutters beside it. */
function detours(plans: Plan[], sides: { e: ModelEdge; a: Card; b: Card }[]): void {
  const load = new Map<number, number>();
  const use = (g: number) => load.set(g, (load.get(g) ?? 0) + 1);
  for (const p of plans) {
    if (p.kind === "h" && p.elbow === "late") use(p.g2);
    if (p.kind === "h" && p.elbow === "early") use(p.g1);
    if (p.kind === "bridge" && across(p.from)) use(p.g1);
    if (p.kind === "bridge" && across(p.to)) use(p.g2);
  }
  for (const { e, a, b } of sides) {
    const left = a.col > 0 && (load.get(a.col - 1) ?? 0) < (load.get(a.col) ?? 0);
    const g = left ? a.col - 1 : a.col;
    use(g);
    const side: Side = left ? "left" : "right";
    plans.push({
      e,
      a,
      b,
      from: side,
      to: side,
      kind: "side",
      g1: g,
      g2: g,
      ps: { x: 0, y: 0 },
      pt: { x: 0, y: 0 },
    });
  }
}

/**
 * Ports: one end on a side sits at its middle; several spread along it, ordered by where their
 * other ends are, so they do not cross on the way out.
 */
function spreadPorts(plans: Plan[]): void {
  const sideOf = (p: Plan, end: "from" | "to") => (end === "from" ? p.from : p.to);
  const ports = new Map<string, { p: Plan; end: "from" | "to" }[]>();
  for (const p of plans)
    for (const end of ["from", "to"] as const) {
      const c = end === "from" ? p.a : p.b;
      const key = `${c.node.id}|${sideOf(p, end)}`;
      ports.set(key, [...(ports.get(key) ?? []), { p, end }]);
    }
  for (const list of ports.values()) {
    const first = list[0];
    if (!first) continue;
    const side = sideOf(first.p, first.end);
    const own = first.end === "from" ? first.p.a : first.p.b;
    const b = own.box;
    const other = (x: { p: Plan; end: "from" | "to" }) =>
      center((x.end === "from" ? x.p.b : x.p.a).box);
    list.sort((m, q) => (across(side) ? other(m).y - other(q).y : other(m).x - other(q).x));
    const span = across(side) ? b.h : b.w;
    const step = list.length > 1 ? Math.min(12, (span - 16) / (list.length - 1)) : 0;
    list.forEach((x, i) => {
      const off = (i - (list.length - 1) / 2) * step;
      const c = center(b);
      const pt: Point =
        side === "left"
          ? { x: b.x, y: c.y + off }
          : side === "right"
            ? { x: b.x + b.w, y: c.y + off }
            : side === "top"
              ? { x: c.x + off, y: b.y }
              : { x: c.x + off, y: b.y + b.h };
      const r = { x: round(pt.x), y: round(pt.y) };
      if (x.end === "from") x.p.ps = r;
      else x.p.pt = r;
    });
  }
  // A lone end facing a spread one a few px off lines up with it, so that link stays straight.
  const alone = (c: Card, side: Side) => (ports.get(`${c.node.id}|${side}`)?.length ?? 0) <= 1;
  for (const p of plans) {
    const k = p.kind === "h" && p.elbow === "none" ? "y" : p.kind === "v" ? "x" : undefined;
    if (!k || Math.abs(p.ps[k] - p.pt[k]) < 0.01 || Math.abs(p.ps[k] - p.pt[k]) > 8) continue;
    if (alone(p.b, p.to)) p.pt = { ...p.pt, [k]: p.ps[k] };
    else if (alone(p.a, p.from)) p.ps = { ...p.ps, [k]: p.pt[k] };
  }
}

/** Each plan's points, and the segments of them that may move onto a track of their own. */
function routePlans(
  paths: Paths,
  plans: Plan[],
): { routes: Map<string, Point[]>; movable: Movable[] } {
  const { gutterX } = paths;
  const routes = new Map<string, Point[]>();
  const movable: Movable[] = [];
  for (const p of plans) {
    const { ps, pt } = p;
    const id = p.e.id;
    let pts: Point[];
    if (p.kind === "v") {
      const my = round((ps.y + pt.y) / 2);
      pts =
        Math.abs(ps.x - pt.x) < 0.01 ? [ps, pt] : [ps, { x: ps.x, y: my }, { x: pt.x, y: my }, pt];
    } else if (p.kind === "h" && p.elbow === "none" && Math.abs(ps.y - pt.y) < 0.01) {
      pts = [ps, pt];
    } else if (p.kind === "h" || p.kind === "side") {
      // A straight link that spread ports knocked off level elbows late, like any other.
      const g = gutterX(p.elbow === "early" ? p.g1 : p.g2);
      pts = [ps, { x: g, y: ps.y }, { x: g, y: pt.y }, pt];
      movable.push({ id, i: 1, vertical: true, at: g });
    } else {
      const cy = p.cy ?? 0;
      pts = [ps];
      if (across(p.from)) {
        const g = gutterX(p.g1);
        pts.push({ x: g, y: ps.y }, { x: g, y: cy });
        movable.push({ id, i: 1, vertical: true, at: g });
      } else pts.push({ x: ps.x, y: cy });
      movable.push({ id, i: pts.length - 1, vertical: false, at: cy });
      if (across(p.to)) {
        const g = gutterX(p.g2);
        movable.push({ id, i: pts.length, vertical: true, at: g });
        pts.push({ x: g, y: cy }, { x: g, y: pt.y });
      } else pts.push({ x: pt.x, y: cy });
      pts.push(pt);
    }
    routes.set(id, pts);
  }
  return { routes, movable };
}

/** Lines sharing a gutter or a corridor over the same stretch get their own tracks. */
function separateTracks(grid: Grid, routes: Map<string, Point[]>, movable: Movable[]): void {
  const { G, pad } = grid;
  const groupsOf = new Map<string, Movable[]>();
  for (const m of movable) {
    const key = `${m.vertical ? "v" : "h"}${m.at}`;
    groupsOf.set(key, [...(groupsOf.get(key) ?? []), m]);
  }
  for (const list of groupsOf.values()) {
    if (list.length < 2) continue;
    const span = (m: Movable) => {
      const pts = routes.get(m.id) ?? [];
      const p = pts[m.i];
      const q = pts[m.i + 1];
      if (!p || !q) return [0, 0] as const;
      return m.vertical
        ? ([Math.min(p.y, q.y), Math.max(p.y, q.y)] as const)
        : ([Math.min(p.x, q.x), Math.max(p.x, q.x)] as const);
    };
    const sorted = [...list].sort((m, q) => (span(m)[0] ?? 0) - (span(q)[0] ?? 0));
    const ends: number[] = [];
    const track = new Map<Movable, number>();
    for (const m of sorted) {
      const [lo, hi] = span(m);
      let t = ends.findIndex((end) => end < lo - 6);
      if (t < 0) {
        t = ends.length;
        ends.push(hi);
      } else ends[t] = hi;
      track.set(m, t);
    }
    if (ends.length < 2) continue;
    const room = (m: Movable) => (m.vertical ? G - 4 : G + 2 * pad - 12);
    for (const m of list) {
      const t = track.get(m) ?? 0;
      const gap = Math.min(6, room(m) / (ends.length - 1));
      const d = round((t - (ends.length - 1) / 2) * gap);
      const pts = routes.get(m.id);
      const p = pts?.[m.i];
      const q = pts?.[m.i + 1];
      if (!pts || !p || !q) continue;
      const k = m.vertical ? "x" : "y";
      pts[m.i] = { ...p, [k]: round(p[k] + d) };
      pts[m.i + 1] = { ...q, [k]: round(q[k] + d) };
    }
  }
}

function sceneEdges(plans: Plan[], routes: Map<string, Point[]>): SceneEdge[] {
  const edges: SceneEdge[] = [];
  for (const p of plans) {
    const points = routes.get(p.e.id);
    if (!points || points.length < 2) continue;
    edges.push({
      id: p.e.id,
      from: p.e.from,
      to: p.e.to,
      points,
      line: p.e.line,
      arrow: p.e.arrow,
      color: p.e.color,
      step: p.e.step,
      ...(p.e.flow ? { flow: p.e.flow } : {}),
    });
  }
  return edges;
}
