// Edges drawn after ELK (constraint: false, overlay and lane ends, align blocks, grid cells, nodes
// on a border), and the align-block edges ELK took the long way round, which give way to a shorter
// clear route.

import { textBlock } from "../text.ts";
import type { Box, ModelEdge, Point } from "../types.ts";
import type { Placed } from "./context.ts";
import { detour } from "./detour.ts";
import { elkRoute } from "./edges.ts";
import {
  alongBorder,
  clearOfFrames,
  headRoomFor,
  laneRoutes,
  loops,
  type RouteEnd,
  runsThrough,
} from "./elbows.ts";
import { collinear, headRoom, round } from "./geometry.ts";
import { seatEnd } from "./seats.ts";
import { SIZES } from "./sizes.ts";
import { attachBox, freeRoute, steer } from "./steer.ts";
import type { Walls } from "./walls.ts";

interface Claim {
  e: ModelEdge;
  p: Point;
  q: Point;
}

// Free edges (constraint: false) are routed here. Straight routes cannot move, so they claim
// their line first; each elbow then steps aside from the lines of unrelated free edges.
export function routeFree(ctx: Placed, w: Walls): Map<string, Point[]> {
  const { model, opts, plan, horizontal, rel } = ctx;
  const { borders, titles } = w;
  const room = roomOf(ctx);
  /** Off every group border line and clear beside every title, which clearing the walls is not. */
  const framed = (p: Point[]) => clearOfFrames(p, borders, titles);
  /**
   * Groups that hold neither end, which a lane taken to get off a border must not cut through. A
   * node on a border belongs to its group too.
   */
  const strangers = (e: ModelEdge) =>
    ctx.groups
      .filter(
        (g) =>
          !g.overlay &&
          ![e.from, e.to].some(
            (id) =>
              id === g.id || rel.above(id).includes(g.id) || ctx.seats.get(id)?.group === g.id,
          ),
      )
      .map((g) => g.box);
  const freeRoutes = new Map<string, Point[]>();
  const claimed: Claim[] = [];
  const related = (a: ModelEdge, b: ModelEdge) =>
    [a.from, a.to].some((id) => id === b.from || id === b.to);
  const fits = (points: Point[], e: ModelEdge): boolean => {
    const [s, p, q, t] = points;
    if (!s || !p || !q || !t) return true;
    const v = Math.abs(p.x - q.x) < 0.5;
    const at = v ? p.x : p.y;
    const [lo, hi] = v ? [s.x, t.x].sort((m, n) => m - n) : [s.y, t.y].sort((m, n) => m - n);
    if (at < (lo ?? at) + 8 || at > (hi ?? at) - 8) return false;
    const span = (a: Point, b: Point) => (v ? [a.y, b.y] : [a.x, b.x]).sort((m, n) => m - n);
    const [a0 = 0, a1 = 0] = span(p, q);
    return !claimed.some((c) => {
      if (related(c.e, e) || Math.abs(c.p.x - c.q.x) < 0.5 !== v) return false;
      if (Math.abs((v ? c.p.x : c.p.y) - at) >= 6) return false;
      const [b0 = 0, b1 = 0] = span(c.p, c.q);
      return Math.min(a1, b1) - Math.max(a0, b0) > 0.5;
    });
  };
  /**
   * Every segment of a candidate stays off the lines other free edges claimed. Edges that share a
   * node may share a trunk; a new route (block, grid) shares no run with any line.
   */
  const unclaimed = (points: Point[], e: ModelEdge, strict = false): boolean =>
    points.slice(1).every((q, i) => {
      const p = points[i] ?? q;
      const v = Math.abs(p.x - q.x) < 0.5;
      const at = v ? p.x : p.y;
      const [a0 = 0, a1 = 0] = (v ? [p.y, q.y] : [p.x, q.x]).sort((m, n) => m - n);
      return !claimed.some((c) => {
        if ((related(c.e, e) && !strict) || c.e === e || Math.abs(c.p.x - c.q.x) < 0.5 !== v)
          return false;
        if (Math.abs((v ? c.p.x : c.p.y) - at) >= 6) return false;
        const [b0 = 0, b1 = 0] = (v ? [c.p.y, c.q.y] : [c.p.x, c.q.x]).sort((m, n) => m - n);
        return Math.min(a1, b1) - Math.max(a0, b0) > 0.5;
      });
    });
  /** The lines ELK drew, which a new free route must not run on top of. */
  const elkLines =
    plan.blocks.size || plan.grids.size || plan.seats.size || opts.loose || opts.flip
      ? model.edges.flatMap((o) => {
          const pts = elkRoute(ctx, o);
          return pts ? pts.slice(1).map((q, i) => ({ p: pts[i] ?? q, q })) : [];
        })
      : [];
  /** The lines of the other edges joining the same two ends: ELK's, and free ones drawn so far. */
  const pairLines = (e: ModelEdge) =>
    model.edges.flatMap((o) => {
      const same = (o.from === e.from && o.to === e.to) || (o.from === e.to && o.to === e.from);
      const pts = o === e || !same ? undefined : (freeRoutes.get(o.id) ?? elkRoute(ctx, o));
      return pts ? pts.slice(1).map((q, i) => ({ p: pts[i] ?? q, q })) : [];
    });
  for (const straight of [true, false]) {
    for (const e of model.edges) {
      // A node on a border is reached through a stub out of its icon's face: the route runs to
      // the stub's tip and must not turn back over the stub.
      const sa = seatEnd(ctx, e, "from");
      const sb = seatEnd(ctx, e, "to");
      const a = sa?.attach ?? attachBox(ctx, e.from);
      const b = sb?.attach ?? attachBox(ctx, e.to);
      if (!rel.free(e) || !a || !b) continue;
      const known =
        !rel.inBlock(e) && !rel.gridBetween(e) && !rel.seated(e) && !opts.loose?.has(e.id);
      // A self loop (constraint: false, or on an overlay) goes round a corner of its node or
      // group: the first corner clear of the walls and the frames, an overlay's own header
      // included.
      if (e.from === e.to && known) {
        if (straight) continue;
        const walls = [...w.walls(e), ...(a.avoid ? [a.avoid] : [])];
        const all = loops(a);
        const loop = all.find((p) => !runsThrough(p, walls) && framed(p)) ?? all[0] ?? [];
        freeRoutes.set(e.id, loop);
        claimed.push(...loop.slice(1).map((q, i) => ({ e, p: loop[i] ?? q, q })));
        continue;
      }
      const stubbed = (p: Point[]) => [...(sa ? [sa.face] : []), ...p, ...(sb ? [sb.face] : [])];
      const onward = (p: Point[]) =>
        (!sa || ahead(sa, p[1])) && (!sb || ahead(sb, p[p.length - 2]));
      const steered = (p: Point[]) =>
        steer(steer(p, "to", b.avoid, b.full), "from", a.avoid, a.full);
      const label = labelSize(e);
      const route = (d: number) => steered(freeRoute(a, b, d, label));
      let points = route(0);
      if ((points.length === 2) !== straight) continue;
      const walls = w.walls(e);
      // Two edges between the same ends never share a line, or they read as one: a straight
      // route on top of the other slides 12px, then 24px, across with both ends on their faces.
      const pair = pairLines(e);
      const doubled = (p: Point[]) => pair.some((c) => collinear(p, c.p, c.q));
      if (straight && doubled(points))
        points =
          [12, -12, 24, -24]
            .flatMap((d) => slide(points, d, a, b))
            .map(steered)
            .find((p) => !doubled(p) && unclaimed(p, e) && !runsThrough(p, walls) && framed(p)) ??
          points;
      const shifts = [0, 12, -12, 24, -24, 36, -36].map(route);
      if (!straight)
        points =
          shifts.find((p) => fits(p, e) && !doubled(p)) ?? shifts.find((p) => fits(p, e)) ?? points;
      // An edge that was free before rank, align and cols keeps today's route when it clears
      // everything, group border lines and titles included. Otherwise the first lane clear of the
      // walls with a margin, off group borders and off ELK's lines wins, then a detour around
      // them, then a lane clear of the walls and the frames, then any lane clear of the walls.
      if (!known || doubled(points) || runsThrough(points, walls) || !framed(points)) {
        // Today's route that only lies on a border or beside a title gives way to a lane that cuts
        // through no more groups holding neither end (DG223), or stays.
        const kept = known && !runsThrough(points, walls) ? points : undefined;
        const cuts = (p: Point[]) => runsThrough(p, strangers(e), 4);
        const fair = (p: Point[]) => !kept || !cuts(p) || cuts(kept);
        const roomy = w.roomyWalls(e);
        // A seated end's head sits at the end of its stub, which is straight already.
        const heads = {
          start: !sa && (e.arrow === "start" || e.arrow === "both"),
          end: !sb && e.arrow !== "none" && e.arrow !== "start",
          room,
        };
        const open = [
          ...(straight ? [points] : shifts.filter((p) => fits(p, e))),
          ...laneRoutes(a, b, heads, borders, horizontal, label).map(steered),
        ].filter(
          (p) =>
            unclaimed(p, e, !known) &&
            !doubled(p) &&
            !elkLines.some((c) => collinear(p, c.p, c.q)) &&
            (known || headRoom(p, heads)) &&
            onward(p) &&
            fair(p),
        );
        // A node on a border has new routes to choose from: the ones crossing fewest drawn lines,
        // or running close beside them, go first, in their own order otherwise.
        const others = rel.seated(e) ? [...claimed.filter((c) => c.e !== e), ...elkLines] : [];
        const lanes = others.length
          ? open
              .map((p, i) => ({ p, i, n: crossCount(p, others) }))
              .sort((x, y) => x.n - y.n || x.i - y.i)
              .map((x) => x.p)
          : open;
        // The detour treats the lines already drawn like borders: it may cross them, not run on them.
        const drawn = [...claimed.filter((c) => c.e !== e), ...elkLines].map((c) => ({
          x: Math.min(c.p.x, c.q.x),
          y: Math.min(c.p.y, c.q.y),
          w: Math.abs(c.q.x - c.p.x),
          h: Math.abs(c.q.y - c.p.y),
        }));
        const taken = [...claimed.filter((c) => c.e !== e), ...elkLines].flatMap((c) => [c.p, c.q]);
        const around = () => {
          const path = detour(a, b, roomy, [...borders, ...drawn], taken, room);
          const out = path && steered(path);
          return out && !runsThrough(out, walls) && framed(out) && fair(out) && onward(out)
            ? out
            : undefined;
        };
        points =
          lanes.find((p) => !runsThrough(p, roomy) && !alongBorder(p, borders)) ??
          around() ??
          lanes.find((p) => !runsThrough(p, walls) && framed(p) && !cuts(p)) ??
          kept ??
          lanes.find((p) => !runsThrough(p, walls)) ??
          points;
      }
      points = stubbed(points);
      freeRoutes.set(e.id, points);
      claimed.push(...points.slice(1).map((q, i) => ({ e, p: points[i] ?? q, q })));
    }
  }
  return freeRoutes;
}

