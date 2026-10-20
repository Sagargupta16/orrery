// Running ELK: grids first, then the main graph (again with the ends of crossing edges unpinned,
// when that crosses less), then grid cells filled in and align blocks hoisted away.

import type { Graph, Laid, Setup } from "./context.ts";
import { crossings, type ElkNode, LAYER_CONSTRAINT, runElk } from "./elk.ts";
import { boxGrids, fillGrids, type GridPlan } from "./grids.ts";

export async function runLayout(ctx: Graph): Promise<Laid> {
  const { model, plan, root } = ctx;
  const ranked = (graph: ElkNode) => runRanked(ctx, graph);
  const gridPlans = new Map<string, GridPlan>();
  const cellRuns = new Map<string, ElkNode>();
  if (plan.grids.size) await boxGrids(ctx, ranked, gridPlans, cellRuns);

  let { graph: result, fallback } = await ranked(root);
  // Spec order holds wherever it costs no crossing: when the ordered layout crosses edges, the
  // nodes at the ends of those edges (never groups) may reorder, and fewer crossings win.
  const strict = crossings(result);
  if (strict.count > 0) {
    const free = structuredClone(root);
    const leaves = new Set(model.nodes.map((n) => n.id).filter((id) => strict.nodes.has(id)));
    const unpin = (n: ElkNode) => {
      if (leaves.has(n.id) && n.layoutOptions) delete n.layoutOptions["elk.position"];
      for (const c of n.children ?? []) unpin(c);
    };
    unpin(free);
    const alt = await runElk(free);
    if (crossings(alt.graph).count < strict.count) ({ graph: result, fallback } = alt);
  }
  // Fill each grid's cells, then drop the align blocks, so the rest of layout sees plain nodes,
  // groups and edges.
  fillGrids(ctx, result, gridPlans, cellRuns);
  if (plan.blocks.size) {
    const hoist = (n: ElkNode) => {
      if (!n.children) return;
      n.children = n.children.flatMap((c) => (plan.blocks.has(c.id) ? (c.children ?? []) : [c]));
      for (const c of n.children) hoist(c);
    };
    hoist(result);
  }
  return { ...ctx, result, fallback };
}

// ELK rejects some first and last layer combinations (two such nodes linked through a group's
// border): lay out without them and report each.
async function runRanked(ctx: Setup, graph: ElkNode) {
  const { model, plan } = ctx;
  try {
    return await runElk(graph);
  } catch (err) {
    const stripped = new Set<string>();
    const strip = (n: ElkNode) => {
      if (n.layoutOptions?.[LAYER_CONSTRAINT]) {
        delete n.layoutOptions[LAYER_CONSTRAINT];
        stripped.add(n.id);
      }
      for (const c of n.children ?? []) strip(c);
    };
    strip(graph);
    if (!stripped.size) throw err;
    for (const n of model.nodes)
      if (stripped.has(plan.blockOf.get(n.id) ?? n.id) && (n.rank === "first" || n.rank === "last"))
        plan.ignored.push({
          subject: n.id,
          setting: "rank",
          reason: "the layout engine cannot keep it there with its links",
        });
    return runElk(graph);
  }
}
