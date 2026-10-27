// Candidate op sets reviewed in parallel, each on its own copy; one is kept only when it improves.
import { basename } from "node:path";
import {
  DEFAULT_REVIEW_WIDTH,
  type HardCounts,
  improves,
  type ReviewReport,
  reviewModel,
} from "../review/index.ts";
import { parseSpec } from "../spec/index.ts";
import type { Diagnostic, Model, Skin, ThemeName } from "../types.ts";
import { applyPatches } from "./apply.ts";
import { PatchError, type PatchOp } from "./types.ts";

export interface CandidateResult {
  /** Position in the candidates list, from 0. */
  index: number;
  ops: PatchOp[];
  /** The patched spec text, when every op applied and it parsed. */
  source?: string;
  report?: ReviewReport;
  /** improves(before, report) from review.ts. */
  kept: boolean;
  /** Why it was kept or dropped, in one line. */
  reason: string;
}

export interface CandidateRun {
  before: ReviewReport;
  results: CandidateResult[];
  /** The kept candidate with the highest score. */
  best?: CandidateResult;
}

export interface CandidateRequest {
  source: string;
  filename: string;
  candidates: PatchOp[][];
  width?: number;
  theme?: ThemeName;
  skin?: Skin;
  /** Extra font files, as `orrery review --font`. */
  fonts?: string[];
  /** Runs on each patched text before it is parsed: a reason drops the candidate unreviewed. */
  check?: (source: string) => string | undefined;
}

export const HARD: Record<keyof HardCounts, string> = {
  overlaps: "overlaps",
  edgesThroughNodes: "through nodes",
  edgesThroughHeaders: "through headers",
  edgesThroughLabels: "through labels",
  offCanvas: "off canvas",
  contrastFailures: "contrast",
};
export const HARD_KEYS = Object.keys(HARD) as (keyof HardCounts)[];
export const serious = (r: ReviewReport) => r.findings.filter((f) => f.severity !== "minor").length;
const nodeCount = (r: ReviewReport) => r.elements.filter((e) => e.kind === "node").length;

/** The first guard of improves() that `after` fails, in words. */
function whyNot(before: ReviewReport, after: ReviewReport): string {
  const worse = HARD_KEYS.filter((k) => after.hard[k] > before.hard[k]);
  if (worse.length)
    return `hard count went up: ${worse.map((k) => `${HARD[k]} ${before.hard[k]} -> ${after.hard[k]}`).join(", ")}`;
  if (serious(after) > serious(before))
    return `blockers plus majors went up: ${serious(before)} -> ${serious(after)}`;
  if (nodeCount(after) < nodeCount(before))
    return `a node was removed: ${nodeCount(before)} -> ${nodeCount(after)} nodes`;
  if (after.score <= before.score) return `score did not go up: ${before.score} -> ${after.score}`;
  return "reviewed at another width or theme";
}

const errorsOf = (list: Diagnostic[]) =>
  list
    .filter((d) => d.severity === "error")
    .slice(0, 3)
    .map((d) => `${d.code} ${d.message}`)
    .join("; ");

/**
 * Reviews the spec once and every candidate on its own copy, all at once, at the same width and
 * theme; a candidate is kept only when improves() says so, and the best is the top kept score.
 */
export async function tryCandidates(req: CandidateRequest): Promise<CandidateRun> {
  const name = basename(req.filename).replace(/\.(ya?ml|json)$/i, "");
  const base = parseSpec(req.source, req.filename);
  if (!base.model) throw new PatchError(`${name} has errors: ${errorsOf(base.diagnostics)}`);
  const theme = req.theme ?? base.model.theme;
  const review = async (model: Model, diagnostics: Diagnostic[]) =>
    (
      await reviewModel({
        model: req.skin ? { ...model, skin: req.skin } : model,
        name,
        width: req.width ?? DEFAULT_REVIEW_WIDTH,
        theme,
        fonts: req.fonts,
        diagnostics,
        png: false,
      })
    ).report;
  const attempt = async (ops: PatchOp[]) => {
    let source: string;
    try {
      source = applyPatches(req.source, ops);
    } catch (e) {
      if (e instanceof PatchError) return { reason: e.message };
      throw e;
    }
    const refused = req.check?.(source);
    if (refused) return { reason: refused };
    const parsed = parseSpec(source, req.filename);
    if (!parsed.model)
      return { reason: `the patched spec has errors: ${errorsOf(parsed.diagnostics)}` };
    try {
      return { source, report: await review(parsed.model, parsed.diagnostics) };
    } catch (e) {
      return { source, reason: `review failed: ${(e as Error).message}` };
    }
  };
  const [before, ...tries] = await Promise.all([
    review(base.model, base.diagnostics),
    ...req.candidates.map(attempt),
  ]);
  const results = tries.map((t, index): CandidateResult => {
    const ops = req.candidates[index] ?? [];
    const out = { index, ops, ...(t.source !== undefined ? { source: t.source } : {}) };
    if (!t.report) return { ...out, kept: false, reason: t.reason ?? "not reviewed" };
    const kept = improves(before, t.report);
    return {
      ...out,
      report: t.report,
      kept,
      reason: kept ? `score ${before.score} -> ${t.report.score}` : whyNot(before, t.report),
    };
  });
  const best = results
    .filter((r) => r.kept)
    .sort(
      (a, b) =>
        (b.report?.score ?? 0) - (a.report?.score ?? 0) ||
        a.ops.length - b.ops.length ||
        a.index - b.index,
    )[0];
  return { before, results, ...(best ? { best } : {}) };
}
