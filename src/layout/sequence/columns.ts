// Participants left to right and the messages between them: spec order with each group's members
// side by side, the head each one draws (any look), what each message is (call, reply, async,
// signal, self), the activation bars from a call to its reply, and how far apart the lifelines
// stand so no label crosses one.

import { textBlock } from "../../text.ts";
import type { Box, Model, ModelEdge, ModelNode, TextBlock } from "../../types.ts";
import type { NodeGeom } from "../hooks.ts";
import { groupGeometry, nodeGeometry } from "../measure.ts";
import { SIZES } from "../sizes.ts";
import type { SequenceMessageKind } from "./index.ts";
import type { Frag } from "./rows.ts";

/** Fixed measures of the sequence layout, in px. */
export const SEQ = {
  pad: SIZES.pad,
  /** Least room between two heads, and between two lifelines. */
  headGap: 28,
  minPitch: 128,
  /** Between a group border and the next one across a gap. */
  borderGap: 12,
  /** A group's border around what it holds. */
  groupPad: 14,
  /** Between a label chip and the ends of its line. */
  margin: 10,
  /** The shortest message line without a label. */
  minArrow: 40,
  /** Activation bars: width, and the step a nested bar moves right. */
  bar: 10,
  nest: 5,
  /** A message to its own lifeline: how far the loop reaches right, and its least height. */
  loopW: 30,
  loopH: 20,
  /** A label chip's padding around its text (as layout's edge labels). */
  chipX: 12,
  chipY: 6,
  /** From a line to the next row's top, and from a label chip down to its line. */
  rowGap: 14,
  lineGap: 3,
  /** From the heads down to the first row. */
  firstGap: 20,
  /** A fragment's side past the outermost lifeline or bar it holds, and between nested ones. */
  fragPad: 16,
  fragNest: 10,
  /** The operator tag's height, and the gap under it. */
  tagH: 20,
  tagGap: 8,
  /** Below a fragment's last row. */
  fragBottom: 10,
  step: SIZES.step,
  /** Lifelines longer than this get the participants' names again at their foot. */
  tall: 440,
};

export interface Column {
  node: ModelNode;
  geom: NodeGeom;
  /** Lifeline x (relative until parts.ts moves everything clear of the margin). */
  x: number;
  /** Width the head and any one-participant group around it take along the row. */
  room: number;
  /** Groups around it, outermost first. */
  groups: string[];
}

export interface Msg {
  edge: ModelEdge;
  /** 1-based position among the spec's edges. */
  index: number;
  /** Sender and receiver columns, in travel order. */
  a: number;
  b: number;
  kind: SequenceMessageKind;
  /** The spec's step number, drawn as a badge where the message leaves. */
  step?: number;
  label?: TextBlock;
  /** Set by rows.ts: the line, a self loop's height and the row band. */
  y: number;
  loop: number;
  top: number;
  bottom: number;
  /** Set by rows.ts once the columns stand: where the line leaves and lands, its label and badge. */
  x0: number;
  x1: number;
  labelBox?: Box;
  stepBox?: Box;
  /** The stretch of the line a label may sit on. */
  span?: [number, number];
}

export interface Act {
  col: number;
  level: number;
  /** Row positions of the call and the reply. */
  start: number;
  end: number;
}

/** The participants in spec order, each group's members kept together where its first one stands. */
export function columnsOf(model: Model): Column[] {
  type Item = { node: ModelNode } | { items: Item[] };
  const root: Item[] = [];
  const lists = new Map<string, Item[]>();
  const parentOf = (id: string) => model.groups.find((g) => g.id === id)?.parent;
  const listOf = (group: string | undefined): Item[] => {
    if (!group || !model.groups.some((g) => g.id === group)) return root;
    let list = lists.get(group);
    if (list) return list;
    list = [];
    lists.set(group, list);
    listOf(parentOf(group)).push({ items: list });
    return list;
  };
  for (const node of model.nodes) listOf(node.parent).push({ node });
  const flat: ModelNode[] = [];
  const walk = (items: Item[]) => {
    for (const it of items)
      if ("node" in it) flat.push(it.node);
      else walk(it.items);
  };
  walk(root);
  return flat.map((node) => {
    const geom = nodeGeometry(node, false);
    const groups: string[] = [];
    for (let g = node.parent; g; g = parentOf(g))
      if (model.groups.some((x) => x.id === g)) groups.unshift(g);
    return { node, geom, x: 0, room: geom.w, groups };
  });
}

