// Nodes on a group's border (on:), as the AWS deck draws an internet gateway on its VPC. ELK lays
// each one out beside its group, in the group's parent, which keeps room for it there; once both
// are placed it moves onto the side facing its edges, the icon centered on the border line and the
// label outside the group. Several on one side spread evenly, and each keeps off the header, the
// corner tile and everything else drawn there. Its edges, routed after ELK (free-edges.ts), leave
// by the icon's face on the side of the border line their other end is on.

import type { Box, Model, ModelEdge, ModelNode, Point, SceneGroup, SceneNode } from "../types.ts";
import type { Placed } from "./context.ts";
import { elkRoute } from "./edges.ts";
import { findEdge } from "./elk.ts";
import { meet, round, segmentHits, segmentsOf, union } from "./geometry.ts";
import type { NodeGeom } from "./hooks.ts";
import { badgePill, nodeGeometry } from "./measure.ts";
import type { Plan } from "./plan.ts";
import type { Relations } from "./relations.ts";
import { type Attach, attachBox } from "./steer.ts";

export type Side = "top" | "bottom" | "left" | "right";

export interface Seat {
  group: string;
  side: Side;
}

/** The side a node sits on when none of its edges leads out of the group: where the flow enters. */
const ENTRY: Record<Model["direction"], Side> = {
  right: "left",
  left: "right",
  down: "top",
  up: "bottom",
};
const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
/** Outward, for each side. */
const OUT: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
/** A node's center keeps this far, plus half its size, from the corners of its side. */
const CORNER = 12;
/** Room kept between a seated node (icon and label) and anything else drawn. */
const ROOM = 6;
/** Its label sits this far off the icon, and this far off the border line. */
const GAP = 6;
const EDGE = 4;
/** The straight run in front of the icon, so a head or a bend never sits on it. */
const STUB = 16;
/** How far apart the spots tried along a side are. */
const STEP = 4;

const real = (b: Box | undefined): b is Box => !!b && b.w > 0 && b.h > 0;
const center = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const within = (b: Box, outer: Box, m: number) =>
  b.x >= outer.x + m &&
  b.y >= outer.y + m &&
  b.x + b.w <= outer.x + outer.w - m &&
  b.y + b.h <= outer.y + outer.h - m;
const upright = (side: Side) => side === "left" || side === "right";
const lineOf = (box: Box, side: Side) =>
  side === "top"
    ? box.y
    : side === "bottom"
      ? box.y + box.h
      : side === "left"
        ? box.x
        : box.x + box.w;

type SeatContext = Omit<Placed, "seats" | "seatGrow">;

// ---------------------------------------------------------------- before ELK

/**
 * Whether a seated node comes before its group along the flow or after it: before when its first
 * edge to something outside the group arrives at it, after when that edge leaves it. ELK gets its
 * links through the group (graph-edges.ts), so the group keeps its place between the node's ends.
 */
export function seatFlow(
  model: Model,
  rel: Relations,
  id: string,
  gid: string,
): "before" | "after" {
  for (const e of model.edges) {
    if ((e.from === id) === (e.to === id)) continue;
    const other = e.from === id ? e.to : e.from;
    if (other === gid || rel.above(other).includes(gid)) continue;
    return other === e.from ? "before" : "after";
  }
  return "before";
}

/**
 * The height ELK gives an icon node that will sit on a border in a vertical flow: only what sticks
 * out of the group (half the icon, or the label beside it), less the gap ELK keeps between layers.
 * Its whole height would leave that much empty above or below the group.
 */
export function seatSlot(n: ModelNode, g: NodeGeom, horizontal: boolean, spacing: number) {
  if (horizontal || n.look !== "icon") return g.h;
  const text = (g.label.lines.length ? g.label.height : 0) + (g.note ? g.note.height + 2 : 0);
  const out = Math.max(n.iconSize / 2, text + EDGE) + ROOM;
  return Math.max(1, Math.ceil(out - Math.round(64 * spacing)));
}

