// One run of the core layout: the phases in order, then at most one second pass with what the
// first learned. This is layout's single recursion: a second pass never starts a third.

import { stageColors } from "../skins.ts";
import type { Model, Scene } from "../types.ts";
import { clearBorders } from "./borders.ts";
import { sizeCanvas } from "./canvas.ts";
import {
  HOOKS,
  hiddenOf,
  type LayoutOptions,
  prepare,
  type Routed,
  withIgnored,
} from "./context.ts";
import { sceneDefects } from "./defects.ts";
import { sceneEdges, tidyEdges } from "./edges.ts";
import { rerouteBlocks, routeFree } from "./free-edges.ts";
import { buildGraph } from "./graph.ts";
import { journeyLayout } from "./journey/index.ts";
import { placeFreeLabels } from "./labels.ts";
import { clearOverlayBorders } from "./overlays.ts";
import { secondPass } from "./passes.ts";
import { planPlacement } from "./plan.ts";
import { readBack } from "./read.ts";
import { runLayout } from "./run.ts";
import { assemble } from "./scene.ts";
import { wallsOf } from "./walls.ts";

export async function layoutCore(model: Model, opts: LayoutOptions = {}): Promise<Scene> {
  const theme = opts.theme ?? model.theme;
  // A journey is a grid of stages and lanes with its own layout.
  if (model.kind === "journey") {
    const laid = await journeyLayout(model, theme);
    // Its stages and lanes place every step, so each rank, align and cols is reported unused.
    const grid = laid && withIgnored(laid, planPlacement(model, hiddenOf(model)).ignored);
    if (grid) return model.skin === "stage" ? stageColors(grid) : grid;
  }
  const graph = buildGraph(prepare(model, opts, theme));
  const placed = readBack(await runLayout(graph));

  const walls = wallsOf(placed);
  const freeRoutes = routeFree(placed, walls);
  const rerouted = rerouteBlocks(placed, walls, freeRoutes);
  const edges = sceneEdges(placed, freeRoutes, rerouted);
  tidyEdges(placed, edges);
  const routed: Routed = { ...placed, edges, freeRoutes, rerouted, headers: walls.headers };
  placeFreeLabels(routed);
  // After every label is placed, so a run that moves keeps off them all.
  clearBorders(placed, edges);

  const { horizontal, top, nodes, groups } = routed;
  const hooked = { model, theme, horizontal, top, nodes, groups, edges, routing: model.routing };
  for (const h of HOOKS) h.after?.(hooked);
  clearOverlayBorders(routed);

  const next = secondPass(routed);
  const again = next ? layoutCore(model, next) : undefined;
  // Without (or with flipped) rerouted edges ELK may close the gap a label needs: the second pass
  // wins unless it covers more than this one, which is finished below to compare.
  if (again && !rerouted.size) return again;

  const scene = assemble(routed, hooked.routing, sizeCanvas(routed));
  // The skin only recolors: every box and point above is the same for classic and stage.
  const done = model.skin === "stage" ? stageColors(scene) : scene;
  if (!again) return done;
  const second = await again;
  return sceneDefects(second) > sceneDefects(done) ? done : second;
}
