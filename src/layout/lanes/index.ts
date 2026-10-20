// Pools and swimlanes: groups of type pool and lane. ELK lays the flow out without them, then the
// lanes become bands across the flow and every node moves into its own lane's band.
//
// The flow keeps ELK's layers along the main axis (x in a right or left flow); across it each band
// is as deep as its deepest layer, stacked in spec order. A lone node sits on its band's center
// line, so a chain inside one lane is one straight line. Every edge is then routed again on a grid
// of the gaps between layers and the bands' center lines and channels, because ELK's routes point
// at where the nodes were.
//
// The pieces live in layout-kinds/: lane-bands.ts (the band tree, sizes and placement),
// lane-routes.ts and lane-ports.ts (edge routing), lane-grid.ts (the grid router) and
// lane-labels.ts (edge labels).

import type { Model, ModelGroup } from "../../types.ts";
import type { LayoutHooks } from "../hooks.ts";
import { bandLayout } from "./bands.ts";

const isBandType = (g: ModelGroup | undefined): g is ModelGroup =>
  !!g && !g.around && (g.type === "pool" || g.type === "lane");

/** Pools and lanes drawn as bands: at the top level, or nested only in each other. */
function bandIds(model: Model): Set<string> {
  const byId = new Map(model.groups.map((g) => [g.id, g]));
  const out = new Set<string>();
  for (const g of model.groups) {
    let ok = isBandType(g);
    for (let p = g.parent; ok && p; p = byId.get(p)?.parent) ok = isBandType(byId.get(p));
    if (ok) out.add(g.id);
  }
  return out;
}

/** Band order, depth first: a pool's own nodes, then its lanes in spec order. */
function bandRanks(model: Model, ids: Set<string>): Map<string, number> {
  const rank = new Map<string, number>();
  const visit = (id: string) => {
    rank.set(id, rank.size);
    for (const g of model.groups) if (g.parent === id && ids.has(g.id)) visit(g.id);
  };
  for (const g of model.groups) if (ids.has(g.id) && !g.parent) visit(g.id);
  return rank;
}

export const laneHooks: LayoutHooks = {
  hiddenGroups: (model) => bandIds(model),
  elkOptions(model) {
    const ids = bandIds(model);
    if (!ids.size) return {};
    // A loop back (retry, rework) is the edge against the order the steps are written in; ELK's
    // greedy cycle breaking can instead turn the loop's decision into the first step.
    const options: Record<string, string> = { "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST" };
    // The bands are tighter than ELK's flat layout, so ELK must not size the canvas: layout sizes
    // it from the bands. The option reaches every group too, so only when no other group exists.
    if (model.groups.every((g) => ids.has(g.id) || g.around))
      options["elk.nodeSize.fixedGraphSize"] = "true";
    return options;
  },
  order(model) {
    const ids = bandIds(model);
    if (!ids.size) return undefined;
    const rank = bandRanks(model, ids);
    const out = new Map<string, number>();
    for (const x of [...model.groups, ...model.nodes]) {
      if (ids.has(x.id)) continue;
      if (!x.parent) out.set(x.id, rank.size);
      else if (ids.has(x.parent)) out.set(x.id, rank.get(x.parent) ?? 0);
    }
    return out;
  },
  after: (ctx) => {
    const ids = bandIds(ctx.model);
    if (ids.size) bandLayout(ctx, ids);
  },
};
