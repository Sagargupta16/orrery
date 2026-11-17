// Mermaid gantt -> a timeline spec: the title, sections as lanes, tasks as items with their start
// (a date in the chart's dateFormat, `after` other tasks, or the end of the task before) and end
// (a date, a duration in days, weeks, months or years, or `until` another task), done, active and
// crit as status, milestones as points; every `after` becomes a dependency edge.
//
// Called from: src/import/mermaid.ts importMermaid for a diagram that starts with gantt. Mermaid
// ends a task the moment its end date starts unless inclusiveEndDates is set; orrery's end is the
// last day, so each date is converted here.

import { cleanLabel, type MermaidResult, specIds, statements, writeSpec } from "./mermaid-text.ts";

const DAY = 86_400_000;
const TAGS = new Set(["done", "active", "crit", "milestone", "vert"]);

interface Task {
  label: string;
  section?: string;
  tags: Set<string>;
  id: string;
  /** What the data says: a date, `after a b`, or nothing (the end of the task before). */
  start?: string;
  /** A date, a duration (`5d`) or `until a`. */
  end: string;
}

/** A task's place in days since 1970-01-01: the first day and the last (inclusive). */
interface Span {
  start: number;
  end: number;
}

export function importGantt(body: string, frontTitle?: string): MermaidResult {
  const warnings = new Set<string>();
  const tasks: Task[] = [];
  const sections: string[] = [];
  let title = frontTitle;
  let subtitle: string | undefined;
  let format = "YYYY-MM-DD";
  let inclusive = false;
  let tick: string | undefined;
  let axis: string | undefined;
  let section: string | undefined;
  const skipped: string[] = [];

  for (const line of statements(body, (l) => [l])) {
    const [word = "", ...words] = line.split(" ");
    const rest = words.join(" ");
    const key = word.toLowerCase();
    if (key === "gantt") continue;
    if (key === "title") title = cleanLabel(rest);
    else if (key === "dateformat") format = rest;
    else if (key === "inclusiveenddates") inclusive = true;
    else if (key === "tickinterval") tick = rest;
    else if (key === "axisformat") axis = rest;
    else if (key === "section") {
      section = cleanLabel(rest);
      if (!sections.includes(section)) sections.push(section);
    } else if (key === "excludes" || key === "includes")
      warnings.add(`${key} is not applied: durations count every calendar day`);
    else if (/^accdescr ?:/i.test(line)) subtitle = cleanLabel(line.replace(/^accDescr ?:/i, ""));
    else if (/^(acctitle|todaymarker|weekday|weekend|topaxis|displaymode|click)\b/.test(key)) {
      // Drawing options with no place in the spec.
    } else {
      const colon = line.indexOf(":");
      if (colon <= 0) {
        skipped.push(line);
        continue;
      }
      const data = line
        .slice(colon + 1)
        .split(",")
        .map((d) => d.trim());
      const tags = new Set<string>();
      while (data.length > 1 && TAGS.has(data[0]?.toLowerCase() ?? "")) {
        tags.add(data.shift()?.toLowerCase() ?? "");
      }
      // Mermaid reads one item as the end, two as start and end, three as id, start and end.
      const [id, start, end] =
        data.length >= 3
          ? data
          : data.length === 2
            ? [undefined, ...data]
            : [undefined, undefined, data[0]];
      tasks.push({
        label: cleanLabel(line.slice(0, colon)),
        section,
        tags,
        id: id || ` task ${tasks.length + 1}`,
        start: start || undefined,
        end: end ?? "",
      });
    }
  }

  const parseDate = dateReader(format, warnings);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const index = new Map(tasks.map((t, i) => [t, i]));
  const spans = new Map<Task, Span | undefined>();
  const deps = new Map<Task, Task[]>();
  const find = (t: Task, id: string) => {
    const other = byId.get(id);
    if (!other) warnings.add(`task "${t.label}" names an unknown task "${id}"`);
    return other;
  };
  // What each task waits for: the tasks its after and until name, or the task before it.
  const needs = new Map<Task, { after?: Task[]; until?: Task; before?: Task }>();
  for (const t of tasks) {
    const after = t.start?.match(/^after (.+)$/i);
    const until = t.end.match(/^until (.+)$/i);
    const named = after ? (after[1] ?? "").split(" ").filter(Boolean) : undefined;
    const need = {
      after: named?.map((n) => find(t, n)).filter((x): x is Task => !!x),
      until: until ? find(t, (until[1] ?? "").trim()) : undefined,
      before: t.start ? undefined : tasks[(index.get(t) ?? 0) - 1],
    };
    if (need.after) deps.set(t, need.after);
    needs.set(t, need);
  }
  /** A task's span, once the spans of the tasks it waits for are known (or known to be none). */
  const place = (t: Task): Span | undefined => {
    const need = needs.get(t) ?? {};
    let start: number | undefined;
    if (need.after) {
      const ends = need.after.map((x) => spans.get(x)).filter((s): s is Span => !!s);
      if (ends.length) start = Math.max(...ends.map((s) => s.end + 1));
      else warnings.add(`task "${t.label}" waits only on tasks with no dates`);
    } else if (t.start) {
      start = parseDate(t.start);
      if (start === undefined)
        warnings.add(`task "${t.label}" has a start "${t.start}" not in ${format}`);
    } else {
      const prev = need.before ? spans.get(need.before) : undefined;
      if (prev) start = prev.end + 1;
      else warnings.add(`task "${t.label}" has no start date`);
    }
    if (start === undefined) return undefined;
    const last = /^until /i.test(t.end)
      ? ((need.until && spans.get(need.until)?.start) ?? start) - 1
      : endOf(t.end, start, inclusive, parseDate);
    if (last !== undefined) return { start, end: Math.max(start - 1, last) };
    warnings.add(`task "${t.label}" has an end "${t.end}" that is not a date or duration`);
    return undefined;
  };
  // Depth first without recursion, so a long chain of after or until cannot overflow the stack.
  // A task met again while it waits closes a cycle: it is placed without the task it waits on.
  const waiting = new Set<Task>();
  for (const root of tasks) {
    const stack = [root];
    while (stack.length) {
      const t = stack[stack.length - 1] as Task;
      if (spans.has(t)) {
        stack.pop();
        continue;
      }
      if (!waiting.has(t)) {
        waiting.add(t);
        const need = needs.get(t) ?? {};
        const open = [...(need.after ?? []), need.until, need.before].filter(
          (x): x is Task => !!x && !spans.has(x),
        );
        if (open.some((x) => waiting.has(x)))
          warnings.add(`task "${t.label}" waits on itself through after or until`);
        const todo = open.filter((x) => !waiting.has(x));
        if (todo.length) {
          stack.push(...todo);
          continue;
        }
      }
      spans.set(t, place(t));
      waiting.delete(t);
      stack.pop();
    }
  }

  const placed = tasks.filter((t) => spans.get(t));
  const taskIds = specIds(
    placed.map((t) => t.id),
    "task",
  );
  const tid = (t: Task) => taskIds.get(t.id) ?? t.id;
  const laneIds = specIds(
    sections.map((s) => s.toLowerCase()),
    "lane",
    new Set(taskIds.values()),
  );
  const lane = (s: string) => laneIds.get(s.toLowerCase()) ?? s;
  const nodes: Record<string, Record<string, unknown>> = {};
  for (const t of placed) {
    const span = spans.get(t);
    if (!span) continue;
    const point = span.end < span.start || t.tags.has("milestone") || t.tags.has("vert");
    const status = t.tags.has("done")
      ? "done"
      : t.tags.has("crit")
        ? "at-risk"
        : t.tags.has("active")
          ? "active"
          : undefined;
    nodes[tid(t)] = {
      label: t.label || t.id.trim(),
      ...(point
        ? {
            date: iso(span.start),
            ...(t.tags.has("milestone") || t.tags.has("vert") ? { milestone: true } : {}),
          }
        : { start: iso(span.start), end: iso(span.end) }),
      ...(t.section ? { in: lane(t.section) } : {}),
      ...(status ? { status } : {}),
    };
  }
  const edges: string[] = [];
  for (const [t, before] of deps)
    for (const b of before) if (spans.get(t) && spans.get(b)) edges.push(`${tid(b)} -> ${tid(t)}`);
  if (!tasks.length) warnings.add("no tasks found");
  if (skipped.length)
    warnings.add(`${skipped.length} line(s) not read, the first: ${skipped[0]?.slice(0, 60)}`);

  const all = [...spans.values()].filter((s): s is Span => !!s);
  const scale = scaleOf(tick, axis, all);
  const doc: Record<string, unknown> = {};
  if (title) doc.title = title;
  if (subtitle) doc.subtitle = subtitle;
  doc.kind = "timeline";
  if (scale) doc.timeline = { scale };
  const lanes = sections.filter((s) => placed.some((t) => t.section === s));
  if (lanes.length) doc.groups = Object.fromEntries(lanes.map((s) => [lane(s), { label: s }]));
  doc.nodes = nodes;
  doc.edges = edges;
  const header = [
    "Imported from a Mermaid gantt by orrery. End dates are the last day of each item;",
    "check timeline.scale and run orrery validate.",
  ];
  return { yaml: writeSpec(doc, header), warnings: [...warnings], guessed: {} };
}

