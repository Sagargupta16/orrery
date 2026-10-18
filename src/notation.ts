// Geometry for nodes drawn in notation: BPMN 2.0 elements (bpmn:) and the flowchart and state
// shapes (parallelogram, subroutine, trapezoid, delay, initial, final).

import type { NodeGeom, PlaceContext } from "./hooks.ts";
import type { ModelNode, SceneNode } from "./types.ts";

/** The size ELK lays out for a notation node, or undefined for the default shape geometry. */
export function notationGeometry(_n: ModelNode, _horizontal: boolean): NodeGeom | undefined {
  return undefined;
}

/** Moves a notation node's label, note and icon once ELK placed the node. */
export function placeNotation(
  _node: SceneNode,
  _n: ModelNode,
  _g: NodeGeom,
  _ctx: PlaceContext,
): void {}
