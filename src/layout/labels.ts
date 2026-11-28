// Labels and steps of the edges drawn after ELK: beside a run of the route, clear of nodes, other
// labels and (for routes new since rank, align and cols) group borders, headers and every line.

import { textBlock } from "../text.ts";
import type { Box, Point, SceneEdge, SceneGroup, TextBlock } from "../types.ts";
import type { Routed } from "./context.ts";
import {
  meet,
  midpoint,
  overlaps,
  round,
  type Seg,
  segmentHits,
  segmentsOf,
  union,
} from "./geometry.ts";
import { headerText } from "./groups.ts";
import { SIZES } from "./sizes.ts";

// Free-edge labels and steps go beside a vertical run, clear of nodes and other labels. So do
// the labels of ELK-routed edges that fit beside their line (Graph.beside): one with no clear spot
// goes into Graph.unplaced, for the second pass to give to ELK.
export function placeFreeLabels(ctx: Routed): void {
  const { model, opts, nodes, groups, edges, headers, rerouted, rel, beside, unplaced } = ctx;
  const footprints = nodes.map((n) => union([n.box, n.iconBox, n.labelBox, n.noteBox]));
  for (const e of model.edges) {
    const edge = edges.find((x) => x.id === e.id);
    const drawnAfter = rel.free(e) || rerouted.has(e.id);
    if (!(drawnAfter || beside.has(e.id)) || !edge || (!e.label && e.step === undefined)) continue;
    const stepW = e.step !== undefined ? SIZES.step + 2 : 0;
    const sized = (b: TextBlock) => ({
      w: Math.ceil((e.label ? b.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0)),
      h: Math.ceil(Math.max(e.label ? b.height + 6 : 0, stepW ? SIZES.step : 0)),
    });
    let block = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
    let { w, h } = sized(block);
    // Edges routed after ELK since rank, align, cols and on, and ELK edges with a label beside
    // the line, also keep their label off group borders, headers and every line, and try each run
    // of their path before settling.
    const fresh =
      !drawnAfter ||
      rel.inBlock(e) ||
      rel.gridBetween(e) ||
      rel.seated(e) ||
      rerouted.has(e.id) ||
      !!opts.loose?.has(e.id);
    const avoid = [
      ...footprints,
      ...edges.flatMap((x) => [x.labelBox, x.stepBox]),
      ...groups.map(headerText),
      ...(fresh ? nodes.map((n) => n.badgeBox) : []),
      // A label beside an ELK line keeps off every arrowhead, which reaches past a line's tip box,
      // and out of each framed group's title band (DG225), where it would read as the title.
      ...(drawnAfter ? [] : edges.flatMap((x) => (x === edge ? [] : headsOf(x)))),
      ...(drawnAfter ? [] : groups.flatMap(titleBand)),
      ...(fresh
        ? groups.flatMap((g) => [
            { x: g.box.x - 1, y: g.box.y, w: 2, h: g.box.h },
            { x: g.box.x + g.box.w - 1, y: g.box.y, w: 2, h: g.box.h },
            { x: g.box.x, y: g.box.y - 1, w: g.box.w, h: 2 },
            { x: g.box.x, y: g.box.y + g.box.h - 1, w: g.box.w, h: 2 },
          ])
        : []),
    ];
    const frames = groups.flatMap((g) => [
      { x: g.box.x - 1, y: g.box.y, w: 2, h: g.box.h },
      { x: g.box.x + g.box.w - 1, y: g.box.y, w: 2, h: g.box.h },
      { x: g.box.x, y: g.box.y - 1, w: g.box.w, h: 2 },
      { x: g.box.x, y: g.box.y + g.box.h - 1, w: g.box.w, h: 2 },
    ]);
    const lines = edges.filter((x) => x !== edge).map((x) => x.points);
    const search = (fine = false, sw = w, sh = h) =>
      labelSpot(
        edge.points,
        sw,
        sh,
        [
          ...avoid.filter((b): b is Box => !!b),
          ...(fresh ? [] : frames),
          ...headers.map((x) => x.box),
          ...groups.flatMap((g) => (g.iconBox ? [g.iconBox] : [])),
        ],
        lines,
        fine,
      );
    // Beside the longest upright run, unless another line runs through the label there or it
    // lands on a group's border line: then the first clear spot along the route, as for a fresh
    // route.
    const usual = fresh ? undefined : freeLabelBox(edge.points, w, h, avoid);
    // DG212 and DG220 as check measures them, on the label (not the step): a line through it, a
    // border line more than 1px inside it.
    const inside = (v: number, lo: number, len: number) => v > lo + 1 && v < lo + len - 1;
    const spans = (lo: number, len: number, a: number, alen: number) =>
      lo < a + alen && a < lo + len;
    const crossed = (at: Box) => {
      if (!e.label) return false;
      const b = { ...at, x: at.x + stepW + (stepW ? 2 : 0), w: w - stepW - (stepW ? 2 : 0) };
      return (
        lines.some((pts) => segmentsOf(pts).some(([p, q]) => segmentHits(p, q, b, 0.5))) ||
        groups.some(
          ({ box: r }) =>
            ((inside(r.y, b.y, b.h) || inside(r.y + r.h, b.y, b.h)) && spans(r.x, r.w, b.x, b.w)) ||
            ((inside(r.x, b.x, b.w) || inside(r.x + r.w, b.x, b.w)) && spans(r.y, r.h, b.y, b.h)),
        )
      );
    };
    // The usual spot holds only when nothing the review counts as hard runs into it. A label
    // beside an ELK line tries more spots along each run before it gives up its place; when none
    // is clear, the spot that runs into the fewest things.
    const hits = hardHits(ctx, edge);
    let found =
      (usual && !crossed(usual) && !hits(usual) ? usual : search()) ??
      (drawnAfter ? undefined : search(true));
    // Then wrapped at half its width, which a gap between two lines may hold.
    const narrow =
      !found && !drawnAfter && e.label
        ? textBlock(e.label, SIZES.edgeLabel, Math.ceil(block.width / 2) + 1)
        : undefined;
    if (narrow && narrow.lines.length > block.lines.length) {
      const size = sized(narrow);
      const spot = search(true, size.w, size.h);
      if (spot) [found, block, w, h] = [spot, narrow, size.w, size.h];
    }
    if (!found && !drawnAfter) unplaced.add(e.id);
    const box =
      found ?? leastHit(edge.points, w, h, hits, usual ?? freeLabelBox(edge.points, w, h, avoid));
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
 * The labels placed beside an ELK-routed line that the second pass gives back to ELK: those with
 * no clear spot, and those a line, an arrowhead, a group border, a node or another label runs
 * into once every route and border is final (DG212, DG220 and the label overlaps the review
 * counts as hard).
 */
export function layeredLabels(ctx: Routed): Set<string> {
  const { edges, beside, unplaced } = ctx;
  const out = new Set(unplaced);
  for (const edge of edges) {
    if (!beside.has(edge.id) || out.has(edge.id)) continue;
    const hits = hardHits(ctx, edge);
    if ([edge.labelBox, edge.stepBox].some((b) => b && b.w > 0 && hits(b) > 0)) out.add(edge.id);
  }
  return out;
}

/**
 * What a label (or step) of `edge` at a box runs into: one for each thing the review counts as
 * hard (a line through it, its own too, an arrowhead under it, a node, another edge's label or
 * step), a quarter for each group border more than 1px inside it (DG220, a minor finding).
 */
function hardHits(
  ctx: Pick<Routed, "edges" | "groups" | "nodes">,
  edge: SceneEdge,
): (b: Box) => number {
  const { edges, groups, nodes } = ctx;
  const feet = nodes.map((n) =>
    union([n.box, n.iconBox, n.labelBox, n.noteBox].filter((b): b is Box => !!b)),
  );
  const tags = edges.flatMap((x) =>
    x === edge ? [] : [x.labelBox, x.stepBox].filter((b): b is Box => !!b && b.w > 0),
  );
  const heads = edges.flatMap((x) => (x === edge ? [] : headsOf(x)));
  const segs = edges.flatMap((x) => segmentsOf(x.points));
  const inside = (v: number, lo: number, len: number) => v > lo + 1 && v < lo + len - 1;
  const spans = (lo: number, len: number, a: number, alen: number) => lo < a + alen && a < lo + len;
  const count = <T>(list: T[], hit: (x: T) => boolean) => list.filter(hit).length;
  return (b) =>
    count(segs, ([p, q]) => segmentHits(p, q, b, 0.5)) +
    count(heads, (x) => meet(b, x, -1)) +
    count(
      groups,
      ({ box: r }) =>
        ((inside(r.y, b.y, b.h) || inside(r.y + r.h, b.y, b.h)) && spans(r.x, r.w, b.x, b.w)) ||
        ((inside(r.x, b.x, b.w) || inside(r.x + r.w, b.x, b.w)) && spans(r.y, r.h, b.y, b.h)),
    ) /
      4 +
    count(feet, (f) => meet(b, f, -1)) +
    count(tags, (t) => meet(b, t, -1));
}

/**
 * When no spot is clear: the spot along the route (every twelfth of each run, both sides) that
 * runs into the fewest hard things, if it runs into fewer than `last`, else `last`.
 */
function leastHit(points: Point[], w: number, h: number, hits: (b: Box) => number, last: Box): Box {
  let best = last;
  let fewest = hits(last);
  for (const b of spotsAlong(points, w, h, TWELFTHS)) {
    if (!fewest) break;
    const n = hits(b);
    if (n < fewest) [best, fewest] = [{ x: round(b.x), y: round(b.y), w, h }, n];
  }
  return best;
}

/**
 * A framed group's title band as check/groups.ts measures it (DG225): 28px under the top border,
 * or down to the bottom of a taller title. Overlays, pools and lanes are crossed by design.
 */
function titleBand(g: SceneGroup): Box[] {
  if (g.overlay || g.lane || g.type === "pool" || g.type === "lane" || !g.label.lines.length)
    return [];
  const t = headerText(g);
  return [{ x: g.box.x, y: g.box.y, w: g.box.w, h: Math.max(28, t.y + t.h - g.box.y) }];
}

/** The box around each arrowhead an edge draws (9px long and wide at its tip), 1px wider. */
function headsOf(e: SceneEdge): Box[] {
  const ends: [Point | undefined, Point | undefined][] = [];
  if (e.arrow === "end" || e.arrow === "both") ends.push([e.points.at(-1), e.points.at(-2)]);
  if (e.arrow === "start" || e.arrow === "both") ends.push([e.points[0], e.points[1]]);
  return ends.flatMap(([tip, prev]) => {
    if (!tip || !prev) return [];
    const len = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
    const [ux, uy] = [(tip.x - prev.x) / len, (tip.y - prev.y) / len];
    const [bx, by] = [tip.x - ux * 9, tip.y - uy * 9];
    const xs = [tip.x, bx - uy * 4.5, bx + uy * 4.5];
    const ys = [tip.y, by + ux * 4.5, by - ux * 4.5];
    const x = Math.min(...xs) - 1;
    const y = Math.min(...ys) - 1;
    return [{ x, y, w: Math.max(...xs) + 1 - x, h: Math.max(...ys) + 1 - y }];
  });
}

/** 1/12 to 11/12 of a run, nearest its middle first. */
const TWELFTHS = Array.from({ length: 11 }, (_, i) => (i + 1) / 12).sort(
  (a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5),
);

/**
 * Where the label of an edge drawn after ELK goes: beside one of its runs (above or below a level
 * one, right or left of an upright one), at the middle or a third of the way from either end,
 * longest run first, clear of `avoid` (nodes, labels, headers, borders), of every line in `lines`
 * with a box at each of its ends for the arrowhead, and of the edge's own line. `fine` then tries
 * every twelfth of each run, nearest the middle first. Undefined when no spot is clear.
 */
export function labelSpot(
  points: Point[],
  w: number,
  h: number,
  avoid: Box[],
  lines: Point[][],
  fine = false,
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
  const spot = spotsAlong(points, w, h, fine ? TWELFTHS : [0.5, 1 / 3, 2 / 3]).find(
    (b) => !walls.some((o) => meet(b, o)),
  );
  return spot && { x: round(spot.x), y: round(spot.y), w, h };
}

/**
 * The spots beside a route labelSpot tries, in order: longest run first, at each fraction of it,
 * above then below a level run, right then left of an upright one.
 */
function spotsAlong(points: Point[], w: number, h: number, fractions: number[]): Box[] {
  const runs = segmentsOf(points)
    .filter(([p, q]) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) > 1)
    .sort(([a, b], [c, d]) => Math.hypot(d.x - c.x, d.y - c.y) - Math.hypot(b.x - a.x, b.y - a.y));
  return runs.flatMap(([p, q]) =>
    fractions.flatMap((f) => {
      const x = p.x + (q.x - p.x) * f;
      const y = p.y + (q.y - p.y) * f;
      return Math.abs(p.y - q.y) < 0.5
        ? [
            { x: x - w / 2, y: y - h - 3, w, h },
            { x: x - w / 2, y: y + 3, w, h },
          ]
        : [
            { x: x + 6, y: y - h / 2, w, h },
            { x: x - 6 - w, y: y - h / 2, w, h },
          ];
    }),
  );
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
