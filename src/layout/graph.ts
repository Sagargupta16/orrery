// The ELK graph: one node per model node (outside label and badge room included), one compound per
// group ELK sees and per align block, children in spec order with cross-axis order hints, then the
// edges (graph-edges.ts).

import { textBlock } from "../text.ts";
import type { Box, ModelNode } from "../types.ts";
import type { Graph, Setup } from "./context.ts";
import { type ElkNode, LAYER_CONSTRAINT } from "./elk.ts";
import { addEdges } from "./graph-edges.ts";
import type { NodeGeom } from "./hooks.ts";
import { badgePill, type GroupGeom, groupGeometry, minWidthOf, nodeGeometry } from "./measure.ts";
import { relations } from "./relations.ts";
import { seatPadding, seatRoom, seatSlot } from "./seats.ts";
import { SIZES } from "./sizes.ts";

export function buildGraph(ctx: Setup): Graph {
  const { model, opts, hidden, plan, horizontal } = ctx;
  const nodeGeom = new Map<string, NodeGeom>();
  const groupGeom = new Map<string, GroupGeom>();
  const elkNodes = new Map<string, ElkNode>();

  for (const n of model.nodes) {
    const g = nodeGeometry(n, horizontal);
    nodeGeom.set(n.id, g);
    elkNodes.set(n.id, nodeElk(ctx, n, g));
  }
  for (const grp of model.groups) groupGeom.set(grp.id, groupGeometry(grp));
  groupElks(ctx, groupGeom, elkNodes);
  blockElks(ctx, elkNodes);

  const titleBlock = model.title ? textBlock(model.title, SIZES.title, 1400, 600, 1.25) : undefined;
  const subtitleBlock = model.subtitle
    ? textBlock(model.subtitle, SIZES.subtitle, 1400, 400)
    : undefined;

  const root: ElkNode = {
    id: "__root",
    layoutOptions: {
      ...ctx.base,
      "elk.padding": `[top=${SIZES.pad},left=${SIZES.pad},bottom=${SIZES.pad},right=${SIZES.pad}]`,
    },
    children: [],
    edges: [],
  };
  const cells = placeChildren(ctx, elkNodes, root);
  orderHints(ctx, root, elkNodes);
  alignRows(ctx, root, elkNodes);
  // Empty groups still need a size.
  for (const grp of model.groups) {
    const el = elkNodes.get(grp.id);
    const gg = groupGeom.get(grp.id);
    if (el && gg && !el.children?.length) {
      el.width = gg.minWidth;
      el.height = gg.header + 60;
      // One with only border nodes is as long as its header and those nodes side by side.
      const seated = model.nodes.filter((n) => plan.seats.get(n.id) === grp.id);
      if (seated.length) {
        el.width += seated.reduce((w, n) => {
          const g = nodeGeom.get(n.id);
          return w + (g ? seatRoom(n, g) : 0);
        }, 0);
        const grow = opts.grow?.get(grp.id);
        el.width = Math.max(el.width, grow?.w ?? 0);
        el.height = Math.max(el.height, grow?.h ?? 0);
      }
      // ELK takes an empty compound's minimum as written, not turned with a vertical flow.
      el.layoutOptions = {
        ...el.layoutOptions,
        "elk.nodeSize.minimum": `(${el.width}, ${el.height})`,
      };
    }
  }

  const rel = relations(model, plan, hidden, opts);
  const graph = {
    ...ctx,
    nodeGeom,
    groupGeom,
    elkNodes,
    root,
    cells,
    titleBlock,
    subtitleBlock,
    rel,
  };
  return { ...graph, ...addEdges(graph) };
}

