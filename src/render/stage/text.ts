// Mono text: the stage faces, their measured widths, the sizes that fit a box and the text they draw.

import type { Box, TextBlock } from "../../types.ts";
import { esc, n } from "../svg.ts";

export const MONO =
  "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
/** Geist Mono advances every glyph 0.6 em (scripts/build-fonts.mjs checks it). */
const ADVANCE = 0.6;

export interface Face {
  size: number;
  weight: 400 | 700;
  caps: boolean;
  /** Letter spacing in em. */
  track: number;
}

export const LABEL: Face = { size: 11.5, weight: 700, caps: true, track: 0.08 };
export const NOTE: Face = { size: 10, weight: 400, caps: false, track: 0 };
export const EDGE: Face = { size: 9.5, weight: 700, caps: true, track: 0.06 };
export const HEADER: Face = { size: 11, weight: 700, caps: true, track: 0.1 };
export const TITLE: Face = { size: 18, weight: 700, caps: true, track: 0.06 };
export const SUBTITLE: Face = { size: 11.5, weight: 400, caps: false, track: 0 };
export const KEY: Face = { size: 9.5, weight: 700, caps: true, track: 0.06 };
export const DIGIT: Face = { size: 13, weight: 700, caps: true, track: 0 };

const chars = (s: string) => [...s].length;

export function monoWidth(s: string, f: Face, size = f.size): number {
  const c = chars(s);
  return c ? size * (c * (ADVANCE + f.track) - f.track) : 0;
}

/** The largest size up to the face's own (and at least `min`) at which every line fits `room`. */
export function sizeFor(lines: string[], f: Face, room: number, min = 8): number {
  const widest = Math.max(1, ...lines.map(chars));
  const size = (room + f.size * f.track) / (widest * (ADVANCE + f.track));
  return Math.max(min, Math.floor(Math.min(f.size, size) * 4) / 4);
}

/** One size for a set of fits: the low end, so most labels share it and outliers shrink alone. */
export function common(fits: number[], cap: number): number {
  if (!fits.length) return cap;
  const sorted = [...fits].sort((a, b) => a - b);
  return Math.min(cap, sorted[Math.floor(sorted.length * 0.2)] ?? cap);
}

/** Lines of mono text, each centered on the line slot layout measured for it. */
export function mono(
  lines: string[],
  f: Face,
  size: number,
  at: { x: number; y: number; lead: number },
  color: string,
  anchor: "start" | "middle",
  extra = "",
): string {
  if (!lines.length) return "";
  const track = f.track * size;
  // text-anchor middle also centers the spacing after the last letter; shift that back.
  const x = at.x + (anchor === "middle" ? track / 2 : 0);
  // Caps sit centered on the slot (cap height 0.71 em); mixed case on its x-height.
  const drop = (f.caps ? 0.355 : 0.33) * size;
  const spans = lines
    .map(
      (line, i) =>
        `<tspan x="${n(x)}" y="${n(at.y + (i + 0.5) * at.lead + drop)}">${esc(f.caps ? line.toUpperCase() : line)}</tspan>`,
    )
    .join("");
  const spacing = track ? ` letter-spacing="${n(track)}"` : "";
  const middle = anchor === "middle" ? ` text-anchor="middle"` : "";
  return `<text font-size="${n(size)}" font-weight="${f.weight}"${spacing} fill="${color}"${middle}${extra}>${spans}</text>`;
}

/** A layout text block redrawn in a stage face, in the box layout gave it. */
export function block(
  b: TextBlock,
  box: Box,
  f: Face,
  size: number,
  color: string,
  anchor: "start" | "middle" = "middle",
  extra = "",
): string {
  const lead = b.lines.length ? box.h / b.lines.length : b.lead;
  const x = anchor === "middle" ? box.x + box.w / 2 : box.x;
  return mono(b.lines, f, size, { x, y: box.y, lead }, color, anchor, extra);
}
