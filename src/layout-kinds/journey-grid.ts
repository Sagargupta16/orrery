// The journey grid: a card per step, stage columns and lane rows sized to fit them, the header
// cells, and the emotion curve under the rows.

import type { JourneyCurve, JourneyRow, JourneyStage } from "../journey.ts";
import { SIZES } from "../layout.ts";
import { textBlock } from "../text.ts";
import type { Box, Model, ModelNode, Point, TextBlock } from "../types.ts";

// Grid metrics in px before layout.spacing scales the gaps.
const GUTTER = 14;
const CELL_PAD = 10;
const STACK = 10;
const TEXT_MAX = 150;
const ICON_MAX = 32;
const ROW_LABEL = 12.5;
const ROW_LABEL_MAX = 116;
const STAGE_LABEL = 13;
const DIGIT = 22;
const EMOTION_H = 136;
/** Room between a scale end and the band edge, for a dot and its face. */
const EMOTION_PAD = 22;
const END_LABEL = 11;
export const ARROW = 12;

export const round = (v: number) => Math.round(v * 100) / 100;

export interface Card {
  node: ModelNode;
  row: number;
  col: number;
  /** Position in its cell's stack. */
  k: number;
  S: number;
  label: TextBlock;
  note?: TextBlock;
  w: number;
  h: number;
  box: Box;
}

/** An edge's label and step badge, measured. */
export interface Unit {
  block?: TextBlock;
  w: number;
  h: number;
  stepW: number;
}

/** Rows (the steps in no group first, then one per group) and a card per step. */
interface Rows {
  rowIds: string[];
  cards: Card[];
  /** The cards of each cell, by `row:col`, in stack order. */
  cells: Map<string, Card[]>;
  byId: Map<string, Card>;
  /** Per row: the height of every card, the gap between stacked cards, the row's height. */
  cardH: number[];
  gap: number[];
  rowH: number[];
}

interface Headers {
  stageText: TextBlock[];
  colW: number[];
  rowText: TextBlock[];
  scored: Card[];
  emotionText?: TextBlock;
  endText: { label: TextBlock; score: number }[];
  headerW: number;
  stageH: number;
}

/** Everything the journey's phases share: sizes, cards, headers and where the grid lines are. */
export interface Grid extends Rows, Headers {
  model: Model;
  stages: string[];
  /** Gutter, padding inside a cell, gap between stacked cards, page margin. */
  G: number;
  pad: number;
  stack: number;
  P: number;
  titleBlock?: TextBlock;
  subtitleBlock?: TextBlock;
  gridX: number;
  gridY: number;
  /** Width of the gutter right of each stage but the last, and each edge's label size. */
  gut: number[];
  unit: Map<string, Unit>;
  colX: number[];
  lastCol: number;
  gridRight: number;
  rowY: number[];
  rowsBottom: number;
}

/** Measures every card and header and places the grid; each card gets its box. */
export function measureGrid(model: Model, stages: string[]): Grid {
  const s = model.spacing;
  const G = round(GUTTER * s);
  const pad = round(CELL_PAD * s);
  const stack = round(STACK * s);
  const P = SIZES.pad;
  const rows = cardRows(model, stages, pad, stack);
  const headers = headersOf(model, stages, rows, pad);
  const title = titleOf(model, P);
  const gutters = guttersOf(model, stages, rows.byId, G, pad);
  const grid = { model, stages, G, pad, stack, P, ...rows, ...headers, ...title, ...gutters };
  return { ...grid, ...placeGrid(grid) };
}

// ------------------------------------------------------------- rows and cards
function cardRows(model: Model, stages: string[], pad: number, stack: number): Rows {
  const groupIds = new Set(model.groups.map((g) => g.id));
  const rowOf = (n: ModelNode) => (n.parent && groupIds.has(n.parent) ? n.parent : "");
  const rowIds: string[] = [];
  if (model.nodes.some((n) => rowOf(n) === "")) rowIds.push("");
  for (const g of model.groups) if (model.nodes.some((n) => n.parent === g.id)) rowIds.push(g.id);
  const stageIx = new Map(stages.map((name, i) => [name, i]));

  const cards: Card[] = [];
  const cells = new Map<string, Card[]>();
  for (const n of model.nodes) {
    const row = rowIds.indexOf(rowOf(n));
    const col = stageIx.get(n.stage ?? "") ?? 0;
    const S = n.icon ? Math.min(n.iconSize, ICON_MAX) : 0;
    const label = textBlock(n.label, SIZES.nodeLabel, TEXT_MAX, 600);
    const note = n.note ? textBlock(n.note, SIZES.note, TEXT_MAX) : undefined;
    const textW = Math.max(label.width, note?.width ?? 0);
    const textH = label.height + (note ? note.height + 2 : 0);
    const key = `${row}:${col}`;
    const list = cells.get(key) ?? [];
    const card: Card = {
      node: n,
      row,
      col,
      k: list.length,
      S,
      label,
      note,
      w: Math.ceil(Math.max(128, 12 + (S ? S + 10 : 0) + textW + 14)),
      h: Math.ceil(Math.max(48, Math.max(textH, S) + 22)),
      box: { x: 0, y: 0, w: 0, h: 0 },
    };
    list.push(card);
    cells.set(key, list);
    cards.push(card);
  }
  // Every card in a row is as tall as the row's tallest, so the k-th cards of a row line up and the
  // main path runs straight across the stages.
  const cardH = rowIds.map((_, r) =>
    Math.max(0, ...cards.filter((c) => c.row === r).map((c) => c.h)),
  );
  const depth = rowIds.map((_, r) =>
    Math.max(1, ...cards.filter((c) => c.row === r).map((c) => c.k + 1)),
  );
  // A directed edge between cards of one stack needs room for its arrowhead; the whole row gets it.
  const byId = new Map(cards.map((c) => [c.node.id, c]));
  const gap = rowIds.map((_, r) =>
    model.edges.some((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      return a?.row === r && b?.row === r && a.col === b.col && a !== b && e.arrow !== "none";
    })
      ? Math.max(stack, ARROW + 14)
      : stack,
  );
  const rowH = rowIds.map((_, r) => {
    const d = depth[r] ?? 1;
    return round(2 * pad + d * (cardH[r] ?? 0) + (d - 1) * (gap[r] ?? stack));
  });
  return { rowIds, cards, cells, byId, cardH, gap, rowH };
}