/** A node's ELK box, with its outside label and the room its badge pill needs. */
function nodeElk(ctx: Setup, n: ModelNode, g: NodeGeom): ElkNode {
  const { plan, horizontal, spacing } = ctx;
  const end = plan.blockOf.has(n.id) ? undefined : plan.ends.get(n.id);
  // Centered in its layer, so a column of different sizes shares one center line (alignRows
  // puts a row of icons on the icon line instead).
  const node: ElkNode = {
    id: n.id,
    width: g.w,
    height: plan.seats.has(n.id) ? seatSlot(n, g, horizontal, spacing) : g.h,
    layoutOptions: {
      "elk.alignment": "CENTER",
      ...(end ? { [LAYER_CONSTRAINT]: end } : {}),
      // In a vertical flow the box is as wide as the text under the icon: the ends on its top and
      // bottom sit around the center at the root's port pitch, inside the icon's span, not spread
      // across the text's width.
      ...(n.look === "icon" && !horizontal ? { "elk.portAlignment.default": "CENTER" } : {}),
    },
  };
  if (g.outside) {
    node.labels = [
      {
        id: `${n.id}__label`,
        text: n.label,
        width: g.outside.w,
        height: g.outside.h,
      },
    ];
    node.layoutOptions = {
      ...node.layoutOptions,
      "elk.nodeLabels.placement": "OUTSIDE V_BOTTOM H_CENTER",
      "elk.spacing.labelNode": "6",
    };
  }
  if (n.badge) {
    // ELK layered ignores elk.margins, so a label beside the top-right corner reserves the
    // pill's overhang: it can then run neither into a neighbor nor out of the group.
    const S = n.iconSize;
    const anchor: Box =
      n.look === "icon"
        ? { x: horizontal ? 0 : (g.w - S) / 2, y: 0, w: S, h: S }
        : { x: 0, y: 0, w: g.w, h: g.h };
    const pill = badgePill(n.badge, anchor);
    const overhang = Math.ceil(pill.x + pill.w - g.w);
    if (overhang > 0)
      node.labels = [
        ...(node.labels ?? []),
        {
          id: `${n.id}__badge`,
          text: n.badge,
          width: overhang,
          height: 16,
          layoutOptions: {
            "elk.nodeLabels.placement": "OUTSIDE V_TOP H_RIGHT H_PRIORITY",
          },
        },
      ];
  }
  return node;
}

/** One compound per group ELK lays out (not overlays, pools or lanes). */
function groupElks(
  ctx: Setup,
  groupGeom: Map<string, GroupGeom>,
  elkNodes: Map<string, ElkNode>,
): void {
  const { model, opts, hidden, horizontal } = ctx;
  // Siblings share the tallest header, so frames side by side (an AWS tile header next to an
  // inline one) start their content, and their top edge, on one line.
  for (const grp of model.groups) {
    const gg = groupGeom.get(grp.id);
    if (!gg || grp.around || hidden.has(grp.id)) continue;
    const siblings = model.groups.filter(
      (o) => !o.around && !hidden.has(o.id) && o.parent === grp.parent,
    );
    gg.header = Math.max(...siblings.map((o) => groupGeom.get(o.id)?.header ?? 0));
  }
  for (const grp of model.groups) {
    const gg = groupGeom.get(grp.id);
    if (!gg || grp.around || hidden.has(grp.id)) continue;
    const top = gg.header + 18 + (opts.room?.get(grp.id) ?? 0);
    // Border nodes reach into the group: its children keep clear of them. A group too short for
    // them (second pass) is at least as long as they need.
    const pad = seatPadding(model, ctx.plan, grp.id, horizontal) ?? 20;
    const grow = opts.grow?.get(grp.id);
    elkNodes.set(grp.id, {
      id: grp.id,
      children: [],
      layoutOptions: {
        ...ctx.base,
        "elk.padding": `[top=${top},left=${pad},bottom=${pad},right=${pad}]`,
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        // ELK applies a compound minimum in its rotated frame when the flow is vertical.
        "elk.nodeSize.minimum": horizontal
          ? `(${Math.max(gg.minWidth, grow?.w ?? 0)}, ${Math.max(top + 24, grow?.h ?? 0)})`
          : `(${Math.max(top + 24, grow?.h ?? 0)}, ${Math.max(minWidthOf(ctx, grp.id, gg), grow?.w ?? 0)})`,
        // Centered in a column; frames side by side in a row share their top edge.
        "elk.alignment": horizontal ? "CENTER" : "TOP",
        // A group widened by its label keeps its children centered under the header.
        "elk.contentAlignment": horizontal ? "V_TOP H_CENTER" : "V_CENTER H_CENTER",
      },
    });
  }
}

