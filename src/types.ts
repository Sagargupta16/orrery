// The diagram model at three stages: what the author writes (Spec*), what the parser hands to
// layout (Model*), and what layout hands to every renderer (Scene*).

import type { SceneJourney } from "./journey.ts";

export type Direction = "right" | "down" | "left" | "up";
export type ThemeName = "light" | "dark";
export type EdgeLine = "solid" | "dashed" | "dotted" | "thick";
export type ArrowMode = "end" | "start" | "both" | "none";
export type NodeLook = "icon" | "card" | "shape";
export type ShapeKind =
  | "box"
  | "rounded"
  | "pill"
  | "circle"
  | "diamond"
  | "hexagon"
  | "cylinder"
  | "queue"
  | "document"
  | "note"
  | "person"
  | "cloud"
  | "stack"
  // Flowchart (ISO 5807): data in or out, a predefined process, a manual operation, a delay.
  | "parallelogram"
  | "subroutine"
  | "trapezoid"
  | "delay"
  // State machines (UML): the initial pseudostate and the final state.
  | "initial"
  | "final";
export type Routing = "orthogonal" | "polyline" | "spline";
export type Spacing = "compact" | "normal" | "loose";

export const DIRECTIONS: readonly Direction[] = ["right", "down", "left", "up"];
export const THEMES: readonly ThemeName[] = ["light", "dark"];
export const EDGE_LINES: readonly EdgeLine[] = ["solid", "dashed", "dotted", "thick"];
export const ARROWS: readonly ArrowMode[] = ["end", "start", "both", "none"];
export const LOOKS: readonly NodeLook[] = ["icon", "card", "shape"];
export const SHAPES: readonly ShapeKind[] = [
  "box",
  "rounded",
  "pill",
  "circle",
  "diamond",
  "hexagon",
  "cylinder",
  "queue",
  "document",
  "note",
  "person",
  "cloud",
  "stack",
  "parallelogram",
  "subroutine",
  "trapezoid",
  "delay",
  "initial",
  "final",
];

/**
 * What a diagram is. architecture: the vendors' boxes and lines (the default); flowchart,
 * process (BPMN 2.0), state (UML state machine): flows on the same layered layout; tree and
 * mindmap: hierarchies; journey: a customer journey grid of stages and lanes.
 */
export type DiagramKind =
  | "architecture"
  | "flowchart"
  | "process"
  | "state"
  | "tree"
  | "mindmap"
  | "journey";
export const DIAGRAM_KINDS: readonly DiagramKind[] = [
  "architecture",
  "flowchart",
  "process",
  "state",
  "tree",
  "mindmap",
  "journey",
];

/** BPMN 2.0 elements a process node can be (`bpmn:` on a node). */
export type BpmnKind =
  | "start"
  | "start-message"
  | "start-timer"
  | "start-signal"
  | "start-conditional"
  | "intermediate"
  | "intermediate-message"
  | "intermediate-timer"
  | "intermediate-signal"
  | "end"
  | "end-message"
  | "end-error"
  | "end-signal"
  | "end-terminate"
  | "end-escalation"
  | "exclusive"
  | "parallel"
  | "inclusive"
  | "event-based"
  | "complex"
  | "task"
  | "user-task"
  | "service-task"
  | "manual-task"
  | "script-task"
  | "send-task"
  | "receive-task"
  | "business-rule-task"
  | "subprocess"
  | "call-activity"
  | "data-object"
  | "data-store";
export const BPMN_KINDS: readonly BpmnKind[] = [
  "start",
  "start-message",
  "start-timer",
  "start-signal",
  "start-conditional",
  "intermediate",
  "intermediate-message",
  "intermediate-timer",
  "intermediate-signal",
  "end",
  "end-message",
  "end-error",
  "end-signal",
  "end-terminate",
  "end-escalation",
  "exclusive",
  "parallel",
  "inclusive",
  "event-based",
  "complex",
  "task",
  "user-task",
  "service-task",
  "manual-task",
  "script-task",
  "send-task",
  "receive-task",
  "business-rule-task",
  "subprocess",
  "call-activity",
  "data-object",
  "data-store",
];
/** Events and gateways are drawn as a symbol with the label outside it. */
export const isBpmnEvent = (k: BpmnKind | undefined): boolean =>
  !!k && /^(start|intermediate|end)/.test(k);
