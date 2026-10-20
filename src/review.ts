// The measured half of the review board: scores one laid-out scene on six dimensions at the width
// readers will see it, so model reviewers only judge what code cannot measure. Every finding carries
// the numbers behind it, and the hard counts are the ratchet a patch must never raise.
// Protocol and rubrics: skills/orrery/references/review/.
import { contrast, isHex, mixHex } from "./color.ts";
import { aliases, iconAspect, iconInfo, resolveIcon } from "./icons.ts";
import type { PatchOp } from "./patch.ts";
import { renderModel } from "./render/index.ts";
import { renderPng } from "./render/png.ts";
import { tokensFor } from "./themes.ts";
import type {
  Box,
  Diagnostic,
  DiagramKind,
  Direction,
  Model,
  ModelEdge,
  Point,
  Scene,
  SceneEdge,
  SceneGroup,
  SceneNode,
  ThemeName,
} from "./types.ts";

/** A README column on GitHub: what most readers see. */
export const DEFAULT_REVIEW_WIDTH = 880;

export const DIMENSIONS = ["conventions", "layout", "grid", "flow", "overlap", "quality"] as const;
export type ReviewDimension = (typeof DIMENSIONS)[number];
export type ReviewSeverity = "blocker" | "major" | "minor";

/** Share of the total score per dimension. */
export const WEIGHTS: Record<ReviewDimension, number> = {
  conventions: 0.15,
  layout: 0.15,
  grid: 0.1,
  flow: 0.2,
  overlap: 0.2,
  quality: 0.2,
};

interface FindingKind {
  dimension: ReviewDimension;
  /** The diagnostic code or vendor rubric rule this finding measures. */
  rule?: string;
  /** Most points this kind can take off its dimension. */
  cap: number;
  about: string;
}

/** Every finding id reviewScene emits. Model reviewers use rubric rule ids instead. */
export const FINDINGS = {
  "overlap.edge-through-node": {
    dimension: "overlap",
    rule: "DG201",
    cap: 60,
    about: "an edge runs through a node it does not connect",
  },
  "overlap.label-over-node": {
    dimension: "overlap",
    rule: "DG202",
    cap: 40,
    about: "an edge label covers a node",
  },
  "overlap.labels-collide": {
    dimension: "overlap",
    rule: "DG202",
    cap: 40,
    about: "two edge labels overlap",
  },
  "overlap.nodes-collide": {
    dimension: "overlap",
    rule: "DG203",
    cap: 60,
    about: "two nodes' drawn footprints overlap",
  },
  "overlap.edge-through-header": {
    dimension: "overlap",
    rule: "DG209",
    cap: 40,
    about: "an edge runs under a group header label, so it looks broken",
  },
  "overlap.edge-through-label": {
    dimension: "overlap",
    rule: "DG212",
    cap: 40,
    about: "an edge runs through another edge's label or step badge, or a node's label text",
  },
  "overlap.off-canvas": {
    dimension: "overlap",
    rule: "DG210",
    cap: 60,
    about: "something is drawn outside the canvas and gets cut off",
  },
  "overlap.badge": {
    dimension: "overlap",
    rule: "DG211",
    cap: 40,
    about: "a step badge or node badge covers a node, a label or another badge",
  },
  "overlap.overlay-encloses": {
    dimension: "overlap",
    rule: "DG213",
    cap: 30,
    about: "an overlay (around:) group draws around a node that is not a member",
  },
  "overlap.overlay-header": {
    dimension: "overlap",
    rule: "DG214",
    cap: 30,
    about: "an overlay (around:) group's header covers another group's header or a node",
  },
  "overlap.outside-group": {
    dimension: "overlap",
    cap: 30,
    about: "a node or group sticks out of its parent group or into its header",
  },
  "overlap.groups-collide": {
    dimension: "overlap",
    cap: 30,
    about: "two groups that do not nest overlap",
  },
  "overlap.label-on-border": {
    dimension: "overlap",
    rule: "DG220",
    cap: 16,
    about: "an edge label sits on a group's border line, so the frame looks broken there",
  },
  "overlap.edge-skims-node": {
    dimension: "overlap",
    rule: "DG221",
    cap: 16,
    about: "an edge passes within 10px of a node it does not connect, so it reads as touching it",
  },
  "flow.head-hidden": {
    dimension: "flow",
    cap: 40,
    about: "an arrowhead sits under a label, badge, header or node, so the direction is lost",
  },
  "flow.shared-trunk": {
    dimension: "flow",
    cap: 32,
    about: "two unrelated edges run on the same line, so readers cannot tell them apart",
  },
  "flow.step-order": {
    dimension: "flow",
    rule: "AWS-14",
    cap: 32,
    about: "step numbers do not follow reading order (left to right, top to bottom, or clockwise)",
  },
  "flow.step-numbering": {
    dimension: "flow",
    cap: 8,
    about: "step numbers skip a number or do not start at 1",
  },
  "flow.bidirectional": {
    dimension: "flow",
    rule: "AZ-04",
    cap: 12,
    about: "a two-headed arrow hides who initiates",
  },
  "flow.undirected": {
    dimension: "flow",
    rule: "AZ-03",
    cap: 12,
    about: "a line without an arrowhead leaves the relationship unclear",
  },
  "flow.unlabelled-boundary": {
    dimension: "flow",
    cap: 10,
    about: "an unlabelled edge crosses a group boundary",
  },
  "flow.head-on-bend": {
    dimension: "flow",
    cap: 15,
    about: "the last straight run is shorter than the arrowhead, so the head sits on the bend",
  },
  "flow.arrow-short": {
    dimension: "flow",
    cap: 10,
    about: "an edge stops short of the drawn icon glyph",
  },
  "flow.unconnected": {
    dimension: "flow",
    rule: "DG208",
    cap: 12,
    about: "a node nothing connects to",
  },
  "flow.edge-budget": {
    dimension: "flow",
    cap: 6,
    about: "an architecture diagram with more edges than nodes, which reads as a call sequence",
  },
  "flow.cross-cutting": {
    dimension: "flow",
    cap: 12,
    about:
      "four or more edges into a monitoring, logging, audit, identity or key service; a shared services group says it without arrows",
  },
  "layout.against-flow": {
    dimension: "layout",
    cap: 30,
    about: "an arrowhead points against the diagram direction",
  },
  "layout.crossings": {
    dimension: "layout",
    cap: 30,
    about: "edges cross each other",
  },
  "layout.empty-space": {
    dimension: "layout",
    cap: 25,
    about: "a large empty rectangle inside the content",
  },
  "layout.aspect": {
    dimension: "layout",
    rule: "DG205",
    cap: 25,
    about: "the picture is a strip, hard to read in a document column",
  },
  "layout.too-wide": {
    dimension: "layout",
    rule: "DG205",
    cap: 15,
    about: "the canvas is wider than 2400px",
  },
  "layout.long-edge": {
    dimension: "layout",
    cap: 15,
    about: "an edge is far longer than the median edge",
  },
  "layout.fallback": {
    dimension: "layout",
    rule: "DG218",
    cap: 5,
    about: "ELK needed a fallback strategy, so spec order may not be kept",
  },
  "layout.empty-group": {
    dimension: "layout",
    rule: "DG207",
    cap: 10,
    about: "a group with nothing in it",
  },
  "layout.ignored": {
    dimension: "layout",
    rule: "DG219",
    cap: 9,
    about: "a placement setting layout could not honor, so the spec says more than the picture",
  },
  "layout.sparse-group": {
    dimension: "layout",
    cap: 12,
    about: "a group more than 65% empty",
  },
  "layout.beside-group": {
    dimension: "layout",
    cap: 12,
    about:
      "a node outside a group shares 20 to 80% of its height with it, so the two read as one row of peers",
  },
  "grid.ragged": {
    dimension: "grid",
    cap: 24,
    about: "items in one layer share no start, center or end line",
  },
  "grid.jog": {
    dimension: "grid",
    cap: 24,
    about: "an edge has a tiny step (under 6px) where it could run straight",
  },
  "grid.off-center": {
    dimension: "grid",
    cap: 21,
    about: "a group's content is off its center by more than 6px",
  },
  "grid.uneven-gaps": {
    dimension: "grid",
    cap: 15,
    about: "gaps between layers vary a lot",
  },
  "grid.zig-zag": {
    dimension: "grid",
    cap: 15,
    about:
      "a one-to-one edge steps 12 to 180px between two parallel runs (a Z), so its ends are out of line",
  },
  "grid.avoidable-bend": {
    dimension: "grid",
    cap: 15,
    about: "a one-to-one edge turns once with a leg of 240px or less, so its ends are out of line",
  },
  "grid.uneven-siblings": {
    dimension: "grid",
    cap: 12,
    about:
      "same-kind sibling groups in a row differ 10 to 40% in height (in a column, in width), which reads as a mistake",
  },
  "grid.padding": {
    dimension: "grid",
    cap: 12,
    about:
      "one side of a group's padding is over 80px and over 3x its tightest side, so the box does not hug its content",
  },
  "quality.label-size": {
    dimension: "quality",
    rule: "LEG-01",
    cap: 60,
    about: "node labels are too small at the display width",
  },
  "quality.text-size": {
    dimension: "quality",
    rule: "LEG-02",
    cap: 20,
    about: "the smallest text (notes, edge labels, badges) is too small at the display width",
  },
  "quality.icon-size": {
    dimension: "quality",
    rule: "LEG-03",
    cap: 15,
    about: "icons are too small to recognize at the display width",
  },
  "quality.contrast": {
    dimension: "quality",
    rule: "LEG-04",
    cap: 40,
    about: "text below the WCAG 2.2 contrast minimum",
  },
  "quality.node-count": {
    dimension: "quality",
    rule: "DG206",
    cap: 20,
    about: "more nodes than one diagram can carry",
  },
  "quality.long-label": {
    dimension: "quality",
    rule: "DG204",
    cap: 12,
    about: "a node label wraps to more than three lines",
  },
  "quality.mid-word-break": {
    dimension: "quality",
    rule: "AWS-07",
    cap: 12,
    about: "a label breaks in the middle of a word",
  },
  "conventions.legend-missing": {
    dimension: "conventions",
    rule: "DG217",
    cap: 30,
    about: "a line style is used without a legend that explains it",
  },
  "conventions.legend-unused": {
    dimension: "conventions",
    cap: 6,
    about: "the legend explains a line style the diagram does not draw",
  },
  "conventions.title-missing": {
    dimension: "conventions",
    rule: "C4-01",
    cap: 8,
    about: "the diagram has no title",
  },
  "conventions.short-name": {
    dimension: "conventions",
    rule: "AWS-08",
    cap: 20,
    about: "an AWS short form with no full service name anywhere in the diagram",
  },
  "conventions.label-lines": {
    dimension: "conventions",
    rule: "AWS-07",
    cap: 15,
    about: "an AWS service label runs over two lines",
  },
  "conventions.callout-sizes": {
    dimension: "conventions",
    rule: "AWS-13",
    cap: 5,
    about: "step callouts come in more than one size",
  },
  "conventions.boundary-label": {
    dimension: "conventions",
    rule: "AWS-17",
    cap: 12,
    about: "an AWS boundary group's label does not name the boundary (Private subnet, VPC, Region)",
  },
  "conventions.service-group": {
    dimension: "conventions",
    rule: "AWS-18",
    cap: 12,
    about: "a group with an AWS service icon holds other services",
  },
  "conventions.service-label": {
    dimension: "conventions",
    rule: "AWS-19",
    cap: 15,
    about: "an AWS service icon's label does not name the service; the role belongs in note",
  },
  "conventions.c4-element": {
    dimension: "conventions",
    rule: "C4-04",
    cap: 24,
    about: "a C4 element lacks its type, description or technology",
  },
  "conventions.c4-relationship": {
    dimension: "conventions",
    rule: "C4-07",
    cap: 15,
    about: "a C4 relationship lacks a specific label or its technology",
  },
  "conventions.icon-recolored": {
    dimension: "conventions",
    rule: "AZ-06",
    cap: 15,
    about: "a brand mark is recolored",
  },
  "conventions.gcp-product-icon": {
    dimension: "conventions",
    rule: "GCP-02",
    cap: 24,
    about: "a Google Cloud product is drawn with another product's icon",
  },
  "conventions.bpmn-start-end": {
    dimension: "conventions",
    rule: "BPMN-01",
    cap: 24,
    about: "a process (or one pool's process) has no start event or no end event",
  },
  "conventions.bpmn-gateway": {
    dimension: "conventions",
    rule: "BPMN-04",
    cap: 24,
    about:
      "a splitting exclusive or inclusive gateway asks no question or leaves a branch unlabelled",
  },
  "conventions.bpmn-join": {
    dimension: "conventions",
    rule: "BPMN-06",
    cap: 20,
    about:
      "parallel branches meet at something other than a joining gateway, so what follows runs once per branch",
  },
  "conventions.bpmn-pools": {
    dimension: "conventions",
    rule: "BPMN-07",
    cap: 30,
    about:
      "a message flow inside one pool, or a sequence flow that crosses from one pool to another",
  },
  "conventions.flowchart-terminals": {
    dimension: "conventions",
    rule: "FC-01",
    cap: 20,
    about: "a flowchart without exactly one start terminator and at least one end terminator",
  },
  "conventions.flowchart-decision": {
    dimension: "conventions",
    rule: "FC-03",
    cap: 24,
    about: "a decision with fewer than two exits, or an exit that does not say which answer it is",
  },
  "conventions.state-initial": {
    dimension: "conventions",
    rule: "SM-01",
    cap: 20,
    about:
      "a state machine with no initial pseudostate, more than one in a region, or one with several transitions out",
  },
  "conventions.state-final": {
    dimension: "conventions",
    rule: "SM-03",
    cap: 15,
    about: "a transition leaves a final state",
  },
  "conventions.journey-incomplete": {
    dimension: "conventions",
    rule: "JM-04",
    cap: 10,
    about: "a journey stage with no step, or a journey with no emotion score anywhere",
  },
} as const satisfies Record<string, FindingKind>;

export type FindingId = keyof typeof FINDINGS;

export interface ReviewFinding {
  /** A FINDINGS id (measured) or a rubric rule id such as AWS-08 (model reviewers). */
  id: string;
  dimension: ReviewDimension;
  severity: ReviewSeverity;
  /** Spec ids (nodes, groups, edges) the finding is about. */
  subjects: string[];
  /** The measured values behind the claim. */
  evidence: Record<string, number | string>;
  claim: string;
  /** Spec edits that resolve it, most likely first. */
  fixes: string[];
  /** The first fix as spec patches (loop.md "Patches"), when it can be written as one. */
  patches?: PatchOp[];
  /** The diagnostic code or rubric rule it restates. */
  rule?: string;
}

/** Counts a patch must never raise (the ratchet). */
export interface HardCounts {
  /** Labels over nodes, colliding nodes or labels, badges, hidden arrowheads, groups out of place. */
  overlaps: number;
  edgesThroughNodes: number;
  edgesThroughHeaders: number;
  /** Through another edge's label or step, or through a node's label text. */
  edgesThroughLabels: number;
  offCanvas: number;
  /** Text under the WCAG minimum, summed over every theme reviewed. */
  contrastFailures: number;
}

export interface DimensionScore {
  score: number;
  weight: number;
  /** The measurements the score comes from; reviewers cite these by name. */
  metrics: Record<string, number | string>;
}

/** A spec element and where it lands in the display-width PNG (CSS px). */
export interface ReviewElement {
  id: string;
  kind: "node" | "group" | "edge";
  label: string;
  box: Box;
}

export interface ReviewReport {
  name?: string;
  /** Display width reviewed at (CSS px). */
  width: number;
  /** min(1, width / canvas width): how much every length shrinks for the reader. */
  scale: number;
  theme: ThemeName;
  /** Themes whose text contrast was checked. */
  themes: ThemeName[];
  canvas: { width: number; height: number };
  display: { width: number; height: number };
  /** Icon packs and notations in use; they pick the conventions rubrics. */
  vendors: string[];
  /** Rubric files under references/review/ that apply to this diagram. */
  rubrics: string[];
  score: number;
  pass: boolean;
  hard: HardCounts;
  dimensions: Record<ReviewDimension, DimensionScore>;
  findings: ReviewFinding[];
  elements: ReviewElement[];
}

