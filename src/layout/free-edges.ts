// Edges drawn after ELK (constraint: false, overlay and lane ends, align blocks, grid cells), and
// the align-block edges ELK took the long way round, which give way to a shorter clear route.

import type { ModelEdge, Point } from "../types.ts";
import type { Placed } from "./context.ts";
import { detour } from "./detour.ts";
import { elkRoute } from "./edges.ts";
import { alongBorder, laneRoutes, runsThrough } from "./elbows.ts";
import { collinear, headRoom } from "./geometry.ts";
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
  const { borders } = w;
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
    plan.blocks.size || plan.grids.size || opts.loose || opts.flip
      ? model.edges.flatMap((o) => {
          const pts = elkRoute(ctx, o);
          return pts ? pts.slice(1).map((q, i) => ({ p: pts[i] ?? q, q })) : [];
        })
      : [];
  for (const straight of [true, false]) {
    for (const e of model.edges) {
      const a = attachBox(ctx, e.from);
      const b = attachBox(ctx, e.to);
      if (!rel.free(e) || !a || !b) continue;
      const steered = (p: Point[]) =>
        steer(steer(p, "to", b.avoid, b.full), "from", a.avoid, a.full);
      const route = (d: number) => steered(freeRoute(a, b, d));
      let points = route(0);
      if ((points.length === 2) !== straight) continue;
      const shifts = [0, 12, -12, 24, -24, 36, -36].map(route);
      if (!straight) points = shifts.find((p) => fits(p, e)) ?? points;
      // An edge that was free before rank, align and cols keeps today's route when it clears
      // everything. Otherwise the first lane clear of the walls with a margin, off group borders
      // and off ELK's lines wins, then a detour around them, then any lane that clears the walls.
      const walls = w.walls(e);
      const known = !rel.inBlock(e) && !rel.gridBetween(e) && !opts.loose?.has(e.id);
      if (!known || runsThrough(points, walls)) {
        const roomy = w.roomyWalls(e);
        const heads = {
          start: e.arrow === "start" || e.arrow === "both",
          end: e.arrow !== "none" && e.arrow !== "start",
        };
        const lanes = [
          ...(straight ? [points] : shifts.filter((p) => fits(p, e))),
          ...laneRoutes(a, b, heads, borders, horizontal).map(steered),
        ].filter(
          (p) =>
            unclaimed(p, e, !known) &&
            !elkLines.some((c) => collinear(p, c.p, c.q)) &&
            (known || headRoom(p, heads)),
        );
        // The detour treats the lines already drawn like borders: it may cross them, not run on them.
        const drawn = [...claimed.filter((c) => c.e !== e), ...elkLines].map((c) => ({
          x: Math.min(c.p.x, c.q.x),
          y: Math.min(c.p.y, c.q.y),
          w: Math.abs(c.q.x - c.p.x),
          h: Math.abs(c.q.y - c.p.y),
        }));
        const taken = [...claimed.filter((c) => c.e !== e), ...elkLines].flatMap((c) => [c.p, c.q]);
        const around = () => {
          const path = detour(a, b, roomy, [...borders, ...drawn], taken);
          return path && !runsThrough(steered(path), walls) ? steered(path) : undefined;
        };
        points =
          lanes.find((p) => !runsThrough(p, roomy) && !alongBorder(p, borders)) ??
          around() ??
          lanes.find((p) => !runsThrough(p, walls)) ??
          points;
      }
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
    };
    const better =
      [freeRoute(a, b, 0), ...laneRoutes(a, b, heads, borders, horizontal)].find(clear) ??
      [detour(a, b, roomy, borders)].find((p): p is Point[] => !!p && clear(p));
    if (!better) continue;
    freeRoutes.set(e.id, better);
    rerouted.add(e.id);
  }
  return rerouted;
}
