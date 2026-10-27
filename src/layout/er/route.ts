// Relationship lines from row to row. Each end leaves its table from the left or right side at the
// center line of the row it joins (a table's header when it joins none, the face's center on any
// other node), and runs straight out far enough for its crow's foot. Between the two ends the
// candidates are a straight line, a Z through the channel between facing sides, a detour over or
// under a table in the way, and a C round both tables on one side; each is measured as bends.ts
// measures a route (through a table, near one, through a header, over a frame, crossings) plus
// lines on top of or beside others and the way it strays past the drawing, and the cheapest wins.
// Labels go on last, beside a run of the final route, clear of the marks.

import type { Box, ErField, ModelEdge, Point, SceneEdge, SceneNode } from "../../types.ts";
import { probe, type RouteView } from "../bends.ts";
import { faceBox } from "../faces.ts";
import { round, type Seg, segmentsOf, union } from "../geometry.ts";
import type { AfterLayout } from "../hooks.ts";
import { labelSize, setLabel } from "../kinds/shared.ts";
import { labelSpot } from "../labels.ts";
import type { Joined } from "./rows.ts";
import { headerOf, rowsOf } from "./table.ts";

/**
 * The straight run out of a table before the first bend: the marks reach 23px out (render/er.ts)
 * and an orthogonal corner starts rounding 8px before its bend.
 */
export const STUB = 30;
/** Risers and C routes keep this far apart, as ELK keeps edges in one channel. */
const PITCH = 10;
/** Rounds of routing: an edge rerouted can free the way for one routed before it. */
const ROUNDS = 3;

/** Where a line meets a node: its left and right face lines and the height it meets them at. */
interface End {
  left: number;
  right: number;
  y: number;
}

function endOf(nd: SceneNode, field: ErField | undefined): End {
  if (nd.fields?.length) {
    const row = field ? rowsOf(nd).find((f) => f.name === field.name) : undefined;
    const band = row?.box ?? headerOf(nd);
    return { left: nd.box.x, right: nd.box.x + nd.box.w, y: band.y + band.h / 2 };
  }
  const b = faceBox(nd);
  return { left: b.x, right: b.x + b.w, y: b.y + b.h / 2 };
}

const pt = (x: number, y: number): Point => ({ x: round(x), y: round(y) });

/** Riser positions between lo and hi: the middle first, then a pitch at a time either side. */
function risers(lo: number, hi: number): number[] {
  if (hi < lo) return [];
  const mid = (lo + hi) / 2;
  const out = [mid];
  for (let d = PITCH; d <= (hi - lo) / 2 + 0.01; d += PITCH) out.push(mid - d, mid + d);
  return out;
}

/** Every route worth measuring from a to b. */
function candidates(a: End, b: End, boxes: Box[]): Point[][] {
  const out: Point[][] = [];
  const level = Math.abs(a.y - b.y) < 0.5;
  // Facing sides: a straight line when the rows line up, else a Z through the channel.
  for (const [ax, bx] of [
    [a.right, b.left],
    [a.left, b.right],
  ] as const) {
    const sign = Math.sign(bx - ax);
    if (Math.abs(bx - ax) < 2 * STUB || sign !== (ax === a.right ? 1 : -1)) continue;
    if (level) out.push([pt(ax, a.y), pt(bx, b.y)]);
    else
      for (const m of risers(Math.min(ax, bx) + STUB, Math.max(ax, bx) - STUB))
        out.push([pt(ax, a.y), pt(m, a.y), pt(m, b.y), pt(bx, b.y)]);
    // Round a table in the way: out to the channel past each end, over or under it, and back.
    const lo = Math.min(ax, bx);
    const hi = Math.max(ax, bx);
    const lines = boxes
      .filter((o) => o.x < hi && o.x + o.w > lo)
      .flatMap((o) => [0, 1].flatMap((k) => [o.y - 20 - k * PITCH, o.y + o.h + 20 + k * PITCH]));
    for (const y of lines)
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          const m1 = ax + sign * (STUB + i * PITCH);
          const m2 = bx - sign * (STUB + j * PITCH);
          if ((m2 - m1) * sign <= 0) continue;
          out.push([pt(ax, a.y), pt(m1, a.y), pt(m1, y), pt(m2, y), pt(m2, b.y), pt(bx, b.y)]);
        }
  }
  // One side of both: a C out past the outer of the two faces and back.
  if (Math.abs(a.y - b.y) >= 2 * PITCH)
    for (let k = 0; k < 6; k++) {
      const right = Math.max(a.right, b.right) + STUB + k * PITCH;
      const left = Math.min(a.left, b.left) - STUB - k * PITCH;
      out.push([pt(a.right, a.y), pt(right, a.y), pt(right, b.y), pt(b.right, b.y)]);
      out.push([pt(a.left, a.y), pt(left, a.y), pt(left, b.y), pt(b.left, b.y)]);
    }
  return out;
}

