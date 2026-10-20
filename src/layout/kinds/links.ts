// Edges outside a tree's or mind map's hierarchy: orthogonal links across it, then loops.

import type { Box, Point } from "../../types.ts";
import type { AfterLayout } from "../hooks.ts";
import { crosses, footOf, labelSize, r, segments, setLabel, tidyPoints } from "./shared.ts";
import { selfLoops } from "./state.ts";
import type { Hierarchy } from "./tidy.ts";

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

/** Routes the edges outside the hierarchy: links across it, then loops. */
export function routeRest(ctx: AfterLayout, h: Hierarchy, spline: boolean): void {
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