export interface ReviewOptions {
  /** Display width in CSS px (README column: 880). */
  width: number;
  name?: string;
  /** The same diagram laid out in other themes, checked for contrast only. */
  themes?: Scene[];
}

// ---------------------------------------------------------------- geometry

const EPS = 0.5;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const real = (b?: Box): b is Box => !!b && b.w > 0 && b.h > 0;

function union(list: (Box | undefined)[]): Box | undefined {
  const l = list.filter(real);
  if (!l.length) return undefined;
  const x = Math.min(...l.map((b) => b.x));
  const y = Math.min(...l.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...l.map((b) => b.x + b.w)) - x,
    h: Math.max(...l.map((b) => b.y + b.h)) - y,
  };
}

function interArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const inBox = (x: number, y: number, b: Box) =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** Length of segment pq inside box b shrunk by inset (Liang-Barsky). */
function clipLen(p: Point, q: Point, b: Box, inset = 0): number {
  const box = { x: b.x + inset, y: b.y + inset, w: b.w - 2 * inset, h: b.h - 2 * inset };
  if (box.w <= 0 || box.h <= 0) return 0;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const sides: [number, number][] = [
    [-dx, p.x - box.x],
    [dx, box.x + box.w - p.x],
    [-dy, p.y - box.y],
    [dy, box.y + box.h - p.y],
  ];
  for (const [pp, qq] of sides) {
    if (pp === 0) {
      if (qq < 0) return 0;
    } else {
      const r = qq / pp;
      if (pp < 0) {
        if (r > t1) return 0;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return 0;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 < t1 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
}

function pathClipLen(points: Point[], b: Box, inset = 0): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i];
    const q = points[i + 1];
    if (p && q) total += clipLen(p, q, b, inset);
  }
  return total;
}

const segments = (points: Point[]): [Point, Point][] =>
  points.slice(1).flatMap((q, i) => {
    const p = points[i];
    return p ? [[p, q] as [Point, Point]] : [];
  });

const pathLen = (points: Point[]) =>
  segments(points).reduce((s, [p, q]) => s + Math.hypot(q.x - p.x, q.y - p.y), 0);

/** Drops repeated and collinear points, so a jog is a real bend. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Point, Point, Point];
      if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 0.01)
        out.splice(out.length - 2, 1);
      else break;
    }
  }
  return out;
}

/** The point half way along a path. */
function midpoint(points: Point[]): Point {
  const half = pathLen(points) / 2;
  let walked = 0;
  for (const [p, q] of segments(points)) {
    const l = Math.hypot(q.x - p.x, q.y - p.y);
    if (walked + l >= half && l > 0) {
      const t = (half - walked) / l;
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    }
    walked += l;
  }
  return points[0] ?? { x: 0, y: 0 };
}

const horizontalFlow = (d: Direction) => d === "right" || d === "left";
const along = (d: Direction, dx: number, dy: number) =>
  d === "right" ? dx : d === "left" ? -dx : d === "down" ? dy : -dy;

function footprint(n: SceneNode): Box {
  return union([n.box, n.iconBox, n.labelBox, n.noteBox]) ?? n.box;
}

/** The surface-colored chip a group header draws over edges (as check.ts and svg.ts do). */
function headerChip(g: SceneGroup): Box | undefined {
  if (!g.label.lines.length) return undefined;
  const parts = g.overlay && g.iconBox ? [g.labelBox, g.iconBox] : [g.labelBox];
  const u = union(parts);
  return u ? { x: u.x - 4, y: u.y - 1, w: u.w + 8, h: u.h + 2 } : undefined;
}

/** The badge pill: the layout's box, else where the renderer puts it. */
function badgeRect(n: SceneNode): Box | undefined {
  if (!n.badge) return undefined;
  if (n.badgeBox) return n.badgeBox;
  const anchor = n.look === "icon" ? n.iconBox : n.box;
  if (!anchor) return undefined;
  const w = Math.max(18, 8 + n.badge.length * 6.4);
  return { x: anchor.x + anchor.w - w / 2 - 2, y: anchor.y - 7, w, h: 16 };
}

/** Where a group's content may start: below its header. */
function headerBottom(g: SceneGroup): number {
  if (g.overlay) return g.box.y;
  const parts = [g.labelBox, g.iconBox].filter(real);
  return Math.max(g.box.y, ...parts.map((b) => b.y + b.h));
}

/** The top left of a group's content: a pool or lane keeps its label strip across the flow. */
function contentStart(g: SceneGroup): Point {
  if (!g.lane) return { x: g.box.x, y: headerBottom(g) };
  const s = g.lane.header;
  return g.lane.horizontal ? { x: s.x + s.w, y: g.box.y } : { x: g.box.x, y: s.y + s.h };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word (optionally plural) match of a phrase in normalized text. */
const hasPhrase = (text: string, phrase: string) =>
  !!phrase && new RegExp(`(^| )${escapeRe(norm(phrase))}s?( |$)`).test(text);

/** Monitoring, logging, audit, identity and key services, by icon pack and catalog name. */
const CROSS_CUTTING: Record<string, RegExp> = {
  aws: /^(Amazon CloudWatch|AWS CloudTrail|AWS X-Ray|AWS Identity and Access Management|AWS Key Management Service|AWS Config|Amazon GuardDuty|AWS Security Hub)\b/,
  azure:
    /^(Monitor|Azure Monitor|Log Analytics Workspaces|Application Insights|(Microsoft )?Entra ID|Entra Managed Identities|Key Vaults?)$/,
  gcp: /^(Cloud Logging|Cloud Monitoring|Identity and Access Management|Key Management Service)$/,
};

// ---------------------------------------------------------------- review

interface Ctx {
  scene: Scene;
  model: Model;
  s: number;
  width: number;
  dir: Direction;
  nodes: Map<string, SceneNode>;
  groups: Map<string, SceneGroup>;
  foot: Map<string, Box>;
  parentOf: (id: string) => string | undefined;
  isDescendant: (id: string, ancestor: string) => boolean;
  add: (
    id: FindingId,
    severity: ReviewSeverity,
    subjects: string[],
    evidence: Record<string, number | string>,
    claim: string,
    fixes: string[],
    cost: number,
    patches?: PatchOp[],
  ) => void;
  metrics: Record<ReviewDimension, Record<string, number | string>>;
  hard: HardCounts;
}

const edgeName = (e: { from: string; to: string }) => `${e.from} -> ${e.to}`;

/** A check.ts overlap diagnostic as a review finding: which id, how bad, what it costs. */
interface OverlapRule {
  id: FindingId;
  severity: ReviewSeverity;
  cost: number;
  /** The hard count each such diagnostic raises; near misses raise none. */
  hard?: keyof HardCounts;
  /** Diagnostic subject keys that name spec ids. */
  ids: string[];
}

/** By diagnostic code; DG202 is two findings, told apart by `subject.edges` (label on label). */
const OVERLAP_RULES: Record<string, OverlapRule> = {
  DG201: {
    id: "overlap.edge-through-node",
    severity: "blocker",
    cost: 15,
    hard: "edgesThroughNodes",
    ids: ["edge", "node"],
  },
  DG202: {
    id: "overlap.label-over-node",
    severity: "major",
    cost: 12,
    hard: "overlaps",
    ids: ["edge", "node"],
  },
  "DG202:labels": {
    id: "overlap.labels-collide",
    severity: "major",
    cost: 12,
    hard: "overlaps",
    ids: ["edges"],
  },
  DG203: {
    id: "overlap.nodes-collide",
    severity: "blocker",
    cost: 15,
    hard: "overlaps",
    ids: ["nodes"],
  },
  DG209: {
    id: "overlap.edge-through-header",
    severity: "major",
    cost: 8,
    hard: "edgesThroughHeaders",
    ids: ["edge", "group"],
  },
  DG210: {
    id: "overlap.off-canvas",
    severity: "blocker",
    cost: 15,
    hard: "offCanvas",
    ids: ["node", "group", "edge", "legend", "title", "subtitle"],
  },
  DG211: {
    id: "overlap.badge",
    severity: "major",
    cost: 8,
    hard: "overlaps",
    ids: ["edge", "node", "over"],
  },
  DG212: {
    id: "overlap.edge-through-label",
    severity: "major",
    cost: 8,
    hard: "edgesThroughLabels",
    ids: ["edge", "labelOf"],
  },
  DG213: {
    id: "overlap.overlay-encloses",
    severity: "major",
    cost: 10,
    hard: "overlaps",
    ids: ["group", "enclosed"],
  },
  DG214: {
    id: "overlap.overlay-header",
    severity: "major",
    cost: 10,
    hard: "overlaps",
    ids: ["group", "covered"],
  },
  // The chip hides the line rather than colliding with text: the sample this comes from (aws-archify
  // check-layout 3) warns, not fails, for a label with a knockout, so minor and no hard count.
  DG220: {
    id: "overlap.label-on-border",
    severity: "minor",
    cost: 4,
    ids: ["edge", "group"],
  },
  DG221: {
    id: "overlap.edge-skims-node",
    severity: "minor",
    cost: 4,
    ids: ["edge", "node"],
  },
};

/** A diagnostic's evidence as flat number/string pairs: a nested box becomes "box.x", "box.w"... */
function flatEvidence(v: unknown, key = "", out: Record<string, number | string> = {}) {
  if (typeof v === "number" || typeof v === "string") out[key] = v;
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) flatEvidence(x, key ? `${key}.${k}` : k, out);
  return out;
}

/** The spec ids a diagnostic names under `keys`; a flag such as `legend: true` names itself. */
const subjectIds = (d: Diagnostic, keys: string[]) =>
  keys.flatMap((k) => {
    const v = d.subject?.[k];
    if (v === true) return [k];
    if (Array.isArray(v)) return v.map(String);
    return typeof v === "string" ? [v] : [];
  });

function measureOverlap(c: Ctx, diagnostics: Diagnostic[]): void {
  const { scene, add, hard } = c;
  const m = c.metrics.overlap;
  const count = (code: string) => diagnostics.filter((d) => d.code === code).length;

  // The geometry rules live in check.ts; review maps each diagnostic to one finding.
  for (const d of diagnostics) {
    const rule = OVERLAP_RULES[d.code === "DG202" && d.subject?.edges ? "DG202:labels" : d.code];
    if (!rule) continue;
    if (rule.hard) hard[rule.hard]++;
    add(
      rule.id,
      rule.severity,
      subjectIds(d, rule.ids),
      flatEvidence(d.evidence),
      d.message,
      d.fixes ?? [],
      rule.cost,
    );
  }

  // Not in check.ts: DG209 covers the label chip (and an overlay's icon), not a plain group's icon.
  for (const g of scene.groups) {
    if (!g.iconBox) continue;
    for (const e of scene.edges) {
      const len = pathClipLen(e.points, g.iconBox, EPS);
      const reported = diagnostics.some(
        (d) => d.code === "DG209" && d.subject?.edge === e.id && d.subject?.group === g.id,
      );
      if (len <= 1 || reported) continue;
      hard.edgesThroughHeaders++;
      add(
        "overlap.edge-through-header",
        "major",
        [e.id, g.id],
        { edge: edgeName(e), group: g.id, lengthPx: r1(len) },
        `edge ${edgeName(e)} runs ${r1(len)}px through the icon of group "${g.id}", so it looks broken`,
        [
          `reorder the nodes inside "${g.id}" so the edge enters away from the header`,
          `shorten the label of "${g.id}"`,
          "change direction",
        ],
        8,
      );
    }
  }

  // Not in check.ts: DG212 covers another edge's label, not its step badge or a node's label text.
  const horizontal = horizontalFlow(scene.direction);
  for (const e of scene.edges) {
    for (const o of scene.edges) {
      const len = o.id !== e.id && real(o.stepBox) ? pathClipLen(e.points, o.stepBox, 1) : 0;
      if (len > 1) {
        hard.edgesThroughLabels++;
        add(
          "overlap.edge-through-label",
          "major",
          [e.id, o.id],
          { edge: edgeName(e), other: edgeName(o), part: "step", lengthPx: r1(len) },
          `edge ${edgeName(e)} runs ${r1(len)}px through the step of ${edgeName(o)}`,
          [
            "move one endpoint earlier or later in the nodes list",
            `shorten or drop the label on ${edgeName(o)}`,
            "use layout: { spacing: loose }",
          ],
          8,
        );
      }
    }
    for (const n of scene.nodes) {
      const own = n.id === e.from || n.id === e.to;
      // A vertical flow leaves an icon through the label under it by design.
      if (own && !horizontal && n.look === "icon") continue;
      for (const [part, b] of [
        ["label", n.labelBox],
        ["note", n.noteBox],
      ] as const) {
        if (!real(b) || (n.look !== "icon" && own)) continue;
        const len = pathClipLen(e.points, b, 1);
        if (len > 1) {
          hard.edgesThroughLabels++;
          add(
            "overlap.edge-through-label",
            "major",
            [e.id, n.id],
            { edge: edgeName(e), node: n.id, part, lengthPx: r1(len) },
            `edge ${edgeName(e)} runs ${r1(len)}px through the ${part} text of "${n.id}"`,
            [`move "${n.id}" earlier or later in the nodes list`, "change direction"],
            8,
          );
        }
      }
    }
  }

  // Not in check.ts: nodes and groups against their parent frame, and sibling groups.
  let nesting = 0;
  const check = (id: string, box: Box | undefined, parentId: string | undefined) => {
    const p = parentId ? c.groups.get(parentId) : undefined;
    if (!p || !box || p.overlay) return;
    const start = contentStart(p);
    const clear = {
      left: box.x - start.x,
      right: p.box.x + p.box.w - (box.x + box.w),
      top: box.y - start.y,
      bottom: p.box.y + p.box.h - (box.y + box.h),
    };
    const min = Math.min(clear.left, clear.right, clear.top, clear.bottom);
    if (min < -EPS) {
      nesting++;
      add(
        "overlap.outside-group",
        "major",
        [id, p.id],
        {
          parent: p.id,
          left: r1(clear.left),
          right: r1(clear.right),
          top: r1(clear.top),
          bottom: r1(clear.bottom),
        },
        `"${id}" sticks ${r1(-min)}px out of "${p.id}" or into its header`,
        [`shorten the label of "${id}"`, `shorten the label of "${p.id}"`],
        8,
      );
    }
  };
  for (const n of scene.nodes) check(n.id, c.foot.get(n.id), n.parent);
  for (const g of scene.groups) if (!g.overlay) check(g.id, g.box, g.parent);
  const frames = scene.groups.filter((g) => !g.overlay);
  for (let i = 0; i < frames.length; i++)
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i];
      const b = frames[j];
      if (!a || !b || c.isDescendant(a.id, b.id) || c.isDescendant(b.id, a.id)) continue;
      const area = interArea(a.box, b.box);
      if (area > 1) {
        nesting++;
        add(
          "overlap.groups-collide",
          "major",
          [a.id, b.id],
          { areaPx: r1(area) },
          `groups "${a.id}" and "${b.id}" overlap but do not nest`,
          ["nest one inside the other with in:", "use around: for a group that spans others"],
          10,
        );
      }
    }

  hard.overlaps += nesting;
  Object.assign(m, {
    edgesThroughNodes: hard.edgesThroughNodes,
    labelsOverNodesOrLabels: count("DG202"),
    nodesColliding: count("DG203"),
    edgesThroughHeaders: hard.edgesThroughHeaders,
    edgesThroughLabels: hard.edgesThroughLabels,
    offCanvas: hard.offCanvas,
    badgeOverlaps: count("DG211"),
    nestingProblems: count("DG213") + nesting,
    labelsOnBorders: count("DG220"),
    edgesSkimmingNodes: count("DG221"),
  });
}

