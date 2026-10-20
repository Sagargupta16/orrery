// The backdrop under the diagram: the canvas with its grid and tint wash, and the title block.

import { mixHex } from "../../color.ts";
import { n } from "../svg.ts";
import { type Ctx, stroke } from "./ctx.ts";
import { block, SUBTITLE, sizeFor, TITLE } from "./text.ts";

export function canvas(ctx: Ctx): string {
  const { k, t, scene, h } = ctx;
  if (scene.background === "transparent") return "";
  const p = ctx.prefix;
  const W = scene.width;
  const H = scene.height;
  const cell = 20 * h;
  const { x: fx, y: fy } = ctx.story.focus;
  const reach = Math.max(
    ...[
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ].map(([x = 0, y = 0]) => Math.hypot(x - fx, y - fy)),
  );
  ctx.defs.push(
    `<linearGradient id="${p}bg" x1="0" y1="0" x2="0.34" y2="0.94"><stop offset="0" stop-color="${k.top}"/><stop offset="0.6" stop-color="${t.background}"/></linearGradient>` +
      `<pattern id="${p}grid" width="${n(cell)}" height="${n(cell)}" patternUnits="userSpaceOnUse"><path d="M0 ${n(h / 2)}H${n(cell)}M${n(h / 2)} 0V${n(cell)}" fill="none" ${stroke(k.line, k.grid, h)}/></pattern>` +
      `<radialGradient id="${p}wash" gradientUnits="userSpaceOnUse" cx="${n(fx)}" cy="${n(fy)}" r="${n(reach * 0.6)}"><stop offset="0" stop-color="${k.tint}" stop-opacity="${k.wash}"/><stop offset="1" stop-color="${k.tint}" stop-opacity="0"/></radialGradient>`,
  );
  const base = scene.background ?? `url(#${p}bg)`;
  return `<rect width="${W}" height="${H}" fill="${base}"/><rect width="${W}" height="${H}" fill="url(#${p}grid)"/><rect width="${W}" height="${H}" fill="url(#${p}wash)"/>`;
}

/** The title and the subtitle under it, one document line each. */
export function titles(ctx: Ctx): string[] {
  const { k, t, scene } = ctx;
  const W = scene.width;
  const out: string[] = [];
  if (scene.title && scene.titleBox) {
    const b = scene.titleBox;
    const size = sizeFor(scene.title.lines, TITLE, W - b.x - 24, 11);
    out.push(block(scene.title, b, TITLE, size, mixHex(k.line, t.background, 0.85), "start"));
  }
  if (scene.subtitle && scene.subtitleBox) {
    const b = scene.subtitleBox;
    const size = sizeFor(scene.subtitle.lines, SUBTITLE, W - b.x - 24, 9);
    out.push(block(scene.subtitle, b, SUBTITLE, size, t.text, "start"));
  }
  return out;
}
