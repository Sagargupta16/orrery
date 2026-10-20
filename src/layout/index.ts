// Layout: model in, Scene out. layout() runs the aspect search when the spec sets layout.aspect,
// then the cols, rank and align hints (hints.ts) around the core (core.ts), whose phases live in
// this folder: context, graph and graph-edges, run and grids (ELK), read, trim, groups, nodes and
// overlays, walls, free-edges, steer, edges, borders and labels, passes, canvas and scene. plan,
// defects, elbows and detour hold the placement plan, the scene measures and the free-edge router.

import type { Model, Scene } from "../types.ts";
import { layoutToAspect } from "./aspect.ts";
import type { LayoutOptions } from "./context.ts";
import { layoutGridded } from "./hints.ts";

export type { LayoutOptions } from "./context.ts";
export { fitIcons } from "./nodes.ts";
export { animateOf, SIZES } from "./sizes.ts";

export async function layout(model: Model, opts: LayoutOptions = {}): Promise<Scene> {
  return model.aspect === undefined ? layoutGridded(model, opts) : layoutToAspect(model, opts);
}