/**
 * The padding a group with border nodes keeps on its sides and bottom: the inner half of their
 * icons (or boxes) and the stub in front of it, so its children (a subnet that fills a VPC) stay
 * clear of them and of the edges they send in. Undefined for a group with none; the top has its
 * header.
 */
export function seatPadding(model: Model, plan: Plan, gid: string, horizontal: boolean) {
  const half = model.nodes
    .filter((n) => plan.seats.get(n.id) === gid)
    .map((n) => {
      if (n.look === "icon") return n.iconSize / 2;
      const g = nodeGeometry(n, horizontal);
      return Math.max(g.w, g.h) / 2;
    });
  return half.length ? Math.max(20, Math.ceil(Math.max(...half) + STUB + ROOM)) : undefined;
}

/** The length of border a seated node takes beside a header: its icon, the gap and its label. */
export function seatRoom(n: ModelNode, g: NodeGeom): number {
  const text = Math.max(g.label.lines.length ? g.label.width : 0, g.note?.width ?? 0);
  return Math.ceil((n.look === "icon" ? n.iconSize + GAP + text : g.w) + 2 * ROOM);
}

// ---------------------------------------------------------------- seating

/** The least width and height a group needs so its border nodes fit (the second pass). */
export type SeatGrowth = Map<string, { w: number; h: number }>;

/**
 * Moves every node with on: onto its group's border, and returns where each one sits. A node
 * with no clear spot on any side stays where ELK put it, and the scene reports its on: unused;
 * when its side was too short for all the nodes on it, `grow` asks the second pass for a group
 * that long.
 */
export function seatNodes(ctx: SeatContext): { seats: Map<string, Seat>; grow: SeatGrowth } {
  const { plan, groups, nodes } = ctx;
  const seats = new Map<string, Seat>();
  const grow: SeatGrowth = new Map();
  if (!plan.seats.size) return { seats, grow };
  // Nodes still to move, which nothing keeps clear of: they leave the spots ELK gave them.
  const moving = new Set(plan.seats.keys());
  const byGroup = new Map<string, SceneNode[]>();
  for (const [id, gid] of plan.seats) {
    const nd = nodes.find((n) => n.id === id);
    if (nd) byGroup.set(gid, [...(byGroup.get(gid) ?? []), nd]);
  }
  for (const [gid, members] of byGroup) {
    const g = groups.find((x) => x.id === gid && !x.overlay);
    if (!g) continue;
    const prefs = new Map(members.map((nd) => [nd.id, sidesOf(ctx, nd, g.box, gid)]));
    const bySide = new Map<Side, SceneNode[]>();
    for (const nd of members) {
      const side = prefs.get(nd.id)?.[0] ?? ENTRY[ctx.model.direction];
      bySide.set(side, [...(bySide.get(side) ?? []), nd]);
    }
    for (const [side, list] of bySide) {
      const along = (b: Box) => (upright(side) ? b.y + b.h / 2 : b.x + b.w / 2);
      // In the order ELK placed them, so their edges keep from crossing. One keeps ELK's spot
      // along the side, lined up with its edges; several spread evenly.
      const ordered = [...list].sort((a, b) => along(a.box) - along(b.box));
      const [start, end] = upright(side)
        ? [g.box.y, g.box.y + g.box.h]
        : [g.box.x, g.box.x + g.box.w];
      ordered.forEach((nd, i) => {
        const even = start + ((i + 1) * (end - start)) / (ordered.length + 1);
        const tries = (prefs.get(nd.id) ?? [side]).map((s, k) => ({
          side: s,
          ideal: k === 0 && ordered.length > 1 ? even : undefined,
        }));
        seat(ctx, nd, g, tries, moving, seats);
      });
      // One that had to take another side, or none, asks for a side long enough for them all.
      const short = ordered.some((nd) => seats.get(nd.id)?.side !== side);
      const need = short ? sideLength(g, side, ordered) : 0;
      if (need > end - start + 0.5) {
        const was = grow.get(gid) ?? { w: 0, h: 0 };
        grow.set(
          gid,
          upright(side)
            ? { ...was, h: Math.max(was.h, need) }
            : { ...was, w: Math.max(was.w, need) },
        );
      }
    }
  }
  return { seats, grow };
}

