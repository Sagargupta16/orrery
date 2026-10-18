// Drawing for notation: BPMN 2.0 elements, flowchart and state shapes, and the markers at the
// start of message, default and conditional flows. Every function returns SVG elements without
// a fill or stroke of their own unless a marker needs one, so the caller's <g> paints them.

import { BAR, hasSubMarker, slant, symbolBox, symbolSize } from "../notation.ts";
import {
  type Box,
  type BpmnKind,
  isBpmnEvent,
  isBpmnGateway,
  type Point,
  type SceneEdge,
  type SceneNode,
  type ShapeKind,
} from "../types.ts";

const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};
const P = (x: number, y: number) => `${n(x)} ${n(y)}`;
const circle = (cx: number, cy: number, r: number, extra = "") =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"${extra}/>`;
const poly = (pts: [number, number][], extra = "") =>
  `<path d="M${pts.map(([x, y]) => P(x, y)).join(" L")} Z"${extra}/>`;

/** Outline of a flowchart or state shape, or undefined for the shapes svg.ts draws itself. */
export function shapeOutline(shape: ShapeKind, b: Box): string | undefined {
  const { x, y, w, h } = b;
  switch (shape) {
    case "parallelogram": {
      const k = slant(h);
      return `<path d="M${P(x + k, y)} H${n(x + w)} L${P(x + w - k, y + h)} H${n(x)} Z"/>`;
    }
    case "trapezoid": {
      // Manual operation (ISO 5807): the wide side on top.
      const k = slant(h);
      return `<path d="M${P(x, y)} H${n(x + w)} L${P(x + w - k, y + h)} H${n(x + k)} Z"/>`;
    }
    case "subroutine":
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="4"/><path d="M${P(x + BAR, y)} V${n(y + h)} M${P(x + w - BAR, y)} V${n(y + h)}" fill="none"/>`;
    case "delay": {
      const r = Math.min(h / 2, w / 2);
      return `<path d="M${P(x, y)} H${n(x + w - r)} A${n(r)} ${n(h / 2)} 0 0 1 ${P(x + w - r, y + h)} H${n(x)} Z"/>`;
    }
    case "initial":
    case "final": {
      // The symbol sits at the top of the box when a vertical flow stacks a label under it.
      const r = symbolSize({ shape }).w / 2;
      return circle(x + w / 2, y + r, r);
    }
    default:
      return undefined;
  }
}

/** Outline of a BPMN element (nd.bpmn), or undefined to draw nd.shape. */
export function notationShape(nd: SceneNode): string | undefined {
  const k = nd.bpmn;
  if (!k) return undefined;
  const s = symbolBox(nd);
  if (!s) {
    const b = nd.box;
    return `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="10"/>`;
  }
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  if (isBpmnEvent(k)) {
    const ring = circle(cx, cy, s.w / 2);
    // Intermediate events are a double ring, 3px apart.
    return k.startsWith("intermediate") ? ring + circle(cx, cy, s.w / 2 - 3, ` fill="none"`) : ring;
  }
  if (isBpmnGateway(k))
    return poly([
      [cx, s.y],
      [s.x + s.w, cy],
      [cx, s.y + s.h],
      [s.x, cy],
    ]);
  const { x, y, w, h } = s;
  if (k === "data-object") {
    const f = 10;
    return `<path d="M${P(x, y)} H${n(x + w - f)} L${P(x + w, y + f)} V${n(y + h)} H${n(x)} Z"/><path d="M${P(x + w - f, y)} V${n(y + f)} H${n(x + w)}" fill="none"/>`;
  }
  // Data store: a cylinder with two more rims under the lid, as bpmn.io and draw.io draw it.
  const ry = 6;
  const rims = [0, 4, 8]
    .map((d) => `M${P(x, y + ry + d)} A${n(w / 2)} ${ry} 0 0 0 ${P(x + w, y + ry + d)}`)
    .join(" ");
  return `<path d="M${P(x, y + ry)} A${n(w / 2)} ${ry} 0 0 1 ${P(x + w, y + ry)} V${n(y + h - ry)} A${n(w / 2)} ${ry} 0 0 1 ${P(x, y + h - ry)} Z"/><path d="${rims}" fill="none"/>`;
}

/** Markers inside the outline: a gateway's X, a task's type, an event's trigger. */
export function notationMarks(nd: SceneNode, color: string, width: number): string {
  const body = marks(nd, color, width);
  if (!body) return "";
  // Opaque on purpose: the stage frame group strokes at a low alpha the markers must not inherit.
  return `<g fill="none" stroke="${color}" stroke-width="${n(width)}" stroke-opacity="1" fill-opacity="1" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
}

function marks(nd: SceneNode, c: string, w: number): string {
  const k = nd.bpmn;
  const s = symbolBox(nd);
  const cx = s ? s.x + s.w / 2 : 0;
  const cy = s ? s.y + s.h / 2 : 0;
  if (!k) {
    // UML: the initial pseudostate is a filled dot, the final state a dot inside a ring.
    if (!s) return "";
    return circle(cx, cy, nd.shape === "initial" ? s.w / 2 : s.w / 2 - 5, fillOnly(c));
  }
  if (s && isBpmnEvent(k)) return eventMarks(k, cx, cy, s.w / 2, c, w);
  if (s && isBpmnGateway(k)) return gatewayMarks(k, cx, cy, w);
  if (s) return "";
  return activityMarks(nd, c, w);
}

const fillOnly = (c: string) => ` fill="${c}" stroke="none"`;
const width = (v: number) => ` stroke-width="${n(v)}"`;
/**
 * A heavier line `k` times the classic 1.25px one. A stage hairline grows with the scene so it
 * stays one display pixel; the extra weight does not, or a wide scene's markers fill in.
 */
const heavy = (w: number, k: number) => w + (k - 1) * Math.min(w, 1.25);
/** Detail inside a small glyph (ticks, rows, a task marker): it stops growing, or it fills in. */
const fine = (w: number) => Math.min(0.8 * w, 1.6);

function eventMarks(k: BpmnKind, cx: number, cy: number, R: number, c: string, w: number): string {
  const parts: string[] = [];
  // End events throw: a thick ring and a filled trigger. Start and intermediate ones catch.
  const end = k.startsWith("end");
  if (end) {
    const t = heavy(w, 2.4);
    parts.push(circle(cx, cy, R - (t - w) / 2, width(t)));
  }
  const trigger = k.replace(/^(start|intermediate|end)-?/, "");
  switch (trigger) {
    case "message":
      parts.push(envelope(cx, cy, 19, 13, end, c, w));
      break;
    case "timer":
      parts.push(timer(cx, cy, w));
      break;
    case "signal":
      parts.push(
        poly(
          [
            [cx, cy - 9],
            [cx + 8.2, cy + 5.5],
            [cx - 8.2, cy + 5.5],
          ],
          end ? fillOnly(c) : "",
        ),
      );
      break;
    case "conditional":
      parts.push(
        `<rect x="${n(cx - 6.5)}" y="${n(cy - 8.5)}" width="13" height="17" rx="0.5"/>`,
        `<path d="${[-4.5, -1.5, 1.5, 4.5].map((d) => `M${P(cx - 4, cy + d)} H${n(cx + 4)}`).join(" ")}"${width(fine(w))}/>`,
      );
      break;
    case "error": {
      // A zigzag bolt from the bottom left to the top right.
      const u = 1.3;
      const bolt: [number, number][] = [
        [-7, 7],
        [-3, -4.5],
        [2.5, -0.5],
        [7, -7],
        [3, 4.5],
        [-2.5, 0.5],
      ];
      parts.push(
        poly(
          bolt.map(([x, y]) => [cx + x * u, cy + y * u]),
          end ? `${fillOnly(c)}` : "",
        ),
      );
      break;
    }
    case "terminate":
      parts.push(circle(cx, cy, 11, fillOnly(c)));
      break;
    case "escalation":
      parts.push(
        poly(
          [
            [cx, cy - 10],
            [cx + 7, cy + 7],
            [cx, cy + 1],
            [cx - 7, cy + 7],
          ],
          end ? fillOnly(c) : "",
        ),
      );
      break;
    default:
      break;
  }
  return parts.join("");
}

/** A message envelope; a thrown one is filled, with the flap left as a gap in the fill. */
function envelope(
  cx: number,
  cy: number,
  ew: number,
  eh: number,
  filled: boolean,
  c: string,
  sw: number,
): string {
  if (!filled) {
    const x0 = cx - ew / 2;
    const y0 = cy - eh / 2;
    return `<rect x="${n(x0)}" y="${n(y0)}" width="${n(ew)}" height="${n(eh)}" rx="0.5"/><path d="M${P(x0, y0)} L${P(cx, y0 + eh * 0.55)} L${P(x0 + ew, y0)}"/>`;
  }
  // Filled to the outer edge of the stroked one, so both read the same size.
  const W = ew + sw;
  const H = eh + sw;
  const x0 = cx - W / 2;
  const x1 = cx + W / 2;
  const y0 = cy - H / 2;
  const y1 = cy + H / 2;
  const vy = y0 + H * 0.55;
  const m = (vy - y0) / (W / 2);
  // Half the gap, measured across the flap line, then as a vertical and a horizontal offset.
  const dy = 0.75 * sw * Math.hypot(1, m);
  const dx = dy / m;
  return (
    poly(
      [
        [x0 + dx, y0],
        [x1 - dx, y0],
        [cx, vy - dy],
      ],
      fillOnly(c),
    ) +
    poly(
      [
        [x0, y0 + dy],
        [cx, vy + dy],
        [x1, y0 + dy],
        [x1, y1],
        [x0, y1],
      ],
      fillOnly(c),
    )
  );
}

function timer(cx: number, cy: number, w: number): string {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const [sx, sy] = [Math.sin(a), -Math.cos(a)];
    return `M${P(cx + 7.6 * sx, cy + 7.6 * sy)} L${P(cx + 9.4 * sx, cy + 9.4 * sy)}`;
  }).join(" ");
  return (
    circle(cx, cy, 11, width(heavy(w, 1.2))) +
    `<path d="${ticks}"${width(fine(w))}/>` +
    `<path d="M${P(cx, cy)} L${P(cx + 2.3, cy - 7)} M${P(cx, cy)} L${P(cx + 5.6, cy + 1.6)}"/>`
  );
}

