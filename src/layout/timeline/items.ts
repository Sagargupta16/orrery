// Timeline items: bars for spans, dots for dates, diamonds for milestones. Each is measured, put
// in its lane (its top-level group), given a side for its label (inside the bar when it fits),
// then packed into the lane's rows so no two footprints touch.

import { textBlock } from "../../text.ts";
import type {
  Box,
  ItemStatus,
  Model,
  ModelGroup,
  ModelNode,
  SceneNode,
  TextBlock,
} from "../../types.ts";
import { round, type Scale } from "./axis.ts";
import { spanOf } from "./dates.ts";
import type { TimelineItem, TimelineLane, TimelineShape } from "./index.ts";

export const LABEL_SIZE = 13;
export const NOTE_SIZE = 11;
const LABEL_MAX = 200;
const LANE_SIZE = 13;
const LANE_MAX = 132;
export const BAR_H = 28;
/** Diamond and dot sizes, and an item's icon. */
const DIAMOND = 16;
const DOT = 12;
const ICON = 20;
/** Text inside a bar starts this far from its ends; outside, this far from the bar or marker. */
const INSET = 10;
const AWAY = 8;
/** Room at a done or at-risk bar's end for its check or warning mark. */
const MARK = 18;
/** Past a marker's label box, the most its stage face can spill. */
const SLACK = 7;
/** Bars stop short of their dates so neighbors in one row read as two. */
const SHRINK = 2;

// Gaps in px before layout.spacing scales them.
const ROW_GAP = 20;
const LANE_PAD = 12;
const LANE_GAP = 6;
/** Room in one row between a bar and the next when an arrow joins them. */
const ARROW_ROOM = 36;

/** Stage labels are Geist Mono caps (render/stage/text.ts LABEL and NOTE): boxes fit both faces. */
const monoWidth = (s: string, size: number, track: number) => {
  const c = [...s].length;
  return c ? size * (c * (0.6 + track) - track) : 0;
};
const boxWidth = (b: TextBlock, size: number, track: number) =>
  Math.max(b.width, ...b.lines.map((l) => monoWidth(l, size, track)));

export interface Item {
  node: ModelNode;
  index: number;
  shape: TimelineShape;
  /** Days: a span's first day and the day after its last, or a point twice. */
  t0: number;
  t1: number;
  lane: number;
  status?: ItemStatus;
  label: TextBlock;
  note?: TextBlock;
  labelW: number;
  noteW: number;
  textW: number;
  textH: number;
  /** Icon size, 0 without one. */
  S: number;
  /** The bar's or marker's x extent. */
  bx0: number;
  bx1: number;
  clipped?: "start" | "end" | "both";
  side: "inside" | "right" | "left";
  /** A bar too short for its icon carries it outside, with the label. */
  iconOutside: boolean;
  /** A done or at-risk bar with room for its mark at the end. */
  mark: boolean;
  /** The footprint's x extent: the bar or marker and its outside text. */
  fx0: number;
  fx1: number;
  /** Height of the bar (or marker), and of the whole item in its row. */
  barH: number;
  h: number;
  track: number;
}

export interface Lanes {
  /** Lane ids in order: "" (the items in no group) first, then each top-level group. */
  ids: string[];
  groups: (ModelGroup | undefined)[];
  labels: (TextBlock | undefined)[];
  headerW: number;
}

/** Which lane (top-level group) each node sits in, and the header column the lanes need. */
export function lanesOf(model: Model): Lanes & { laneOf: (n: ModelNode) => number } {
  const byId = new Map(model.groups.map((g) => [g.id, g]));
  const top = (id?: string): string => {
    let g = id ? byId.get(id) : undefined;
    for (let i = 0; g?.parent && i < 64; i++) g = byId.get(g.parent) ?? g;
    return g?.id ?? "";
  };
  const dated = model.nodes.filter((n) => n.when);
  const used = new Set(dated.map((n) => top(n.parent)));
  const ids = [
    ...(used.has("") ? [""] : []),
    ...model.groups.filter((g) => !g.parent && used.has(g.id)).map((g) => g.id),
  ];
  const groups = ids.map((id) => byId.get(id));
  const named = ids.some((id) => id);
  const loose = dated.filter((n) => !top(n.parent));
  const looseName = loose.every((n) => n.milestone) ? "Milestones" : "General";
  const labels = ids.map((id, i) =>
    named
      ? textBlock(id ? groups[i]?.label || id : looseName, LANE_SIZE, LANE_MAX, 600)
      : undefined,
  );
  const iconW = groups.some((g) => g?.icon) ? ICON + 8 : 0;
  const headerW = named
    ? Math.ceil(Math.max(96, ...labels.map((b) => (b?.width ?? 0) + 28 + iconW)))
    : 0;
  const index = new Map(ids.map((id, i) => [id, i]));
  return { ids, groups, labels, headerW, laneOf: (n) => index.get(top(n.parent)) ?? 0 };
}

