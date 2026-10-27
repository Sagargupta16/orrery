// Reading ELK's result back: every placed ELK node by id, group frames trimmed and stretched, then
// scene groups, scene nodes, the overlays drawn around them and the nodes moved onto borders.

import type { Box, Point, SceneGroup } from "../types.ts";
import type { Laid, Placed } from "./context.ts";
import type { ElkNode } from "./elk.ts";
import { round } from "./geometry.ts";
import { type HeaderRoom, paintGroup } from "./groups.ts";
import { sceneNodes } from "./nodes.ts";
import { drawOverlays, overlaysAround } from "./overlays.ts";
import { seatNodes } from "./seats.ts";
import { SIZES } from "./sizes.ts";
import { stretchColumns, trimGroups } from "./trim.ts";

export function readBack(ctx: Laid): Placed {
  const { model, titleBlock, subtitleBlock, result } = ctx;
  // Whole pixels, so the drawing under a title keeps ELK's integer grid.
  const top = titleBlock
    ? Math.ceil(SIZES.pad + titleBlock.height + (subtitleBlock ? subtitleBlock.height + 4 : 0) - 6)
    : 0;
  const shift = (p: Point): Point => ({ x: round(p.x), y: round(p.y + top) });
  const placed = new Map<string, ElkNode>();
  const walk = (n: ElkNode) => {
    placed.set(n.id, n);
    for (const c of n.children ?? []) walk(c);
  };
  walk(result);

  const elkEdges = [...placed.values()].flatMap((n) => n.edges ?? []);
  trimGroups(ctx, placed, elkEdges);
  stretchColumns(model, placed, elkEdges);

  const groups: SceneGroup[] = [];
  const headerRoom = new Map<string, HeaderRoom>();
  const paint = { ...ctx, headerRoom };
  for (const grp of model.groups) {
    if (grp.around) continue;
    const el = placed.get(grp.id);
    if (!el) continue;
    const box: Box = {
      x: round(el.x ?? 0),
      y: round((el.y ?? 0) + top),
      w: round(el.width ?? 0),
      h: round(el.height ?? 0),
    };
    const sg = paintGroup(paint, grp, box, false);
    if (sg) groups.push(sg);
  }
  groups.sort((a, b) => a.depth - b.depth);

  const nodes = sceneNodes(ctx, placed, groups, top);
  drawOverlays(paint, groups, nodes);
  const read = { ...ctx, top, shift, placed, headerRoom, groups, nodes };
  // Seats are tried against the overlays drawn around ELK's spots; an overlay around a node that
  // moved onto a border then follows it there.
  const { seats, grow } = seatNodes(read);
  const moved = overlaysAround(model, new Set(seats.keys()));
  if (moved.size) drawOverlays(paint, groups, nodes, moved);
  return { ...read, seats, seatGrow: grow };
}
