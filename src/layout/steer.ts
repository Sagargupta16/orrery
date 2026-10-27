// Edge ends drawn after ELK: what each end attaches to, the plain orthogonal connector between two
// ends, steering an end off an overlay's header, and straightening a small jog next to an end.

import type { Box, Point, SceneEdge } from "../types.ts";
import type { Placed } from "./context.ts";
import { exits } from "./elbows.ts";
import { round, union } from "./geometry.ts";

export interface Attach {
  side: Box;
  full: Box;
  /** An overlay's header (tile and label) on its border: a line ends beside it, not under it. */
  avoid?: Box;
  /** What is drawn at a node end (icon, label, note), for the detour router. */
  parts?: Box[];
}

// Side: what a horizontal line meets (the icon of an icon node, at its center line: in a
// vertical flow the text is under the icon, so the strip beside the icon is free). Full: the
// node with its label and note, so a vertical line leaves below the text instead of through it.
export function attachBox(ctx: Pick<Placed, "nodes" | "groups">, id: string): Attach | undefined {
  const { nodes, groups } = ctx;
  const nd = nodes.find((x) => x.id === id);
  if (nd) {
    const icon = nd.look === "icon" && nd.iconBox ? nd.iconBox : undefined;
    const side = icon ?? nd.box;
    const drawn = [icon ?? nd.box, nd.labelBox, nd.noteBox].filter(
      (b): b is Box => !!b && b.w > 0 && b.h > 0,
    );
    const parts = [nd.box, nd.iconBox, nd.labelBox, nd.noteBox].filter((b): b is Box => !!b);
    return { side, full: union(parts), parts: drawn };
  }
  const g = groups.find((x) => x.id === id);
  if (!g) return undefined;
  const head = g.overlay ? [g.iconBox, g.labelBox].filter((b): b is Box => !!b && b.w > 0) : [];
  return { side: g.box, full: g.box, avoid: head.length ? union(head) : undefined };
}

/**
 * Slides a free edge's end that would sit under an overlay's header along the border to just
 * past the header, on the side of the edge's other end. A straight line becomes an elbow.
 */
export function steer(
  points: Point[],
  end: "from" | "to",
  avoid: Box | undefined,
  border: Box,
): Point[] {
  if (!avoid) return points;
  // End first: pts[0] is the end that may sit under the header.
  const pts = (end === "to" ? [...points].reverse() : [...points]).map((q) => ({ ...q }));
  const [e, p] = pts;
  const far = pts.at(-1);
  if (!e || !p || !far || pts.length < 2) return points;
  const gap = 12;
  const under =
    e.x >= avoid.x - gap &&
    e.x <= avoid.x + avoid.w + gap &&
    e.y >= avoid.y - gap &&
    e.y <= avoid.y + avoid.h + gap;
  if (!under) return points;
  const vertical = Math.abs(p.x - e.x) < 0.5;
  const k = vertical ? "x" : "y";
  const j = vertical ? "y" : "x";
  // Clear of the header by more than an arrowhead, so the head does not read as touching the text.
  const clear = 20;
  const lo = (vertical ? avoid.x : avoid.y) - clear;
  const hi = (vertical ? avoid.x + avoid.w : avoid.y + avoid.h) + clear;
  const min = (vertical ? border.x : border.y) + gap;
  const max = (vertical ? border.x + border.w : border.y + border.h) - gap;
  const to = (far[k] <= (lo + hi) / 2 ? [lo, hi] : [hi, lo])
    .map(round)
    .find((v) => v >= min && v <= max);
  if (to === undefined) return points;
  let out: Point[] = pts;
  if (pts.length === 2) {
    const mid = round((e[j] + far[j]) / 2);
    const at = (a: number, b: number): Point => (vertical ? { x: a, y: b } : { x: b, y: a });
    out = [at(to, e[j]), at(to, mid), at(far[k], mid), far];
  } else {
    e[k] = to;
    p[k] = to;
  }
  return end === "to" ? out.reverse() : out;
}

/**
 * An orthogonal connector between two placed nodes or groups, for edges the layout ignored.
 * `shift` moves the elbow off the midpoint so unrelated connectors do not share a trunk. An end
 * inside the other leaves by its side nearest the border with room for the `label`, and runs
 * straight out to it.
 */
