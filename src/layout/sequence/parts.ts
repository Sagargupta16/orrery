// The sequence scene from the columns and rows: everything moved clear of the left margin, the
// heads as scene nodes, the participant groups as boxes from their headers to under the feet, the
// messages as scene edges along their rows, the lifelines, bars and fragments, the legend and the
// alt text.

import type { Theme } from "../../themes.ts";
import { textBlock } from "../../text.ts";
import type {
  Box,
  LegendEntry,
  Model,
  Point,
  Scene,
  SceneEdge,
  SceneGroup,
  SceneLegend,
  ThemeName,
} from "../../types.ts";
import type { Laid } from "../context.ts";
import type { ElkNode } from "../elk.ts";
import { round, union } from "../geometry.ts";
import { type HeaderRoom, paintGroup } from "../groups.ts";
import { type GroupGeom, groupGeometry } from "../measure.ts";
import { sceneNodes } from "../nodes.ts";
import { SIZES } from "../sizes.ts";
import { type Act, type Column, groupSpans, type Msg, SEQ } from "./columns.ts";
import type { SceneSequence, SequenceFragment, SequenceLifeline } from "./index.ts";
import type { Frag, Rows } from "./rows.ts";

type Built = Pick<
  Scene,
  | "width"
  | "height"
  | "title"
  | "titleBox"
  | "subtitle"
  | "subtitleBox"
  | "nodes"
  | "groups"
  | "edges"
  | "legend"
  | "description"
> & { sequence: SceneSequence };

const shiftBox = (b: Box | undefined, dx: number) => (b ? { ...b, x: round(b.x + dx) } : b);

/** Each participant group's sides, innermost first: its heads, loops, fragments and inner groups. */
function groupSides(
  model: Model,
  cols: Column[],
  msgs: Msg[],
  frags: Frag[],
): Map<string, [number, number]> {
  const spans = groupSpans(cols);
  const sides = new Map<string, [number, number]>();
  const of = (id: string): [number, number] => {
    const known = sides.get(id);
    if (known) return known;
    const [c0, c1] = spans.get(id) ?? [0, 0];
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let c = c0; c <= c1; c++) {
      const col = cols[c];
      if (!col) continue;
      lo = Math.min(lo, col.x - col.room / 2);
      hi = Math.max(hi, col.x + col.room / 2);
    }
    for (const m of msgs) {
      if (m.a !== m.b || m.a < c0 || m.a > c1) continue;
      hi = Math.max(hi, m.x0 + SEQ.loopW, (m.labelBox?.x ?? 0) + (m.labelBox?.w ?? 0));
    }
    for (const f of frags) {
      if (f.cols[0] < c0 || f.cols[1] > c1) continue;
      lo = Math.min(lo, f.x);
      hi = Math.max(hi, f.right);
    }
    for (const g of model.groups) {
      if (g.parent !== id || !spans.has(g.id)) continue;
      const [a, b] = of(g.id);
      lo = Math.min(lo, a);
      hi = Math.max(hi, b);
    }
    const side: [number, number] = [lo - SEQ.groupPad, hi + SEQ.groupPad];
    sides.set(id, side);
    return side;
  };
  for (const id of spans.keys()) of(id);
  return sides;
}

/**
 * Moves a label that would sit on a group's border along its line, to the nearest stretch between
 * borders it fits in (DG220): its chip would break the frame and belong to neither side.
 */
