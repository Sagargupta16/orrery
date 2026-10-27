// Top to bottom: the title, the participant groups' headers, the heads, then one row per message
// with each fragment's header above its first row, a divider above each further branch and its
// bottom under its last row; then where every message line runs across, and each fragment's sides.

import { textBlock } from "../../text.ts";
import type { Box, Model, SeqFragment, TextBlock } from "../../types.ts";
import { round } from "../geometry.ts";
import { groupGeometry } from "../measure.ts";
import { SIZES } from "../sizes.ts";
import { type Act, type Column, groupSpans, type Msg, SEQ, sideOf } from "./columns.ts";

export interface Frag {
  type: SeqFragment["type"];
  /** The message range as written, and the rows it covers. */
  from: number;
  to: number;
  first: number;
  last: number;
  /** The columns its messages reach, set with its sides. */
  cols: [number, number];
  depth: number;
  tag: TextBlock;
  label?: TextBlock;
  dividers: { k: number; y: number; label?: TextBlock }[];
  top: number;
  bottom: number;
  x: number;
  right: number;
}

/** The stage skin sets guards in Geist Mono at 10px (render/stage/text.ts NOTE), 0.6em a glyph. */
const monoWidth = (s: string) => 10 * ([...s].length * 0.6);

/** A guard as UML writes it: in square brackets, as wide as either skin's face needs. */
const guard = (s: string | undefined) => {
  const text = s?.trim();
  if (!text) return undefined;
  const b = textBlock(text.startsWith("[") ? text : `[${text}]`, SIZES.edgeLabel, 260);
  return { ...b, width: Math.max(b.width, ...b.lines.map((l) => Math.ceil(monoWidth(l)))) };
};

/**
 * The spec's fragments over the rows they cover. One that would cross another without nesting is
 * dropped (the spec check reports it, DG125), as is one that covers no drawn message.
 */
export function fragmentsOf(model: Model, msgs: Msg[]): Frag[] {
  const found: Frag[] = [];
  for (const f of model.fragments ?? []) {
    // A view that drops messages keeps the spec's numbers: a range past the end no longer holds.
    if (f.from < 1 || f.to > model.edges.length || f.from > f.to) continue;
    const first = msgs.findIndex((m) => m.index >= f.from);
    let last = -1;
    msgs.forEach((m, k) => {
      if (m.index <= f.to) last = k;
    });
    if (first < 0 || last < first) continue;
    const dividers: Frag["dividers"] = [];
    for (const e of f.type === "alt" || f.type === "par" ? (f.else ?? []) : []) {
      const k = msgs.findIndex((m) => m.index >= e.at);
      if (k <= first || k > last || dividers.some((d) => d.k === k)) continue;
      const label = guard(e.label);
      dividers.push({ k, y: 0, ...(label ? { label } : {}) });
    }
    const label = guard(f.label);
    found.push({
      type: f.type,
      from: f.from,
      to: f.to,
      first,
      last,
      cols: [0, 0],
      depth: 0,
      tag: textBlock(f.type, 11, 200, 600),
      ...(label ? { label } : {}),
      dividers: dividers.sort((p, q) => p.k - q.k),
      top: 0,
      bottom: 0,
      x: 0,
      right: 0,
    });
  }
  // Outer before inner: earliest first, longest first among those, then spec order.
  const sorted = found
    .map((f, i) => ({ f, i }))
    .sort((p, q) => p.f.first - q.f.first || q.f.last - p.f.last || p.i - q.i)
    .map(({ f }) => f);
  const kept: Frag[] = [];
  const inside = (a: Frag, b: Frag) => a.first >= b.first && a.last <= b.last;
  for (const f of sorted) {
    const crosses = kept.some(
      (o) => !(f.last < o.first || f.first > o.last) && !inside(f, o) && !inside(o, f),
    );
    if (crosses) continue;
    f.depth = kept.filter((o) => inside(f, o)).length;
    kept.push(f);
  }
  return kept;
}

export interface Rows {
  title?: TextBlock;
  subtitle?: TextBlock;
  titleBox?: Box;
  subtitleBox?: Box;
  headTop: number;
  headBottom: number;
  /** Top of each participant group's box. */
  groupTop: Map<string, number>;
  /** Where the lifelines end: the top of the feet when there are any. */
  lifeEnd: number;
  /** The participants' names at the foot of a tall diagram, one per column. */
  feet?: TextBlock[];
  /** The lowest thing the rows draw (feet included). */
  bottom: number;
}