// ELK takes a back edge into or out of an align block around the whole block, often right on a
// group border. A shorter route clear of the walls with a margin, off the borders and off every
// other line replaces it, its label placed like a free edge's; the second pass then lays out
// without it, so the loop's room goes too.
export function rerouteBlocks(
  ctx: Placed,
  w: Walls,
  freeRoutes: Map<string, Point[]>,
): Set<string> {
  const { model, plan, horizontal } = ctx;
  const { borders } = w;
  const rerouted = new Set<string>();
  if (!plan.blocks.size) return rerouted;
  const room = roomOf(ctx);
  const length = (pts: Point[]) =>
    pts
      .slice(1)
      .reduce(
        (t, q, i) => t + Math.abs(q.x - (pts[i]?.x ?? q.x)) + Math.abs(q.y - (pts[i]?.y ?? q.y)),
        0,
      );
  for (const e of model.edges) {
    const elk = plan.blockOf.has(e.from) || plan.blockOf.has(e.to) ? elkRoute(ctx, e) : undefined;
    const a = attachBox(ctx, e.from);
    const b = attachBox(ctx, e.to);
    if (!elk || !a || !b || elk.length < 3) continue;
    // A loop (four bends that go past either end along the flow) or a run along a border gives
    // way to any shorter clear route, a plain elbow or a jog between layers only to one under
    // 0.7 of its length.
    const flowAt = (p: Point | undefined) => (horizontal ? (p?.x ?? 0) : (p?.y ?? 0));
    const [lo, hi] = [flowAt(elk[0]), flowAt(elk.at(-1))].sort((m, n) => m - n);
    const past = elk.some((p) => flowAt(p) < (lo ?? 0) - 2 || flowAt(p) > (hi ?? 0) + 2);
    const loop = (elk.length >= 6 && past) || alongBorder(elk, borders);
    const most = length(elk) * (loop ? 1 : 0.7);
    const roomy = w.roomyWalls(e);
    const others = model.edges.flatMap((o) => {
      const pts = o === e ? undefined : (freeRoutes.get(o.id) ?? elkRoute(ctx, o));
      return pts ? pts.slice(1).map((q, i) => ({ p: pts[i] ?? q, q })) : [];
    });
    const clear = (pts: Point[]) =>
      !runsThrough(pts, roomy) &&
      !alongBorder(pts, borders) &&
      length(pts) < most &&
      others.every((c) => !collinear(pts, c.p, c.q));
    const heads = {
      start: e.arrow === "start" || e.arrow === "both",
      end: e.arrow !== "none" && e.arrow !== "start",
      room,
    };
    // No route is shorter than the gap between the two ends, so the detour search runs only when
    // one could come in under the cap.
    const better =
      [freeRoute(a, b, 0), ...laneRoutes(a, b, heads, borders, horizontal)].find(clear) ??
      (gap(a.full, b.full) < most + 1
        ? [detour(a, b, roomy, borders, [], room)].find((p): p is Point[] => !!p && clear(p))
        : undefined);
    if (!better) continue;
    freeRoutes.set(e.id, better);
    rerouted.add(e.id);
  }
  return rerouted;
}

