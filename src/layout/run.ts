// Running ELK: grids first, then the main graph (with the greedy cycle breaker too when the spec
// has a loop, and again with the ends of crossing edges unpinned, when that crosses less), then
// grid cells filled in and align blocks hoisted away.

import type { Graph, Laid, Setup } from "./context.ts";
import { crossings, type ElkNode, LAYER_CONSTRAINT, runElk } from "./elk.ts";
import { boxGrids, fillGrids, type GridPlan } from "./grids.ts";
import { loopedEdges } from "./relations.ts";
import { ELK_BUDGET } from "./sizes.ts";

export async function runLayout(ctx: Graph): Promise<Laid> {
  const { model, plan, root } = ctx;
  const ranked = (graph: ElkNode) => runRanked(ctx, graph);
  const gridPlans = new Map<string, GridPlan>();
  const cellRuns = new Map<string, ElkNode>();
  if (plan.grids.size) await boxGrids(ctx, ranked, gridPlans, cellRuns);

  let { graph: result, fallback } = await ranked(root);
  let laid = root;
  // The depth-first cycle breaker (context.ts) walks from the sources, so a node whose only way
  // in is a reply (a client its server answers) can land after the server. Where the model has a
  // cycle the greedy breaker runs too, and it wins when the first edge it draws backwards comes
  // later in the spec: authors write the main path first and the loops back after it.
  if (model.edges.length <= ELK_BUDGET && loopedEdges(model).size) {
    const greedy = withCycleBreaking(structuredClone(root), "GREEDY");
    const alt = await runElk(greedy).catch(() => undefined);
    if (alt && laterFirst(backwards(ctx, alt.graph), backwards(ctx, result)) < 0) {
      ({ graph: result, fallback } = alt);
      laid = greedy;
    }
  }
  // Spec order holds wherever it costs no crossing: when the ordered layout crosses edges, the
  // nodes at the ends of those edges (never groups) may reorder, and fewer crossings win. Past
  // the budget a second run costs as much as the first, so the ordered layout stays (DG206).
  const strict =
    model.edges.length <= ELK_BUDGET ? crossings(result) : { count: 0, nodes: new Set<string>() };
  if (strict.count > 0) {
    const free = structuredClone(laid);
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

/** Sets the cycle breaker on the root and every group ELK lays out. */
function withCycleBreaking(n: ElkNode, strategy: string): ElkNode {
  if (n.layoutOptions && "elk.algorithm" in n.layoutOptions)
    n.layoutOptions["elk.layered.cycleBreaking.strategy"] = strategy;
  for (const c of n.children ?? []) withCycleBreaking(c, strategy);
  return n;
}

/**
 * The spec positions of the edges ELK drew backwards, in order: the target wholly behind its
 * source along the flow (two nodes in one layer overlap, so a sideways edge is not one).
 */
function backwards(ctx: Setup, graph: ElkNode): number[] {
  const at = new Map<string, ElkNode>();
  const walk = (n: ElkNode) => {
    at.set(n.id, n);
    for (const c of n.children ?? []) walk(c);
  };
  walk(graph);
  const d = ctx.model.direction;
  const span = (n: ElkNode): [number, number] => {
    const lo = (ctx.horizontal ? n.x : n.y) ?? 0;
    const hi = lo + ((ctx.horizontal ? n.width : n.height) ?? 0);
    return d === "right" || d === "down" ? [lo, hi] : [-hi, -lo];
  };
  return ctx.model.edges.flatMap((e, i) => {
    const a = at.get(e.from);
    const b = at.get(e.to);
    return a && b && e.constraint && e.from !== e.to && span(b)[1] < span(a)[0] ? [i] : [];
  });
}

/**
 * Below 0 when list a is the better set of backward edges: at the first place the two differ,
 * its edge comes later in the spec, or it has run out (fewer edges drawn backwards).
 */
function laterFirst(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const [x, y] = [a[i], b[i]];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    return y - x;
  }
  return 0;
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
