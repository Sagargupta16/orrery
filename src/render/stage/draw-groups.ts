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
  // Fills stack where groups nest: a panel for the outer two levels, the lit tint for the top one.
  const panel = !g.dash && g.depth < 2 ? fill(k.line, k.panel) : `fill="none"`;
  const tint = g.depth === 0 ? fill(k.tint, (g.dash ? 0.04 : 0.03) * k.glow) : `fill="none"`;
  const base = rect(g.box, rx, `${panel} ${stroke(k.line, k.frame, h)}`, dash);
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
  if (g.label.lines.length) {
    const b = g.labelBox;
    const room = Math.max(b.w, g.box.x + g.box.w - b.x - 10 * h);
    const size = sizeFor(g.label.lines, HEADER, room, 8.5);
    const w = Math.max(...g.label.lines.map((l) => monoWidth(l, HEADER, size)));
    const chip = { x: b.x - 4, y: b.y - 1, w: w + 8, h: b.h + 2 };
    const crossed = ctx.scene.edges.some((e) =>
      e.points.some((p, i) => {
        const q = e.points[i + 1];
        return q !== undefined && crosses(p, q, chip);
      }),
    );
    const bg = ctx.scene.background;
    const surface = bg && bg !== "transparent" ? bg : ctx.t.background;
    if (crossed) parts.push(rect(chip, 3, fill(surface)));
    parts.push(block(g.label, b, HEADER, size, g.labelColor, "start"));
  }
  return parts.join("");
}
