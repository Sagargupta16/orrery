// Calendar arithmetic for the time axis: days since 1970 in UTC (so no time zone moves a date),
// the start of the period a day falls in, and the names ticks and periods carry.

import type { TimeScale } from "../../types.ts";

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** An ISO date (YYYY-MM-DD) as a day number. */
export function dayOf(iso: string): number {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}

/** A day number as an ISO date. */
export const isoOf = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10);

interface Ymd {
  y: number;
  /** 0 is January. */
  m: number;
  d: number;
  /** 0 is Monday. */
  dow: number;
}

function ymd(day: number): Ymd {
  const t = new Date(day * DAY);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth(),
    d: t.getUTCDate(),
    dow: (t.getUTCDay() + 6) % 7,
  };
}

const utc = (y: number, m: number, d = 1) => Math.round(Date.UTC(y, m, d) / DAY);

/** The first day of the period at `scale` that `day` falls in (weeks start on Monday). */
export function floorTo(day: number, scale: TimeScale): number {
  const { y, m, dow } = ymd(day);
  switch (scale) {
    case "day":
      return day;
    case "week":
      return day - dow;
    case "month":
      return utc(y, m);
    case "quarter":
      return utc(y, m - (m % 3));
    case "year":
      return utc(y, 0);
  }
}

/** The first day of the period after the one starting at `start`. */
export function nextOf(start: number, scale: TimeScale): number {
  const { y, m } = ymd(start);
  switch (scale) {
    case "day":
      return start + 1;
    case "week":
      return start + 7;
    case "month":
      return utc(y, m + 1);
    case "quarter":
      return utc(y, m + 3);
    case "year":
      return utc(y + 1, 0);
  }
}

/** Period starts from `from` up to (not including) `to`. */
export function periods(from: number, to: number, scale: TimeScale): number[] {
  const out: number[] = [];
  for (let d = floorTo(from, scale); d < to; d = nextOf(d, scale)) out.push(d);
  return out;
}

/**
 * The scale one step finer, whose starts are the minor ticks. None under a day, and none in a
 * month: weeks straddle months, so their marks fall unevenly and crowd the axis.
 */
export const FINER: Record<TimeScale, TimeScale | undefined> = {
  year: "quarter",
  quarter: "month",
  month: undefined,
  week: "day",
  day: undefined,
};

/** The scale the upper tier of the axis names: years over months and quarters, months over days. */
export const COARSER: Record<TimeScale, TimeScale | undefined> = {
  year: undefined,
  quarter: "year",
  month: "year",
  week: "month",
  day: "month",
};

/** What a tick prints under its period tier: "Q3", "Jan", "5" or, with no tier, "2026". */
export function tickText(day: number, scale: TimeScale): string {
  const { y, m, d } = ymd(day);
  switch (scale) {
    case "year":
      return String(y);
    case "quarter":
      return `Q${Math.floor(m / 3) + 1}`;
    case "month":
      return MONTHS[m] ?? "";
    case "week":
    case "day":
      return String(d);
  }
}

/** The whole name of a period: "2026", "Q3 2026", "Jan 2026", "Jan 5 2026". */
export function periodName(day: number, scale: TimeScale): string {
  const { y, m, d } = ymd(day);
  switch (scale) {
    case "year":
      return String(y);
    case "quarter":
      return `Q${Math.floor(m / 3) + 1} ${y}`;
    case "month":
      return `${MONTHS[m]} ${y}`;
    case "week":
      return `Week of ${MONTHS[m]} ${d} ${y}`;
    case "day":
      return `${MONTHS[m]} ${d} ${y}`;
  }
}

/** A day as people say it in prose: "Jun 15 2026". */
export function dayName(day: number): string {
  const { y, m, d } = ymd(day);
  return `${MONTHS[m]} ${d} ${y}`;
}

/** A short form for an upper tier cell too narrow for its name: "'27", "Jan". */
export function shortName(day: number, scale: TimeScale): string {
  const { y, m } = ymd(day);
  return scale === "year" ? `'${String(y).slice(2)}` : (MONTHS[m] ?? "");
}

/**
 * Where an item sits in time, in days: a span from its first day to the day after its last, a
 * point at the middle of the period it was written in (June for 2026-06, noon for a day).
 */
export function spanOf(when: { start: string; end?: string; precision: TimeScale }): {
  t0: number;
  t1: number;
  point: boolean;
} {
  const s = dayOf(when.start);
  if (when.end !== undefined) return { t0: s, t1: dayOf(when.end) + 1, point: false };
  const e = nextOf(floorTo(s, when.precision), when.precision);
  const mid = when.precision === "day" ? s + 0.5 : (s + e) / 2;
  return { t0: mid, t1: mid, point: true };
}