const bendsOf = (pts: Point[]) => Math.max(0, pts.length - 2);
const lengthOf = (pts: Point[]) =>
  segmentsOf(pts).reduce((s, [p, q]) => s + Math.abs(q.x - p.x) + Math.abs(q.y - p.y), 0);

/**
 * What a route costs against the other lines: run on top of one (within 6px) or beside an
 * unrelated one (within 12px), per px of shared span. Lines that share a table fan out of it by
 * design and cost little; two that leave one row at one point share that stub for free.
 */
function overlapCost(pts: Point[], e: SceneEdge, others: SceneEdge[]): number {
  let cost = 0;
  const ends = [pts[0], pts.at(-1)];
  for (const o of others) {
    const related = [o.from, o.to].some((id) => id === e.from || id === e.to);
    const theirs = [o.points[0], o.points.at(-1)];
    const shared = ends.some((p) =>
      theirs.some((q) => p && q && Math.hypot(p.x - q.x, p.y - q.y) < 0.5),
    );
    for (const [p, q] of segmentsOf(pts))
      for (const [u, v] of segmentsOf(o.points)) {
        const flat = Math.abs(p.y - q.y) < 0.5;
        const upright = Math.abs(p.x - q.x) < 0.5;
        const oflat = Math.abs(u.y - v.y) < 0.5;
        const oupright = Math.abs(u.x - v.x) < 0.5;
        let gap: number;
        let span: number;
        if (flat && oflat) {
          gap = Math.abs(p.y - u.y);
          span =
            Math.min(Math.max(p.x, q.x), Math.max(u.x, v.x)) -
            Math.max(Math.min(p.x, q.x), Math.min(u.x, v.x));
        } else if (upright && oupright) {
          gap = Math.abs(p.x - u.x);
          span =
            Math.min(Math.max(p.y, q.y), Math.max(u.y, v.y)) -
            Math.max(Math.min(p.y, q.y), Math.min(u.y, v.y));
        } else continue;
        if (span <= 0.5) continue;
        // Out of one point together, the first stub's length is the shared row's, not a defect.
        if (shared && gap < 6 && touches(p, q, theirs))
          cost += Math.max(0, span - STUB - PITCH) * 0.5;
        else if (gap < 6) cost += span * (related ? 2 : 12);
        else if (gap < 12 && !related) cost += span * 2;
      }
  }
  return cost;
}

/** Whether segment pq starts or ends at one of `points` (a line end both routes share). */
function touches(p: Point, q: Point, points: (Point | undefined)[]): boolean {
  const at = (a: Point, b: Point | undefined) => !!b && Math.hypot(a.x - b.x, a.y - b.y) < 0.5;
  return points.some((s) => at(p, s) || at(q, s));
}

/** Px a route runs outside the box around every node and 24px of margin. */
function outside(pts: Point[], area: Box): number {
  let out = 0;
  for (const p of pts) {
    out += Math.max(0, area.x - p.x, p.x - (area.x + area.w));
    out += Math.max(0, area.y - p.y, p.y - (area.y + area.h));
  }
  return out;
}

/** The cheapest route of e between its ends, measured against the scene as drawn now. */
function bestRoute(view: RouteView, e: SceneEdge, a: End, b: End): Point[] | undefined {
  const count = probe(view, e);
  const others = view.edges.filter((o) => o !== e);
  let best: { pts: Point[]; cost: number } | undefined;
  const boxes = view.nodes.filter((n) => n.id !== e.from && n.id !== e.to).map((n) => n.box);
  const all = union(view.nodes.map((n) => n.box));
  const area = { x: all.x - 24, y: all.y - 24, w: all.w + 48, h: all.h + 48 };
  for (const pts of candidates(a, b, boxes)) {
    const d = count?.(pts);
    const cost =
      (d
        ? 1000 * d.hard +
          400 * d.own +
          200 * d.headers +
          60 * d.walls +
          40 * d.frames +
          40 * d.borders +
          25 * d.crossings
        : 0) +
      overlapCost(pts, e, others) +
      2 * outside(pts, area) +
      8 * bendsOf(pts) +
      0.02 * lengthOf(pts);
    if (!best || cost < best.cost - 0.001) best = { pts, cost };
  }
  return best?.pts;
}

const same = (p: Point[], q: Point[]) =>
  p.length === q.length && p.every((v, i) => v.x === q[i]?.x && v.y === q[i]?.y);

