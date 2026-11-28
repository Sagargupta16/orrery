// The canvas: content moved clear of the left and top margins and the title, then sized to all
// that is drawn, with the title, subtitle and line-style legend placed. A title or subtitle wider
// than the drawing wraps to it, so it never widens the canvas into an empty band beside it.

import { textBlock } from "../text.ts";
import type { Box, SceneLegend, TextBlock } from "../types.ts";
import type { Routed } from "./context.ts";
import { round } from "./geometry.ts";
import { placeLegend } from "./legend.ts";
import { SIZES } from "./sizes.ts";

/** The narrowest a wrapped title or subtitle gets, so a small drawing keeps readable lines. */
const MIN_TEXT = 420;

/** How far a route's ink reaches past its points: a thick arrowhead's half width, a crow's foot. */
const ROUTE_INK = 8;

export interface Canvas {
  width: number;
  height: number;
  /** The title and subtitle as drawn: wrapped to the drawing when it is narrower than their line. */
  title?: TextBlock;
  subtitle?: TextBlock;
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
  for (const b of [
    ...groups.map((g) => g.box),
    ...edges.flatMap((e) => [e.labelBox, e.stepBox]),
    ...relocated,
  ]) {
    if (!b) continue;
    width = Math.max(width, round(b.x + b.w + SIZES.pad));
    height = Math.max(height, round(b.y + b.h + SIZES.pad));
  }
  // Hooks and the last routing step reroute edges after ELK sized the canvas, at times past the
  // outermost box: every route keeps its stroke and ends on the canvas (a page margin when snug).
  const reach = snug ? SIZES.pad : ROUTE_INK;
  for (const p of edges.flatMap((e) => e.points)) {
    width = Math.max(width, round(p.x + reach));
    height = Math.max(height, round(p.y + reach));
  }
  // Wrapped lines push the drawing down by the height they add.
  const room = Math.max(MIN_TEXT, width - SIZES.pad * 2);
  const title =
    titleBlock && model.title && titleBlock.width > room
      ? textBlock(model.title, SIZES.title, room, 600, 1.25)
      : titleBlock;
  const subtitle =
    subtitleBlock && model.subtitle && subtitleBlock.width > room
      ? textBlock(model.subtitle, SIZES.subtitle, room, 400)
      : subtitleBlock;
  const grew = round(
    (title?.height ?? 0) -
      (titleBlock?.height ?? 0) +
      (subtitle?.height ?? 0) -
      (subtitleBlock?.height ?? 0),
  );
  if (grew > 0) {
    shiftAll(ctx, 0, grew);
    height = round(height + grew);
  }
  let titleBox: Box | undefined;
  let subtitleBox: Box | undefined;
  // A subtitle with no title takes the title's slot (readBack left room for it).
  let y = SIZES.pad - 4;
  if (title) {
    titleBox = { x: SIZES.pad, y, w: round(title.width), h: round(title.height) };
    width = Math.max(width, round(title.width + SIZES.pad * 2));
    y = round(y + title.height + 4);
  }
  if (subtitle) {
    subtitleBox = { x: SIZES.pad, y, w: round(subtitle.width), h: round(subtitle.height) };
    width = Math.max(width, round(subtitle.width + SIZES.pad * 2));
  }
  width = Math.ceil(width);
  height = Math.ceil(height);
  let legend: SceneLegend | undefined;
  if (model.legend?.length) {
    legend = placeLegend(model.legend, width, height - SIZES.pad + 12);
    width = Math.max(width, Math.ceil(legend.box.w + SIZES.pad * 2));
    height = Math.ceil(legend.box.y + legend.box.h + SIZES.pad);
  }
  return { width, height, title, subtitle, titleBox, subtitleBox, legend };
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
  if (dx || dy) shiftAll(ctx, dx, dy);
  return { dx, dy };
}

/** Moves everything drawn (groups, nodes with their parts and rows, routes, labels) by dx, dy. */
function shiftAll(ctx: Routed, dx: number, dy: number): void {
  const { nodes, groups, edges } = ctx;
  const moved = new Set<Box>();
  const move = (b: Box | undefined) => {
    if (!b || moved.has(b)) return;
    moved.add(b);
    b.x = round(b.x + dx);
    b.y = round(b.y + dy);
  };
  for (const g of groups)
    [g.box, g.labelBox, g.iconBox, g.inner?.box, g.lane?.header].forEach(move);
  for (const n of nodes) {
    [n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox].forEach(move);
    for (const f of n.fields ?? []) move(f.box);
  }
  for (const e of edges) {
    [e.labelBox, e.stepBox].forEach(move);
    e.points = e.points.map((p) => ({
      x: round(p.x + dx),
      y: round(p.y + dy),
    }));
  }
}
