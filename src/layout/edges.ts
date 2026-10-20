// Scene edges: ELK's sections (a flipped edge's read backwards) with their label and step boxes,
// the routes drawn after ELK, then real bends only and ends straightened onto their sides.

import type { Box, ModelEdge, Point, SceneEdge } from "../types.ts";
import type { Placed } from "./context.ts";
import { type ElkSection, findEdge } from "./elk.ts";
import { dropStraightPoints, round } from "./geometry.ts";
import { SIZES } from "./sizes.ts";
import { straightenEnd } from "./steer.ts";

/** ELK's section from the edge's source to its target (a flipped edge's, backwards). */
export const sectionPoints = (ctx: Placed, e: ModelEdge, sec: ElkSection): Point[] => {
  const pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map(ctx.shift);
  return ctx.opts.flip?.has(e.id) ? pts.reverse() : pts;
};

/** The route ELK drew for an edge it laid out, without points inside straight runs. */
export const elkRoute = (ctx: Placed, e: ModelEdge) => {
  const sec = ctx.rel.free(e) ? undefined : findEdge(ctx.result, e.id)?.sections?.[0];
  return sec ? dropStraightPoints(sectionPoints(ctx, e, sec)) : undefined;
};

export function sceneEdges(
  ctx: Placed,
  freeRoutes: Map<string, Point[]>,
  rerouted: Set<string>,
): SceneEdge[] {
  const { model, result, top, edgeLabels, rel } = ctx;
  const edges: SceneEdge[] = [];
  for (const e of model.edges) {
    if (rel.free(e) || rerouted.has(e.id)) {
      const points = freeRoutes.get(e.id);
      if (points)
        edges.push({
          id: e.id,
          from: e.from,
          to: e.to,
          points,
          line: e.line,
          arrow: e.arrow,
          color: e.color,
          step: e.step,
          ...(e.flow ? { flow: e.flow } : {}),
        });
      continue;
    }
    const el = result.edges?.find((x) => x.id === e.id) ?? findEdge(result, e.id);
    const section = el?.sections?.[0];
    if (!el || !section) continue;
    const points = sectionPoints(ctx, e, section);
    const edge: SceneEdge = {
      id: e.id,
      from: e.from,
      to: e.to,
      points,
      line: e.line,
      arrow: e.arrow,
      color: e.color,
      step: e.step,
      ...(e.flow ? { flow: e.flow } : {}),
    };
    const lab = edgeLabels.get(e.id);
    const elkLabel = el.labels?.[0];
    if (lab && elkLabel?.x !== undefined && elkLabel.y !== undefined) {
      const box = {
        x: round(elkLabel.x),
        y: round(elkLabel.y + top),
        w: lab.w,
        h: lab.h,
      };
      if (e.step !== undefined) {
        edge.stepBox = {
          x: box.x,
          y: round(box.y + (box.h - SIZES.step) / 2),
          w: SIZES.step,
          h: SIZES.step,
        };
      }
      if (e.label) {
        edge.label = lab.block;
        edge.labelBox = {
          x: round(box.x + lab.stepW + (lab.stepW ? 2 : 0)),
          y: box.y,
          w: round(lab.w - lab.stepW - (lab.stepW ? 2 : 0)),
          h: lab.h,
        };
      }
    }
    edges.push(edge);
  }
  return edges;
}

/** Spline points are Bezier controls; the other routings keep only real bends. */
export function tidyEdges(ctx: Placed, edges: SceneEdge[]): void {
  const { model, groups, nodes } = ctx;
  if (model.routing !== "spline") for (const e of edges) e.points = dropStraightPoints(e.points);
  if (model.routing === "orthogonal") {
    // An end may slide along the icon it points at, or along the box it leaves.
    const sides = new Map<string, Box[]>([
      ...groups.filter((g) => !g.overlay).map((g): [string, Box[]] => [g.id, [g.box]]),
      ...nodes.map((n): [string, Box[]] => [
        n.id,
        n.look === "icon" && n.iconBox ? [n.iconBox, n.box] : [n.box],
      ]),
    ]);
    for (const e of edges) {
      straightenEnd(e, "to", sides.get(e.to), edges);
      straightenEnd(e, "from", sides.get(e.from), edges);
      e.points = dropStraightPoints(e.points);
    }
  }
}
