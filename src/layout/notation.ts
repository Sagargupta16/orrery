// Geometry for nodes drawn in notation: BPMN 2.0 elements (bpmn:) and the flowchart and state
// shapes (parallelogram, subroutine, trapezoid, delay, initial, final).

import { textBlock } from "../text.ts";
import {
  type Box,
  type BpmnKind,
  isBpmnEvent,
  isBpmnGateway,
  type ModelNode,
  type Point,
  type SceneEdge,
  type SceneNode,
  type ShapeKind,
} from "../types.ts";
import type { LayoutHooks, NodeGeom, PlaceContext } from "./hooks.ts";

// Text sizes match SIZES in layout.ts (nodeLabel, note, shapeLabelMax).
const LABEL = 13;
const NOTE = 11.5;
const SHAPE_MAX = 156;
/** Labels under an event or gateway wrap about as narrow as bpmn.io's. */
const OUTSIDE_MAX = 120;
const TASK_MAX = 112;
/** The label sits 6px under the symbol, ELK's labelNode spacing. */
const GAP = 6;
const ICON = 20;

/**
 * Symbols with their label outside, below: BPMN events 36px and gateways 50px as the spec's
 * figures and bpmn.io draw them, a data object 36x50 page and a 50px data store, and the UML
 * initial pseudostate and final state.
 */
export function symbolSize(n: { bpmn?: BpmnKind; shape: ShapeKind }): { w: number; h: number } {
  const k = n.bpmn;
  if (k) {
    if (isBpmnEvent(k)) return { w: 36, h: 36 };
    if (isBpmnGateway(k)) return { w: 50, h: 50 };
    if (k === "data-object") return { w: 36, h: 50 };
    if (k === "data-store") return { w: 50, h: 50 };
    return { w: 0, h: 0 };
  }
  if (n.shape === "initial") return { w: 22, h: 22 };
  if (n.shape === "final") return { w: 26, h: 26 };
  return { w: 0, h: 0 };
}

/** The symbol inside a node's box: its top center (a vertical flow stacks the label under it). */
export function symbolBox(nd: { bpmn?: BpmnKind; shape: ShapeKind; box: Box }): Box | undefined {
  const s = symbolSize(nd);
  if (!s.w) return undefined;
  const b = nd.box;
  return { x: b.x + (b.w - s.w) / 2, y: b.y, w: s.w, h: s.h };
}

/** Collapsed activities carry the [+] marker at the bottom center. */
export const hasSubMarker = (k: BpmnKind | undefined) =>
  k === "subprocess" || k === "call-activity";

/** Task types with a marker in the top-left corner. */
export const hasTypeMarker = (k: BpmnKind | undefined) =>
  !!k && k.endsWith("-task") && k !== "task";

/** A state mark keeps no label unless the spec gave one (the parser falls back to the id). */
const ownLabel = (n: ModelNode) =>
  (n.shape === "initial" || n.shape === "final") && !n.bpmn && n.label === n.id ? "" : n.label;

/** The size ELK lays out for a notation node, or undefined for the default shape geometry. */
export function notationGeometry(n: ModelNode, horizontal: boolean): NodeGeom | undefined {
  const sym = symbolSize(n);
  if (sym.w) return outsideGeometry(n, sym, horizontal);
  if (n.bpmn) return activityGeometry(n);
  return flowchartGeometry(n);
}

function outsideGeometry(n: ModelNode, sym: { w: number; h: number }, horizontal: boolean) {
  const label = textBlock(ownLabel(n), LABEL, OUTSIDE_MAX);
  const note = n.note ? textBlock(n.note, NOTE, OUTSIDE_MAX) : undefined;
  const { w: textW, h: textH } = outsideText(label.width, label.height, note, !!n.icon);
  if (!textW) return { w: sym.w, h: sym.h, label, note };
  // ELK reserves an outside label below the symbol in a horizontal flow; a vertical flow leaves
  // the bottom side to the edges, so the label is part of the node there, as on icon nodes.
  // ELK drops a label without text, so a note alone is stacked the vertical way too.
  if (horizontal && label.lines.length)
    return {
      w: sym.w,
      h: sym.h,
      label,
      note,
      outside: { w: Math.ceil(textW), h: Math.ceil(textH) },
    };
  return {
    w: Math.ceil(Math.max(sym.w, textW)),
    h: Math.ceil(sym.h + GAP + textH),
    label,
    note,
  };
}

/** Size of the text under a symbol: an icon goes inline before the label. */
function outsideText(
  labelW: number,
  labelH: number,
  note: { width: number; height: number } | undefined,
  icon: boolean,
): { w: number; h: number } {
  const rowW = labelW + (icon ? ICON + (labelW ? 6 : 0) : 0);
  const rowH = Math.max(labelH, icon ? ICON : 0);
  const w = Math.max(rowW, note?.width ?? 0);
  const h = rowH + (note ? (rowH ? 2 : 0) + note.height : 0);
  return { w, h };
}

