// The diagram model at three stages: what the author writes (Spec*), what the parser hands to
// layout (Model*), and what layout hands to every renderer (Scene*).

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
  | "stack";
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
];
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

/** packets: dots travel each edge (in step order when steps exist); flow: marching dashes. */
export type AnimateMode = "packets" | "flow" | "none";
export const ANIMATE_MODES: readonly AnimateMode[] = ["packets", "flow", "none"];

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
}

export interface Model {
  title?: string;
  subtitle?: string;
  direction: Direction;
  theme: ThemeName;
  routing: Routing;
  spacing: number;
  layering: "source" | "simplex";
  /** Join edges that share an endpoint into one trunk. */
  merge: boolean;
  /** "open" chevrons (AWS and Google decks) or "filled" triangles (Azure). */
  arrowhead: "open" | "filled";
  animate: AnimateMode;
  background?: string;
  nodes: ModelNode[];
  groups: ModelGroup[];
  edges: ModelEdge[];
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
  url?: string;
  parent?: string;
  /** Label and note colors, set when the node sits on a filled group that needs them. */
  ink?: string;
  inkMuted?: string;
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
}

export interface Scene {
  width: number;
  height: number;
  theme: ThemeName;
  direction: Direction;
  routing: Routing;
  arrowhead: "open" | "filled";
  animate: AnimateMode;
  background?: string;
  title?: TextBlock;
  titleBox?: Box;
  subtitle?: TextBlock;
  subtitleBox?: Box;
  nodes: SceneNode[];
  groups: SceneGroup[];
  edges: SceneEdge[];
  /** Plain-language summary used for the SVG <desc> and alt text. */
  description: string;
}
