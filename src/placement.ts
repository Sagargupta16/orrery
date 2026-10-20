// Author-controlled placement and the router for edges drawn after ELK: the code lives in
// src/layout/ (plan.ts, defects.ts, elbows.ts, detour.ts, labels.ts, geometry.ts).
export { edgesThroughNodes, sceneCrossings, sceneDefects } from "./layout/defects.ts";
export { detour } from "./layout/detour.ts";
export {
  alongBorder,
  type Heads,
  laneRoutes,
  type RouteEnd,
  runsThrough,
} from "./layout/elbows.ts";
export { segmentHits } from "./layout/geometry.ts";
export { labelSpot } from "./layout/labels.ts";
export {
  type GridCell,
  gridCells,
  layersOf,
  type Plan,
  planPlacement,
  selfPlaced,
} from "./layout/plan.ts";
