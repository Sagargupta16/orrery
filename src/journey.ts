// Customer journey maps (kind: journey): stages as columns, lanes as rows, a card per step and an
// emotion curve from the steps' scores. Its own grid layout, not ELK's.

import { animateOf, SIZES } from "./layout.ts";
import { measure, textBlock } from "./text.ts";
import type {
  Box,
  LegendEntry,
  Model,
  ModelEdge,
  ModelNode,
  Point,
  Scene,
  SceneEdge,
  SceneLegend,
  SceneNode,
  TextBlock,
  ThemeName,
} from "./types.ts";

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
const ARROW = 12;

const round = (v: number) => Math.round(v * 100) / 100;

interface Card {
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

type Side = "left" | "right" | "top" | "bottom";

interface Plan {
  e: ModelEdge;
  a: Card;
  b: Card;
  from: Side;
  to: Side;
  /**
   * h: across stages, straight or with one elbow in a gutter; bridge: over or under the cards
   * between, through a corridor; v: straight down or up a column; side: down a gutter beside it.
   */
  kind: "h" | "bridge" | "v" | "side";
  /** For h: which elbow, if any. */
  elbow?: "none" | "late" | "early";
  /** Gutters (by the column on their left) the line leaves and enters by; the corridor's y. */
  g1: number;
  g2: number;
  cy?: number;
  ps: Point;
  pt: Point;
}

/** The whole scene for a journey spec, or undefined to lay it out as a flow. */
export async function journeyLayout(model: Model, theme: ThemeName): Promise<Scene | undefined> {
  const stages = model.stages ?? [];
  if (!stages.length) return undefined;
  const s = model.spacing;
  const G = round(GUTTER * s);
  const pad = round(CELL_PAD * s);
  const stack = round(STACK * s);
  const P = SIZES.pad;

  // ------------------------------------------------------------- rows and cards
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

  // ------------------------------------------------------------- headers
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

  // ------------------------------------------------------------- title
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

  // A label between neighboring stages sits on its line in the gutter: widen that gutter to fit.
  const gut = stages.slice(1).map(() => G);
  const unit = new Map<string, { block?: TextBlock; w: number; h: number; stepW: number }>();
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

  // ------------------------------------------------------------- grid
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

  const journeyStages = stages.map((_, c) => {
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
  const rows = rowIds.map((id, r) => {
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

  // ------------------------------------------------------------- emotion
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
  const gridBottom = curve ? curve.band.y + curve.band.h : rowsBottom;

  // ------------------------------------------------------------- edges
  /** x of the gutter right of column c; -1 is left of the first stage, the last is the margin. */
  const gutterX = (c: number) =>
    c < 0
      ? round((colX[0] ?? 0) - G / 2)
      : c >= lastCol
        ? round(gridRight + G / 2)
        : round((colX[c] ?? 0) + (colW[c] ?? 0) + (gut[c] ?? G) / 2);
  /** Horizontal corridors: the gutters above, between and below the rows. */
  const corridors = [...rowY.map((ry) => round(ry - G / 2)), round(rowsBottom + G / 2)];
  const center = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const between = (a: Card, b: Card) =>
    cards.some((c) => {
      if (c === a || c === b || c.col !== a.col) return false;
      const lo = Math.min(a.box.y, b.box.y);
      const hi = Math.max(a.box.y + a.box.h, b.box.y + b.box.h);
      return c.box.y > lo && c.box.y < hi;
    });
  /** A horizontal line at y from x0 to x1 is clear of every card but the ones it links. */
  const clearH = (yy: number, x0: number, x1: number, skip: Card[]) =>
    !cards.some(
      (c) =>
        !skip.includes(c) &&
        c.box.y - 4 < yy &&
        yy < c.box.y + c.box.h + 4 &&
        c.box.x < Math.max(x0, x1) &&
        Math.min(x0, x1) < c.box.x + c.box.w,
    );
  const stackOf = (c: Card) => cells.get(`${c.row}:${c.col}`)?.length ?? 1;

  const plans: Plan[] = [];
  const sides: { e: ModelEdge; a: Card; b: Card }[] = [];
  for (const e of model.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    // Edges to a row (a group) or to the same step have no place in the grid.
    if (!a || !b || a === b) continue;
    const base = { e, a, b, ps: { x: 0, y: 0 }, pt: { x: 0, y: 0 } };
    if (a.col === b.col) {
      if (between(a, b)) sides.push({ e, a, b });
      else {
        const down = a.box.y < b.box.y;
        plans.push({
          ...base,
          from: down ? "bottom" : "top",
          to: down ? "top" : "bottom",
          kind: "v",
          g1: a.col,
          g2: a.col,
        });
      }
      continue;
    }
    const forward = a.col < b.col;
    const [from, to]: [Side, Side] = forward ? ["right", "left"] : ["left", "right"];
    const g1 = forward ? a.col : a.col - 1;
    const g2 = forward ? b.col - 1 : b.col;
    const sx = forward ? a.box.x + a.box.w : a.box.x;
    const tx = forward ? b.box.x : b.box.x + b.box.w;
    const ys = center(a.box).y;
    const yt = center(b.box).y;
    const elbow =
      Math.abs(ys - yt) < 0.5 && clearH(ys, sx, tx, [a, b])
        ? "none"
        : clearH(ys, sx, gutterX(g2), [a, b])
          ? "late"
          : clearH(yt, gutterX(g1), tx, [a, b])
            ? "early"
            : undefined;
    if (elbow) {
      plans.push({ ...base, from, to, kind: "h", elbow, g1, g2 });
      continue;
    }
    // A card in the way: bridge over (or under) it through the corridor nearest both ends. An end
    // that is the top (bottom) card of its cell, next to that corridor, leaves straight up (down).
    const mid = (ys + yt) / 2;
    const cy = [...corridors].sort((m, q) => Math.abs(m - mid) - Math.abs(q - mid))[0] ?? mid;
    const upright = (c: Card): Side | undefined =>
      cy === corridors[c.row] && c.k === 0
        ? "top"
        : cy === corridors[c.row + 1] && c.k === stackOf(c) - 1
          ? "bottom"
          : undefined;
    plans.push({
      ...base,
      from: upright(a) ?? from,
      to: upright(b) ?? to,
      kind: "bridge",
      g1,
      g2,
      cy,
    });
  }
  // A detour down its own column takes the less busy of the two gutters beside it.
  const load = new Map<number, number>();
  const use = (g: number) => load.set(g, (load.get(g) ?? 0) + 1);
  const across = (s: Side) => s === "left" || s === "right";
  for (const p of plans) {
    if (p.kind === "h" && p.elbow === "late") use(p.g2);
    if (p.kind === "h" && p.elbow === "early") use(p.g1);
    if (p.kind === "bridge" && across(p.from)) use(p.g1);
    if (p.kind === "bridge" && across(p.to)) use(p.g2);
  }
  for (const { e, a, b } of sides) {
    const left = a.col > 0 && (load.get(a.col - 1) ?? 0) < (load.get(a.col) ?? 0);
    const g = left ? a.col - 1 : a.col;
    use(g);
    const side: Side = left ? "left" : "right";
    plans.push({
      e,
      a,
      b,
      from: side,
      to: side,
      kind: "side",
      g1: g,
      g2: g,
      ps: { x: 0, y: 0 },
      pt: { x: 0, y: 0 },
    });
  }
  // Spec order, so ports and tracks do not depend on which kind an edge turned out to be.
  const order = new Map(model.edges.map((e, i) => [e.id, i]));
  plans.sort((m, q) => (order.get(m.e.id) ?? 0) - (order.get(q.e.id) ?? 0));

  // Ports: one end on a side sits at its middle; several spread along it, ordered by where their
  // other ends are, so they do not cross on the way out.
  const sideOf = (p: Plan, end: "from" | "to") => (end === "from" ? p.from : p.to);
  const ports = new Map<string, { p: Plan; end: "from" | "to" }[]>();
  for (const p of plans)
    for (const end of ["from", "to"] as const) {
      const c = end === "from" ? p.a : p.b;
      const key = `${c.node.id}|${sideOf(p, end)}`;
      ports.set(key, [...(ports.get(key) ?? []), { p, end }]);
    }
  for (const list of ports.values()) {
    const first = list[0];
    if (!first) continue;
    const side = sideOf(first.p, first.end);
    const own = first.end === "from" ? first.p.a : first.p.b;
    const b = own.box;
    const other = (x: { p: Plan; end: "from" | "to" }) =>
      center((x.end === "from" ? x.p.b : x.p.a).box);
    list.sort((m, q) => (across(side) ? other(m).y - other(q).y : other(m).x - other(q).x));
    const span = across(side) ? b.h : b.w;
    const step = list.length > 1 ? Math.min(12, (span - 16) / (list.length - 1)) : 0;
    list.forEach((x, i) => {
      const off = (i - (list.length - 1) / 2) * step;
      const c = center(b);
      const pt: Point =
        side === "left"
          ? { x: b.x, y: c.y + off }
          : side === "right"
            ? { x: b.x + b.w, y: c.y + off }
            : side === "top"
              ? { x: c.x + off, y: b.y }
              : { x: c.x + off, y: b.y + b.h };
      const r = { x: round(pt.x), y: round(pt.y) };
      if (x.end === "from") x.p.ps = r;
      else x.p.pt = r;
    });
  }
  // A lone end facing a spread one a few px off lines up with it, so that link stays straight.
  const alone = (c: Card, side: Side) => (ports.get(`${c.node.id}|${side}`)?.length ?? 0) <= 1;
  for (const p of plans) {
    const k = p.kind === "h" && p.elbow === "none" ? "y" : p.kind === "v" ? "x" : undefined;
    if (!k || Math.abs(p.ps[k] - p.pt[k]) < 0.01 || Math.abs(p.ps[k] - p.pt[k]) > 8) continue;
    if (alone(p.b, p.to)) p.pt = { ...p.pt, [k]: p.ps[k] };
    else if (alone(p.a, p.from)) p.ps = { ...p.ps, [k]: p.pt[k] };
  }

  const routes = new Map<string, Point[]>();
  /** Segments that may slide sideways (in a gutter or a corridor), by their first point. */
  const movable: { id: string; i: number; vertical: boolean; at: number }[] = [];
  for (const p of plans) {
    const { ps, pt } = p;
    const id = p.e.id;
    let pts: Point[];
    if (p.kind === "v") {
      const my = round((ps.y + pt.y) / 2);
      pts =
        Math.abs(ps.x - pt.x) < 0.01 ? [ps, pt] : [ps, { x: ps.x, y: my }, { x: pt.x, y: my }, pt];
    } else if (p.kind === "h" && p.elbow === "none" && Math.abs(ps.y - pt.y) < 0.01) {
      pts = [ps, pt];
    } else if (p.kind === "h" || p.kind === "side") {
      // A straight link that spread ports knocked off level elbows late, like any other.
      const g = gutterX(p.elbow === "early" ? p.g1 : p.g2);
      pts = [ps, { x: g, y: ps.y }, { x: g, y: pt.y }, pt];
      movable.push({ id, i: 1, vertical: true, at: g });
    } else {
      const cy = p.cy ?? 0;
      pts = [ps];
      if (across(p.from)) {
        const g = gutterX(p.g1);
        pts.push({ x: g, y: ps.y }, { x: g, y: cy });
        movable.push({ id, i: 1, vertical: true, at: g });
      } else pts.push({ x: ps.x, y: cy });
      movable.push({ id, i: pts.length - 1, vertical: false, at: cy });
      if (across(p.to)) {
        const g = gutterX(p.g2);
        movable.push({ id, i: pts.length, vertical: true, at: g });
        pts.push({ x: g, y: cy }, { x: g, y: pt.y });
      } else pts.push({ x: pt.x, y: cy });
      pts.push(pt);
    }
    routes.set(id, pts);
  }
  // Lines sharing a gutter or a corridor over the same stretch get their own tracks.
  const groupsOf = new Map<string, typeof movable>();
  for (const m of movable) {
    const key = `${m.vertical ? "v" : "h"}${m.at}`;
    groupsOf.set(key, [...(groupsOf.get(key) ?? []), m]);
  }
  for (const list of groupsOf.values()) {
    if (list.length < 2) continue;
    const span = (m: (typeof movable)[number]) => {
      const pts = routes.get(m.id) ?? [];
      const p = pts[m.i];
      const q = pts[m.i + 1];
      if (!p || !q) return [0, 0] as const;
      return m.vertical
        ? ([Math.min(p.y, q.y), Math.max(p.y, q.y)] as const)
        : ([Math.min(p.x, q.x), Math.max(p.x, q.x)] as const);
    };
    const sorted = [...list].sort((m, q) => (span(m)[0] ?? 0) - (span(q)[0] ?? 0));
    const ends: number[] = [];
    const track = new Map<(typeof movable)[number], number>();
    for (const m of sorted) {
      const [lo, hi] = span(m);
      let t = ends.findIndex((end) => end < lo - 6);
      if (t < 0) {
        t = ends.length;
        ends.push(hi);
      } else ends[t] = hi;
      track.set(m, t);
    }
    if (ends.length < 2) continue;
    const room = (m: (typeof movable)[number]) => (m.vertical ? G - 4 : G + 2 * pad - 12);
    for (const m of list) {
      const t = track.get(m) ?? 0;
      const gap = Math.min(6, room(m) / (ends.length - 1));
      const d = round((t - (ends.length - 1) / 2) * gap);
      const pts = routes.get(m.id);
      const p = pts?.[m.i];
      const q = pts?.[m.i + 1];
      if (!pts || !p || !q) continue;
      const k = m.vertical ? "x" : "y";
      pts[m.i] = { ...p, [k]: round(p[k] + d) };
      pts[m.i + 1] = { ...q, [k]: round(q[k] + d) };
    }
  }

  const edges: SceneEdge[] = [];
  for (const p of plans) {
    const points = routes.get(p.e.id);
    if (!points || points.length < 2) continue;
    edges.push({
      id: p.e.id,
      from: p.e.from,
      to: p.e.to,
      points,
      line: p.e.line,
      arrow: p.e.arrow,
      color: p.e.color,
      step: p.e.step,
      ...(p.e.flow ? { flow: p.e.flow } : {}),
    });
  }

  // ------------------------------------------------------------- nodes
  const nodes: SceneNode[] = cards.map((c) => {
    const n = c.node;
    const b = c.box;
    const textH = c.label.height + (c.note ? c.note.height + 2 : 0);
    const tx = b.x + 12 + (c.S ? c.S + 10 : 0);
    const ty = b.y + (b.h - textH) / 2;
    const node: SceneNode = {
      id: n.id,
      // Every step is a card: icon on the left, label and note beside it.
      look: "card",
      shape: n.shape,
      box: b,
      icon: n.icon,
      label: c.label,
      labelBox: {
        x: round(tx),
        y: round(ty),
        w: round(c.label.width),
        h: round(c.label.height),
      },
      note: c.note,
      color: n.color,
      badge: n.badge,
      url: n.url,
      parent: n.parent,
      ...(n.stage !== undefined ? { stage: n.stage } : {}),
      ...(n.score !== undefined ? { score: n.score } : {}),
    };
    if (c.S) node.iconBox = { x: round(b.x + 12), y: round(b.y + (b.h - c.S) / 2), w: c.S, h: c.S };
    if (c.note)
      node.noteBox = {
        x: round(tx),
        y: round(ty + c.label.height + 2),
        w: round(c.note.width),
        h: round(c.note.height),
      };
    if (n.badge) {
      // The pill on the card's top-right corner, as layout() places it.
      const w = round(Math.max(18, measure(n.badge, 10, 600) + 10));
      node.badgeBox = {
        x: round(Math.max(b.x + b.w - w / 2 - 2, b.x + b.w / 2 + 6)),
        y: round(b.y - 7),
        w,
        h: 16,
      };
    }
    return node;
  });

  // ------------------------------------------------------------- edge labels
  const taken: Box[] = [];
  const blocked: Box[] = [
    ...nodes.flatMap((nd) => [nd.box, nd.badgeBox].filter((x): x is Box => !!x)),
    ...journeyStages.map((st) => st.box),
    ...rows.map((r) => r.header),
    ...(curve ? [curve.band, curve.header] : []),
  ];
  const hits = (a: Box, b: Box, m = 0) =>
    a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
  const crossesBox = (p: Point, q: Point, b: Box) => {
    const x0 = Math.min(p.x, q.x);
    const x1 = Math.max(p.x, q.x);
    const y0 = Math.min(p.y, q.y);
    const y1 = Math.max(p.y, q.y);
    return x0 < b.x + b.w && b.x < x1 + 0.01 && y0 < b.y + b.h && b.y < y1 + 0.01;
  };
  for (const edge of edges) {
    const u = unit.get(edge.id);
    if (!u) continue;
    const { w, h } = u;
    const pts = edge.points;
    const segs = pts
      .slice(1)
      .map((q, i) => ({ p: pts[i] ?? q, q, last: i === pts.length - 2, first: i === 0 }))
      .sort((m, o) => len(o.p, o.q) - len(m.p, m.q));
    const candidates: { box: Box; on?: { p: Point; q: Point; last: boolean; first: boolean } }[] =
      [];
    for (const sg of segs) {
      const flat = Math.abs(sg.p.y - sg.q.y) < 0.5;
      for (const f of [0.5, 0.35, 0.65]) {
        const mx = sg.p.x + (sg.q.x - sg.p.x) * f;
        const my = sg.p.y + (sg.q.y - sg.p.y) * f;
        const on = { x: mx - w / 2, y: my - h / 2, w, h };
        // As classic labels sit: above a horizontal run, right of a vertical one; else on the line.
        if (flat) candidates.push({ box: { ...on, y: my - h - 3 } }, { box: { ...on, y: my + 3 } });
        else candidates.push({ box: { ...on, x: mx + 4 } }, { box: { ...on, x: mx - 4 - w } });
        candidates.push({ box: on, on: sg });
      }
    }
    const fits = (c: (typeof candidates)[number]) => {
      const b = c.box;
      if (b.x < gridX || b.y < gridY - G || b.x + b.w > gridRight + G || b.y + b.h > gridBottom + G)
        return false;
      if (blocked.some((o) => hits(b, o, 3))) return false;
      if (taken.some((o) => hits(b, o, 2))) return false;
      // No line runs through it or along its edge (DG212), but the one segment it sits on.
      const room = { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
      for (const other of edges) {
        const op = other.points;
        for (let i = 1; i < op.length; i++) {
          const p = op[i - 1];
          const q = op[i];
          if (!p || !q || (other === edge && c.on && p === c.on.p && q === c.on.q)) continue;
          if (crossesBox(p, q, room)) return false;
        }
      }
      if (c.on) {
        // The line shows on both sides of the chip and the arrowhead stays clear of it.
        const { p, q, last, first } = c.on;
        const flat = Math.abs(p.y - q.y) < 0.5;
        const [lo, hi] = flat
          ? [Math.min(p.x, q.x), Math.max(p.x, q.x)]
          : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
        const [b0, b1] = flat ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
        const toward = (end: Point) => (flat ? end.x : end.y);
        const headAt = (end: Point) =>
          (last && end === q && (edge.arrow === "end" || edge.arrow === "both")) ||
          (first && end === p && (edge.arrow === "start" || edge.arrow === "both"));
        const need = (end: Point) => (headAt(end) ? ARROW + 4 : 4);
        const ends = [p, q].map((end) => ({ v: toward(end), need: need(end) }));
        const loEnd = ends.find((x) => Math.abs(x.v - lo) < 0.01) ?? { need: 4 };
        const hiEnd = ends.find((x) => Math.abs(x.v - hi) < 0.01) ?? { need: 4 };
        if (b0 < lo + loEnd.need || b1 > hi - hiEnd.need) return false;
      }
      return true;
    };
    const chosen = candidates.find(fits) ?? candidates[0];
    if (!chosen) continue;
    const box = {
      x: round(chosen.box.x),
      y: round(chosen.box.y),
      w: chosen.box.w,
      h: chosen.box.h,
    };
    taken.push(box);
    if (edge.step !== undefined)
      edge.stepBox = {
        x: box.x,
        y: round(box.y + (box.h - SIZES.step) / 2),
        w: SIZES.step,
        h: SIZES.step,
      };
    if (u.block) {
      edge.label = u.block;
      edge.labelBox = {
        x: round(box.x + u.stepW + (u.stepW ? 2 : 0)),
        y: box.y,
        w: round(w - u.stepW - (u.stepW ? 2 : 0)),
        h,
      };
    }
  }

  // ------------------------------------------------------------- canvas
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
    title: titleBlock,
    titleBox,
    subtitle: subtitleBlock,
    subtitleBox,
    nodes,
    groups: [],
    edges,
    legend,
    description: describe(model, rowText, curve),
    kind: model.kind,
    ...(model.story ? { story: model.story } : {}),
    journey: { stages: journeyStages, rows, ...(curve ? { curve } : {}) },
  };
}

const len = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);

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
function describe(model: Model, rows: TextBlock[], curve: JourneyCurve | undefined): string {
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
