// The second pass: headers slid off the edges crossing them, and what the first pass learned
// (corner labels no position clears, overlay headers on group headers, rerouted align edges,
// groups too short for their border nodes) turned into options for one more run of the core.

import type { Box, SceneGroup } from "../types.ts";
import type { LayoutOptions, Routed } from "./context.ts";
import { union } from "./geometry.ts";
import { clearHeader } from "./groups.ts";
import { attachBox } from "./steer.ts";

/** Slides every header clear, and returns the second pass's options when it needs one. */
export function secondPass(ctx: Routed): LayoutOptions | undefined {
  const { model, opts, horizontal, groups, nodes, edges, headerRoom, groupGeom, rerouted } = ctx;
  const grow = ctx.seatGrow;
  const blocked: string[] = [];
  for (const g of groups) {
    const room = headerRoom.get(g.id);
    if (!room) continue;
    // A header the routes before straighten could not slide off counts too (tried on a copy, so
    // only the final routes move it): the second pass then gets the room it would have got anyway.
    const copy = { ...g, labelBox: { ...g.labelBox }, iconBox: g.iconBox && { ...g.iconBox } };
    const mates = groups.map((o) => (o === g ? copy : o));
    const before = clearHeader(copy, room, mates, nodes, ctx.drawn);
    if (!clearHeader(g, room, groups, nodes, edges) || !before) blocked.push(g.id);
  }
  // In vertical flows a corner label that every position leaves under an edge gets a wider group.
  // Only groups ELK lays out (not overlays) and only when the wider minimum would change them.
  const widen = blocked.filter((id) => {
    const gg = groupGeom.get(id);
    const box = groups.find((g) => g.id === id)?.box;
    if (!gg || !box || gg.center || gg.iconStyle === "tile-center") return false;
    if (model.groups.find((g) => g.id === id)?.around) return false;
    return box.w + 0.5 < Math.max(gg.minWidth, 2 * (gg.minWidth - 10));
  });
  const room = overlayRoom(ctx);
  const wider = !horizontal && widen.length > 0;
  // A rerouted edge whose target comes earlier in the flow is a back edge: ELK lays it out
  // reversed in the second pass. Any other one is drawn after layout.
  const sign = model.direction === "left" || model.direction === "up" ? -1 : 1;
  const along = (id: string) => {
    const b = attachBox(ctx, id)?.full;
    return b ? (horizontal ? b.x + b.w / 2 : b.y + b.h / 2) * sign : 0;
  };
  const back = new Set(
    [...rerouted].filter((id) => {
      const e = model.edges.find((x) => x.id === id);
      return !!e && along(e.from) > along(e.to) + 1;
    }),
  );
  const loose = new Set([...rerouted].filter((id) => !back.has(id)));
  return !opts.widen &&
    !opts.room &&
    !opts.loose &&
    !opts.flip &&
    !opts.grow &&
    (wider || room.size || rerouted.size || grow.size)
    ? {
        ...opts,
        widen: wider ? new Set(widen) : undefined,
        room: room.size ? room : undefined,
        loose: loose.size ? loose : undefined,
        flip: back.size ? back : undefined,
        ...(grow.size ? { grow } : {}),
      }
    : undefined;
}

// An overlay's header sits above its members, so when they are the first row of their group it
// lands on that group's header (or one above it). The second pass gives each member's own group
// more top padding, which moves the members, and the header with them, down until it clears.
function overlayRoom(ctx: Routed): Map<string, number> {
  const { model, groups, rel } = ctx;
  const room = new Map<string, number>();
  const headOf = (g: SceneGroup): Box | undefined => {
    const parts = [g.label.lines.length ? g.labelBox : undefined, g.iconBox].filter(
      (b): b is Box => !!b && b.w > 0 && b.h > 0,
    );
    return parts.length ? union(parts) : undefined;
  };
  const hits = (a: Box, b: Box) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const ov of groups) {
    const head = ov.overlay ? headOf(ov) : undefined;
    if (!head) continue;
    let need = 0;
    for (const g of groups) {
      const h = g.overlay ? undefined : headOf(g);
      if (h && hits(head, h)) need = Math.max(need, h.y + h.h + 8 - head.y);
    }
    if (need <= 0) continue;
    for (const id of rel.overlays.get(ov.id) ?? []) {
      const parent =
        model.nodes.find((n) => n.id === id)?.parent ??
        model.groups.find((g) => g.id === id)?.parent;
      if (parent && !rel.overlays.has(parent))
        room.set(parent, Math.max(room.get(parent) ?? 0, Math.ceil(need)));
    }
  }
  return room;
}