/**
 * The straight run kept in front of an arrowhead drawn after ELK, for the canvas as wide as ELK
 * and the placed boxes make it (the stage skin's head grows with the width).
 */
function roomOf(ctx: Placed): number {
  const right = [...ctx.nodes.map((n) => n.box), ...ctx.groups.map((g) => g.box)].map(
    (b) => b.x + b.w + SIZES.pad,
  );
  return headRoomFor(ctx.model.skin, Math.max(ctx.result.width ?? 0, ...right));
}

/** The box a free edge's label and step take beside its route, as labels.ts sizes it. */
function labelSize(e: ModelEdge): { w: number; h: number } {
  const block = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
  const stepW = e.step !== undefined ? SIZES.step + 2 : 0;
  return {
    w: Math.ceil((e.label ? block.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0)),
    h: Math.ceil(Math.max(e.label ? block.height + 6 : 0, stepW ? SIZES.step : 0)),
  };
}

/**
 * A straight route moved `d` px across itself, or none when an end would leave its face: the
 * side of the icon (or box) it meets, 2px in from the corners.
 */
function slide(points: Point[], d: number, a: RouteEnd, b: RouteEnd): Point[][] {
  const [s, t] = points;
  if (!s || !t || points.length !== 2) return [];
  const k = Math.abs(s.y - t.y) < 0.5 ? "y" : "x";
  const v = round(s[k] + d);
  const on = (r: Box) => (k === "y" ? [r.y, r.y + r.h] : [r.x, r.x + r.w]);
  const fits = (r: Box) => {
    const [lo = 0, hi = 0] = on(r);
    return v >= lo + 2 && v <= hi - 2;
  };
  return fits(a.side) && fits(b.side)
    ? [
        [
          { ...s, [k]: v },
          { ...t, [k]: v },
        ],
      ]
    : [];
}