function measureFlow(c: Ctx, diagnostics: Diagnostic[]): void {
  const { scene, model, add, dir } = c;
  const m = c.metrics.flow;
  const horizontal = horizontalFlow(dir);

  // Arrowheads under something drawn later or on top (arrows lane audit).
  let hidden = 0;
  let onBend = 0;
  let short = 0;
  const chips = scene.groups.flatMap((g) => {
    const chip = headerChip(g);
    return [
      ...(chip ? [{ id: g.id, box: chip }] : []),
      ...(g.iconBox ? [{ id: g.id, box: g.iconBox }] : []),
    ];
  });
  for (const e of scene.edges) {
    const pts = simplify(e.points);
    const heads: { at: "to" | "from"; tip: Point; prev: Point; target: string }[] = [];
    const last = pts.at(-1);
    const before = pts.at(-2);
    const first = pts[0];
    const second = pts[1];
    if ((e.arrow === "end" || e.arrow === "both") && last && before)
      heads.push({ at: "to", tip: last, prev: before, target: e.to });
    if ((e.arrow === "start" || e.arrow === "both") && first && second)
      heads.push({ at: "from", tip: first, prev: second, target: e.from });
    const len = e.line === "thick" ? 11 : 9;
    const half = e.line === "thick" ? 5.5 : 4.5;
    for (const h of heads) {
      const L = Math.hypot(h.tip.x - h.prev.x, h.tip.y - h.prev.y);
      const ux = (h.tip.x - h.prev.x) / (L || 1);
      const uy = (h.tip.y - h.prev.y) / (L || 1);
      const bx = h.tip.x - ux * len;
      const by = h.tip.y - uy * len;
      const xs = [h.tip.x, bx - uy * half, bx + uy * half];
      const ys = [h.tip.y, by + ux * half, by - ux * half];
      const hb = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
      const hit = (b: Box) => {
        const ib = { x: b.x + EPS, y: b.y + EPS, w: b.w - 2 * EPS, h: b.h - 2 * EPS };
        return interArea(hb, ib) > EPS;
      };
      const covers: string[] = [];
      for (const o of scene.edges) {
        if (real(o.labelBox) && hit(o.labelBox)) covers.push(`label of ${o.id}`);
        if (real(o.stepBox) && hit(o.stepBox)) covers.push(`step of ${o.id}`);
      }
      for (const ch of chips) if (hit(ch.box)) covers.push(`header of ${ch.id}`);
      for (const n of scene.nodes) {
        const parts: [string, Box | undefined][] = [
          ["label", n.labelBox],
          ["note", n.noteBox],
          ["badge", badgeRect(n)],
        ];
        // The head may touch the node it points at, never another one.
        if (n.id !== h.target) parts.push(["node", n.iconBox ?? n.box]);
        for (const [what, b] of parts) if (real(b) && hit(b)) covers.push(`${what} of ${n.id}`);
      }
      if (covers.length) {
        hidden++;
        add(
          "flow.head-hidden",
          "major",
          [e.id, h.target],
          { edge: edgeName(e), end: h.at, under: covers.join(", ") },
          `the arrowhead of ${edgeName(e)} at "${h.target}" sits under the ${covers.join(", ")}`,
          [
            `move "${h.target}" earlier or later in the nodes list`,
            "shorten the covering label or badge",
          ],
          10,
        );
      }
      if (L < len - EPS) {
        onBend++;
        add(
          "flow.head-on-bend",
          "minor",
          [e.id],
          { edge: edgeName(e), lastRunPx: r1(L), headPx: len },
          `the last straight run of ${edgeName(e)} is ${r1(L)}px, shorter than its ${len}px arrowhead`,
          ["use layout: { spacing: loose }", `reorder so "${h.target}" lines up with its source`],
          3,
        );
      }
    }
    // Ends that stop short of a narrow glyph: the iconBox is square, the artwork is not.
    if (horizontal) {
      for (const [id, p] of [
        [e.from, first],
        [e.to, last],
      ] as const) {
        const n = c.nodes.get(id);
        if (!n || !p || n.look !== "icon" || !n.icon || !n.iconBox) continue;
        const aspect = iconAspect(n.icon);
        if (!aspect || aspect >= 0.98) continue;
        const ib = n.iconBox;
        const onSide =
          (Math.abs(p.x - ib.x) < 1.5 || Math.abs(p.x - (ib.x + ib.w)) < 1.5) &&
          p.y >= ib.y - EPS &&
          p.y <= ib.y + ib.h + EPS;
        const gap = (ib.w - ib.h * aspect) / 2;
        if (onSide && gap > 1.5) {
          short++;
          add(
            "flow.arrow-short",
            "minor",
            [e.id, id],
            { edge: edgeName(e), node: id, gapPx: r1(gap), aspect: r2(aspect) },
            `${edgeName(e)} stops ${r1(gap)}px short of the "${n.icon}" glyph`,
            [`use a square icon for "${id}"`, "use look: card for that node"],
            2,
          );
        }
      }
    }
  }

  // Unrelated edges on one line (layout lane: collinear overlap, no shared endpoint).
  let trunks = 0;
  const E = scene.edges;
  for (let i = 0; i < E.length; i++)
    for (let j = i + 1; j < E.length; j++) {
      const a = E[i];
      const b = E[j];
      if (!a || !b) continue;
      if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;
      let olap = 0;
      for (const [p, q] of segments(a.points))
        for (const [u, v] of segments(b.points)) {
          const ah = Math.abs(p.y - q.y) < EPS;
          const av = Math.abs(p.x - q.x) < EPS;
          const bh = Math.abs(u.y - v.y) < EPS;
          const bv = Math.abs(u.x - v.x) < EPS;
          if (ah && bh && Math.abs(p.y - u.y) < 1.5)
            olap += Math.max(
              0,
              Math.min(Math.max(p.x, q.x), Math.max(u.x, v.x)) -
                Math.max(Math.min(p.x, q.x), Math.min(u.x, v.x)),
            );
          else if (av && bv && Math.abs(p.x - u.x) < 1.5)
            olap += Math.max(
              0,
              Math.min(Math.max(p.y, q.y), Math.max(u.y, v.y)) -
                Math.max(Math.min(p.y, q.y), Math.min(u.y, v.y)),
            );
        }
      if (olap > 10) {
        trunks++;
        add(
          "flow.shared-trunk",
          olap > 40 ? "major" : "minor",
          [a.id, b.id],
          { a: edgeName(a), b: edgeName(b), sharedPx: r1(olap) },
          `${edgeName(a)} and ${edgeName(b)} share ${r1(olap)}px of line, so readers cannot tell them apart`,
          [
            "reorder nodes so the two edges take different channels",
            "use layout: { merge: false }",
            "use layout: { spacing: loose }",
          ],
          8,
        );
      }
    }

  // Steps: numbering, and order along the picture (AWS deck slide 18).
  const stepped = scene.edges
    .filter((e) => e.step !== undefined)
    .map((e) => {
      const at = real(e.stepBox)
        ? { x: e.stepBox.x + e.stepBox.w / 2, y: e.stepBox.y + e.stepBox.h / 2 }
        : midpoint(e.points);
      return { e, step: e.step as number, at };
    })
    .sort((a, b) => a.step - b.step);
  let inversions = 0;
  if (stepped.length >= 2) {
    const nums = [...new Set(stepped.map((x) => x.step))];
    const gaps = nums.filter((n, i) => n !== i + 1);
    if (gaps.length) {
      add(
        "flow.step-numbering",
        "minor",
        stepped.map((x) => x.e.id),
        { steps: nums.join(",") },
        `step numbers ${nums.join(", ")} do not run 1 to ${nums.length}`,
        ["renumber the steps from 1 without gaps"],
        4,
      );
    }
    // Same-numbered steps are parallel; compare one representative per number.
    const reps = nums.map((n) => {
      const same = stepped.filter((x) => x.step === n);
      return {
        step: n,
        ids: same.map((x) => x.e.id),
        x: same.reduce((s, x) => s + x.at.x, 0) / same.length,
        y: same.reduce((s, x) => s + x.at.y, 0) / same.length,
      };
    });
    const tol = 24;
    const linearBad: string[] = [];
    for (let i = 1; i < reps.length; i++) {
      const p = reps[i - 1];
      const q = reps[i];
      if (!p || !q) continue;
      const d = along(dir, q.x - p.x, q.y - p.y);
      const cross = horizontal ? q.y - p.y : q.x - p.x;
      // Back along the flow is fine when it starts a new row below (reading order wraps).
      if (d < -tol && !(cross > tol && Math.abs(cross) > Math.abs(d) / 2))
        linearBad.push(`${p.step}->${q.step}`);
    }
    let clockBad = linearBad;
    // AWS-14 is a walkthrough over an architecture; a flow's own lines already give its order.
    if (model.kind !== "architecture") clockBad = [];
    else if (reps.length >= 3) {
      const cx = reps.reduce((s, r) => s + r.x, 0) / reps.length;
      const cy = reps.reduce((s, r) => s + r.y, 0) / reps.length;
      const angle = (r: { x: number; y: number }) => Math.atan2(r.y - cy, r.x - cx);
      const bad: string[] = [];
      for (let i = 1; i < reps.length; i++) {
        const p = reps[i - 1];
        const q = reps[i];
        if (!p || !q) continue;
        let d = angle(q) - angle(p);
        while (d <= -Math.PI) d += 2 * Math.PI;
        while (d > Math.PI) d -= 2 * Math.PI;
        if (d < -0.05) bad.push(`${p.step}->${q.step}`);
      }
      if (bad.length < clockBad.length) clockBad = bad;
    }
    inversions = clockBad.length;
    if (inversions) {
      add(
        "flow.step-order",
        inversions > 1 ? "major" : "minor",
        reps.flatMap((r) => r.ids),
        { inversions, jumps: clockBad.join(" "), direction: dir },
        `step numbers jump against reading order at ${clockBad.join(", ")}`,
        [
          "renumber the steps in the order they appear left to right, top to bottom or clockwise",
          "reorder the nodes so the walkthrough runs with the direction",
        ],
        8,
      );
    }
  }

  // Arrow semantics (Azure Well-Architected: always use arrows, avoid bidirectional ones).
  const both = scene.edges.filter((e) => e.arrow === "both");
  // A plain line is meant when the legend explains its style (the rule's own fix), when it is a
  // BPMN association, or when the notation draws no heads (tree and mind map connectors).
  const keyed = new Set((model.legend ?? []).map((l) => l.line));
  const plain = (e: SceneEdge) =>
    model.kind === "tree" ||
    model.kind === "mindmap" ||
    e.flow === "association" ||
    keyed.has(e.line);
  const none = scene.edges.filter((e) => e.arrow === "none" && !plain(e));
  for (const e of both)
    add(
      "flow.bidirectional",
      "minor",
      [e.id],
      { edge: edgeName(e) },
      `${edgeName(e)} has two heads, so it does not say who initiates`,
      [
        `split it into ${edgeName(e)} and ${e.to} -> ${e.from} with their own labels`,
        `keep one direction (${edgeName(e)}) from the caller to the dependency`,
      ],
      3,
    );
  for (const e of none)
    add(
      "flow.undirected",
      "minor",
      [e.id],
      { edge: edgeName(e) },
      `${edgeName(e)} has no arrowhead`,
      [`give it a direction (${edgeName(e)}) or explain the plain line in the legend`],
      3,
    );

  // Unlabelled edges that cross a group boundary. A pool or lane says who does the work, and a
  // journey row what kind of step it is: neither is a boundary crossed by some mechanism.
  const bands = new Set(
    model.groups.filter((g) => g.type === "lane" || g.type === "pool").map((g) => g.id),
  );
  const chain = (id: string) => {
    const out = new Set<string>();
    for (let p = c.parentOf(id); p; p = c.parentOf(p)) if (!bands.has(p)) out.add(p);
    return out;
  };
  const crossing = model.edges.filter((e) => {
    if (e.label || model.kind === "journey") return false;
    const a = chain(e.from);
    const b = chain(e.to);
    if (a.has(e.to) || b.has(e.from)) return false;
    return [...a].some((g) => !b.has(g)) || [...b].some((g) => !a.has(g));
  });
  if (crossing.length) {
    add(
      "flow.unlabelled-boundary",
      "minor",
      crossing.map((e) => e.id),
      { count: crossing.length, edges: crossing.map(edgeName).slice(0, 6).join("; ") },
      `${crossing.length} unlabelled edge(s) cross a group boundary; the mechanism is left to guess`,
      ["label the edge with the protocol or action (HTTPS, VPC peering, PrivateLink)"],
      Math.min(10, 2 * crossing.length),
    );
  }

  // DG208 comes from check.ts.
  const unconnected = diagnostics.filter((d) => d.code === "DG208");
  for (const d of unconnected) {
    const node = String(d.subject?.node ?? "");
    add("flow.unconnected", "minor", node ? [node] : [], { node }, d.message, d.fixes ?? [], 3);
  }

  // Edge budget (aws-archify SKILL.md: "Budget arrows at or below the node count"): more edges than
  // nodes means the picture is trying to show a call sequence. Architecture only: a state machine or
  // a process has more transitions than steps by nature.
  const nodeCount = model.nodes.length;
  const edgeCount = model.edges.length;
  if (model.kind === "architecture" && edgeCount > nodeCount)
    add(
      "flow.edge-budget",
      "minor",
      [],
      { edges: edgeCount, nodes: nodeCount },
      `${edgeCount} edges for ${nodeCount} nodes: more arrows than nodes reads as a call sequence`,
      [
        "draw one edge to a group instead of parallel edges to its members",
        "drop reply, echo and cross-cutting edges: the layout already says them",
        "split into an overview and a detail diagram",
      ],
      3,
    );

  // Cross-cutting services (aws-archify SKILL.md): an arrow from every node to the logs or the key
  // service says nothing and crosses everything; a shared services group with no arrows says it once.
  // Three feeds or fewer may stay as named edges, so the finding starts at four. Feeds from the
  // service's own family (GuardDuty into Security Hub) are the diagram's subject, not a cross-cut.
  const familyOf = (id: string) => {
    const n = model.nodes.find((x) => x.id === id);
    return n?.icon ? iconInfo(n.icon)?.category : undefined;
  };
  const fanIn = model.nodes.flatMap((n) => {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    if (!info || !CROSS_CUTTING[info.pack]?.test(info.name)) return [];
    const into = model.edges.filter(
      (e) => travel(e)[1] === n.id && familyOf(travel(e)[0]) !== info.category,
    );
    return into.length >= 4 ? [{ n, into }] : [];
  });
  const [hub] = fanIn;
  if (hub) {
    const taken = new Set([...model.groups.map((g) => g.id), ...model.nodes.map((n) => n.id)]);
    let gid = "shared-services";
    for (let k = 2; taken.has(gid); k++) gid = `shared-services-${k}`;
    const aws = iconInfo(hub.n.icon ?? "")?.pack === "aws";
    const patches: PatchOp[] = [
      {
        op: "add",
        path: `groups.${gid}`,
        value: {
          type: aws ? "aws:generic" : "box",
          label: "Shared services",
          ...(hub.n.parent ? { in: hub.n.parent } : {}),
        },
      },
      ...fanIn.map(({ n }): PatchOp => ({ op: "set", path: `nodes.${n.id}.in`, value: gid })),
      ...fanIn.flatMap(({ into }) =>
        into.map((e): PatchOp => ({ op: "edge", match: edgeName(e), value: null })),
      ),
    ];
    const names = fanIn.map(({ n, into }) => `"${n.id}" (${into.length} edges in)`).join(", ");
    add(
      "flow.cross-cutting",
      "minor",
      [...fanIn.map(({ n }) => n.id), ...fanIn.flatMap(({ into }) => into.map((e) => e.id))],
      {
        services: fanIn.map(({ n }) => n.id).join(","),
        edgesIn: fanIn.reduce((s, { into }) => s + into.length, 0),
      },
      `${names}: edges from every node into a cross-cutting service say nothing and cross the picture`,
      [
        `put ${fanIn.map(({ n }) => `"${n.id}"`).join(", ")} in a group labelled Shared services with no edges to it`,
        "keep at most three edges, dashed and labelled (logs, metrics), when the brief names the relation",
      ],
      4 * fanIn.length,
      patches,
    );
  }

  Object.assign(m, {
    hiddenHeads: hidden,
    headsOnBends: onBend,
    shortEnds: short,
    sharedTrunks: trunks,
    steps: stepped.length,
    stepInversions: inversions,
    bidirectional: both.length,
    undirected: none.length,
    unlabelledCrossings: crossing.length,
    unconnected: unconnected.length,
    edgesPerNode: r2(edgeCount / Math.max(1, nodeCount)),
    crossCutting: fanIn.length,
  });
  c.hard.overlaps += hidden;
}

