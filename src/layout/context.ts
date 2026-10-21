// What layout's phases share: the options, the hooks, and one context that grows phase by phase
// (Setup, then Graph, Laid, Placed and Routed), each phase reading the one before it.

import { THEME_TOKENS, type Theme } from "../themes.ts";
import type {
  Box,
  IgnoredSetting,
  Model,
  Point,
  Scene,
  SceneEdge,
  SceneGroup,
  SceneNode,
  TextBlock,
  ThemeName,
} from "../types.ts";
import { ELK_DIRECTION, ELK_ROUTING, type ElkEdge, type ElkNode } from "./elk.ts";
import type { HeaderRoom } from "./groups.ts";
import type { LayoutHooks, NodeGeom } from "./hooks.ts";
import { kindHooks } from "./kinds/index.ts";
import { laneHooks } from "./lanes/index.ts";
import type { GroupGeom } from "./measure.ts";
import { notationHooks } from "./notation.ts";
import { type Plan, planPlacement } from "./plan.ts";
import type { Relations } from "./relations.ts";
import type { Seat, SeatGrowth } from "./seats.ts";
import { ENDS } from "./sizes.ts";

export interface LayoutOptions {
  theme?: ThemeName;
  /** Groups whose corner label must end left of the top center (set by the second pass). */
  widen?: Set<string>;
  /** Extra top padding per group, so an overlay's header clears the headers above it (second pass). */
  room?: Map<string, number>;
  /** Edges routed after ELK in the second pass: edges of align blocks the first pass rerouted. */
  loose?: Set<string>;
  /**
   * Back edges of align blocks the first pass rerouted: the second pass gives them to ELK reversed,
   * so it routes them between the layers with room for their labels, and draws that route backwards.
   */
  flip?: Set<string>;
  /** The least size of a group whose border nodes did not fit along it (set by the second pass). */
  grow?: SeatGrowth;
  /** ELK layer wrapping (layout.aspect candidates): the strategy and the target width:height. */
  wrap?: "SINGLE_EDGE" | "MULTI_EDGE";
  ratio?: number;
}

/** The extension modules, in the order their hooks run: lanes and kinds place and route, then
 * notation moves edge ends from a box onto the outline drawn in it. */
export const HOOKS: LayoutHooks[] = [laneHooks, kindHooks, notationHooks];

/** The groups ELK never sees (pools and lanes). */
export const hiddenOf = (model: Model) =>
  new Set(HOOKS.flatMap((h) => [...(h.hiddenGroups?.(model) ?? [])]));

export const withIgnored = (scene: Scene, more: IgnoredSetting[]): Scene =>
  more.length ? { ...scene, ignored: [...(scene.ignored ?? []), ...more] } : scene;

/** Fixed for one run of the core: the model, the options and what follows from them. */
export interface Setup {
  model: Model;
  opts: LayoutOptions;
  theme: ThemeName;
  tokens: Theme;
  horizontal: boolean;
  /** layout.spacing: the factor on ELK's gaps. */
  spacing: number;
  /** ELK options on the root and on every group. */
  base: Record<string, string>;
  /** Groups ELK never sees (pools and lanes): their members join the nearest group it lays out. */
  hidden: Set<string>;
  /** A hook's cross-axis order (lanes); spec order breaks ties. */
  order: Map<string, number>;
  /** rank, align and cols: what holds, and what the scene reports as ignored. */
  plan: Plan;
}

/** An ELK-routed edge's label and step badge, measured. */
export interface EdgeLabel {
  block: TextBlock;
  w: number;
  h: number;
  stepW: number;
}

/** The ELK graph: what each item measures, its ELK node, and how edges relate to the graph. */
export interface Graph extends Setup {
  nodeGeom: Map<string, NodeGeom>;
  groupGeom: Map<string, GroupGeom>;
  elkNodes: Map<string, ElkNode>;
  root: ElkNode;
  /** The children of each grid (cols), waiting for their cells. */
  cells: Map<string, string[]>;
  titleBlock?: TextBlock;
  subtitleBlock?: TextBlock;
  rel: Relations;
  edgeLabels: Map<string, EdgeLabel>;
  /** Edges inside one child group of a grid, by that group: its own ELK run routes them. */
  cellEdges: Map<string, ElkEdge[]>;
}

