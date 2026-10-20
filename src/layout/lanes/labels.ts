// Edge labels and step badges beside the routed lane edges.

import { textBlock } from "../text.ts";
import type { Box, SceneEdge } from "../types.ts";
import {
  cuts,
  EDGE_LABEL,
  EDGE_LABEL_MAX,
  footOf,
  grow,
  hits,
  type Routing,
  round,
  STEP,
} from "./lane-shared.ts";

/**
 * Edge labels (and step badges) go beside a segment of the new route: above a run along the flow
 * in a horizontal flow, beside one in a vertical flow, clear of nodes, strips, other labels and
 * every line. Branches out of a gateway keep theirs near the start.
 */
export function placeLabels(r: Routing, edges: SceneEdge[]): void {
  const { ctx, A } = r;
  const { model, horizontal } = ctx;
  const blocks: Box[] = [
    ...ctx.nodes.map((n) => grow(footOf(n), 3)),
    ...ctx.groups.flatMap((g) => (g.lane ? [g.lane.header] : g.labelBox.w > 0 ? [g.labelBox] : [])),
  ];
  // Band borders across the flow: a label astride one reads as belonging to neither band.
  const borders = r.all.flatMap((b) => (b.group || b.items.length ? [b.c0, b.c0 + b.size] : []));
  const segments = edges.flatMap((e) =>
    e.points.slice(1).map((q, i) => ({ e, p: e.points[i] ?? q, q })),
  );
  const fanOut = new Map<string, number>();
  for (const e of model.edges) fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
  for (const e of edges) {
    const me = model.edges.find((x) => x.id === e.id);
    if (!me || (!me.label && me.step === undefined) || e.points.length < 2) continue;
    if (e.labelBox || e.stepBox) continue;
    const block = e.label ?? textBlock(me.label ?? "", EDGE_LABEL, EDGE_LABEL_MAX);
    const stepW = me.step !== undefined ? STEP + 2 : 0;
    const w = Math.ceil((me.label ? block.width + 12 : 0) + stepW + (me.label && stepW ? 2 : 0));
    const h = Math.ceil(Math.max(me.label ? block.height + 6 : 0, stepW ? STEP : 0));
    const early = (fanOut.get(e.from) ?? 0) > 1;
    let best: { box: Box; score: number } | undefined;
    const consider = (box: Box, base: number) => {
      const c0 = box[A.c];
      const c1 = box[A.c] + box[A.cw];
      const m0 = box[A.m];
      const m1 = box[A.m] + box[A.mw];
      const astride =
        borders.some((v) => v > c0 - 3 && v < c1 + 3) || (m0 < r.endM + 3 && m1 > r.endM - 3);
      const score = base + (astride ? 30 : 0);
      if (best && best.score <= score) return;
      if (blocks.some((b) => hits(box, b))) return;
      if (segments.some((s) => cuts(s.p, s.q, grow(box, 1)))) return;
      best = { box, score };
    };
    e.points.slice(1).forEach((q, k) => {
      const p = e.points[k];
      if (!p) return;
      const flat = Math.abs(p.y - q.y) < 0.01;
      const len = flat ? Math.abs(q.x - p.x) : Math.abs(q.y - p.y);
      const along = flat === horizontal;
      // Shared with a sibling (the trunk of a split): the label would name the wrong branch.
      const shared = segments.some(
        (s) =>
          s.e !== e &&
          Math.abs(flat ? s.p.y - p.y : s.p.x - p.x) < 0.5 &&
          Math.abs(flat ? s.q.y - q.y : s.q.x - q.x) < 0.5 &&
          Math.min(
            flat ? Math.max(p.x, q.x) : Math.max(p.y, q.y),
            flat ? Math.max(s.p.x, s.q.x) : Math.max(s.p.y, s.q.y),
          ) -
            Math.max(
              flat ? Math.min(p.x, q.x) : Math.min(p.y, q.y),
              flat ? Math.min(s.p.x, s.q.x) : Math.min(s.p.y, s.q.y),
            ) >
            0.5,
      );
      const base = (along ? 0 : 12) + (shared ? 60 : 0) + k * (early ? 6 : 1);
      const need = (flat ? w : h) + 12;
      if (len < need && !(len >= (flat ? w : h) + 4)) return;
      const lo = flat ? Math.min(p.x, q.x) : Math.min(p.y, q.y);
      const hi = flat ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
      const size = flat ? w : h;
      const forward = flat ? q.x > p.x : q.y > p.y;
      const nearStart = forward ? lo + 8 : hi - 8 - size;
      const nearEnd = forward ? hi - 14 - size : lo + 14;
      const mid = (lo + hi) / 2 - size / 2;
      const spots = early
        ? [
            [nearStart, 0],
            [mid, 3],
            [nearEnd, 6],
          ]
        : [
            [mid, 0],
            [nearStart, 3],
            [nearEnd, 4],
          ];
      for (const [v = 0, s = 0] of spots) {
        if (v < lo + 2 || v + size > hi - 2) continue;
        if (flat) {
          consider({ x: v, y: p.y - 4 - h, w, h }, base + s);
          consider({ x: v, y: p.y + 4, w, h }, base + s + 4);
        } else {
          consider({ x: p.x + 6, y: v, w, h }, base + s);
          consider({ x: p.x - 6 - w, y: v, w, h }, base + s + 4);
        }
      }
    });
    if (!best) {
      // No clear spot: above the middle of the longest segment.
      const segs = e.points.slice(1).map((q, k) => [e.points[k] ?? q, q] as const);
      segs.sort(
        ([a, b], [c, d]) => Math.hypot(d.x - c.x, d.y - c.y) - Math.hypot(b.x - a.x, b.y - a.y),
      );
      const [p, q] = segs[0] ?? [e.points[0], e.points[1]];
      if (!p || !q) continue;
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      best = {
        box:
          Math.abs(p.y - q.y) < 0.01
            ? { x: mx - w / 2, y: my - 4 - h, w, h }
            : { x: mx + 6, y: my - h / 2, w, h },
        score: 0,
      };
    }
    const box = { x: round(best.box.x), y: round(best.box.y), w, h };
    blocks.push(grow(box, 2));
    if (me.step !== undefined)
      e.stepBox = { x: box.x, y: round(box.y + (h - STEP) / 2), w: STEP, h: STEP };
    if (me.label) {
      e.label = block;
      e.labelBox = {
        x: round(box.x + stepW + (stepW ? 2 : 0)),
        y: box.y,
        w: round(w - stepW - (stepW ? 2 : 0)),
        h,
      };
    }
  }
}
