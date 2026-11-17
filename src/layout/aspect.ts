// layout.aspect: the candidate layouts (as written, flow turned, layers wrapped) and the choice of
// the one nearest the target width:height that is no worse than the layout as written.

import { MAX_WIDTH } from "../check/canvas.ts";
import { checkScene } from "../check/index.ts";
import { type DiagramKind, type Direction, type Model, OWN_LAYOUT, type Scene } from "../types.ts";
import { hiddenOf, type LayoutOptions, withIgnored } from "./context.ts";
import {
  againstFlow,
  edgesThroughNodes,
  longestEdge,
  sceneCrossings,
  sceneDefects,
} from "./defects.ts";
import { layoutGridded } from "./hints.ts";
import { ELK_BUDGET } from "./sizes.ts";

const TURNED: Record<Direction, Direction> = {
  right: "down",
  down: "right",
  left: "up",
  up: "left",
};

/** Why layout.aspect does nothing in a kind with its own layout (OWN_LAYOUT). */
const OWN_REASON: Partial<Record<DiagramKind, string>> = {
  journey: "a journey keeps its stages in one row",
  sequence: "a sequence keeps its participants in one row and its messages in time order",
  timeline: "a timeline keeps its date axis across the canvas",
};

/**
 * layout.aspect: lays the diagram out as written, with the flow turned, and with ELK wrapping its
 * layers in either direction, and keeps the one whose canvas lands nearest the target
 * width:height without more edge crossings (as the review counts them), edges through nodes or
 * through groups that hold neither end, covered labels or arrowheads, or settings it had to drop
 * than the layout as written, and with the flow turned no more arrowheads against it (wrapping
 * points the edge from one row to the next back by design). Its width stays under the DG205 limit
 * (or the written width), its longest edge within 1.5 times the written one's or the canvas size
 * (sqrt of its area), and its mean edge under 0.6 of the canvas size: wrapping a chain stays below
 * both, while wrapped groups join through loops around the whole picture. When none of them lands
 * within a quarter of the target, the layout stays as written and DG219 names the nearest; past
 * ELK_BUDGET edges no other candidate is laid out.
 */
export async function layoutToAspect(model: Model, opts: LayoutOptions): Promise<Scene> {
  const target = model.aspect ?? 1;
  if (OWN_LAYOUT.has(model.kind)) {
    const scene = await layoutGridded(model, opts);
    const reason = OWN_REASON[model.kind] ?? "this kind places every node itself";
    return withIgnored(scene, [{ subject: "layout", setting: "layout.aspect", reason }]);
  }
  if (model.edges.length > ELK_BUDGET) {
    const scene = await layoutGridded(model, opts);
    const reason = `${model.edges.length} edges are more than the ${ELK_BUDGET} it lays out again in other shapes`;
    return withIgnored(scene, [{ subject: "layout", setting: "layout.aspect", reason }]);
  }
  const turned = { ...model, direction: TURNED[model.direction] };
  // Wrapping moves whole layers, which pools, lanes and the kinds that place nodes themselves undo.
  const wraps =
    hiddenOf(model).size === 0 && model.kind !== "tree" && model.kind !== "mindmap"
      ? (["MULTI_EDGE", "SINGLE_EDGE"] as const)
      : [];
  const tries: [Model, LayoutOptions][] = [
    [model, opts],
    [turned, opts],
    ...[model, turned].flatMap((m) =>
      wraps.map((wrap): [Model, LayoutOptions] => [m, { ...opts, wrap, ratio: target }]),
    ),
  ];
  const scenes: [Scene, Model, boolean][] = [];
  // A candidate ELK cannot lay out drops out of the search; DG219 counts them when it reports.
  let failed = 0;
  for (const [m, o] of tries) {
    try {
      scenes.push([await layoutGridded(m, o), m, !!o.wrap]);
    } catch (e) {
      if (!scenes.length) throw e;
      failed++;
    }
  }
  const [written] = scenes;
  if (!written) throw new Error("layout failed");
  const [first] = written;
  const throughGroups = (s: Scene, m: Model) =>
    checkScene(s, m).filter((d) => d.code === "DG223").length;
  const crossings0 = sceneCrossings(first);
  const through0 = edgesThroughNodes(first);
  const groups0 = throughGroups(first, model);
  const defects0 = sceneDefects(first);
  const against0 = againstFlow(first);
  const longest0 = longestEdge(first);
  const dropped0 = first.ignored?.length ?? 0;
  const ink = (s: Scene) =>
    s.edges.reduce(
      (t, e) =>
        t +
        e.points
          .slice(1)
          .reduce(
            (u, q, i) =>
              u + Math.abs(q.x - (e.points[i]?.x ?? q.x)) + Math.abs(q.y - (e.points[i]?.y ?? q.y)),
            0,
          ),
      0,
    );
  const reach = (s: Scene) =>
    ink(s) / Math.max(1, s.edges.length) / Math.sqrt(Math.max(1, s.width * s.height));
  const most = Math.max(0.6, 1.25 * reach(first));
  const off = (s: Scene) => Math.abs(Math.log(s.width / Math.max(1, s.height) / target));
  const best =
    scenes
      .filter(
        ([s, m, wrapped]) =>
          s === first ||
          (sceneCrossings(s) <= crossings0 &&
            edgesThroughNodes(s) <= through0 &&
            sceneDefects(s) <= defects0 &&
            (wrapped || againstFlow(s) <= against0) &&
            longestEdge(s) <= Math.max(1.5 * longest0, Math.sqrt(s.width * s.height)) &&
            s.width <= Math.max(MAX_WIDTH, first.width) &&
            (s.ignored?.length ?? 0) <= dropped0 &&
            reach(s) <= most &&
            throughGroups(s, m) <= groups0),
      )
      .map(([s]) => s)
      .sort((a, b) => off(a) - off(b))[0] ?? first;
  if (off(best) <= Math.log(1.25)) return best;
  const ratio = (s: Scene) => `${Math.round((s.width / Math.max(1, s.height)) * 100) / 100}:1`;
  const want = `${Math.round(target * 100) / 100}:1`;
  const other = best === first ? "" : `, the nearest other one ${ratio(best)}`;
  const lost = failed ? ` (${failed} more could not be laid out)` : "";
  return withIgnored(first, [
    {
      subject: "layout",
      setting: "layout.aspect",
      reason: `no layout as clean as the one written came within a quarter of ${want}; it is ${ratio(first)}${other}${lost}`,
    },
  ]);
}
