// layout.aspect: the candidate layouts (as written, flow turned, layers wrapped) and the choice of
// the one nearest the target width:height that is no worse than the layout as written.

import type { Direction, Model, Scene } from "../types.ts";
import { hiddenOf, type LayoutOptions, withIgnored } from "./context.ts";
import { edgesThroughNodes, sceneCrossings, sceneDefects } from "./defects.ts";
import { layoutGridded } from "./hints.ts";

const TURNED: Record<Direction, Direction> = {
  right: "down",
  down: "right",
  left: "up",
  up: "left",
};

/**
 * layout.aspect: lays the diagram out as written, with the flow turned, and with ELK wrapping its
 * layers in either direction, and keeps the one whose canvas lands nearest the target
 * width:height without more edge crossings, edges through nodes, covered labels or arrowheads,
 * or settings it had to drop than the layout as written, and whose mean edge stays under 0.6 of
 * the canvas size (sqrt of its area): wrapping a chain stays below it, while wrapped groups join
 * through loops around the whole picture.
 */
export async function layoutToAspect(model: Model, opts: LayoutOptions): Promise<Scene> {
  const target = model.aspect ?? 1;
  if (model.kind === "journey") {
    const scene = await layoutGridded(model, opts);
    return withIgnored(scene, [
      {
        subject: "layout",
        setting: "layout.aspect",
        reason: "a journey keeps its stages in one row",
      },
    ]);
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
  const scenes: Scene[] = [];
  for (const [m, o] of tries) {
    try {
      scenes.push(await layoutGridded(m, o));
    } catch (e) {
      if (!scenes.length) throw e;
    }
  }
  const [first] = scenes;
  if (!first) throw new Error("layout failed");
  const crossings0 = sceneCrossings(first);
  const through0 = edgesThroughNodes(first);
  const defects0 = sceneDefects(first);
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
        (s) =>
          sceneCrossings(s) <= crossings0 &&
          edgesThroughNodes(s) <= through0 &&
          sceneDefects(s) <= defects0 &&
          (s.ignored?.length ?? 0) <= dropped0 &&
          reach(s) <= most,
      )
      .sort((a, b) => off(a) - off(b))[0] ?? first;
  if (off(best) <= Math.log(1.25)) return best;
  const ratio = (v: number) => `${Math.round(v * 100) / 100}:1`;
  return withIgnored(best, [
    {
      subject: "layout",
      setting: "layout.aspect",
      reason: `the nearest layout is ${ratio(best.width / Math.max(1, best.height))}, not ${ratio(target)}`,
    },
  ]);
}