// ------------------------------------------------------------- headers
function headersOf(model: Model, stages: string[], rows: Rows, pad: number): Headers {
  const { rowIds, cards } = rows;
  const stageText = stages.map((name) => textBlock(name, STAGE_LABEL, 180, 600));
  const colW = stages.map((_, c) =>
    Math.ceil(
      Math.max(
        ...cards.filter((x) => x.col === c).map((x) => x.w + 2 * pad),
        10 + DIGIT + 8 + (stageText[c]?.width ?? 0) + 12,
        96,
      ),
    ),
  );
  const rowText = rowIds.map((id) => {
    const g = model.groups.find((x) => x.id === id);
    return textBlock(id ? g?.label || id : "Steps", ROW_LABEL, ROW_LABEL_MAX, 600);
  });
  const scored = cards.filter((c) => c.node.score !== undefined);
  const emotionText = scored.length
    ? textBlock("Emotion", ROW_LABEL, ROW_LABEL_MAX, 600)
    : undefined;
  const endText = scored.length
    ? [
        { label: textBlock("Delighted", END_LABEL, 200), score: 2 },
        { label: textBlock("Frustrated", END_LABEL, 200), score: -2 },
      ]
    : [];
  const headerW = Math.ceil(
    Math.max(
      96,
      ...rowText.map((b) => b.width + 28),
      (emotionText?.width ?? 0) + 28,
      ...endText.map((x) => x.label.width + 28),
    ),
  );
  const stageH = Math.ceil(Math.max(DIGIT, ...stageText.map((b) => b.height)) + 20);
  return { stageText, colW, rowText, scored, emotionText, endText, headerW, stageH };
}

// ------------------------------------------------------------- title
function titleOf(model: Model, P: number) {
  const titleBlock = model.title ? textBlock(model.title, SIZES.title, 1400, 600, 1.25) : undefined;
  const subtitleBlock = model.subtitle
    ? textBlock(model.subtitle, SIZES.subtitle, 1400, 400)
    : undefined;
  // As layout(): whole pixels under the title, then the page margin.
  const top = titleBlock
    ? Math.ceil(P + titleBlock.height + (subtitleBlock ? subtitleBlock.height + 4 : 0) - 6)
    : 0;
  const gridX = P;
  const gridY = top + P;
  return { titleBlock, subtitleBlock, gridX, gridY };
}

/** A label between neighboring stages sits on its line in the gutter: widen that gutter to fit. */
function guttersOf(
  model: Model,
  stages: string[],
  byId: Map<string, Card>,
  G: number,
  pad: number,
): { gut: number[]; unit: Map<string, Unit> } {
  const gut = stages.slice(1).map(() => G);
  const unit = new Map<string, Unit>();
  for (const e of model.edges) {
    if (!e.label && e.step === undefined) continue;
    const block = e.label ? textBlock(e.label, SIZES.edgeLabel, SIZES.edgeLabelMax) : undefined;
    const stepW = e.step !== undefined ? SIZES.step + 2 : 0;
    const w = Math.ceil((block ? block.width + 12 : 0) + stepW + (block && stepW ? 2 : 0));
    const h = Math.ceil(Math.max(block ? block.height + 6 : 0, stepW ? SIZES.step : 0));
    unit.set(e.id, { block, w, h, stepW });
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b || Math.abs(a.col - b.col) !== 1) continue;
    const i = Math.min(a.col, b.col);
    gut[i] = Math.max(gut[i] ?? G, Math.ceil(w + 8 + ARROW - 2 * pad));
  }
  return { gut, unit };
}

