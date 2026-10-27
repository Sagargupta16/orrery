// Mind maps: the root in the middle, its branches split between two halves, each half a tidy
// tree growing away from it, joined by curves in one color per branch.

import { textBlock } from "../../text.ts";
import type { SceneNode } from "../../types.ts";
import type { AfterLayout } from "../hooks.ts";
import { clearHeaders, type Frames, frames, refit, room, snapshot } from "./frames.ts";
import { routeRest } from "./links.ts";
import {
  LABEL_GAP,
  type LabelSize,
  labelBoxAt,
  labelSize,
  point,
  r,
  restoreEdges,
  setLabel,
  settle,
} from "./shared.ts";
import {
  depths,
  type Gap,
  grow,
  type Hierarchy,
  hierarchy,
  levels,
  type Measure,
  measure,
  moveTo,
  spread,
  type Tidy,
  tidy,
} from "./tidy.ts";

/**
 * First-level branch colors of a mind map, in order. Each keeps 3:1 against the light, dark,
 * paper and ink canvases, so a line in it reads in every theme and skin.
 */
const BRANCH_COLORS = ["#2f7fe0", "#d9480f", "#2f9e44", "#8b5cf6", "#0c8599", "#d6336c", "#b45309"];

/** The root's label size, and how much bigger its icon gets. */
const ROOT_TEXT = 16;
const ROOT_ICON = 4 / 3;

/** What the phases of a mind map share. */
interface Mind {
  ctx: AfterLayout;
  h: Hierarchy;
  root: string;
  m: Map<string, Measure>;
  sizes: Map<string, LabelSize>;
  f: Frames;
  t: Tidy;
  gap: Gap;
  cousin: number;
  drop: number;
}

/** Where each node went: across the flow, along it in growth coordinates, and on which side. */
interface Placed {
  cross: Map<string, number>;
  at: Map<string, number>;
  sideOf: Map<string, number>;
}

/**
 * Draws the root larger: a 16px label, and a bigger box (or icon) around it. Its parts keep their
 * arrangement: centered text in a shape, text after the icon in a card, label under an icon.
 */
function enlargeRoot(n: SceneNode, text: string, horizontal: boolean): void {
  if (n.bpmn) return;
  const label = text ? textBlock(text, ROOT_TEXT, 220, 600) : n.label;
  const b = n.box;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const note = n.noteBox;
  const textW = Math.max(label.width, note?.w ?? 0);
  const textH = label.height + (note ? note.h + 2 : 0);
  const stack = (left: number, top: number, middle: boolean) => {
    n.labelBox = {
      x: r(middle ? left + (textW - label.width) / 2 : left),
      y: r(top),
      w: r(label.width),
      h: r(label.height),
    };
    if (note)
      n.noteBox = {
        ...note,
        x: r(middle ? left + (textW - note.w) / 2 : left),
        y: r(top + label.height + 2),
      };
  };
  if (n.look === "icon" && n.iconBox) {
    const size = Math.round(n.iconBox.w * ROOT_ICON);
    const ic = { x: n.iconBox.x + n.iconBox.w / 2, y: n.iconBox.y + n.iconBox.h / 2 };
    const icon = { x: r(ic.x - size / 2), y: r(ic.y - size / 2), w: size, h: size };
    n.iconBox = icon;
    stack(ic.x - textW / 2, icon.y + size + 6, true);
    n.box = horizontal
      ? { ...icon }
      : {
          x: r(ic.x - Math.max(size, textW) / 2),
          y: icon.y,
          w: r(Math.max(size, textW)),
          h: r(size + 6 + textH),
        };
  } else if (n.look === "card") {
    const iconW = n.iconBox ? n.iconBox.w + 12 : 0;
    const w = Math.max(b.w, 20 + iconW + textW + 22);
    const h = Math.max(b.h + 12, Math.max(textH, n.iconBox?.h ?? 0) + 32);
    n.box = { x: r(cx - w / 2), y: r(cy - h / 2), w: r(w), h: r(h) };
    if (n.iconBox) n.iconBox = { ...n.iconBox, x: r(n.box.x + 20), y: r(cy - n.iconBox.h / 2) };
    stack(n.box.x + 20 + iconW, cy - textH / 2, false);
  } else {
    const iconW = n.iconBox ? 28 : 0;
    const w = Math.max(b.w + 24, textW + iconW + 48);
    const h = Math.max(b.h + 12, textH + 34);
    n.box = { x: r(cx - w / 2), y: r(cy - h / 2), w: r(w), h: r(h) };
    const left = cx - (textW + iconW) / 2;
    if (n.iconBox) n.iconBox = { ...n.iconBox, x: r(left), y: r(cy - n.iconBox.h / 2) };
    stack(left + iconW, cy - textH / 2, true);
  }
  n.label = label;
  if (n.badgeBox) {
    const anchor = n.look === "icon" && n.iconBox ? n.iconBox : n.box;
    const w = n.badgeBox.w;
    n.badgeBox = {
      ...n.badgeBox,
      x: r(Math.max(anchor.x + anchor.w - w / 2 - 2, anchor.x + anchor.w / 2 + 6)),
      y: r(anchor.y - 7),
    };
  }
}