export function freeRoute(
  from: Attach,
  to: Attach,
  shift: number,
  label?: { w: number; h: number },
): Point[] {
  const [out] = exits(from, to, label);
  if (out) return out;
  const sideBySide = from.full.x + from.full.w <= to.full.x || to.full.x + to.full.w <= from.full.x;
  const a = sideBySide ? from.side : from.full;
  const b = sideBySide ? to.side : to.full;
  const ac = { x: from.side.x + from.side.w / 2, y: a.y + a.h / 2 };
  const bc = { x: to.side.x + to.side.w / 2, y: b.y + b.h / 2 };
  if (sideBySide) {
    const right = a.x + a.w <= b.x;
    const sx = right ? a.x + a.w : a.x;
    const ex = right ? b.x : b.x + b.w;
    if (Math.abs(ac.y - bc.y) < 1)
      return [
        { x: sx, y: ac.y },
        { x: ex, y: ac.y },
      ];
    const mx = round((sx + ex) / 2 + shift);
    return [
      { x: sx, y: ac.y },
      { x: mx, y: ac.y },
      { x: mx, y: bc.y },
      { x: ex, y: bc.y },
    ];
  }
  const down = a.y + a.h <= b.y;
  const sy = down ? a.y + a.h : a.y;
  const ey = down ? b.y : b.y + b.h;
  if (Math.abs(ac.x - bc.x) < 1)
    return [
      { x: ac.x, y: sy },
      { x: ac.x, y: ey },
    ];
  const my = round((sy + ey) / 2 + shift);
  return [
    { x: ac.x, y: sy },
    { x: ac.x, y: my },
    { x: bc.x, y: my },
    { x: bc.x, y: ey },
  ];
}

/**
 * Removes a jog of up to 6px next to an edge end, or the half-pixel skew ELK leaves where an edge
 * crosses a group border, by sliding the end along its node side. Only when the end stays on
 * that side and clear of the other edge ends there.
 */
export function straightenEnd(
  e: SceneEdge,
  end: "from" | "to",
  sides: Box[] | undefined,
  edges: SceneEdge[],
): void {
  const n = e.points.length;
  const at = (i: number) => e.points[end === "to" ? n - 1 - i : i];
  const E = at(0);
  const P = at(1);
  const Q = at(2);
  if (!E || !P || !sides) return;
  const vertical = Math.abs(P.y - E.y) > Math.abs(P.x - E.x);
  const k = vertical ? "x" : "y";
  const a = vertical ? "y" : "x";
  let target = P[k];
  let moveP = false;
  if (Q) {
    const lateral = Math.abs(Q[k] - P[k]);
    const along = Math.abs(Q[a] - P[a]);
    const jog = along < 0.01 && lateral > 0.01 && lateral < 6 && n >= 4;
    const skew = lateral > 0.01 && lateral <= 1 && along > lateral;
    if (jog || skew) [target, moveP] = [Q[k], true];
  }
  if (Math.abs(target - E[k]) < 0.01 || Math.abs(target - E[k]) > 6) return;
  const side = sides.find((b) => {
    const edge = vertical ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
    const [lo, hi] = vertical ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
    return edge.some((v) => Math.abs(v - E[a]) < 0.5) && E[k] >= lo - 0.5 && E[k] <= hi + 0.5;
  });
  if (!side) return;
  const [lo, hi] = vertical ? [side.x, side.x + side.w] : [side.y, side.y + side.h];
  if (target < lo + 2 || target > hi - 2) return;
  const others = edges.flatMap((o) =>
    o === e ? [] : [o.points[0], o.points[o.points.length - 1]],
  );
  const near = (p: Point | undefined, q: Point, d: number) =>
    !!p && Math.abs(p.x - q.x) < d && Math.abs(p.y - q.y) < d;
  const moved = { ...E, [k]: target };
  if (others.some((p) => near(p, E, 0.5) || near(p, moved, 4))) return;
  const iE = end === "to" ? n - 1 : 0;
  e.points[iE] = moved;
  if (moveP) e.points[end === "to" ? n - 2 : 1] = { ...P, [k]: target };
}