/** The strip in front of each end of a line, where its crow's foot is drawn. */
function markBoxes(e: SceneEdge): Box[] {
  const out: Box[] = [];
  for (const [p, q] of [
    [e.points[0], e.points[1]],
    [e.points.at(-1), e.points.at(-2)],
  ]) {
    if (!p || !q) continue;
    const dir = Math.sign(q.x - p.x) || 1;
    out.push({ x: dir > 0 ? p.x : p.x - STUB, y: p.y - 8, w: STUB, h: 16 });
  }
  return out;
}

/** Labels beside a run of each final route, clear of tables, other labels, frames and marks. */
function placeLabels(ctx: AfterLayout, mine: SceneEdge[]): void {
  const byId = new Map(ctx.model.edges.map((e) => [e.id, e]));
  const feet = ctx.nodes.map((n) => union([n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox]));
  const frames = ctx.groups
    .filter((g) => !g.overlay && !g.lane)
    .flatMap((g) => [
      { x: g.box.x - 1, y: g.box.y, w: 2, h: g.box.h },
      { x: g.box.x + g.box.w - 1, y: g.box.y, w: 2, h: g.box.h },
      { x: g.box.x, y: g.box.y - 1, w: g.box.w, h: 2 },
      { x: g.box.x, y: g.box.y + g.box.h - 1, w: g.box.w, h: 2 },
    ]);
  const heads = ctx.groups.flatMap((g) => [
    g.label.lines.length ? g.labelBox : undefined,
    g.iconBox,
  ]);
  const marks = mine.flatMap(markBoxes);
  for (const e of mine) {
    const m: ModelEdge | undefined = byId.get(e.id);
    const size = labelSize(m);
    if (!size) continue;
    const tags = ctx.edges.flatMap((o) => (o === e ? [] : [o.labelBox, o.stepBox]));
    const avoid = [...feet, ...frames, ...heads, ...tags, ...marks].filter(
      (b): b is Box => !!b && b.w > 0 && b.h > 0,
    );
    const lines = ctx.edges.filter((o) => o !== e).map((o) => o.points);
    const spot =
      labelSpot(e.points, size.w, size.h, avoid, lines) ??
      labelSpot(
        e.points,
        size.w,
        size.h,
        [...feet, ...tags].filter((b): b is Box => !!b),
        [],
      ) ??
      fallbackSpot(e.points, size.w, size.h);
    setLabel(e, m, size, spot);
  }
}

/** Above the middle of the longest run, when nothing is clear. */
function fallbackSpot(points: Point[], w: number, h: number): Box {
  const len = ([p, q]: Seg) => Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
  const longest = segmentsOf(points).sort((s, t) => len(t) - len(s))[0];
  const start = points[0] ?? { x: 0, y: 0 };
  const [p, q] = longest ?? [start, start];
  return { x: round((p.x + q.x) / 2 - w / 2), y: round((p.y + q.y) / 2 - h - 3), w, h };
}

/**
 * Routes every edge between two nodes of which at least one is a table (a table's line to itself
 * too), from the rows `rowsFor` names, and places its label on the final route.
 */
export function routeRelationships(ctx: AfterLayout, rowsFor: (e: SceneEdge) => Joined): void {
  const nodes = new Map(ctx.nodes.map((n) => [n.id, n]));
  const table = (id: string) => !!nodes.get(id)?.fields?.length;
  const mine = ctx.edges.filter(
    (e) => nodes.has(e.from) && nodes.has(e.to) && (table(e.from) || table(e.to)),
  );
  if (!mine.length) return;
  const ends = new Map<SceneEdge, [End, End]>();
  for (const e of mine) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    if (!a || !b) continue;
    const rows = rowsFor(e);
    const from = endOf(a, rows.from);
    const to = endOf(b, rows.to);
    // A table's line to itself leaves one row and comes back into another as a C. From a row (or
    // its header) back into the same one, the ends part a pitch either side of its center line,
    // in whole px so they stay the two pitches apart a C needs.
    if (a === b && Math.abs(from.y - to.y) < 0.5) {
      from.y = Math.floor(from.y - PITCH);
      to.y = Math.ceil(to.y + PITCH);
    }
    ends.set(e, [from, to]);
    // ELK put the label on its own line; it goes beside the new one once every line is drawn.
    delete e.labelBox;
    delete e.stepBox;
  }
  const view: RouteView = { nodes: ctx.nodes, groups: ctx.groups, edges: ctx.edges };
  for (let k = 0; k < ROUNDS; k++) {
    let moved = false;
    for (const e of mine) {
      const pair = ends.get(e);
      const pts = pair && bestRoute(view, e, pair[0], pair[1]);
      if (!pts || same(pts, e.points)) continue;
      e.points = pts;
      moved = true;
    }
    if (!moved) break;
  }
  placeLabels(ctx, mine);
}
