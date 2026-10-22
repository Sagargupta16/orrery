// Timelines and roadmaps (kind: timeline): a date axis across, groups as lanes, items as bars
// (start and end) or points (date), milestones as diamonds. Its own layout, not ELK's.
//
// The pieces: dates.ts (calendar arithmetic), axis.ts (bounds, pitch, ticks), items.ts (items,
// label sides, rows and lanes), route.ts (dependency arrows) and canvas.ts (title, today marker,
// status key, legend and alt text). Every item is also a scene node (its label and icon) so ids,
// icons, checks and review work as on any diagram; render/timeline.ts draws the bars and markers.

import type {
  Box,
  ItemStatus,
  Model,
  Scene,
  TextBlock,
  ThemeName,
  TimeScale,
} from "../../types.ts";
import { animateOf, SIZES } from "../sizes.ts";
import { axisOf, boundsOf, columnsOf, DISPLAY, endOf, pitchOf, round, scaleOf } from "./axis.ts";
import { describe, keyOf, placeLegend, TODAY_STRIP, titleOf, todayOf } from "./canvas.ts";
import { dayOf, floorTo, nextOf } from "./dates.ts";
import {
  itemNodes,
  lanesOf,
  measureItems,
  overhangs,
  packRows,
  placeLanes,
  placeX,
} from "./items.ts";
import { placeEdgeLabels, routeEdges } from "./route.ts";

export type TimelineShape = "bar" | "point" | "milestone";

/** A major tick: the start of a column and the name of the period it spans. */
export interface TimelineTick {
  x: number;
  /** The column's width, to the next tick. */
  w: number;
  /** ISO first day of the period. */
  date: string;
  /** "Jan 2026", "Q3 2026", "2026", "Week of Jan 5 2026". */
  name: string;
  /** What the lower tier prints, centered in the column: "Jan", "Q3", "5". */
  label: TextBlock;
  labelBox: Box;
}

/** A cell of the upper tier (the years over months or quarters, the months over days or weeks). */
export interface TimelinePeriod {
  x: number;
  w: number;
  date: string;
  name: string;
  /** Unset when the cell is too narrow for even the short form. */
  label?: TextBlock;
  labelBox?: Box;
}

export interface TimelineAxis {
  scale: TimeScale;
  /** First and last day on the axis (ISO), padded to whole periods. */
  start: string;
  end: string;
  /** The header band over the plot, its period tier (absent on a year axis) and its tick tier. */
  box: Box;
  upper?: Box;
  lower: Box;
  periods: TimelinePeriod[];
  ticks: TimelineTick[];
  /** x of the minor ticks: quarters in years, months in quarters, weeks in months, days in weeks. */
  minor: number[];
  /** Width of one column, px. */
  pitch: number;
}

export interface TimelineLane {
  /** The top-level group the lane shows; "" for the items in no group. */
  id: string;
  /** The band across the plot. */
  box: Box;
  /** Rows of items, top to bottom: y and height. */
  tracks: { y: number; h: number }[];
  /** Palette slot for the lane's default color; -1 is the neutral row of ungrouped items. */
  slot: number;
  color?: string;
  /** The header cell left of the band, when the timeline has named lanes. */
  header?: Box;
  label?: TextBlock;
  labelBox?: Box;
  icon?: string;
  iconBox?: Box;
  /** How deep point labels had to stack (conventions.timeline-crowded reads it). */
  stack: number;
}

export interface TimelineItem {
  id: string;
  shape: TimelineShape;
  lane: number;
  track: number;
  /** The bar, or the marker's box; the scene node of the same id has it too. */
  box: Box;
  /** Where the dates fall: a bar's start and end, a point's x twice. */
  x0: number;
  x1: number;
  side: "inside" | "right" | "left";
  /** A done or at-risk bar with room at its end for the check or warning mark. */
  mark?: boolean;
  /** ISO dates as written (normalized): a span's first and last day, or a point's day. */
  start: string;
  end?: string;
  status?: ItemStatus;
  /** The axis bounds cut it off at the start, the end or both. */
  clipped?: "start" | "end" | "both";
  color?: string;
}

export interface TimelineToday {
  x: number;
  date: string;
  /** The line runs from under the chip to the bottom of the lanes, broken where it would cross text. */
  top: number;
  bottom: number;
  segments: { y0: number; y1: number }[];
  chip: Box;
  label: TextBlock;
  labelBox: Box;
}

export interface TimelineKey {
  kind: ItemStatus | "milestone";
  swatch: Box;
  label: TextBlock;
  labelBox: Box;
}

export interface SceneTimeline {
  axis: TimelineAxis;
  /** Where the lanes' bands run: right of the lane headers, under the axis. */
  plot: Box;
  lanes: TimelineLane[];
  items: TimelineItem[];
  today?: TimelineToday;
  /** One entry per status in use (and the milestone), under the lanes. */
  key?: { box: Box; items: TimelineKey[] };
}