/** After ELK: the laid-out graph, grid cells filled in and align blocks gone. */
export interface Laid extends Graph {
  result: ElkNode;
  fallback?: string;
}

/** After reading ELK back: scene groups and nodes, overlays drawn around their members. */
export interface Placed extends Laid {
  /** Pixels above the drawing taken by the title. */
  top: number;
  /** An ELK point in scene coordinates. */
  shift: (p: Point) => Point;
  placed: Map<string, ElkNode>;
  /** Where each header may slide to clear edges (clearHeader), and whether its icon goes along. */
  headerRoom: Map<string, HeaderRoom>;
  groups: SceneGroup[];
  nodes: SceneNode[];
  /** Nodes moved onto a group's border (on:), with the side each sits on. */
  seats: Map<string, Seat>;
  /** Groups too short for their border nodes, with the size the second pass gives them. */
  seatGrow: SeatGrowth;
}

/** After routing: every scene edge, and the ones routed after ELK. */
export interface Routed extends Placed {
  edges: SceneEdge[];
  freeRoutes: Map<string, Point[]>;
  /** Align-block edges whose ELK route gave way to a shorter one drawn after ELK. */
  rerouted: Set<string>;
  /** Group headers with a margin, which free edges and their labels keep off. */
  headers: { id: string; box: Box }[];
  /**
   * The routes as ELK and the free router drew them, before straighten: the second pass widens
   * the groups whose headers these cross too, so it lays out as it would without the tidying.
   */
  drawn: SceneEdge[];
}

/** Theme, flow, ELK's base options, the hidden groups, the hooks' order and the placement plan. */
export function prepare(model: Model, opts: LayoutOptions, theme: ThemeName): Setup {
  const tokens = THEME_TOKENS[theme];
  const horizontal = model.direction === "right" || model.direction === "left";
  const s = model.spacing;
  const base: Record<string, string> = {
    "elk.algorithm": "layered",
    "elk.direction": ELK_DIRECTION[model.direction],
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.edgeRouting": ELK_ROUTING[model.routing],
    "elk.layered.layering.strategy":
      model.layering === "simplex" ? "NETWORK_SIMPLEX" : "LONGEST_PATH_SOURCE",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    // Orders each layer by the elk.position hints below, so siblings keep spec order (AZ A left
    // of AZ B). considerModelOrder would do the same but crashes elkjs 0.12 on nested graphs.
    "elk.layered.crossingMinimization.semiInteractive": "true",
    "elk.spacing.nodeNode": String(Math.round(40 * s)),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(Math.round(64 * s)),
    "elk.spacing.edgeNode": String(Math.round(18 * s)),
    "elk.spacing.edgeEdge": String(Math.round(10 * s)),
    "elk.layered.spacing.edgeNodeBetweenLayers": String(Math.round(20 * s)),
    "elk.layered.spacing.edgeEdgeBetweenLayers": String(Math.round(10 * s)),
    "elk.spacing.edgeLabel": "4",
    // The pitch of the ends on one side of an icon node (portAlignment CENTER, graph.ts). ELK
    // reads it from the graph, not the node.
    "elk.spacing.portPort": String(ENDS.pitch),
    "elk.spacing.labelNode": "6",
    "elk.edgeLabels.placement": "CENTER",
    // One side for every label (and its step badge); ELK's default picks per edge.
    "elk.layered.edgeLabels.sideSelection": "ALWAYS_UP",
    "elk.json.shapeCoords": "ROOT",
    "elk.json.edgeCoords": "ROOT",
    "elk.layered.mergeEdges": model.merge ? "true" : "false",
    "elk.layered.unnecessaryBendpoints": "true",
    "elk.layered.thoroughness": "12",
    ...Object.assign({}, ...HOOKS.map((h) => h.elkOptions?.(model) ?? {})),
    ...(opts.wrap
      ? {
          "elk.layered.wrapping.strategy": opts.wrap,
          "elk.aspectRatio": String(opts.ratio ?? 1),
        }
      : {}),
  };
  // Groups ELK never sees (pools and lanes): their members join the nearest group it lays out.
  const hidden = hiddenOf(model);
  const order = new Map(HOOKS.flatMap((h) => [...(h.order?.(model) ?? [])]));
  // rank, align and cols: what holds, and what the scene reports as ignored.
  const plan = planPlacement(model, hidden);
  return { model, opts, theme, tokens, horizontal, spacing: s, base, hidden, order, plan };
}