function gatewayMarks(k: BpmnKind, cx: number, cy: number, w: number): string {
  const bold = width(heavy(w, 2.4));
  const plus = (r: number) => `M${P(cx, cy - r)} V${n(cy + r)} M${P(cx - r, cy)} H${n(cx + r)}`;
  const cross = (r: number) =>
    `M${P(cx - r, cy - r)} L${P(cx + r, cy + r)} M${P(cx + r, cy - r)} L${P(cx - r, cy + r)}`;
  switch (k) {
    case "exclusive":
      return `<path d="${cross(7.5)}"${bold}/>`;
    case "parallel":
      return `<path d="${plus(11)}"${bold}/>`;
    case "inclusive":
      return circle(cx, cy, 12, width(heavy(w, 2)));
    case "event-based": {
      const pent = Array.from({ length: 5 }, (_, i): [number, number] => {
        const a = (i * 2 * Math.PI) / 5;
        return [cx + 5.8 * Math.sin(a), cy - 5.8 * Math.cos(a) + 0.4];
      });
      return circle(cx, cy, 12.5) + circle(cx, cy, 10) + poly(pent);
    }
    case "complex":
      return `<path d="${plus(11)} ${cross(7.8)}"${width(heavy(w, 2))}/>`;
    default:
      return "";
  }
}