/** The last day of a task that starts on `start`: an end date, or a duration. */
function endOf(
  text: string,
  start: number,
  inclusive: boolean,
  parseDate: (s: string) => number | undefined,
): number | undefined {
  const d = text.match(/^(\d+(?:\.\d+)?) ?(ms|[smhdwMy])$/);
  if (d) {
    const n = Number(d[1]);
    const unit = d[2] ?? "d";
    if (unit === "M" || unit === "y") {
      // Calendar months and years from the start date, as Mermaid adds them.
      const at = new Date(start * DAY);
      const months = unit === "M" ? n : n * 12;
      return Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, at.getUTCDate()) / DAY - 1;
    }
    const days = { ms: 1 / DAY, s: 1 / 86_400, m: 1 / 1440, h: 1 / 24, d: 1, w: 7 }[unit] ?? 1;
    // The end moment rounded up to a day, then the day before it: 3d from the 1st ends on the 3rd.
    return start + Math.ceil(n * days) - 1;
  }
  const date = parseDate(text);
  if (date === undefined) return undefined;
  return inclusive ? date : date - 1;
}

/**
 * A reader for dates written in a dateFormat (dayjs tokens: YYYY, YY, MM, M, DD, D, and times,
 * which only narrow the day); any other format falls back to ISO dates with a warning.
 */
