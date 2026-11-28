// The edges ELK sees: ports when merge is on, label boxes for the labels too tall (or wide) to sit
// beside their line in a layer gap (and empty spacers so a fan-out stays in one column), cell
// edges for a grid child's own run, and hidden copies for edges drawn after ELK (through its group
// for a node on a border).

import { textBlock } from "../text.ts";
import type { ModelEdge } from "../types.ts";
import type { EdgeLabel, Graph } from "./context.ts";
import type { ElkEdge } from "./elk.ts";
import { seatFlow } from "./seats.ts";
import { fitsBeside, SIZES } from "./sizes.ts";

type Added = "edgeLabels" | "cellEdges" | "beside" | "unplaced";

export function addEdges(ctx: Omit<Graph, Added>): Pick<Graph, Added> {
  const { model, opts, plan, elkNodes, root, rel } = ctx;
  const { free, inBlock, members, rep, cellOf, lowest } = rel;
  const port = (nodeId: string, side: "in" | "out", e: ModelEdge): string => {
    if (!model.merge || rel.groupIds.has(nodeId)) return nodeId;
    const el = elkNodes.get(nodeId);
    if (!el) return nodeId;
    const head =
      side === "in"
        ? e.arrow === "end" || e.arrow === "both"
        : e.arrow === "start" || e.arrow === "both";
    // Flows of different kinds (a gateway's default and conditional branches) keep their own
    // trunks, so their start markers do not overlap. An edge to an align block keeps its own
    // port: blocks close cycles, and a back edge sharing a trunk drags the forward edges with it.
    const own = plan.blockOf.has(e.from) || plan.blockOf.has(e.to) ? `::${e.id}` : "";
    const id = `${nodeId}::${side}::${e.line}::${head ? 1 : 0}::${e.color ?? ""}${e.flow ? `::${e.flow}` : ""}${own}`;
    el.ports ??= [];
    if (!el.ports.some((p) => p.id === id)) el.ports.push({ id, width: 0, height: 0 });
    el.layoutOptions = { ...el.layoutOptions, "elk.portConstraints": "FREE" };
    return id;
  };
  /** Where ELK's copy of the edge starts: its target when the edge is flipped. */
  const source = (e: ModelEdge) => (opts.flip?.has(e.id) ? e.to : e.from);
  const cellAt = (e: ModelEdge) => (plan.grids.size ? cellOf(lowest(e.from, e.to)) : undefined);
  const tags = new Map(
    model.edges.flatMap((e) =>
      !free(e) && (e.label || e.step !== undefined) ? [[e.id, measureTag(e)] as const] : [],
    ),
  );
  // A label that fits in a normal layer gap beside its line gets no ELK label (and so no layer
  // of its own): it is placed beside the final route. Flows ELK lays out as layers only, with
  // orthogonal lines and no hook of their own on the edges; not grid cells, self loops (state
  // redraws them), back edges given reversed, or what the first pass found no spot for.
  const besideKind =
    !opts.labelLayers &&
    (model.kind === "architecture" || model.kind === "flowchart" || model.kind === "state") &&
    model.routing === "orthogonal" &&
    !ctx.hidden.size;
  const beside = new Set(
    besideKind
      ? model.edges
          .filter((e) => {
            const tag = tags.get(e.id);
            return (
              !!tag &&
              e.from !== e.to &&
              !cellAt(e) &&
              !opts.flip?.has(e.id) &&
              !opts.layered?.has(e.id) &&
              fitsBeside(ctx.horizontal ? tag.w : tag.h, ctx.spacing)
            );
          })
          .map((e) => e.id)
      : [],
  );
  // A labelled edge ELK lays out gets its own layer for the label; give its unlabelled siblings
  // an empty label of the same kind so a fan-out stays in one column.
  const labelledFrom = new Set(
    model.edges.filter((e) => tags.has(e.id) && !beside.has(e.id)).map(source),
  );
  const edgeLabels = new Map<string, EdgeLabel>();
  const cellEdges = new Map<string, ElkEdge[]>();
  const through = seatLinks(ctx);
  for (const e of model.edges) {
    if (free(e)) {
      // A loose back edge gets no copy: ELK would route the copy around the block again.
      if (!e.constraint || inBlock(e) || opts.loose?.has(e.id)) continue;
      // Grid cells are not in the main graph: the hidden copies run to the grid that holds them.
      const ends = (id: string) => [...new Set(members(id).map(rep))];
      const [from, to] = through(e);
      let i = 0;
      for (const s of ends(from))
        for (const t of ends(to))
          if (s !== t) root.edges?.push({ id: `${e.id}__via${i++}`, sources: [s], targets: [t] });
      continue;
    }
    const flip = !!opts.flip?.has(e.id);
    const elkEdge: ElkEdge = {
      id: e.id,
      sources: [port(flip ? e.to : e.from, "out", e)],
      targets: [port(flip ? e.from : e.to, "in", e)],
    };
    const tag = tags.get(e.id);
    if ((!tag || beside.has(e.id)) && labelledFrom.has(source(e))) {
      elkEdge.labels = [{ id: `${e.id}__spacer`, text: " ", width: 1, height: 1 }];
    }
    if (tag && !beside.has(e.id)) {
      edgeLabels.set(e.id, tag);
      elkEdge.labels = [
        {
          id: `${e.id}__label`,
          text: e.label || `step ${e.step}`,
          width: tag.w,
          height: tag.h,
        },
      ];
    }
    const cell = cellAt(e);
    if (cell) cellEdges.set(cell, [...(cellEdges.get(cell) ?? []), elkEdge]);
    else root.edges?.push(elkEdge);
  }
  return { edgeLabels, cellEdges, beside, unplaced: new Set() };
}

/** An edge's label and step badge as one box: the badge at its left, 2px before the text. */
function measureTag(e: ModelEdge): EdgeLabel {
  const block = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
  const stepW = e.step !== undefined ? SIZES.step + 2 : 0;
  const w = Math.ceil((e.label ? block.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0));
  const h = Math.ceil(Math.max(e.label ? block.height + 6 : 0, stepW ? SIZES.step : 0));
  return { block, w, h, stepW };
}

/**
 * A node on a border sits before or after its group along the flow (seatFlow). Its hidden copies
 * to the far side, past the group, start (or end) at the group instead, and a node with no link
 * into the group gets one, so ELK keeps the group between the node's ends, as when it was inside.
 * Returns each edge's ends as ELK's copy should run.
 */
function seatLinks(ctx: Omit<Graph, Added>): (e: ModelEdge) => [string, string] {
  const { model, plan, root, rel } = ctx;
  if (!plan.seats.size) return (e) => [e.from, e.to];
  const flow = new Map(
    [...plan.seats].map(([id, gid]) => [id, seatFlow(model, rel, id, gid)] as const),
  );
  const inside = (id: string, gid: string) => id === gid || rel.above(id).includes(gid);
  for (const [id, gid] of plan.seats) {
    const before = flow.get(id) === "before";
    const linked = model.edges.some(
      (e) =>
        e.constraint &&
        (before ? e.from === id && inside(e.to, gid) : e.to === id && inside(e.from, gid)),
    );
    if (!linked)
      root.edges?.push({
        id: `${id}__seat`,
        sources: [before ? id : gid],
        targets: [before ? gid : id],
      });
  }
  return (e) => {
    const a = plan.seats.get(e.from);
    const b = plan.seats.get(e.to);
    const from = a && flow.get(e.from) === "before" && !inside(e.to, a) ? a : e.from;
    const to = b && flow.get(e.to) === "after" && !inside(e.from, b) ? b : e.to;
    return [from, to];
  };
}
