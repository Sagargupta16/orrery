// What an edge drawn after ELK must not run through: the nodes it does not connect with their
// text, group headers, the labels of the edges ELK routed, its own ends, and the group borders
// and titles it keeps off.

import type { Box, ModelEdge } from "../types.ts";
import type { Placed } from "./context.ts";
import { findEdge } from "./elk.ts";
import { round, union } from "./geometry.ts";

export interface Walls {
  /** Group headers (label and icon) with a margin. */
  headers: { id: string; box: Box }[];
  /** The borders of the groups ELK laid out. */
  borders: Box[];
  /** Their titles' text, which a line keeps 6px off (DG225). */
  titles: Box[];
  walls(e: ModelEdge): Box[];
  /** Walls with a margin, for new routes: 4px off text and headers, 10px off node boxes (DG221). */
  roomyWalls(e: ModelEdge): Box[];
}

export function wallsOf(ctx: Placed): Walls {
  const { model, result, top, edgeLabels, rel, groups, nodes } = ctx;
  // What a free edge must not run through: each node it does not connect, with its text, the
  // group headers (an overlay it ends on steers clear itself), and the labels and steps of the
  // edges ELK routed.
  const elkMarks = model.edges.flatMap((e) => {
    const lab = edgeLabels.get(e.id);
    const at = rel.free(e) || !lab ? undefined : findEdge(result, e.id)?.labels?.[0];
    return at?.x === undefined || at.y === undefined
      ? []
      : [
          {
            id: e.id,
            box: { x: round(at.x), y: round(at.y + top), w: lab?.w ?? 0, h: lab?.h ?? 0 },
          },
        ];
  });
  const headers = groups.flatMap((g) => {
    const parts = [g.label.lines.length ? g.labelBox : undefined, g.iconBox].filter(
      (b): b is Box => !!b && b.w > 0 && b.h > 0,
    );
    if (!parts.length) return [];
    const u = union(parts);
    return [{ id: g.id, box: { x: u.x - 4, y: u.y - 1, w: u.w + 8, h: u.h + 2 } }];
  });
  const ends = (e: ModelEdge) => nodes.filter((n) => n.id === e.from || n.id === e.to);
  const others = (e: ModelEdge): Box[] => [
    ...nodes
      .filter((n) => n.id !== e.from && n.id !== e.to)
      .map((n) => union([n.box, n.iconBox, n.labelBox, n.noteBox])),
    ...headers
      .filter((h) => !(rel.overlays.has(h.id) && (h.id === e.from || h.id === e.to)))
      .map((h) => h.box),
    ...elkMarks.filter((m) => m.id !== e.id).map((m) => m.box),
  ];
  // Its own ends too, piece by piece and without a margin: a line arriving from outside only
  // touches them, one that runs through its own node does not. An icon node is its icon and its
  // text: a line may cross the empty strip beside the icon to meet it at its center line.
  const own = (e: ModelEdge): Box[] =>
    ends(e).flatMap((n) =>
      [n.look === "icon" && n.iconBox ? n.iconBox : n.box, n.labelBox, n.noteBox].filter(
        (b): b is Box => !!b && b.w > 0,
      ),
    );
  const walls = (e: ModelEdge): Box[] => [...others(e), ...own(e)];
  const roomyWalls = (e: ModelEdge): Box[] => [
    ...others(e).map((b) => ({ x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 })),
    ...nodes
      .filter((n) => n.id !== e.from && n.id !== e.to)
      .map((n) => ({ x: n.box.x - 10, y: n.box.y - 10, w: n.box.w + 20, h: n.box.h + 20 })),
    ...own(e),
  ];
  const borders = groups.filter((g) => !g.overlay).map((g) => g.box);
  const titles = groups.filter((g) => !g.overlay && g.label.lines.length).map((g) => g.labelBox);
  return { headers, borders, titles, walls, roomyWalls };
}