function dateReader(format: string, warnings: Set<string>): (s: string) => number | undefined {
  const parts: string[] = [];
  const order: string[] = [];
  let known = true;
  for (const [token] of format.matchAll(
    /YYYY|YY|SSS|MM|DD|HH|hh|mm|ss|[MDHhms]|[A-Za-z]+|[^A-Za-z]+/g,
  )) {
    if (/^(YYYY|YY|MM|M|DD|D)$/.test(token)) {
      parts.push(token === "YYYY" ? "(\\d{4})" : token === "YY" ? "(\\d{2})" : "(\\d{1,2})");
      order.push(token[0] ?? "");
    } else if (/^(HH|hh|mm|ss|SSS|H|h|m|s)$/.test(token)) parts.push("\\d{1,3}");
    else if (/^[A-Za-z]/.test(token)) known = false;
    else parts.push(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }
  if (!known || !order.includes("Y") || !order.includes("M")) {
    warnings.add(`dateFormat ${format} is not read; dates are read as YYYY-MM-DD`);
    return dateReader("YYYY-MM-DD", new Set());
  }
  const re = new RegExp(`^${parts.join("")}$`);
  return (s) => {
    const m = s.trim().match(re);
    if (!m) return undefined;
    const value = (c: string) => Number(m[order.indexOf(c) + 1] ?? 1);
    let year = value("Y");
    if (year < 100) year += 2000;
    const month = value("M");
    const day = order.includes("D") ? value("D") : 1;
    const time = Date.UTC(year, month - 1, day);
    const back = new Date(time);
    // A day past the month's end (2026-02-30) is no date, as Mermaid's strict parse says.
    if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return undefined;
    return time / DAY;
  };
}

const iso = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

/** The axis tick: from tickInterval or axisFormat when the chart sets them, else from its span. */
function scaleOf(
  tick: string | undefined,
  axis: string | undefined,
  spans: Span[],
): string | undefined {
  const t = tick?.match(/^(\d+)(millisecond|second|minute|hour|day|week|month)$/);
  if (t) {
    const n = Number(t[1]);
    if (t[2] === "week") return "week";
    if (t[2] === "month") return n >= 12 ? "year" : n >= 3 ? "quarter" : "month";
    return "day";
  }
  if (axis?.trim() === "%Y") return "year";
  if (!spans.length) return undefined;
  const days = Math.max(...spans.map((s) => s.end)) - Math.min(...spans.map((s) => s.start)) + 1;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  if (days <= 730) return "month";
  return days <= 2190 ? "quarter" : "year";
}