function activityMarks(nd: SceneNode, c: string, w: number): string {
  const b = nd.box;
  const k = nd.bpmn;
  const parts: string[] = [];
  if (k === "call-activity") {
    // Call activity: a thick border, its outer edge on the outline's.
    const t = heavy(w, 2.4);
    const d = (t - w) / 2;
    parts.push(
      `<rect x="${n(b.x + d)}" y="${n(b.y + d)}" width="${n(b.w - 2 * d)}" height="${n(b.h - 2 * d)}" rx="${n(10 - d)}"${width(t)}/>`,
    );
  }
  const glyph = typeMarker(k, b.x + 7, b.y + 7, c, w);
  if (glyph) parts.push(`<g${width(fine(w))}>${glyph}</g>`);
  if (hasSubMarker(k)) {
    const mx = b.x + b.w / 2;
    const my = b.y + b.h - 11;
    parts.push(
      `<rect x="${n(mx - 7)}" y="${n(my - 7)}" width="14" height="14" rx="1.5"${width(fine(w))}/>`,
      `<path d="M${P(mx - 4, my)} H${n(mx + 4)} M${P(mx, my - 4)} V${n(my + 4)}"/>`,
    );
  }
  return parts.join("");
}

/** A task type's 14px marker with its top left at (ox, oy). */
function typeMarker(k: BpmnKind | undefined, ox: number, oy: number, c: string, w: number): string {
  const L = (x: number, y: number) => P(ox + x, oy + y);
  switch (k) {
    case "user-task":
      return (
        circle(ox + 7, oy + 4.2, 2.9) +
        `<path d="M${L(1.5, 13.5)} V${n(oy + 11.5)} C${L(1.5, 8.9)} ${L(4, 7.8)} ${L(7, 7.8)} C${L(10, 7.8)} ${L(12.5, 8.9)} ${L(12.5, 11.5)} V${n(oy + 13.5)} Z"/>`
      );
    case "service-task":
      return gear(ox + 7, oy + 7);
    case "manual-task": {
      // A hand, palm down, fingers to the right and the thumb on top, as BPMN draws it.
      const s = 14 / 15;
      const H = (x: number, y: number) => L(x * s, 0.6 + y * s);
      const tip = (x: number, y0: number, y1: number) =>
        `H${n(ox + x * s)} A${n(((y1 - y0) / 2) * s)} ${n(((y1 - y0) / 2) * s)} 0 0 1 ${H(x, y1)}`;
      return `<path d="M${H(0.6, 11.8)} V${n(oy + 0.6 + 6.4 * s)} C${H(1.6, 5.2)} ${H(3.4, 3.4)} ${H(5.4, 1.6)} C${H(6.1, 1)} ${H(7.2, 1.5)} ${H(6.7, 2.5)} L${H(5.7, 4.4)} ${tip(14, 4.4, 6.3)} H${n(ox + 8.4 * s)} ${tip(14.6, 6.3, 8.2)} H${n(ox + 8.4 * s)} ${tip(13.8, 8.2, 10.1)} H${n(ox + 8.4 * s)} ${tip(12.4, 10.1, 12)} H${n(ox + 4 * s)} Z"/>`;
    }
    case "script-task":
      return (
        `<path d="M${L(3.6, 1)} H${n(ox + 12.6)} C${L(10.6, 3.4)} ${L(10.6, 4.8)} ${L(12.2, 7)} C${L(13.8, 9.2)} ${L(13.8, 10.6)} ${L(11.8, 13)} H${n(ox + 2.8)} C${L(4.8, 10.6)} ${L(4.8, 9.2)} ${L(3.2, 7)} C${L(1.6, 4.8)} ${L(1.6, 3.4)} ${L(3.6, 1)} Z"/>` +
        `<path d="M${L(4.4, 4)} H${n(ox + 9.4)} M${L(5.2, 7)} H${n(ox + 10.4)} M${L(6, 10)} H${n(ox + 11.2)}"/>`
      );
    case "send-task":
      return envelope(ox + 7, oy + 7, 13, 9, true, c, fine(w));
    case "receive-task":
      return envelope(ox + 7, oy + 7, 13, 9, false, c, fine(w));
    case "business-rule-task":
      return (
        `<rect x="${n(ox + 1)}" y="${n(oy + 2.5)}" width="12" height="9.5"/>` +
        `<rect x="${n(ox + 1)}" y="${n(oy + 2.5)}" width="12" height="2.6" fill="${c}"/>` +
        `<path d="M${L(1, 7.4)} H${n(ox + 13)} M${L(1, 9.7)} H${n(ox + 13)} M${L(4.6, 5.1)} V${n(oy + 12)}"/>`
      );
    default:
      return "";
  }
}

