// Composition checks on a laid-out scene: what a reviewer would flag by eye, as data an agent can act on.
import { canvasShape, longLabels, nodeCount, offCanvas } from "./checks/canvas.ts";
import {
  emptyGroups,
  ignoredSettings,
  layoutFallback,
  lonelyNodes,
  unexplainedLines,
} from "./checks/composition.ts";
import { type CheckOptions, checkContext, type Rule } from "./checks/context.ts";
import {
  edgeSkimsNode,
  edgeThroughHeader,
  edgeThroughLabel,
  edgeThroughNode,
} from "./checks/edges.ts";
import { badgesCover, edgeLabelCovers, labelOnBorder, nodesOverlap } from "./checks/overlaps.ts";
import { overlayEncloses, overlayHeaderCovers } from "./checks/overlays.ts";
import type { Diagnostic, Model, Scene } from "./types.ts";

export type { CheckOptions } from "./checks/context.ts";

/** Every rule, in the order its findings are reported. */
const RULES: Rule[] = [
  edgeThroughNode, // DG201
  edgeLabelCovers, // DG202
  nodesOverlap, // DG203
  longLabels, // DG204
  canvasShape, // DG205
  nodeCount, // DG206
  emptyGroups, // DG207
  lonelyNodes, // DG208
  edgeThroughHeader, // DG209
  offCanvas, // DG210
  badgesCover, // DG211
  edgeThroughLabel, // DG212
  overlayEncloses, // DG213
  overlayHeaderCovers, // DG214
  unexplainedLines, // DG217
  layoutFallback, // DG218
  ignoredSettings, // DG219
  labelOnBorder, // DG220
  edgeSkimsNode, // DG221
];

export function checkScene(scene: Scene, model: Model, opts: CheckOptions = {}): Diagnostic[] {
  const ctx = checkContext(scene, model, opts);
  for (const rule of RULES) rule(ctx);
  return ctx.out;
}
