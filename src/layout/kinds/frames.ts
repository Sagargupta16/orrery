// Groups around tree and mind map nodes: the margins they keep, the room they need between
// neighbors, and how they follow their members and clear their headers once the nodes moved.

import type { Box, SceneGroup } from "../../types.ts";
import type { AfterLayout } from "../hooks.ts";
import { crosses, footOf, r, segments, union } from "./shared.ts";
import type { Hierarchy } from "./tidy.ts";

interface Margin {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface Frames {
  /** The frames around a node, innermost first. */
  chain(id: string): string[];
  /** What each frame keeps around its members (the header is in the top margin). */
  margin: Map<string, Margin>;
}

/** The groups that frame tree or map nodes, and the margins ELK gave them. */
export function frames(ctx: AfterLayout, before: Map<string, Box>): Frames {
  const margin = new Map<string, Margin>();
  const all = [...ctx.model.nodes, ...ctx.model.groups];
  for (const g of ctx.groups) {
    if (g.overlay || g.lane) continue;
    const members = all.filter((x) => x.parent === g.id).map((x) => before.get(x.id));
    const inner = union(members);
    if (!inner) continue;
    const b = g.box;
    margin.set(g.id, {
      l: inner.x - b.x,
      t: inner.y - b.y,
      r: b.x + b.w - (inner.x + inner.w),
      b: b.y + b.h - (inner.y + inner.h),
    });
  }
  const parentOf = new Map(all.map((x) => [x.id, x.parent]));
  const chain = (id: string) => {
    const out: string[] = [];
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) if (margin.has(p)) out.push(p);
    return out;
  };
  return { chain, margin };
}

/**
 * Room the frames need along and across the flow: neighbors in different frames stand apart by
 * the margins between them, and the gap into a node grows by the near margin (header) of each
 * frame it enters and the far margin of each it leaves.
 */
export function room(f: Frames, h: Hierarchy, horizontal: boolean, sign: number) {
  const near = (m: Margin) => (horizontal ? (sign > 0 ? m.l : m.r) : sign > 0 ? m.t : m.b);
  const far = (m: Margin) => (horizontal ? (sign > 0 ? m.r : m.l) : sign > 0 ? m.b : m.t);
  const sum = (ids: string[], side: (m: Margin) => number) =>
    ids.reduce((a, g) => a + side(f.margin.get(g) ?? { l: 0, t: 0, r: 0, b: 0 }), 0);
  const parentChain = (id: string) => {
    const p = h.parent.get(id);
    return p ? f.chain(p) : [];
  };
  return {
    chain: f.chain,
    /** Extra space between two neighbors: the margins of the frames only one of them is in. */
    between: (left: string[], right: string[]) =>
      sum(
        left.filter((g) => !right.includes(g)),
        (m) => (horizontal ? m.b : m.r),
      ) +
      sum(
        right.filter((g) => !left.includes(g)),
        (m) => (horizontal ? m.t : m.l),
      ),
    /** Frames entered on the way into a node, near margins summed. */
    enter: (id: string) => {
      const from = parentChain(id);
      return sum(
        f.chain(id).filter((g) => !from.includes(g)),
        near,
      );
    },
    /** Frames left on the way into a node, far margins summed. */
    leave: (id: string) => {
      const to = f.chain(id);
      return sum(
        parentChain(id).filter((g) => !to.includes(g)),
        far,
      );
    },
  };
}

/** Each node's footprint and each group's box before the hook moved anything. */
export function snapshot(ctx: AfterLayout): Map<string, Box> {
  return new Map<string, Box>([
    ...ctx.nodes.map((n): [string, Box] => [n.id, { ...footOf(n) }]),
    ...ctx.groups.map((g): [string, Box] => [g.id, { ...g.box }]),
  ]);
}

/**
 * Frames follow their members: each group keeps the margins it had around them, innermost
 * first, overlays last. Header label and icon keep their place in the frame (centered ones stay
 * centered).
 */
export function refit(ctx: AfterLayout, before: Map<string, Box>): void {
  const now = (id: string): Box | undefined => {
    const n = ctx.nodes.find((x) => x.id === id);
    return n ? footOf(n) : ctx.groups.find((g) => g.id === id)?.box;
  };
  const rank = (g: SceneGroup) => (g.overlay ? -1 : g.depth);
  const order = ctx.groups.filter((g) => !g.lane).sort((a, b) => rank(b) - rank(a));
  for (const g of order) {
    const model = ctx.model.groups.find((x) => x.id === g.id);
    const members = g.overlay
      ? (model?.around ?? [])
      : [...ctx.model.nodes, ...ctx.model.groups].filter((x) => x.parent === g.id).map((x) => x.id);
    const was = union(members.map((id) => before.get(id)));
    const is = union(members.map(now));
    const old = before.get(g.id);
    if (!was || !is || !old) continue;
    // Sideways a frame is as wide as ELK made it, or its members and ELK's 20px padding, centered
    // on them; top and bottom keep their margins (the header is in the top one).
    const w = g.overlay ? is.w + (old.w - was.w) : Math.max(old.w, is.w + 40);
    const box = {
      x: r(g.overlay ? is.x - (was.x - old.x) : is.x + is.w / 2 - w / 2),
      y: r(is.y - (was.y - old.y)),
      w: r(w),
      h: r(is.h + (old.h - was.h)),
    };
    const slide = (b: Box | undefined) => {
      if (!b) return;
      const centered = Math.abs(b.x + b.w / 2 - (old.x + old.w / 2)) < 1;
      b.x = r(centered ? box.x + (box.w - b.w) / 2 : b.x + box.x - old.x);
      b.y = r(b.y + box.y - old.y);
    };
    slide(g.labelBox);
    slide(g.iconBox);
    if (g.inner) {
      const ib = g.inner.box;
      g.inner.box = {
        x: r(box.x + ib.x - old.x),
        y: r(box.y + ib.y - old.y),
        w: r(box.w - (old.w - ib.w)),
        h: r(box.h - (old.h - ib.h)),
      };
    }
    Object.assign(g.box, box);
  }
}

/**
 * Slides a group's header label (and an inline icon) off the connectors that run through it,
 * inside the frame: layout would only slide it within where the frame was before the hook.
 */
export function clearHeaders(ctx: AfterLayout): void {
  for (const g of ctx.groups) {
    if (g.lane || !g.label.lines.length) continue;
    const corner =
      g.iconBox !== undefined &&
      Math.abs(g.iconBox.x - g.box.x) < 0.5 &&
      Math.abs(g.iconBox.y - g.box.y) < 0.5;
    const icon = g.iconBox && !corner ? g.iconBox : undefined;
    for (let round = 0; round < 4; round++) {
      const u = union([g.labelBox, icon]) ?? g.labelBox;
      const chip = { x: u.x - 6, y: u.y - 1, w: u.w + 12, h: u.h + 2 };
      const cut = ctx.edges
        .flatMap((e) => segments(e.points))
        .find(([p, q]) => crosses(p, q, chip, 0.5));
      if (!cut) break;
      const lo = (corner && g.iconBox ? g.iconBox.x + g.iconBox.w + 8 : g.box.x + 12) - u.x;
      const hi = g.box.x + g.box.w - 12 - (u.x + u.w);
      const right = Math.max(cut[0].x, cut[1].x) + 8 - u.x;
      const left = Math.min(cut[0].x, cut[1].x) - 8 - (u.x + u.w);
      const dx = right <= hi ? right : left >= lo ? left : undefined;
      if (dx === undefined) break;
      g.labelBox.x = r(g.labelBox.x + dx);
      if (icon) icon.x = r(icon.x + dx);
    }
  }
}
