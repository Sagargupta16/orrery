// Scene -> diagrams.net (.drawio) file. Every group, node and edge becomes an editable cell with
// the same geometry as the SVG; official icons are embedded as SVG data, so the file opens offline.
import { mixHex } from "../color.ts";
import { renderIcon } from "../icons.ts";
import { THEME_TOKENS, type Theme } from "../themes.ts";
import type { Box, Point, Scene, SceneEdge, SceneGroup, SceneNode } from "../types.ts";
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
};

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
          whiteSpace: "wrap",
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
          whiteSpace: "wrap",
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
    s = style({
      ...SHAPE_STYLE[nd.shape],
      whiteSpace: "wrap",
      html: 1,
      fillColor: fill,
      strokeColor: stroke,
      fontColor: ctx.t.text,
      fontSize: 13,
      fontStyle: 1,
      fontFamily: FONT,
      image: img,
      imageWidth: img ? 20 : undefined,
      imageHeight: img ? 20 : undefined,
    });
    geom = geometry(nd.box, nd.parent, ctx);
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
    strokeWidth: e.line === "thick" ? 2.5 : 1.5,
    dashed: e.line === "dashed" || e.line === "dotted" ? 1 : 0,
    dashPattern: e.line === "dotted" ? "1 3" : e.line === "dashed" ? "6 4" : undefined,
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

export function renderDrawio(scene: Scene, name = "Diagram"): string {
  const t = THEME_TOKENS[scene.theme];
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
  for (const g of scene.groups) group(ctx, g);
  const boxes = new Map<string, Box>();
  for (const g of scene.groups) boxes.set(g.id, g.box);
  const vertical = scene.direction === "down" || scene.direction === "up";
  for (const nd of scene.nodes) {
    boxes.set(nd.id, nd.look === "icon" && nd.iconBox && !vertical ? nd.iconBox : nd.box);
    node(ctx, nd);
  }
  for (const e of scene.edges) edge(ctx, e, boxes);
  const bg = scene.background === "transparent" ? "none" : (scene.background ?? t.background);
  return [
    `<mxfile host="stackdraw" agent="stackdraw" type="device">`,
    `<diagram id="stackdraw" name="${esc(name)}">`,
    `<mxGraphModel dx="${scene.width}" dy="${scene.height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${scene.width}" pageHeight="${scene.height}" background="${bg}" math="0" shadow="0">`,
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>`,
    ...ctx.cells,
    `</root></mxGraphModel></diagram></mxfile>`,
    "",
  ].join("\n");
}