function activityGeometry(n: ModelNode): NodeGeom {
  const label = textBlock(n.label, LABEL, TASK_MAX, 600);
  const note = n.note ? textBlock(n.note, NOTE, TASK_MAX) : undefined;
  const textW = Math.max(label.width, note?.width ?? 0);
  const textH = label.height + (note ? note.height + 2 : 0);
  const icon = n.icon ? ICON + 8 : 0;
  // A typed task keeps its label below the corner marker, a collapsed one above the [+].
  const room = hasTypeMarker(n.bpmn) || hasSubMarker(n.bpmn) ? 50 : 30;
  return {
    w: Math.ceil(Math.max(100, textW + icon + 28)),
    h: Math.ceil(Math.max(80, textH + room)),
    label,
    note,
  };
}

/** Width the flowchart outlines take from the text: slanted, barred or rounded sides. */
function flowchartGeometry(n: ModelNode): NodeGeom | undefined {
  const extra = (h: number): number | undefined => {
    switch (n.shape) {
      case "parallelogram":
      case "trapezoid":
        return slant(h) + 8;
      case "subroutine":
        return 2 * BAR;
      case "delay":
        return h / 4 + 4;
      default:
        return undefined;
    }
  };
  if (extra(0) === undefined) return undefined;
  const label = textBlock(n.label, LABEL, SHAPE_MAX, 600);
  const note = n.note ? textBlock(n.note, NOTE, SHAPE_MAX) : undefined;
  const textW = Math.max(label.width, note?.width ?? 0);
  const textH = label.height + (note ? note.height + 2 : 0);
  const icon = n.icon ? 28 : 0;
  const h = Math.ceil(Math.max(52, textH + 26));
  const w = Math.ceil(Math.max(108, textW + icon + 32) + (extra(h) ?? 0));
  return { w, h, label, note };
}

/** Horizontal run of a parallelogram's or trapezoid's slanted side (draw.io's fixed size). */
export const slant = (h: number) => Math.round(Math.min(18, h * 0.3));
/** Inset of a subroutine's double side bars. */
export const BAR = 10;

/** Moves a notation node's label, note and icon once ELK placed the node. */
export function placeNotation(node: SceneNode, n: ModelNode, g: NodeGeom, ctx: PlaceContext): void {
  const sym = symbolBox(node);
  if (sym) placeOutside(node, n, g, sym, ctx);
  else if (n.bpmn) placeInside(node, n, g);
}

function placeOutside(node: SceneNode, n: ModelNode, g: NodeGeom, sym: Box, ctx: PlaceContext) {
  const label = g.label;
  const note = g.note;
  const { w: textW } = outsideText(label.width, label.height, note, !!n.icon);
  const cx = sym.x + sym.w / 2;
  const top = ctx.label && g.outside ? ctx.label.y : sym.y + sym.h + GAP;
  const rowH = Math.max(label.height, n.icon ? ICON : 0);
  const rowW = label.width + (n.icon ? ICON + (label.width ? 6 : 0) : 0);
  const left = cx - rowW / 2;
  if (n.icon) node.iconBox = { x: r(left), y: r(top + (rowH - ICON) / 2), w: ICON, h: ICON };
  const lx = n.icon ? left + ICON + (label.width ? 6 : 0) : cx - label.width / 2;
  node.labelBox = {
    x: r(lx),
    y: r(top + (rowH - label.height) / 2),
    w: r(label.width),
    h: r(label.height),
  };
  if (note)
    node.noteBox = {
      x: r(cx - note.width / 2),
      y: r(top + rowH + (rowH ? 2 : 0)),
      w: r(note.width),
      h: r(note.height),
    };
  if (!textW) node.labelBox = { x: r(cx), y: r(sym.y + sym.h), w: 0, h: 0 };
}

function placeInside(node: SceneNode, n: ModelNode, g: NodeGeom) {
  const b = node.box;
  const textH = g.label.height + (g.note ? g.note.height + 2 : 0);
  const textW = Math.max(g.label.width, g.note?.width ?? 0);
  const iconW = n.icon ? ICON + 8 : 0;
  const startX = b.x + (b.w - (textW + iconW)) / 2;
  let ty = b.y + (b.h - textH) / 2;
  // Keep clear of the [+] marker, 4px above it.
  if (hasSubMarker(n.bpmn)) ty = Math.min(ty, b.y + b.h - 22 - textH);
  if (n.icon) node.iconBox = { x: r(startX), y: r(ty + (textH - ICON) / 2), w: ICON, h: ICON };
  const tx = startX + iconW;
  node.labelBox = {
    x: r(tx + (textW - g.label.width) / 2),
    y: r(ty),
    w: r(g.label.width),
    h: r(g.label.height),
  };
  if (g.note)
    node.noteBox = {
      x: r(tx + (textW - g.note.width) / 2),
      y: r(ty + g.label.height + 2),
      w: r(g.note.width),
      h: r(g.note.height),
    };
}

const r = (v: number) => Math.round(v * 100) / 100;

/**
 * ELK ends a line on the bounding box, which meets a diamond or a circle at four points and a
 * slanted or wavy side nowhere; such an end would stop short in the air. It moves along its last
 * segment onto the outline. An end elsewhere on the box (under a label in a vertical flow) stays.
 * `shapes` adds the decision, connector and document shapes, outside architecture diagrams.
 */
