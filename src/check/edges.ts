// Where edges run: through or close past a node, through a group's header or another edge's label,
// and whether each arrowhead has a straight run to point along.
import type { Point, Scene, SceneEdge } from "../types.ts";
import type { CheckContext } from "./context.ts";
import {
  boxOf,
  EPS,
  firstSegment,
  headerChip,
  pointOf,
  segmentBoxDistance,
  segmentHitsBox,
  tenth,
} from "./geometry.ts";

/** Closer than this (canvas px) an edge reads as touching a node it passes (DG221). */
const SKIM_PX = 10;
/** The stage skin draws its open chevrons at this length per hairline (render/stage/draw-edges.ts). */
const STAGE_HEAD = 6;
/** The display width the stage skin scales its hairline to (render/stage/index.ts). */
const STAGE_DISPLAY = 880;

/** DG201: an edge runs through a node it does not connect. */
export function edgeThroughNode({ scene, nodeBoxes, warn }: CheckContext): void {
  for (const e of scene.edges) {
    for (const nb of nodeBoxes) {
      if (nb.id === e.from || nb.id === e.to) continue;
      if (firstSegment(e.points, (p, q) => segmentHitsBox(p, q, nb.box))) {
        warn("DG201", `edge ${e.from} -> ${e.to} passes through node "${nb.id}"`, {
          subject: { edge: e.id, from: e.from, to: e.to, node: nb.id },
          fixes: [
            `move "${nb.id}" earlier or later in the nodes list`,
            "try layout: { layering: simplex }",
            "change direction",
          ],
        });
      }
    }
  }
}

/**
 * DG209: an edge runs through a group's header label (the chip hides the line, so it looks broken).
 * A pool or lane names itself in a strip across the flow (a black box in its whole band): edges
 * cross the band's borders by design, but never the strip.
 */
export function edgeThroughHeader({ scene, warn }: CheckContext): void {
  for (const g of scene.groups) {
    const chip = g.lane ? g.lane.header : headerChip(g);
    if (!chip) continue;
    const what = g.lane ? "the name strip of" : "the header label of group";
    for (const e of scene.edges) {
      const hit = firstSegment(e.points, (p, q) => segmentHitsBox(p, q, chip, EPS));
      if (!hit) continue;
      const [p, q] = hit;
      warn("DG209", `edge ${e.from} -> ${e.to} runs through ${what} "${g.id}"`, {
        subject: { edge: e.id, from: e.from, to: e.to, group: g.id },
        evidence: { header: boxOf(chip), segment: [pointOf(p), pointOf(q)] },
        fixes: g.lane
          ? [
              `move "${e.from}" or "${e.to}" into the band it reaches, or next to it in the spec`,
              "use layout: { spacing: loose }",
            ]
          : [
              `shorten the label of group "${g.id}" so the edge clears it`,
              `move "${e.from}" or "${e.to}" in the nodes list so the edge enters the group elsewhere`,
              "use layout: { spacing: loose }",
            ],
      });
    }
  }
}

/** DG212: an edge runs through another edge's label. */
export function edgeThroughLabel({ scene, warn }: CheckContext): void {
  for (const a of scene.edges) {
    const label = a.labelBox;
    if (!label) continue;
    for (const b of scene.edges) {
      if (b === a) continue;
      const hit = firstSegment(b.points, (p, q) => segmentHitsBox(p, q, label, EPS));
      if (!hit) continue;
      const [p, q] = hit;
      warn(
        "DG212",
        `edge ${b.from} -> ${b.to} runs through the label "${a.label?.lines.join(" ")}" of ${a.from} -> ${a.to}`,
        {
          subject: { edge: b.id, from: b.from, to: b.to, labelOf: a.id },
          evidence: { label: boxOf(label), segment: [pointOf(p), pointOf(q)] },
          fixes: [
            "shorten the label or drop a redundant one",
            `move "${b.from}" or "${b.to}" in the nodes list so the two edges separate`,
            "use layout: { spacing: loose }",
          ],
        },
      );
    }
  }
}

/**
 * DG221: an edge runs within SKIM_PX of a node it does not connect, so it reads as touching it.
 * A run into the node's box itself is DG201. Canvas px: ELK keeps edges 18px off nodes at normal
 * spacing, so a skim is a routing accident at any display width.
 */
