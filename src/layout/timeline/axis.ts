// The time axis: its bounds padded to whole periods, the pitch of a column (sized so a year of
// months fits a README column), the ticks and their labels, the upper tier and the minor ticks.

import { textBlock } from "../../text.ts";
import type { Box, ModelTimeline, TimeScale } from "../../types.ts";
import {
  COARSER,
  dayOf,
  FINER,
  floorTo,
  isoOf,
  nextOf,
  periodName,
  periods,
  shortName,
  tickText,
} from "./dates.ts";
import type { TimelineAxis, TimelinePeriod, TimelineTick } from "./index.ts";

export const round = (v: number) => Math.round(v * 100) / 100;

/** The README column every timeline is sized for; wider timelines shrink to it. */
export const DISPLAY = 880;
const TICK_SIZE = 11.5;
const PERIOD_SIZE = 12;
const UPPER_H = 22;
const LOWER_H = 24;
/** Narrowest and widest column, px. */
const MIN_PITCH: Record<TimeScale, number> = {
  day: 22,
  week: 30,
  month: 40,
  quarter: 56,
  year: 64,
};
const MAX_PITCH = 260;

/** Days to px and back, column by column: every period is one pitch wide. */
export interface Scale {
  starts: number[];
  /** The day after the axis ends. */
  end: number;
  x0: number;
  pitch: number;
  x: (day: number) => number;
}

export function scaleOf(starts: number[], end: number, x0: number, pitch: number): Scale {
  const x = (day: number) => {
    const first = starts[0] ?? end;
    if (day <= first) return x0;
    if (day >= end) return x0 + starts.length * pitch;
    let i = starts.length - 1;
    while (i > 0 && (starts[i] ?? end) > day) i--;
    const a = starts[i] ?? first;
    const b = starts[i + 1] ?? end;
    return x0 + (i + (day - a) / Math.max(1e-9, b - a)) * pitch;
  };
  return { starts, end, x0, pitch, x };
}

/** First day and the day after the last, from the items and today, unless the spec bounds them. */
export function boundsOf(
  tl: ModelTimeline,
  spans: { t0: number; t1: number }[],
): { from: number; to: number } {
  const today = tl.today ? dayOf(tl.today) : undefined;
  const lows = [...spans.map((s) => s.t0), ...(today !== undefined ? [today] : [])];
  const highs = [...spans.map((s) => s.t1), ...(today !== undefined ? [today + 1] : [])];
  const fallback = today ?? dayOf("2026-01-01");
  const lo = tl.start ? dayOf(tl.start) : lows.length ? Math.min(...lows) : fallback;
  const hi = tl.end ? dayOf(tl.end) + 1 : highs.length ? Math.max(...highs) : lo + 1;
  return { from: lo, to: Math.max(hi, lo + 1) };
}

/** Period starts covering from..to, whole periods at both ends. */
export function columnsOf(from: number, to: number, scale: TimeScale): number[] {
  const starts = periods(from, to, scale);
  return starts.length ? starts : [floorTo(from, scale)];
}

/** The day after the last column. */
export const endOf = (starts: number[], scale: TimeScale) =>
  nextOf(starts[starts.length - 1] ?? 0, scale);

/** The column pitch: the README width shared out, never so narrow a tick label does not fit. */
export function pitchOf(scale: TimeScale, starts: number[], room: number): number {
  const widest = Math.max(
    0,
    ...starts.map((d) => textBlock(tickText(d, scale), TICK_SIZE, 400, 600).width),
  );
  const min = Math.max(MIN_PITCH[scale], Math.ceil(widest + 16));
  // Rounded down, so the columns never push the canvas past the room.
  const fit = Math.floor((room / Math.max(1, starts.length)) * 100) / 100;
  return Math.max(min, Math.min(MAX_PITCH, fit));
}

/** The axis band over the plot, from `top`: ticks, the period tier above them and minor ticks. */
export function axisOf(
  scale: TimeScale,
  sc: Scale,
  top: number,
): { axis: TimelineAxis; bottom: number } {
  const coarser = COARSER[scale];
  const upperH = coarser ? UPPER_H : 0;
  const x1 = sc.x0 + sc.starts.length * sc.pitch;
  const box: Box = { x: sc.x0, y: top, w: round(x1 - sc.x0), h: upperH + LOWER_H };
  const lower: Box = { x: sc.x0, y: top + upperH, w: box.w, h: LOWER_H };
  const ticks: TimelineTick[] = sc.starts.map((d, i) => {
    const label = textBlock(tickText(d, scale), TICK_SIZE, 400, 600);
    const x = round(sc.x0 + i * sc.pitch);
    return {
      x,
      w: sc.pitch,
      date: isoOf(d),
      name: periodName(d, scale),
      label,
      labelBox: {
        x: round(x + (sc.pitch - label.width) / 2),
        y: round(lower.y + (LOWER_H - label.height) / 2),
        w: round(label.width),
        h: round(label.height),
      },
    };
  });
  const tiers: TimelinePeriod[] = [];
  if (coarser) {
    const first = sc.starts[0] ?? sc.end;
    for (const d of periods(first, sc.end, coarser)) {
      const px0 = sc.x(Math.max(d, first));
      const px1 = sc.x(Math.min(nextOf(d, coarser), sc.end));
      const w = round(px1 - px0);
      const name = periodName(d, coarser);
      // The name if it fits, else the short form ('27, Jan), else the cell stays blank.
      const label = [name, shortName(d, coarser)]
        .map((s) => textBlock(s, PERIOD_SIZE, 400, 600))
        .find((b) => b.width + 16 <= w);
      const cell: TimelinePeriod = { x: round(px0), w, name, date: isoOf(d) };
      if (label) {
        cell.label = label;
        cell.labelBox = {
          x: round(px0 + 8),
          y: round(top + (UPPER_H - label.height) / 2),
          w: round(label.width),
          h: round(label.height),
        };
      }
      tiers.push(cell);
    }
  }
  const finer = FINER[scale];
  const majors = new Set(sc.starts);
  const minor = finer
    ? periods(sc.starts[0] ?? sc.end, sc.end, finer)
        .filter((d) => !majors.has(d) && d > (sc.starts[0] ?? 0))
        .map((d) => round(sc.x(d)))
    : [];
  const axis: TimelineAxis = {
    scale,
    start: isoOf(sc.starts[0] ?? sc.end),
    end: isoOf(sc.end - 1),
    box,
    ...(coarser ? { upper: { x: box.x, y: top, w: box.w, h: upperH } } : {}),
    lower,
    periods: tiers,
    ticks,
    minor,
    pitch: sc.pitch,
  };
  return { axis, bottom: top + box.h };
}
