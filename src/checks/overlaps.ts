// Things drawn on top of each other: edge labels, node footprints, badges and group borders.
import type { Box } from "../types.ts";
import type { CheckContext } from "./context.ts";
import { badgeRect, boxOf, circleHitsBox, EPS, nodeParts, overlaps } from "./geometry.ts";

/** DG202: an edge label covers a node or another edge label. */
export function edgeLabelCovers({ scene, nodeBoxes, warn }: CheckContext): void {
  const labels = scene.edges.filter((e) => e.labelBox).map((e) => ({ e, box: e.labelBox as Box }));
  for (const { e, box } of labels) {
    for (const nb of nodeBoxes) {
      if (overlaps(box, nb.foot, -1)) {
        warn(
          "DG202",
          `label "${e.label?.lines.join(" ")}" on ${e.from} -> ${e.to} covers node "${nb.id}"`,
          {
            subject: { edge: e.id, node: nb.id },
            fixes: ["shorten the edge label", "use layout: { spacing: loose }"],
          },
        );
      }
    }
  }
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      if (a && b && overlaps(a.box, b.box, -1)) {
        warn(
          "DG202",
          `edge labels on ${a.e.from} -> ${a.e.to} and ${b.e.from} -> ${b.e.to} overlap`,
          {
            subject: { edges: [a.e.id, b.e.id] },
            fixes: ["shorten one label or drop a redundant one", "use layout: { spacing: loose }"],
          },
        );
      }
    }
  }
}

/** DG203: two nodes' drawn footprints overlap (label text colliding with a neighbour). */
export function nodesOverlap({ nodeBoxes, warn }: CheckContext): void {
  for (let i = 0; i < nodeBoxes.length; i++) {
    for (let j = i + 1; j < nodeBoxes.length; j++) {
      const a = nodeBoxes[i];
      const b = nodeBoxes[j];
      if (a && b && overlaps(a.foot, b.foot, -2)) {
        warn("DG203", `nodes "${a.id}" and "${b.id}" overlap (labels collide)`, {
          subject: { nodes: [a.id, b.id] },
          fixes: [`shorten the label of "${a.id}" or "${b.id}"`, "use layout: { spacing: loose }"],
        });
      }
    }
  }
}

/** A step badge (round) or a node badge (a pill) as DG211 measures it. */
interface Pill {
  round: boolean;
  box: Box;
  what: string;
  subject: Record<string, unknown>;
  node?: string;
}

/** Every step badge, in edge order, then every node badge, in node order. */
function pillsOf({ scene }: CheckContext): Pill[] {
  const pills: Pill[] = [];
  for (const e of scene.edges) {
    if (e.stepBox && e.step !== undefined) {
      const subject = { edge: e.id, from: e.from, to: e.to, step: e.step };
      pills.push({
        round: true,
        box: e.stepBox,
        what: `step ${e.step} on ${e.from} -> ${e.to}`,
        subject,
      });
    }
  }
  for (const n of scene.nodes) {
    const box = badgeRect(n);
    if (n.badge && box) {
      const what = `badge "${n.badge}" on node "${n.id}"`;
      pills.push({ round: false, box, what, subject: { node: n.id }, node: n.id });
    }
  }
  return pills;
}

const hits = (p: Pill, b: Box) => (p.round ? circleHitsBox(p.box, b) : overlaps(p.box, b, -EPS));
const pillFixes = (p: Pill) =>
  p.round
    ? ["shorten the edge label next to it", "use layout: { spacing: loose }"]
    : ["shorten the badge text", "use layout: { spacing: loose }"];

/** Whether two badges touch: circle to circle, circle to pill, or pill to either. */
function pillsMeet(a: Pill, b: Pill): boolean {
  const [ra, rb] = [a.box.w / 2, b.box.w / 2];
  return a.round && b.round
    ? Math.hypot(a.box.x + ra - (b.box.x + rb), a.box.y + ra - (b.box.y + rb)) < ra + rb - EPS
    : a.round
      ? circleHitsBox(a.box, b.box)
      : hits(b, a.box);
}

/** DG211: a step badge or a node badge sits on a node, a label or another badge. */
export function badgesCover(ctx: CheckContext): void {
  const { scene, warn } = ctx;
  const pills = pillsOf(ctx);
  const pillWarn = (p: Pill, over: string, subject: Record<string, unknown>, box: Box) =>
    warn("DG211", `${p.what} covers ${over}`, {
      subject: { ...p.subject, ...subject },
      evidence: { badge: boxOf(p.box), over: boxOf(box) },
      fixes: pillFixes(p),
    });
  for (const p of pills) {
    for (const n of scene.nodes) {
      const own = p.node === n.id;
      const hit = nodeParts(n)
        .filter((x) => !own || x.what === "label" || x.what === "note")
        .find((x) => hits(p, x.box));
      if (hit) pillWarn(p, `the ${hit.what} of node "${n.id}"`, { over: n.id }, hit.box);
    }
    for (const e of scene.edges) {
      if (e.labelBox && hits(p, e.labelBox)) {
        pillWarn(p, `the label of edge ${e.from} -> ${e.to}`, { over: e.id }, e.labelBox);
      }
    }
  }
  for (let i = 0; i < pills.length; i++) {
    for (let j = i + 1; j < pills.length; j++) {
      const a = pills[i];
      const b = pills[j];
      if (!a || !b) continue;
      if (pillsMeet(a, b))
        pillWarn(a, `${b.what}`, { over: b.node ?? (b.subject.edge as string) }, b.box);
    }
  }
}

/** Whether v lies more than 1px inside the span lo..lo+len. */
const inside = (v: number, lo: number, len: number) => v > lo + 1 && v < lo + len - 1;
/** Whether the spans lo..lo+len and a..a+alen overlap by more than EPS. */
const spans = (lo: number, len: number, a: number, alen: number) =>
  lo < a + alen - EPS && a < lo + len - EPS;

/**
 * DG220: an edge label sits on a group's border line. Its chip paints over the line, so the frame
 * looks broken there and the label belongs to neither side. A line along the chip's edge does not
 * count; one more than 1px inside it does.
 */
export function labelOnBorder({ scene, warn }: CheckContext): void {
  for (const e of scene.edges) {
    const b = e.labelBox;
    if (!b || !e.label) continue;
    for (const g of scene.groups) {
      const r = g.box;
      const sides = [
        ["top", inside(r.y, b.y, b.h) && spans(r.x, r.w, b.x, b.w)],
        ["bottom", inside(r.y + r.h, b.y, b.h) && spans(r.x, r.w, b.x, b.w)],
        ["left", inside(r.x, b.x, b.w) && spans(r.y, r.h, b.y, b.h)],
        ["right", inside(r.x + r.w, b.x, b.w) && spans(r.y, r.h, b.y, b.h)],
      ] as const;
      const on = sides.filter(([, hit]) => hit).map(([side]) => side);
      if (!on.length) continue;
      warn(
        "DG220",
        `label "${e.label.lines.join(" ")}" on ${e.from} -> ${e.to} sits on the ${on.join(" and ")} border of group "${g.id}"`,
        {
          subject: { edge: e.id, from: e.from, to: e.to, group: g.id },
          evidence: { label: boxOf(b), group: boxOf(r), sides: on.join(",") },
          fixes: [
            "shorten the label so it fits between the borders",
            `move "${e.from}" or "${e.to}" in the nodes list so the edge's middle sits inside or outside "${g.id}"`,
            "use layout: { spacing: loose }",
          ],
        },
      );
    }
  }
}
