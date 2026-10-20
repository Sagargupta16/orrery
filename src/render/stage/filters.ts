// Icons in one color: one shared <symbol> per glyph, painted by one filter per tone and color.

import { type IconTone, iconTone, renderIcon } from "../../icons/index.ts";
import type { Box } from "../../types.ts";
import { n, SYMBOL_ID } from "../svg.ts";
import type { Ctx } from "./ctx.ts";

/** How much of its box each tone's artwork fills, so every glyph comes out about the same size. */
const TONE_FIT: Record<IconTone, number> = {
  glyph: 0.86,
  inverse: 0.86,
  two: 0.62,
  shape: 0.58,
  mono: 0.6,
};

// alpha = (luminance - 0.62) * 4.2: white artwork survives, AWS and Kubernetes tile colors (0.56 at
// most) do not, and so do the anti-aliased edges of thin strokes; DARK keeps near-black the same way.
const LIGHT = "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.8929 3.0038 0.3032 0 -2.604";
const DARK = "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.8504 -2.8608 -0.2888 0 2.4";

/** The filter that paints one tone in one color; one per pair, shared by every icon. */
function toneFilter(ctx: Ctx, tone: IconTone, color: string): string {
  const key = `${tone}|${color}`;
  let id = ctx.filters.get(key);
  if (id) return id;
  id = `${ctx.prefix}f${ctx.filters.size + 1}`;
  ctx.filters.set(key, id);
  const flood = `<feFlood flood-color="${color}"/>`;
  const body =
    tone === "glyph"
      ? `<feColorMatrix type="matrix" values="${LIGHT}" result="a"/>${flood}<feComposite in2="a" operator="in"/>`
      : tone === "inverse"
        ? `<feColorMatrix type="matrix" values="${DARK}" result="a"/>${flood}<feComposite in2="a" operator="in"/><feComposite in2="SourceAlpha" operator="in"/>`
        : tone === "two"
          ? `<feColorMatrix type="matrix" values="${LIGHT}" result="a"/><feFlood flood-color="${color}" flood-opacity="0.4"/><feComposite in2="SourceAlpha" operator="in" result="base"/>${flood}<feComposite in2="a" operator="in" result="hi"/><feMerge><feMergeNode in="base"/><feMergeNode in="hi"/></feMerge>`
          : `${flood}<feComposite in2="SourceAlpha" operator="in"/>`;
  ctx.defs.push(
    `<filter id="${id}" x="-0.1" y="-0.1" width="1.2" height="1.2" color-interpolation-filters="sRGB">${body}</filter>`,
  );
  return id;
}

/** An icon in one color, centered in `box`: a shared <symbol>, painted by its tone's filter. */
export function glyph(ctx: Ctx, id: string, box: Box, color: string, scale = 1): string {
  const tone = iconTone(id, ctx.t.name);
  const size = Math.min(box.w, box.h) * TONE_FIT[tone] * scale;
  const r = renderIcon(id, SYMBOL_ID, {
    theme: ctx.t.name,
    background: ctx.k.tile,
    ink: color,
    ...(tone === "mono" ? { mono: color } : {}),
  });
  let body = r.body;
  // Line icons (Tabler) draw at the weight of the AWS glyphs: 1.5 display px.
  if (tone === "mono") {
    const weight = (1.5 * ctx.h * r.viewBox[2]) / size;
    body = body.replace(/stroke-width="([\d.]+)"/g, (m, w: string) =>
      Number(w) > weight ? `stroke-width="${n(weight)}"` : m,
    );
  }
  const viewBox = r.viewBox.join(" ");
  const key = `${viewBox}|${body}`;
  let ref = ctx.symbols.get(key);
  if (!ref) {
    ref = `${ctx.prefix}s${ctx.symbols.size + 1}`;
    ctx.symbols.set(key, ref);
    ctx.defs.push(
      `<symbol id="${ref}" viewBox="${viewBox}" overflow="visible">${body.replaceAll(`${SYMBOL_ID}-`, `${ref}-`)}</symbol>`,
    );
  }
  const paint = tone === "mono" ? "" : ` filter="url(#${toneFilter(ctx, tone, color)})"`;
  const x = box.x + (box.w - size) / 2;
  const y = box.y + (box.h - size) / 2;
  return `<use href="#${ref}" x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}"${paint}/>`;
}
