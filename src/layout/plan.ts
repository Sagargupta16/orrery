// Author-controlled placement: which rank, align and cols hints the layout can honor (and why not
// when it cannot), the cell grid of a cols group, and layers read back from a scene.

import type {
  Box,
  Direction,
  IgnoredSetting,
  Model,
  ModelEdge,
  ModelNode,
  Point,
} from "../types.ts";
import { round } from "./geometry.ts";

// ---------------------------------------------------------------- plan

/** What layout() does with the placement hints, and the ones it cannot honor. */
export interface Plan {
  ignored: IgnoredSetting[];
  /** Nodes that share one layer, by block id; members in spec order. */
  blocks: Map<string, string[]>;
  /** The block each member belongs to. */
  blockOf: Map<string, string>;
  /** rank first or last, by the ELK node it applies to: a node, or the block it is in. */
  ends: Map<string, "FIRST" | "LAST">;
  /** Groups whose children sit in a grid, with the column count. */
  grids: Map<string, number>;
  /** Nodes that sit on a group's border (on:), with that group, in spec order. */
  seats: Map<string, string>;
}

/** Diagram kinds that place every node themselves, so layer hints have nothing to steer. */
const SELF_PLACED: Partial<Record<Model["kind"], string>> = {
  tree: "a tree places every node itself",
  mindmap: "a mind map places every node itself",
  journey: "a journey places every step in its stage and lane",
};

/** Why rank, align and cols do nothing in this kind of diagram, if they do not. */
export const selfPlaced = (kind: Model["kind"]): string | undefined => SELF_PLACED[kind];

/**
 * Decides which hints hold. `hidden` are the groups ELK never sees (pools and lanes); their
 * members share the graph of the nearest group it does see.
 */
export function planPlacement(model: Model, hidden: Set<string>): Plan {
  const plan: Plan = {
    ignored: [],
    blocks: new Map(),
    blockOf: new Map(),
    ends: new Map(),
    grids: new Map(),
    seats: new Map(),
  };
  const ignore = (subject: string, setting: string, reason: string) =>
    plan.ignored.push({ subject, setting, reason });
  const own = selfPlaced(model.kind);
  const groups = new Map(model.groups.map((g) => [g.id, g]));
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  const host = (parent: string | undefined) => {
    let p = parent;
    while (p && hidden.has(p)) p = groups.get(p)?.parent;
    return p;
  };

  for (const g of model.groups) {
    if (g.cols === undefined) continue;
    if (own) ignore(g.id, "cols", own);
    else if (hidden.has(g.id))
      ignore(g.id, "cols", "a pool or lane places its members in its band");
    else if (g.around) ignore(g.id, "cols", "an overlay group is drawn around its members");
    else if (model.groups.some((c) => c.parent === g.id && hidden.has(c.id)))
      ignore(g.id, "cols", "its lanes place their members in their bands");
    else plan.grids.set(g.id, g.cols);
  }
  const cell = (n: ModelNode) => (n.parent && plan.grids.has(n.parent) ? n.parent : undefined);

  // align: union the nodes that share a layer; the block keeps spec order.
  const link = new Map<string, string>();
  const find = (id: string): string => {
    let r = id;
    for (let up = link.get(r); up && up !== r; up = link.get(r)) r = up;
    return r;
  };
  for (const n of model.nodes) {
    const t = n.align === undefined ? undefined : nodes.get(n.align);
    if (!t || t.id === n.id) continue;
    const grid = cell(n) ?? cell(t);
    if (own) ignore(n.id, "align", own);
    else if (grid)
      ignore(
        n.id,
        "align",
        `group "${grid}" places its children in ${plan.grids.get(grid)} columns`,
      );
    else if (host(n.parent) !== host(t.parent))
      ignore(n.id, "align", `"${t.id}" is in another group, and layers only line up inside one`);
    else link.set(find(n.id), find(t.id));
  }
  const byRoot = new Map<string, string[]>();
  for (const n of model.nodes) {
    if (!link.has(n.id) && ![...link.values()].includes(n.id)) continue;
    const r = find(n.id);
    byRoot.set(r, [...(byRoot.get(r) ?? []), n.id]);
  }
  for (const members of byRoot.values()) {
    if (members.length < 2) continue;
    const id = `__align:${members[0]}`;
    plan.blocks.set(id, members);
    for (const m of members) plan.blockOf.set(m, id);
  }

  // rank first and last: ELK's layer constraints, on the block when the node is in one.
  const unit = (id: string) => plan.blockOf.get(id) ?? id;
  const rankedBy = new Map<string, string[]>();
  for (const n of model.nodes) {
    if (n.rank !== "first" && n.rank !== "last") continue;
    const grid = cell(n);
    if (own) {
      ignore(n.id, "rank", own);
      continue;
    }
    if (grid) {
      ignore(
        n.id,
        "rank",
        `group "${grid}" places its children in ${plan.grids.get(grid)} columns`,
      );
      continue;
    }
    const want = n.rank === "first" ? "FIRST" : "LAST";
    const u = unit(n.id);
    const had = plan.ends.get(u);
    if (had && had !== want) {
      ignore(n.id, "rank", `it shares a layer with a node ranked ${had.toLowerCase()}`);
      continue;
    }
    plan.ends.set(u, want);
    rankedBy.set(u, [...(rankedBy.get(u) ?? []), n.id]);
  }
  // Two units in the first (or last) layer joined by an edge cannot both stay there: ELK rejects
  // the graph. The later one in spec order gives way.
  const overlay = new Set(model.groups.filter((g) => g.around?.length).map((g) => g.id));
  const laidOut = (e: ModelEdge) =>
    e.constraint && ![e.from, e.to].some((id) => overlay.has(id) || hidden.has(id));
  const order = new Map(model.nodes.map((n, i) => [n.id, i]));
  const at = (u: string) => order.get(rankedBy.get(u)?.[0] ?? "") ?? 0;
  for (const e of model.edges) {
    if (!laidOut(e)) continue;
    const a = unit(e.from);
    const b = unit(e.to);
    const end = plan.ends.get(a);
    if (a === b || !end || plan.ends.get(b) !== end) continue;
    const [first, second] = at(a) <= at(b) ? [a, b] : [b, a];
    plan.ends.delete(second);
    for (const id of rankedBy.get(second) ?? [])
      ignore(
        id,
        "rank",
        `it links to "${rankedBy.get(first)?.[0]}", also ranked ${end.toLowerCase()}`,
      );
  }

  // on: ELK lays the node out beside its group, in the group's parent, and layout moves it onto
  // the border once both are placed (layout/seats.ts).
  const above = (id: string | undefined) => {
    const out: string[] = [];
    for (let p = id; p; p = groups.get(p)?.parent) out.push(p);
    return out;
  };
  for (const n of model.nodes) {
    const g = n.on === undefined ? undefined : groups.get(n.on);
    if (!g) continue;
    const grid = g.parent && plan.grids.has(g.parent) ? g.parent : undefined;
    if (own) ignore(n.id, "on", own);
    else if (g.around)
      ignore(n.id, "on", `"${g.id}" is drawn around its members, so it has no border of its own`);
    else if (above(g.id).some((id) => hidden.has(id)))
      ignore(n.id, "on", `"${g.id}" is laid out as a pool or lane band`);
    else if (above(n.parent).includes(g.id))
      ignore(n.id, "on", `it is inside "${g.id}"; a node on the border sits in its parent`);
    else if (n.parent !== g.parent)
      ignore(
        n.id,
        "on",
        g.parent
          ? `it must be in "${g.parent}", the group "${g.id}" is in`
          : `"${g.id}" is at the top level, so the node must be too`,
      );
    else if (grid)
      ignore(n.id, "on", `group "${grid}" places its children in ${plan.grids.get(grid)} columns`);
    else plan.seats.set(n.id, g.id);
  }
  return plan;
}