export function clearGroupBorders(model: Model, cols: Column[], msgs: Msg[]): void {
  const lines = [...groupSides(model, cols, msgs, []).values()].flat();
  for (const m of msgs) {
    const b = m.labelBox;
    const span = m.span;
    if (!b || !span || m.a === m.b) continue;
    if (!lines.some((x) => x > b.x + 1 && x < b.x + b.w - 1)) continue;
    const cuts = lines.filter((x) => x > span[0] && x < span[1]).sort((p, q) => p - q);
    const ends = [span[0], ...cuts.flatMap((x) => [x - 4, x + 4]), span[1]];
    const center = b.x + b.w / 2;
    let best: number | undefined;
    for (let i = 0; i + 1 < ends.length; i += 2) {
      const lo = (ends[i] ?? 0) + b.w / 2;
      const hi = (ends[i + 1] ?? 0) - b.w / 2;
      if (hi < lo) continue;
      const c = Math.min(hi, Math.max(lo, center));
      if (best === undefined || Math.abs(c - center) < Math.abs(best - center)) best = c;
    }
    if (best !== undefined) b.x = round(best - b.w / 2);
  }
}

/** Group levels at and under each group with participants, for how far below the feet it ends. */
function levelsOf(model: Model, ids: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  const of = (id: string): number => {
    const known = out.get(id);
    if (known !== undefined) return known;
    const kids = model.groups.filter((g) => g.parent === id && ids.has(g.id)).map((g) => of(g.id));
    const v = 1 + Math.max(0, ...kids);
    out.set(id, v);
    return v;
  };
  for (const id of ids) of(id);
  return out;
}

