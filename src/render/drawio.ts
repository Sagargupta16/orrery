// Scene -> diagrams.net (.drawio) file. Every group, node and edge becomes an editable cell with
// the same geometry as the SVG; official icons are embedded as SVG data, so the file opens offline.
import { ensureContrast, mixHex } from "../color.ts";
import { renderIcon } from "../icons/index.ts";
import type { JourneyCurve, SceneJourney } from "../layout/journey/index.ts";
import { BAR, slant, symbolBox } from "../layout/notation.ts";
import { type Theme, tokensFor } from "../themes.ts";
import {
  type Box,
  type BpmnKind,
  type EdgeLine,
  isBpmnEvent,
  isBpmnGateway,
  type Point,
  type Scene,
  type SceneEdge,
  type SceneGroup,
  type SceneLegend,
  type SceneNode,
} from "../types.ts";
import { moodColor } from "./journey.ts";
import { esc } from "./svg.ts";

const n = (v: number) => String(Math.round(v * 100) / 100);

interface Ctx {
  t: Theme;
  scene: Scene;
  icons: number;
  cells: string[];
  groupBox: Map<string, Box>;
}

function iconData(ctx: Ctx, id: string, color?: string, background?: string): string {
  ctx.icons += 1;
  const r = renderIcon(id, `d${ctx.icons}`, {
    theme: ctx.t.name,
    background: background ?? ctx.t.background,
    ink: ctx.t.text,
    color,
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${r.viewBox.join(" ")}">${r.body}</svg>`;
  // draw.io reads "data:image/svg+xml,<base64>" (a ";base64" would end the style entry).
  return `data:image/svg+xml,${Buffer.from(svg).toString("base64")}`;
}

/** draw.io style string; a `null` value emits a bare style name such as `text` or `ellipse`. */
function style(entries: Record<string, string | number | null | undefined>): string {
  return Object.entries(entries)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => (v === null ? k : `${k}=${v}`))
    .join(";")
    .concat(";");
}

const FONT = "Inter,Helvetica,Arial,sans-serif";

function geometry(box: Box, parent?: string, ctx?: Ctx): string {
  const origin = parent && ctx ? ctx.groupBox.get(parent) : undefined;
  const x = box.x - (origin?.x ?? 0);
  const y = box.y - (origin?.y ?? 0);
  return `<mxGeometry x="${n(x)}" y="${n(y)}" width="${n(box.w)}" height="${n(box.h)}" as="geometry"/>`;
}

const cellParent = (parent?: string) => (parent ? `g-${parent}` : "1");

function htmlLabel(label: string[], note?: string[], noteColor?: string): string {
  const main = label.map(esc).join("<br>");
  if (!note?.length) return main;
  return `${main}<br><font style="font-size: 11px;" color="${noteColor}">${note.map(esc).join("<br>")}</font>`;
}

function group(ctx: Ctx, g: SceneGroup) {
  ctx.groupBox.set(g.id, g.box);
  if (g.lane) {
    // Pools and lanes open as draw.io swimlanes with their name strip; a black-box pool (its strip
    // is the whole box) is a plain box with its name in the middle.
    const { horizontal, header } = g.lane;
    const black = header.w === g.box.w && header.h === g.box.h;
    const lane = style({
      ...(black
        ? { whiteSpace: "wrap", align: "center", verticalAlign: "middle" }
        : {
            swimlane: null,
            horizontal: horizontal ? 0 : 1,
            startSize: Math.round(horizontal ? header.w : header.h),
          }),
      html: 1,
      fillColor: g.fill,
      swimlaneFillColor: g.fill,
      strokeColor: g.stroke,
      strokeWidth: g.strokeWidth,
      dashed: g.dash ? 1 : 0,
      dashPattern: g.dash,
      fontColor: g.labelColor,
      fontStyle: 1,
      fontSize: 13,
      fontFamily: FONT,
      container: 1,
      collapsible: 0,
      recursiveResize: 0,
    });
    ctx.cells.push(
      `<mxCell id="g-${g.id}" value="${esc(esc(g.label.lines.join(" ")))}" style="${lane}" vertex="1" parent="${cellParent(g.parent)}">${geometry(g.box, g.parent, ctx)}</mxCell>`,
    );
    return;
  }
  const s = style({
    rounded: g.radius ? 1 : 0,
    absoluteArcSize: g.radius ? 1 : undefined,
    arcSize: g.radius ? g.radius * 2 : undefined,
    whiteSpace: "wrap",
    html: 1,
    fillColor: g.fill,
    strokeColor: g.stroke,
    strokeWidth: g.strokeWidth,
    dashed: g.dash ? 1 : 0,
    dashPattern: g.dash,
    verticalAlign: "top",
    align: "left",
    spacingLeft: Math.round(g.labelBox.x - g.box.x - 2),
    spacingTop: Math.round(g.labelBox.y - g.box.y - 4),
    fontColor: g.labelColor,
    fontStyle: 1,
    fontSize: 13,
    fontFamily: FONT,
    container: g.overlay ? 0 : 1,
    collapsible: 0,
    recursiveResize: 0,
    pointerEvents: 0,
  });
  ctx.cells.push(
    `<mxCell id="g-${g.id}" value="${esc(esc(g.label.lines.join(" ")))}" style="${s}" vertex="1" parent="${cellParent(g.parent)}">${geometry(g.box, g.parent, ctx)}</mxCell>`,
  );
  if (g.inner) {
    ctx.cells.push(
      `<mxCell id="g-${g.id}:inner" value="" style="${style({ rounded: 1, absoluteArcSize: 1, arcSize: 8, fillColor: g.inner.fill, strokeColor: "none", movable: 0, resizable: 0, connectable: 0 })}" vertex="1" parent="g-${g.id}">${geometry(g.inner.box, g.id, ctx)}</mxCell>`,
    );
  }
  if (g.icon && g.iconBox) {
    const img = iconData(ctx, g.icon, undefined, g.fill === "none" ? undefined : g.fill);
    ctx.cells.push(
      `<mxCell id="g-${g.id}:icon" value="" style="${style({ shape: "image", html: 1, imageAspect: 1, aspect: "fixed", movable: 0, resizable: 0, image: img })}" vertex="1" parent="g-${g.id}">${geometry(g.iconBox, g.id, ctx)}</mxCell>`,
    );
  }
}

const SHAPE_STYLE: Record<SceneNode["shape"], Record<string, string | number | null>> = {
  box: { rounded: 0 },
  rounded: { rounded: 1, absoluteArcSize: 1, arcSize: 24 },
  pill: { rounded: 1, arcSize: 50 },
  circle: { ellipse: null },
  diamond: { rhombus: null },
  hexagon: { shape: "hexagon", perimeter: "hexagonPerimeter2", size: 0.12, fixedSize: 0 },
  cylinder: { shape: "cylinder3", boundedLbl: 1, backgroundOutline: 1, size: 8 },
  queue: { shape: "mxgraph.flowchart.direct_data" },
  document: { shape: "document", boundedLbl: 1, size: 0.18 },
  note: { shape: "note", size: 14, backgroundOutline: 1 },
  person: { shape: "actor" },
  cloud: { ellipse: null, shape: "cloud" },
  stack: { rounded: 1, absoluteArcSize: 1, arcSize: 12, shadow: 0 },
  // The flowchart and state shapes get their sizes from notationStyle.
  parallelogram: { shape: "parallelogram", perimeter: "parallelogramPerimeter" },
  subroutine: { shape: "process" },
  trapezoid: { shape: "trapezoid", perimeter: "trapezoidPerimeter" },
  delay: { shape: "delay" },
  initial: { ellipse: null },
  final: { shape: "endState" },
};

/** An outside label, under the symbol: layout already broke it into lines. */
const BELOW = { verticalLabelPosition: "bottom", verticalAlign: "top", align: "center" };

/** Event outline and trigger names of draw.io's mxgraph.bpmn.event and gateway2 shapes. */
function eventStyle(k: BpmnKind): Record<string, string> {
  const [kind = "", trigger = "general"] = k.split(/-(.*)/);
  const outline =
    kind === "start"
      ? "standard"
      : kind === "end"
        ? "end"
        : trigger === "general"
          ? "throwing"
          : "catching";
  return { outline, symbol: trigger };
}

const TASK_MARKER: Partial<Record<BpmnKind, string>> = {
  "user-task": "user",
  "service-task": "service",
  "manual-task": "manual",
  "script-task": "script",
  "send-task": "send",
  "receive-task": "receive",
  "business-rule-task": "businessRule",
};

/**
 * draw.io's own shapes for BPMN elements (its BPMN 2.0 sidebar) and the flowchart and state
 * shapes sized as svg.ts draws them, or undefined for the shapes SHAPE_STYLE covers alone.
 */
function notationStyle(nd: SceneNode): Record<string, string | number | null> | undefined {
  const k = nd.bpmn;
  const h = nd.box.h;
  if (!k) {
    switch (nd.shape) {
      case "parallelogram":
        return { ...SHAPE_STYLE.parallelogram, fixedSize: 1, size: slant(h) };
      case "trapezoid":
        // draw.io's trapezoid is wide at the bottom; west turns it to the manual operation.
        return { ...SHAPE_STYLE.trapezoid, fixedSize: 1, size: slant(h), direction: "west" };
      case "subroutine":
        return { ...SHAPE_STYLE.subroutine, fixedSize: 1, size: BAR };
      case "initial":
      case "final":
        return {
          ...SHAPE_STYLE[nd.shape],
          perimeter: "ellipsePerimeter",
          aspect: "fixed",
          ...BELOW,
        };
      default:
        return undefined;
    }
  }
  if (isBpmnEvent(k))
    return {
      shape: "mxgraph.bpmn.event",
      ...eventStyle(k),
      perimeter: "ellipsePerimeter",
      aspect: "fixed",
      outlineConnect: 0,
      ...BELOW,
    };
  if (isBpmnGateway(k)) {
    const kind: Record<string, string> =
      k === "inclusive"
        ? { outline: "end", symbol: "general" }
        : k === "event-based"
          ? { outline: "catching", symbol: "multiple", gwType: "event" }
          : { outline: "none", symbol: "none", gwType: k };
    return {
      shape: "mxgraph.bpmn.gateway2",
      ...kind,
      perimeter: "rhombusPerimeter",
      outlineConnect: 0,
      ...BELOW,
    };
  }
  if (k === "data-object") return { shape: "mxgraph.bpmn.data2", size: 10, ...BELOW };
  if (k === "data-store") return { shape: "datastore", ...BELOW };
  return {
    shape: "mxgraph.bpmn.task2",
    rectStyle: "rounded",
    size: 10,
    taskMarker: TASK_MARKER[k] ?? "abstract",
    ...(k === "call-activity" ? { bpmnShapeType: "call" } : {}),
    ...(k === "subprocess" || k === "call-activity" ? { isLoopSub: 1 } : {}),
  };
}

function node(ctx: Ctx, nd: SceneNode) {
  const id = `n-${nd.id}`;
  const parent = cellParent(nd.parent);
  const value = htmlLabel(nd.label.lines, nd.note?.lines, nd.inkMuted ?? ctx.t.muted);
  const bg =
    ctx.scene.background && ctx.scene.background !== "transparent"
      ? ctx.scene.background
      : ctx.t.background;
  let s: string;
  let geom: string;
  if (nd.look === "icon" && nd.icon && nd.iconBox) {
    const vertical = ctx.scene.direction === "down" || ctx.scene.direction === "up";
    const img = iconData(ctx, nd.icon, nd.color);
    s = vertical
      ? style({
          shape: "label",
          image: img,
          imageWidth: nd.iconBox.w,
          imageHeight: nd.iconBox.h,
          imageAlign: "center",
          imageVerticalAlign: "top",
          verticalAlign: "bottom",
          align: "center",
          fillColor: "none",
          strokeColor: "none",
          html: 1,
          // Layout already broke the label into lines; draw.io's own wrap would break them again.
          whiteSpace: "nowrap",
          fontColor: nd.ink ?? ctx.t.text,
          fontSize: 13,
          fontFamily: FONT,
          spacing: 0,
        })
      : style({
          shape: "image",
          image: img,
          imageAspect: 1,
          aspect: "fixed",
          verticalLabelPosition: "bottom",
          verticalAlign: "top",
          labelPosition: "center",
          align: "center",
          html: 1,
          // The label sits under a 48px image; wrapping to that width stacked "Amazon API
          // Gateway" three lines deep into the next icon.
          whiteSpace: "nowrap",
          fontColor: nd.ink ?? ctx.t.text,
          fontSize: 13,
          fontFamily: FONT,
          spacingTop: 0,
        });
    geom = geometry(vertical ? nd.box : nd.iconBox, nd.parent, ctx);
  } else if (nd.look === "card") {
    const img = nd.icon ? iconData(ctx, nd.icon, undefined, ctx.t.surface) : undefined;
    s = style({
      shape: "label",
      rounded: 1,
      absoluteArcSize: 1,
      arcSize: 16,
      whiteSpace: "wrap",
      html: 1,
      fillColor: ctx.t.surface,
      strokeColor: nd.color ?? ctx.t.border,
      image: img,
      imageWidth: nd.iconBox?.w,
      imageHeight: nd.iconBox?.h,
      imageAlign: "left",
      imageVerticalAlign: "middle",
      spacingLeft: Math.round(nd.labelBox.x - nd.box.x - 4),
      align: "left",
      verticalAlign: "middle",
      fontColor: ctx.t.text,
      fontSize: 13,
      fontStyle: 1,
      fontFamily: FONT,
    });
    geom = geometry(nd.box, nd.parent, ctx);
  } else {
    const stroke = nd.color ?? (ctx.t.name === "dark" ? "#6e7681" : "#8b95a1");
    const fill = nd.color
      ? mixHex(nd.color, bg, ctx.t.name === "dark" ? 0.16 : 0.1)
      : ctx.t.surface;
    const img = nd.icon ? iconData(ctx, nd.icon, nd.color, fill) : undefined;
    // A symbol with its label below (events, gateways, data, state marks) is a cell of the
    // symbol's size; UML's initial and final dots are filled with the outline color.
    const sym = symbolBox(nd);
    const dot = !nd.bpmn && (nd.shape === "initial" || nd.shape === "final");
    s = style({
      ...(notationStyle(nd) ?? SHAPE_STYLE[nd.shape]),
      whiteSpace: sym ? "nowrap" : "wrap",
      html: 1,
      fillColor: dot ? stroke : fill,
      strokeColor: stroke,
      fontColor: ctx.t.text,
      fontSize: 13,
      fontStyle: sym ? 0 : 1,
      fontFamily: FONT,
      image: img,
      imageWidth: img ? 20 : undefined,
      imageHeight: img ? 20 : undefined,
    });
    geom = geometry(sym ?? nd.box, nd.parent, ctx);
  }
  ctx.cells.push(
    nd.url
      ? `<UserObject id="${id}" label="${esc(value)}" link="${esc(nd.url)}"><mxCell style="${s}" vertex="1" parent="${parent}">${geom}</mxCell></UserObject>`
      : `<mxCell id="${id}" value="${esc(value)}" style="${s}" vertex="1" parent="${parent}">${geom}</mxCell>`,
  );
}

function anchor(p: Point, b: Box): [number, number] {
  const clamp = (v: number) => Math.max(0, Math.min(1, Math.round(v * 1000) / 1000));
  return [clamp((p.x - b.x) / (b.w || 1)), clamp((p.y - b.y) / (b.h || 1))];
}

/** Stroke entries of a line style, shared by edges and the legend's sample lines. */
const lineStyle = (line: EdgeLine) => ({
  strokeWidth: line === "thick" ? 2.5 : 1.5,
  dashed: line === "dashed" || line === "dotted" ? 1 : 0,
  dashPattern: line === "dotted" ? "1 3" : line === "dashed" ? "6 4" : undefined,
});

function edge(ctx: Ctx, e: SceneEdge, boxes: Map<string, Box>) {
  const first = e.points[0];
  const last = e.points[e.points.length - 1];
  const src = boxes.get(e.from);
  const dst = boxes.get(e.to);
  if (!first || !last) return;
  const [ex, ey] = src ? anchor(first, src) : [0.5, 0.5];
  const [nx, ny] = dst ? anchor(last, dst) : [0.5, 0.5];
  const end = e.arrow === "end" || e.arrow === "both";
  const start = e.arrow === "start" || e.arrow === "both";
  const routing = ctx.scene.routing;
  const s = style({
    edgeStyle: routing === "orthogonal" ? "orthogonalEdgeStyle" : "none",
    curved: routing === "spline" ? 1 : undefined,
    rounded: 1,
    orthogonalLoop: 1,
    html: 1,
    endArrow: end ? (ctx.scene.arrowhead === "open" ? "open" : "block") : "none",
    endFill: 1,
    endSize: 6,
    startArrow: start ? (ctx.scene.arrowhead === "open" ? "open" : "block") : "none",
    startFill: 1,
    startSize: 6,
    strokeColor: e.color ?? ctx.t.edge,
    ...lineStyle(e.line),
    fontColor: ctx.t.edgeLabel,
    fontSize: 11,
    fontFamily: FONT,
    labelBackgroundColor:
      ctx.scene.background && ctx.scene.background !== "transparent"
        ? ctx.scene.background
        : ctx.t.background,
    exitX: ex,
    exitY: ey,
    exitDx: 0,
    exitDy: 0,
    exitPerimeter: 0,
    entryX: nx,
    entryY: ny,
    entryDx: 0,
    entryDy: 0,
    entryPerimeter: 0,
    // BPMN flows, as draw.io's BPMN sidebar draws them (a message flow ends in a hollow head).
    ...(e.flow === "message"
      ? {
          startArrow: "oval",
          startFill: 0,
          startSize: 7,
          endArrow: end ? "block" : "none",
          endFill: 0,
        }
      : e.flow === "default"
        ? { startArrow: "dash", startFill: 0, startSize: 8 }
        : e.flow === "conditional"
          ? { startArrow: "diamondThin", startFill: 0, startSize: 10 }
          : {}),
  });
  const bends = e.points.slice(1, -1);
  const points = bends.length
    ? `<Array as="points">${bends.map((p) => `<mxPoint x="${n(p.x)}" y="${n(p.y)}"/>`).join("")}</Array>`
    : "";
  const label = e.label?.lines.join(" ") ?? "";
  ctx.cells.push(
    `<mxCell id="${e.id}" value="${esc(esc(label))}" style="${s}" edge="1" parent="1" source="${boxes.has(e.from) ? (ctx.groupBox.has(e.from) ? `g-${e.from}` : `n-${e.from}`) : ""}" target="${ctx.groupBox.has(e.to) ? `g-${e.to}` : `n-${e.to}`}"><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`,
  );
  if (e.step !== undefined && e.stepBox) {
    ctx.cells.push(
      `<mxCell id="${e.id}:step" value="${e.step}" style="${style({ ellipse: null, whiteSpace: "wrap", html: 1, fillColor: ctx.t.stepFill, strokeColor: "none", fontColor: ctx.t.stepText, fontStyle: 1, fontSize: 14, fontFamily: FONT })}" vertex="1" parent="1">${geometry(e.stepBox)}</mxCell>`,
    );
  }
}

/**
 * A journey's grid, under its cards as in the SVG: stage headers with their numbers, the row
 * bands with their headers, and the emotion curve. Colors follow render/journey.ts.
 */
function journey(ctx: Ctx, j: SceneJourney) {
  const { t, scene } = ctx;
  const dark = t.name === "dark";
  const bg =
    scene.background && scene.background !== "transparent" ? scene.background : t.background;
  const head = mixHex(t.text, bg, dark ? 0.1 : 0.06);
  const bands = [mixHex(t.text, bg, dark ? 0.05 : 0.035), mixHex(t.text, bg, dark ? 0.028 : 0.016)];
  const ink = ensureContrast(t.text, head, 4.5);
  let i = 0;
  const id = () => `journey:${i++}`;
  const box = (b: Box, fill: string, extra: Record<string, string | number | null> = {}) =>
    ctx.cells.push(
      `<mxCell id="${id()}" value="" style="${style({ rounded: 1, absoluteArcSize: 1, arcSize: 12, html: 1, fillColor: fill, strokeColor: "none", connectable: 0, ...extra })}" vertex="1" parent="1">${geometry(b)}</mxCell>`,
    );
  const label = (b: Box, lines: string[], color: string, size: number, bold = false) =>
    ctx.cells.push(
      `<mxCell id="${id()}" value="${esc(lines.map(esc).join("<br>"))}" style="${style({ text: null, html: 1, align: "center", verticalAlign: "middle", whiteSpace: "nowrap", fontSize: size, fontStyle: bold ? 1 : 0, fontColor: color, fontFamily: FONT, spacing: 0, connectable: 0 })}" vertex="1" parent="1">${geometry(b)}</mxCell>`,
    );
  for (const st of j.stages) {
    box(st.box, head);
    ctx.cells.push(
      `<mxCell id="${id()}" value="${esc(st.number)}" style="${style({ ellipse: null, html: 1, fillColor: t.stepFill, strokeColor: "none", fontColor: t.stepText, fontStyle: 1, fontSize: 12, fontFamily: FONT, connectable: 0 })}" vertex="1" parent="1">${geometry(st.numberBox)}</mxCell>`,
    );
    label(st.labelBox, st.label.lines, ink, st.label.size, st.label.weight === 600);
  }
  j.rows.forEach((r, n) => {
    const fill = bands[n % 2] ?? head;
    for (const c of r.cells) box(c, fill);
    box(r.header, head);
    if (r.color)
      box({ x: r.header.x, y: r.header.y + 8, w: 3, h: r.header.h - 16 }, r.color, { arcSize: 3 });
    label(r.labelBox, r.label.lines, ink, r.label.size, r.label.weight === 600);
  });
  if (j.curve) emotion(ctx, j.curve, head, bands[0] ?? head, ink, box, label, id);
}

function emotion(
  ctx: Ctx,
  c: JourneyCurve,
  head: string,
  band: string,
  ink: string,
  box: (b: Box, fill: string) => void,
  label: (b: Box, lines: string[], color: string, size: number, bold?: boolean) => void,
  id: () => string,
) {
  const { t } = ctx;
  box(c.header, head);
  box(c.band, band);
  label(c.labelBox, c.label.lines, ink, c.label.size, c.label.weight === 600);
  const muted = ensureContrast(t.muted, head, 4.5);
  for (const end of c.ends) label(end.box, end.label.lines, muted, end.label.size);
  // A free line: an edge with a source and a target point and no cells at its ends.
  const line = (pts: Point[], extra: Record<string, string | number | null | undefined>) => {
    const [first, ...rest] = pts;
    const last = rest.pop();
    if (!first || !last) return;
    const mid = rest.length
      ? `<Array as="points">${rest.map((p) => `<mxPoint x="${n(p.x)}" y="${n(p.y)}"/>`).join("")}</Array>`
      : "";
    ctx.cells.push(
      `<mxCell id="${id()}" value="" style="${style({ endArrow: "none", startArrow: "none", html: 1, ...extra })}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${n(first.x)}" y="${n(first.y)}" as="sourcePoint"/><mxPoint x="${n(last.x)}" y="${n(last.y)}" as="targetPoint"/>${mid}</mxGeometry></mxCell>`,
    );
  };
  const x0 = c.band.x + 10;
  const x1 = c.band.x + c.band.w - 10;
  const rule = (y: number, a: number, dashed: boolean) =>
    line(
      [
        { x: x0, y },
        { x: x1, y },
      ],
      {
        strokeColor: mixHex(t.text, band, a),
        strokeWidth: 1,
        dashed: dashed ? 1 : 0,
        dashPattern: dashed ? "4 3" : undefined,
      },
    );
  rule(c.zero, 0.35, true);
  for (const end of c.ends) rule(c.zero - end.score * c.unit, 0.12, false);
  if (c.points.length > 1)
    line(c.points, {
      curved: 1,
      edgeStyle: "none",
      strokeColor: mixHex(t.text, band, 0.7),
      strokeWidth: 2,
    });
  c.points.forEach((p, k) => {
    const fill = moodColor(c.scores[k] ?? 0, t, band);
    ctx.cells.push(
      `<mxCell id="${id()}" value="" style="${style({ ellipse: null, html: 1, fillColor: fill, strokeColor: band, strokeWidth: 2, connectable: 0 })}" vertex="1" parent="1">${geometry({ x: p.x - 9, y: p.y - 9, w: 18, h: 18 })}</mxCell>`,
    );
  });
}

/** The line-style key: a container with one sample line and one text cell per entry. */
function legend(ctx: Ctx, l: SceneLegend) {
  const { box } = l;
  const local = (b: Box): Box => ({ ...b, x: b.x - box.x, y: b.y - box.y });
  ctx.cells.push(
    `<mxCell id="legend" value="" style="${style({ rounded: 1, absoluteArcSize: 1, arcSize: 12, html: 1, fillColor: ctx.t.surface, strokeColor: ctx.t.border, container: 1, collapsible: 0, recursiveResize: 0 })}" vertex="1" parent="1">${geometry(box)}</mxCell>`,
  );
  for (const [i, item] of l.items.entries()) {
    ctx.cells.push(
      `<mxCell id="legend:${i}:line" value="" style="${style({ line: null, html: 1, fillColor: "none", strokeColor: ctx.t.edge, ...lineStyle(item.line) })}" vertex="1" parent="legend">${geometry(local(item.swatch))}</mxCell>`,
      `<mxCell id="legend:${i}:text" value="${esc(esc(item.label.lines.join(" ")))}" style="${style({ text: null, html: 1, align: "left", verticalAlign: "middle", whiteSpace: "nowrap", fontSize: item.label.size, fontColor: ctx.t.text, fontFamily: FONT, spacing: 0 })}" vertex="1" parent="legend">${geometry(local(item.labelBox))}</mxCell>`,
    );
  }
}

export function renderDrawio(scene: Scene, name = "Diagram"): string {
  const t = tokensFor(scene);
  const ctx: Ctx = { t, scene, icons: 0, cells: [], groupBox: new Map() };
  if (scene.title && scene.titleBox) {
    ctx.cells.push(
      `<mxCell id="title" value="${esc(esc(scene.title.lines.join(" ")))}" style="${style({ text: null, html: 1, align: "left", verticalAlign: "top", fontSize: 20, fontStyle: 1, fontColor: t.text, fontFamily: FONT, spacing: 0 })}" vertex="1" parent="1">${geometry({ ...scene.titleBox, w: scene.titleBox.w + 20 })}</mxCell>`,
    );
  }
  if (scene.subtitle && scene.subtitleBox) {
    ctx.cells.push(
      `<mxCell id="subtitle" value="${esc(esc(scene.subtitle.lines.join(" ")))}" style="${style({ text: null, html: 1, align: "left", verticalAlign: "top", fontSize: 13, fontColor: t.muted, fontFamily: FONT, spacing: 0 })}" vertex="1" parent="1">${geometry({ ...scene.subtitleBox, w: scene.subtitleBox.w + 20 })}</mxCell>`,
    );
  }
  if (scene.journey) journey(ctx, scene.journey);
  for (const g of scene.groups) group(ctx, g);
  const boxes = new Map<string, Box>();
  for (const g of scene.groups) boxes.set(g.id, g.box);
  const vertical = scene.direction === "down" || scene.direction === "up";
  for (const nd of scene.nodes) {
    boxes.set(
      nd.id,
      symbolBox(nd) ?? (nd.look === "icon" && nd.iconBox && !vertical ? nd.iconBox : nd.box),
    );
    node(ctx, nd);
  }
  for (const e of scene.edges) edge(ctx, e, boxes);
  if (scene.legend?.items.length) legend(ctx, scene.legend);
  const bg = scene.background === "transparent" ? "none" : (scene.background ?? t.background);
  return [
    `<mxfile host="orrery" agent="orrery" type="device">`,
    `<diagram id="orrery" name="${esc(name)}">`,
    `<mxGraphModel dx="${scene.width}" dy="${scene.height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${scene.width}" pageHeight="${scene.height}" background="${bg}" math="0" shadow="0">`,
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>`,
    ...ctx.cells,
    `</root></mxGraphModel></diagram></mxfile>`,
    "",
  ].join("\n");
}