/** The edges between participants, in spec order, with their columns in travel order. */
export function messagesOf(model: Model, cols: Column[]): Msg[] {
  const at = new Map(cols.map((c, i) => [c.node.id, i]));
  const out: Msg[] = [];
  model.edges.forEach((edge, i) => {
    const [s, r] = edge.arrow === "start" ? [edge.to, edge.from] : [edge.from, edge.to];
    const a = at.get(s);
    const b = at.get(r);
    if (a === undefined || b === undefined) return;
    out.push({
      edge,
      index: i + 1,
      a,
      b,
      kind: "call",
      ...(edge.step !== undefined ? { step: edge.step } : {}),
      y: 0,
      loop: 0,
      top: 0,
      bottom: 0,
      x0: 0,
      x1: 0,
    });
  });
  return out;
}

/**
 * What each message is. A dashed message back to a participant that called the sender and has
 * not been answered is that call's reply; so is a second answer to the same caller with nothing
 * in between (the other branch of an alt). Any other dashed message is asynchronous.
 */
export function kindsOf(msgs: Msg[]): void {
  const waiting = new Map<number, number[]>();
  const answered = new Map<number, { to: number; at: number }>();
  const quiet = (col: number, from: number, to: number) =>
    msgs.slice(from + 1, to).every((x) => x.a !== col && x.b !== col);
  msgs.forEach((m, k) => {
    if (m.a === m.b) m.kind = "self";
    else if (m.edge.line === "dotted") m.kind = "signal";
    else if (m.edge.line === "dashed") {
      const callers = waiting.get(m.a) ?? [];
      const i = callers.lastIndexOf(m.b);
      const last = answered.get(m.a);
      const again = i < 0 && last?.to === m.b && quiet(m.a, last.at, k);
      m.kind = i >= 0 || again ? "reply" : "async";
      if (i >= 0) callers.splice(i);
      if (m.kind === "reply") answered.set(m.a, { to: m.b, at: k });
    } else {
      m.kind = "call";
      waiting.set(m.b, [...(waiting.get(m.b) ?? []), m.a]);
    }
  });
}

/**
 * Activation bars: a participant is busy from a call it receives until its reply, nested one step
 * right for each call it is already busy with; a second answer (another branch) stretches the bar
 * to it. A call nobody answers draws no bar.
 */
export function activations(msgs: Msg[]): Act[] {
  const stacks = new Map<number, { from: number; start: number; level: number }[]>();
  const closed = new Map<number, { from: number; acts: Act[] }>();
  const acts: Act[] = [];
  msgs.forEach((m, k) => {
    if (m.kind === "call") {
      const stack = stacks.get(m.b) ?? [];
      stack.push({ from: m.a, start: k, level: stack.length });
      stacks.set(m.b, stack);
    } else if (m.kind === "reply") {
      const stack = stacks.get(m.a) ?? [];
      let i = stack.length - 1;
      while (i >= 0 && stack[i]?.from !== m.b) i--;
      if (i < 0) {
        const last = closed.get(m.a);
        if (last?.from === m.b) for (const a of last.acts) a.end = k;
        return;
      }
      // Calls into the sender after the one answered here end with it.
      const done = stack.splice(i).map((s) => ({ col: m.a, level: s.level, start: s.start, end: k }));
      acts.push(...done);
      closed.set(m.a, { from: m.b, acts: done });
    }
  });
  return acts.sort((p, q) => p.start - q.start || p.level - q.level);
}

/** The deepest bar on a column at a row, or -1 when none is open there. */
export function levelAt(acts: Act[], col: number, k: number): number {
  let top = -1;
  for (const a of acts)
    if (a.col === col && a.start <= k && k <= a.end) top = Math.max(top, a.level);
  return top;
}

