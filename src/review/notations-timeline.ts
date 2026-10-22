// Conventions of timelines and roadmaps (kind: timeline): every item dated, dependencies in date
// order, items inside the axis, a legend for statuses, point labels that do not pile up. The rules
// they restate are in references/review/conventions-timeline.md (TL-01 and on).
//
// Called from: src/review/notations.ts NOTATION_CHECKS.timeline.

import type { PatchOp } from "../patch/index.ts";
import type { ItemStatus, ModelNode } from "../types.ts";
import { edgeName } from "./names.ts";
import type { Ctx } from "./types.ts";

/** The day after an ISO date, as ISO. */
function dayAfter(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** First and last day of an item: a span's own, a point's day twice. */
const span = (n: ModelNode) =>
  n.when ? { first: n.when.start, last: n.when.end ?? n.when.start } : undefined;

/** TL-01: a node with no date has no place on the axis and is left out of the picture. */
function undated(c: Ctx): number {
  const { model, add } = c;
  const missing = model.nodes.filter((n) => !n.when);
  for (const n of missing)
    add(
      "conventions.timeline-undated",
      "major",
      [n.id],
      { item: n.id },
      `the item "${n.id}" has no date, so the timeline leaves it out`,
      [
        `give "${n.id}" date: 2026-06 for a point, or start: and end: for a span`,
        `drop "${n.id}" from the timeline and list it in the text instead`,
      ],
      8,
      undefined,
      "TL-01",
    );
  return missing.length;
}

/** TL-08: a finish-to-start dependency whose target starts before its source ends. */
function order(c: Ctx): number {
  const { model, add } = c;
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  let late = 0;
  for (const e of model.edges) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    const sa = a && span(a);
    const sb = b && span(b);
    if (!a || !b || !sa || !sb || a === b || sb.first >= sa.last) continue;
    late++;
    const start = dayAfter(sa.last);
    const key = b.when?.end !== undefined ? "start" : "date";
    // The fix moves the target after its source, when that keeps the target's own span whole.
    const fits = key === "date" || start <= (sb.last ?? start);
    const patches: PatchOp[] = fits
      ? [{ op: "set", path: `nodes.${b.id}.${key}`, value: start }]
      : [];
    add(
      "conventions.timeline-order",
      "major",
      [e.id, a.id, b.id],
      { edge: edgeName(e), sourceEnds: sa.last, targetStarts: sb.first },
      `${edgeName(e)} says "${b.id}" waits for "${a.id}", but it starts on ${sb.first}, before "${a.id}" ends on ${sa.last}`,
      [
        ...(fits ? [`set ${key}: ${start} on "${b.id}"`] : []),
        `drop the edge ${edgeName(e)} if "${b.id}" does not wait for "${a.id}"`,
      ],
      8,
      patches,
      "TL-08",
    );
  }
  return late;
}

/** TL-03: an item that starts before or ends after the axis bounds the spec set. */
function range(c: Ctx): number {
  const { model, add } = c;
  const lo = model.timeline?.start;
  const hi = model.timeline?.end;
  if (!lo && !hi) return 0;
  let out = 0;
  for (const n of model.nodes) {
    const s = span(n);
    if (!s) continue;
    const early = !!lo && s.first < lo;
    const late = !!hi && s.last > hi;
    if (!early && !late) continue;
    out++;
    // Wholly outside, it is drawn as a sliver at the edge; partly outside, it looks shorter.
    const gone = (!!lo && s.last < lo) || (!!hi && s.first > hi);
    const bound = early ? "start" : "end";
    const value = early ? s.first : s.last;
    add(
      "conventions.timeline-range",
      gone ? "major" : "minor",
      [n.id],
      {
        item: n.id,
        first: s.first,
        last: s.last,
        axisStart: lo ?? "(items)",
        axisEnd: hi ?? "(items)",
      },
      gone
        ? `"${n.id}" (${s.first} to ${s.last}) lies outside the axis, ${lo ?? "the first item"} to ${hi ?? "the last item"}`
        : `"${n.id}" runs past the axis ${bound} (${early ? lo : hi}), so it is cut off there`,
      [`set timeline.${bound}: ${value}`, `drop "${n.id}" from this figure`],
      gone ? 8 : 4,
      [{ op: "set", path: `timeline.${bound}`, value }],
      "TL-03",
    );
  }
  return out;
}

/** TL-07: statuses drawn with no key entry saying what their style means. */
function legend(c: Ctx): number {
  const { model, scene, add } = c;
  const used = [
    ...new Set(model.nodes.flatMap((n) => (n.when && n.status ? [n.status] : []))),
  ] as ItemStatus[];
  const keyed = new Set(scene.timeline?.key?.items.map((k) => k.kind) ?? []);
  const bare = used.filter((s) => !keyed.has(s));
  if (bare.length)
    add(
      "conventions.timeline-legend",
      "minor",
      [],
      { statuses: used.join(","), unexplained: bare.join(",") },
      `items are styled as ${bare.join(", ")} but no key says what those styles mean`,
      ["keep the status key under the lanes, or explain the statuses in the subtitle"],
      5,
      undefined,
      "TL-07",
    );
  return used.length;
}

/** TL-11: a lane whose point labels had to stack more than three deep. */
function crowded(c: Ctx): number {
  const { scene, add } = c;
  let deepest = 0;
  for (const lane of scene.timeline?.lanes ?? []) {
    deepest = Math.max(deepest, lane.stack);
    if (lane.stack <= 3) continue;
    const name = lane.label?.lines.join(" ") ?? (lane.id || "the first row");
    add(
      "conventions.timeline-crowded",
      "minor",
      lane.id ? [lane.id] : [],
      { lane: lane.id || "(ungrouped)", depth: lane.stack },
      `the point labels in ${lane.id ? `lane "${name}"` : name} stack ${lane.stack} deep, so dates close together are hard to tell apart`,
      [
        "shorten the labels of the points that sit close together",
        "move some of them to another lane",
        "use a finer timeline.scale so they spread out",
      ],
      4,
      undefined,
      "TL-11",
    );
  }
  return deepest;
}

export function measureTimeline(c: Ctx): Record<string, number> {
  return {
    undated: undated(c),
    outOfOrder: order(c),
    outOfRange: range(c),
    statuses: legend(c),
    pointStack: crowded(c),
  };
}