/** Places everything vertically; `width` is the diagram's expected width, for wrapping the title. */
export function placeRows(
  model: Model,
  cols: Column[],
  msgs: Msg[],
  frags: Frag[],
  width: number,
): Rows {
  const S = SEQ;
  const P = S.pad;
  const wrapTitle = Math.max(width - 2 * P, 560);
  const title = model.title ? textBlock(model.title, SIZES.title, wrapTitle, 600, 1.25) : undefined;
  const subtitle = model.subtitle
    ? textBlock(model.subtitle, SIZES.subtitle, wrapTitle, 400)
    : undefined;
  let titleBox: Box | undefined;
  let subtitleBox: Box | undefined;
  let y = P;
  if (title) {
    titleBox = { x: P, y: P - 4, w: round(title.width), h: round(title.height) };
    if (subtitle)
      subtitleBox = {
        x: P,
        y: round(titleBox.y + title.height + 4),
        w: round(subtitle.width),
        h: round(subtitle.height),
      };
    // As the other layouts: whole pixels under the title, then the page margin.
    y = Math.ceil(P + title.height + (subtitle ? subtitle.height + 4 : 0) - 6) + P;
  }
  // Group headers stack above the heads, the outermost highest.
  const spans = groupSpans(cols);
  const below = new Map<string, number>();
  const bandsBelow = (id: string): number => {
    const known = below.get(id);
    if (known !== undefined) return known;
    const grp = model.groups.find((g) => g.id === id);
    const kids = model.groups.filter((g) => g.parent === id && spans.has(g.id));
    const v =
      (grp ? groupGeometry(grp).header + 4 : 0) + Math.max(0, ...kids.map((g) => bandsBelow(g.id)));
    below.set(id, v);
    return v;
  };
  const roots = [...spans.keys()].filter((id) => {
    const parent = model.groups.find((g) => g.id === id)?.parent;
    return !parent || !spans.has(parent);
  });
  const headTop = y + (roots.length ? 8 + Math.max(...roots.map(bandsBelow)) : 0);
  const groupTop = new Map([...spans.keys()].map((id) => [id, headTop - 8 - bandsBelow(id)]));
  const headBottom = headTop + Math.max(0, ...cols.map((c) => c.geom.h));

  let cursor = headBottom + S.firstGap;
  msgs.forEach((m, k) => {
    for (const f of frags.filter((x) => x.first === k).sort((p, q) => p.depth - q.depth)) {
      f.top = cursor;
      cursor += Math.max(S.tagH, (f.label?.height ?? 0) + 4) + S.tagGap;
    }
    for (const f of frags)
      for (const d of f.dividers.filter((x) => x.k === k)) {
        d.y = cursor + 2;
        cursor = d.y + (d.label ? 4 + d.label.height + 6 : 8);
      }
    const lbh = m.label ? m.label.height + S.chipY : 0;
    const half = m.step !== undefined ? S.step / 2 : 0;
    m.top = cursor;
    if (m.a === m.b) {
      m.loop = Math.max(S.loopH, lbh);
      m.y = cursor + Math.max(4, half);
      m.bottom = m.y + m.loop;
    } else {
      m.y = cursor + Math.max(lbh + S.lineGap, half, 6);
      m.bottom = m.y + Math.max(half, 2);
    }
    const ending = frags.filter((x) => x.last === k).sort((p, q) => q.depth - p.depth);
    let end = m.bottom;
    for (const f of ending) {
      end += f === ending[0] ? S.fragBottom : 8;
      f.bottom = end;
    }
    cursor = end + S.rowGap;
  });
  let lifeEnd = cursor + 4;
  let bottom = lifeEnd;
  let feet: TextBlock[] | undefined;
  if (lifeEnd - headBottom > S.tall) {
    feet = cols.map((c) => textBlock(c.node.label || c.node.id, 12, 132, 600));
    bottom = lifeEnd + Math.max(...feet.map((f) => f.height)) + 10;
  }
  lifeEnd = round(lifeEnd);
  return {
    ...(title ? { title } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(titleBox ? { titleBox } : {}),
    ...(subtitleBox ? { subtitleBox } : {}),
    headTop,
    headBottom,
    groupTop,
    lifeEnd,
    ...(feet ? { feet } : {}),
    bottom: round(bottom),
  };
}

const chipW = (b: TextBlock | undefined) => (b?.lines.length ? b.width + SEQ.chipX : 0);

/** Where each message line leaves and lands (on a bar's side when one is open), its label and badge. */
export function placeMessagesX(cols: Column[], msgs: Msg[], acts: Act[]): void {
  const S = SEQ;
  msgs.forEach((m, k) => {
    const xa = cols[m.a]?.x ?? 0;
    const xb = cols[m.b]?.x ?? 0;
    const lbw = chipW(m.label);
    const lbh = m.label ? m.label.height + S.chipY : 0;
    if (m.a === m.b) {
      m.x0 = m.x1 = round(xa + sideOf(acts, m.a, k, 1));
      if (m.label) m.labelBox = box(m.x0 + S.loopW + 8, m.y + (m.loop - lbh) / 2, lbw, lbh);
      if (m.step !== undefined)
        m.stepBox = box(m.x0 + S.loopW / 2 - S.step / 2, m.y - S.step / 2, S.step, S.step);
      return;
    }
    const dir = m.b > m.a ? 1 : -1;
    m.x0 = round(xa + sideOf(acts, m.a, k, dir === 1 ? 1 : -1));
    m.x1 = round(xb + sideOf(acts, m.b, k, dir === 1 ? -1 : 1));
    let lo = Math.min(m.x0, m.x1) + S.margin;
    let hi = Math.max(m.x0, m.x1) - S.margin;
    if (m.step !== undefined) {
      // The badge sits on the line where the message leaves, as numbered callouts do.
      const cx = m.x0 + dir * (S.step / 2 + 4);
      m.stepBox = box(cx - S.step / 2, m.y - S.step / 2, S.step, S.step);
      if (dir > 0) lo = Math.max(lo, cx + S.step / 2 + 6);
      else hi = Math.min(hi, cx - S.step / 2 - 6);
    }
    m.span = [lo, hi];
    if (m.label) m.labelBox = box((lo + hi) / 2 - lbw / 2, m.y - S.lineGap - lbh, lbw, lbh);
  });
}

const box = (x: number, y: number, w: number, h: number): Box => ({
  x: round(x),
  y: round(y),
  w: round(w),
  h: round(h),
});

/** Each fragment's sides: around its lifelines, bars, loops and labels, and around the ones inside. */
export function placeFragmentsX(cols: Column[], msgs: Msg[], acts: Act[], frags: Frag[]): void {
  const S = SEQ;
  for (const f of [...frags].sort((p, q) => q.depth - p.depth)) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    let c0 = Number.POSITIVE_INFINITY;
    let c1 = Number.NEGATIVE_INFINITY;
    for (let k = f.first; k <= f.last; k++) {
      const m = msgs[k];
      if (!m) continue;
      for (const c of [m.a, m.b]) {
        const x = cols[c]?.x ?? 0;
        lo = Math.min(lo, x + Math.min(sideOf(acts, c, k, -1), -S.bar / 2) - S.fragPad);
        hi = Math.max(hi, x + Math.max(sideOf(acts, c, k, 1), S.bar / 2) + S.fragPad);
        c0 = Math.min(c0, c);
        c1 = Math.max(c1, c);
      }
      if (m.a === m.b) hi = Math.max(hi, m.x0 + S.loopW + S.fragPad);
      const lb = m.labelBox;
      if (lb) {
        lo = Math.min(lo, lb.x - 8);
        hi = Math.max(hi, lb.x + lb.w + 8);
      }
    }
    for (const g of frags) {
      if (g === f || g.depth <= f.depth || g.first < f.first || g.last > f.last) continue;
      lo = Math.min(lo, g.x - S.fragNest);
      hi = Math.max(hi, g.right + S.fragNest);
    }
    const tagW = f.tag.width + 22;
    hi = Math.max(hi, lo + tagW + (f.label ? 10 + f.label.width + 10 : 10));
    for (const d of f.dividers) if (d.label) hi = Math.max(hi, lo + tagW + 10 + d.label.width + 10);
    f.x = round(lo);
    f.right = round(hi);
    f.cols = [c0, c1];
  }
}
