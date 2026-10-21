// The review report's shapes, its options and the context every measure writes findings into.
import type { PatchOp } from "../patch/index.ts";
import type { Box, Direction, Model, Scene, SceneGroup, SceneNode, ThemeName } from "../types.ts";
import type { FindingId, ReviewDimension, ReviewSeverity } from "./findings.ts";

/** A README column on GitHub: what most readers see. */
export const DEFAULT_REVIEW_WIDTH = 880;

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

export interface Ctx {
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
    /** The rubric rule this finding restates, when it depends on the vendor (else the kind's). */
    rule?: string,
  ) => void;
  metrics: Record<ReviewDimension, Record<string, number | string>>;
  hard: HardCounts;
}
