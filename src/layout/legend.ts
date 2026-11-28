// The line-style key every layout draws: one row per entry in spec order, in a box whose right
// edge is on the right margin.

import { textBlock } from "../text.ts";
import type { LegendEntry, SceneLegend } from "../types.ts";
import { round } from "./geometry.ts";
import { SIZES } from "./sizes.ts";

/**
 * The key: one row per entry (a 28x12 sample, 8px gap, the meaning) with its top edge at `top`.
 * Callers pass a page margin below the content: `height - SIZES.pad + 12` on a canvas.
 */
export function placeLegend(entries: LegendEntry[], width: number, top: number): SceneLegend {
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
  const box = { x: Math.max(SIZES.pad, width - SIZES.pad - w), y: top, w, h };
  let y = box.y + P;
  const items = rows.map((r, i) => {
    const swatch = { x: box.x + P, y: round(y + (r.label.lead - 12) / 2), w: 28, h: 12 };
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
