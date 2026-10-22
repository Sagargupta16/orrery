// One run of the core layout: the phases in order, then at most one second pass with what the
// first learned. This is layout's single recursion: a second pass never starts a third.

import { stageColors } from "../skins.ts";
import { type Model, OWN_LAYOUT, type Scene } from "../types.ts";
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
import { sequenceLayout } from "./sequence/index.ts";
import { straighten } from "./straighten.ts";
import { timelineLayout } from "./timeline/index.ts";
import { wallsOf } from "./walls.ts";

export async function layoutCore(model: Model, opts: LayoutOptions = {}): Promise<Scene> {
  const theme = opts.theme ?? model.theme;
  // A journey (stages and lanes), a sequence (lifelines and messages) and a timeline (an axis and
  // lanes) each have their own layout; undefined lays the spec out as a flow.
  if (OWN_LAYOUT.has(model.kind)) {
    const own =
      model.kind === "journey"
        ? journeyLayout
        : model.kind === "sequence"
          ? sequenceLayout
          : timelineLayout;
    const laid = await own(model, theme);
    // They place every node, so each rank, align and cols is reported unused.
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
  const drawn = edges.map((e) => ({ ...e, points: e.points.map((p) => ({ ...p })) }));
  // Fewer bends and ends on the icons, before the labels of free edges are placed on them.
  straighten(placed, edges, new Set(freeRoutes.keys()));
  const routed: Routed = { ...placed, edges, freeRoutes, rerouted, headers: walls.headers, drawn };
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
