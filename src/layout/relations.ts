// How items and edges relate in the model: parents, grids, align blocks and overlays, and which
// edges ELK routes and which are drawn after it.

import type { Model, ModelEdge } from "../types.ts";
import type { LayoutOptions } from "./context.ts";
import type { Plan } from "./plan.ts";

export interface Relations {
  groupIds: Set<string>;
  /** Overlay groups (around:) with their members. */
  overlays: Map<string, string[]>;
  parentOf: Map<string, string | undefined>;
  /** Every group above an item, innermost first. */
  above(id: string): string[];
  /** The innermost group both items are in. */
  lowest(a: string, b: string): string | undefined;
  /** The child group of a grid an item sits in (itself included), innermost first. */
  cellOf(id: string | undefined): string | undefined;
  /** An edge to anything in a grid, or between two of its cells. */
  gridBetween(e: ModelEdge): boolean;
  /** An edge between two nodes of one align block. */
  inBlock(e: ModelEdge): boolean;
  /** An edge to or from a node on a group's border (on:), which moves once ELK placed it. */
  seated(e: ModelEdge): boolean;
  /** An edge routed after ELK instead of by it. */
  free(e: ModelEdge): boolean;
  /** What stands for an item in the main graph: the outermost grid it is in, else itself. */
  rep(id: string): string;
  /** The nodes a group ELK does not see stands for: an overlay's members, a lane's contents. */
  inside(id: string): string[];
  members(id: string): string[];
}

export function relations(
  model: Model,
  plan: Plan,
  hidden: Set<string>,
  opts: LayoutOptions,
): Relations {
  const groupIds = new Set(model.groups.map((g) => g.id));
  // Overlays (around:) are outlined after layout, so ELK never sees them: an edge with an overlay
  // end is routed afterwards like constraint: false, to the overlay's border. While laying out,
  // ELK gets hidden copies of it to the overlay's members, so it still orders the layers.
  const overlays = new Map(
    model.groups.filter((g) => g.around?.length).map((g) => [g.id, g.around ?? []]),
  );
  // A grid (cols) is one fixed box to ELK, so an edge to anything in it, or between two of its
  // cells, is routed after layout too; so is an edge between two nodes of one align block. An
  // edge inside one child group of a grid belongs to that group's own ELK run.
  const parentOf = new Map([...model.groups, ...model.nodes].map((x) => [x.id, x.parent]));
  const above = (id: string): string[] => {
    const out: string[] = [];
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) out.push(p);
    return out;
  };
  const lowest = (a: string, b: string): string | undefined => {
    const up = new Set([a, ...above(a)]);
    return [b, ...above(b)].find((g) => up.has(g) && groupIds.has(g));
  };
  const cellOf = (id: string | undefined): string | undefined =>
    id === undefined
      ? undefined
      : [id, ...above(id)].find((g) => groupIds.has(g) && plan.grids.has(parentOf.get(g) ?? ""));
  const gridBetween = (e: ModelEdge): boolean => {
    if (!plan.grids.size) return false;
    const l = lowest(e.from, e.to);
    if (l && plan.grids.has(l)) return true;
    return [e.from, e.to].some((id) => {
      if (id === l) return false;
      for (const g of above(id)) {
        if (g === l) return false;
        if (plan.grids.has(g)) return true;
      }
      return false;
    });
  };
  const inBlock = (e: ModelEdge) => {
    const b = plan.blockOf.get(e.from);
    return b !== undefined && b === plan.blockOf.get(e.to);
  };
  const seated = (e: ModelEdge) => plan.seats.has(e.from) || plan.seats.has(e.to);
  const free = (e: ModelEdge) =>
    !e.constraint ||
    overlays.has(e.from) ||
    overlays.has(e.to) ||
    hidden.has(e.from) ||
    hidden.has(e.to) ||
    inBlock(e) ||
    gridBetween(e) ||
    seated(e) ||
    !!opts.loose?.has(e.id);
  const rep = (id: string) => [id, ...above(id)].filter((g) => plan.grids.has(g)).at(-1) ?? id;
  const inside = (id: string): string[] =>
    [...model.nodes, ...model.groups]
      .filter((x) => x.parent === id)
      .flatMap((x) => (hidden.has(x.id) ? inside(x.id) : [x.id]));
  const members = (id: string) =>
    (overlays.get(id) ?? (hidden.has(id) ? inside(id) : [id])).filter((m) => !overlays.has(m));
  return {
    groupIds,
    overlays,
    parentOf,
    above,
    lowest,
    cellOf,
    gridBetween,
    inBlock,
    seated,
    free,
    rep,
    inside,
    members,
  };
}

/** How many groups lead from `id` up to the top, `id` included (0 when it is undefined). */
export const depthOf = (model: Model, id: string | undefined): number => {
  let d = 0;
  let p = id;
  while (p) {
    d += 1;
    p = model.groups.find((g) => g.id === p)?.parent;
  }
  return d;
};

/**
 * The ids of the edges on a cycle of the model: inside one strongly connected component (Tarjan,
 * walked with an explicit stack so a long chain cannot overflow the call stack), self loops too.
 */
export function loopedEdges(model: Model): Set<string> {
  const next = new Map<string, string[]>();
  for (const e of model.edges) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const comp = new Map<string, number>();
  const stack: string[] = [];
  let count = 0;
  for (const root of next.keys()) {
    if (index.has(root)) continue;
    // Each frame is a node and how many of its successors it has walked.
    const walk: [string, number][] = [[root, 0]];
    index.set(root, count);
    low.set(root, count++);
    stack.push(root);
    while (walk.length) {
      const top = walk[walk.length - 1] as [string, number];
      const [v, i] = top;
      const w = next.get(v)?.[i];
      if (w !== undefined) {
        top[1]++;
        if (!index.has(w)) {
          index.set(w, count);
          low.set(w, count++);
          stack.push(w);
          walk.push([w, 0]);
        } else if (!comp.has(w)) low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
        continue;
      }
      walk.pop();
      const parent = walk[walk.length - 1]?.[0];
      if (parent !== undefined) low.set(parent, Math.min(low.get(parent) ?? 0, low.get(v) ?? 0));
      if (low.get(v) !== index.get(v)) continue;
      for (let x = stack.pop(); x !== undefined; x = stack.pop()) {
        comp.set(x, index.get(v) ?? 0);
        if (x === v) break;
      }
    }
  }
  // Two different ends in one component lie on a cycle together.
  return new Set(
    model.edges
      .filter((e) => e.from === e.to || comp.get(e.from) === comp.get(e.to))
      .map((e) => e.id),
  );
}