export function assemble(
  model: Model,
  theme: ThemeName,
  tokens: Theme,
  cols: Column[],
  msgs: Msg[],
  acts: Act[],
  frags: Frag[],
  rows: Rows,
): Built {
  const S = SEQ;
  const P = S.pad;
  const sides = groupSides(model, cols, msgs, frags);
  const footW = (i: number) => (rows.feet?.[i]?.width ?? 0) + 20;
  // Everything that reaches sideways, so the leftmost lands on the margin.
  const xs = [
    ...[...sides.values()].flat(),
    ...cols.flatMap((c, i) => [
      c.x - c.geom.w / 2,
      c.x + c.geom.w / 2,
      ...(rows.feet ? [c.x - footW(i) / 2, c.x + footW(i) / 2] : []),
    ]),
    ...frags.flatMap((f) => [f.x, f.right]),
    ...msgs.flatMap((m) => [
      ...(m.labelBox ? [m.labelBox.x, m.labelBox.x + m.labelBox.w] : []),
      ...(m.stepBox ? [m.stepBox.x, m.stepBox.x + m.stepBox.w] : []),
      ...(m.a === m.b ? [m.x0 + S.loopW] : []),
    ]),
  ];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const dx = round(P - minX);
  for (const c of cols) c.x = round(c.x + dx);
  for (const m of msgs) {
    m.x0 = round(m.x0 + dx);
    m.x1 = round(m.x1 + dx);
    m.labelBox = shiftBox(m.labelBox, dx);
    m.stepBox = shiftBox(m.stepBox, dx);
  }
  for (const f of frags) {
    f.x = round(f.x + dx);
    f.right = round(f.right + dx);
  }

  // Participant groups: from their header band down past the feet, nested ones inside.
  const ids = new Set(sides.keys());
  const levels = levelsOf(model, ids);
  const groupGeom = new Map<string, GroupGeom>();
  const headerRoom = new Map<string, HeaderRoom>();
  for (const g of model.groups) if (ids.has(g.id)) groupGeom.set(g.id, groupGeometry(g));
  const paint = { model, theme, tokens, groupGeom, headerRoom };
  const groups: SceneGroup[] = [];
  for (const g of model.groups) {
    const side = sides.get(g.id);
    const top = rows.groupTop.get(g.id);
    if (!side || top === undefined) continue;
    const bottom = rows.bottom + 12 + 8 * ((levels.get(g.id) ?? 1) - 1);
    const b = { x: round(side[0] + dx), y: round(top), w: round(side[1] - side[0]), h: 0 };
    b.h = round(bottom - b.y);
    const sg = paintGroup(paint, g, b, false);
    if (sg) groups.push(sg);
  }
  groups.sort((p, q) => p.depth - q.depth);

  // The heads: each participant as a node in its own look, tops in one row.
  const nodeGeom = new Map(cols.map((c) => [c.node.id, c.geom]));
  const placed = new Map<string, ElkNode>(
    cols.map((c) => [
      c.node.id,
      { id: c.node.id, x: c.x - c.geom.w / 2, y: rows.headTop, width: c.geom.w, height: c.geom.h },
    ]),
  );
  const laid = { model, nodeGeom, tokens, horizontal: false } as unknown as Laid;
  const nodes = sceneNodes(laid, placed, groups, 0);

  // The messages: along their rows, numbered in order so a packet plays them one after another.
  const stepped = msgs.some((m) => m.step !== undefined);
  const edges: SceneEdge[] = msgs.map((m, k) => {
    const e = m.edge;
    const points: Point[] =
      m.a === m.b
        ? [
            { x: m.x0, y: m.y },
            { x: round(m.x0 + S.loopW), y: m.y },
            { x: round(m.x0 + S.loopW), y: round(m.y + m.loop) },
            { x: m.x1, y: round(m.y + m.loop) },
          ]
        : [
            { x: m.x0, y: m.y },
            { x: m.x1, y: m.y },
          ];
    // Points run from the spec's from to its to; an arrow at the start travels back along them.
    if (e.arrow === "start") points.reverse();
    const step = m.step ?? (stepped ? undefined : k + 1);
    return {
      id: e.id,
      from: e.from,
      to: e.to,
      points,
      line: e.line,
      arrow: e.arrow,
      ...(e.color ? { color: e.color } : {}),
      ...(m.label && m.labelBox ? { label: m.label, labelBox: m.labelBox } : {}),
      ...(step !== undefined ? { step } : {}),
      ...(m.stepBox ? { stepBox: m.stepBox } : {}),
    };
  });

  const lifelines: SequenceLifeline[] = cols.map((c, i) => {
    const head = nodes.find((nd) => nd.id === c.node.id);
    const under = head ? union([head.box, head.labelBox, head.noteBox]) : undefined;
    const top = round((under ? under.y + under.h : rows.headBottom) + 4);
    const label = rows.feet?.[i];
    const line: SequenceLifeline = { id: c.node.id, x: c.x, top, bottom: rows.lifeEnd };
    if (label) {
      const w = label.width + 20;
      line.foot = {
        box: { x: round(c.x - w / 2), y: rows.lifeEnd, w: round(w), h: round(label.height + 10) },
        label,
        labelBox: {
          x: round(c.x - label.width / 2),
          y: round(rows.lifeEnd + 5),
          w: round(label.width),
          h: round(label.height),
        },
      };
    }
    return line;
  });
  const fragments: SequenceFragment[] = frags.map((f) => {
    const tagW = f.tag.width + 22;
    const centered = (h: number) => round(f.top + Math.max(2, (S.tagH - h) / 2));
    return {
      type: f.type,
      box: { x: f.x, y: round(f.top), w: round(f.right - f.x), h: round(f.bottom - f.top) },
      tag: {
        box: { x: f.x, y: round(f.top), w: round(tagW), h: S.tagH },
        label: f.tag,
        labelBox: {
          x: round(f.x + 8),
          y: centered(f.tag.height),
          w: round(f.tag.width),
          h: round(f.tag.height),
        },
      },
      ...(f.label
        ? {
            label: f.label,
            labelBox: {
              x: round(f.x + tagW + 10),
              y: centered(f.label.height),
              w: round(f.label.width),
              h: round(f.label.height),
            },
          }
        : {}),
      dividers: f.dividers.map((d) => ({
        y: round(d.y),
        ...(d.label
          ? {
              label: d.label,
              // Under the guard above, so the branches' guards read down one column.
              labelBox: {
                x: round(f.x + tagW + 10),
                y: round(d.y + 4),
                w: round(d.label.width),
                h: round(d.label.height),
              },
            }
          : {}),
      })),
      from: f.from,
      to: f.to,
      depth: f.depth,
    };
  });
  const sequence: SceneSequence = {
    lifelines,
    messages: msgs.map((m) => ({
      id: m.edge.id,
      index: m.index,
      from: cols[m.a]?.node.id ?? "",
      to: cols[m.b]?.node.id ?? "",
      kind: m.kind,
      line: m.edge.line,
      y: m.y,
      ...(m.a === m.b ? { loop: m.loop } : {}),
      x0: m.x0,
      x1: m.x1,
      top: round(m.top),
      bottom: round(m.bottom),
    })),
    activations: acts.flatMap((a) => {
      const call = msgs[a.start];
      const reply = msgs[a.end];
      const col = cols[a.col];
      if (!call || !reply || !col) return [];
      return [
        {
          id: col.node.id,
          box: {
            x: round(col.x - S.bar / 2 + a.level * S.nest),
            y: call.y,
            w: S.bar,
            h: round(Math.max(8, reply.y - call.y)),
          },
          level: a.level,
          call: call.edge.id,
          reply: reply.edge.id,
        },
      ];
    }),
    fragments,
  };

  const bottom = Math.max(rows.bottom, ...groups.map((g) => g.box.y + g.box.h));
  let width = Math.ceil(
    Math.max(maxX + dx + P, (rows.title?.width ?? 0) + 2 * P, (rows.subtitle?.width ?? 0) + 2 * P),
  );
  let height = Math.ceil(bottom + P);
  let legend: SceneLegend | undefined;
  if (model.legend?.length) {
    legend = placeLegend(model.legend, width, bottom + 16);
    width = Math.max(width, Math.ceil(legend.box.w + 2 * P));
    height = Math.ceil(legend.box.y + legend.box.h + P);
  }
  return {
    width,
    height,
    ...(rows.title ? { title: rows.title } : {}),
    ...(rows.titleBox ? { titleBox: rows.titleBox } : {}),
    ...(rows.subtitle ? { subtitle: rows.subtitle } : {}),
    ...(rows.subtitleBox ? { subtitleBox: rows.subtitleBox } : {}),
    nodes,
    groups,
    edges,
    ...(legend ? { legend } : {}),
    description: describe(model, cols, msgs, frags),
    sequence,
  };
}

