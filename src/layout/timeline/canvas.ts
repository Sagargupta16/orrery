// The canvas around the plot: title and subtitle, the today marker, the status key, the
// line-style legend, and the alt text.

import { textBlock } from "../../text.ts";
import type { Box, ItemStatus, LegendEntry, Model, SceneLegend, TextBlock } from "../../types.ts";
import { SIZES } from "../sizes.ts";
import { round } from "./axis.ts";
import { dayName, dayOf, periodName } from "./dates.ts";
import type { SceneTimeline, TimelineKey, TimelineToday } from "./index.ts";

/** The strip over the axis the today chip sits in. */
export const TODAY_STRIP = 24;
const KEY_SIZE = 11.5;
const KEY_SWATCH = 24;

export const STATUS_NAMES: Record<ItemStatus, string> = {
  done: "Done",
  active: "In progress",
  planned: "Planned",
  "at-risk": "At risk",
};
const ORDER: ItemStatus[] = ["done", "active", "planned", "at-risk"];

/** The title block as journeys and flows place it; `gridY` is where the figure starts. */
export function titleOf(model: Model) {
  const P = SIZES.pad;
  const titleBlock = model.title ? textBlock(model.title, SIZES.title, 1400, 600, 1.25) : undefined;
  const subtitleBlock = model.subtitle
    ? textBlock(model.subtitle, SIZES.subtitle, 1400, 400)
    : undefined;
  const top = titleBlock
    ? Math.ceil(P + titleBlock.height + (subtitleBlock ? subtitleBlock.height + 4 : 0) - 6)
    : 0;
  let titleBox: Box | undefined;
  let subtitleBox: Box | undefined;
  if (titleBlock) {
    titleBox = { x: P, y: P - 4, w: round(titleBlock.width), h: round(titleBlock.height) };
    if (subtitleBlock)
      subtitleBox = {
        x: P,
        y: round(titleBox.y + titleBlock.height + 4),
        w: round(subtitleBlock.width),
        h: round(subtitleBlock.height),
      };
  }
  return { titleBlock, subtitleBlock, titleBox, subtitleBox, gridY: top + P };
}

/**
 * The today line from the chip over the axis to the bottom of the lanes, broken around every text
 * box it would cross (tick labels, item labels) so the text stays readable.
 */
export function todayOf(
  x: number,
  date: string,
  top: number,
  bottom: number,
  canvasW: number,
  texts: Box[],
): TimelineToday {
  const label = textBlock("Today", 10.5, 200, 600);
  const w = Math.ceil(label.width + 14);
  const h = 18;
  const cx = Math.min(Math.max(x, SIZES.pad + w / 2), canvasW - SIZES.pad - w / 2);
  const chip = { x: round(cx - w / 2), y: round(top + (TODAY_STRIP - h) / 2 - 2), w, h };
  const y0 = round(chip.y + h);
  const cuts = texts
    .filter((b) => x >= b.x - 3 && x <= b.x + b.w + 3)
    .map((b) => [b.y - 3, b.y + b.h + 3] as const)
    .sort((a, b) => a[0] - b[0]);
  const segments: { y0: number; y1: number }[] = [];
  let from = y0;
  for (const [a, b] of cuts) {
    if (a > from) segments.push({ y0: round(from), y1: round(Math.min(a, bottom)) });
    from = Math.max(from, b);
  }
  if (from < bottom) segments.push({ y0: round(from), y1: round(bottom) });
  return {
    x: round(x),
    date,
    top: y0,
    bottom: round(bottom),
    segments: segments.filter((sg) => sg.y1 - sg.y0 > 1),
    chip,
    label,
    labelBox: {
      x: round(chip.x + (w - label.width) / 2),
      y: round(chip.y + (h - label.height) / 2),
      w: round(label.width),
      h: round(label.height),
    },
  };
}

/** One key entry per status in use, and the milestone diamond when there are milestones. */
export function keyOf(
  statuses: Set<ItemStatus>,
  milestones: boolean,
  x: number,
  top: number,
  right: number,
): { box: Box; items: TimelineKey[] } | undefined {
  const kinds: TimelineKey["kind"][] = ORDER.filter((s) => statuses.has(s));
  if (!kinds.length) return undefined;
  if (milestones) kinds.push("milestone");
  const items: TimelineKey[] = [];
  let cx = x;
  let cy = top;
  const rowH = 20;
  for (const kind of kinds) {
    const label = textBlock(kind === "milestone" ? "Milestone" : STATUS_NAMES[kind], KEY_SIZE, 200);
    const w = KEY_SWATCH + 8 + label.width;
    if (cx > x && cx + w > right) {
      cx = x;
      cy += rowH;
    }
    const swatch = { x: round(cx), y: round(cy + (rowH - 12) / 2), w: KEY_SWATCH, h: 12 };
    items.push({
      kind,
      swatch,
      label,
      labelBox: {
        x: round(cx + KEY_SWATCH + 8),
        y: round(cy + (rowH - label.height) / 2),
        w: round(label.width),
        h: round(label.height),
      },
    });
    cx += w + 22;
  }
  const r = Math.max(...items.map((it) => it.labelBox.x + it.labelBox.w));
  return { box: { x, y: top, w: round(r - x), h: round(cy + rowH - top) }, items };
}

/** The line-style key, right-aligned under everything, as journeys place it. */
export function placeLegend(entries: LegendEntry[], width: number, height: number): SceneLegend {
  const P = 10;
  const rows = entries.map((e) => ({
    line: e.line,
    label: textBlock(e.label, SIZES.edgeLabel, 240),
    ...(e.color ? { color: e.color } : {}),
    ...(e.chip ? { chip: true } : {}),
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

/** Alt text: the span and scale, the lanes and what is in them, milestones, today, dependencies. */
export function describe(
  model: Model,
  tl: SceneTimeline,
  laneNames: (TextBlock | undefined)[],
): string {
  const name = (id: string) => model.nodes.find((n) => n.id === id)?.label ?? id;
  const { axis } = tl;
  const first = periodName(dayOf(axis.start), axis.scale);
  const last = periodName(dayOf(axis.end), axis.scale);
  const parts: string[] = [];
  if (model.title) parts.push(`${model.title}.`);
  const lanes = tl.lanes.map((l, i) => laneNames[i]?.lines.join(" ") ?? (l.id || "Items"));
  parts.push(
    `Timeline by ${axis.scale} from ${first} to ${last}, ${tl.items.length} items${lanes.length > 1 ? ` in ${lanes.length} lanes (${lanes.join(", ")})` : ""}.`,
  );
  const when = (id: string) => {
    const it = tl.items.find((x) => x.id === id);
    if (!it) return "";
    const s = dayName(dayOf(it.start));
    return it.end ? `${s} to ${dayName(dayOf(it.end))}` : s;
  };
  const line = tl.items
    .slice(0, 30)
    .map(
      (it) =>
        `${name(it.id)} (${when(it.id)}${it.status ? `, ${STATUS_NAMES[it.status].toLowerCase()}` : ""}${it.shape === "milestone" ? ", milestone" : ""})`,
    );
  if (line.length)
    parts.push(`Items: ${line.join("; ")}${tl.items.length > 30 ? "; and more" : ""}.`);
  if (tl.today) parts.push(`Today is ${dayName(dayOf(tl.today.date))}.`);
  const deps = model.edges
    .slice(0, 24)
    .map((e) => `${name(e.from)} before ${name(e.to)}${e.label ? ` (${e.label})` : ""}`);
  if (deps.length)
    parts.push(`Dependencies: ${deps.join("; ")}${model.edges.length > 24 ? "; and more" : ""}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