/** Every dated node measured, in spec order; the undated ones have no place on the axis. */
export function measureItems(model: Model, laneOf: (n: ModelNode) => number): Item[] {
  const out: Item[] = [];
  model.nodes.forEach((node, index) => {
    if (!node.when) return;
    const { t0, t1, point } = spanOf(node.when);
    const shape: TimelineShape = node.milestone ? "milestone" : point ? "point" : "bar";
    const label = textBlock(node.label, LABEL_SIZE, LABEL_MAX, 600);
    const note = node.note ? textBlock(node.note, NOTE_SIZE, LABEL_MAX) : undefined;
    // A bar's label box holds either face at full size. Beside a marker the stage face shrinks to
    // its box (render/stage/draw-nodes.ts labelRoom), so the box is the classic text's own and the
    // footprint keeps the slack the stage text may take past it.
    const bar = shape === "bar";
    const labelW = Math.ceil(bar ? boxWidth(label, 11.5, 0.08) : label.width);
    const noteW = note ? Math.ceil(bar ? boxWidth(note, 10, 0) : note.width) : 0;
    out.push({
      node,
      index,
      shape,
      // A milestone written as a span marks the day the span ends.
      t0: shape === "milestone" && !point ? t1 - 0.5 : t0,
      t1: shape === "milestone" && !point ? t1 - 0.5 : t1,
      lane: laneOf(node),
      ...(node.status ? { status: node.status } : {}),
      label,
      ...(note ? { note } : {}),
      labelW,
      noteW,
      textW: Math.max(labelW, noteW),
      textH: label.height + (note ? note.height + 2 : 0),
      S: node.icon ? ICON : 0,
      bx0: 0,
      bx1: 0,
      side: "right",
      iconOutside: false,
      mark: false,
      fx0: 0,
      fx1: 0,
      barH: BAR_H,
      h: BAR_H,
      track: 0,
    });
  });
  return out;
}

/** Half the marker's width: a diamond, a dot, or the icon a dated item shows instead of a dot. */
const half = (it: Item) => (it.shape === "milestone" ? DIAMOND / 2 : it.S ? it.S / 2 : DOT / 2);

/** Whether a dated point at the axis edge would hang out of the plot. */
export function overhangs(items: Item[], sc: Scale): { left: boolean; right: boolean } {
  const end = sc.x0 + sc.starts.length * sc.pitch;
  const pts = items.filter((it) => it.shape !== "bar");
  return {
    left: pts.some((it) => sc.x(it.t0) - half(it) < sc.x0),
    right: pts.some((it) => sc.x(it.t0) + half(it) > end),
  };
}

/** x extents, label sides and footprints, from the scale. */
export function placeX(items: Item[], sc: Scale): void {
  const plotR = sc.x0 + sc.starts.length * sc.pitch;
  const first = sc.starts[0] ?? sc.end;
  for (const it of items) {
    const text = it.textW;
    const iconRoom = it.S ? it.S + 6 : 0;
    if (it.shape === "bar") {
      const a = sc.x(it.t0);
      const b = sc.x(it.t1);
      let x0 = a + SHRINK;
      let x1 = b - SHRINK;
      // A day on a month axis is a sliver: every bar is at least a dot wide.
      if (x1 - x0 < DOT) {
        const mid = (a + b) / 2;
        x0 = mid - DOT / 2;
        x1 = mid + DOT / 2;
      }
      it.bx0 = round(x0);
      it.bx1 = round(x1);
      const clip0 = it.t0 < first;
      const clip1 = it.t1 > sc.end;
      if (clip0 || clip1) it.clipped = clip0 && clip1 ? "both" : clip0 ? "start" : "end";
      const w = x1 - x0;
      const inner = INSET + iconRoom + text + INSET;
      if (inner <= w) {
        it.side = "inside";
        it.iconOutside = false;
        it.mark = (it.status === "done" || it.status === "at-risk") && inner + MARK <= w;
      } else {
        it.iconOutside = !!it.S && w < INSET + it.S + 6;
        const block = AWAY + (it.iconOutside ? iconRoom : 0) + text;
        it.side = x1 + block <= plotR || x0 - block < sc.x0 ? "right" : "left";
      }
      it.barH = it.side === "inside" ? Math.max(BAR_H, Math.ceil(it.textH + 10)) : BAR_H;
      it.h = Math.max(it.barH, Math.ceil(it.textH), it.iconOutside ? it.S : 0);
      const block = AWAY + (it.iconOutside ? iconRoom : 0) + text;
      it.fx0 = round(it.side === "left" ? x0 - block : x0);
      it.fx1 = round(it.side === "right" ? x1 + block : x1);
    } else {
      const x = sc.x(it.t0);
      const r = half(it);
      it.bx0 = round(x - r);
      it.bx1 = round(x + r);
      if (it.t0 < first || it.t0 > sc.end) it.clipped = it.t0 < first ? "start" : "end";
      // A milestone shows its icon beside the diamond; a dated item shows it instead of the dot.
      it.iconOutside = it.shape === "milestone" && !!it.S;
      const block = AWAY + 2 + (it.iconOutside ? iconRoom : 0) + text + SLACK;
      it.side = x + r + block <= plotR || x - r - block < sc.x0 ? "right" : "left";
      it.barH = 2 * r;
      it.h = Math.max(2 * r, Math.ceil(it.textH), it.iconOutside ? it.S : 0);
      it.fx0 = round(it.side === "left" ? x - r - block : x - r);
      it.fx1 = round(it.side === "right" ? x + r + block : x + r);
    }
  }
}