/**
 * A two-sided map: the root in the middle, its branches split between the two halves in spec
 * order, each to the half with less in it so far, and each half a tidy tree growing away from the
 * root. Edges are curves, thick out of the root, one color per branch, without arrowheads.
 */
export function placeMindmap(ctx: AfterLayout): void {
  const { model, horizontal } = ctx;
  const s = model.spacing;
  // The renderers draw an edge's points as Bezier controls only when the routing is spline.
  ctx.routing = "spline";
  restoreEdges(ctx);
  const before = snapshot(ctx);
  const root = rootOf(ctx);
  if (!root) return;
  const h = hierarchy(ctx, true, root);
  // The stage story grows along the edges the map is drawn by, whichever way they are written.
  for (const n of ctx.nodes) {
    const via = h.via.get(n.id);
    if (via) n.via = via.id;
  }
  const rootNode = ctx.nodes.find((n) => n.id === root);
  const rootModel = model.nodes.find((n) => n.id === root);
  if (rootNode && rootModel) enlargeRoot(rootNode, rootModel.label, horizontal);

  const m = new Map(ctx.nodes.map((n) => [n.id, measure(n, horizontal)]));
  const sizes = new Map<string, LabelSize>();
  for (const [child, e] of h.via) {
    const size = labelSize(model.edges.find((x) => x.id === e.id));
    if (size) sizes.set(child, size);
  }
  const f = frames(ctx, before);
  const across = room(f, h, horizontal, 1);
  const sibling = Math.round(12 * s);
  const cousin = Math.round(20 * s);
  const drop = Math.round(48 * s);
  const gap: Gap = (d, a, b) => (d === 0 ? sibling : cousin) + across.between(a, b);
  const t = tidy(
    h.kids,
    (id) => {
      const frame = f.chain(id);
      return { ...(m.get(id)?.across ?? { lo: 0, hi: 0 }), loIn: frame, hiIn: frame };
    },
    gap,
  );
  const mind: Mind = { ctx, h, root, m, sizes, f, t, gap, cousin, drop };

  // Other trees (nodes no edge joins to the root) hang off it like branches, without a line.
  const branches = [...(h.kids.get(root) ?? []), ...h.roots.filter((id) => id !== root)];
  const placed = placeHalves(mind, splitHalves(mind, branches));
  for (const n of ctx.nodes) {
    const sign = placed.sideOf.get(n.id) ?? 1;
    moveTo(n, sign * (placed.at.get(n.id) ?? 0), placed.cross.get(n.id) ?? 0, horizontal);
  }
  refit(ctx, before);
  const colorOf = paintBranches(ctx, h, branches);
  drawBranches(mind, placed, colorOf);
  routeRest(ctx, h, true);
  clearHeaders(ctx);
  settle(ctx);
}

/** The first node no edge points into, or else the first node. */
function rootOf(ctx: AfterLayout): string | undefined {
  const known = new Set(ctx.nodes.map((n) => n.id));
  const into = new Set(
    ctx.model.edges.filter((e) => e.from !== e.to && known.has(e.from)).map((e) => e.to),
  );
  return ctx.nodes.find((n) => !into.has(n.id))?.id ?? ctx.nodes[0]?.id;
}

/** Branches in spec order, each to the half with less in it so far. */
function splitHalves(mind: Mind, branches: string[]): Map<number, string[]> {
  const { ctx, t, cousin } = mind;
  const model = ctx.model;
  const first = model.direction === "left" || model.direction === "up" ? -1 : 1;
  const halves = new Map<number, string[]>([
    [first, []],
    [-first, []],
  ]);
  const load = new Map<number, number>([
    [first, 0],
    [-first, 0],
  ]);
  for (const b of branches) {
    const c = t.contour(b);
    const span = Math.max(...c.map((x) => x.hi)) - Math.min(...c.map((x) => x.lo)) + cousin;
    const side = (load.get(first) ?? 0) <= (load.get(-first) ?? 0) ? first : -first;
    halves.get(side)?.push(b);
    load.set(side, (load.get(side) ?? 0) + span);
  }
  return halves;
}