function measureLayout(c: Ctx, diagnostics: Diagnostic[]): void {
  const { scene, model, add, dir } = c;
  const m = c.metrics.layout;
  const W = scene.width;
  const H = scene.height;
  const edges = scene.edges;

  // Direction agreement: which way the arrowheads point along the flow.
  let forward = 0;
  const against: SceneEdge[] = [];
  for (const e of edges) {
    const a = e.points[0];
    const b = e.points.at(-1);
    if (!a || !b) continue;
    const p = along(dir, b.x - a.x, b.y - a.y);
    if (p > 8) forward++;
    // arrow: start keeps layout order and flips the head on purpose (spec.md), so it is not counted.
    if (e.arrow === "end" && p < -8) against.push(e);
  }
  // A state machine returns to earlier states and a mind map grows both ways: heads point back by
  // design there, so the count stays a metric only.
  if (against.length && model.kind !== "state" && model.kind !== "mindmap") {
    const share = against.length / Math.max(1, edges.length);
    add(
      "layout.against-flow",
      share > 0.25 ? "major" : "minor",
      against.map((e) => e.id),
      {
        count: against.length,
        sharePct: r1(100 * share),
        direction: dir,
        edges: against.map(edgeName).slice(0, 6).join("; "),
      },
      `${against.length} of ${edges.length} arrowheads point against direction: ${dir}`,
      [
        "list nodes in the order data moves, so the target comes after its source",
        "write the edge the way data flows and use <- or arrow: start only for replies",
        "change direction",
      ],
      6 * against.length,
    );
  }

  // Crossings and edge lengths (layout lane metrics).
  let crossings = 0;
  const crossingPairs: string[] = [];
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const A = edges[i];
      const B = edges[j];
      if (!A || !B) continue;
      let n = 0;
      for (const [p, q] of segments(A.points))
        for (const [s, t] of segments(B.points)) {
          const rx = q.x - p.x;
          const ry = q.y - p.y;
          const sx = t.x - s.x;
          const sy = t.y - s.y;
          const den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-9) continue;
          const tt = ((s.x - p.x) * sy - (s.y - p.y) * sx) / den;
          const uu = ((s.x - p.x) * ry - (s.y - p.y) * rx) / den;
          const e1 = 1.5 / (Math.hypot(rx, ry) || 1);
          const e2 = 1.5 / (Math.hypot(sx, sy) || 1);
          if (tt > e1 && tt < 1 - e1 && uu > e2 && uu < 1 - e2) n++;
        }
      if (n) {
        crossings += n;
        crossingPairs.push(`${A.id}x${B.id}`);
      }
    }
  if (crossings) {
    add(
      "layout.crossings",
      crossings > Math.max(3, edges.length / 4) ? "major" : "minor",
      [...new Set(crossingPairs.flatMap((p) => p.split("x")))],
      { crossings, pairs: crossingPairs.slice(0, 8).join(" ") },
      `${crossings} edge crossing(s)`,
      [
        "reorder nodes inside their group so connected nodes sit side by side",
        "try layout: { layering: simplex }",
        "split a hub with many edges into two nodes",
      ],
      3 * crossings,
    );
  }
  const lens = edges.map((e) => ({ e, len: pathLen(e.points) }));
  const sorted = lens.map((l) => l.len).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length
    ? sorted.length % 2
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : 0;
  const long = lens.filter((l) => l.len > 2.5 * median && l.len > 300);
  for (const l of long)
    add(
      "layout.long-edge",
      "minor",
      [l.e.id],
      { edge: edgeName(l.e), lengthPx: Math.round(l.len), medianPx: Math.round(median) },
      `${edgeName(l.e)} is ${Math.round(l.len)}px, ${r1(l.len / (median || 1))}x the median edge`,
      [`move "${l.e.from}" or "${l.e.to}" next to the other in the nodes list`],
      3,
    );

  // Largest empty rectangle inside the content, on an 8px grid.
  const ink = [
    ...scene.nodes.map((n) => c.foot.get(n.id)),
    ...edges.flatMap((e) => [e.labelBox, e.stepBox]),
    ...scene.groups.flatMap((g) => [g.labelBox, g.iconBox]),
    scene.titleBox,
    scene.subtitleBox,
    scene.legend?.box,
  ].filter(real);
  const edgeBoxes = edges.map((e) => {
    const xs = e.points.map((p) => p.x);
    const ys = e.points.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs) || 1,
      h: Math.max(...ys) - Math.min(...ys) || 1,
    };
  });
  const content = union([...ink, ...scene.groups.map((g) => g.box), ...edgeBoxes]) ?? {
    x: 0,
    y: 0,
    w: W,
    h: H,
  };
  const C = 8;
  const cols = Math.ceil(W / C);
  const rows = Math.ceil(H / C);
  const grid = new Uint8Array(cols * rows);
  const paint = (b: Box) => {
    for (
      let r = Math.max(0, Math.floor(b.y / C));
      r < Math.min(rows, Math.ceil((b.y + b.h) / C));
      r++
    )
      for (
        let k = Math.max(0, Math.floor(b.x / C));
        k < Math.min(cols, Math.ceil((b.x + b.w) / C));
        k++
      )
        grid[r * cols + k] = 1;
  };
  for (const b of ink) paint(b);
  for (const e of edges)
    for (const [s, t] of segments(e.points))
      paint({
        x: Math.min(s.x, t.x) - 2,
        y: Math.min(s.y, t.y) - 2,
        w: Math.abs(t.x - s.x) + 4,
        h: Math.abs(t.y - s.y) + 4,
      });
  const c0 = Math.max(0, Math.floor(content.x / C));
  const c1 = Math.min(cols, Math.ceil((content.x + content.w) / C));
  const row0 = Math.max(0, Math.floor(content.y / C));
  const row1 = Math.min(rows, Math.ceil((content.y + content.h) / C));
  const hist = new Array<number>(cols + 1).fill(0);
  let hole = { area: 0, x: 0, y: 0, w: 0, h: 0 };
  for (let r = row0; r < row1; r++) {
    for (let k = c0; k < c1; k++) hist[k] = grid[r * cols + k] ? 0 : (hist[k] ?? 0) + 1;
    const stack: [number, number][] = [];
    for (let k = c0; k <= c1; k++) {
      const h = k < c1 ? (hist[k] ?? 0) : 0;
      let start = k;
      while (stack.length && (stack.at(-1)?.[1] ?? 0) >= h) {
        const [sc, sh] = stack.pop() as [number, number];
        const area = sh * (k - sc);
        if (area > hole.area)
          hole = { area, x: sc * C, y: (r - sh + 1) * C, w: (k - sc) * C, h: sh * C };
        start = sc;
      }
      stack.push([start, h]);
    }
  }
  const holePct = (100 * hole.w * hole.h) / Math.max(1, W * H);
  // A thin band between rows is spacing, not a hole a reader notices.
  if (holePct > 22 && Math.min(hole.w, hole.h) >= 80) {
    const inside = scene.groups
      .filter((g) => !g.overlay && interArea(g.box, hole) > 0.9 * hole.w * hole.h)
      .sort((a, b) => b.depth - a.depth)[0];
    add(
      "layout.empty-space",
      holePct > 32 ? "major" : "minor",
      inside ? [inside.id] : [],
      { holePct: r1(holePct), x: hole.x, y: hole.y, w: hole.w, h: hole.h },
      `an empty ${hole.w}x${hole.h}px rectangle covers ${r1(holePct)}% of the canvas`,
      [
        "change direction so the long chain wraps",
        "move a side branch next to the empty area in the nodes list",
        "split the diagram",
      ],
      Math.max(0, holePct - 18) * 1.5,
    );
  }

  // Proportions.
  const aspect = W / Math.max(1, H);
  const tall = H / Math.max(1, W);
  if (aspect > 3 || tall > 2.5) {
    const wide = aspect > 3;
    const ratio = wide ? aspect : tall;
    const strip = ratio > 4.5 && scene.nodes.length > 6;
    add(
      "layout.aspect",
      strip ? "major" : "minor",
      [],
      { aspect: r2(aspect), width: W, height: H },
      `the canvas is ${r1(ratio)}:1 ${wide ? "wide" : "tall"} (${W}x${H}px)`,
      wide
        ? ["use direction: down for long chains", "group stages into zones"]
        : ["use direction: right", "put independent tiers side by side"],
      (ratio - (wide ? 3 : 2.5)) * 10,
    );
  }
  if (W > 2400)
    add(
      "layout.too-wide",
      "major",
      [],
      { width: W },
      `the canvas is ${W}px wide (over 2400px)`,
      ["use direction: down", "group related nodes", "split into two diagrams"],
      15,
    );
  if (scene.layoutFallback)
    add(
      "layout.fallback",
      "minor",
      [],
      { strategy: scene.layoutFallback },
      `ELK needed the fallback strategy "${scene.layoutFallback}", so spec order may not be kept`,
      ["reorder or regroup nodes and render again", "try layout: { layering: simplex }"],
      5,
    );
  for (const d of diagnostics.filter((x) => x.code === "DG207")) {
    const group = String(d.subject?.group ?? "");
    add(
      "layout.empty-group",
      "minor",
      group ? [group] : [],
      { group },
      d.message,
      d.fixes ?? [],
      5,
    );
  }
  const ignored = diagnostics.filter((x) => x.code === "DG219");
  for (const d of ignored) {
    const setting = String(d.subject?.setting ?? "");
    const [kind, id] = (["node", "group", "edge", "layout"] as const)
      .map((k) => [k, d.subject?.[k]] as const)
      .find(([, v]) => typeof v === "string") ?? ["layout", ""];
    const path =
      kind === "node"
        ? `nodes.${id}.${setting}`
        : kind === "group"
          ? `groups.${id}.${setting}`
          : kind === "layout"
            ? setting
            : undefined;
    add(
      "layout.ignored",
      "minor",
      kind === "layout" ? [] : [String(id)],
      { setting, reason: String(d.evidence?.reason ?? "") },
      d.message,
      d.fixes ?? [],
      3,
      path ? [{ op: "unset", path }] : undefined,
    );
  }

  // Spec order kept (metric only: readers never see the spec).
  const cross = horizontalFlow(dir) ? "y" : "x";
  let pairs = 0;
  let inOrder = 0;
  const parents = [undefined, ...model.groups.filter((g) => !g.around).map((g) => g.id)];
  for (const P of parents) {
    const kids = [
      ...model.groups
        .filter((g) => !g.around && g.parent === P)
        .map((g) => ({ kind: "g", box: c.groups.get(g.id)?.box })),
      ...model.nodes
        .filter((n) => n.parent === P)
        .map((n) => ({ kind: "n", box: c.nodes.get(n.id)?.box })),
    ].filter((k): k is { kind: string; box: Box } => !!k.box);
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i];
        const b = kids[j];
        if (!a || !b || a.kind !== b.kind) continue;
        const ca = cross === "y" ? a.box.y + a.box.h / 2 : a.box.x + a.box.w / 2;
        const cb = cross === "y" ? b.box.y + b.box.h / 2 : b.box.x + b.box.w / 2;
        if (Math.abs(ca - cb) < 1) continue;
        const pa = cross === "y" ? [a.box.x, a.box.x + a.box.w] : [a.box.y, a.box.y + a.box.h];
        const pb = cross === "y" ? [b.box.x, b.box.x + b.box.w] : [b.box.y, b.box.y + b.box.h];
        const ov = Math.min(pa[1] ?? 0, pb[1] ?? 0) - Math.max(pa[0] ?? 0, pb[0] ?? 0);
        const span = Math.min((pa[1] ?? 0) - (pa[0] ?? 0), (pb[1] ?? 0) - (pb[0] ?? 0));
        if (ov < 0.5 * span) continue;
        pairs++;
        if (ca < cb) inOrder++;
      }
  }

  Object.assign(m, {
    forwardPct: r1((100 * forward) / Math.max(1, edges.length)),
    againstFlow: against.length,
    crossings,
    holePct: r1(holePct),
    aspect: r2(aspect),
    longEdges: long.length,
    edgeMedianPx: Math.round(median),
    edgeMaxPx: Math.round(Math.max(0, ...lens.map((l) => l.len))),
    specOrderPct: pairs ? r1((100 * inOrder) / pairs) : 100,
    fallback: scene.layoutFallback ?? "none",
    ignoredSettings: ignored.length,
  });
}

function measureGrid(c: Ctx): void {
  const { scene, add } = c;
  const m = c.metrics.grid;
  const horizontal = horizontalFlow(scene.direction);
  const F = horizontal ? "x" : "y";
  const FW = horizontal ? "w" : "h";
  const frames = scene.groups.filter((g) => !g.overlay);

  // Layers per parent: items whose flow-axis extents overlap (grid lane).
  let ragged = 0;
  const gaps: number[] = [];
  for (const P of new Set<string | undefined>([undefined, ...frames.map((g) => g.id)])) {
    const items = [
      ...scene.nodes
        .filter((n) => n.parent === P)
        .map((n) => ({ id: n.id, box: n.box, v: c.foot.get(n.id) ?? n.box })),
      ...frames.filter((g) => g.parent === P).map((g) => ({ id: g.id, box: g.box, v: g.box })),
    ].sort((a, b) => a.box[F] - b.box[F]);
    const layers: { items: typeof items; end: number }[] = [];
    for (const it of items) {
      const L = layers.at(-1);
      if (L && it.box[F] < L.end - 0.01) {
        L.items.push(it);
        L.end = Math.max(L.end, it.box[F] + it.box[FW]);
      } else layers.push({ items: [it], end: it.box[F] + it.box[FW] });
    }
    for (const L of layers) {
      if (L.items.length < 2) continue;
      const spread = (f: (i: (typeof items)[number]) => number) =>
        Math.max(...L.items.map(f)) - Math.min(...L.items.map(f));
      const st = spread((i) => i.v[F]);
      const ce = spread((i) => i.v[F] + i.v[FW] / 2);
      const en = spread((i) => i.v[F] + i.v[FW]);
      if (Math.min(st, ce, en) > 2) {
        ragged++;
        add(
          "grid.ragged",
          "minor",
          L.items.map((i) => i.id),
          { startPx: r1(st), centerPx: r1(ce), endPx: r1(en), parent: P ?? "(root)" },
          `${L.items.map((i) => `"${i.id}"`).join(", ")} share no start, center or end line (best ${r1(Math.min(st, ce, en))}px off)`,
          ["give the items in this layer the same look and similar label lengths"],
          4,
        );
      }
    }
    for (let i = 1; i < layers.length; i++) {
      const prev = layers[i - 1];
      const next = layers[i];
      if (!prev || !next) continue;
      const end = Math.max(...prev.items.map((it) => it.v[F] + it.v[FW]));
      const start = Math.min(...next.items.map((it) => it.v[F]));
      gaps.push(start - end);
    }
  }

  // Tiny jogs: interior runs under 6px.
  let jogs = 0;
  for (const e of scene.edges) {
    const pts = simplify(e.points);
    for (let i = 1; i < pts.length - 2; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > 0.01 && len < 6) {
        jogs++;
        add(
          "grid.jog",
          "minor",
          [e.id],
          { edge: edgeName(e), jogPx: r2(len), x: r1(a.x), y: r1(a.y) },
          `${edgeName(e)} steps ${r2(len)}px sideways where it could run straight`,
          [`give "${e.from}" and "${e.to}" the same look and size`, "use layout: { merge: false }"],
          3,
        );
      }
    }
  }

  // Content centering inside groups. A pool or lane runs the whole length of the process, so its
  // steps sit where they happen in time, not centered.
  let offCenter = 0;
  for (const g of frames) {
    if (g.lane) continue;
    const kids = [
      ...scene.nodes.filter((n) => n.parent === g.id).map((n) => c.foot.get(n.id)),
      ...frames.filter((x) => x.parent === g.id).map((x) => x.box),
    ];
    const u = union(kids);
    if (!u) continue;
    const left = u.x - g.box.x;
    const right = g.box.x + g.box.w - (u.x + u.w);
    if (Math.abs(left - right) > 6) {
      offCenter++;
      add(
        "grid.off-center",
        "minor",
        [g.id],
        { leftPx: r1(left), rightPx: r1(right) },
        `the content of "${g.id}" sits ${r1(Math.abs(left - right) / 2)}px off center (left ${r1(left)}, right ${r1(right)})`,
        [`shorten the label of "${g.id}" so it does not widen the frame`],
        3,
      );
    }
  }

  // Gap spread between layers.
  const mean = gaps.reduce((s, v) => s + v, 0) / Math.max(1, gaps.length);
  const sd = Math.sqrt(gaps.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, gaps.length));
  const cv = mean > 0 ? sd / mean : 0;
  if (gaps.length >= 3 && cv > 0.35) {
    add(
      "grid.uneven-gaps",
      "minor",
      [],
      {
        gapCv: r2(cv),
        gapMinPx: r1(Math.min(...gaps)),
        gapMaxPx: r1(Math.max(...gaps)),
        layers: gaps.length + 1,
      },
      `gaps between layers range from ${r1(Math.min(...gaps))} to ${r1(Math.max(...gaps))}px (spread ${r2(cv)})`,
      ["shorten the longest edge labels; a labelled edge widens its gap"],
      (cv - 0.35) * 40,
    );
  }

  Object.assign(m, {
    raggedLayers: ragged,
    jogs,
    offCenterGroups: offCenter,
    gapCv: r2(cv),
    gapMinPx: gaps.length ? r1(Math.min(...gaps)) : 0,
    gapMaxPx: gaps.length ? r1(Math.max(...gaps)) : 0,
  });
}

