// Drawing for entity tables and relationship ends (er diagrams): a node with fields as a header
// and one row per field, and crow's foot marks at both ends of an edge with card.
//
// Called from: src/render/svg.ts node() and edge() (classic) and src/render/stage/draw-nodes.ts
// node() and src/render/stage/draw-edges.ts edgeBase() (stage). A table's markup goes inside the
// node's <g id="<prefix>n-<id>"> (and its link, when it has a url) in place of the usual body;
// the ends go inside the edge's group after the line and its arrowheads.
//
// A row reads key tags (PK amber, FK blue, UQ gray), the name (bold for a key, dimmed when it may
// be null) and the type, dimmed, with `?` for null. The marks follow Information Engineering
// (crow's foot) notation, as draw.io's ER ends and Mermaid's erDiagram draw them: the mark at the
// table is the most, the one further out the least, so one (exactly one) is two bars; zero or one
// a bar and a circle; many (one or more) a crow's foot and a bar; zero or many a crow's foot and
// a circle.

import { ensureContrast, mixHex } from "../color.ts";
import { columnsOf, headerOf, rowsOf, tagsOf, typeText } from "../layout/er/index.ts";
import {
  NAME_SIZE,
  STAGE_NAME,
  STAGE_TYPE,
  TAG_GAP,
  TAG_SIZE,
  TYPE_SIZE,
  tagWidth,
} from "../layout/er/table.ts";
import type { Box, ErEnd, Point, SceneEdge, SceneNode } from "../types.ts";
import { fill, rect, type Ctx as StageCtx, stroke } from "./stage/ctx.ts";
import { glyph, iconInk } from "./stage/filters.ts";
import { block, type Face, KEY, LABEL, mono, NOTE, sizeFor } from "./stage/text.ts";
import { lit, TILES_ON } from "./stage/timing.ts";
import { type Ctx, esc, icon, n, text } from "./svg.ts";

// ---------------------------------------------------------------- shared geometry

/** A box with its top corners rounded and its bottom square: a table's header band. */
function topRounded(b: Box, r: number): string {
  const { x, y, w, h } = b;
  return `M${n(x)} ${n(y + h)} V${n(y + r)} Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)} H${n(x + w - r)} Q${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + r)} V${n(y + h)} Z`;
}

/** A row's tag chips: their text and box, left to right from the tag column. */
function chips(nd: SceneNode, row: Box, tags: string[], x0: number) {
  const h = 14;
  let x = nd.box.x + x0;
  return tags.map((tag) => {
    const w = tagWidth(tag);
    const box = { x, y: row.y + (row.h - h) / 2, w, h };
    x += w + TAG_GAP;
    return { tag, box };
  });
}

/** Baseline of one line of Inter centered on `cy` (the em box centered, as svg.ts sets text). */
const baseline = (cy: number, size: number) => cy + 0.364 * size;

function line(
  x: number,
  cy: number,
  s: string,
  size: number,
  color: string,
  weight: 400 | 600 = 400,
  anchor: "start" | "middle" = "start",
): string {
  if (!s) return "";
  const w = weight === 600 ? ` font-weight="600"` : "";
  const a = anchor === "middle" ? ` text-anchor="middle"` : "";
  return `<text x="${n(x)}" y="${n(baseline(cy, size))}" font-size="${n(size)}"${w}${a} fill="${color}">${esc(s)}</text>`;
}

// ---------------------------------------------------------------- classic

/** Tag colors: amber keys, blue references, gray unique columns; text 4.5:1 on its chip. */
function tagPaint(ctx: Ctx, tag: string): { fill: string; ink: string } {
  const dark = ctx.t.name === "dark";
  const hue =
    tag === "PK"
      ? dark
        ? "#e3b341"
        : "#b7791f"
      : tag === "FK"
        ? dark
          ? "#58a6ff"
          : "#0972d3"
        : ctx.t.muted;
  const chip = mixHex(hue, ctx.t.surface, dark ? 0.2 : 0.14);
  return { fill: chip, ink: ensureContrast(dark ? hue : mixHex(hue, "#000000", 0.7), chip, 4.5) };
}