/** How far a message end sits from the lifeline at a row: to the left (-1) or right (1) of the bars. */
export function sideOf(acts: Act[], col: number, k: number, side: -1 | 1): number {
  const top = levelAt(acts, col, k);
  if (top < 0) return 0;
  return side < 0 ? -SEQ.bar / 2 : SEQ.bar / 2 + SEQ.nest * top;
}

const chip = (b: TextBlock | undefined) => (b?.lines.length ? b.width + SEQ.chipX : 0);

function labelOf(m: Msg, max: number): TextBlock | undefined {
  const text = m.edge.label?.trim();
  return text ? textBlock(text, SIZES.edgeLabel, Math.max(40, max)) : undefined;
}

/** Spreads the lifelines between columns `i` and `j` (moving the ones after) to `span` apart. */
function widen(xs: number[], i: number, j: number, span: number): void {
  const short = span - ((xs[j] ?? 0) - (xs[i] ?? 0));
  if (short <= 0.01) return;
  for (let k = i + 1; k < xs.length; k++)
    xs[k] = (xs[k] ?? 0) + (short * Math.min(k - i, j - i)) / (j - i);
}

/** How many group levels around each column, by group id. */
function heights(model: Model): Map<string, number> {
  const h = new Map<string, number>();
  const of = (id: string): number => {
    const known = h.get(id);
    if (known !== undefined) return known;
    const kids = model.groups.filter((g) => g.parent === id).map((g) => of(g.id));
    const v = 1 + Math.max(0, ...kids);
    h.set(id, v);
    return v;
  };
  for (const g of model.groups) of(g.id);
  return h;
}

/** Each group with participants: its first and last column. */
export function groupSpans(cols: Column[]): Map<string, [number, number]> {
  const spans = new Map<string, [number, number]>();
  cols.forEach((c, i) => {
    for (const g of c.groups) {
      const s = spans.get(g);
      spans.set(g, s ? [Math.min(s[0], i), Math.max(s[1], i)] : [i, i]);
    }
  });
  return spans;
}

/**
 * Sets each column's x (the first at 0) and wraps each message label at `wrap` or wider where its
 * lifelines stand further apart. Returns the width the diagram will take, margins included.
 */