/**
 * How long a side must be for these nodes side by side, each with its label and room around it,
 * past the header on a top or left side and clear of both corners.
 */
function sideLength(g: SceneGroup, side: Side, list: SceneNode[]): number {
  const head = [g.label.lines.length ? g.labelBox : undefined, g.iconBox].filter(real);
  const past =
    !head.length || side === "bottom" || side === "right"
      ? 0
      : side === "top"
        ? Math.max(...head.map((b) => b.x + b.w)) - g.box.x + ROOM
        : Math.max(...head.map((b) => b.y + b.h)) - g.box.y + ROOM;
  const each = list.map((nd) => {
    const a = anchorOf(nd);
    const t = textOf(nd);
    const own = upright(side) ? a.h + (t ? EDGE + t.h : 0) : a.w + (t ? GAP + t.w : 0);
    return own + 2 * ROOM;
  });
  return Math.ceil(past + each.reduce((sum, v) => sum + v, 0) + 2 * CORNER);
}

/**
 * The sides to try, best first: the one facing the other end of the node's first edge out of the
 * group (one across the flow only when that end is beside the group), then the rest by how far
 * that end lies beyond them. A node with no edge out of the group faces where the flow enters.
 */
function sidesOf(ctx: SeatContext, nd: SceneNode, box: Box, gid: string): Side[] {
  const { model, rel, nodes, groups, horizontal } = ctx;
  const entry = ENTRY[model.direction];
  const cross: Side[] = horizontal ? ["top", "bottom"] : ["left", "right"];
  for (const e of model.edges) {
    if ((e.from === nd.id) === (e.to === nd.id)) continue;
    const other = e.from === nd.id ? e.to : e.from;
    if (other === gid || rel.above(other).includes(gid)) continue;
    const b = nodes.find((n) => n.id === other)?.box ?? groups.find((g) => g.id === other)?.box;
    if (!b) continue;
    const c = center(b);
    const gap: Record<Side, number> = {
      top: box.y - c.y,
      bottom: c.y - box.y - box.h,
      left: box.x - c.x,
      right: c.x - box.x - box.w,
    };
    const flow = [entry, OPPOSITE[entry]].filter((s) => gap[s] > 0);
    const rest = (["top", "bottom", "left", "right"] as Side[])
      .filter((s) => !flow.includes(s))
      .sort((a, b) => gap[b] - gap[a]);
    return [...flow, ...rest];
  }
  return [entry, OPPOSITE[entry], ...cross];
}

/** A node's icon (or box) and its label beside it, as placed at one spot of a side. */
interface Spot {
  anchor: Box;
  /** The label and note, outside the group; undefined when the text is in the box. */
  text?: Box;
  /** The runs in front of the faces across the border, where its edges leave: kept off headers. */
  reach: Box[];
}

/** Seats one node on the first side with a clear spot, nearest its ideal place along it. */
function seat(
  ctx: SeatContext,
  nd: SceneNode,
  g: SceneGroup,
  tries: { side: Side; ideal?: number }[],
  moving: Set<string>,
  seats: Map<string, Seat>,
): void {
  const a = anchorOf(nd);
  for (const { side, ideal } of tries) {
    const up = upright(side);
    const [start, end] = up ? [g.box.y, g.box.y + g.box.h] : [g.box.x, g.box.x + g.box.w];
    const size = up ? a.h : a.w;
    const lo = start + size / 2 + CORNER;
    const hi = end - size / 2 - CORNER;
    if (lo > hi) continue;
    const c0 = round(Math.min(hi, Math.max(lo, ideal ?? (up ? a.y + a.h / 2 : a.x + a.w / 2))));
    const at = [c0];
    for (let d = STEP; d <= hi - lo; d += STEP) at.push(c0 - d, c0 + d);
    for (const c of at.filter((v) => v >= lo - 0.01 && v <= hi + 0.01)) {
      const spot = spotsAt(nd, a, side, lineOf(g.box, side), c).find((s) =>
        clear(ctx, nd, g.id, s, moving),
      );
      if (!spot) continue;
      moving.delete(nd.id);
      place(nd, spot);
      seats.set(nd.id, { group: g.id, side });
      return;
    }
  }
  moving.delete(nd.id);
  // It stays where ELK put it, drawn whole.
  const geom = ctx.nodeGeom.get(nd.id);
  if (geom) nd.box = { ...nd.box, h: geom.h };
  ctx.plan.ignored.push({
    subject: nd.id,
    setting: "on",
    reason: `no spot on the border of "${g.id}" keeps its icon and label clear`,
  });
}