/** Whether one item's facing ends are plain bar ends (no text outside on that side). */
const bareRight = (it: Item) => it.shape === "bar" && it.side !== "right";
const bareLeft = (it: Item) => it.shape === "bar" && it.side !== "left";

/**
 * Each lane's items into rows, first fit in date order: a row takes an item when it clears the
 * row's last one, by a hair between two bars, more beside text, and room for an arrow when a
 * dependency joins the two.
 */
export function packRows(
  items: Item[],
  laneCount: number,
  linked: (a: string, b: string) => boolean,
  spacing: number,
): Item[][][] {
  const lanes: Item[][][] = Array.from({ length: laneCount }, () => []);
  const order = [...items].sort((a, b) => a.fx0 - b.fx0 || a.index - b.index);
  for (const it of order) {
    const rows = lanes[it.lane] ?? [];
    const fits = (row: Item[]) => {
      const last = row[row.length - 1];
      if (!last) return true;
      const gap = it.fx0 - last.fx1;
      const need = linked(last.node.id, it.node.id)
        ? ARROW_ROOM * spacing
        : bareRight(last) && bareLeft(it)
          ? 3
          : 10 * spacing;
      return gap >= need;
    };
    // After its predecessor in the same row when the arrow has room: a chain reads along one line.
    const after = rows.findIndex(
      (row) => !!row[row.length - 1] && linked(row[row.length - 1]?.node.id ?? "", it.node.id),
    );
    let k = after >= 0 && fits(rows[after] ?? []) ? after : rows.findIndex(fits);
    if (k < 0) {
      k = rows.length;
      rows.push([]);
    }
    rows[k]?.push(it);
    it.track = k;
    lanes[it.lane] = rows;
  }
  return lanes;
}

/**
 * The deepest pile of points one lane needed: how many point footprints (with the gap a row keeps
 * between them) share one x. 1 when none stack, 0 without points.
 */
export function stackDepth(rows: Item[][]): number {
  const pts = rows.flat().filter((it) => it.shape !== "bar");
  let deepest = pts.length ? 1 : 0;
  for (const p of pts) {
    const at = pts.filter((q) => q.fx0 <= p.fx0 && p.fx0 < q.fx1 + 10).length;
    deepest = Math.max(deepest, at);
  }
  return deepest;
}

/** Rows stacked down the lanes from `top`: each lane's band, its rows and its header cell. */
export function placeLanes(
  rows: Item[][][],
  lanes: Lanes,
  plot: { x: number; right: number },
  headerX: number,
  top: number,
  spacing: number,
): { lanes: TimelineLane[]; bottom: number } {
  const gap = round(ROW_GAP * spacing);
  const pad = round(LANE_PAD * spacing);
  const out: TimelineLane[] = [];
  let y = top;
  let slot = 0;
  lanes.ids.forEach((id, li) => {
    const laneRows = rows[li] ?? [];
    const heights = laneRows.map((r) => Math.max(BAR_H, ...r.map((it) => it.h)));
    const inner = heights.reduce((s, h) => s + h, 0) + gap * Math.max(0, heights.length - 1);
    const h = round(inner + 2 * pad);
    const box: Box = { x: plot.x, y: round(y), w: round(plot.right - plot.x), h };
    let ty = y + pad;
    const tracks = heights.map((th) => {
      const t = { y: round(ty), h: th };
      ty += th + gap;
      return t;
    });
    const group = lanes.groups[li];
    const label = lanes.labels[li];
    const lane: TimelineLane = {
      id,
      box,
      tracks,
      // The row of items in no group is neutral beside named lanes, colored when it is alone.
      slot: id || !lanes.headerW ? slot++ : -1,
      stack: stackDepth(laneRows),
      ...(group?.color ? { color: group.color } : {}),
    };
    if (label && lanes.headerW) {
      const header: Box = { x: headerX, y: box.y, w: lanes.headerW, h };
      const icon = group?.icon ?? undefined;
      const lx = headerX + 14 + (icon ? ICON + 8 : 0);
      lane.header = header;
      lane.label = label;
      lane.labelBox = {
        x: round(lx),
        y: round(box.y + (h - label.height) / 2),
        w: round(label.width),
        h: round(label.height),
      };
      if (icon) {
        lane.icon = icon;
        lane.iconBox = { x: headerX + 14, y: round(box.y + (h - ICON) / 2), w: ICON, h: ICON };
      }
    }
    out.push(lane);
    y += h + LANE_GAP;
  });
  return { lanes: out, bottom: round(y - LANE_GAP) };
}