export function spaceColumns(
  model: Model,
  cols: Column[],
  msgs: Msg[],
  acts: Act[],
  frags: Frag[],
  wrap: number,
): { width: number } {
  const S = SEQ;
  const n = cols.length;
  const spans = groupSpans(cols);
  const levels = heights(model);
  // A group with one participant is at least as wide as its header needs.
  for (const c of cols) c.room = c.geom.w;
  for (const [id, [lo, hi]] of spans) {
    const grp = model.groups.find((g) => g.id === id);
    const col = cols[lo];
    if (!grp || !col || lo !== hi) continue;
    const pad = 2 * S.groupPad * (levels.get(id) ?? 1);
    col.room = Math.max(col.room, groupGeometry(grp).minWidth - pad);
  }
  // Group borders that fall in each gap: those ending at its left column and starting at its right.
  const border: number[] = [];
  const ending: number[] = [];
  const starting: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const left = cols[i]?.groups ?? [];
    const right = cols[i + 1]?.groups ?? [];
    ending.push(left.filter((g) => !right.includes(g)).length);
    starting.push(right.filter((g) => !left.includes(g)).length);
    border.push(((ending[i] ?? 0) + (starting[i] ?? 0)) * S.groupPad);
  }
  // How far right of its lifeline each column's self messages reach, a group around it with them.
  const reach = cols.map((c) => c.room / 2);
  msgs.forEach((m, k) => {
    if (m.a !== m.b) return;
    const out = sideOf(acts, m.a, k, 1) + S.loopW + 8 + chip(labelOf(m, wrap));
    reach[m.a] = Math.max(reach[m.a] ?? 0, out);
  });
  const xs = [0];
  for (let i = 0; i + 1 < n; i++) {
    const a = cols[i]?.room ?? 0;
    const b = cols[i + 1]?.room ?? 0;
    const gap = border[i] ? (border[i] ?? 0) + S.borderGap : S.headGap;
    xs.push((xs[i] ?? 0) + Math.max(S.minPitch, (a + b) / 2 + gap));
  }
  // What each message needs between its lifelines, measured with the room they have now.
  interface Need {
    lo: number;
    hi: number;
    /** Everything but the label chip. */
    over: number;
    m: Msg;
  }
  let overflow = 0;
  const needs: Need[] = [];
  const room = (nd: Need) => (xs[nd.hi] ?? 0) - (xs[nd.lo] ?? 0) - nd.over - S.chipX;
  msgs.forEach((m, k) => {
    const badge = m.step !== undefined ? S.step + 6 : 0;
    if (m.a === m.b) {
      const over =
        sideOf(acts, m.a, k, 1) +
        S.loopW +
        8 +
        S.margin +
        (m.a + 1 < n ? -sideOf(acts, m.a + 1, k, -1) + (border[m.a] ?? 0) : 0);
      const nd = { lo: m.a, hi: m.a + 1, over, m };
      m.label = labelOf(m, m.a + 1 < n ? Math.max(wrap, room(nd)) : wrap);
      if (m.a + 1 < n) needs.push(nd);
      else overflow = Math.max(overflow, over - S.margin + chip(m.label));
      return;
    }
    const lo = Math.min(m.a, m.b);
    const hi = Math.max(m.a, m.b);
    let over = sideOf(acts, lo, k, 1) - sideOf(acts, hi, k, -1) + 2 * S.margin + badge;
    // Across a group border the label sits outside the groups, between their borders (DG220).
    if (hi - lo === 1 && border[lo]) {
      const left = ending[lo] ? (reach[lo] ?? 0) + (ending[lo] ?? 0) * S.groupPad : 0;
      const right = starting[lo] ? (cols[hi]?.room ?? 0) / 2 + (starting[lo] ?? 0) * S.groupPad : 0;
      over += left + right + 8;
    }
    const nd = { lo, hi, over, m };
    m.label = labelOf(m, Math.max(wrap, room(nd)));
    needs.push(nd);
  });
  const need = (nd: Need) =>
    nd.over + (nd.m.a === nd.m.b ? chip(nd.m.label) : Math.max(chip(nd.m.label), S.minArrow));
  // Short spans first, so a long message only widens what its neighbors left too narrow.
  for (const nd of [...needs].sort((p, q) => p.hi - p.lo - (q.hi - q.lo)))
    widen(xs, nd.lo, nd.hi, need(nd));
  // A group with several participants spans at least its header.
  for (const [id, [lo, hi]] of spans) {
    const grp = model.groups.find((g) => g.id === id);
    if (!grp || lo === hi) continue;
    const pad = 2 * S.groupPad * (levels.get(id) ?? 1);
    const ends = ((cols[lo]?.room ?? 0) + (cols[hi]?.room ?? 0)) / 2;
    widen(xs, lo, hi, groupGeometry(grp).minWidth - pad - ends);
  }
  // Wrap again with the room each label has now: some neighbors moved apart for others.
  for (const nd of needs) {
    const m = nd.m;
    if (!m.label) continue;
    const again = labelOf(m, Math.max(m.label.width, room(nd)));
    if (again && again.lines.length <= m.label.lines.length) m.label = again;
  }
  cols.forEach((c, i) => {
    c.x = xs[i] ?? 0;
  });
  // Fragments reach past the lifelines they hold; groups past their heads.
  const deepest = Math.max(-1, ...frags.map((f) => f.depth));
  const fragReach = deepest < 0 ? 0 : S.bar / 2 + S.fragPad + S.fragNest * deepest;
  const first = cols[0];
  const last = cols[n - 1];
  const groupReach = (c: Column | undefined) => S.groupPad * (c?.groups.length ?? 0);
  const left = Math.max((first?.room ?? 0) / 2 + groupReach(first), fragReach);
  const right = Math.max(
    (last?.room ?? 0) / 2 + groupReach(last),
    fragReach,
    overflow + groupReach(last),
  );
  return { width: Math.ceil((xs[n - 1] ?? 0) + left + right + 2 * S.pad) };
}