interface Run {
  axis: "h" | "v";
  len: number;
  sign: number;
}

/** An edge's straight runs, or undefined when one is neither horizontal nor vertical. */
function orthogonalRuns(points: Point[]): Run[] | undefined {
  const out: Run[] = [];
  for (const [p, q] of segments(simplify(points))) {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    if (Math.abs(dy) < EPS) out.push({ axis: "h", len: Math.abs(dx), sign: Math.sign(dx) });
    else if (Math.abs(dx) < EPS) out.push({ axis: "v", len: Math.abs(dy), sign: Math.sign(dy) });
    else return undefined;
  }
  return out;
}

/** Group types that stand for no boundary: their contents differ by design (aws-archify check 10). */
const TIER_GROUPS = new Set([
  "box",
  "dashed",
  "zone",
  "boundary",
  "on-prem",
  "internet",
  "pool",
  "lane",
  "aws:generic",
  "aws:generic-dashed",
  "gcp:tier",
  "gcp:optional",
  "gcp:external",
  "gcp:users",
  "azure:service-group",
  "azure:optional",
  "c4:boundary",
]);

/**
 * Composition checks ported from the aws-archify skill's check-layout.ts (checks 6, 10, 11, 14,
 * 14b; MIT-0). Its thresholds are canvas px at 1x and stay canvas px here: they say how far layout
 * put two ends out of line, or how loosely a frame fits, in the units layout works in (an orrery
 * icon is 48px, as is the sample's tile). A narrower column shrinks the defect and the room to fix
 * it alike, so the display width does not change the verdict; the ratios are unitless anyway.
 */
function measureComposition(c: Ctx): void {
  const { scene, model, add } = c;
  const W = scene.width;
  // A journey's grid places every step, so nothing here is the author's to fix.
  if (model.kind === "journey") {
    Object.assign(c.metrics.grid, { zigZags: 0, avoidableBends: 0, unevenSiblings: 0, padding: 0 });
    Object.assign(c.metrics.layout, { sparseGroups: 0, besideGroup: 0 });
    return;
  }

  // Zig-zags and avoidable bends (checks 14, 14b): a one-to-one edge bends only because its ends
  // are out of line. A fan out or in cannot line up with every end, an end on a group is routed to
  // the frame, and a pool or lane fixes each end's row, so those bend by necessity.
  const outs = new Map<string, number>();
  const ins = new Map<string, number>();
  for (const e of scene.edges) {
    outs.set(e.from, (outs.get(e.from) ?? 0) + 1);
    ins.set(e.to, (ins.get(e.to) ?? 0) + 1);
  }
  const band = (id: string) => {
    for (let p = c.parentOf(id); p; p = c.parentOf(p)) if (c.groups.get(p)?.lane) return p;
    return undefined;
  };
  const horizontal = horizontalFlow(scene.direction);
  let zigs = 0;
  let bends = 0;
  for (const e of scene.edges) {
    if (!c.nodes.has(e.from) || !c.nodes.has(e.to)) continue;
    if (outs.get(e.from) !== 1 || ins.get(e.to) !== 1 || band(e.from) !== band(e.to)) continue;
    const runs = orthogonalRuns(e.points);
    if (!runs) continue;
    const [a, m, b] = runs;
    const zig =
      runs.length === 3 && a && m && b && a.axis === b.axis && a.sign === b.sign
        ? m.len
        : undefined;
    const leg = runs.length === 2 && a && m ? Math.min(a.len, m.len) : undefined;
    if (zig === undefined && leg === undefined) continue;
    // In a horizontal flow the ends share a row when they line up; in a vertical one, a column.
    const line = horizontal ? "row" : "column";
    const fixes = [
      `put "${e.from}" and "${e.to}" in one ${line}: give them the same look and similar label lengths`,
      `move "${e.to}" right after "${e.from}" in the nodes list`,
      ...(c.parentOf(e.from) !== c.parentOf(e.to)
        ? [`put "${e.from}" and "${e.to}" in the same group`]
        : []),
    ];
    const patches: PatchOp[] = [{ op: "move", path: `nodes.${e.to}`, after: e.from }];
    if (zig !== undefined && zig >= 12 && zig <= 180) {
      zigs++;
      add(
        "grid.zig-zag",
        "minor",
        [e.id, e.from, e.to],
        { edge: edgeName(e), stepPx: r1(zig), runs: 3 },
        `${edgeName(e)} steps ${r1(zig)}px ${m?.axis === "v" ? "up or down" : "sideways"} between two parallel runs, so its ends are out of line`,
        fixes,
        3,
        patches,
      );
    } else if (leg !== undefined && leg <= 240) {
      bends++;
      add(
        "grid.avoidable-bend",
        "minor",
        [e.id, e.from, e.to],
        { edge: edgeName(e), legPx: r1(leg), runs: 2 },
        `${edgeName(e)} turns once with a ${r1(leg)}px leg, so its ends are out of line`,
        fixes,
        3,
        patches,
      );
    }
  }

  // A node beside a group (check 6): partly level with a frame it is outside, so the eye reads the
  // two as one row of peers. A node whose whole height sits in the frame's band is aligned with it on
  // purpose; a node inside another frame is that frame's peer, not this one's.
  const frames = scene.groups.filter((g) => !g.overlay && !g.lane);
  let beside = 0;
  for (const n of scene.nodes) {
    const f = c.foot.get(n.id) ?? n.box;
    const hits: { g: SceneGroup; share: number; frac: number }[] = [];
    for (const g of frames) {
      const b = g.box;
      if (c.isDescendant(n.id, g.id) || b.w >= 0.85 * W || b.w <= 160 || b.h <= 80) continue;
      if (n.parent && !c.isDescendant(g.id, n.parent)) continue;
      if (f.x + f.w > b.x && f.x < b.x + b.w) continue;
      const share = Math.min(f.y + f.h, b.y + b.h) - Math.max(f.y, b.y);
      const frac = share / Math.max(1, f.h);
      if (frac > 0.2 && frac < 0.8) hits.push({ g, share, frac });
    }
    // Report the outermost frame: the ones inside it repeat the same misalignment.
    const hit = hits.sort((x, y) => x.g.depth - y.g.depth)[0];
    if (!hit) continue;
    beside++;
    add(
      "layout.beside-group",
      "minor",
      [n.id, hit.g.id],
      { node: n.id, group: hit.g.id, sharedPx: r1(hit.share), sharePct: r1(100 * hit.frac) },
      `"${n.id}" sits beside group "${hit.g.id}" sharing ${r1(100 * hit.frac)}% of its height, so they read as one row of peers but "${n.id}" is outside it`,
      [
        `put "${n.id}" in "${hit.g.id}" (in: ${hit.g.id}) if it belongs there`,
        `move "${n.id}" in the nodes list so it sits level with the whole of "${hit.g.id}" or clear of it`,
      ],
      3,
    );
  }

  // Same-kind siblings, one size (check 10): boxes of one boundary type under one parent share a
  // height in a row and a width in a column. Nearly equal reads as a mistake, clearly different as
  // intended; two with the same role (Zone A and Zone B) must match either way.
  const role = (g: SceneGroup) =>
    g.label.lines
      .join(" ")
      .replace(/\b[A-Za-z0-9]\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  let siblings = 0;
  const typed = frames.filter((g) => g.type.includes(":") && !TIER_GROUPS.has(g.type));
  for (let i = 0; i < typed.length; i++)
    for (let j = i + 1; j < typed.length; j++) {
      const p = typed[i];
      const q = typed[j];
      if (!p || !q || p.type !== q.type || p.parent !== q.parent) continue;
      const same = role(p) === role(q);
      const row = p.box.y < q.box.y + q.box.h && q.box.y < p.box.y + p.box.h;
      const col = p.box.x < q.box.x + q.box.w && q.box.x < p.box.x + p.box.w;
      const dw = Math.abs(p.box.w - q.box.w) / Math.max(p.box.w, q.box.w);
      const dh = Math.abs(p.box.h - q.box.h) / Math.max(p.box.h, q.box.h);
      const near = (d: number) => d > 0.1 && (same || d <= 0.4);
      const off = [
        ...((same || col) && near(dw) ? [`width ${Math.round(100 * dw)}%`] : []),
        ...((same || row) && near(dh) ? [`height ${Math.round(100 * dh)}%`] : []),
      ];
      if (!off.length) continue;
      siblings++;
      add(
        "grid.uneven-siblings",
        "minor",
        [p.id, q.id],
        {
          a: `${Math.round(p.box.w)}x${Math.round(p.box.h)}`,
          b: `${Math.round(q.box.w)}x${Math.round(q.box.h)}`,
          apart: off.join(", "),
        },
        `"${p.id}" (${Math.round(p.box.w)}x${Math.round(p.box.h)}) and "${q.id}" (${Math.round(q.box.w)}x${Math.round(q.box.h)}) are ${off.join(" and ")} apart`,
        [
          `give "${p.id}" and "${q.id}" matching contents (the same nodes and label lengths) so they come out one size`,
          `put them side by side in one parent with cols: so they share a grid`,
        ],
        3,
      );
    }

  // Whitespace and padding (check 11), per frame on an 8px raster: own nodes with a margin, child
  // frames and edge labels cover; the rest below the header is empty. The sample's 16px margin is
  // two thirds of its 24px gap; orrery leaves 64px between layers, so the margin is half of that
  // (scaled by layout.spacing) and the layout's own rhythm never counts as empty.
  const margin = 32 * model.spacing;
  let sparse = 0;
  let padded = 0;
  for (const g of frames) {
    const own = scene.nodes.filter((n) => n.parent === g.id).map((n) => c.foot.get(n.id) ?? n.box);
    const kids = frames.filter((x) => x.parent === g.id).map((x) => x.box);
    if (!own.length && !kids.length) continue;
    const start = contentStart(g);
    const inner = {
      x: start.x,
      y: start.y,
      w: g.box.x + g.box.w - start.x,
      h: g.box.y + g.box.h - start.y,
    };
    if (inner.w <= 0 || inner.h <= 0) continue;
    const labels = scene.edges
      .map((e) => e.labelBox)
      .filter((b): b is Box => real(b) && interArea(b, inner) > 0);
    const cover = [
      ...own.map((b) => ({
        x: b.x - margin,
        y: b.y - margin,
        w: b.w + 2 * margin,
        h: b.h + 2 * margin,
      })),
      ...kids,
      ...labels,
    ];
    let total = 0;
    let empty = 0;
    for (let y = inner.y; y < inner.y + inner.h; y += 8)
      for (let x = inner.x; x < inner.x + inner.w; x += 8) {
        total++;
        const cell = { x, y, w: 8, h: 8 };
        if (!cover.some((b) => interArea(b, cell) > 0)) empty++;
      }
    const emptyPct = total ? (100 * empty) / total : 0;
    if (emptyPct > 65) {
      sparse++;
      add(
        "layout.sparse-group",
        "minor",
        [g.id],
        { group: g.id, emptyPct: r1(emptyPct) },
        `group "${g.id}" is ${Math.round(emptyPct)}% empty`,
        [
          `shorten the label of "${g.id}": a long header widens the frame past its content`,
          `move a related node into "${g.id}", or drop the group if one node does not need a frame`,
        ],
        4,
      );
    }
    const content = union([
      ...own,
      ...kids,
      ...labels.filter((b) => interArea(b, inner) >= b.w * b.h - 1),
    ]);
    if (!content) continue;
    const pads = {
      top: content.y - inner.y,
      bottom: g.box.y + g.box.h - (content.y + content.h),
      left: content.x - g.box.x,
      right: g.box.x + g.box.w - (content.x + content.w),
    };
    const lo = Math.max(8, Math.min(...Object.values(pads)));
    // A frame layout sized to match a same-kind sibling pads out on purpose (the sample asks for the
    // reason; here layout gave it), and one side much wider than the other is grid.off-center's.
    const twin = (k: "w" | "h") =>
      frames.some(
        (o) =>
          o !== g &&
          o.type === g.type &&
          o.parent === g.parent &&
          Math.abs(o.box[k] - g.box[k]) < 1,
      );
    const u = union([...own, ...kids]);
    const lopsided = !!u && Math.abs(u.x - g.box.x - (g.box.x + g.box.w - u.x - u.w)) > 6;
    const skip = new Set([
      ...(twin("w") || lopsided ? ["left", "right"] : []),
      ...(twin("h") ? ["top", "bottom"] : []),
    ]);
    const worst = Object.entries(pads).filter(([k, v]) => !skip.has(k) && v > 80 && v > 3 * lo);
    if (worst.length) {
      padded++;
      add(
        "grid.padding",
        "minor",
        [g.id],
        {
          group: g.id,
          ...Object.fromEntries(worst.map(([k, v]) => [`${k}Px`, r1(v)])),
          tightestPx: r1(lo),
        },
        `group "${g.id}" pads ${worst.map(([k, v]) => `${k} ${Math.round(v)}px`).join(", ")} against ${Math.round(lo)}px elsewhere, so it does not hug its content`,
        [
          `shorten the label of "${g.id}" so the frame can hug its content`,
          `move the nodes of "${g.id}" next to each other in the nodes list`,
        ],
        3,
      );
    }
  }

  Object.assign(c.metrics.grid, {
    zigZags: zigs,
    avoidableBends: bends,
    unevenSiblings: siblings,
    padding: padded,
  });
  Object.assign(c.metrics.layout, { sparseGroups: sparse, besideGroup: beside });
}

interface TextItem {
  id: string;
  what: string;
  fg: string;
  bg: string;
  size: number;
  weight: number;
}

/** Every text run in a scene with the color it is drawn in and the worst surface under it. */
function textItems(scene: Scene): TextItem[] {
  const t = tokensFor(scene);
  const canvas =
    scene.background && scene.background !== "transparent" ? scene.background : t.background;
  const byDepth = [...scene.groups].sort((a, b) => a.depth - b.depth);
  const surfaceAt = (x: number, y: number) => {
    let col = canvas;
    for (const g of byDepth) {
      if (g.fill !== "none" && inBox(x, y, g.box)) col = g.fill;
      if (g.inner && inBox(x, y, g.inner.box)) col = g.inner.fill;
    }
    return col;
  };
  const samples = (b: Box) => [
    surfaceAt(b.x + b.w / 2, b.y + b.h / 2),
    surfaceAt(b.x + 1, b.y + 1),
    surfaceAt(b.x + b.w - 1, b.y + 1),
    surfaceAt(b.x + 1, b.y + b.h - 1),
    surfaceAt(b.x + b.w - 1, b.y + b.h - 1),
  ];
  // As svg.ts surfaceBehind: a header chip takes the nearest filled group's color.
  const behind = (g: SceneGroup): string => {
    if (g.overlay) {
      const under = scene.groups
        .filter((x) => !x.overlay && x.fill !== "none" && inBox(g.labelBox.x, g.box.y, x.box))
        .sort((a, b) => b.depth - a.depth)[0];
      if (under) return under.fill;
    }
    let cur: SceneGroup | undefined = g.overlay ? undefined : g;
    while (cur) {
      if (cur.fill !== "none") return cur.fill;
      const parent = cur.parent;
      cur = parent ? scene.groups.find((x) => x.id === parent) : undefined;
    }
    return canvas;
  };
  const out: TextItem[] = [];
  const push = (
    id: string,
    what: string,
    fg: string,
    bgs: string[],
    size: number,
    weight: number,
  ) => {
    const valid = bgs.filter(isHex);
    if (!isHex(fg) || !valid.length) return;
    const bg = valid.reduce((w, b) => (contrast(fg, b) < contrast(fg, w) ? b : w));
    out.push({ id, what, fg, bg, size, weight });
  };
  if (scene.title && scene.titleBox)
    push("title", "title", t.text, [canvas], scene.title.size, scene.title.weight);
  if (scene.subtitle && scene.subtitleBox)
    push("subtitle", "subtitle", t.muted, [canvas], scene.subtitle.size, scene.subtitle.weight);
  for (const g of scene.groups)
    if (g.label.lines.length)
      push(g.id, "group label", g.labelColor, [behind(g)], g.label.size, g.label.weight);
  for (const n of scene.nodes) {
    const shapeFill = n.color
      ? mixHex(n.color, canvas, scene.theme === "dark" ? 0.16 : 0.1)
      : t.surface;
    const under = (b: Box) =>
      n.look === "card" ? [t.surface] : n.look === "shape" ? [shapeFill] : samples(b);
    const ink = n.look === "card" ? t.text : (n.ink ?? t.text);
    const muted = n.look === "card" ? t.muted : (n.inkMuted ?? t.muted);
    if (n.label.lines.length)
      push(n.id, "label", ink, under(n.labelBox), n.label.size, n.label.weight);
    if (n.note && n.noteBox)
      push(n.id, "note", muted, under(n.noteBox), n.note.size, n.note.weight);
    if (n.badge) push(n.id, "badge", t.stepText, [t.stepFill], 10, 600);
  }
  const chipFill =
    scene.background === "transparent" ? t.background : (scene.background ?? t.background);
  for (const e of scene.edges) {
    if (e.label && e.labelBox)
      push(
        e.id,
        "edge label",
        t.edgeLabel,
        samples(e.labelBox).map((u) => mixHex(chipFill, u, 0.92)),
        e.label.size,
        e.label.weight,
      );
    if (e.step !== undefined && e.stepBox) push(e.id, "step", t.stepText, [t.stepFill], 14, 600);
  }
  for (const item of scene.legend?.items ?? [])
    push("legend", `legend ${item.line}`, t.text, [t.surface], item.label.size, item.label.weight);
  return out;
}

function measureQuality(c: Ctx, scenes: Scene[]): void {
  const { scene, add, s } = c;
  const m = c.metrics.quality;

  // Legibility at the display width.
  const nodeSizes = scene.nodes.filter((n) => n.label.lines.length).map((n) => n.label.size);
  const nodeLabelPx = (nodeSizes.length ? Math.min(...nodeSizes) : 13) * s;
  if (nodeLabelPx < 10) {
    add(
      "quality.label-size",
      nodeLabelPx < 6 ? "blocker" : nodeLabelPx < 8 ? "major" : "minor",
      [],
      {
        nodeLabelPx: r2(nodeLabelPx),
        scale: r2(s),
        canvasW: scene.width,
        width: c.width,
      },
      `node labels render at ${r2(nodeLabelPx)}px at this width (${scene.width}px canvas shown at ${r2(s)}x)`,
      [
        "use direction: down so the diagram is narrower",
        "split into an overview and detail diagrams",
        "move detail from labels into note and drop nodes the reader does not need",
      ],
      (10 - nodeLabelPx) * 9,
    );
  }
  const others = [
    ...scene.nodes.flatMap((n) => [n.note?.size, n.badge ? 10 : undefined]),
    ...scene.edges.flatMap((e) => [e.label?.size, e.step !== undefined ? 14 : undefined]),
    ...scene.groups.map((g) => (g.label.lines.length ? g.label.size : undefined)),
    scene.subtitle?.size,
    ...(scene.legend?.items.map((i) => i.label.size) ?? []),
  ].filter((v): v is number => typeof v === "number");
  const smallest = others.length ? Math.min(...others) : 0;
  const textPx = smallest * s;
  if (others.length && textPx < 8) {
    add(
      "quality.text-size",
      textPx < 6 ? "major" : "minor",
      [],
      { smallestTextPx: r2(textPx), fontPx: smallest, scale: r2(s) },
      `the smallest text (${smallest}px notes, edge labels or badges) renders at ${r2(textPx)}px`,
      [
        "shorten notes and edge labels or drop them",
        "use direction: down so the diagram is narrower",
      ],
      (8 - textPx) * 4,
    );
  }
  const icons = scene.nodes
    .filter((n) => n.look === "icon" && n.iconBox)
    .map((n) => n.iconBox?.h ?? 0);
  const iconPx = (icons.length ? Math.min(...icons) : 48) * s;
  if (icons.length && iconPx < 20)
    add(
      "quality.icon-size",
      "minor",
      [],
      { iconPx: r1(iconPx), scale: r2(s) },
      `icons render at ${r1(iconPx)}px, too small to tell apart`,
      ["use direction: down so the diagram is narrower", "split the diagram"],
      (20 - iconPx) * 1.5,
    );

  // WCAG 2.2 text contrast in every theme (1.4.3: 4.5:1, large text 3:1).
  let failures = 0;
  let worst = 21;
  const themes: ThemeName[] = [];
  for (const sc of scenes) {
    themes.push(sc.theme);
    for (const it of textItems(sc)) {
      const ratio = contrast(it.fg, it.bg);
      worst = Math.min(worst, ratio);
      const large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 600);
      const need = large ? 3 : 4.5;
      if (ratio + 1e-6 >= need) continue;
      failures++;
      add(
        "quality.contrast",
        ratio < 2 ? "blocker" : "major",
        it.id === "title" || it.id === "subtitle" || it.id === "legend" ? [] : [it.id],
        { theme: sc.theme, what: it.what, fg: it.fg, bg: it.bg, ratio: r2(ratio), needed: need },
        `the ${it.what} of "${it.id}" is ${r2(ratio)}:1 against ${it.bg} in the ${sc.theme} theme (needs ${need}:1)`,
        ["drop the custom color: or fill:", "pick a darker or lighter color: for that element"],
        10,
      );
    }
  }
  c.hard.contrastFailures = failures;

  // Size of the story.
  const n = c.model.nodes.length;
  if (n > 25)
    add(
      "quality.node-count",
      n > 40 ? "major" : "minor",
      [],
      { nodes: n },
      `${n} nodes in one diagram (6 to 25 read well)`,
      ["split into an overview and detail diagrams", "collapse repeated nodes and use badge: x3"],
      (n - 25) * 2,
    );
  for (const node of scene.nodes) {
    if (node.label.lines.length > 3)
      add(
        "quality.long-label",
        "minor",
        [node.id],
        { lines: node.label.lines.length },
        `the label of "${node.id}" wraps to ${node.label.lines.length} lines`,
        ["shorten the label and move detail into note"],
        3,
      );
    const text = c.model.nodes.find((x) => x.id === node.id)?.label ?? "";
    const broken = midWordBreak(text, node.label.lines);
    if (broken)
      add(
        "quality.mid-word-break",
        "minor",
        [node.id],
        { at: broken },
        `the label of "${node.id}" breaks mid-word at "${broken}"`,
        ["use shorter words or a shorter label", "put a line break (\\n) where it should wrap"],
        3,
      );
  }

  Object.assign(m, {
    nodeLabelPx: r2(nodeLabelPx),
    smallestTextPx: others.length ? r2(textPx) : "none",
    iconPx: r1(iconPx),
    contrastFailures: failures,
    contrastMin: r2(worst),
    themes: themes.join(","),
    nodes: n,
    edges: c.model.edges.length,
    groups: c.model.groups.length,
  });
}

