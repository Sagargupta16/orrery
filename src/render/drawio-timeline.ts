// draw.io cells for a timeline (Scene.timeline): the axis and its ticks, lane bands, today marker.
//
// Stub from the foundation lane; the TL lane owns this file and replaces the body.
// Called from: src/render/drawio.ts renderDrawio when the scene has a timeline, where the journey
// grid is drawn: after the title, before groups, nodes and edges (so the cells sit under them).
// Return the cells in paint order; ids must not start with "n-", "g-" or "e" plus a digit, which
// the nodes, groups and edges use. drawio.ts exports its helpers (style, geometry, FONT, n ...).

import type { Scene } from "../types.ts";
import type { Ctx } from "./drawio.ts";

export function timelineDrawio(_ctx: Ctx, _scene: Scene): string[] {
  return [];
}