/** The line-style key under the diagram, right-aligned, as the other layouts place it. */
function placeLegend(entries: LegendEntry[], width: number, top: number): SceneLegend {
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
  const box = { x: Math.max(SIZES.pad, width - SIZES.pad - w), y: round(top), w, h };
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

/** Alt text: who takes part, every message in order, and the fragments around them. */
function describe(model: Model, cols: Column[], msgs: Msg[], frags: Frag[]): string {
  const name = (c: number) => cols[c]?.node.label || cols[c]?.node.id || "";
  const parts: string[] = [];
  if (model.title) parts.push(`${model.title}.`);
  parts.push(
    `Sequence diagram with ${cols.length} participants (${cols.map((_, i) => name(i)).join(", ")}) and ${msgs.length} messages.`,
  );
  const said = msgs
    .slice(0, 24)
    .map(
      (m, i) =>
        `${i + 1}. ${name(m.a)} to ${m.a === m.b ? "itself" : name(m.b)}${m.edge.label ? ` (${m.edge.label})` : ""}`,
    );
  if (said.length) parts.push(`${said.join("; ")}${msgs.length > 24 ? "; and more" : ""}.`);
  const position = (k: number) => k + 1;
  const around = frags.map((f) => {
    const branches = f.dividers.map(
      (d) => `, else${d.label ? ` ${d.label.lines.join(" ")}` : ""} from ${position(d.k)}`,
    );
    const label = f.label ? ` ${f.label.lines.join(" ")}` : "";
    return `${f.type}${label} over messages ${position(f.first)} to ${position(f.last)}${branches.join("")}`;
  });
  if (around.length) parts.push(`Fragments: ${around.join("; ")}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