export function fitNotationEnds(nodes: SceneNode[], edges: SceneEdge[], shapes = false): void {
  const outlines = new Map<string, Outline>();
  for (const nd of nodes) {
    const o = outlineOf(nd, shapes);
    if (o) outlines.set(nd.id, o);
  }
  if (!outlines.size) return;
  for (const e of edges) {
    const to = outlines.get(e.to);
    const from = outlines.get(e.from);
    if (to) fitEnd(e.points, e.points.length - 1, e.points.length - 2, to);
    if (from) fitEnd(e.points, 0, 1, from);
  }
}

/** The notation pass layout() runs after the other hooks. */
export const notationHooks: LayoutHooks = {
  after: (ctx) => fitNotationEnds(ctx.nodes, ctx.edges, ctx.model.kind !== "architecture"),
};

interface Outline {
  box: Box;
  inside(x: number, y: number): boolean;
}

function outlineOf(nd: SceneNode, shapes: boolean): Outline | undefined {
  const k = nd.bpmn;
  const sym = symbolBox(nd);
  if (sym && (!k || isBpmnEvent(k))) return { box: sym, inside: ellipse(sym) };
  if (sym && isBpmnGateway(k)) return { box: sym, inside: rhombus(sym) };
  if (k || nd.look !== "shape") return undefined;
  const b = nd.box;
  const t = (y: number) => (y - b.y) / b.h;
  const rows = (lo: (y: number) => number, hi: (y: number) => number) => (x: number, y: number) =>
    y >= b.y && y <= b.y + b.h && x >= lo(y) && x <= hi(y);
  switch (nd.shape) {
    case "parallelogram": {
      const s = slant(b.h);
      return {
        box: b,
        inside: rows(
          (y) => b.x + s * (1 - t(y)),
          (y) => b.x + b.w - s * t(y),
        ),
      };
    }
    case "trapezoid": {
      const s = slant(b.h);
      return {
        box: b,
        inside: rows(
          (y) => b.x + s * t(y),
          (y) => b.x + b.w - s * t(y),
        ),
      };
    }
    case "delay": {
      const rx = Math.min(b.h / 2, b.w / 2);
      const round = ellipse({ x: b.x + b.w - 2 * rx, y: b.y, w: 2 * rx, h: b.h });
      return {
        box: b,
        inside: (x, y) =>
          y >= b.y && y <= b.y + b.h && x >= b.x && (x <= b.x + b.w - rx || round(x, y)),
      };
    }
    default:
      break;
  }
  if (!shapes) return undefined;
  if (nd.shape === "diamond") return { box: b, inside: rhombus(b) };
  if (nd.shape === "circle") return { box: b, inside: ellipse(b) };
  if (nd.shape === "document") {
    // svg.ts's wave: two quadratics 10px above the bottom, 5px up on the right, down on the left.
    const base = b.y + b.h - 10;
    const wave = (x: number) => {
      const u = (b.x + b.w - x) / (b.w / 2);
      return u <= 1 ? base - 20 * u * (1 - u) : base + 20 * (u - 1) * (2 - u);
    };
    return {
      box: b,
      inside: (x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= wave(x),
    };
  }
  return undefined;
}

const ellipse = (b: Box) => (x: number, y: number) =>
  ((x - b.x - b.w / 2) / (b.w / 2)) ** 2 + ((y - b.y - b.h / 2) / (b.h / 2)) ** 2 <= 1;
const rhombus = (b: Box) => (x: number, y: number) =>
  Math.abs(x - b.x - b.w / 2) / (b.w / 2) + Math.abs(y - b.y - b.h / 2) / (b.h / 2) <= 1;

function fitEnd(pts: Point[], i: number, j: number, o: Outline): void {
  const E = pts[i];
  const Q = pts[j];
  const b = o.box;
  if (!E || !Q || i === j) return;
  const near = (v: number, w: number) => Math.abs(v - w) < 0.6;
  const within = (v: number, lo: number, len: number) => v >= lo - 0.6 && v <= lo + len + 0.6;
  const side =
    ((near(E.x, b.x) || near(E.x, b.x + b.w)) && within(E.y, b.y, b.h)) ||
    ((near(E.y, b.y) || near(E.y, b.y + b.h)) && within(E.x, b.x, b.w));
  if (!side || o.inside(E.x, E.y)) return;
  const d = Math.hypot(E.x - Q.x, E.y - Q.y);
  if (!d) return;
  const [ux, uy] = [(E.x - Q.x) / d, (E.y - Q.y) / d];
  // Closest approach to the center along the line; a line that misses the outline stays.
  const far = (b.x + b.w / 2 - E.x) * ux + (b.y + b.h / 2 - E.y) * uy;
  if (far <= 0 || !o.inside(E.x + ux * far, E.y + uy * far)) return;
  let lo = 0;
  let hi = far;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (o.inside(E.x + ux * mid, E.y + uy * mid)) hi = mid;
    else lo = mid;
  }
  pts[i] = { x: r(E.x + ux * hi), y: r(E.y + uy * hi) };
}