/** What sits on the border line: the icon of an icon node, else the whole box. */
const anchorOf = (nd: SceneNode): Box => (nd.look === "icon" && nd.iconBox ? nd.iconBox : nd.box);

/** The node's label and note together, when it has any outside its box. */
function textOf(nd: SceneNode): { w: number; h: number } | undefined {
  if (nd.look !== "icon") return undefined;
  const label = nd.label.lines.length ? nd.labelBox : undefined;
  const note = nd.note?.lines.length ? nd.noteBox : undefined;
  if (!label && !note) return undefined;
  return {
    w: Math.max(
      label ? drawn(label, nd.label.lines, LABEL_FACE).w : 0,
      note && nd.note ? drawn(note, nd.note.lines, NOTE_FACE).w : 0,
    ),
    h: (label?.h ?? 0) + (label && note ? 2 : 0) + (note?.h ?? 0),
  };
}

// The stage skin draws these boxes in Geist Mono (render/stage/text.ts: 0.6 em a glyph plus its
// tracking, node labels in 11.5px caps, notes in 10px, headers in 11px caps), often wider than the
// classic text they were measured for. One layout serves both skins, so a seat keeps clear of the
// wider of the two.
const LABEL_FACE = { size: 11.5, track: 0.08 };
const NOTE_FACE = { size: 10, track: 0 };
const HEADER_FACE = { size: 11, track: 0.1 };

/** A text box as wide as the wider skin draws it: centered text grows both ways, `start` right. */
function drawn(b: Box, lines: string[], face: { size: number; track: number }, start = false): Box {
  const w = Math.max(
    b.w,
    ...lines.map((l) => {
      const c = [...l].length;
      return c ? face.size * (c * (0.6 + face.track) - face.track) : 0;
    }),
  );
  return start ? { ...b, w } : { ...b, x: b.x - (w - b.w) / 2, w };
}

/**
 * The spots at `c` along a side, the label's usual place first. The label stays clear of the
 * lines through the icon's faces: beside the icon on a top or bottom border, under (or over) it
 * on a left or right one, always outside the group.
 */
function spotsAt(nd: SceneNode, a: Box, side: Side, line: number, c: number): Spot[] {
  const anchor: Box = upright(side)
    ? { x: round(line - a.w / 2), y: round(c - a.h / 2), w: a.w, h: a.h }
    : { x: round(c - a.w / 2), y: round(line - a.h / 2), w: a.w, h: a.h };
  const d = STUB + ROOM;
  const reach = upright(side)
    ? [
        { ...anchor, x: anchor.x - d, w: d },
        { ...anchor, x: anchor.x + anchor.w, w: d },
      ]
    : [
        { ...anchor, y: anchor.y - d, h: d },
        { ...anchor, y: anchor.y + anchor.h, h: d },
      ];
  const t = textOf(nd);
  if (!t) return [{ anchor, reach }];
  const at = (x: number, y: number): Spot => ({
    anchor,
    text: { x: round(x), y: round(y), w: t.w, h: t.h },
    reach,
  });
  if (!upright(side)) {
    const y = side === "top" ? line - EDGE - t.h : line + EDGE;
    return [at(anchor.x + anchor.w + GAP, y), at(anchor.x - GAP - t.w, y)];
  }
  const x = side === "left" ? line - EDGE - t.w : line + EDGE;
  return [at(x, anchor.y + anchor.h + EDGE), at(x, anchor.y - EDGE - t.h)];
}

