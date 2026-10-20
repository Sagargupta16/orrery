// cols: a grid is one box of fixed size to ELK. Before ELK each child is measured (a child group
// gets an ELK run of its own) and the cells are planned; after ELK the cells are filled in.

import { textBlock } from "../text.ts";
import type { Point } from "../types.ts";
import type { Graph } from "./context.ts";
import { type ElkNode, findNode, moveElk } from "./elk.ts";
import { round } from "./geometry.ts";
import { minWidthOf } from "./measure.ts";
import { type GridCell, gridCells } from "./plan.ts";
import { SIZES } from "./sizes.ts";

/** A grid's cells, where each footprint goes, the content width and its top padding. */
export interface GridPlan {
  cells: GridCell[];
  at: Point[];
  w: number;
  top: number;
}

export type RankedRun = (graph: ElkNode) => Promise<{ graph: ElkNode; fallback?: string }>;

// Grids, innermost first: each child group is laid out on its own, then the grid becomes one
// box of fixed size whose cells are filled in after ELK.
export async function boxGrids(
  ctx: Graph,
  ranked: RankedRun,
  gridPlans: Map<string, GridPlan>,
  cellRuns: Map<string, ElkNode>,
): Promise<void> {
  const { opts, plan, horizontal, elkNodes, groupGeom, rel } = ctx;
  for (const gid of [...plan.grids.keys()].sort(
    (a, b) => rel.above(b).length - rel.above(a).length,
  )) {
    const el = elkNodes.get(gid);
    const gg = groupGeom.get(gid);
    if (!el || !gg) continue;
    const list = await cellList(ctx, gid, ranked, cellRuns);
    if (!list.length) continue;
    const grid = gridCells(list, plan.grids.get(gid) ?? 1, cellGap(ctx, list));
    const top = gg.header + 18 + (opts.room?.get(gid) ?? 0);
    const position = el.layoutOptions?.["elk.position"];
    Object.assign(el, {
      width: Math.max(minWidthOf(ctx, gid, gg), grid.w + 40),
      height: Math.max(gg.header + 60, top + grid.h + 20),
      children: [],
      layoutOptions: {
        "elk.alignment": horizontal ? "CENTER" : "TOP",
        ...(position ? { "elk.position": position } : {}),
      },
    });
    gridPlans.set(gid, { cells: list, at: grid.at, w: grid.w, top });
  }
}

/** Each child of a grid as a cell: a node with its outside label, or a group laid out alone. */
async function cellList(
  ctx: Graph,
  gid: string,
  ranked: RankedRun,
  cellRuns: Map<string, ElkNode>,
): Promise<GridCell[]> {
  const { plan, base, elkNodes, nodeGeom, cells, cellEdges } = ctx;
  const list: GridCell[] = [];
  for (const id of cells.get(gid) ?? []) {
    const g = nodeGeom.get(id);
    if (g) {
      const w = Math.max(g.w, g.outside?.w ?? 0);
      const h = g.h + (g.outside ? 6 + g.outside.h : 0);
      list.push({ id, w, h, box: { x: (w - g.w) / 2, y: 0, w: g.w, h: g.h } });
      continue;
    }
    const child = elkNodes.get(id);
    if (!child) continue;
    if (!plan.grids.has(id) && child.children?.length) {
      const run: ElkNode = {
        id: `__cell:${id}`,
        layoutOptions: { ...base, "elk.padding": "[top=0,left=0,bottom=0,right=0]" },
        children: [child],
        edges: cellEdges.get(id) ?? [],
      };
      const { graph } = await ranked(run);
      const laid = graph.children?.[0];
      if (laid) {
        cellRuns.set(id, graph);
        child.width = laid.width;
        child.height = laid.height;
      }
    }
    const w = child.width ?? 0;
    const h = child.height ?? 0;
    list.push({ id, w, h, box: { x: 0, y: 0, w, h } });
  }
  return list;
}

/**
 * Edges between cells are drawn in the gaps, a level run with its label above it or a vertical
 * one with the label beside it: the gaps fit the widest of those labels.
 */
function cellGap(ctx: Graph, list: GridCell[]): number {
  const { model, horizontal, spacing: s, rel } = ctx;
  const inner = new Set(list.map((c) => c.id));
  const cellOfGrid = (id: string) => [id, ...rel.above(id)].find((x) => inner.has(x));
  const labels = model.edges
    .filter((e) => {
      const [f, t] = [cellOfGrid(e.from), cellOfGrid(e.to)];
      return f && t && f !== t && (e.label || e.step !== undefined);
    })
    .map((e) => {
      const text = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
      const step = e.step !== undefined ? SIZES.step + 2 : 0;
      return { w: (e.label ? text.width + 12 : 0) + step, h: Math.max(text.height + 6, step) };
    });
  return Math.round(Math.max(40 * s, ...labels.map((l) => (horizontal ? l.h : l.w) + 32)));
}

/** Fills each grid's cells, outermost first (an inner grid is placed with its cell). */
export function fillGrids(
  ctx: Graph,
  result: ElkNode,
  gridPlans: Map<string, GridPlan>,
  cellRuns: Map<string, ElkNode>,
): void {
  const { nodeGeom, rel } = ctx;
  for (const gid of [...gridPlans.keys()].sort(
    (a, b) => rel.above(a).length - rel.above(b).length,
  )) {
    const el = findNode(result, gid);
    const gp = gridPlans.get(gid);
    if (!el || !gp) continue;
    const ox = (el.x ?? 0) + ((el.width ?? 0) - gp.w) / 2;
    const oy = (el.y ?? 0) + gp.top;
    el.children = gp.cells.map((c, i): ElkNode => {
      const at = gp.at[i] ?? { x: 0, y: 0 };
      const x = round(ox + at.x + c.box.x);
      const y = round(oy + at.y + c.box.y);
      const g = nodeGeom.get(c.id);
      if (g?.outside)
        return {
          id: c.id,
          x,
          y,
          width: c.box.w,
          height: c.box.h,
          labels: [
            {
              id: `${c.id}__label`,
              text: " ",
              x: round(x + (c.box.w - g.outside.w) / 2),
              y: y + c.box.h + 6,
              width: g.outside.w,
              height: g.outside.h,
            },
          ],
        };
      const run = cellRuns.get(c.id);
      const laid = run?.children?.[0];
      if (!run || !laid) return { id: c.id, x, y, width: c.box.w, height: c.box.h };
      laid.edges = run.edges ?? [];
      return moveElk(laid, x - (laid.x ?? 0), y - (laid.y ?? 0));
    });
  }
}
