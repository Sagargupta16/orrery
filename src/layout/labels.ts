// Labels and steps of the edges drawn after ELK: beside a run of the route, clear of nodes, other
// labels and (for routes new since rank, align and cols) group borders, headers and every line.

import { textBlock } from "../text.ts";
import type { Box, Point } from "../types.ts";
import type { Routed } from "./context.ts";
import { meet, midpoint, overlaps, round, type Seg, segmentsOf, union } from "./geometry.ts";
import { SIZES } from "./sizes.ts";

// Free-edge labels and steps go beside a vertical run, clear of nodes and other labels.
export function placeFreeLabels(ctx: Routed): void {
  const { model, opts, nodes, groups, edges, headers, rerouted, rel } = ctx;
  const footprints = nodes.map((n) => union([n.box, n.iconBox, n.labelBox, n.noteBox]));
  for (const e of model.edges) {
    const edge = edges.find((x) => x.id === e.id);
    if (!(rel.free(e) || rerouted.has(e.id)) || !edge || (!e.label && e.step === undefined))
      continue;
    const block = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
    const stepW = e.step !== undefined ? SIZES.step + 2 : 0;
    const w = Math.ceil((e.label ? block.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0));
    const h = Math.ceil(Math.max(e.label ? block.height + 6 : 0, stepW ? SIZES.step : 0));
    // Edges routed after ELK since rank, align and cols also keep their label off group borders,
    // headers and every line, and try each run of their path before settling.
    const fresh =
      rel.inBlock(e) || rel.gridBetween(e) || rerouted.has(e.id) || !!opts.loose?.has(e.id);
    const avoid = [
      ...footprints,
      ...edges.flatMap((x) => [x.labelBox, x.stepBox]),
      ...groups.map((g) => g.labelBox),
      ...(fresh ? nodes.map((n) => n.badgeBox) : []),
      ...(fresh
        ? groups.flatMap((g) => [
            { x: g.box.x - 1, y: g.box.y, w: 2, h: g.box.h },
            { x: g.box.x + g.box.w - 1, y: g.box.y, w: 2, h: g.box.h },
            { x: g.box.x, y: g.box.y - 1, w: g.box.w, h: 2 },
            { x: g.box.x, y: g.box.y + g.box.h - 1, w: g.box.w, h: 2 },
          ])
        : []),
    ];
    const spot = fresh
      ? labelSpot(
          edge.points,
          w,
          h,
          [
            ...avoid.filter((b): b is Box => !!b),
            ...headers.map((x) => x.box),
            ...groups.flatMap((g) => (g.iconBox ? [g.iconBox] : [])),
          ],
          edges.filter((x) => x !== edge).map((x) => x.points),
        )
      : undefined;
    const box = spot ?? freeLabelBox(edge.points, w, h, avoid);
    if (e.step !== undefined)
      edge.stepBox = {
        x: box.x,
        y: round(box.y + (h - SIZES.step) / 2),
        w: SIZES.step,
        h: SIZES.step,
      };
    if (e.label) {
      edge.label = block;
      edge.labelBox = {
        x: round(box.x + stepW + (stepW ? 2 : 0)),
        y: box.y,
        w: round(w - stepW - (stepW ? 2 : 0)),
        h,
      };
    }
  }
}

/**
 * Where the label of an edge drawn after ELK goes: beside one of its runs (above or below a level
 * one, right or left of an upright one), at the middle or a third of the way from either end,
 * longest run first, clear of `avoid` (nodes, labels, headers, borders), of every line in `lines`
 * with a box at each of its ends for the arrowhead, and of the edge's own line. Undefined when no
 * spot is clear.
 */
export function labelSpot(
  points: Point[],
  w: number,
  h: number,
  avoid: Box[],
  lines: Point[][],
): Box | undefined {
  const stroke = ([p, q]: Seg): Box => ({
    x: Math.min(p.x, q.x) - 1,
    y: Math.min(p.y, q.y) - 1,
    w: Math.abs(q.x - p.x) + 2,
    h: Math.abs(q.y - p.y) + 2,
  });
  const tips = (pts: Point[]) =>
    [pts[0], pts.at(-1)].flatMap((p) => (p ? [{ x: p.x - 6, y: p.y - 6, w: 12, h: 12 }] : []));
  const walls = [
    ...avoid,
    ...[...lines, points].flatMap((pts) => [...segmentsOf(pts).map(stroke), ...tips(pts)]),
  ];
  const runs = segmentsOf(points)
    .filter(([p, q]) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) > 1)
    .sort(([a, b], [c, d]) => Math.hypot(d.x - c.x, d.y - c.y) - Math.hypot(b.x - a.x, b.y - a.y));
  for (const [p, q] of runs)
    for (const f of [0.5, 1 / 3, 2 / 3]) {
      const x = p.x + (q.x - p.x) * f;
      const y = p.y + (q.y - p.y) * f;
      const level = Math.abs(p.y - q.y) < 0.5;
      const spots: Box[] = level
        ? [
            { x: x - w / 2, y: y - h - 3, w, h },
            { x: x - w / 2, y: y + 3, w, h },
          ]
        : [
            { x: x + 6, y: y - h / 2, w, h },
            { x: x - 6 - w, y: y - h / 2, w, h },
          ];
      const spot = spots.find((b) => !walls.some((o) => meet(b, o)));
      if (spot) return { x: round(spot.x), y: round(spot.y), w, h };
    }
  return undefined;
}

/**
 * Where a free edge's label (and step) goes: beside its longest vertical run, right side unless
 * only the left is clear, so it never sits on the line or on a node's own label. A route with
 * no vertical run keeps it above its middle. Never left of or above the canvas.
 */
function freeLabelBox(points: Point[], w: number, h: number, avoid: (Box | undefined)[]): Box {
  const runs = points
    .slice(1)
    .map((q, i) => [points[i] ?? q, q] as const)
    .filter(([p, q]) => Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) > 0.5)
    .sort(([a, b], [c, d]) => Math.abs(d.y - c.y) - Math.abs(b.y - a.y));
  const inside = (b: Box): Box => ({
    ...b,
    x: round(Math.max(0, b.x)),
    y: round(Math.max(0, b.y)),
  });
  const clear = (b: Box) => !avoid.some((o) => o && overlaps(b, o));
  const pick = (first: Box, second: Box) => (clear(first) || !clear(second) ? first : second);
  const run = runs[0];
  if (!run) {
    const mid = midpoint(points);
    const above = inside({ x: mid.x - w / 2, y: mid.y - h - 3, w, h });
    return pick(above, inside({ ...above, y: mid.y + 3 }));
  }
  const [p, q] = run;
  const y = (p.y + q.y) / 2 - h / 2;
  return pick(inside({ x: p.x + 6, y, w, h }), inside({ x: p.x - 6 - w, y, w, h }));
}