// ------------------------------------------------------------- grid
function placeGrid(
  grid: Omit<Grid, "colX" | "lastCol" | "gridRight" | "rowY" | "rowsBottom">,
): Pick<Grid, "colX" | "lastCol" | "gridRight" | "rowY" | "rowsBottom"> {
  const { stages, rowIds, cards, G, pad, stack, cardH, gap, rowH, colW, gut } = grid;
  const { gridX, gridY, headerW, stageH } = grid;
  const colX: number[] = [];
  let x = gridX + headerW + G;
  for (let c = 0; c < stages.length; c++) {
    colX.push(round(x));
    x += (colW[c] ?? 0) + (gut[c] ?? 0);
  }
  const lastCol = stages.length - 1;
  const gridRight = round((colX[lastCol] ?? 0) + (colW[lastCol] ?? 0));
  const rowY: number[] = [];
  let y = gridY + stageH + G;
  for (let r = 0; r < rowIds.length; r++) {
    rowY.push(round(y));
    y += (rowH[r] ?? 0) + G;
  }
  const rowsBottom = round(y - G);

  for (const c of cards) {
    c.box = {
      x: round((colX[c.col] ?? 0) + pad),
      y: round((rowY[c.row] ?? 0) + pad + c.k * ((cardH[c.row] ?? 0) + (gap[c.row] ?? stack))),
      w: round((colW[c.col] ?? 0) - 2 * pad),
      h: round(cardH[c.row] ?? 0),
    };
  }
  return { colX, lastCol, gridRight, rowY, rowsBottom };
}

/** The column headers: a numbered disc and the stage name. */
export function stageHeaders(grid: Grid): JourneyStage[] {
  const { stages, colX, colW, gridY, stageH, stageText } = grid;
  return stages.map((_, c) => {
    const box = { x: colX[c] ?? 0, y: gridY, w: colW[c] ?? 0, h: stageH };
    const label = stageText[c] ?? textBlock("", STAGE_LABEL, 180, 600);
    const numberBox = {
      x: round(box.x + 10),
      y: round(box.y + (stageH - DIGIT) / 2),
      w: DIGIT,
      h: DIGIT,
    };
    return {
      label,
      box,
      labelBox: {
        x: round(numberBox.x + DIGIT + 8),
        y: round(box.y + (stageH - label.height) / 2),
        w: round(label.width),
        h: round(label.height),
      },
      number: String(c + 1),
      numberBox,
    };
  });
}

/** The row bands, each with its header cell and one cell per stage. */
export function rowBands(grid: Grid): JourneyRow[] {
  const { model, stages, rowIds, rowY, rowH, rowText, gridX, gridRight, headerW, colX, colW } =
    grid;
  return rowIds.map((id, r) => {
    const yy = rowY[r] ?? 0;
    const h = rowH[r] ?? 0;
    const header = { x: gridX, y: yy, w: headerW, h };
    const label = rowText[r] ?? textBlock("", ROW_LABEL, ROW_LABEL_MAX, 600);
    const color = model.groups.find((g) => g.id === id)?.color;
    return {
      id,
      label,
      box: { x: gridX, y: yy, w: round(gridRight - gridX), h },
      labelBox: {
        x: round(gridX + 14),
        y: round(yy + (h - label.height) / 2),
        w: round(label.width),
        h: round(label.height),
      },
      header,
      cells: stages.map((_, c) => ({ x: colX[c] ?? 0, y: yy, w: colW[c] ?? 0, h })),
      ...(color ? { color } : {}),
    };
  });
}

/** The emotion curve under the rows, when any step has a score. */
export function emotionCurve(grid: Grid): JourneyCurve | undefined {
  const { stages, colX, colW, gridX, gridRight, rowsBottom, G, headerW, scored } = grid;
  const { emotionText, endText } = grid;
  let curve: JourneyCurve | undefined;
  if (emotionText) {
    const by = round(rowsBottom + G);
    const band = {
      x: colX[0] ?? 0,
      y: by,
      w: round(gridRight - (colX[0] ?? 0)),
      h: EMOTION_H,
    };
    const zero = round(by + EMOTION_H / 2);
    const per = (EMOTION_H / 2 - EMOTION_PAD) / 2;
    const points: Point[] = [];
    const scores: number[] = [];
    stages.forEach((_, c) => {
      const here = scored.filter((x) => x.col === c).map((x) => x.node.score ?? 0);
      if (!here.length) return;
      const avg = here.reduce((a, b) => a + b, 0) / here.length;
      scores.push(round(avg));
      points.push({ x: round((colX[c] ?? 0) + (colW[c] ?? 0) / 2), y: round(zero - avg * per) });
    });
    const header = { x: gridX, y: by, w: headerW, h: EMOTION_H };
    curve = {
      band,
      points,
      scores,
      header,
      label: emotionText,
      labelBox: {
        x: round(gridX + 14),
        y: round(zero - emotionText.height / 2),
        w: round(emotionText.width),
        h: round(emotionText.height),
      },
      zero,
      unit: round(per),
      ends: endText.map(({ label, score }) => ({
        label,
        score,
        box: {
          x: round(gridX + 14),
          y: round(zero - score * per - label.height / 2),
          w: round(label.width),
          h: round(label.height),
        },
      })),
    };
  }
  return curve;
}