/** The two letters around a hard break inside a word, or undefined. CamelCase and hyphen breaks are fine. */
function midWordBreak(text: string, lines: string[]): string | undefined {
  const flat = text.replace(/\s+/g, " ").trim();
  let pos = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i] ?? "";
    if (!flat.startsWith(line, pos)) return undefined;
    pos += line.length;
    if (flat[pos] === " ") {
      pos++;
      continue;
    }
    const prev = flat[pos - 1] ?? "";
    const next = flat[pos] ?? "";
    if (prev === "-" || (/[a-z0-9]/.test(prev) && /[A-Z]/.test(next))) continue;
    return `${prev}|${next}`;
  }
  return undefined;
}

let shortForms: Map<string, string[]> | undefined;

/** Alias slugs per canonical icon id ("aws:dms" for the Database Migration Service). */
function aliasesFor(id: string): string[] {
  if (!shortForms) {
    shortForms = new Map();
    for (const alias of Object.keys(aliases())) {
      const target = resolveIcon(alias);
      if (!target) continue;
      const slug = alias.split(":")[1]?.replace(/-/g, " ") ?? "";
      shortForms.set(target, [...(shortForms.get(target) ?? []), slug]);
    }
  }
  return shortForms.get(id) ?? [];
}

/** What an AWS service goes by besides its full name: without Amazon or AWS, initials, aliases. */
function shortFormsOf(info: { id: string; name: string }): string[] {
  const core = info.name.replace(/^(Amazon|AWS)\s+/, "");
  const acronym = core
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join("");
  return [core, acronym.length >= 2 ? acronym : "", ...aliasesFor(info.id)];
}

/** AWS boundary groups and the functional name their label carries (AWS-17). */
const BOUNDARY_NAMES: Record<string, { name: string; test: RegExp }> = {
  "aws:cloud": { name: "AWS Cloud", test: /\baws cloud\b/ },
  "aws:cloud-alt": { name: "AWS Cloud", test: /\baws cloud\b/ },
  "aws:account": { name: "Account", test: /\baccounts?\b/ },
  // A Region code names the Region itself.
  "aws:region": { name: "Region", test: /\bregion\b|\b[a-z]{2}(-gov)?-[a-z]+-\d\b/ },
  "aws:az": { name: "Availability Zone", test: /\b(availability zone|az)\b/ },
  "aws:vpc": { name: "VPC", test: /\b(vpc|virtual private cloud)\b/ },
  "aws:public-subnet": { name: "Public subnet", test: /\bpublic subnets?\b/ },
  "aws:private-subnet": { name: "Private subnet", test: /\bprivate subnets?\b/ },
  "aws:auto-scaling": { name: "Auto Scaling group", test: /\bauto scaling\b/ },
  "aws:corporate-dc": { name: "Corporate data center", test: /\bdata cent(er|re)\b/ },
};

const C4_TYPE =
  /\[(person|software system|external (software )?system|system|container|component|database|queue)\b([^\]]*)\]/i;

/** The notation rubric each diagram kind is judged by (references/review/conventions-<name>.md). */
const NOTATIONS: Partial<Record<DiagramKind, string>> = {
  process: "bpmn",
  flowchart: "flowchart",
  state: "state",
  journey: "journey",
};

/** Endpoints in travel order: an arrow at the start runs to -> from. */
const travel = (e: ModelEdge): [string, string] =>
  e.arrow === "start" ? [e.to, e.from] : [e.from, e.to];

/** BPMN 2.0 (OMG) and the naming practice the rubric quotes: what the spec alone can show. */
function measureBpmn(c: Ctx): Record<string, number> {
  const { model, add } = c;
  const bpmn = new Map(model.nodes.map((n) => [n.id, n.bpmn ?? ""]));
  const pools = new Set(model.groups.filter((g) => g.type === "pool").map((g) => g.id));
  const poolOf = (id: string): string | undefined => {
    for (let p: string | undefined = id; p; p = c.parentOf(p)) if (pools.has(p)) return p;
    return undefined;
  };
  const data = (id: string) => (bpmn.get(id) ?? "").startsWith("data-");
  // Sequence flows: the order of work, not messages, annotations or data.
  const seq = model.edges.filter(
    (e) => e.flow !== "message" && e.flow !== "association" && !data(e.from) && !data(e.to),
  );
  const outOf = (id: string) => seq.filter((e) => travel(e)[0] === id);
  const where = (pool: string | undefined) =>
    pool ? `the process in pool "${pool}"` : "the process";

  // BPMN-01: every drawn process starts and ends at an event (a black-box pool has neither; a
  // flow that leaves its pool is BPMN-07's finding, not a process drawn in the other pool).
  let startEnd = 0;
  const drawn = [
    ...new Set(seq.filter((e) => poolOf(e.from) === poolOf(e.to)).map((e) => poolOf(e.from))),
  ];
  for (const pool of drawn) {
    const kinds = model.nodes.filter((n) => poolOf(n.id) === pool).map((n) => n.bpmn ?? "");
    const start = kinds.some((k) => k.startsWith("start"));
    const end = kinds.some((k) => k.startsWith("end"));
    if (start && end) continue;
    startEnd++;
    const lacks = [...(start ? [] : ["start event"]), ...(end ? [] : ["end event"])];
    const unknown = [...(start ? [] : ["what triggers it"]), ...(end ? [] : ["how it ends"])];
    add(
      "conventions.bpmn-start-end",
      "major",
      pool ? [pool] : [],
      { pool: pool ?? "(none)", lacks: lacks.join(",") },
      `${where(pool)} has no ${lacks.join(" and no ")}, so readers cannot tell ${unknown.join(" or ")}`,
      [
        ...(start
          ? []
          : [
              "add a node with bpmn: start named for its trigger (Order received) before the first task",
            ]),
        ...(end
          ? []
          : [
              "add a node with bpmn: end named for the end state (Order shipped) after each last task",
            ]),
      ],
      8,
    );
  }

  // BPMN-04: a deciding gateway asks a question and each branch answers it.
  let gateways = 0;
  for (const n of model.nodes) {
    if (n.bpmn !== "exclusive" && n.bpmn !== "inclusive") continue;
    const outs = outOf(n.id);
    if (outs.length < 2) continue;
    // The default flow is marked by its slash and taken when no condition holds.
    const bare = outs.filter((e) => !e.label && e.flow !== "default");
    if (n.label && !bare.length) continue;
    gateways++;
    const lacks = [
      ...(n.label ? [] : ["no question"]),
      ...(bare.length ? [`no condition on ${bare.length} of its ${outs.length} branches`] : []),
    ];
    add(
      "conventions.bpmn-gateway",
      bare.length ? "major" : "minor",
      [n.id, ...bare.map((e) => e.id)],
      { gateway: n.id, kind: n.bpmn, branches: outs.length, unlabelled: bare.length },
      `the ${n.bpmn} gateway "${n.id}" splits the flow with ${lacks.join(" and ")}`,
      [
        ...(n.label ? [] : [`set label: <a question, for example Order valid?> on "${n.id}"`]),
        ...bare
          .slice(0, 1)
          .map((e) => `label each branch with its answer: - ${edgeName(e)}: "Yes"`),
      ],
      bare.length ? 8 : 4,
    );
  }

  // BPMN-06: branches a parallel gateway starts meet again at a gateway that waits for them.
  let joins = 0;
  const reach = (from: string) => {
    const dist = new Map([[from, 0]]);
    for (let queue = [from]; queue.length; ) {
      const v = queue.shift() ?? "";
      for (const e of outOf(v)) {
        const w = travel(e)[1];
        if (!dist.has(w)) {
          dist.set(w, (dist.get(v) ?? 0) + 1);
          queue.push(w);
        }
      }
    }
    return dist;
  };
  for (const n of model.nodes) {
    if (n.bpmn !== "parallel") continue;
    const outs = outOf(n.id);
    if (outs.length < 2) continue;
    const maps = outs.map((e) => reach(travel(e)[1]));
    // Where the branches first meet: the node every branch reaches soonest.
    let meet: { id: string; worst: number; sum: number } | undefined;
    for (const id of maps[0]?.keys() ?? []) {
      const ds = maps.map((m) => m.get(id));
      if (id === n.id || ds.some((d) => d === undefined)) continue;
      const worst = Math.max(...ds.map(Number));
      const sum = ds.reduce((s: number, d) => s + Number(d), 0);
      if (!meet || worst < meet.worst || (worst === meet.worst && sum < meet.sum))
        meet = { id, worst, sum };
    }
    const k = meet ? (bpmn.get(meet.id) ?? "") : "";
    if (!meet || k === "parallel" || k === "inclusive" || k === "complex" || k.startsWith("end"))
      continue;
    joins++;
    add(
      "conventions.bpmn-join",
      "major",
      [n.id, meet.id],
      { split: n.id, meet: meet.id, meetKind: k || "plain node", branches: outs.length },
      `the ${outs.length} parallel branches out of "${n.id}" meet at "${meet.id}"${k ? ` (${k})` : ""}, which does not wait for them, so it runs ${outs.length} times`,
      [
        `add a node with bpmn: parallel where the branches meet, and lead every branch into it, then on to "${meet.id}"`,
      ],
      8,
    );
  }

  // BPMN-07: messages run between pools; a process never leaves its pool.
  let boundary = 0;
  for (const e of model.edges) {
    if (e.flow === "association" || data(e.from) || data(e.to)) continue;
    const a = poolOf(e.from);
    const b = poolOf(e.to);
    const message = e.flow === "message";
    if (message ? a !== b : !pools.size || a === b) continue;
    boundary++;
    const named = (p: string | undefined) => (p ? `pool "${p}"` : "no pool");
    add(
      "conventions.bpmn-pools",
      "major",
      [e.id],
      { edge: edgeName(e), flow: e.flow ?? "sequence", from: a ?? "(none)", to: b ?? "(none)" },
      message
        ? `the message flow ${edgeName(e)} stays inside ${named(a)}; message flows connect two pools`
        : `the sequence flow ${edgeName(e)} crosses from ${named(a)} to ${named(b)}; a process stays in its pool`,
      message
        ? [
            "put the other participant in its own group with type: pool",
            "drop flow: message so it is a sequence flow",
          ]
        : ["set flow: message on it (pools talk by messages)", "move both ends into one pool"],
      10,
    );
  }
  return { startEnd, gateways, joins, poolBoundary: boundary };
}

