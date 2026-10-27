// renderStage: one context for the scene, then every layer in paint order, defs gathered on the way.

import { tokensFor } from "../../themes.ts";
import type { Scene } from "../../types.ts";
import { journeyStage } from "../journey.ts";
import { laneStage } from "../lanes.ts";
import { sequenceStage } from "../sequence.ts";
import { accessibleName, esc, FLOW_CSS, type SvgOptions } from "../svg.ts";
import { timelineStage } from "../timeline.ts";
import type { Ctx } from "./ctx.ts";
import { canvas, titles } from "./draw-backdrop.ts";
import { edgeBase, edgeLit, motion, wireOf } from "./draw-edges.ts";
import { groupFrame, groupHeader } from "./draw-groups.ts";
import { edgeLabel, legend } from "./draw-labels.ts";
import { labelRoom, node } from "./draw-nodes.ts";
import { storyPlan } from "./story.ts";
import { common, EDGE, LABEL, MONO, NOTE, sizeFor } from "./text.ts";
import { GROUPS_ON, lit } from "./timing.ts";

/** Hairlines are one pixel wide at this display width (a README column); wider SVGs draw them wider. */
const DISPLAY = 880;

/** Scene-wide sizes for node and edge labels, so neighbors match. */
function labelSizes(scene: Scene): Ctx["sizes"] {
  return {
    label: common(
      scene.nodes.map((nd) => sizeFor(nd.label.lines, LABEL, labelRoom(nd))),
      LABEL.size,
    ),
    note: common(
      scene.nodes.flatMap((nd) => (nd.note ? [sizeFor(nd.note.lines, NOTE, labelRoom(nd))] : [])),
      NOTE.size,
    ),
    edge: common(
      scene.edges.flatMap((e) =>
        e.label && e.labelBox ? [sizeFor(e.label.lines, EDGE, e.labelBox.w - 8, 7)] : [],
      ),
      EDGE.size,
    ),
  };
}

function context(scene: Scene, opts: SvgOptions): Ctx {
  const t = tokensFor(scene);
  const k = t.stage;
  if (!k) throw new Error("renderStage needs the stage skin");
  const prefix = opts.idPrefix ? `${opts.idPrefix.replace(/[^A-Za-z0-9_-]/g, "")}-` : "";
  const h = 1 / Math.min(1, DISPLAY / Math.max(1, scene.width));
  return {
    t,
    k,
    prefix,
    scene,
    h,
    story: storyPlan(scene, h),
    sizes: labelSizes(scene),
    symbols: new Map(),
    filters: new Map(),
    defs: [],
  };
}

export function renderStage(scene: Scene, opts: SvgOptions = {}): string {
  const ctx = context(scene, opts);
  const { t, k, prefix, h } = ctx;
  const { width: W, height: H } = scene;
  const titleId = `${prefix}sdw-title`;
  const descId = `${prefix}sdw-desc`;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${titleId} ${descId}" font-family="${esc(MONO)}">`,
  );
  out.push(`<title id="${titleId}">${esc(accessibleName(scene))}</title>`);
  out.push(`<desc id="${descId}">${esc(scene.description)}</desc>`);
  if (scene.animate === "flow") out.push(`<style>${FLOW_CSS}</style>`);
  const defsAt = out.length;
  out.push(canvas(ctx), ...titles(ctx));
  if (scene.journey) out.push(journeyStage(scene, k, t, h));
  if (scene.timeline) out.push(timelineStage(scene, k, t, h, ctx));
  // Pools and lanes are bands with a label strip; everything else is a frame and a header.
  const lanes = new Map(
    scene.groups.map((g) => [
      g.id,
      g.lane ? laneStage(g, k, t, h, (body) => lit(ctx, body, GROUPS_ON)) : undefined,
    ]),
  );
  for (const g of scene.groups)
    out.push(`<g id="${prefix}g-${g.id}">${lanes.get(g.id)?.frame ?? groupFrame(ctx, g)}</g>`);
  // Lifelines, fragments and activations: over the participants' opaque panels, under messages.
  if (scene.sequence) out.push(sequenceStage(scene, k, t, h, ctx));
  const wires = new Map(scene.edges.map((e) => [e.id, wireOf(ctx, e)]));
  for (const e of scene.edges) {
    const w = wires.get(e.id);
    if (!w) continue;
    const runs = ctx.story.runs.get(e.id);
    out.push(
      `<g id="${prefix}e-${e.id}">${edgeBase(ctx, e, w)}${runs ? edgeLit(ctx, e, w, runs) : ""}</g>`,
    );
  }
  for (const e of scene.edges) {
    const label = edgeLabel(ctx, e);
    if (label) out.push(label);
  }
  for (const g of scene.groups) {
    const header = lanes.get(g.id)?.header ?? groupHeader(ctx, g);
    if (header) out.push(`<g id="${prefix}gh-${g.id}">${header}</g>`);
  }
  for (const nd of scene.nodes) out.push(node(ctx, nd));
  if (ctx.story.animated) out.push(motion(ctx, wires));
  out.push(legend(ctx));
  if (ctx.defs.length) out.splice(defsAt, 0, `<defs>${ctx.defs.join("")}</defs>`);
  out.push("</svg>");
  return `${out.filter(Boolean).join("\n")}\n`;
}
