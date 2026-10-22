// draw.io cells for a timeline (Scene.timeline): the axis and its ticks, lane bands, today marker
// and status key under everything, and each item as an editable bar, diamond or dot.
//
// Called from: src/render/drawio.ts renderDrawio when the scene has a timeline, where the journey
// grid is drawn: after the title, before groups, nodes and edges (so the cells sit under them).
// Return the cells in paint order; ids must not start with "n-", "g-" or "e" plus a digit, which
// the nodes, groups and edges use. drawio.ts exports its helpers (style, geometry, FONT, n ...).
//
// timelineItemDrawio is the item's own cell (id n-<id>, so the dependency edges attach to it),
// for drawio.ts node() to use in place of its default cell, the way erDrawio stands in for an
// entity; undefined for a node that is not a timeline item.

import { ensureContrast, mixHex } from "../color.ts";
import type { TimelineItem } from "../layout/timeline/index.ts";
import type { Box, Point, Scene, SceneNode } from "../types.ts";
import type { Ctx } from "./drawio.ts";
import { FONT, geometry, htmlLabel, iconData, n, style } from "./drawio.ts";
import { esc } from "./svg.ts";
import { canvasOf, classicPaint, laneColor, TODAY } from "./timeline.ts";

type Entries = Record<string, string | number | null | undefined>;

/** A box cell, a text cell and a free line, numbered under one prefix. */
function writers(cells: string[]) {
  let i = 0;
  const id = () => `timeline:${i++}`;
  const box = (b: Box, entries: Entries, value = "") =>
    cells.push(
      `<mxCell id="${id()}" value="${esc(value)}" style="${style({ html: 1, connectable: 0, ...entries })}" vertex="1" parent="1">${geometry(b)}</mxCell>`,
    );
  const label = (
    b: Box,
    lines: string[],
    color: string,
    size: number,
    align: string,
    bold: boolean,
  ) =>
    box(
      b,
      {
        text: null,
        align,
        verticalAlign: "middle",
        whiteSpace: "nowrap",
        fontSize: size,
        fontStyle: bold ? 1 : 0,
        fontColor: color,
        fontFamily: FONT,
        spacing: 0,
      },
      lines.map(esc).join("<br>"),
    );
  const line = (p: Point, q: Point, entries: Entries) =>
    cells.push(
      `<mxCell id="${id()}" value="" style="${style({ endArrow: "none", startArrow: "none", html: 1, ...entries })}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${n(p.x)}" y="${n(p.y)}" as="sourcePoint"/><mxPoint x="${n(q.x)}" y="${n(q.y)}" as="targetPoint"/></mxGeometry></mxCell>`,
    );
  return { box, label, line };
}

