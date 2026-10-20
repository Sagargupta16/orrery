// The keys a spec may use at each level, their synonyms, and the per-kind defaults.
import type { DiagramKind, Direction, ShapeKind } from "../types.ts";

export const TOP_KEYS = [
  "$schema",
  "version",
  "title",
  "subtitle",
  "direction",
  "theme",
  "look",
  "arrowhead",
  "layout",
  "animate",
  "skin",
  "background",
  "legend",
  "kind",
  "icons",
  "stages",
  "story",
  "tags",
  "views",
  "classes",
  "include",
  "nodes",
  "groups",
  "edges",
];
export const NODE_KEYS = [
  "id",
  "icon",
  "label",
  "note",
  "in",
  "look",
  "shape",
  "color",
  "badge",
  "url",
  "size",
  "bpmn",
  "stage",
  "score",
  "rank",
  "align",
  "on",
  "tags",
  "evidence",
  "class",
];
export const NODE_SYNONYMS: Record<string, string> = {
  sublabel: "note",
  description: "note",
  parent: "in",
  group: "in",
  link: "url",
  href: "url",
  style: "look",
  layer: "rank",
};
export const GROUP_KEYS = [
  "id",
  "type",
  "label",
  "in",
  "color",
  "fill",
  "icon",
  "dashed",
  "contains",
  "around",
  "cols",
  "tags",
  "evidence",
  "class",
];
export const GROUP_SYNONYMS: Record<string, string> = {
  style: "type",
  kind: "type",
  parent: "in",
  children: "contains",
  nodes: "contains",
  columns: "cols",
};
export const EDGE_KEYS = [
  "from",
  "to",
  "label",
  "line",
  "arrow",
  "color",
  "step",
  "constraint",
  "flow",
  "tags",
  "evidence",
  "class",
];
export const EDGE_SYNONYMS: Record<string, string> = {
  style: "line",
  source: "from",
  target: "to",
  text: "label",
};
export const LAYOUT_KEYS = ["spacing", "routing", "layering", "merge", "aspect"];
/** Flowchart and state names for shapes, after ISO 5807 and UML. */
export const SHAPE_SYNONYMS: Record<string, ShapeKind> = {
  terminator: "pill",
  terminal: "pill",
  decision: "diamond",
  process: "box",
  data: "parallelogram",
  io: "parallelogram",
  input: "parallelogram",
  output: "parallelogram",
  predefined: "subroutine",
  manual: "trapezoid",
  database: "cylinder",
  state: "rounded",
};
/** Each kind's flow direction and arrowhead when the spec leaves them out. */
export const KIND_DEFAULTS: Record<
  DiagramKind,
  { direction: Direction; arrowhead: "open" | "filled" }
> = {
  architecture: { direction: "right", arrowhead: "open" },
  flowchart: { direction: "down", arrowhead: "filled" },
  process: { direction: "right", arrowhead: "filled" },
  state: { direction: "right", arrowhead: "open" },
  tree: { direction: "down", arrowhead: "open" },
  mindmap: { direction: "right", arrowhead: "open" },
  journey: { direction: "right", arrowhead: "open" },
};
export const ICON_NAME = /^[a-z0-9][a-z0-9-]*$/;
export const ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
export const ICON_ID = /^(aws|azure|gcp|k8s|github|ibm|logos|si|tabler|ph|generic|local):[a-z0-9]/i;
