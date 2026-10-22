// Entity-relationship diagrams (kind: er): an entity with fields is a table, a header (icon,
// label, note) over one row per field, and each relationship line ends on the rows it joins, at
// the row's center line, with its cardinality at both ends (render/er.ts draws the marks).
//
// ELK lays the tables out as boxes of the size measured in table.ts (erGeometry, called from
// measure.ts); the hook then places each table's header and rows, lines joined rows up where a
// small move across the flow allows it (align.ts) and routes every relationship again, from row to
// row (route.ts), on the rows the spec names or rows.ts infers.

import type { Box, ModelNode } from "../../types.ts";
import type { AfterLayout, LayoutHooks, NodeGeom } from "../hooks.ts";
import { alignTables } from "./align.ts";
import { routeRelationships, STUB } from "./route.ts";
import { joinedRows } from "./rows.ts";
import { BODY_PAD, HEAD_ICON, PAD, ROW, tableOf } from "./table.ts";

export { columnsOf, headerOf, rowsOf, tagsOf, typeText } from "./table.ts";

/** One field row of an entity table, its box in scene coordinates. */
export interface SceneField {
  name: string;
  type?: string;
  pk?: boolean;
  fk?: boolean;
  unique?: boolean;
  nullable?: boolean;
  box: Box;
}

/** The size ELK lays out for an entity with fields, or undefined: not a table. */
export function erGeometry(n: ModelNode, _horizontal: boolean): NodeGeom | undefined {
  const t = tableOf(n);
  return t ? { w: t.w, h: t.h, label: t.label, note: t.note } : undefined;
}

const r = (v: number) => Math.round(v * 100) / 100;

/** Each table's header text and icon, and its rows. */
function seatTables(ctx: AfterLayout): void {
  for (const nd of ctx.nodes) {
    const n = ctx.model.nodes.find((m) => m.id === nd.id);
    const t = n && tableOf(n);
    if (!n?.fields || !t) continue;
    const b = nd.box;
    const textH = t.label.height + (t.note ? t.note.height + 2 : 0);
    const tx = b.x + PAD + (n.icon ? HEAD_ICON + 8 : 0);
    const ty = b.y + (t.header - textH) / 2;
    if (n.icon)
      nd.iconBox = {
        x: r(b.x + PAD),
        y: r(b.y + (t.header - HEAD_ICON) / 2),
        w: HEAD_ICON,
        h: HEAD_ICON,
      };
    nd.labelBox = { x: r(tx), y: r(ty), w: r(t.label.width), h: r(t.label.height) };
    if (t.note)
      nd.noteBox = {
        x: r(tx),
        y: r(ty + t.label.height + 2),
        w: r(t.note.width),
        h: r(t.note.height),
      };
    const top = b.y + t.header + BODY_PAD;
    nd.fields = n.fields.map((f, i) => ({
      name: f.name,
      ...(f.type ? { type: f.type } : {}),
      ...(f.pk ? { pk: true } : {}),
      ...(f.fk ? { fk: true } : {}),
      ...(f.unique ? { unique: true } : {}),
      ...(f.nullable ? { nullable: true } : {}),
      box: { x: b.x, y: r(top + i * ROW), w: b.w, h: ROW },
    }));
  }
}

/** Seats edge ends on field rows and fills SceneNode.fields and SceneEdge.card. */
export const erHook: LayoutHooks = {
  // Tables side by side along the flow keep a channel wide enough for a stub out of each and a
  // riser between them (a vertical flow sets them side by side within a layer). ELK gives a
  // labelled edge a layer of its own, the gap on both sides of it, so labels halve the gap.
  elkOptions(model): Record<string, string> {
    if (model.kind !== "er") return {};
    const channel = Math.max(2 * STUB + 24, 96 * model.spacing);
    const labelled = model.edges.some((e) => e.label);
    const vertical = model.direction === "down" || model.direction === "up";
    return {
      "elk.layered.spacing.nodeNodeBetweenLayers": String(
        Math.round(labelled && !vertical ? channel / 2 + 8 : channel),
      ),
      ...(vertical ? { "elk.spacing.nodeNode": String(Math.round(channel)) } : {}),
    };
  },
  after(ctx) {
    if (ctx.model.kind !== "er") return;
    seatTables(ctx);
    const byId = new Map(ctx.model.edges.map((e) => [e.id, e]));
    for (const e of ctx.edges) {
      const card = byId.get(e.id)?.card;
      if (card) e.card = { ...card };
    }
    alignTables(ctx, (e) => joinedRows(ctx.model, e));
    routeRelationships(ctx, (e) => {
      const m = byId.get(e.id);
      return m ? joinedRows(ctx.model, m) : {};
    });
  },
};
