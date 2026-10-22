// Nodes: ink tiles holding glyphs in a muted share of their own color, cards, shapes and BPMN
// symbols, with their labels.

import type { Box, SceneNode } from "../../types.ts";
import { erTableStage } from "../er.ts";
import { notationMarks, notationShape } from "../notation.ts";
import { esc, shapePath } from "../svg.ts";
import { type Ctx, fill, rect, stroke } from "./ctx.ts";
import { glyph, iconInk } from "./filters.ts";
import { block, KEY, LABEL, mono, monoWidth, NOTE, sizeFor } from "./text.ts";
import { lit, TILES_ON } from "./timing.ts";

/** Alpha of a tile frame drawn in its icon's own color; the lit tint covers it. */
const OWN_FRAME = 0.35;

/** An ink tile with its glyph, framed faintly in the glyph's color and lit with the node's tint. */
function tile(ctx: Ctx, nd: SceneNode, b: Box): string {
  const { k, h } = ctx;
  const rx = 0.17 * Math.min(b.w, b.h);
  const tint = nd.color ?? k.tint;
  const ink = nd.icon ? iconInk(ctx, nd.icon) : k.glyph;
  const frame = ink === k.glyph ? stroke(k.line, k.frame, h) : stroke(ink, OWN_FRAME, h);
  return (
    rect(b, rx, `${fill(k.tile)} ${frame}`) +
    lit(ctx, rect(b, rx, `${fill(tint, 0.15)} ${stroke(tint, 0.65, h)}`), TILES_ON) +
    (nd.icon ? glyph(ctx, nd.icon, b, ink) : "")
  );
}

function badge(ctx: Ctx, label: string, anchor: Box, placed?: Box): string {
  const { k, h } = ctx;
  const size = 8.5;
  const w = placed?.w ?? Math.max(18, monoWidth(label, KEY, size) + 10);
  const bh = placed?.h ?? 16;
  const b = {
    x: placed?.x ?? anchor.x + anchor.w - w / 2 - 2,
    y: placed?.y ?? anchor.y - 7,
    w: Math.max(w, monoWidth(label, KEY, size) + 10),
    h: bh,
  };
  return (
    rect(b, bh / 2, `${fill(k.tile)} ${stroke(k.line, k.frame, h)}`) +
    mono([label], KEY, size, { x: b.x + b.w / 2, y: b.y, lead: bh }, ctx.t.edgeLabel, "middle")
  );
}

function labels(ctx: Ctx, nd: SceneNode, anchor: "start" | "middle", room: number): string {
  const own = sizeFor(nd.label.lines, LABEL, room, 8);
  const parts = [
    block(
      nd.label,
      nd.labelBox,
      LABEL,
      Math.min(ctx.sizes.label, own),
      nd.ink ?? ctx.t.text,
      anchor,
    ),
  ];
  if (nd.note && nd.noteBox)
    parts.push(
      block(
        nd.note,
        nd.noteBox,
        NOTE,
        Math.min(ctx.sizes.note, sizeFor(nd.note.lines, NOTE, room, 8)),
        nd.inkMuted ?? ctx.t.muted,
        anchor,
      ),
    );
  return parts.join("");
}

/** Width a node's label may take: its measured box plus the gap around it. */
export function labelRoom(nd: SceneNode): number {
  if (nd.look === "card") return nd.box.x + nd.box.w - nd.labelBox.x - 10;
  return Math.max(nd.labelBox.w, nd.look === "icon" ? nd.box.w : 0) + 14;
}

export function node(ctx: Ctx, nd: SceneNode): string {
  const { k, h } = ctx;
  const parts: string[] = [];
  const room = labelRoom(nd);
  // An entity with fields is a table (render/er.ts), unless that draws nothing for it.
  const table = nd.fields ? erTableStage(ctx, nd) : undefined;
  if (table !== undefined) parts.push(table);
  else if (nd.look === "icon") {
    if (nd.iconBox) parts.push(tile(ctx, nd, nd.iconBox));
    parts.push(labels(ctx, nd, "middle", room));
    if (nd.badge && nd.iconBox) parts.push(badge(ctx, nd.badge, nd.iconBox, nd.badgeBox));
  } else if (nd.look === "card") {
    const tint = nd.color ?? k.tint;
    parts.push(rect(nd.box, 6, `${fill(k.tile)} ${stroke(k.line, k.frame, h)}`));
    parts.push(lit(ctx, rect(nd.box, 6, `${fill(tint, 0.15)} ${stroke(tint, 0.65, h)}`), TILES_ON));
    if (nd.icon && nd.iconBox) parts.push(tile(ctx, { ...nd, color: tint }, nd.iconBox));
    parts.push(labels(ctx, nd, "start", room));
    if (nd.badge) parts.push(badge(ctx, nd.badge, nd.box, nd.badgeBox));
  } else {
    const tint = nd.color ?? k.tint;
    const outline = (nd.bpmn ? notationShape(nd) : undefined) ?? shapePath(nd.shape, nd.box);
    parts.push(
      `<g ${fill(k.tile)} ${stroke(k.line, k.frame, h)}>${outline}${notationMarks(nd, k.glyph, 1.25 * h)}</g>`,
    );
    parts.push(
      lit(
        ctx,
        `<g ${fill(tint, 0.15)} ${stroke(tint, 0.65, h)}>${outline}${notationMarks(nd, tint, 1.25 * h)}</g>`,
        TILES_ON,
      ),
    );
    if (nd.icon && nd.iconBox)
      parts.push(glyph(ctx, nd.icon, nd.iconBox, iconInk(ctx, nd.icon), 1.5));
    parts.push(labels(ctx, nd, "middle", room));
    if (nd.badge) parts.push(badge(ctx, nd.badge, nd.box, nd.badgeBox));
  }
  const inner = parts.join("");
  const body = nd.url
    ? `<a href="${esc(nd.url)}" xlink:href="${esc(nd.url)}" target="_blank">${inner}</a>`
    : inner;
  return `<g id="${ctx.prefix}n-${nd.id}">${body}</g>`;
}
