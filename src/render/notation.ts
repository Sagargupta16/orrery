// Drawing for notation: BPMN 2.0 elements, flowchart and state shapes, and the markers at the
// start of message, default and conditional flows. Every function returns SVG elements without
// a fill or stroke of their own unless a marker needs one, so the caller's <g> paints them.

import type { Box, SceneEdge, SceneNode, ShapeKind } from "../types.ts";

/** Outline of a flowchart or state shape, or undefined for the shapes svg.ts draws itself. */
export function shapeOutline(_shape: ShapeKind, _b: Box): string | undefined {
  return undefined;
}

/** Outline of a BPMN element (nd.bpmn), or undefined to draw nd.shape. */
export function notationShape(_nd: SceneNode): string | undefined {
  return undefined;
}

/** Markers inside the outline: a gateway's X, a task's type, an event's trigger. */
export function notationMarks(_nd: SceneNode, _color: string, _width: number): string {
  return "";
}

/** Markers at an edge's start for its flow kind; `ground` is the color behind the line. */
export function flowMarks(_e: SceneEdge, _color: string, _width: number, _ground: string): string {
  return "";
}
