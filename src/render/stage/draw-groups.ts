// Group frames (a panel and a hairline that lights tint) and their headers (corner tile and label).

import { mixHex } from "../../color.ts";
import type { Box, Point, SceneGroup } from "../../types.ts";
import { n } from "../svg.ts";
import { type Ctx, fill, rect, stroke } from "./ctx.ts";
import { glyph } from "./filters.ts";
import { block, HEADER, monoWidth, sizeFor } from "./text.ts";
import { GROUPS_ON, lit } from "./timing.ts";

export function groupFrame(ctx: Ctx, g: SceneGroup): string {
  const { k, h } = ctx;
  const dash = g.dash ? ` stroke-dasharray="${n(3 * h)} ${n(3 * h)}"` : "";
  const rx = g.dash ? 0 : 2 * h;
  // stageColors (skins.ts) leaves the structure colors on a group unless the spec set its own
  // color or fill; those are read back here.
  const canvas = surface(ctx);
  const ownLine = g.stroke !== mixHex(k.line, canvas, k.frame);
  const ownFill = g.fill !== "none" && g.fill !== mixHex(k.line, canvas, k.panel);
  // Fills stack where groups nest: a panel for the outer two levels, the lit tint for the top one.
  const panel = ownFill
    ? fill(g.fill)
    : !g.dash && g.depth < 2
      ? fill(k.line, k.panel)
      : `fill="none"`;
  const tint = g.depth === 0 ? fill(k.tint, (g.dash ? 0.04 : 0.03) * k.glow) : `fill="none"`;
  const line = ownLine ? stroke(g.stroke, 1, h) : stroke(k.line, k.frame, h);
  const base = rect(g.box, rx, `${panel} ${line}`, dash);
  const glow = rect(g.box, rx, `${tint} ${stroke(k.tint, g.dash ? 0.5 : 0.6, h)}`, dash);
  return base + lit(ctx, glow, GROUPS_ON);
}

/** Where an edge segment crosses a box (Liang-Barsky), so a header only gets a chip when needed. */
function crosses(a: Point, b: Point, box: Box): boolean {
  let lo = 0;
  let hi = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sides: [number, number][] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.w - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.h - a.y],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) lo = Math.max(lo, r);
    else hi = Math.min(hi, r);
    if (lo > hi) return false;
  }
  return true;
}

/** The surface the stage draws on: the spec's background, else the theme's. */
function surface(ctx: Ctx): string {
  const bg = ctx.scene.background;
  return bg && bg !== "transparent" ? bg : ctx.t.background;
}

/**
 * The box a group's stage header chip occupies: its label's box padded 4 px on the sides and 1 px
 * above and below, as wide as the label is drawn (the stage font is mono and may shrink to fit
 * the group). `h` is the display pixel in scene units, `1 / Math.min(1, 880 / scene.width)`.
 * Undefined for a group without a label.
 */
export function stageHeaderBox(g: SceneGroup, h = 1): Box | undefined {
  if (!g.label.lines.length) return undefined;
  const b = g.labelBox;
  const room = Math.max(b.w, g.box.x + g.box.w - b.x - 10 * h);
  const size = sizeFor(g.label.lines, HEADER, room, 8.5);
  const w = Math.max(...g.label.lines.map((l) => monoWidth(l, HEADER, size)));
  return { x: b.x - 4, y: b.y - 1, w: w + 8, h: b.h + 2 };
}

export function groupHeader(ctx: Ctx, g: SceneGroup): string {
  const { k, h } = ctx;
  const parts: string[] = [];
  if (g.icon && g.iconBox) {
    const b = g.iconBox;
    if (b.w >= 28) {
      // A corner tile, as the AWS group tiles: a structure square that turns tint when lit.
      parts.push(rect(b, 0, fill(k.line, k.frame)));
      parts.push(glyph(ctx, g.icon, b, mixHex(k.line, k.tile, 0.7), 0.85));
      parts.push(
        lit(ctx, rect(b, 0, fill(k.tint)) + glyph(ctx, g.icon, b, k.onTint, 0.85), GROUPS_ON),
      );
    } else {
      parts.push(glyph(ctx, g.icon, b, k.glyph, 1.5));
      parts.push(lit(ctx, glyph(ctx, g.icon, b, k.tint, 1.5), GROUPS_ON));
    }
  }
  const chip = stageHeaderBox(g, h);
  if (chip) {
    const b = g.labelBox;
    const room = Math.max(b.w, g.box.x + g.box.w - b.x - 10 * h);
    const size = sizeFor(g.label.lines, HEADER, room, 8.5);
    const crossed = ctx.scene.edges.some((e) =>
      e.points.some((p, i) => {
        const q = e.points[i + 1];
        return q !== undefined && crosses(p, q, chip);
      }),
    );
    if (crossed) parts.push(rect(chip, 3, fill(surface(ctx))));
    parts.push(block(g.label, b, HEADER, size, g.labelColor, "start"));
  }
  return parts.join("");
}