/** A gear with eight teeth and a hole, for service tasks. */
function gear(cx: number, cy: number): string {
  const pts: [number, number][] = [];
  const half = Math.PI / 8;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    for (const [da, r] of [
      [-0.62, 4.8],
      [-0.36, 6.6],
      [0.36, 6.6],
      [0.62, 4.8],
    ] as const)
      pts.push([cx + r * Math.sin(a + da * half), cy - r * Math.cos(a + da * half)]);
  }
  return poly(pts) + circle(cx, cy, 2);
}

/** Markers at an edge's start for its flow kind; `ground` is the color behind the line. */
export function flowMarks(e: SceneEdge, color: string, w: number, ground: string): string {
  const pts = e.points;
  const a = pts[0];
  const b = pts[1];
  if (!a || !b || (e.flow !== "message" && e.flow !== "default" && e.flow !== "conditional"))
    return "";
  // One unit is a classic 1.5px line; a stage scene drawn smaller than the display grows it.
  const u = Math.max(1, (e.line === "thick" ? w / 1.7 : w) / 1.5);
  const paint = ` stroke="${color}" stroke-width="${n(w)}" stroke-linejoin="round"`;
  if (e.flow === "message") {
    // Edges paint under the nodes, so the circle sits just outside the source, touching it.
    const r = 3.5 * u;
    const c = along(pts, r + w / 2).p;
    const parts = [circle(c.x, c.y, r, ` fill="${ground}"${paint}`)];
    const tip = pts[pts.length - 1];
    const from = pts[pts.length - 2];
    if ((e.arrow === "end" || e.arrow === "both") && tip && from) {
      // Wide enough to cover the filled head (svg.ts) and the chevron (stage.ts) under it.
      const thick = e.line === "thick";
      parts.push(head(tip, from, (thick ? 11 : 9) * u, (thick ? 7.4 : 6) * u, ground, paint));
    }
    return parts.join("");
  }
  if (e.flow === "conditional") {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const [ux, uy] = [(b.x - a.x) / d, (b.y - a.y) / d];
    const at = (s: number, t: number): [number, number] => [
      a.x + ux * s - uy * t,
      a.y + uy * s + ux * t,
    ];
    return poly(
      [at(0, 0), at(8 * u, -4.5 * u), at(16 * u, 0), at(8 * u, 4.5 * u)],
      ` fill="${ground}"${paint}`,
    );
  }
  // Default flow: a slash across the line near the source, after bpmn.io's marker.
  const { p, ux, uy } = along(pts, 9 * u);
  const s = (da: number, dt: number) => P(p.x + ux * da - uy * dt, p.y + uy * da + ux * dt);
  return `<path d="M${s(-2 * u, -6 * u)} L${s(2 * u, 6 * u)}" fill="none"${paint} stroke-linecap="round"/>`;
}

function head(tip: Point, from: Point, len: number, half: number, ground: string, paint: string) {
  const d = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const [ux, uy] = [(tip.x - from.x) / d, (tip.y - from.y) / d];
  const bx = tip.x - ux * len;
  const by = tip.y - uy * len;
  return poly(
    [
      [bx - uy * half, by + ux * half],
      [tip.x, tip.y],
      [bx + uy * half, by - ux * half],
    ],
    ` fill="${ground}"${paint}`,
  );
}

/** The point `dist` along a polyline and the direction there. */
function along(pts: Point[], dist: number): { p: Point; ux: number; uy: number } {
  let left = dist;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as Point;
    const b = pts[i + 1] as Point;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (!d) continue;
    const [ux, uy] = [(b.x - a.x) / d, (b.y - a.y) / d];
    if (left <= d || i + 2 === pts.length)
      return { p: { x: a.x + ux * Math.min(left, d), y: a.y + uy * Math.min(left, d) }, ux, uy };
    left -= d;
  }
  const p = pts[0] ?? { x: 0, y: 0 };
  return { p, ux: 1, uy: 0 };
}
