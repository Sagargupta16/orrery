// draw.io cells for entity tables (er diagrams): a table container and one row cell per field.
//
// Called from: src/render/drawio.ts node() for every node with fields. Returns the cells that
// replace the node's own cell, or undefined to draw it as usual. The table's own cell keeps the
// id `n-<node id>` and the parent `cellParent(nd.parent)`, so edges still attach to it; drawio.ts
// edge() maps SceneEdge.card to draw.io's own ER arrows, so nothing here draws the ends.
//
// The cells are the ones draw.io's Entity Relation sidebar inserts for a table (shape=table with
// tableLayout, a shape=tableRow per row, a partialRectangle per column: keys, name, type), so the
// table edits there like one drawn in draw.io: rows can be added, moved and resized.

import { ensureContrast, mixHex } from "../color.ts";
import { columnsOf, headerOf, rowsOf, tagsOf, typeText } from "../layout/er/index.ts";
import { BODY_PAD, NAME_SIZE, TYPE_SIZE } from "../layout/er/table.ts";
import type { SceneNode } from "../types.ts";
import { type Ctx, cellParent, FONT, geometry, htmlLabel, iconData, n, style } from "./drawio.ts";
import { esc } from "./svg.ts";

/** A cell's geometry inside its parent, with the bounds draw.io keeps for a collapsed cell. */
const local = (x: number, y: number, w: number, h: number) =>
  `<mxGeometry${x ? ` x="${n(x)}"` : ""}${y ? ` y="${n(y)}"` : ""} width="${n(w)}" height="${n(h)}" as="geometry"><mxRectangle width="${n(w)}" height="${n(h)}" as="alternateBounds"/></mxGeometry>`;

export function erDrawio(ctx: Ctx, nd: SceneNode): string[] | undefined {
  const rows = rowsOf(nd);
  if (!rows.length) return undefined;
  const { t } = ctx;
  const dark = t.name === "dark";
  const b = nd.box;
  const id = `n-${nd.id}`;
  const head = headerOf(nd);
  const band = nd.color
    ? mixHex(nd.color, t.surface, dark ? 0.22 : 0.12)
    : mixHex(t.text, t.surface, dark ? 0.07 : 0.045);
  const cols = columnsOf(rows);
  // The header band runs to the first row, so draw.io's own table layout keeps the rows where
  // the SVG draws them.
  const start = head.h + BODY_PAD;
  const value = htmlLabel(nd.label.lines, nd.note?.lines, ensureContrast(t.muted, band, 4.5));
  const iconW = nd.icon && nd.iconBox ? nd.iconBox.x + nd.iconBox.w - b.x + 8 : 0;
  const table = style({
    shape: "table",
    startSize: Math.round(start),
    container: 1,
    collapsible: 0,
    childLayout: "tableLayout",
    fixedRows: 1,
    rowLines: 0,
    rounded: 1,
    absoluteArcSize: 1,
    arcSize: 16,
    html: 1,
    whiteSpace: "wrap",
    fillColor: band,
    swimlaneFillColor: t.surface,
    strokeColor: nd.color ?? t.border,
    fontColor: ensureContrast(t.text, band, 4.5),
    fontSize: 13,
    fontStyle: 1,
    fontFamily: FONT,
    align: "left",
    verticalAlign: "middle",
    spacingLeft: Math.round(nd.labelBox.x - b.x - 2),
    resizeLast: 1,
  });
  const cells = [
    nd.url
      ? `<UserObject id="${id}" label="${esc(value)}" link="${esc(nd.url)}"><mxCell style="${table}" vertex="1" parent="${cellParent(nd.parent)}">${geometry(b, nd.parent, ctx)}</mxCell></UserObject>`
      : `<mxCell id="${id}" value="${esc(value)}" style="${table}" vertex="1" parent="${cellParent(nd.parent)}">${geometry(b, nd.parent, ctx)}</mxCell>`,
  ];
  rows.forEach((row, i) => {
    const rid = `${id}:r${i}`;
    const y = row.box.y - b.y;
    cells.push(
      `<mxCell id="${rid}" value="" style="${style({ shape: "tableRow", horizontal: 0, startSize: 0, swimlaneHead: 0, swimlaneBody: 0, fillColor: "none", collapsible: 0, dropTarget: 0, points: "[[0,0.5],[1,0.5]]", portConstraint: "eastwest", top: 0, left: 0, right: 0, bottom: 0 })}" vertex="1" parent="${id}">${local(0, y, b.w, row.box.h)}</mxCell>`,
    );
    const cell = (
      k: string,
      x: number,
      w: number,
      text: string,
      extra: Record<string, string | number>,
    ) =>
      `<mxCell id="${rid}:${k}" value="${esc(esc(text))}" style="${style({ shape: "partialRectangle", connectable: 0, fillColor: "none", top: 0, left: 0, bottom: 0, right: 0, overflow: "hidden", html: 1, whiteSpace: "nowrap", align: "left", verticalAlign: "middle", fontFamily: FONT, ...extra })}" vertex="1" parent="${rid}">${local(x, 0, w, row.box.h)}</mxCell>`;
    cells.push(
      cell("key", 0, cols.name, tagsOf(row).join(" "), {
        spacingLeft: cols.tag,
        fontSize: 9,
        fontStyle: 1,
        fontColor: t.muted,
      }),
      // draw.io's sidebar sets a key's name bold and underlined (fontStyle 5).
      cell("name", cols.name, cols.type - cols.name, row.name, {
        spacingLeft: 0,
        fontSize: NAME_SIZE,
        fontStyle: row.pk ? 5 : 0,
        fontColor: row.nullable ? t.muted : t.text,
      }),
      cell("type", cols.type, Math.max(1, b.w - cols.type), typeText(row), {
        spacingLeft: 0,
        fontSize: TYPE_SIZE,
        fontColor: t.muted,
      }),
    );
  });
  // The header icon sits beside the table, over its header: a cell inside would be a row.
  if (nd.icon && nd.iconBox && iconW)
    cells.push(
      `<mxCell id="${id}:icon" value="" style="${style({ shape: "image", image: iconData(ctx, nd.icon, undefined, band), imageAspect: 1, aspect: "fixed", html: 1 })}" vertex="1" parent="${cellParent(nd.parent)}">${geometry(nd.iconBox, nd.parent, ctx)}</mxCell>`,
    );
  return cells;
}