export function timelineDrawio(ctx: Ctx, scene: Scene): string[] {
  const tl = scene.timeline;
  if (!tl) return [];
  const { t } = ctx;
  const dark = t.name === "dark";
  const bg = canvasOf(scene, t);
  const head = mixHex(t.text, bg, dark ? 0.1 : 0.06);
  const cell = mixHex(t.text, bg, dark ? 0.05 : 0.03);
  const bands = [mixHex(t.text, bg, dark ? 0.045 : 0.03), mixHex(t.text, bg, dark ? 0.022 : 0.012)];
  const ink = ensureContrast(t.text, head, 4.5);
  const muted = ensureContrast(t.muted, cell, 4.5);
  const cells: string[] = [];
  const { box, label, line } = writers(cells);
  const round = { rounded: 1, absoluteArcSize: 1, arcSize: 12, strokeColor: "none" };

  tl.lanes.forEach((l, i) => {
    box(l.box, { ...round, fillColor: bands[i % 2] ?? head });
    if (l.header) {
      box(l.header, { ...round, fillColor: head });
      box(
        { x: l.header.x, y: l.header.y + 8, w: 3, h: Math.max(0, l.header.h - 16) },
        {
          ...round,
          arcSize: 3,
          fillColor: laneColor(l, t.name),
        },
      );
      if (l.label && l.labelBox) label(l.labelBox, l.label.lines, ink, l.label.size, "left", true);
    }
  });
  const { axis, plot } = tl;
  if (axis.upper)
    for (const p of axis.periods) {
      box(
        { x: p.x + 1, y: axis.upper.y, w: Math.max(0, p.w - 2), h: axis.upper.h - 2 },
        {
          ...round,
          fillColor: head,
        },
      );
      if (p.label && p.labelBox) label(p.labelBox, p.label.lines, ink, p.label.size, "left", true);
    }
  for (const tk of axis.ticks) {
    box(
      { x: tk.x + 1, y: axis.lower.y, w: Math.max(0, tk.w - 2), h: axis.lower.h },
      {
        ...round,
        fillColor: cell,
      },
    );
    label(tk.labelBox, tk.label.lines, muted, tk.label.size, "center", true);
  }
  const periodStarts = new Set(axis.periods.map((p) => Math.round(p.x * 100)));
  for (const tk of axis.ticks.slice(1)) {
    const strong = periodStarts.has(Math.round(tk.x * 100));
    line(
      { x: tk.x, y: plot.y },
      { x: tk.x, y: plot.y + plot.h },
      {
        strokeColor: mixHex(t.text, bg, strong ? (dark ? 0.22 : 0.16) : dark ? 0.1 : 0.07),
        strokeWidth: 1,
      },
    );
  }
  const td = tl.today;
  if (td) {
    const red = TODAY[t.name];
    for (const sg of td.segments)
      line({ x: td.x, y: sg.y0 }, { x: td.x, y: sg.y1 }, { strokeColor: red, strokeWidth: 1.5 });
    box(td.chip, { rounded: 1, arcSize: 50, fillColor: red, strokeColor: "none" }, "");
    label(
      td.labelBox,
      td.label.lines,
      ensureContrast("#ffffff", red, 4.5),
      td.label.size,
      "center",
      true,
    );
  }
  if (tl.key) {
    const color = laneColor(
      tl.lanes.find((l) => l.slot >= 0),
      t.name,
    );
    for (const k of tl.key.items) {
      const s = k.swatch;
      if (k.kind === "milestone")
        box(
          { x: s.x + s.w / 2 - 6, y: s.y, w: 12, h: 12 },
          { rhombus: null, fillColor: color, strokeColor: "none" },
        );
      else {
        const p = classicPaint(k.kind, color, t, bg);
        box(s, {
          rounded: 1,
          absoluteArcSize: 1,
          arcSize: 6,
          fillColor: p.fill,
          strokeColor: p.stroke,
          strokeWidth: p.width,
          dashed: p.dash ? 1 : 0,
          dashPattern: p.dash,
        });
      }
      label(k.labelBox, k.label.lines, t.text, k.label.size, "left", false);
    }
  }
  return cells;
}

/** Where draw.io puts the label of an item: in the bar, or beside it on the side layout chose. */
function labelSide(it: TimelineItem): Entries {
  if (it.side === "inside") return { align: "center", verticalAlign: "middle" };
  return it.side === "right"
    ? { labelPosition: "right", align: "left", verticalAlign: "middle", spacingLeft: 8 }
    : { labelPosition: "left", align: "right", verticalAlign: "middle", spacingRight: 8 };
}

/** The editable cell of one timeline item (and its icon), or undefined for any other node. */
export function timelineItemDrawio(ctx: Ctx, nd: SceneNode): string[] | undefined {
  const tl = ctx.scene.timeline;
  const it = tl?.items.find((x) => x.id === nd.id);
  if (!tl || !it) return undefined;
  const { t } = ctx;
  const bg = canvasOf(ctx.scene, t);
  const color = it.color ?? laneColor(tl.lanes[it.lane], t.name);
  const p = classicPaint(it.status, color, t, bg);
  const solid =
    it.status === "planned"
      ? p.fill
      : it.status === "done" || it.status === "at-risk"
        ? p.stroke
        : color;
  const shape: Entries =
    it.shape === "bar"
      ? { rounded: 1, absoluteArcSize: 1, arcSize: 12, fillColor: p.fill }
      : it.shape === "milestone"
        ? { rhombus: null, fillColor: solid }
        : { ellipse: null, fillColor: nd.iconBox ? t.surface : solid };
  const value = htmlLabel(nd.label.lines, nd.note?.lines, t.muted);
  const s = style({
    ...shape,
    strokeColor: it.shape === "bar" || it.status === "planned" ? p.stroke : bg,
    strokeWidth: it.shape === "bar" ? p.width : 1.5,
    dashed: p.dash ? 1 : 0,
    dashPattern: p.dash,
    html: 1,
    whiteSpace: "nowrap",
    fontColor: t.text,
    fontSize: nd.label.size,
    fontStyle: 1,
    fontFamily: FONT,
    ...labelSide(it),
  });
  const cells = [
    `<mxCell id="n-${nd.id}" value="${esc(value)}" style="${s}" vertex="1" parent="1">${geometry(nd.box)}</mxCell>`,
  ];
  if (nd.icon && nd.iconBox)
    cells.push(
      `<mxCell id="n-${nd.id}:icon" value="" style="${style({ shape: "image", html: 1, imageAspect: 1, aspect: "fixed", connectable: 0, image: iconData(ctx, nd.icon, nd.color) })}" vertex="1" parent="1">${geometry(nd.iconBox)}</mxCell>`,
    );
  return cells;
}
