// Overlay groups (around:), which ELK never sees: drawn around their members' footprint once the
// nodes are placed, and moved off any edge that runs right along their border once edges exist.

import type { Box, SceneGroup, SceneNode } from "../types.ts";
import type { Routed } from "./context.ts";
import { round } from "./geometry.ts";
import { type PaintContext, paintGroup } from "./groups.ts";
import { SIZES } from "./sizes.ts";

/** Overlay groups (around:) are drawn around their members' drawn footprint, plus a header. */
export function drawOverlays(ctx: PaintContext, groups: SceneGroup[], nodes: SceneNode[]): void {
  const { model, groupGeom } = ctx;
  for (const grp of model.groups) {
    if (!grp.around?.length) continue;
    const gg = groupGeom.get(grp.id);
    const boxes: Box[] = [];
    for (const id of grp.around) {
      const nd = nodes.find((x) => x.id === id);
      if (nd)
        boxes.push(
          ...[nd.box, nd.iconBox, nd.labelBox, nd.noteBox, nd.badgeBox].filter(
            (b): b is Box => !!b && b.w > 0,
          ),
        );
      const sg = groups.find((x) => x.id === id);
      if (sg) boxes.push(sg.box);
    }
    if (!boxes.length || !gg) continue;
    const pad = 12;
    // A tile centered on the top border has its label under it, above the members.
    const head =
      gg.iconStyle === "tile-center" && gg.icon
        ? Math.ceil(SIZES.tile / 2 + 3 + gg.label.height + 6)
        : pad + 2;
    let x0 = Math.min(...boxes.map((b) => b.x)) - pad;
    let x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
    // Too narrow for its legend: grow both sides evenly so it does not reach into the next layer.
    const short = gg.minWidth + 2 * pad - (x1 - x0);
    if (short > 0) [x0, x1] = [x0 - short / 2, x1 + short / 2];
    const y0 = Math.min(...boxes.map((b) => b.y)) - head;
    const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
    const sg = paintGroup(
      ctx,
      grp,
      { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) },
      true,
    );
    if (sg) groups.push(sg);
  }
}

/**
 * Overlays are drawn around their members after routing, so an edge can run right along an
 * overlay's border and read as a double line: move that side out until the edge is 8px clear.
 */
export function clearOverlayBorders(ctx: Routed): void {
  const { model, groups, edges } = ctx;
  for (const [i, g] of groups.entries()) {
    const grp = g.overlay ? model.groups.find((x) => x.id === g.id) : undefined;
    if (!grp) continue;
    let [x0, y0, x1, y1] = [g.box.x, g.box.y, g.box.x + g.box.w, g.box.y + g.box.h];
    for (const e of edges)
      for (let k = 1; k < e.points.length; k++) {
        const p = e.points[k - 1];
        const q = e.points[k];
        if (!p || !q) continue;
        const flat = Math.abs(p.y - q.y) < 0.5;
        if (!flat && Math.abs(p.x - q.x) >= 0.5) continue;
        const [lo, hi] = flat
          ? [Math.min(p.x, q.x), Math.max(p.x, q.x)]
          : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
        const [from, to] = flat ? [x0, x1] : [y0, y1];
        if (Math.min(hi, to) - Math.max(lo, from) < 20) continue;
        const at = flat ? p.y : p.x;
        if (flat && Math.abs(at - y0) < 8) y0 = Math.min(y0, at - 8);
        if (flat && Math.abs(at - y1) < 8) y1 = Math.max(y1, at + 8);
        if (!flat && Math.abs(at - x0) < 8) x0 = Math.min(x0, at - 8);
        if (!flat && Math.abs(at - x1) < 8) x1 = Math.max(x1, at + 8);
      }
    if (x0 === g.box.x && y0 === g.box.y && x1 === g.box.x + g.box.w && y1 === g.box.y + g.box.h)
      continue;
    const box = { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) };
    const sg = paintGroup(ctx, grp, box, true);
    if (sg) groups[i] = sg;
  }
}