/** The table body of a node with fields (classic skin), or undefined to draw it as usual. */
export function erTableClassic(ctx: Ctx, nd: SceneNode): string | undefined {
  const rows = rowsOf(nd);
  if (!rows.length) return undefined;
  const { t } = ctx;
  const b = nd.box;
  const dark = t.name === "dark";
  const head = headerOf(nd);
  const band = nd.color
    ? mixHex(nd.color, t.surface, dark ? 0.22 : 0.12)
    : mixHex(t.text, t.surface, dark ? 0.07 : 0.045);
  const stroke = nd.color ?? t.border;
  const cols = columnsOf(rows);
  const parts = [
    `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="8" fill="${t.surface}"/>`,
    `<path d="${topRounded(head, 8)}" fill="${band}"/>`,
    `<path d="M${n(b.x)} ${n(head.y + head.h)} H${n(b.x + b.w)}" fill="none" stroke="${stroke}" stroke-width="1"/>`,
  ];
  if (nd.icon && nd.iconBox) parts.push(icon(ctx, nd.icon, nd.iconBox, undefined, band));
  const ink = ensureContrast(t.text, band, 4.5);
  parts.push(text(nd.label, nd.labelBox, ink, "start"));
  if (nd.note && nd.noteBox)
    parts.push(text(nd.note, nd.noteBox, ensureContrast(t.muted, band, 4.5), "start"));
  rows.forEach((row, i) => {
    const cy = row.box.y + row.box.h / 2;
    // Every other row a shade darker, so a long table reads across.
    if (i % 2 === 1)
      parts.push(
        `<rect x="${n(b.x + 1)}" y="${n(row.box.y)}" width="${n(b.w - 2)}" height="${n(row.box.h)}" fill="${mixHex(t.text, t.surface, dark ? 0.03 : 0.022)}"/>`,
      );
    for (const c of chips(nd, row.box, tagsOf(row), cols.tag)) {
      const paint = tagPaint(ctx, c.tag);
      parts.push(
        `<rect x="${n(c.box.x)}" y="${n(c.box.y)}" width="${n(c.box.w)}" height="${n(c.box.h)}" rx="3" fill="${paint.fill}"/>`,
        line(c.box.x + c.box.w / 2, cy, c.tag, TAG_SIZE, paint.ink, 600, "middle"),
      );
    }
    const name = row.nullable ? t.muted : t.text;
    parts.push(line(b.x + cols.name, cy, row.name, NAME_SIZE, name, row.pk ? 600 : 400));
    parts.push(line(b.x + cols.type, cy, typeText(row), TYPE_SIZE, t.muted));
  });
  // The outline last, over the header band and the stripes.
  parts.push(
    `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="8" fill="none" stroke="${stroke}" stroke-width="1"/>`,
  );
  return parts.join("");
}

// ---------------------------------------------------------------- marks

/** Where the marks sit, in px out from the face along the line, and how wide they spread. */
const MARK = {
  /** The crow's foot's heel: its three prongs meet the face 7px either side of the line. */
  heel: 12,
  spread: 7,
  /** A bar's half length, where the bar for at most one sits, and the bar for at least one. */
  bar: 6,
  oneBar: 8,
  minBar: 13,
  manyBar: 17,
  /** The circle's radius, and its center for zero or one and for zero or many. */
  r: 3.5,
  oneRing: 15.5,
  manyRing: 19,
};

interface Mark {
  /** The end point on the face, and the unit vector out along the line. */
  p: Point;
  u: Point;
  end: ErEnd;
}

function marksOf(e: SceneEdge): Mark[] {
  const out: Mark[] = [];
  const card = e.card;
  if (!card || e.points.length < 2) return out;
  for (const [p, q, end] of [
    [e.points[0], e.points[1], card.from],
    [e.points.at(-1), e.points.at(-2), card.to],
  ] as const) {
    if (!p || !q) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (!d) continue;
    out.push({ p, u: { x: (q.x - p.x) / d, y: (q.y - p.y) / d }, end });
  }
  return out;
}

/** The strokes (paths) and rings (circles) of one end's mark, `k` px per unit. */
function markShapes(m: Mark, k: number): { paths: string[]; rings: Point[] } {
  const { p, u, end } = m;
  const at = (d: number, s = 0): Point => ({
    x: p.x + u.x * d * k - u.y * s * k,
    y: p.y + u.y * d * k + u.x * s * k,
  });
  const seg = (a: Point, b: Point) => `M${n(a.x)} ${n(a.y)} L${n(b.x)} ${n(b.y)}`;
  const bar = (d: number) => seg(at(d, -MARK.bar), at(d, MARK.bar));
  const many = end === "many" || end === "zero-many";
  const paths: string[] = [];
  const rings: Point[] = [];
  if (many) {
    const heel = at(MARK.heel);
    paths.push(
      `M${n(at(0, -MARK.spread).x)} ${n(at(0, -MARK.spread).y)} L${n(heel.x)} ${n(heel.y)} L${n(at(0, MARK.spread).x)} ${n(at(0, MARK.spread).y)}`,
    );
    if (end === "many") paths.push(bar(MARK.manyBar));
    else rings.push(at(MARK.manyRing));
  } else {
    paths.push(bar(MARK.oneBar));
    if (end === "zero-one") rings.push(at(MARK.oneRing));
    else paths.push(bar(MARK.minBar));
  }
  return { paths, rings };
}

