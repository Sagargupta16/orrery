// Extension points layout() calls, so each diagram kind lives in its own module: lanes.ts (pools
// and swimlanes), kinds.ts (trees, mind maps, state machines), notation.ts (BPMN and flowchart
// symbols), journey.ts (journey grids). Layout stays one pipeline; a hook only adds to it.

import type {
  Model,
  ModelNode,
  Point,
  Routing,
  SceneEdge,
  SceneGroup,
  SceneNode,
  TextBlock,
  ThemeName,
} from "../types.ts";

/** A node's size as ELK lays it out, and its measured text. */
export interface NodeGeom {
  w: number;
  h: number;
  label: TextBlock;
  note?: TextBlock;
  /** A label outside the node, below it (icon look in a horizontal flow, BPMN events). */
  outside?: { w: number; h: number };
}

/** The scene so far, once nodes, groups and edges exist and before the canvas is sized. */
export interface AfterLayout {
  model: Model;
  theme: ThemeName;
  horizontal: boolean;
  /** Pixels above the drawing taken by the title; scene coordinates already include it. */
  top: number;
  nodes: SceneNode[];
  groups: SceneGroup[];
  edges: SceneEdge[];
  /** The scene's routing; a hook that redraws edges as curves sets it to spline. */
  routing: Routing;
}

export interface LayoutHooks {
  /** Groups ELK never sees (pools, lanes): their members join the nearest group ELK lays out. */
  hiddenGroups?(model: Model): Set<string>;
  /** Cross-axis order per node or group id, lowest first; ties keep spec order. */
  order?(model: Model): Map<string, number> | undefined;
  /** ELK options added to the root and to every group. */
  elkOptions?(model: Model): Record<string, string>;
  /** May move anything in the scene, add groups and reroute edges. */
  after?(ctx: AfterLayout): void;
}

/** Where a node's text goes once ELK placed it (see notation.ts). */
export interface PlaceContext {
  horizontal: boolean;
  /** Top-left of the outside label ELK placed, in scene coordinates, when there is one. */
  label?: Point;
}

export type PlaceNotation = (
  node: SceneNode,
  model: ModelNode,
  geom: NodeGeom,
  ctx: PlaceContext,
) => void;