/**
 * Whether a spot keeps clear of every other node, header, edge ELK routed and edge label, stays
 * inside the groups around the node's group, and enters no other group but its own.
 */
function clear(
  ctx: SeatContext,
  nd: SceneNode,
  gid: string,
  spot: Spot,
  moving: Set<string>,
): boolean {
  const { model, nodes, groups, rel, result, top, edgeLabels } = ctx;
  const parts = [spot.anchor, spot.text].filter(real);
  const footprints = nodes
    .filter((o) => o.id !== nd.id && !moving.has(o.id))
    .map((o) =>
      union(
        [
          o.box,
          o.iconBox,
          o.label.lines.length ? drawn(o.labelBox, o.label.lines, LABEL_FACE) : undefined,
          o.noteBox && o.note ? drawn(o.noteBox, o.note.lines, NOTE_FACE) : undefined,
          o.badgeBox,
        ].filter(real),
      ),
    );
  const heads = groups.flatMap((g) => [
    g.label.lines.length ? drawn(g.labelBox, g.label.lines, HEADER_FACE, true) : undefined,
    g.iconBox,
  ]);
  const marks = model.edges.flatMap((e) => {
    const lab = edgeLabels.get(e.id);
    const at = rel.free(e) || !lab ? undefined : findEdge(result, e.id)?.labels?.[0];
    return at?.x === undefined || at.y === undefined
      ? []
      : [{ x: at.x, y: at.y + top, w: lab?.w ?? 0, h: lab?.h ?? 0 }];
  });
  const blocks = [...footprints, ...heads, ...marks].filter(real);
  if (parts.some((p) => blocks.some((b) => meet(p, b, ROOM)))) return false;
  // The padding keeps its group's children off the runs in front of the faces; headers may not.
  if (spot.reach.some((r) => heads.some((b) => real(b) && meet(r, b)))) return false;
  const around = rel.above(gid);
  for (const g of groups) {
    if (g.id === gid) continue;
    // The groups around its own keep it inside; any other it must not touch, though an overlay
    // drawn around this part of the picture may hold it whole.
    if (around.includes(g.id)) {
      if (parts.some((p) => !within(p, g.box, ROOM))) return false;
    } else if (g.overlay) {
      if (parts.some((p) => meet(p, g.box, ROOM) && !within(p, g.box, ROOM))) return false;
    } else if (parts.some((p) => meet(p, g.box, ROOM))) return false;
  }
  // The lines ELK drew stay where they are, so the node keeps off them.
  return !model.edges.some((e) => {
    const pts = rel.free(e) ? undefined : elkRoute(ctx, e);
    return !!pts && segmentsOf(pts).some(([p, q]) => parts.some((b) => segmentHits(p, q, b, -4)));
  });
}

/** Moves the node to its spot: icon (or box) on the border, label and note outside. */
function place(nd: SceneNode, spot: Spot): void {
  const { anchor, text } = spot;
  if (nd.look === "icon") {
    nd.iconBox = anchor;
    // The node is its icon now; its text hangs beside it.
    nd.box = { ...anchor };
    if (text) {
      const label = nd.label.lines.length ? nd.labelBox : undefined;
      if (label) nd.labelBox = { ...label, x: round(text.x + (text.w - label.w) / 2), y: text.y };
      const below = label ? text.y + label.h + 2 : text.y;
      if (nd.noteBox && nd.note?.lines.length)
        nd.noteBox = {
          ...nd.noteBox,
          x: round(text.x + (text.w - nd.noteBox.w) / 2),
          y: round(below),
        };
    }
  } else {
    const dx = anchor.x - nd.box.x;
    const dy = anchor.y - nd.box.y;
    const move = (b: Box | undefined) =>
      b ? { ...b, x: round(b.x + dx), y: round(b.y + dy) } : undefined;
    nd.box = anchor;
    nd.iconBox = move(nd.iconBox);
    nd.labelBox = move(nd.labelBox) ?? nd.labelBox;
    nd.noteBox = move(nd.noteBox);
  }
  if (nd.badge) nd.badgeBox = badgePill(nd.badge, nd.look === "icon" ? anchor : nd.box);
}

