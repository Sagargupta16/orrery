// The journey canvas around the grid: title, subtitle and legend boxes, and the alt text.

import type { Box, Model, SceneLegend, TextBlock } from "../../types.ts";
import { placeLegend } from "../legend.ts";
import { SIZES } from "../sizes.ts";
import { type Card, type Grid, round } from "./grid.ts";
import type { JourneyCurve } from "./index.ts";

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
    legend = placeLegend(model.legend, width, height - SIZES.pad + 12);
    width = Math.max(width, Math.ceil(legend.box.w + P * 2));
    height = Math.ceil(legend.box.y + legend.box.h + P);
  }
  return { width, height, titleBox, subtitleBox, legend };
}

/** Alt text: the stages, the rows, the emotion at each stage and the links. */
export function describe(
  model: Model,
  rows: TextBlock[],
  curve: JourneyCurve | undefined,
  scored: Card[],
): string {
  const name = (id: string) => model.nodes.find((n) => n.id === id)?.label ?? id;
  const stages = model.stages ?? [];
  const parts: string[] = [];
  if (model.title) parts.push(`${model.title}.`);
  parts.push(
    `Customer journey in ${stages.length} stages (${stages.join(", ")}) and ${rows.length} rows (${rows.map((r) => r.lines.join(" ")).join(", ")}), ${model.nodes.length} steps.`,
  );
  if (curve?.scores.length) {
    // By column, as emotionCurve takes them: two stages of one name are still two columns.
    const cols = [...new Set(scored.map((c) => c.col))].sort((a, b) => a - b);
    const sign = (v: number) => (v > 0 ? `+${v}` : String(v));
    parts.push(
      `Emotion from -2 to 2 by stage: ${cols.map((c, i) => `${stages[c] ?? ""} ${sign(curve.scores[i] ?? 0)}`).join(", ")}.`,
    );
  }
  const flows = model.edges
    .slice(0, 24)
    .map((e) => `${name(e.from)} to ${name(e.to)}${e.label ? ` (${e.label})` : ""}`);
  if (flows.length)
    parts.push(`Connections: ${flows.join("; ")}${model.edges.length > 24 ? "; and more" : ""}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