/** Crow's foot marks at both ends of an edge with card (classic skin). */
export function erEndsClassic(ctx: Ctx, e: SceneEdge): string {
  const color = e.color ?? ctx.t.edge;
  const width = e.line === "thick" ? 2.5 : 1.5;
  const bg =
    ctx.scene.background && ctx.scene.background !== "transparent"
      ? ctx.scene.background
      : ctx.t.background;
  return marksOf(e)
    .map((m) => {
      const { paths, rings } = markShapes(m, 1);
      return (
        `<path d="${paths.join(" ")}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>` +
        rings
          .map(
            (c) =>
              `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(MARK.r)}" fill="${bg}" stroke="${color}" stroke-width="${width}"/>`,
          )
          .join("")
      );
    })
    .join("");
}

/** Crow's foot marks at both ends of an edge with card (stage skin): hairlines, one px a unit. */
export function erEndsStage(ctx: StageCtx, e: SceneEdge): string {
  const { k, h } = ctx;
  const color = e.color ?? k.line;
  const alpha = e.color ? 0.8 : k.arrow;
  const width = (e.line === "thick" ? 1.8 : 1) * h;
  return marksOf(e)
    .map((m) => {
      const { paths, rings } = markShapes(m, h);
      return (
        `<path d="${paths.join(" ")}" fill="none" ${stroke(color, alpha, width)} stroke-linecap="round" stroke-linejoin="round"/>` +
        rings
          .map(
            (c) =>
              `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(MARK.r * h)}" ${fill(k.tile)} ${stroke(color, alpha, width)}/>`,
          )
          .join("")
      );
    })
    .join("");
}

// ---------------------------------------------------------------- stage

const FIELD: Face = { size: STAGE_NAME, weight: 400, caps: false, track: 0 };
const KEY_FIELD: Face = { ...FIELD, weight: 700 };
const TYPE: Face = { size: STAGE_TYPE, weight: 400, caps: false, track: 0 };

/** The table body of a node with fields (stage skin), or undefined to draw it as usual. */
export function erTableStage(ctx: StageCtx, nd: SceneNode): string | undefined {
  const rows = rowsOf(nd);
  if (!rows.length) return undefined;
  const { k, h, t } = ctx;
  const b = nd.box;
  const head = headerOf(nd);
  const tint = nd.color ?? k.tint;
  const cols = columnsOf(rows);
  const parts = [
    rect(b, 6, `${fill(k.tile)} ${stroke(k.line, k.frame, h)}`),
    `<path d="${topRounded({ ...head, x: b.x + h / 2, w: b.w - h, y: b.y + h / 2, h: head.h - h / 2 }, 5.5)}" ${fill(nd.color ?? k.line, nd.color ? 0.12 : k.panel * 2)}/>`,
    `<path d="M${n(b.x)} ${n(head.y + head.h)} H${n(b.x + b.w)}" fill="none" ${stroke(k.line, k.frame, h)}/>`,
    lit(ctx, rect(b, 6, `${fill(tint, 0.15)} ${stroke(tint, 0.65, h)}`), TILES_ON),
  ];
  if (nd.icon && nd.iconBox) parts.push(glyph(ctx, nd.icon, nd.iconBox, iconInk(ctx, nd.icon)));
  const room = b.x + b.w - nd.labelBox.x - 10;
  parts.push(
    block(
      nd.label,
      nd.labelBox,
      LABEL,
      Math.min(ctx.sizes.label, sizeFor(nd.label.lines, LABEL, room, 8)),
      nd.ink ?? t.text,
      "start",
    ),
  );
  if (nd.note && nd.noteBox)
    parts.push(
      block(
        nd.note,
        nd.noteBox,
        NOTE,
        Math.min(ctx.sizes.note, sizeFor(nd.note.lines, NOTE, room, 8)),
        nd.inkMuted ?? t.muted,
        "start",
      ),
    );
  rows.forEach((row, i) => {
    const at = { y: row.box.y, lead: row.box.h };
    if (i % 2 === 1)
      parts.push(
        rect(
          { x: b.x + h, y: row.box.y, w: b.w - 2 * h, h: row.box.h },
          0,
          fill(k.line, k.panel * 1.2),
        ),
      );
    for (const c of chips(nd, row.box, tagsOf(row), cols.tag)) {
      const key = c.tag === "PK";
      parts.push(
        rect(
          c.box,
          3,
          key
            ? `${fill(k.tint, 0.14)} ${stroke(k.tint, 0.55, h)}`
            : `${fill(k.tile)} ${stroke(k.line, k.frame, h)}`,
        ),
        mono(
          [c.tag],
          KEY,
          TAG_SIZE,
          { x: c.box.x + c.box.w / 2, ...at },
          key ? k.header : t.edgeLabel,
          "middle",
        ),
      );
    }
    parts.push(
      mono(
        [row.name],
        row.pk ? KEY_FIELD : FIELD,
        FIELD.size,
        { x: b.x + cols.name, ...at },
        row.nullable ? t.muted : t.text,
        "start",
      ),
      mono([typeText(row)], TYPE, TYPE.size, { x: b.x + cols.type, ...at }, t.muted, "start"),
    );
  });
  return parts.join("");
}
