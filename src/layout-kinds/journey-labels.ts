// Journey cards as scene nodes, and edge labels beside (or on) the lines between them.

import { SIZES } from "../layout.ts";
import { measure } from "../text.ts";
import type { Box, Point, SceneEdge, SceneNode } from "../types.ts";
import { ARROW, type Grid, round } from "./journey-grid.ts";

interface Segment {
  p: Point;
  q: Point;
  last: boolean;
  first: boolean;
}

/** A spot for a label: beside a segment, or on the segment `on` (the line runs through the chip). */
interface Candidate {
  box: Box;
  on?: Segment;
}

/** What a label must stay clear of: the grid's bounds, cards and headers, labels placed, lines. */
interface Clear {
  grid: Grid;
  gridBottom: number;
  edges: SceneEdge[];
  blocked: Box[];
  taken: Box[];
}

const len = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);

const hits = (a: Box, b: Box, m = 0) =>
  a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

const crossesBox = (p: Point, q: Point, b: Box) => {
  const x0 = Math.min(p.x, q.x);
  const x1 = Math.max(p.x, q.x);
  const y0 = Math.min(p.y, q.y);
  const y1 = Math.max(p.y, q.y);
  return x0 < b.x + b.w && b.x < x1 + 0.01 && y0 < b.y + b.h && b.y < y1 + 0.01;
};

/** A scene node per card. */
export function journeyNodes(grid: Grid): SceneNode[] {
  return grid.cards.map((c) => {
    const n = c.node;
    const b = c.box;
    const textH = c.label.height + (c.note ? c.note.height + 2 : 0);
    const tx = b.x + 12 + (c.S ? c.S + 10 : 0);
    const ty = b.y + (b.h - textH) / 2;
    const node: SceneNode = {
      id: n.id,
      // Every step is a card: icon on the left, label and note beside it.
      look: "card",
      shape: n.shape,
      box: b,
      icon: n.icon,
      label: c.label,
      labelBox: {
        x: round(tx),
        y: round(ty),
        w: round(c.label.width),
        h: round(c.label.height),
      },
      note: c.note,
      color: n.color,
      badge: n.badge,
      url: n.url,
      parent: n.parent,
      ...(n.stage !== undefined ? { stage: n.stage } : {}),
      ...(n.score !== undefined ? { score: n.score } : {}),
    };
    if (c.S) node.iconBox = { x: round(b.x + 12), y: round(b.y + (b.h - c.S) / 2), w: c.S, h: c.S };
    if (c.note)
      node.noteBox = {
        x: round(tx),
        y: round(ty + c.label.height + 2),
        w: round(c.note.width),
        h: round(c.note.height),
      };
    if (n.badge) {
      // The pill on the card's top-right corner, as layout() places it.
      const w = round(Math.max(18, measure(n.badge, 10, 600) + 10));
      node.badgeBox = {
        x: round(Math.max(b.x + b.w - w / 2 - 2, b.x + b.w / 2 + 6)),
        y: round(b.y - 7),
        w,
        h: 16,
      };
    }
    return node;
  });
}

/** Each edge's label (and step badge) at the first clear spot, or the first spot when none is. */
export function placeEdgeLabels(
  grid: Grid,
  edges: SceneEdge[],
  blocked: Box[],
  gridBottom: number,
): void {
  const clear: Clear = { grid, gridBottom, edges, blocked, taken: [] };
  for (const edge of edges) {
    const u = grid.unit.get(edge.id);
    if (!u) continue;
    const { w, h } = u;
    const candidates = candidatesOf(edge.points, w, h);
    const chosen = candidates.find((c) => fits(clear, edge, c)) ?? candidates[0];
    if (!chosen) continue;
    const box = {
      x: round(chosen.box.x),
      y: round(chosen.box.y),
      w: chosen.box.w,
      h: chosen.box.h,
    };
    clear.taken.push(box);
    if (edge.step !== undefined)
      edge.stepBox = {
        x: box.x,
        y: round(box.y + (box.h - SIZES.step) / 2),
        w: SIZES.step,
        h: SIZES.step,
      };
    if (u.block) {
      edge.label = u.block;
      edge.labelBox = {
        x: round(box.x + u.stepW + (u.stepW ? 2 : 0)),
        y: box.y,
        w: round(w - u.stepW - (u.stepW ? 2 : 0)),
        h,
      };
    }
  }
}

/** Spots on each segment, longest first, at its middle and a third either way. */
function candidatesOf(pts: Point[], w: number, h: number): Candidate[] {
  const segs = pts
    .slice(1)
    .map((q, i) => ({ p: pts[i] ?? q, q, last: i === pts.length - 2, first: i === 0 }))
    .sort((m, o) => len(o.p, o.q) - len(m.p, m.q));
  const candidates: Candidate[] = [];
  for (const sg of segs) {
    const flat = Math.abs(sg.p.y - sg.q.y) < 0.5;
    for (const f of [0.5, 0.35, 0.65]) {
      const mx = sg.p.x + (sg.q.x - sg.p.x) * f;
      const my = sg.p.y + (sg.q.y - sg.p.y) * f;
      const on = { x: mx - w / 2, y: my - h / 2, w, h };
      // As classic labels sit: above a horizontal run, right of a vertical one; else on the line.
      if (flat) candidates.push({ box: { ...on, y: my - h - 3 } }, { box: { ...on, y: my + 3 } });
      else candidates.push({ box: { ...on, x: mx + 4 } }, { box: { ...on, x: mx - 4 - w } });
      candidates.push({ box: on, on: sg });
    }
  }
  return candidates;
}

function fits(k: Clear, edge: SceneEdge, c: Candidate): boolean {
  const { gridX, gridY, G, gridRight } = k.grid;
  const { gridBottom, blocked, taken, edges } = k;
  const b = c.box;
  if (b.x < gridX || b.y < gridY - G || b.x + b.w > gridRight + G || b.y + b.h > gridBottom + G)
    return false;
  if (blocked.some((o) => hits(b, o, 3))) return false;
  if (taken.some((o) => hits(b, o, 2))) return false;
  // No line runs through it or along its edge (DG212), but the one segment it sits on.
  const room = { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
  for (const other of edges) {
    const op = other.points;
    for (let i = 1; i < op.length; i++) {
      const p = op[i - 1];
      const q = op[i];
      if (!p || !q || (other === edge && c.on && p === c.on.p && q === c.on.q)) continue;
      if (crossesBox(p, q, room)) return false;
    }
  }
  if (c.on) {
    // The line shows on both sides of the chip and the arrowhead stays clear of it.
    const { p, q, last, first } = c.on;
    const flat = Math.abs(p.y - q.y) < 0.5;
    const [lo, hi] = flat
      ? [Math.min(p.x, q.x), Math.max(p.x, q.x)]
      : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
    const [b0, b1] = flat ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
    const toward = (end: Point) => (flat ? end.x : end.y);
    const headAt = (end: Point) =>
      (last && end === q && (edge.arrow === "end" || edge.arrow === "both")) ||
      (first && end === p && (edge.arrow === "start" || edge.arrow === "both"));
    const need = (end: Point) => (headAt(end) ? ARROW + 4 : 4);
    const ends = [p, q].map((end) => ({ v: toward(end), need: need(end) }));
    const loEnd = ends.find((x) => Math.abs(x.v - lo) < 0.01) ?? { need: 4 };
    const hiEnd = ends.find((x) => Math.abs(x.v - hi) < 0.01) ?? { need: 4 };
    if (b0 < lo + loEnd.need || b1 > hi - hiEnd.need) return false;
  }
  return true;
}