/** How far apart two boxes are along x plus along y: no orthogonal route between them is shorter. */
const gap = (a: Box, b: Box) =>
  Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w)) +
  Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));

/** Whether a route's first step from a stub's tip goes on, or at least turns, rather than back. */
function ahead(s: { face: Point; tip: Point }, next: Point | undefined): boolean {
  if (!next) return true;
  const dx = s.tip.x - s.face.x;
  const dy = s.tip.y - s.face.y;
  return (next.x - s.tip.x) * dx + (next.y - s.tip.y) * dy >= 0;
}

/**
 * How many of the lines a route crosses, each crossing strictly inside both segments, and how
 * many it runs beside, parallel and closer than 14px over more than 24px (two lines that read as
 * one double line, and leave no lane to move either off a border).
 */
function crossCount(points: Point[], lines: { p: Point; q: Point }[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const flat = Math.abs(a.y - b.y) < 0.5;
    if (!flat && Math.abs(a.x - b.x) >= 0.5) continue;
    for (const { p, q } of lines) {
      const level = Math.abs(p.y - q.y) < 0.5;
      if (!level && Math.abs(p.x - q.x) >= 0.5) continue;
      if (level === flat) {
        const [s0, s1, t0, t1] = flat ? [a.x, b.x, p.x, q.x] : [a.y, b.y, p.y, q.y];
        const along =
          Math.min(Math.max(s0, s1), Math.max(t0, t1)) -
          Math.max(Math.min(s0, s1), Math.min(t0, t1));
        if (along > 24 && Math.abs(flat ? a.y - p.y : a.x - p.x) < 14) n++;
        continue;
      }
      const [h0, h1, v0, v1] = flat ? [a, b, p, q] : [p, q, a, b];
      const x = v0.x;
      const y = h0.y;
      if (
        x > Math.min(h0.x, h1.x) + 0.5 &&
        x < Math.max(h0.x, h1.x) - 0.5 &&
        y > Math.min(v0.y, v1.y) + 0.5 &&
        y < Math.max(v0.y, v1.y) - 0.5
      )
        n++;
    }
  }
  return n;
}
