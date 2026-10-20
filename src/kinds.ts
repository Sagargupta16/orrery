// Layout for the hierarchy and state kinds. tree (org charts, decision trees, taxonomies) and
// mindmap let ELK measure the nodes, then place every node themselves: a tidy tree with org-chart
// connectors, or a two-sided map with branch curves. state keeps the layered layout and redraws
// each self-transition as a loop on a corner of its state, with the label beside it.
//
// The pieces live in layout-kinds/: kind-tree.ts, kind-mindmap.ts and kind-state.ts place each
// kind; kind-tidy.ts (hierarchy, contours, levels), kind-frames.ts (groups around the nodes),
// kind-links.ts (edges outside the hierarchy) and kind-shared.ts (geometry, labels) serve them.

import type { LayoutHooks } from "./hooks.ts";
import { placeMindmap } from "./layout-kinds/kind-mindmap.ts";
import { restoreEdges } from "./layout-kinds/kind-shared.ts";
import { selfLoops } from "./layout-kinds/kind-state.ts";
import { placeTree } from "./layout-kinds/kind-tree.ts";

export const kindHooks: LayoutHooks = {
  elkOptions(model): Record<string, string> {
    // ELK only measures a tree or mind map (the hook places every node), so it must not size the
    // canvas: layout sizes it from what the hook placed.
    if (model.kind === "tree") return { "elk.nodeSize.fixedGraphSize": "true" };
    // One routing for every theme, so each ELK run is the same graph.
    if (model.kind === "mindmap")
      return { "elk.nodeSize.fixedGraphSize": "true", "elk.edgeRouting": "SPLINES" };
    // A loop on its own ports goes on the north side, where it is redrawn.
    if (model.kind === "state") return { "elk.layered.edgeRouting.selfLoopDistribution": "NORTH" };
    return {};
  },
  after(ctx) {
    if (ctx.model.kind === "tree") placeTree(ctx);
    else if (ctx.model.kind === "mindmap") placeMindmap(ctx);
    else if (ctx.model.kind === "state") {
      restoreEdges(ctx, (e) => e.from === e.to);
      selfLoops(ctx, false);
    }
  },
};