/** Flowcharts (ISO 5807; the rubric quotes ANSI X3.5): terminators and decisions. */
function measureFlowchart(c: Ctx): Record<string, number> {
  const { model, add } = c;
  const nodes = new Set(model.nodes.map((n) => n.id));
  const edges = model.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));
  const ins = (id: string) => edges.filter((e) => travel(e)[1] === id);
  const outs = (id: string) => edges.filter((e) => travel(e)[0] === id);

  // FC-01: one start terminator, and every path ends at one.
  const pills = model.nodes.filter((n) => n.look === "shape" && n.shape === "pill");
  const starts = pills.filter((n) => !ins(n.id).length && outs(n.id).length);
  const ends = pills.filter((n) => !outs(n.id).length && ins(n.id).length);
  let terminals = 0;
  if (starts.length !== 1 || !ends.length) {
    terminals++;
    const lacks = [
      ...(starts.length ? [] : ["no start terminator"]),
      ...(starts.length > 1 ? [`${starts.length} start terminators`] : []),
      ...(ends.length ? [] : ["no end terminator"]),
    ];
    add(
      "conventions.flowchart-terminals",
      starts.length && ends.length ? "minor" : "major",
      starts.length > 1 ? starts.map((n) => n.id) : [],
      { starts: starts.length, ends: ends.length },
      `the flowchart has ${lacks.join(" and ")}, so its entry and exits are not marked`,
      [
        "draw where it starts as one shape: terminator with nothing leading into it",
        "end every path at a shape: terminator (Order approved, Order rejected)",
      ],
      starts.length && ends.length ? 4 : 8,
    );
  }

  // FC-03: a decision has two or more exits, each saying which answer it is.
  let decisions = 0;
  for (const n of model.nodes) {
    if (n.look !== "shape" || n.shape !== "diamond") continue;
    const exits = outs(n.id);
    const bare = exits.filter((e) => !e.label);
    if (exits.length >= 2 && !bare.length) continue;
    decisions++;
    const one = exits.length < 2;
    add(
      "conventions.flowchart-decision",
      bare.length && !one ? "major" : "minor",
      [n.id, ...bare.map((e) => e.id)],
      { decision: n.id, exits: exits.length, unlabelled: bare.length },
      one
        ? `the decision "${n.id}" has ${exits.length} exit(s), so it decides nothing`
        : `the decision "${n.id}" has ${bare.length} of ${exits.length} exits without the answer they stand for`,
      one
        ? [`give "${n.id}" an exit per answer (yes and no)`, `use shape: process for "${n.id}"`]
        : bare.slice(0, 1).map((e) => `label each exit with its answer: - ${edgeName(e)}: "yes"`),
      one ? 4 : 8,
    );
  }
  return { startTerminators: starts.length, endTerminators: ends.length, terminals, decisions };
}

/** UML state machines (OMG UML 2.5.1): initial pseudostates and final states. */
function measureStateMachine(c: Ctx): Record<string, number> {
  const { model, add } = c;
  const outs = (id: string) => model.edges.filter((e) => travel(e)[0] === id);
  let initial = 0;
  let final = 0;
  // SM-01: at most one initial pseudostate per region (the top level or a composite state), one
  // transition out of it, and one at the top level so the reader sees where it starts.
  const regions = new Map<string | undefined, string[]>();
  for (const n of model.nodes)
    if (n.shape === "initial") regions.set(n.parent, [...(regions.get(n.parent) ?? []), n.id]);
  for (const [region, ids] of regions) {
    if (ids.length < 2) continue;
    initial++;
    add(
      "conventions.state-initial",
      "major",
      ids,
      { region: region ?? "(top level)", initials: ids.length },
      `${region ? `state "${region}"` : "the top level"} has ${ids.length} initial pseudostates; a region has at most one`,
      ["keep one shape: initial per region and point it at the first state"],
      8,
    );
  }
  if (!regions.has(undefined) && model.nodes.some((n) => !n.parent)) {
    initial++;
    add(
      "conventions.state-initial",
      "minor",
      [],
      { region: "(top level)", initials: 0 },
      "the state machine has no initial pseudostate, so the reader cannot tell where it starts",
      ["add a node with shape: initial and an edge from it to the first state"],
      4,
    );
  }
  for (const id of [...regions.values()].flat()) {
    const n = outs(id).length;
    if (n < 2) continue;
    initial++;
    add(
      "conventions.state-initial",
      "major",
      [id],
      { initial: id, transitions: n },
      `the initial pseudostate "${id}" has ${n} transitions out; it may have one`,
      ["keep one edge out of it; branch later with a decision state"],
      8,
    );
  }
  // SM-03: a final state ends its region.
  for (const n of model.nodes) {
    const leaving = n.shape === "final" ? outs(n.id) : [];
    if (!leaving.length) continue;
    final++;
    add(
      "conventions.state-final",
      "major",
      [n.id, ...leaving.map((e) => e.id)],
      { final: n.id, transitions: leaving.length },
      `the final state "${n.id}" has ${leaving.length} transition(s) out; a final state has none`,
      [`use shape: rounded for "${n.id}" if the machine goes on from it`],
      8,
    );
  }
  return { initialProblems: initial, finalProblems: final };
}

/** Customer journey maps (Nielsen Norman Group): every stage has steps, steps carry emotion. */
function measureJourney(c: Ctx): Record<string, number> {
  const { model, add } = c;
  const empty = (model.stages ?? []).filter((s) => !model.nodes.some((n) => n.stage === s));
  const scored = model.nodes.filter((n) => n.score !== undefined).length;
  const lacks = [
    ...empty.map((s) => `no step in stage "${s}"`),
    ...(scored ? [] : ["no emotion score on any step"]),
  ];
  if (lacks.length)
    add(
      "conventions.journey-incomplete",
      "minor",
      [],
      { emptyStages: empty.join(",") || "none", scoredSteps: scored },
      `the journey has ${lacks.join(" and ")}`,
      [
        ...(empty.length ? [`add the actor's step in stage "${empty[0]}", or drop the stage`] : []),
        ...(scored ? [] : ["set score: -2 to 2 on the actor's steps so the emotion curve shows"]),
      ],
      3 * lacks.length,
    );
  return { emptyStages: empty.length, scoredSteps: scored };
}

const NOTATION_CHECKS: Partial<Record<DiagramKind, (c: Ctx) => Record<string, number>>> = {
  process: measureBpmn,
  flowchart: measureFlowchart,
  state: measureStateMachine,
  journey: measureJourney,
};

function measureConventions(c: Ctx): { vendors: string[]; rubrics: string[] } {
  const { scene, model, add } = c;
  const m = c.metrics.conventions;
  const packs = new Set<string>();
  for (const n of model.nodes) {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    if (info) packs.add(info.pack);
  }
  for (const g of model.groups) {
    const prefix = g.type.split(":")[0];
    if (g.type.includes(":") && prefix) packs.add(prefix);
  }
  const c4 =
    model.groups.some((g) => g.type.startsWith("c4:")) ||
    /\bC4\b/.test(`${model.title ?? ""} ${model.subtitle ?? ""}`);
  // The diagram kind picks a notation rubric too; vendor rubrics still apply to vendor icons.
  const notation = NOTATIONS[model.kind];
  const vendors = [
    ...["aws", "azure", "gcp", "k8s"].filter((p) => packs.has(p)),
    ...(c4 ? ["c4"] : []),
    ...(notation ? [notation] : []),
  ];
  const rubrics = vendors.filter((v) => v !== "k8s").map((v) => `conventions-${v}.md`);

  // Legend for line styles (Azure Well-Architected, C4 notation). A BPMN message flow is dashed
  // and an association dotted by the notation itself, which explains them.
  const styled = model.edges.filter(
    (e) =>
      !(e.flow === "message" && e.line === "dashed") &&
      !(e.flow === "association" && e.line === "dotted"),
  );
  const used = [...new Set(styled.map((e) => e.line))].filter((l) => l !== "solid");
  const keyed = new Set((model.legend ?? []).map((l) => l.line));
  const missing = used.filter((l) => !keyed.has(l));
  if (missing.length || (c4 && !model.legend?.length)) {
    const styles = missing.length ? missing : ["solid"];
    add(
      "conventions.legend-missing",
      "major",
      styled.filter((e) => styles.includes(e.line)).map((e) => e.id),
      {
        styles: styles.join(","),
        edges: styled.filter((e) => styles.includes(e.line)).length,
      },
      `${styles.join(" and ")} line(s) are drawn but no legend says what they mean`,
      [`add legend: { ${styles.map((l) => `${l}: <what it means>`).join(", ")} }`],
      15 * styles.length,
    );
  }
  const unusedKey = (model.legend ?? []).filter((l) => !model.edges.some((e) => e.line === l.line));
  if (unusedKey.length)
    add(
      "conventions.legend-unused",
      "minor",
      [],
      { styles: unusedKey.map((l) => l.line).join(",") },
      `the legend explains ${unusedKey.map((l) => l.line).join(", ")} but no edge uses it`,
      [`remove ${unusedKey.map((l) => l.line).join(", ")} from legend:`],
      3 * unusedKey.length,
    );
  if (!model.title)
    add(
      "conventions.title-missing",
      "minor",
      [],
      { title: "none" },
      "the diagram has no title, so readers do not know its scope",
      ["add title: <system and scope>, for example title: Orders API on AWS"],
      8,
    );

  // AWS names (deck slide 17): short forms only after the full name appears somewhere.
  const allText = norm(
    [
      model.title,
      model.subtitle,
      ...model.nodes.flatMap((n) => [n.label, n.note]),
      ...model.groups.map((g) => g.label),
      ...model.edges.map((e) => e.label),
      ...(model.legend ?? []).map((l) => l.label),
    ]
      .filter(Boolean)
      .join(" | "),
  );
  let shorts = 0;
  let longAws = 0;
  for (const n of model.nodes) {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    // Resource icons carry resource names ("NAT gateway"), as the deck's own examples do.
    if (info?.pack !== "aws" || info.type !== "service" || !/^(Amazon|AWS) /.test(info.name))
      continue;
    const full = info.name;
    const label = norm(`${n.label} ${n.note ?? ""}`);
    if (!hasPhrase(allText, full)) {
      const form = shortFormsOf(info).find((f) => hasPhrase(label, f));
      if (form) {
        shorts++;
        // Name where it was found: a short form only in the note is not the label's.
        const where = hasPhrase(norm(n.label), form) ? `"${n.label}"` : `the note of "${n.label}"`;
        add(
          "conventions.short-name",
          "minor",
          [n.id],
          { label: n.label, shortForm: form, fullName: full },
          `${where} uses the short form "${form}" but "${full}" appears nowhere in the diagram`,
          [`set label: ${full} on one "${info.id}" node, or note: ${full}`],
          4,
        );
      }
    }
    const sn = c.nodes.get(n.id);
    if (sn && sn.label.lines.length > 2) {
      longAws++;
      add(
        "conventions.label-lines",
        "minor",
        [n.id],
        { lines: sn.label.lines.length },
        `the AWS label of "${n.id}" runs over ${sn.label.lines.length} lines (the deck allows two)`,
        ["shorten the label and move the rest into note"],
        3,
      );
    }
  }

  // AWS-17 (aws-archify composition.md): a boundary group says which boundary it is. Measured: the
  // label does not name it at all ("Web subnet" on a private subnet); whether the name leads, with
  // context after it in parentheses, is the reviewer's call.
  let boundaries = 0;
  for (const g of model.groups) {
    const want = BOUNDARY_NAMES[g.type];
    if (!want || !g.label || want.test.test(g.label.toLowerCase())) continue;
    boundaries++;
    const words = new Set(want.name.toLowerCase().split(/\s+/));
    const rest = g.label
      .split(/\s+/)
      .filter((w) => !words.has(w.toLowerCase()))
      .join(" ")
      .trim();
    const label = rest ? `${want.name} (${rest})` : want.name;
    add(
      "conventions.boundary-label",
      "minor",
      [g.id],
      { group: g.id, type: g.type, label: g.label, expected: want.name },
      `group "${g.id}" draws the ${g.type} boundary but its label "${g.label}" does not say ${want.name}`,
      [`set label: ${label} on "${g.id}"`],
      3,
      [{ op: "set", path: `groups.${g.id}.label`, value: label }],
    );
  }

  // AWS-18 (aws-archify composition.md): a group with a service's icon in its corner is that one
  // service and holds only its parts. Measured on an icon: override; the presets (Step Functions
  // workflow, EC2 instance contents) hold other services by the deck's own design.
  let serviceGroups = 0;
  for (const g of model.groups) {
    const own = typeof g.icon === "string" ? iconInfo(g.icon) : undefined;
    if (own?.pack !== "aws" || own.type !== "service") continue;
    const others = model.nodes.filter((n) => {
      const info = n.parent === g.id && n.icon ? iconInfo(n.icon) : undefined;
      return info?.pack === "aws" && info.category !== "General" && !info.name.startsWith(own.name);
    });
    if (!others.length) continue;
    serviceGroups++;
    const names = [...new Set(others.map((n) => iconInfo(n.icon ?? "")?.name ?? n.id))];
    add(
      "conventions.service-group",
      "minor",
      [g.id, ...others.map((n) => n.id)],
      { group: g.id, service: own.name, others: names.join(", ") },
      `group "${g.id}" carries the ${own.name} icon but holds ${names.join(", ")}`,
      [
        `drop icon: from "${g.id}" and use type: aws:generic for a tier of different services`,
        `keep only ${own.name} and its own parts in "${g.id}"`,
      ],
      4,
      [{ op: "unset", path: `groups.${g.id}.icon` }],
    );
  }

  // AWS-19 (aws-archify composition.md): a service icon's label is the official name and the role
  // goes in note, so every tile reads as a real service. Measured: the label names the service in no
  // form (full name, the name without Amazon or AWS, initials, catalog alias). A node inside a frame of
  // its own service is one of that service's parts (pods in an EKS cluster) and takes a part name.
  let serviceLabels = 0;
  for (const n of model.nodes) {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    if (info?.pack !== "aws" || info.type !== "service" || !/^(Amazon|AWS) /.test(info.name))
      continue;
    const forms = [info.name, ...shortFormsOf(info)];
    // A label that opens with Amazon or AWS is meant as a service name (the catalog shortens some:
    // "Amazon FSx for WFS"); AWS-08 and the reviewer judge whether it is the right one.
    if (/^(Amazon|AWS)\s/.test(n.label) || forms.some((f) => hasPhrase(norm(n.label), f))) continue;
    let part = false;
    for (let p = n.parent; p && !part; p = c.parentOf(p)) {
      const g = model.groups.find((x) => x.id === p);
      const gi = typeof g?.icon === "string" ? iconInfo(g.icon) : undefined;
      part =
        !!gi?.name &&
        (gi.id === info.id || info.name.startsWith(gi.name) || gi.name.startsWith(info.name));
      part ||= !!g && forms.some((f) => hasPhrase(norm(g.label), f));
    }
    if (part) continue;
    serviceLabels++;
    const rest = (n.note ?? "")
      .replace(new RegExp(escapeRe(info.name), "i"), "")
      .replace(/^[\s,;:-]+|[\s,;:-]+$/g, "");
    const note = rest ? `${n.label}, ${rest}` : n.label;
    add(
      "conventions.service-label",
      "minor",
      [n.id],
      { label: n.label, service: info.name, note: n.note ?? "" },
      `"${n.id}" is drawn with the ${info.name} icon but its label "${n.label}" does not name the service`,
      [`set label: ${info.name} and note: ${note} on "${n.id}"`],
      2,
      [
        { op: "set", path: `nodes.${n.id}.label`, value: info.name },
        { op: "set", path: `nodes.${n.id}.note`, value: note },
      ],
    );
  }

  // Callouts in one size (deck slide 18).
  const callouts = new Set(
    scene.edges.filter((e) => real(e.stepBox)).map((e) => `${r1(e.stepBox?.w ?? 0)}`),
  );
  if (callouts.size > 1)
    add(
      "conventions.callout-sizes",
      "minor",
      [],
      { sizes: [...callouts].join(",") },
      `step callouts come in ${callouts.size} sizes (${[...callouts].join(", ")}px)`,
      ["report it: callout size is set by the renderer, not the spec"],
      5,
    );

  // C4 notation: element type, description and technology; labelled relationships.
  let c4Elements = 0;
  let c4Relations = 0;
  if (c4) {
    for (const n of model.nodes) {
      const text = `${n.label} ${n.note ?? ""}`;
      const tag = text.match(C4_TYPE);
      const lacks: string[] = [];
      if (!tag) lacks.push("type");
      const kind = tag?.[1]?.toLowerCase() ?? "";
      if ((kind === "container" || kind === "component") && !/:\s*\S/.test(tag?.[3] ?? ""))
        lacks.push("technology");
      const desc = (n.note ?? "").replace(/\[[^\]]*\]/g, "").trim();
      if (!desc) lacks.push("description");
      if (lacks.length) {
        c4Elements++;
        add(
          "conventions.c4-element",
          "minor",
          [n.id],
          { lacks: lacks.join(",") },
          `C4 element "${n.id}" has no ${lacks.join(", ")}`,
          [`set note: "[Container: <technology>] <what it does>" (or [Person], [Software System])`],
          4,
        );
      }
    }
    for (const e of model.edges) {
      const label = e.label ?? "";
      const words = label.replace(/\[[^\]]*\]/g, "").trim();
      const lacks: string[] = [];
      if (!label) lacks.push("label");
      else {
        if (!/\[[^\]]+\]/.test(label)) lacks.push("technology");
        if (!/\s/.test(words)) lacks.push("specific intent");
      }
      if (lacks.length) {
        c4Relations++;
        add(
          "conventions.c4-relationship",
          "minor",
          [e.id],
          { edge: edgeName(e), label, lacks: lacks.join(",") },
          `C4 relationship ${edgeName(e)} has no ${lacks.join(", ")}`,
          [`label it with the intent and protocol, for example "Reads orders from [SQL]"`],
          3,
        );
      }
    }
  }

  // Brand marks keep their color (Azure Well-Architected; GitHub brand guidance).
  let recolored = 0;
  for (const n of model.nodes) {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    if (!n.color || !info || n.look !== "icon" || !["si", "github"].includes(info.pack)) continue;
    recolored++;
    add(
      "conventions.icon-recolored",
      "minor",
      [n.id],
      { icon: info.id, color: n.color },
      `"${n.id}" recolors the ${info.name} mark to ${n.color}`,
      [`remove color: from "${n.id}"`],
      5,
    );
  }

  // Google Cloud: a product drawn with its own icon or its category icon (May 2026 guide).
  let gcpWrong = 0;
  for (const n of model.nodes) {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    if (info?.pack !== "gcp") continue;
    const slug = n.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    // "Pub/Sub" is gcp:pubsub: try the slug with and without its dashes.
    const product = iconInfo(`gcp:${slug}`) ?? iconInfo(`gcp:${slug.replace(/-/g, "")}`);
    if (!product || product.type === "category" || product.id === info.id) continue;
    if (norm(product.name) !== norm(n.label)) continue;
    const ok =
      info.name === product.name ||
      (product.category !== "Core products" && info.name === `${product.category} category`);
    if (ok) continue;
    gcpWrong++;
    add(
      "conventions.gcp-product-icon",
      "major",
      [n.id],
      { label: n.label, icon: info.id, expected: product.id },
      `"${n.label}" is drawn with ${info.id}; Google assigns it ${product.id}`,
      [`set icon: ${product.id} on "${n.id}"`],
      8,
    );
  }

  Object.assign(m, {
    vendors: vendors.join(",") || "none",
    title: model.title ? "yes" : "no",
    legendMissing: missing.length,
    shortNames: shorts,
    longAwsLabels: longAws,
    boundaryLabels: boundaries,
    serviceGroups,
    serviceLabels,
    calloutSizes: callouts.size,
    c4Elements,
    c4Relations,
    recolored,
    gcpIconMismatches: gcpWrong,
    ...(notation ? { notation, ...NOTATION_CHECKS[model.kind]?.(c) } : {}),
  });
  return { vendors, rubrics };
}