/** The whole scene for a timeline spec, or undefined (nothing dated) to lay it out as a flow. */
export async function timelineLayout(model: Model, theme: ThemeName): Promise<Scene | undefined> {
  const tl = model.timeline ?? { scale: "month" as const };
  const scale = tl.scale;
  const lanes = lanesOf(model);
  const items = measureItems(model, lanes.laneOf);
  if (!items.length) return undefined;
  const P = SIZES.pad;
  const spacing = model.spacing;
  const title = titleOf(model);
  const headerX = P;
  const plotX = P + lanes.headerW + (lanes.headerW ? 10 : 0);
  // The README column shared out between the columns.
  const room = DISPLAY - plotX - P;

  const { from, to } = boundsOf(tl, items);
  let starts = columnsOf(from, to, scale);
  let end = endOf(starts, scale);
  let sc = scaleOf(starts, end, plotX, pitchOf(scale, starts, room));
  // A date on the first or last day would hang its marker out of the plot: one more column there,
  // unless the spec set that bound.
  const over = overhangs(items, sc);
  if ((over.left && !tl.start) || (over.right && !tl.end)) {
    if (over.left && !tl.start) starts = [floorTo((starts[0] ?? end) - 1, scale), ...starts];
    if (over.right && !tl.end) {
      starts = [...starts, end];
      end = nextOf(end, scale);
    }
    sc = scaleOf(starts, end, plotX, pitchOf(scale, starts, room));
  }
  placeX(items, sc);
  const linked = (a: string, b: string) =>
    model.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
  const rows = packRows(items, lanes.ids.length, linked, spacing);

  const todayDay = tl.today ? dayOf(tl.today) : undefined;
  const todayIn = todayDay !== undefined && todayDay >= (starts[0] ?? end) && todayDay < end;
  const axisTop = title.gridY + (todayIn ? TODAY_STRIP : 0);
  const { axis, bottom: axisBottom } = axisOf(scale, sc, axisTop);
  const lanesTop = round(axisBottom + 6);
  const plotRight = sc.x0 + starts.length * sc.pitch;
  // Labels outside the last bars may run past the last column; the bands run on under them.
  const bandRight = round(
    Math.max(plotRight, ...items.map((it) => (it.fx1 > it.bx1 ? it.fx1 + 8 : it.fx1))),
  );
  const placed = placeLanes(
    rows,
    lanes,
    { x: plotX, right: bandRight },
    headerX,
    lanesTop,
    spacing,
  );
  const { nodes, drawn } = itemNodes(items, placed.lanes, model);

  const plot: Box = {
    x: plotX,
    y: lanesTop,
    w: round(bandRight - plotX),
    h: round(placed.bottom - lanesTop),
  };
  const tracks = placed.lanes.flatMap((l) => l.tracks).sort((a, b) => a.y - b.y);
  const corridors = tracks.slice(1).map((t, i) => {
    const prev = tracks[i] ?? t;
    return round((prev.y + prev.h + t.y) / 2);
  });
  const field = {
    nodes,
    items: new Map(drawn.map((d) => [d.id, d])),
    corridors,
    plot,
    ...(todayIn ? { today: sc.x((todayDay ?? 0) + 0.5) } : {}),
  };
  const edges = routeEdges(model.edges, field);
  placeEdgeLabels(edges, field);

  const statuses = new Set(items.flatMap((it) => (it.status ? [it.status] : [])));
  const milestones = items.some((it) => it.shape === "milestone");
  const key = keyOf(statuses, milestones, headerX, round(placed.bottom + 16), bandRight);
  const bottom = key ? key.box.y + key.box.h : placed.bottom;
  let width = Math.ceil(
    Math.max(
      bandRight + P,
      (title.titleBlock?.width ?? 0) + 2 * P,
      (title.subtitleBlock?.width ?? 0) + 2 * P,
      key ? key.box.x + key.box.w + P : 0,
    ),
  );
  let height = Math.ceil(bottom + P);
  const legend = model.legend?.length ? placeLegend(model.legend, width, height) : undefined;
  if (legend) {
    width = Math.max(width, Math.ceil(legend.box.w + 2 * P));
    height = Math.ceil(legend.box.y + legend.box.h + P);
  }
  const today =
    todayIn && tl.today
      ? todayOf(sc.x((todayDay ?? 0) + 0.5), tl.today, title.gridY, placed.bottom, width, [
          ...axis.ticks.map((tk) => tk.labelBox),
          ...axis.periods.flatMap((pd) => (pd.labelBox ? [pd.labelBox] : [])),
          ...nodes.flatMap((nd) => [nd.labelBox, nd.noteBox, nd.iconBox].filter((b) => !!b)),
          ...edges.flatMap((e) => (e.labelBox ? [e.labelBox] : [])),
        ])
      : undefined;

  const timeline: SceneTimeline = {
    axis,
    plot,
    lanes: placed.lanes,
    items: drawn,
    ...(today ? { today } : {}),
    ...(key ? { key } : {}),
  };
  return {
    width,
    height,
    theme,
    direction: model.direction,
    // Every arrow is laid out as right angles here, whatever the spec's routing.
    routing: "orthogonal",
    arrowhead: model.arrowhead,
    animate: animateOf(model),
    skin: model.skin,
    background: model.background,
    title: title.titleBlock,
    titleBox: title.titleBox,
    subtitle: title.subtitleBlock,
    subtitleBox: title.subtitleBox,
    nodes,
    groups: [],
    edges,
    ...(legend ? { legend } : {}),
    description: describe(model, timeline, lanes.labels),
    kind: model.kind,
    ...(model.story ? { story: model.story } : {}),
    timeline,
  };
}