// ---------------------------------------------------------------- grid

/** One child of a cols group: its drawn footprint, and where its ELK box sits inside it. */
export interface GridCell {
  id: string;
  /** Footprint size (box plus an outside label). */
  w: number;
  h: number;
  /** The box ELK lays out, relative to the footprint's top-left. */
  box: Box;
}

/**
 * The grid: row by row in spec order into `cols` equal cells, the cell as wide as the widest
 * child and the row pitch the tallest; each child centered across its cell, and every box
 * centered on one line per row (the icon band), so labels of different lengths hang below it.
 * Returns the content size and each footprint's top-left, relative to the content origin.
 */
export function gridCells(
  cells: GridCell[],
  cols: number,
  gap: number,
): { w: number; h: number; at: Point[] } {
  const n = cells.length;
  const c = Math.max(1, Math.min(cols, n));
  const rows = Math.ceil(n / c);
  const cellW = Math.max(0, ...cells.map((x) => x.w));
  const band = Math.max(0, ...cells.map((x) => x.box.h));
  const lift = (x: GridCell) => (band - x.box.h) / 2 - x.box.y;
  const pitch = Math.max(0, ...cells.map((x) => lift(x) + x.h));
  const at = cells.map((x, i) => ({
    x: round((i % c) * (cellW + gap) + (cellW - x.w) / 2),
    y: round(Math.floor(i / c) * (pitch + gap) + lift(x)),
  }));
  return {
    w: Math.ceil(c * cellW + (c - 1) * gap),
    h: Math.ceil(rows * pitch + (rows - 1) * gap),
    at,
  };
}

// ---------------------------------------------------------------- layers

export const horizontalFlow = (d: Direction) => d === "right" || d === "left";

/**
 * Layer index (0 first, in flow order) of each item: items whose spans along the flow overlap
 * share a layer, as ELK's own interactive layering reads positions.
 */
export function layersOf(
  items: { id: string; box: Box }[],
  direction: Direction,
): Map<string, number> {
  const h = horizontalFlow(direction);
  const back = direction === "left" || direction === "up";
  const spans = items
    .map((it) => {
      const lo = h ? it.box.x : it.box.y;
      const hi = lo + (h ? it.box.w : it.box.h);
      return back ? { id: it.id, lo: -hi, hi: -lo } : { id: it.id, lo, hi };
    })
    .sort((a, b) => a.lo - b.lo);
  const out = new Map<string, number>();
  let layer = -1;
  let end = Number.NEGATIVE_INFINITY;
  for (const s of spans) {
    if (s.lo >= end - 0.5) layer++;
    end = s.lo >= end - 0.5 ? s.hi : Math.max(end, s.hi);
    out.set(s.id, layer);
  }
  return out;
}