/**
 * Scores one laid-out scene. `diagnostics` are the spec and checkScene findings for the same model;
 * the overlap findings are mapped from the checkScene ones, so without them a scene has none.
 */
export function reviewScene(
  scene: Scene,
  model: Model,
  diagnostics: Diagnostic[],
  opts: ReviewOptions,
): ReviewReport {
  const width = opts.width > 0 ? opts.width : DEFAULT_REVIEW_WIDTH;
  const s = Math.min(1, width / Math.max(1, scene.width));
  const findings: ReviewFinding[] = [];
  const spent = new Map<FindingId, number>();
  const metrics = Object.fromEntries(DIMENSIONS.map((d) => [d, {}])) as Record<
    ReviewDimension,
    Record<string, number | string>
  >;
  const hard: HardCounts = {
    overlaps: 0,
    edgesThroughNodes: 0,
    edgesThroughHeaders: 0,
    edgesThroughLabels: 0,
    offCanvas: 0,
    contrastFailures: 0,
  };
  const modelGroups = new Map(model.groups.map((g) => [g.id, g]));
  const modelNodes = new Map(model.nodes.map((n) => [n.id, n]));
  const parentOf = (id: string) => (modelGroups.get(id) ?? modelNodes.get(id))?.parent;
  const ctx: Ctx = {
    scene,
    model,
    s,
    width,
    dir: scene.direction,
    nodes: new Map(scene.nodes.map((n) => [n.id, n])),
    groups: new Map(scene.groups.map((g) => [g.id, g])),
    foot: new Map(scene.nodes.map((n) => [n.id, footprint(n)])),
    parentOf,
    isDescendant: (id, ancestor) => {
      for (let p = parentOf(id); p; p = parentOf(p)) if (p === ancestor) return true;
      return false;
    },
    add: (id, severity, subjects, evidence, claim, fixes, cost, patches) => {
      const kind: FindingKind = FINDINGS[id];
      spent.set(id, (spent.get(id) ?? 0) + Math.max(0, cost));
      findings.push({
        id,
        dimension: kind.dimension,
        severity,
        subjects: [...new Set(subjects.filter(Boolean))],
        evidence,
        claim,
        fixes,
        ...(patches?.length ? { patches } : {}),
        ...(kind.rule ? { rule: kind.rule } : {}),
      });
    },
    metrics,
    hard,
  };
  metrics.quality.width = width;

  measureOverlap(ctx, diagnostics);
  measureFlow(ctx, diagnostics);
  measureLayout(ctx, diagnostics);
  measureGrid(ctx);
  measureComposition(ctx);
  measureQuality(ctx, [scene, ...(opts.themes ?? []).filter((x) => x.theme !== scene.theme)]);
  const { vendors, rubrics } = measureConventions(ctx);

  const dimensions = Object.fromEntries(
    DIMENSIONS.map((d) => {
      let penalty = 0;
      for (const [id, cost] of spent) {
        const kind: FindingKind = FINDINGS[id];
        if (kind.dimension === d) penalty += Math.min(kind.cap, cost);
      }
      return [
        d,
        { score: r1(Math.max(0, 100 - penalty)), weight: WEIGHTS[d], metrics: metrics[d] },
      ];
    }),
  ) as Record<ReviewDimension, DimensionScore>;
  const score = r1(DIMENSIONS.reduce((sum, d) => sum + dimensions[d].score * WEIGHTS[d], 0));
  const rank: Record<ReviewSeverity, number> = { blocker: 0, major: 1, minor: 2 };
  findings.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      DIMENSIONS.indexOf(a.dimension) - DIMENSIONS.indexOf(b.dimension),
  );
  const scaled = (b: Box): Box => ({
    x: r1(b.x * s),
    y: r1(b.y * s),
    w: r1(b.w * s),
    h: r1(b.h * s),
  });
  const elements: ReviewElement[] = [
    ...scene.nodes.map((n) => ({
      id: n.id,
      kind: "node" as const,
      label: n.label.lines.join(" "),
      box: scaled(ctx.foot.get(n.id) ?? n.box),
    })),
    ...scene.groups.map((g) => ({
      id: g.id,
      kind: "group" as const,
      label: g.label.lines.join(" "),
      box: scaled(g.box),
    })),
    ...scene.edges.map((e) => {
      const xs = e.points.map((p) => p.x);
      const ys = e.points.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return {
        id: e.id,
        kind: "edge" as const,
        label: `${edgeName(e)}${e.label ? `: ${e.label.lines.join(" ")}` : ""}`,
        box: scaled({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }),
      };
    }),
  ];
  return {
    ...(opts.name ? { name: opts.name } : {}),
    width,
    scale: r2(s),
    theme: scene.theme,
    themes: [
      scene.theme,
      ...(opts.themes ?? []).map((x) => x.theme).filter((t) => t !== scene.theme),
    ],
    canvas: { width: scene.width, height: scene.height },
    display: { width: Math.round(scene.width * s), height: Math.round(scene.height * s) },
    vendors,
    rubrics,
    score,
    pass: score >= 85 && !findings.some((f) => f.severity !== "minor"),
    hard,
    dimensions,
    findings,
    elements,
  };
}

/**
 * True when `after` may replace `before`: both were reviewed at the same width and theme, no hard
 * count went up, blockers plus majors did not go up, no node was dropped and the score went up.
 * Each guard closes a way to raise the score without improving the diagram: another width or
 * theme changes what is measured, and deleting nodes (or the findings about them) is not a fix.
 * Removing an edge is allowed.
 */
export function improves(before: ReviewReport, after: ReviewReport): boolean {
  const keys = Object.keys(before.hard) as (keyof HardCounts)[];
  const serious = (r: ReviewReport) => r.findings.filter((f) => f.severity !== "minor").length;
  const nodes = (r: ReviewReport) => r.elements.filter((e) => e.kind === "node").length;
  return (
    after.width === before.width &&
    after.theme === before.theme &&
    keys.every((k) => after.hard[k] <= before.hard[k]) &&
    serious(after) <= serious(before) &&
    nodes(after) >= nodes(before) &&
    after.score > before.score
  );
}

export interface ReviewRequest {
  model: Model;
  name: string;
  /** Display width in CSS px; default 880. */
  width?: number;
  /** Theme whose scene supplies the geometry; every theme is checked for contrast. */
  theme?: ThemeName;
  fonts?: string[];
  /** Spec diagnostics from parseSpec, kept with the review. */
  diagnostics?: Diagnostic[];
  /** Render the display-width PNG (default true). */
  png?: boolean;
}

/** Longest side of the look PNG: models stall on images over about 2000px a side. */
export const LOOK_MAX = 1568;

export interface ReviewRun {
  report: ReviewReport;
  /** Still PNG at the display width, one pixel per CSS px: what the reader sees. */
  png?: Uint8Array;
  /** The same picture scaled to fit LOOK_MAX x LOOK_MAX, when the display PNG is larger. */
  look?: Uint8Array;
  scenes: Partial<Record<ThemeName, Scene>>;
  diagnostics: Diagnostic[];
}

/** Lays out every theme, reviews the primary one and renders the display-width PNG. */
export async function reviewModel(req: ReviewRequest): Promise<ReviewRun> {
  const theme = req.theme ?? req.model.theme;
  const themes: ThemeName[] = [theme, theme === "light" ? "dark" : "light"];
  const rendered = await renderModel({
    model: req.model,
    formats: ["svg"],
    themes,
    name: req.name,
    fonts: req.fonts,
    animate: "none",
  });
  const scene = rendered.scenes[theme];
  if (!scene) throw new Error(`no ${theme} scene was laid out`);
  const diagnostics = [...(req.diagnostics ?? []), ...rendered.diagnostics];
  const report = reviewScene(scene, req.model, diagnostics, {
    width: req.width ?? DEFAULT_REVIEW_WIDTH,
    name: req.name,
    themes: themes.slice(1).flatMap((t) => rendered.scenes[t] ?? []),
  });
  const svg = rendered.artifacts.find((a) => a.format === "svg" && a.theme === theme)?.data;
  // The exact display scale (the report rounds it), so the PNG is display.width wide.
  const scale = report.display.width / scene.width;
  const png =
    req.png !== false && typeof svg === "string"
      ? await renderPng(svg, { scale, fonts: req.fonts })
      : undefined;
  // A tall diagram at a README width is still taller than a model can look at in one image. The
  // margin keeps resvg's rounding inside the box.
  const { width: dw, height: dh } = report.display;
  const fit = Math.min(LOOK_MAX / scene.width, LOOK_MAX / scene.height) * (1 - 1e-6);
  const look =
    png && typeof svg === "string" && (dw > LOOK_MAX || dh > LOOK_MAX)
      ? await renderPng(svg, { scale: fit, fonts: req.fonts })
      : undefined;
  return {
    report,
    ...(png ? { png } : {}),
    ...(look ? { look } : {}),
    scenes: rendered.scenes,
    diagnostics,
  };
}

/** The report as a terminal table plus one line per finding (the review command prints this). */
export function formatReview(report: ReviewReport, opts: { fixes?: boolean } = {}): string {
  const count = (d: ReviewDimension, sev: ReviewSeverity) =>
    report.findings.filter((f) => f.dimension === d && f.severity === sev).length;
  const lines = [
    `review ${report.name ?? "diagram"}: ${report.canvas.width}x${report.canvas.height} in a ${report.width}px column, seen at ${report.display.width}x${report.display.height} (scale ${report.scale}, ${report.theme})`,
    `score ${report.score}/100  ${report.pass ? "PASS" : "FAIL"} (pass = no blocker or major and score >= 85)`,
    "",
    "dimension    score  weight  blocker  major  minor",
    ...DIMENSIONS.map(
      (d) =>
        `${d.padEnd(12)} ${String(report.dimensions[d].score).padStart(5)}  ${String(report.dimensions[d].weight).padStart(6)}  ${String(count(d, "blocker")).padStart(7)}  ${String(count(d, "major")).padStart(5)}  ${String(count(d, "minor")).padStart(5)}`,
    ),
    "",
    `hard: overlaps ${report.hard.overlaps}, through nodes ${report.hard.edgesThroughNodes}, through headers ${report.hard.edgesThroughHeaders}, through labels ${report.hard.edgesThroughLabels}, off canvas ${report.hard.offCanvas}, contrast ${report.hard.contrastFailures}`,
  ];
  if (report.rubrics.length) lines.push(`rubrics: ${report.rubrics.join(", ")}`);
  if (report.findings.length) lines.push("");
  // Identical lines (the same claim on the same subjects) print once with a count.
  const seen = new Map<string, { f: ReviewFinding; n: number }>();
  for (const f of report.findings) {
    const subjects = f.subjects.length ? ` [${f.subjects.join(", ")}]` : "";
    const line = `${f.severity.padEnd(7)} ${f.id}${subjects} ${f.claim}`;
    const hit = seen.get(line);
    if (hit) hit.n++;
    else seen.set(line, { f, n: 1 });
  }
  for (const [line, { f, n }] of seen) {
    lines.push(n > 1 ? `${line} (x${n})` : line);
    if (opts.fixes !== false)
      for (const fix of f.fixes.slice(0, 2)) lines.push(`        fix: ${fix}`);
  }
  return lines.join("\n");
}
