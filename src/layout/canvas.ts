// The canvas: content moved clear of the left and top margins and the title, then sized to all
// that is drawn, with the title, subtitle and line-style legend placed.

import { textBlock } from "../text.ts";
import type { Box, LegendEntry, SceneLegend } from "../types.ts";
import type { Routed } from "./context.ts";
import { round } from "./geometry.ts";
import { SIZES } from "./sizes.ts";

export interface Canvas {
  width: number;
  height: number;
  titleBox?: Box;
  subtitleBox?: Box;
  legend?: SceneLegend;
}

export function sizeCanvas(ctx: Routed): Canvas {
  const { model, hidden, result, top, titleBlock, subtitleBlock, nodes, groups, edges } = ctx;
  // Nodes moved onto a border leave their ELK spots empty, at times on the canvas's edge: the
  // canvas then fits what is drawn, a page margin all round.
  const snug = ctx.seats.size > 0;
  const { dx, dy } = moveClear(ctx, snug);
  // Pools and lanes place every band themselves, so ELK's flat canvas is no floor for them.
  let width = hidden.size || snug ? 0 : round((result.width ?? 0) + dx);
  let height = hidden.size || snug ? 0 : round((result.height ?? 0) + top + dy);
  // Overlay groups and free-edge labels are placed after ELK sized the canvas; so is everything a
  // hook moved (lanes, trees).
  const relocated =
    model.kind !== "architecture" || hidden.size > 0 || snug
      ? nodes.flatMap((n) => [n.box, n.labelBox, n.noteBox, n.badgeBox])
      : [];
  const routes = snug ? edges.flatMap((e) => e.points.map((p) => ({ ...p, w: 0, h: 0 }))) : [];
  for (const b of [
    ...groups.map((g) => g.box),
    ...edges.flatMap((e) => [e.labelBox, e.stepBox]),
    ...relocated,
    ...routes,
  ]) {
    if (!b) continue;
    width = Math.max(width, round(b.x + b.w + SIZES.pad));
    height = Math.max(height, round(b.y + b.h + SIZES.pad));
  }
  let titleBox: Box | undefined;
  let subtitleBox: Box | undefined;
  if (titleBlock) {
    titleBox = {
      x: SIZES.pad,
      y: SIZES.pad - 4,
      w: round(titleBlock.width),
      h: round(titleBlock.height),
    };
    width = Math.max(width, round(titleBlock.width + SIZES.pad * 2));
    if (subtitleBlock) {
      subtitleBox = {
        x: SIZES.pad,
        y: round(titleBox.y + titleBlock.height + 4),
        w: round(subtitleBlock.width),
        h: round(subtitleBlock.height),
      };
      width = Math.max(width, round(subtitleBlock.width + SIZES.pad * 2));
    }
  }
  width = Math.ceil(width);
  height = Math.ceil(height);
  let legend: SceneLegend | undefined;
  if (model.legend?.length) {
    legend = placeLegend(model.legend, width, height);
    width = Math.max(width, Math.ceil(legend.box.w + SIZES.pad * 2));
    height = Math.ceil(legend.box.y + legend.box.h + SIZES.pad);
  }
  return { width, height, titleBox, subtitleBox, legend };
}

// Overlay legends (a tile on the top border) and free-edge labels are placed after ELK and can
// land left of or above the canvas, or on the title: move the content clear of both. `snug`
// moves it to the page margin either way.
function moveClear(ctx: Routed, snug: boolean): { dx: number; dy: number } {
  const { top, titleBlock, nodes, groups, edges } = ctx;
  const drawn = [
    ...groups.flatMap((g) => [g.box, g.labelBox, g.iconBox]),
    ...nodes.flatMap((n) => [n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox]),
    ...edges.flatMap((e) => [
      e.labelBox,
      e.stepBox,
      ...e.points.map((p) => ({ ...p, w: 0, h: 0 })),
    ]),
  ].filter((b): b is Box => !!b);
  const x0 = Math.min(...drawn.map((b) => b.x));
  const y0 = Math.min(...drawn.map((b) => b.y));
  const dx = snug ? round(SIZES.pad - x0) : Math.max(0, Math.ceil(4 - x0));
  const dy = snug
    ? round(top + SIZES.pad - y0)
    : Math.max(0, Math.ceil(top + (titleBlock ? 8 : 4) - y0));
  if (dx || dy) {
    const moved = new Set<Box>();
    const move = (b: Box | undefined) => {
      if (!b || moved.has(b)) return;
      moved.add(b);
      b.x = round(b.x + dx);
      b.y = round(b.y + dy);
    };
    for (const g of groups) [g.box, g.labelBox, g.iconBox, g.inner?.box].forEach(move);
    for (const n of nodes) [n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox].forEach(move);
    for (const e of edges) {
      [e.labelBox, e.stepBox].forEach(move);
      e.points = e.points.map((p) => ({
        x: round(p.x + dx),
        y: round(p.y + dy),
      }));
    }
  }
  return { dx, dy };
}

/**
 * The line-style key: one row per entry in spec order (a 28x12 sample, 8px gap, the meaning),
 * in a box under all content with its right edge on the right margin.
 */
function placeLegend(entries: LegendEntry[], width: number, height: number): SceneLegend {
  const P = 10;
  // A tag row keeps its color, and its chip when the tag sets no line style.
  const rows = entries.map((e) => ({
    line: e.line,
    label: textBlock(e.label, SIZES.edgeLabel, 240),
    ...(e.color ? { color: e.color } : {}),
    ...(e.chip ? { chip: true } : {}),
  }));
  const w = Math.ceil(P + 28 + 8 + Math.max(...rows.map((r) => r.label.width)) + P);
  // Rows sit 18px apart; a wrapped meaning pushes the next row down.
  const pitch = rows.map((r) => Math.max(18, r.label.height + 3));
  const last = rows[rows.length - 1]?.label.height ?? 0;
  const h = Math.ceil(P + pitch.slice(0, -1).reduce((a, b) => a + b, 0) + last + P);
  // Under the content, which ends a page margin above the current bottom.
  const box = {
    x: Math.max(SIZES.pad, width - SIZES.pad - w),
    y: height - SIZES.pad + 12,
    w,
    h,
  };
  let y = box.y + P;
  const items = rows.map((r, i) => {
    const swatch = {
      x: box.x + P,
      y: round(y + (r.label.lead - 12) / 2),
      w: 28,
      h: 12,
    };
    const labelBox = {
      x: box.x + P + 36,
      y: round(y),
      w: round(r.label.width),
      h: round(r.label.height),
    };
    y += pitch[i] ?? 18;
    return {
      line: r.line,
      ...(r.color ? { color: r.color } : {}),
      ...(r.chip ? { chip: true } : {}),
      swatch,
      label: r.label,
      labelBox,
    };
  });
  return { box, items };
}