/** The scene node and the drawing record of each item, once its row is placed. */
export function itemNodes(
  items: Item[],
  lanes: TimelineLane[],
  model: Model,
): { nodes: SceneNode[]; drawn: TimelineItem[] } {
  const nodes: SceneNode[] = [];
  const drawn: TimelineItem[] = [];
  const byGroup = new Map(model.groups.map((g) => [g.id, g]));
  for (const it of items) {
    const lane = lanes[it.lane];
    const t = lane?.tracks[it.track];
    if (!lane || !t) continue;
    const cy = t.y + t.h / 2;
    const n = it.node;
    const box: Box = {
      x: it.bx0,
      y: round(cy - it.barH / 2),
      w: round(it.bx1 - it.bx0),
      h: it.barH,
    };
    // The text block: the icon when it is not in the bar or in place of the dot, then the label
    // over the note, centered on the row's line.
    const iconInBlock = it.iconOutside && it.S > 0;
    let bx: number;
    if (it.side === "inside") {
      // Centered in the room the icon and the mark leave, so both skins' faces sit alike.
      const from = box.x + INSET + (it.S ? it.S + 6 : 0);
      const room = box.x + box.w - INSET - (it.mark ? MARK : 0) - from;
      bx = from + (room - it.textW) / 2;
    } else {
      const away = AWAY + (it.shape === "bar" ? 0 : 2);
      bx =
        it.side === "right"
          ? box.x + box.w + away + (iconInBlock ? it.S + 6 : 0)
          : box.x - away - it.textW;
    }
    const ty = cy - it.textH / 2;
    // Label and note share a center inside a bar, an edge outside it (the side facing the bar).
    const at = (w: number) =>
      it.side === "inside" ? bx + (it.textW - w) / 2 : it.side === "left" ? bx + it.textW - w : bx;
    const node: SceneNode = {
      id: n.id,
      // The timeline draws bars and markers (render/timeline.ts); the node is its text and icon.
      look: "icon",
      shape: it.shape === "bar" ? "rounded" : it.shape === "milestone" ? "diamond" : "circle",
      box,
      label: it.label,
      labelBox: { x: round(at(it.labelW)), y: round(ty), w: it.labelW, h: round(it.label.height) },
    };
    if (n.icon) {
      node.icon = n.icon;
      const S = it.S;
      const ix =
        it.shape === "point"
          ? box.x
          : iconInBlock
            ? bx - S - 6
            : it.shape === "bar"
              ? box.x + INSET
              : box.x;
      node.iconBox = { x: round(ix), y: round(cy - S / 2), w: S, h: S };
    }
    if (it.note) {
      node.note = it.note;
      node.noteBox = {
        x: round(at(it.noteW)),
        y: round(ty + it.label.height + 2),
        w: it.noteW,
        h: round(it.note.height),
      };
    }
    const color = n.color ?? (n.parent ? byGroup.get(n.parent)?.color : undefined) ?? lane.color;
    if (color) node.color = color;
    if (n.url) node.url = n.url;
    nodes.push(node);
    drawn.push({
      id: n.id,
      shape: it.shape,
      lane: it.lane,
      track: it.track,
      box,
      x0: round(it.shape === "bar" ? it.bx0 : (it.bx0 + it.bx1) / 2),
      x1: round(it.shape === "bar" ? it.bx1 : (it.bx0 + it.bx1) / 2),
      side: it.side,
      ...(it.mark ? { mark: true } : {}),
      start: n.when?.start ?? "",
      ...(n.when?.end ? { end: n.when.end } : {}),
      ...(it.status ? { status: it.status } : {}),
      ...(it.clipped ? { clipped: it.clipped } : {}),
      ...(color ? { color } : {}),
    });
  }
  return { nodes, drawn };
}