/** Each half a tidy tree in levels growing away from the root. */
function placeHalves(mind: Mind, halves: Map<number, string[]>): Placed {
  const { ctx, h, root, m, sizes, f, t, gap, drop } = mind;
  const { model, horizontal } = ctx;
  const s = model.spacing;
  const cross = new Map<string, number>([[root, 0]]);
  const at = new Map<string, number>([[root, 0]]);
  const sideOf = new Map<string, number>();
  const rm = m.get(root);
  for (const [sign, list] of halves) {
    if (!list.length || !rm) continue;
    const pos = spread(
      list.map((b) => t.contour(b)),
      gap,
    );
    // The root sits across from the middle of its first and last branch on this side.
    const mid = ((pos[0] ?? 0) + (pos[pos.length - 1] ?? 0)) / 2;
    list.forEach((b, i) => {
      t.place(b, (pos[i] ?? 0) - mid, cross);
    });
    const depth = new Map<string, number>();
    const visit = (id: string, d: number) => {
      sideOf.set(id, sign);
      depth.set(id, d);
      for (const c of h.kids.get(id) ?? []) visit(c, d + 1);
    };
    for (const b of list) visit(b, 0);
    const fr = room(f, h, horizontal, sign);
    // A label on the curve into a node, and the frames the curve leaves and enters, widen the gap.
    const need = (id: string) => {
      const z = sizes.get(id);
      const label = z ? (horizontal ? z.w : z.h) + 24 : 0;
      const frame = fr.enter(id) + fr.leave(id);
      return frame ? Math.max(drop, label) + frame + LABEL_GAP : label;
    };
    const lv = levels(
      depths(ctx, (id) => depth.get(id)),
      m,
      sign,
      {
        start: grow(rm.body, sign).hi + Math.max(Math.round(64 * s), ...list.map(need)),
        align: "near",
        stem: () => 0,
        drop,
        need,
      },
    );
    for (const [id, u] of lv.at) at.set(id, u);
  }
  return { cross, at, sideOf };
}

/** One color per first-level branch, unless the spec colored the node or edge itself. */
function paintBranches(
  ctx: AfterLayout,
  h: Hierarchy,
  branches: string[],
): (id: string) => string | undefined {
  const branchOf = new Map<string, number>();
  const mark = (id: string, i: number) => {
    branchOf.set(id, i);
    for (const c of h.kids.get(id) ?? []) mark(c, i);
  };
  branches.forEach((b, i) => {
    mark(b, i);
  });
  const colorOf = (id: string) => {
    const i = branchOf.get(id);
    return i === undefined ? undefined : BRANCH_COLORS[i % BRANCH_COLORS.length];
  };
  for (const n of ctx.nodes)
    if (!ctx.model.nodes.find((x) => x.id === n.id)?.color) n.color = colorOf(n.id) ?? n.color;
  return colorOf;
}

/** A curve from each parent to each child, thick out of the root, its label on the midpoint. */
function drawBranches(
  mind: Mind,
  placed: Placed,
  colorOf: (id: string) => string | undefined,
): void {
  const { ctx, h, root, m, sizes } = mind;
  const { model, horizontal } = ctx;
  const { cross, at, sideOf } = placed;
  for (const [child, e] of h.via) {
    const parent = h.parent.get(child) ?? "";
    const pm = m.get(parent);
    const cm = m.get(child);
    const sign = sideOf.get(child) ?? 1;
    if (!pm || !cm) continue;
    const pu = (at.get(parent) ?? 0) + pm.half;
    const cu = (at.get(child) ?? 0) - cm.half;
    const pc = cross.get(parent) ?? 0;
    const cc = cross.get(child) ?? 0;
    const k = (cu - pu) / 2;
    const pts = [
      point(sign * pu, pc, horizontal),
      point(sign * (pu + k), pc, horizontal),
      point(sign * (cu - k), cc, horizontal),
      point(sign * cu, cc, horizontal),
    ];
    e.points = e.from === child ? pts.reverse() : pts;
    e.arrow = "none";
    const me = model.edges.find((x) => x.id === e.id);
    if (parent === root && e.line === "solid") e.line = "thick";
    if (!me?.color) e.color = colorOf(child) ?? e.color;
    const z = sizes.get(child);
    // On the curve's midpoint: halfway along the flow and across it.
    if (z) setLabel(e, me, z, labelBoxAt(sign * ((pu + cu) / 2), (pc + cc) / 2, z, horizontal));
  }
}
