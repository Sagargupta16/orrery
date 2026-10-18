// The measured half of the review board: scores one laid-out scene on six dimensions at the width
// readers will see it, so model reviewers only judge what code cannot measure. Every finding carries
// the numbers behind it, and the hard counts are the ratchet a patch must never raise.
// Protocol and rubrics: skills/stackdraw/references/review/.
import { contrast, isHex, mixHex } from "./color.ts";
import { aliases, iconAspect, iconInfo, resolveIcon } from "./icons.ts";
import { renderModel } from "./render/index.ts";
import { renderPng } from "./render/png.ts";
import { THEME_TOKENS } from "./themes.ts";
import type {
  Box,
  Diagnostic,
  Direction,
  Model,
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

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word (optionally plural) match of a phrase in normalized text. */
const hasPhrase = (text: string, phrase: string) =>
  !!phrase && new RegExp(`(^| )${escapeRe(norm(phrase))}s?( |$)`).test(text);

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
  /** The hard count each such diagnostic raises. */
  hard: keyof HardCounts;
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
    hard[rule.hard]++;
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
    const hb = headerBottom(p);
    const clear = {
      left: box.x - p.box.x,
      right: p.box.x + p.box.w - (box.x + box.w),
      top: box.y - hb,
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
    if (reps.length >= 3) {
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
  const none = scene.edges.filter((e) => e.arrow === "none");
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

  // Unlabelled edges that cross a group boundary.
  const chain = (id: string) => {
    const out = new Set<string>();
    for (let p = c.parentOf(id); p; p = c.parentOf(p)) out.add(p);
    return out;
  };
  const crossing = model.edges.filter((e) => {
    if (e.label) return false;
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
  if (against.length) {
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

  // Content centering inside groups.
  let offCenter = 0;
  for (const g of frames) {
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
  const t = THEME_TOKENS[scene.theme];
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

const C4_TYPE =
  /\[(person|software system|external (software )?system|system|container|component|database|queue)\b([^\]]*)\]/i;

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
  const vendors = [
    ...["aws", "azure", "gcp", "k8s"].filter((p) => packs.has(p)),
    ...(c4 ? ["c4"] : []),
  ];
  const rubrics = vendors.filter((v) => v !== "k8s").map((v) => `conventions-${v}.md`);

  // Legend for line styles (Azure Well-Architected, C4 notation).
  const used = [...new Set(model.edges.map((e) => e.line))].filter((l) => l !== "solid");
  const keyed = new Set((model.legend ?? []).map((l) => l.line));
  const missing = used.filter((l) => !keyed.has(l));
  if (missing.length || (c4 && !model.legend?.length)) {
    const styles = missing.length ? missing : ["solid"];
    add(
      "conventions.legend-missing",
      "major",
      model.edges.filter((e) => styles.includes(e.line)).map((e) => e.id),
      {
        styles: styles.join(","),
        edges: model.edges.filter((e) => styles.includes(e.line)).length,
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
      const core = full.replace(/^(Amazon|AWS)\s+/, "");
      const acronym = core
        .split(/\s+/)
        .filter((w) => /^[A-Z]/.test(w))
        .map((w) => w[0])
        .join("");
      const form = [core, acronym.length >= 2 ? acronym : "", ...aliasesFor(info.id)].find((f) =>
        hasPhrase(label, f),
      );
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
    calloutSizes: callouts.size,
    c4Elements,
    c4Relations,
    recolored,
    gcpIconMismatches: gcpWrong,
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
    add: (id, severity, subjects, evidence, claim, fixes, cost) => {
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

export interface ReviewRun {
  report: ReviewReport;
  /** Still PNG at the display width, one pixel per CSS px: what the reader sees. */
  png?: Uint8Array;
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
  return { report, ...(png ? { png } : {}), scenes: rendered.scenes, diagnostics };
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
  for (const f of report.findings) {
    const subjects = f.subjects.length ? ` [${f.subjects.join(", ")}]` : "";
    lines.push(`${f.severity.padEnd(7)} ${f.id}${subjects} ${f.claim}`);
    if (opts.fixes !== false)
      for (const fix of f.fixes.slice(0, 2)) lines.push(`        fix: ${fix}`);
  }
  return lines.join("\n");
}