export const isBpmnGateway = (k: BpmnKind | undefined): boolean =>
  k === "exclusive" ||
  k === "parallel" ||
  k === "inclusive" ||
  k === "event-based" ||
  k === "complex";

/**
 * What an edge means in a process. sequence: the order of work (the default); message: between
 * pools (dashed, a hollow circle at the start); default: the branch a gateway takes when no
 * condition holds (a slash at the start); conditional: a condition on a sequence flow (a small
 * diamond at the start); association: links an annotation or data (dotted, no arrowhead).
 */
export type EdgeFlow = "sequence" | "message" | "default" | "conditional" | "association";
export const EDGE_FLOWS: readonly EdgeFlow[] = [
  "sequence",
  "message",
  "default",
  "conditional",
  "association",
];

/** An SVG file the spec registers as an icon (`icons:`), used as `local:<name>`. */
export interface LocalIcon {
  name: string;
  /** Absolute path, resolved against the spec's folder. */
  path: string;
}
export const ROUTINGS: readonly Routing[] = ["orthogonal", "polyline", "spline"];
export const SPACINGS: readonly Spacing[] = ["compact", "normal", "loose"];

/** A finding from validation, layout checks or output checks. */
export interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  /** What the finding is about: a node, group or edge id, a spec path. */
  subject?: Record<string, unknown>;
  /** Measured facts behind the finding. */
  evidence?: Record<string, unknown>;
  /** Concrete edits that resolve it, most likely first. */
  fixes?: string[];
}

/**
 * packets: dots travel each edge (in step order when steps exist); flow: marching dashes;
 * relay: on one clock each line draws itself in turn and the node it reaches lights up.
 */
export type AnimateMode = "packets" | "flow" | "relay" | "none";
export const ANIMATE_MODES: readonly AnimateMode[] = ["packets", "flow", "relay", "none"];

/** classic: the vendors' own diagram styles; stage: the portfolio scene look over the same layout. */
export type Skin = "classic" | "stage";
export const SKINS: readonly Skin[] = ["classic", "stage"];

export interface ModelNode {
  id: string;
  label: string;
  note?: string;
  icon?: string;
  look: NodeLook;
  shape: ShapeKind;
  parent?: string;
  color?: string;
  badge?: string;
  url?: string;
  iconSize: number;
  /** BPMN element (process diagrams): drawn in BPMN 2.0 notation instead of `shape`. */
  bpmn?: BpmnKind;
  /** Journey column (one of the spec's `stages`). */
  stage?: string;
  /** Journey emotion at this step, -2 (very negative) to 2 (very positive). */
  score?: number;
}

export interface ModelGroup {
  id: string;
  label: string;
  type: string;
  parent?: string;
  color?: string;
  fill?: string;
  icon?: string | null;
  dashed?: boolean;
  /** Overlay group: drawn around these ids after layout, without moving them. */
  around?: string[];
}

export interface ModelEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  line: EdgeLine;
  arrow: ArrowMode;
  color?: string;
  step?: number;
  /** false: drawn after layout and ignored by it (links between side-by-side zones). */
  constraint: boolean;
  /** Process flow kind; unset is a sequence flow. */
  flow?: EdgeFlow;
}

/** What one line style means in this diagram (spec `legend:`), drawn as a key. */
export interface LegendEntry {
  line: EdgeLine;
  label: string;
}