export function edgeSkimsNode({ scene, nodeBoxes, warn }: CheckContext): void {
  for (const e of scene.edges) {
    for (const nb of nodeBoxes) {
      if (nb.id === e.from || nb.id === e.to) continue;
      let gap = Number.POSITIVE_INFINITY;
      let through = false;
      for (let i = 0; i + 1 < e.points.length; i++) {
        const p = e.points[i];
        const q = e.points[i + 1];
        if (!p || !q) continue;
        if (segmentHitsBox(p, q, nb.box)) through = true;
        gap = Math.min(gap, segmentBoxDistance(p, q, nb.box));
      }
      if (through || gap >= SKIM_PX) continue;
      warn(
        "DG221",
        `edge ${e.from} -> ${e.to} passes ${tenth(gap)}px from node "${nb.id}", so it reads as touching it`,
        {
          subject: { edge: e.id, from: e.from, to: e.to, node: nb.id },
          evidence: { gapPx: tenth(gap), minPx: SKIM_PX, node: boxOf(nb.box) },
          fixes: [
            `move "${nb.id}" earlier or later in the nodes list`,
            "use layout: { spacing: loose }",
          ],
        },
      );
    }
  }
}

/** How long the skin draws this edge's arrowhead, in canvas px. */
const headLength = (scene: Scene, e: SceneEdge) =>
  scene.skin === "stage"
    ? STAGE_HEAD * Math.max(1, scene.width / STAGE_DISPLAY)
    : e.line === "thick"
      ? 11
      : 9;

/**
 * The run an arrowhead at pts[0] points along: the length of the last segment (`raw`, which the
 * renderers aim the head with) and of the straight run it belongs to (`run`).
 */
function endRun(pts: Point[]): { raw: number; run: number } {
  const [tip, prev] = pts;
  if (!tip || !prev) return { raw: 0, run: 0 };
  const [ux, uy] = [prev.x - tip.x, prev.y - tip.y];
  const raw = Math.hypot(ux, uy);
  if (raw < 0.01) return { raw, run: 0 };
  let run = raw;
  for (const p of pts.slice(2)) {
    const [dx, dy] = [p.x - tip.x, p.y - tip.y];
    // Still on the ray from the tip through prev: collinear, the same way and further out.
    const across = Math.abs(dx * uy - dy * ux) / raw;
    const along = (dx * ux + dy * uy) / raw;
    if (across > 0.01 || along < run) break;
    run = along;
  }
  return { raw, run };
}

/**
 * DG222: an arrowhead sits on a zero-length end segment (it has no direction, and the renderers
 * draw it collapsed), or on a straight run shorter than the head, so the head sits on the bend.
 * A spline is drawn as a curve, so only its zero-length end counts.
 */
export function headOnShortEnd({ scene, warn }: CheckContext): void {
  for (const e of scene.edges) {
    const n = e.points.length;
    if (n < 2) continue;
    const spline = scene.routing === "spline" && (n - 1) % 3 === 0 && n > 2;
    const head = headLength(scene, e);
    const ends = [
      ...(e.arrow === "end" || e.arrow === "both"
        ? [{ at: e.to, pts: [...e.points].reverse() }]
        : []),
      ...(e.arrow === "start" || e.arrow === "both" ? [{ at: e.from, pts: e.points }] : []),
    ];
    for (const { at, pts } of ends) {
      const { raw, run } = endRun(pts);
      const zero = raw < 0.01;
      if (!zero && (spline || run >= head - EPS)) continue;
      const tip = pts[0] as Point;
      warn(
        "DG222",
        zero
          ? `the arrowhead of ${e.from} -> ${e.to} at "${at}" ends a zero-length segment, so it points nowhere`
          : `the arrowhead of ${e.from} -> ${e.to} at "${at}" sits on a ${tenth(run)}px straight run, shorter than the ${tenth(head)}px head, so it covers the bend`,
        {
          subject: { edge: e.id, from: e.from, to: e.to, end: at },
          evidence: { runPx: tenth(run), headPx: tenth(head), tip: pointOf(tip) },
          fixes: [
            `move "${at}" in the nodes list so it lines up with the other end`,
            "use layout: { spacing: loose }",
            "try layout: { layering: simplex }",
          ],
        },
      );
    }
  }
}
