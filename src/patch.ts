// Spec patches (the review loop's ops) applied to the YAML text, and candidate sets tried in
// parallel: each candidate is reviewed on its own copy, and only the ones that improve are kept.
import type { Args } from "./cli.ts";
import type { ReviewReport } from "./review.ts";
import type { Skin, ThemeName } from "./types.ts";

export type PatchOp =
  | { op: "set"; path: string; value: unknown }
  | { op: "unset"; path: string }
  | { op: "add"; path: string; value: unknown }
  | { op: "move"; path: string; after?: string; before?: string }
  | { op: "edge"; match: string | null; value: string | Record<string, unknown> | null };

export class PatchError extends Error {}

/** The spec text with the ops applied in order, comments and key order kept. Throws PatchError. */
export function applyPatches(_source: string, _ops: PatchOp[]): string {
  throw new PatchError("patches are not built yet");
}

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
}

export async function tryCandidates(_req: CandidateRequest): Promise<CandidateRun> {
  throw new PatchError("patches are not built yet");
}

export async function cmdPatch(_args: Args): Promise<void> {
  throw new Error("orrery patch is not built yet");
}