export interface Model {
  title?: string;
  subtitle?: string;
  /** Line-style meanings in spec order; drawn as a key when present. */
  legend?: LegendEntry[];
  direction: Direction;
  theme: ThemeName;
  routing: Routing;
  spacing: number;
  layering: "source" | "simplex";
  /** Join edges that share an endpoint into one trunk. */
  merge: boolean;
  /** "open" chevrons (AWS and Google decks) or "filled" triangles (Azure). */
  arrowhead: "open" | "filled";
  /** Unset: the skin's default (packets for classic, relay for stage). */
  animate?: AnimateMode;
  skin: Skin;
  background?: string;
  nodes: ModelNode[];
  groups: ModelGroup[];
  edges: ModelEdge[];
  /** What the diagram is; unset in the spec is architecture. */
  kind: DiagramKind;
  /** Journey columns in order. */
  stages?: string[];
  /** The path the stage story takes, as node ids in order (otherwise steps, else the longest path). */
  story?: string[];
  /** SVG files registered as `local:<name>` icons. */
  icons?: LocalIcon[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextBlock {
  lines: string[];
  size: number;
  weight: 400 | 600;
  /** Line advance in px. */
  lead: number;
  width: number;
  height: number;
}

export interface SceneNode {
  id: string;
  look: NodeLook;
  shape: ShapeKind;
  /** The box edges attach to. */
  box: Box;
  /** Where the icon is drawn, if any. */
  iconBox?: Box;
  icon?: string;
  label: TextBlock;
  labelBox: Box;
  note?: TextBlock;
  noteBox?: Box;
  color?: string;
  badge?: string;
  /** The badge pill, sized from the measured badge text. */
  badgeBox?: Box;
  url?: string;
  parent?: string;
  /** Label and note colors, set when the node sits on a filled group that needs them. */
  ink?: string;
  inkMuted?: string;
  bpmn?: BpmnKind;
  stage?: string;
  score?: number;
}

export interface SceneGroup {
  id: string;
  type: string;
  box: Box;
  depth: number;
  label: TextBlock;
  labelBox: Box;
  iconBox?: Box;
  icon?: string;
  stroke: string;
  fill: string;
  labelColor: string;
  dash?: string;
  strokeWidth: number;
  radius: number;
  parent?: string;
  /** Drawn around its members after layout (does not contain them). */
  overlay?: boolean;
  /** Inner panel of a frame group (Google Cloud's blue frame). */
  inner?: { box: Box; fill: string };
  /**
   * A pool or lane band (process and swimlane diagrams): `header` is the strip its label sits
   * in, across the flow (on the left of a horizontal flow, on top of a vertical one).
   */
  lane?: { horizontal: boolean; header: Box };
}

export interface SceneEdge {
  id: string;
  from: string;
  to: string;
  points: Point[];
  line: EdgeLine;
  arrow: ArrowMode;
  color?: string;
  label?: TextBlock;
  labelBox?: Box;
  step?: number;
  stepBox?: Box;
  flow?: EdgeFlow;
}

export interface SceneLegendItem {
  line: EdgeLine;
  /** Where the sample line is drawn (a short horizontal stroke across the middle of the box). */
  swatch: Box;
  label: TextBlock;
  labelBox: Box;
}

/** The key that explains line styles, placed by layout inside the canvas. */
export interface SceneLegend {
  box: Box;
  items: SceneLegendItem[];
}

export interface Scene {
  width: number;
  height: number;
  theme: ThemeName;
  direction: Direction;
  routing: Routing;
  arrowhead: "open" | "filled";
  animate: AnimateMode;
  skin: Skin;
  background?: string;
  title?: TextBlock;
  titleBox?: Box;
  subtitle?: TextBlock;
  subtitleBox?: Box;
  nodes: SceneNode[];
  groups: SceneGroup[];
  edges: SceneEdge[];
  legend?: SceneLegend;
  /** Set when ELK needed a fallback strategy, naming it; spec order may not be kept then. */
  layoutFallback?: string;
  /** Plain-language summary used for the SVG <desc> and alt text. */
  description: string;
  kind: DiagramKind;
  /** The spec's story path (node ids), for the stage story. */
  story?: string[];
  /** Journey grid: stage columns, lane rows and the emotion curve. */
  journey?: SceneJourney;
}
