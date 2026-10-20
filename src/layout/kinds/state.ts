// State machines: every self-transition redrawn as a loop on a corner of its state, label beside it.

import type { Box, Point } from "../../types.ts";
import type { AfterLayout } from "../hooks.ts";
import {
  crosses,
  dot,
  drawnPoints,
  footOf,
  hits,
  labelSize,
  r,
  segments,
  setLabel,
  union,
} from "./shared.ts";

interface Corner {
  right: boolean;
  top: boolean;
}

/**
 * A self-transition as a loop on one corner of its state: out of the top (or bottom) side, round
 * the corner and back into the right (or left) side. `k` nests further loops on the same corner.
 */
function loopPoints(b: Box, c: Corner, k: number, spline: boolean): Point[] {
  const size = 18 + 10 * k;
  const inset = Math.max(4, Math.min(14 + 6 * k, b.w / 2 - 2, b.h / 2 - 2));
  const sx = c.right ? 1 : -1;
  const sy = c.top ? -1 : 1;
  const cx = c.right ? b.x + b.w : b.x;
  const cy = c.top ? b.y : b.y + b.h;
  const a = { x: cx - sx * inset, y: cy };
  const z = { x: cx, y: cy - sy * inset };
  const pts = spline
    ? [a, { x: a.x, y: cy + sy * 2 * size }, { x: cx + sx * 2 * size, y: z.y }, z]
    : [
        a,
        { x: a.x, y: cy + sy * size },
        { x: cx + sx * size, y: cy + sy * size },
        { x: cx + sx * size, y: z.y },
        z,
      ];
  return pts.map((p) => ({ x: r(p.x), y: r(p.y) }));
}

/**
 * Where a loop's label may go, best first: beside the loop on its outer side, then past it (above
 * a top loop), centered on it, flush with its outer side, flush with its inner side.
 */
function loopLabelSpots(loop: Box, c: Corner, w: number, h: number): Box[] {
  const beside = c.right ? loop.x + loop.w + 6 : loop.x - 6 - w;
  const past = c.top ? loop.y - 4 - h : loop.y + loop.h + 4;
  const outer = c.right ? loop.x + loop.w - w : loop.x;
  const inner = c.right ? loop.x : loop.x + loop.w - w;
  return [
    { x: beside, y: loop.y + loop.h / 2 - h / 2 },
    { x: loop.x + loop.w / 2 - w / 2, y: past },
    { x: outer, y: past },
    { x: inner, y: past },
  ].map((p) => ({ x: r(p.x), y: r(p.y), w, h }));
}

/**
 * Redraws every self-transition as a corner loop. The first corner whose loop and label clear
 * every node, label and line wins; ELK's own route says which side it kept room on, so those
 * corners go first (`fresh`: the hook moved the nodes, so that route means nothing).
 */
export function selfLoops(ctx: AfterLayout, fresh: boolean): void {
  const spline = ctx.routing === "spline";
  const count = new Map<string, number>();
  for (const e of ctx.edges) {
    if (e.from !== e.to) continue;
    const n = ctx.nodes.find((x) => x.id === e.from);
    const box = n?.box ?? ctx.groups.find((g) => g.id === e.from)?.box;
    if (!box) continue;
    const k = count.get(e.from) ?? 0;
    count.set(e.from, k + 1);
    const model = ctx.model.edges.find((x) => x.id === e.id);
    const size = labelSize(model);
    const below =
      !fresh &&
      e.points.some((p) => p.y > box.y + box.h + 0.5) &&
      !e.points.some((p) => p.y < box.y - 0.5);
    const tops: Corner[] = [
      { right: true, top: true },
      { right: false, top: true },
    ];
    const bottoms: Corner[] = [
      { right: true, top: false },
      { right: false, top: false },
    ];
    const corners = below ? [...bottoms, ...tops] : [...tops, ...bottoms];
    const own = n ? footOf(n) : box;
    const feet = ctx.nodes.filter((x) => x.id !== e.from).map(footOf);
    const others = ctx.edges.filter((x) => x !== e);
    const labels = [
      ...others.flatMap((x) => [x.labelBox, x.stepBox]),
      ...ctx.groups.flatMap((g) => [g.label.lines.length ? g.labelBox : undefined, g.iconBox]),
    ].filter((b): b is Box => !!b);
    const lines = others.flatMap((x) => segments(x.points));
    const loopClear = (pts: Point[]) =>
      segments(pts).every(
        ([p, q]) =>
          !feet.some((f) => crosses(p, q, f, 3)) && !labels.some((l) => crosses(p, q, l, 0.5)),
      );
    const spotClear = (b: Box, pts: Point[]) =>
      !hits(b, own, 2) &&
      !feet.some((f) => hits(b, f, 2)) &&
      !labels.some((l) => hits(b, l, 2)) &&
      ![...lines, ...segments(pts)].some(([p, q]) => crosses(p, q, b, -2));
    const elk = fresh ? undefined : union([e.labelBox, e.stepBox]);
    // A loop through something costs more than a label on something; ties keep corner order.
    let chosen: { pts: Point[]; spot?: Box; cost: number } | undefined;
    for (const c of corners) {
      const pts = loopPoints(box, c, k, spline);
      const bounds = union(drawnPoints(pts, spline).map(dot)) ?? box;
      const spots = size
        ? [...loopLabelSpots(bounds, c, size.w, size.h), ...(elk ? [elk] : [])]
        : [];
      const spot = spots.find((b) => spotClear(b, pts));
      const cost = (loopClear(pts) ? 0 : 2) + (size && !spot ? 1 : 0);
      if (!chosen || cost < chosen.cost) chosen = { pts, spot: spot ?? spots[0], cost };
      if (cost === 0) break;
    }
    if (!chosen) continue;
    e.points = chosen.pts;
    if (size && chosen.spot) setLabel(e, model, size, chosen.spot);
  }
}