// align: the nodes that share a layer sit in an invisible compound with no edges inside, so ELK
// puts them all in its one layer, stacked across the flow in spec order. Edges between them are
// drawn after layout, and the compound is gone from the scene.
function blockElks(ctx: Setup, elkNodes: Map<string, ElkNode>): void {
  const { model, plan, horizontal, spacing } = ctx;
  for (const id of plan.blocks.keys()) {
    const end = plan.ends.get(id);
    // An edge between two members is drawn between them. In a vertical flow it is a short level
    // run with its label above it: the members sit far enough apart for the label and an arrow.
    const room = Math.max(
      Math.round(40 * spacing),
      ...model.edges
        .filter((e) => plan.blockOf.get(e.from) === id && plan.blockOf.get(e.to) === id)
        .map((e) => {
          if (horizontal) return 0;
          const step = e.step !== undefined ? SIZES.step + 2 : 0;
          const text = e.label
            ? textBlock(e.label, SIZES.edgeLabel, SIZES.edgeLabelMax)
            : undefined;
          return Math.ceil((text ? text.width + 12 : 0) + step + 32);
        }),
    );
    elkNodes.set(id, {
      id,
      children: [],
      layoutOptions: {
        ...ctx.base,
        "elk.padding": "[top=0,left=0,bottom=0,right=0]",
        "elk.alignment": "CENTER",
        "elk.spacing.nodeNode": String(room),
        ...(end ? { [LAYER_CONSTRAINT]: end } : {}),
      },
    });
  }
}

/** Puts every ELK node under its parent; returns each grid's children, which wait for cells. */
function placeChildren(
  ctx: Setup,
  elkNodes: Map<string, ElkNode>,
  root: ElkNode,
): Map<string, string[]> {
  const { model, hidden, plan } = ctx;
  /** The ELK node an item goes into: its parent, skipping groups ELK does not see. */
  const host = (parent: string | undefined): ElkNode | undefined => {
    let p = parent;
    while (p && hidden.has(p)) p = model.groups.find((g) => g.id === p)?.parent;
    return p ? elkNodes.get(p) : root;
  };
  // Children keep spec order: groups first, then nodes, each under its parent. A grid's children
  // wait for their cells; an aligned node goes into its block, which takes its first member's place.
  const cells = new Map<string, string[]>();
  for (const item of [...model.groups, ...model.nodes]) {
    const el = elkNodes.get(item.id);
    if (!el) continue;
    if (item.parent && plan.grids.has(item.parent)) {
      cells.set(item.parent, [...(cells.get(item.parent) ?? []), item.id]);
      continue;
    }
    const block = elkNodes.get(plan.blockOf.get(item.id) ?? "");
    const parent = host(item.parent);
    if (block && !block.children?.length) {
      const into = parent ?? root;
      into.children?.push(block);
      // A block sums its members' links, which misleads ELK's greedy cycle breaker into turning
      // the main flow around; a depth-first walk in spec order keeps the back edges the author
      // wrote as back edges (the model-order breakers crash elkjs 0.12 inside groups).
      into.layoutOptions = {
        ...into.layoutOptions,
        "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
      };
    }
    (block?.children ?? parent?.children ?? root.children)?.push(el);
  }
  return cells;
}

// In a vertical flow an icon node's box is the icon with its text under it, so centered in its
// layer a node with a longer note sits higher, its icon off the row's line, and the edges between
// the row's icons jog. Where a graph holds only nodes, its icon nodes align to the top of their
// layer instead, which puts every icon of a row on one line. A group shares its layer with nodes
// beside it centered, so a graph with groups keeps them centered.
function alignRows(ctx: Setup, root: ElkNode, elkNodes: Map<string, ElkNode>): void {
  const { model, plan, horizontal } = ctx;
  if (horizontal) return;
  const icons = new Set(
    model.nodes.filter((n) => n.look === "icon" && !plan.seats.has(n.id)).map((n) => n.id),
  );
  for (const parent of [root, ...elkNodes.values()]) {
    const kids = parent.children ?? [];
    if (!kids.length || kids.some((c) => c.children)) continue;
    for (const c of kids)
      if (icons.has(c.id)) c.layoutOptions = { ...c.layoutOptions, "elk.alignment": "TOP" };
  }
}

// Spec-order hints along the cross axis for semi-interactive crossing minimization; a hook's
// order (lanes) goes first, spec order breaks ties.
function orderHints(ctx: Setup, root: ElkNode, elkNodes: Map<string, ElkNode>): void {
  const { order, horizontal } = ctx;
  for (const parent of [root, ...elkNodes.values()]) {
    const kids = parent.children ?? [];
    const rank = order.size
      ? new Map(
          kids
            .map((c, i) => [c, i] as const)
            .sort(([a, i], [b, j]) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || i - j)
            .map(([c], r) => [c, r] as const),
        )
      : undefined;
    kids.forEach((c, i) => {
      const at = rank?.get(c) ?? i;
      c.layoutOptions = {
        ...c.layoutOptions,
        "elk.position": horizontal ? `(0,${at * 10})` : `(${at * 10},0)`,
      };
    });
  }
}
