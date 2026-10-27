// Trees (org charts, decision trees, taxonomies): a tidy tree with org-chart connectors.

import type { AfterLayout } from "../hooks.ts";
import { clearHeaders, frames, refit, room, snapshot } from "./frames.ts";
import { routeRest } from "./links.ts";
import {
  LABEL_GAP,
  type LabelSize,
  labelBoxAt,
  labelSize,
  point,
  restoreEdges,
  setLabel,
  settle,
  tidyPoints,
} from "./shared.ts";
import {
  depths,
  grow,
  hierarchy,
  levels,
  measure,
  moveTo,
  type Reach,
  spread,
  tidy,
} from "./tidy.ts";

/**
 * Org chart: levels along the flow, siblings evenly spaced, each parent centered over its
 * children, and connectors from the parent's far side to a shared bar, along it and into each
 * child, without arrowheads. Labels (decision tree answers) sit on each child's drop.
 */
export function placeTree(ctx: AfterLayout): void {
  const { model, horizontal } = ctx;
  const s = model.spacing;
  const sign = model.direction === "up" || model.direction === "left" ? -1 : 1;
  restoreEdges(ctx);
  const before = snapshot(ctx);
  const h = hierarchy(ctx, false);
  // The stage story grows along the edges the tree is drawn by.
  for (const n of ctx.nodes) {
    const via = h.via.get(n.id);
    if (via) n.via = via.id;
  }
  const m = new Map(ctx.nodes.map((n) => [n.id, measure(n, horizontal)]));
  const sizes = new Map<string, LabelSize>();
  for (const [child, e] of h.via) {
    const size = labelSize(model.edges.find((x) => x.id === e.id));
    if (size) sizes.set(child, size);
  }
  const along = (z: LabelSize) => (horizontal ? z.w : z.h);
  const fr = room(frames(ctx, before), h, horizontal, sign);
  // A child is as wide across the flow as the label on its drop, so neighboring labels never meet.
  const extent = (id: string): Reach => {
    const a = m.get(id)?.across ?? { lo: 0, hi: 0 };
    const z = sizes.get(id);
    const half = z ? (horizontal ? z.h : z.w) / 2 + 4 : 0;
    const frame = fr.chain(id);
    return { lo: Math.min(a.lo, -half), hi: Math.max(a.hi, half), loIn: frame, hiIn: frame };
  };
  // Teams (cousins) stand further apart than siblings, so each parent's children read as a set.
  const sibling = Math.round(28 * s);
  const cousin = Math.round(44 * s);
  const between = (a: string[], b: string[]) => fr.between(a, b);
  const t = tidy(h.kids, extent, (d, a, b) => (d === 0 ? sibling : cousin) + between(a, b));
  const offsets = spread(
    h.roots.map((id) => t.contour(id)),
    (_, a, b) => cousin + between(a, b),
  );
  const cross = new Map<string, number>();
  h.roots.forEach((id, i) => {
    t.place(id, offsets[i] ?? 0, cross);
  });
  const byDepth = depths(ctx, (id) => h.depth.get(id));
  const stem = Math.round(26 * s);
  const drop = Math.round(30 * s);
  // The bar runs clear of the frames the edges leave, the labels clear of those they enter.
  const leave = (d: number) => Math.max(0, ...(byDepth[d + 1] ?? []).map(fr.leave));
  const lv = levels(byDepth, m, sign, {
    start: 0,
    // Rows of an org chart share their top line; columns of a sideways tree their center line.
    align: horizontal ? "center" : "top",
    stem: (d) => stem + leave(d),
    drop,
    need: (id) => {
      const z = sizes.get(id);
      const me = m.get(id);
      const enter = fr.enter(id);
      // A badge pokes out toward the bar; the label clears it too.
      const poke = me ? grow(me.body, sign).lo - grow(me.foot, sign).lo : 0;
      const label = z ? along(z) + 2 * LABEL_GAP + poke : 0;
      return enter ? Math.max(drop, label) + enter + LABEL_GAP : label;
    },
  });
  for (const n of ctx.nodes)
    moveTo(n, sign * (lv.at.get(n.id) ?? 0), cross.get(n.id) ?? 0, horizontal);
  refit(ctx, before);

  for (const [child, e] of h.via) {
    const parent = h.parent.get(child) ?? "";
    const pm = m.get(parent);
    const cm = m.get(child);
    if (!pm || !cm) continue;
    const pu = lv.at.get(parent) ?? 0;
    const cu = lv.at.get(child) ?? 0;
    const pc = cross.get(parent) ?? 0;
    // A child just off the parent's center takes a straight line from it, not a jog on the bar.
    const off = (cross.get(child) ?? 0) - pc;
    const cc = Math.abs(off) < Math.min(12, cm.wide - 6) ? pc : pc + off;
    const bar = lv.bars[h.depth.get(parent) ?? 0] ?? pu;
    e.points = tidyPoints([
      point(sign * (pu + pm.half), pc, horizontal),
      point(sign * bar, pc, horizontal),
      point(sign * bar, cc, horizontal),
      point(sign * (cu - cm.half), cc, horizontal),
    ]);
    e.arrow = "none";
    const z = sizes.get(child);
    if (z) {
      // Between the bar and the child's level, above any frame the edge enters.
      const next = (lv.starts[h.depth.get(child) ?? 0] ?? cu) - fr.enter(child);
      const at = fr.enter(child) ? next - LABEL_GAP : next;
      const me = model.edges.find((x) => x.id === e.id);
      setLabel(e, me, z, labelBoxAt(sign * ((bar + at) / 2), cc, z, horizontal));
    }
  }
  routeRest(ctx, h, ctx.routing === "spline");
  clearHeaders(ctx);
  settle(ctx);
}
