// The journey canvas around the grid: title, subtitle and legend boxes, and the alt text.

import type { JourneyCurve } from "../journey.ts";
import { SIZES } from "../layout.ts";
import { textBlock } from "../text.ts";
import type { Box, LegendEntry, Model, SceneLegend, TextBlock } from "../types.ts";
import { type Grid, round } from "./journey-grid.ts";

export interface Canvas {
  width: number;
  height: number;
  titleBox?: Box;
  subtitleBox?: Box;
  legend?: SceneLegend;
}

/** The canvas: the grid and the page margin, wide enough for the title and the legend under it. */
export function canvasOf(grid: Grid, gridBottom: number): Canvas {
  const { model, gridRight, P, titleBlock, subtitleBlock } = grid;
  let width = Math.ceil(gridRight + P);
  let height = Math.ceil(gridBottom + P);
  let titleBox: Box | undefined;
  let subtitleBox: Box | undefined;
  if (titleBlock) {
    titleBox = { x: P, y: P - 4, w: round(titleBlock.width), h: round(titleBlock.height) };
    width = Math.max(width, Math.ceil(titleBlock.width + P * 2));
    if (subtitleBlock) {
      subtitleBox = {
        x: P,
        y: round(titleBox.y + titleBlock.height + 4),
        w: round(subtitleBlock.width),
        h: round(subtitleBlock.height),
      };
      width = Math.max(width, Math.ceil(subtitleBlock.width + P * 2));
    }
  }
  let legend: SceneLegend | undefined;
  if (model.legend?.length) {
    legend = placeLegend(model.legend, width, height);
    width = Math.max(width, Math.ceil(legend.box.w + P * 2));
    height = Math.ceil(legend.box.y + legend.box.h + P);
  }
  return { width, height, titleBox, subtitleBox, legend };
}

/** The line-style key under the grid, right-aligned, as layout() draws it. */
function placeLegend(entries: LegendEntry[], width: number, height: number): SceneLegend {
  const P = 10;
  const rows = entries.map((e) => ({
    line: e.line,
    label: textBlock(e.label, SIZES.edgeLabel, 240),
  }));
  const w = Math.ceil(P + 28 + 8 + Math.max(...rows.map((r) => r.label.width)) + P);
  const pitch = rows.map((r) => Math.max(18, r.label.height + 3));
  const last = rows[rows.length - 1]?.label.height ?? 0;
  const h = Math.ceil(P + pitch.slice(0, -1).reduce((a, b) => a + b, 0) + last + P);
  const box = { x: Math.max(SIZES.pad, width - SIZES.pad - w), y: height - SIZES.pad + 12, w, h };
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
    return { line: r.line, swatch, label: r.label, labelBox };
  });
  return { box, items };
}

/** Alt text: the stages, the rows, the emotion at each stage and the links. */
export function describe(model: Model, rows: TextBlock[], curve: JourneyCurve | undefined): string {
  const name = (id: string) => model.nodes.find((n) => n.id === id)?.label ?? id;
  const stages = model.stages ?? [];
  const parts: string[] = [];
  if (model.title) parts.push(`${model.title}.`);
  parts.push(
    `Customer journey in ${stages.length} stages (${stages.join(", ")}) and ${rows.length} rows (${rows.map((r) => r.lines.join(" ")).join(", ")}), ${model.nodes.length} steps.`,
  );
  if (curve?.scores.length) {
    const scored = stages.filter((st) =>
      model.nodes.some((n) => n.stage === st && n.score !== undefined),
    );
    const sign = (v: number) => (v > 0 ? `+${v}` : String(v));
    parts.push(
      `Emotion from -2 to 2 by stage: ${scored.map((st, i) => `${st} ${sign(curve.scores[i] ?? 0)}`).join(", ")}.`,
    );
  }
  const flows = model.edges
    .slice(0, 24)
    .map((e) => `${name(e.from)} to ${name(e.to)}${e.label ? ` (${e.label})` : ""}`);
  if (flows.length)
    parts.push(`Connections: ${flows.join("; ")}${model.edges.length > 24 ? "; and more" : ""}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
