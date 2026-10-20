// Customer journey maps (kind: journey): stages as columns, lanes as rows, a card per step and an
// emotion curve from the steps' scores. Its own grid layout, not ELK's.
//
// The pieces live in layout-kinds/: journey-grid.ts (cards, headers, the grid and the curve),
// journey-edges.ts (planning, ports and tracks), journey-labels.ts (nodes and edge labels) and
// journey-canvas.ts (title, legend and alt text).

import { animateOf } from "./layout.ts";
import { canvasOf, describe } from "./layout-kinds/journey-canvas.ts";
import { journeyEdges } from "./layout-kinds/journey-edges.ts";
import { emotionCurve, measureGrid, rowBands, stageHeaders } from "./layout-kinds/journey-grid.ts";
import { journeyNodes, placeEdgeLabels } from "./layout-kinds/journey-labels.ts";
import type { Box, Model, Point, Scene, TextBlock, ThemeName } from "./types.ts";

export interface JourneyStage {
  /** The stage name, beside its number. */
  label: TextBlock;
  /** The header cell. */
  box: Box;
  labelBox: Box;
  /** "1", "2", ... drawn in a disc at `numberBox`. */
  number: string;
  numberBox: Box;
}

export interface JourneyRow {
  /** The group the row's steps are in; empty for the steps in no group. */
  id: string;
  label: TextBlock;
  /** The whole band: header cell and every stage cell. */
  box: Box;
  labelBox: Box;
  header: Box;
  /** One cell per stage, in stage order. */
  cells: Box[];
  /** The group's own color, drawn as an accent on the header. */
  color?: string;
}

export interface JourneyCurve {
  /** The plot band across the stage columns. */
  band: Box;
  /** One dot per stage that has scored steps, at the stage's average score. */
  points: Point[];
  scores: number[];
  /** The header cell on the left and its label, level with the neutral line. */
  header: Box;
  label: TextBlock;
  labelBox: Box;
  /** y of score 0, and px per score point. */
  zero: number;
  unit: number;
  /** The ends of the scale (2 and -2), in the header cell. */
  ends: { label: TextBlock; box: Box; score: number }[];
}

export interface SceneJourney {
  /** Column headers, one per stage, in order. */
  stages: JourneyStage[];
  /** Row bands, one per lane, with their headers. */
  rows: JourneyRow[];
  /** The emotion curve across the stages, when steps carry score:. */
  curve?: JourneyCurve;
}

/** The whole scene for a journey spec, or undefined to lay it out as a flow. */
export async function journeyLayout(model: Model, theme: ThemeName): Promise<Scene | undefined> {
  const stages = model.stages ?? [];
  if (!stages.length) return undefined;
  const grid = measureGrid(model, stages);
  const journeyStages = stageHeaders(grid);
  const rows = rowBands(grid);
  const curve = emotionCurve(grid);
  const gridBottom = curve ? curve.band.y + curve.band.h : grid.rowsBottom;
  const edges = journeyEdges(grid);
  const nodes = journeyNodes(grid);
  const blocked: Box[] = [
    ...nodes.flatMap((nd) => [nd.box, nd.badgeBox].filter((x): x is Box => !!x)),
    ...journeyStages.map((st) => st.box),
    ...rows.map((r) => r.header),
    ...(curve ? [curve.band, curve.header] : []),
  ];
  placeEdgeLabels(grid, edges, blocked, gridBottom);
  const { width, height, titleBox, subtitleBox, legend } = canvasOf(grid, gridBottom);

  return {
    width,
    height,
    theme,
    direction: model.direction,
    routing: model.routing,
    arrowhead: model.arrowhead,
    animate: animateOf(model),
    skin: model.skin,
    background: model.background,
    title: grid.titleBlock,
    titleBox,
    subtitle: grid.subtitleBlock,
    subtitleBox,
    nodes,
    groups: [],
    edges,
    legend,
    description: describe(model, grid.rowText, curve),
    kind: model.kind,
    ...(model.story ? { story: model.story } : {}),
    journey: { stages: journeyStages, rows, ...(curve ? { curve } : {}) },
  };
}
