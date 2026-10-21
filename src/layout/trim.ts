// Group frames as ELK left them, tidied: the extra padding ELK keeps for bend points trimmed back,
// then frames stacked in a column stretched to the column's width.

import type { Box, Model, ModelGroup } from "../types.ts";
import type { Laid } from "./context.ts";
import type { ElkEdge, ElkNode } from "./elk.ts";
import { contains, dropStraightPoints, overlaps, segmentBox, union } from "./geometry.ts";
import { minWidthOf } from "./measure.ts";
import { depthOf } from "./relations.ts";
import { seatPadding } from "./seats.ts";

/**
 * ELK counts the bend point it puts 5px outside a nested border as content, so a group an edge
 * enters gets 25px on that side instead of 20. Trim it back, innermost first, while nothing
 * drawn (child, edge point, edge label) ends up outside and the header still fits.
 */
export function trimGroups(ctx: Laid, placed: Map<string, ElkNode>, elkEdges: ElkEdge[]): void {
  const { model, opts, groupGeom, plan, horizontal } = ctx;
  const edgeMarks: Box[] = elkEdges.flatMap((e) => [
    ...(e.sections ?? []).flatMap((s) =>
      [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => ({
        ...p,
        w: 0,
        h: 0,
      })),
    ),
    ...(e.labels ?? []).map((l) => ({
      x: l.x ?? 0,
      y: l.y ?? 0,
      w: l.width,
      h: l.height,
    })),
  ]);
  const byDepth = model.groups
    .filter((g) => !g.around)
    .sort((a, b) => depthOf(model, b.parent) - depthOf(model, a.parent));
  for (const grp of byDepth) {
    const el = placed.get(grp.id);
    const gg = groupGeom.get(grp.id);
    if (!el?.children?.length || !gg) continue;
    const kids = el.children.flatMap((c) => [
      { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 },
      ...(c.labels ?? []).map((l) => ({
        x: l.x ?? 0,
        y: l.y ?? 0,
        w: l.width,
        h: l.height,
      })),
    ]);
    const old = {
      x: el.x ?? 0,
      y: el.y ?? 0,
      w: el.width ?? 0,
      h: el.height ?? 0,
    };
    const k = union(kids);
    const pad = seatPadding(model, plan, grp.id, horizontal) ?? 20;
    let x0 = Math.max(old.x, k.x - pad);
    let y0 = Math.max(old.y, k.y - gg.header - 18 - (opts.room?.get(grp.id) ?? 0));
    let x1 = Math.min(old.x + old.w, k.x + k.w + pad);
    let y1 = Math.min(old.y + old.h, k.y + k.h + pad);
    const grow = opts.grow?.get(grp.id);
    if (x1 - x0 < Math.max(minWidthOf(ctx, grp.id, gg), grow?.w ?? 0))
      [x0, x1] = [old.x, old.x + old.w];
    if (y1 - y0 < Math.max(gg.header + 42, grow?.h ?? 0)) [y0, y1] = [old.y, old.y + old.h];
    for (const b of edgeMarks) {
      if (!contains(old, b)) continue;
      if (b.x < x0) x0 = old.x;
      if (b.y < y0) y0 = old.y;
      if (b.x + b.w > x1) x1 = old.x + old.w;
      if (b.y + b.h > y1) y1 = old.y + old.h;
    }
    Object.assign(el, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
}

/**
 * Frames of one type stacked in a column (AWS accounts in a Region) take the column's widest
 * extent. A frame stays as it is when the strip it would gain holds a node, another frame, an
 * edge label, an edge end on its border or any line other than one passing straight into it.
 */
export function stretchColumns(model: Model, placed: Map<string, ElkNode>, edges: ElkEdge[]): void {
  const parentOf = new Map([...model.groups, ...model.nodes].map((x) => [x.id, x.parent]));
  const related = (a: string, b: string) => {
    for (let p = parentOf.get(a); p; p = parentOf.get(p)) if (p === b) return true;
    for (let p = parentOf.get(b); p; p = parentOf.get(p)) if (p === a) return true;
    return a === b;
  };
  const boxOf = (n: ElkNode): Box => ({
    x: n.x ?? 0,
    y: n.y ?? 0,
    w: n.width ?? 0,
    h: n.height ?? 0,
  });
  const items = [...placed.values()]
    .filter((n) => n.id !== "__root")
    .flatMap((n) => [
      { id: n.id, box: boxOf(n) },
      ...(n.labels ?? []).map((l) => ({
        id: n.id,
        box: { x: l.x ?? 0, y: l.y ?? 0, w: l.width, h: l.height },
      })),
    ]);
  const labels = edges.flatMap((e) =>
    (e.labels ?? []).map((l) => ({
      x: l.x ?? 0,
      y: l.y ?? 0,
      w: l.width,
      h: l.height,
    })),
  );
  const segments = edges.flatMap((e) =>
    (e.sections ?? []).flatMap((s) => {
      const pts = dropStraightPoints([s.startPoint, ...(s.bendPoints ?? []), s.endPoint]);
      return pts.slice(1).map((q, i) => [pts[i] ?? q, q] as const);
    }),
  );
  const columns: ModelGroup[][] = [];
  for (const grp of model.groups) {
    const el = placed.get(grp.id);
    if (grp.around || !el) continue;
    const b = boxOf(el);
    const column = columns.find((c) =>
      c.every((o) => {
        const ob = boxOf(placed.get(o.id) ?? el);
        const shared = Math.min(b.x + b.w, ob.x + ob.w) - Math.max(b.x, ob.x);
        const stacked = b.y >= ob.y + ob.h || ob.y >= b.y + b.h;
        return o.type === grp.type && o.parent === grp.parent && stacked && shared > b.w / 2;
      }),
    );
    if (column) column.push(grp);
    else columns.push([grp]);
  }
  for (const column of columns.filter((c) => c.length > 1)) {
    const els = column.map((g) => placed.get(g.id)).filter((n): n is ElkNode => !!n);
    const x0 = Math.min(...els.map((n) => n.x ?? 0));
    const x1 = Math.max(...els.map((n) => (n.x ?? 0) + (n.width ?? 0)));
    for (const el of els) {
      const b = boxOf(el);
      // Only even out near misses: stretching a much narrower frame leaves its content off-center.
      if (b.w < (x1 - x0) * 0.75) continue;
      const strips = [
        { x: x0, y: b.y, w: b.x - x0, h: b.h, left: true },
        { x: b.x + b.w, y: b.y, w: x1 - b.x - b.w, h: b.h, left: false },
      ];
      const open = strips.every((s) => {
        if (s.w < 0.5) return true;
        const hit = (o: Box) => overlaps(s, { x: o.x, y: o.y, w: o.w || 0.01, h: o.h || 0.01 });
        if (items.some((it) => !related(it.id, el.id) && hit(it.box))) return false;
        if (labels.some(hit)) return false;
        // Only a horizontal line that crosses the whole strip and the border may stay.
        return segments.every(([p, q]) => {
          const [lo, hi] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
          const across = s.left
            ? lo <= s.x + 0.01 && hi > b.x + 0.5
            : hi >= x1 - 0.01 && lo < s.x - 0.5;
          return !hit(segmentBox(p, q)) || (Math.abs(p.y - q.y) < 0.5 && across);
        });
      });
      if (open) Object.assign(el, { x: x0, width: x1 - x0 });
    }
  }
}
