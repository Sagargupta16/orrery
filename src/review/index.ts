// The measured half of the review board: scores one laid-out scene on six dimensions at the width
// readers will see it, so model reviewers only judge what code cannot measure. Every finding carries
// the numbers behind it, and the hard counts are the ratchet a patch must never raise.
// Protocol and rubrics: skills/orrery/references/review/.
import { renderModel } from "../render/index.ts";
import { renderPng } from "../render/png.ts";
import type { Box, Diagnostic, Model, Scene, ThemeName } from "../types.ts";
import { measureComposition } from "./composition.ts";
import { measureConventions } from "./conventions.ts";
import {
  DIMENSIONS,
  FINDINGS,
  type FindingId,
  type FindingKind,
  type ReviewDimension,
  type ReviewSeverity,
  WEIGHTS,
} from "./findings.ts";
import { measureFlow } from "./flow.ts";
import { footprint, r1, r2 } from "./geometry.ts";
import { measureGrid } from "./grid.ts";
import { measureLayout } from "./layout.ts";
import { edgeName } from "./names.ts";
import { measureOverlap } from "./overlap.ts";
import { measureQuality } from "./quality.ts";
import {
  type Ctx,
  DEFAULT_REVIEW_WIDTH,
  type DimensionScore,
  type HardCounts,
  type ReviewElement,
  type ReviewFinding,
  type ReviewOptions,
  type ReviewReport,
} from "./types.ts";

export type { FindingId, ReviewDimension, ReviewSeverity } from "./findings.ts";
export { DIMENSIONS, FINDINGS, WEIGHTS } from "./findings.ts";
export { formatReview } from "./format.ts";
export type {
  DimensionScore,
  HardCounts,
  ReviewElement,
  ReviewFinding,
  ReviewOptions,
  ReviewReport,
} from "./types.ts";
export { DEFAULT_REVIEW_WIDTH } from "./types.ts";

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

  const dimensions = scoreDimensions(spent, metrics);
  const score = r1(DIMENSIONS.reduce((sum, d) => sum + dimensions[d].score * WEIGHTS[d], 0));
  const rank: Record<ReviewSeverity, number> = { blocker: 0, major: 1, minor: 2 };
  findings.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      DIMENSIONS.indexOf(a.dimension) - DIMENSIONS.indexOf(b.dimension),
  );
  const elements = reviewElements(scene, ctx.foot, s);
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

/** Each dimension's score: 100 less what its findings cost, every finding id capped. */
function scoreDimensions(
  spent: Map<FindingId, number>,
  metrics: Record<ReviewDimension, Record<string, number | string>>,
): Record<ReviewDimension, DimensionScore> {
  return Object.fromEntries(
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
}

/** Every node, group and edge with its box in the display-width PNG. */
function reviewElements(scene: Scene, foot: Map<string, Box>, s: number): ReviewElement[] {
  const scaled = (b: Box): Box => ({
    x: r1(b.x * s),
    y: r1(b.y * s),
    w: r1(b.w * s),
    h: r1(b.h * s),
  });
  return [
    ...scene.nodes.map((n) => ({
      id: n.id,
      kind: "node" as const,
      label: n.label.lines.join(" "),
      box: scaled(foot.get(n.id) ?? n.box),
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