// ---------------------------------------------------------------- edges

/**
 * Where an edge of a seated node starts: the inner face toward an end inside the group or past
 * its far side (the line crosses the group the node belongs to), else the outer face; the edges
 * through one face spread across it in the order of their other ends, so their heads do not meet;
 * and a stub straight out of it. The router joins the stub's tip to the other end.
 */
export function seatEnd(
  ctx: Placed,
  e: ModelEdge,
  end: "from" | "to",
): { attach: Attach; face: Point; tip: Point } | undefined {
  const id = end === "from" ? e.from : e.to;
  const seat = ctx.seats.get(id);
  const nd = seat && ctx.nodes.find((n) => n.id === id);
  const g = seat && ctx.groups.find((x) => x.id === seat.group && !x.overlay);
  if (!seat || !nd || !g) return undefined;
  const out = OUT[seat.side];
  const boxOf = (oid: string) =>
    ctx.nodes.find((x) => x.id === oid)?.box ?? ctx.groups.find((x) => x.id === oid)?.box;
  const otherOf = (x: ModelEdge) => (x.from === id ? x.to : x.from);
  // Past the far side: the opposite border line, crossed going inward.
  const far = lineOf(g.box, OPPOSITE[seat.side]);
  const outward = (x: ModelEdge) => {
    const other = otherOf(x);
    const b = boxOf(other);
    if (!b || other === seat.group || ctx.rel.above(other).includes(seat.group)) return false;
    const v = upright(seat.side) ? center(b).x : center(b).y;
    return (v - far) * (out.x + out.y) > 0;
  };
  const away = outward(e);
  const n = away ? out : { x: -out.x, y: -out.y };
  const across = n.x !== 0;
  const alongOf = (oid: string) => {
    const b = boxOf(oid);
    return b ? (across ? b.y + b.h / 2 : b.x + b.w / 2) : 0;
  };
  const mates = ctx.model.edges
    .filter((x) => (x.from === id) !== (x.to === id) && outward(x) === away)
    .sort((p, q) => alongOf(otherOf(p)) - alongOf(otherOf(q)));
  const t = (mates.indexOf(e) + 1) / (mates.length + 1);
  const a = nd.box;
  // The only edge through a face lines up with its other end when that end faces the icon, so
  // the line runs straight.
  const [f0, span] = across ? [a.y, a.h] : [a.x, a.w];
  const lone = mates.length === 1 ? attachBox(ctx, otherOf(e))?.side : undefined;
  const c = lone && (across ? lone.y + lone.h / 2 : lone.x + lone.w / 2);
  const at = round(c !== undefined && c >= f0 + 8 && c <= f0 + span - 8 ? c : f0 + span * t);
  const face: Point = across
    ? { x: n.x > 0 ? a.x + a.w : a.x, y: at }
    : { x: at, y: n.y > 0 ? a.y + a.h : a.y };
  // Out of a top or bottom border, past the label beside the icon, so a turn there clears it.
  const parts = [nd.labelBox, nd.noteBox].filter(real);
  const text = parts.length && away && !across ? union(parts) : undefined;
  const beyond = !text ? 0 : n.y < 0 ? a.y - text.y : text.y + text.h - (a.y + a.h);
  const len = Math.max(STUB, beyond + 10);
  const tip = { x: round(face.x + n.x * len), y: round(face.y + n.y * len) };
  const pt: Box = { x: tip.x, y: tip.y, w: 0, h: 0 };
  return { attach: { side: pt, full: pt, parts: [pt] }, face, tip };
}
