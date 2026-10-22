// Edges tidied once every route is drawn (orthogonal routing only): each one that a simpler clear
// route between its ends' faces would serve takes it (bends.ts), then the ends on each face of an
// icon node move onto the tile, around the face's center at one pitch (faces.ts), each moved run
// taking its label along. Pools and lanes, trees and mind maps route their own edges after this.

import { textBlock } from "../text.ts";
import {
  type Box,
  type ModelEdge,
  OWN_LAYOUT,
  type Point,
  type SceneEdge,
  type SceneNode,
} from "../types.ts";
import {
  crossedHeaders,
  type Defects,
  probe,
  type RouteView,
  searchable,
  sharesEnd,
  simplerRoute,
  type Tag,
  tagFits,
  tagSpot,
} from "./bends.ts";
import type { Placed } from "./context.ts";
import {
  type End,
  endsOf,
  facesOf,
  landingOf,
  level,
  type Side,
  slotsAround,
  window,
} from "./faces.ts";
import { dropStraightPoints, headRoom, round, union } from "./geometry.ts";
import { clearHeader } from "./groups.ts";
import { SIZES } from "./sizes.ts";

/** Rounds of the bend search: a route that gave way can free the way for another. */
const ROUNDS = 3;

/** Whether layout tidies this diagram's edges: orthogonal, and laid out by ELK, not a hook. */
function tidies(ctx: Pick<Placed, "model" | "hidden">): boolean {
  const { model } = ctx;
  return (
    model.routing === "orthogonal" &&
    !ctx.hidden.size &&
    model.kind !== "tree" &&
    model.kind !== "mindmap" &&
    !OWN_LAYOUT.has(model.kind)
  );
}

/** Takes the simpler routes, then sets the ends on icon faces. */
export function straighten(ctx: Placed, edges: SceneEdge[], free: Set<string>): void {
  if (!tidies(ctx)) return;
  // A state's self-transitions are redrawn on its corner after this (kinds/state.ts), so where ELK
  // drew them blocks nothing.
  const loops = ctx.model.kind === "state";
  const view: RouteView = {
    nodes: ctx.nodes,
    groups: ctx.groups,
    edges: loops ? edges.filter((e) => e.from !== e.to) : edges,
  };
  const skip = new Set(ctx.seats.keys());
  const byId = new Map(ctx.model.edges.map((e) => [e.id, e]));
  const tagOf = (e: SceneEdge): Tag | undefined => {
    const m = byId.get(e.id);
    if (!m) return undefined;
    const elk = !free.has(e.id) ? ctx.edgeLabels.get(e.id) : undefined;
    return elk ? { w: elk.w, h: elk.h } : sizeOf(m);
  };
  // Headers slide off the lines ELK drew first (the second pass slides them again off the final
  // lines), so a simpler route is judged against where each header ends up.
  for (const g of ctx.groups) {
    const room = ctx.headerRoom.get(g.id);
    if (room) clearHeader(g, room, ctx.groups, ctx.nodes, edges);
  }
  // Ends spread over a face can leave room for a simpler route, so the search runs once more.
  for (let pass = 0; pass < 2; pass++) {
    for (let round = 0; round < ROUNDS; round++) {
      let moved = false;
      for (const e of view.edges) {
        if (!searchable(view, e, skip)) continue;
        // A route through a node or a label, or a header that cannot slide off it, takes any
        // clear route, not only a simpler one.
        const repair =
          (probe(view, e)?.(e.points).hard ?? 0) > 0 || stuckHeader(ctx, view.edges, e);
        if (!repair && sharesEnd(view, e)) continue;
        const better = simplerRoute(view, e, tagOf(e), repair);
        if (!better) continue;
        e.points = better.points;
        // Labels of edges drawn after ELK are placed later, on the final route.
        if (!free.has(e.id) && better.tag)
          setTag(e, better.tag, ctx.edgeLabels.get(e.id)?.stepW ?? 0);
        moved = true;
      }
      if (!moved) break;
    }
    spreadEnds(view, skip, (e) => (free.has(e.id) ? undefined : tagOf(e)));
  }
}

/**
 * Whether the edge runs through a group header that clearHeader (second pass) cannot slide off
 * the lines as they are now. It tries on a copy: the header itself moves only after routing.
 */
function stuckHeader(ctx: Placed, edges: SceneEdge[], e: SceneEdge): boolean {
  const { groups, nodes, headerRoom } = ctx;
  return crossedHeaders({ nodes, groups, edges }, e.points).some((g) => {
    const room = headerRoom.get(g.id);
    const copy = { ...g, labelBox: { ...g.labelBox }, iconBox: g.iconBox && { ...g.iconBox } };
    const others = groups.map((o) => (o === g ? copy : o));
    return !room || !clearHeader(copy, room, others, nodes, edges);
  });
}

/** A free edge's label and step, measured as placeFreeLabels measures them. */
function sizeOf(e: ModelEdge): Tag | undefined {
  if (!e.label && e.step === undefined) return undefined;
  const block = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
  const stepW = e.step !== undefined ? SIZES.step + 2 : 0;
  return {
    w: Math.ceil((e.label ? block.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0)),
    h: Math.ceil(Math.max(e.label ? block.height + 6 : 0, stepW ? SIZES.step : 0)),
  };
}

/** Puts an edge's step badge and label in the box found for them, as sceneEdges does. */
function setTag(e: SceneEdge, box: Box, stepW: number): void {
  if (e.step !== undefined && e.stepBox)
    e.stepBox = { ...e.stepBox, x: box.x, y: round(box.y + (box.h - SIZES.step) / 2) };
  if (e.labelBox)
    e.labelBox = { ...e.labelBox, x: round(box.x + stepW + (stepW ? 2 : 0)), y: box.y };
}

/** The box around an edge's label and step, when it has either. */
const tagBox = (e: SceneEdge): Box | undefined => {
  const parts = [e.labelBox, e.stepBox].filter((b): b is Box => !!b && b.w > 0);
  return parts.length ? union(parts) : undefined;
};

// ---------------------------------------------------------------- ends on faces

interface Slot {
  ends: End[];
  along: number;
}

/**
 * Every end on an icon node goes onto its tile: on each face the ends (one per point, a merged
 * trunk being one) sit around the face's center at ENDS.pitch, in the order they arrive, the run
 * into each moved with it. An edge whose moved route would run into more than it did, or whose
 * label finds no clear spot, stays as it is.
 */
export function spreadEnds(
  view: RouteView,
  skip: Set<string>,
  tagOf: (e: SceneEdge) => Tag | undefined,
): void {
  // An end whose move had to go back holds its place the next time round, and the other ends on
  // its face spread from it.
  const held = new Set<string>();
  for (let round = 0; round < 2; round++) {
    const back = spreadOnce(view, skip, tagOf, held);
    if (!back.length) break;
    for (const k of back) held.add(k);
  }
}

const keyOf = (end: End) => `${end.e.id}:${end.at}`;

/** One round of spreadEnds; returns the ends of the edges whose moves went back. */
function spreadOnce(
  view: RouteView,
  skip: Set<string>,
  tagOf: (e: SceneEdge) => Tag | undefined,
  held: Set<string>,
): string[] {
  const moves = new Map<SceneEdge, { end: End; to: number; line: number; side: Side }[]>();
  for (const nd of view.nodes) {
    if (nd.look !== "icon" || !nd.iconBox || nd.bpmn || skip.has(nd.id)) continue;
    for (const [side, slots] of slotsOf(view, nd)) {
      const face = facesOf(nd)[side];
      // A straight line inside the window stays: the node at its other end holds it. So does an
      // end whose move went back.
      const [lo, hi] = window(face);
      const pins = slots.map((s) =>
        s.ends.some((x) => held.has(keyOf(x))) ||
        (s.along >= lo - 0.01 &&
          s.along <= hi + 0.01 &&
          s.ends.some((x) => x.e.points.length === 2))
          ? s.along
          : undefined,
      );
      const targets = slotsAround(face, slots.length, pins);
      if (!targets) continue;
      slots.forEach((slot, i) => {
        const to = round(targets[i] ?? slot.along);
        for (const end of slot.ends) {
          const p = end.e.points[end.i];
          if (!p) continue;
          const off = level(side) ? Math.abs(p.y - face.line) : Math.abs(p.x - face.line);
          if (Math.abs(slot.along - to) < 0.5 && off < 0.5) continue;
          moves.set(end.e, [...(moves.get(end.e) ?? []), { end, to, line: face.line, side }]);
        }
      });
    }
  }
  // Every move at once, then each edge checked against the others where they went: one that
  // runs into more than it did, loses its head room or finds no spot for its label goes back.
  const plans: {
    e: SceneEdge;
    ends: End[];
    old: Point[];
    moved: Point[];
    route: Point[];
    before: Defects;
  }[] = [];
  const back: string[] = [];
  for (const [e, list] of moves) {
    const count = probe(view, e);
    const before = count?.(e.points);
    const moved = e.points.map((p) => ({ ...p }));
    // A straight edge moves whole, so only its first end's slot holds.
    const ok = (moved.length === 2 ? list.slice(0, 1) : list).every((m) =>
      shift(view, e, moved, m),
    );
    if (ok && before)
      plans.push({
        e,
        ends: list.map((m) => m.end),
        old: e.points,
        moved,
        route: dropStraightPoints(moved),
        before,
      });
    else back.push(...list.map((m) => keyOf(m.end)));
  }
  for (const plan of plans) plan.e.points = plan.route;
  const kept = new Set(plans);
  const worse = (plan: (typeof plans)[number]) => {
    const { e, old, route, before } = plan;
    const after = probe(view, e, old)?.(route);
    if (!after || (Object.keys(after) as (keyof Defects)[]).some((k) => after[k] > before[k]))
      return true;
    const heads = {
      start: e.arrow === "start" || e.arrow === "both",
      end: e.arrow === "end" || e.arrow === "both",
    };
    return headRoom(old, heads) && !headRoom(route, heads);
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const plan of kept)
      if (worse(plan)) {
        plan.e.points = plan.old;
        kept.delete(plan);
        back.push(...plan.ends.map(keyOf));
        changed = true;
      }
  }
  // Its label stays beside the run it was beside, or finds a new clear spot.
  for (const plan of kept) {
    const { e, old, moved, route } = plan;
    const tag = tagOf(e);
    const box = tagBox(e);
    if (!tag || !box) continue;
    const carried = carry(old, moved, box);
    const spot =
      carried && tagFits(view, e, route, carried) ? carried : tagSpot(view, e, route, tag);
    if (spot) moveTag(e, spot.x - box.x, spot.y - box.y);
    else {
      e.points = old;
      back.push(...plan.ends.map(keyOf));
    }
  }
  return back;
}

/** The ends on each face of a node, as slots in order along the face. */
function slotsOf(view: RouteView, nd: SceneNode): Map<Side, Slot[]> {
  const out = new Map<Side, Slot[]>();
  const foot = union([nd.box, nd.iconBox, nd.labelBox, nd.noteBox]);
  const near = (p: Point) =>
    p.x >= foot.x - 1 &&
    p.x <= foot.x + foot.w + 1 &&
    p.y >= foot.y - 1 &&
    p.y <= foot.y + foot.h + 1;
  for (const e of view.edges) {
    if (e.from === e.to || (e.from !== nd.id && e.to !== nd.id)) continue;
    for (const end of endsOf(e)) {
      if ((end.at === "from" ? e.from : e.to) !== nd.id) continue;
      const p = e.points[end.i];
      const landing = landingOf(nd, end);
      if (!p || !landing || !near(p)) continue;
      const side = landing.face.side;
      const list = out.get(side) ?? [];
      // Ends on one point arriving the same way are one trunk.
      const same = list.find((s) => Math.abs(s.along - landing.along) < 0.5);
      if (same) same.ends.push(end);
      else list.push({ ends: [end], along: landing.along });
      out.set(side, list);
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.along - b.along);
  return out;
}

/**
 * Moves one end to `to` along its face and onto the face line, with the run into it. When that
 * leaves a jog under 6px at the next bend, the riser after it moves too; when the run reaches the
 * far end (a straight edge, or a jog just before it), the far end slides along its own face,
 * inside its window, or nothing moves.
 */
function shift(
  view: RouteView,
  e: SceneEdge,
  points: Point[],
  m: { end: End; to: number; line: number; side: Side },
): boolean {
  const { end, to, line, side } = m;
  const k = level(side) ? "x" : "y";
  const j = level(side) ? "y" : "x";
  const step = end.i === 0 ? 1 : -1;
  const last = points.length - 1;
  const far = end.i === 0 ? last : 0;
  const E = points[end.i];
  const P = points[end.i + step];
  if (!E || !P) return false;
  E[j] = line;
  /** Whether the far end may slide to `to` along its face. */
  const farFits = () => {
    const other = end.at === "from" ? e.to : e.from;
    const it = view.nodes.find((n) => n.id === other) ?? view.groups.find((g) => g.id === other);
    const landing =
      it &&
      landingOf(it, {
        e: { ...e, points },
        at: end.at === "from" ? "to" : "from",
        i: far,
        j: far - step,
      });
    if (!landing || level(landing.face.side) !== level(side)) return false;
    const [lo, hi] = window(landing.face);
    return to >= lo - 0.01 && to <= hi + 0.01;
  };
  const Q = points[end.i + 2 * step];
  const R = points[end.i + 3 * step];
  if (end.i + step === far) {
    if (!farFits()) return false;
  } else if (Q && R && Math.abs(Q[k] - to) > 0.01 && Math.abs(Q[k] - to) < 6) {
    if (end.i + 3 * step === far && !farFits()) return false;
    Q[k] = to;
    R[k] = to;
  }
  E[k] = to;
  P[k] = to;
  return true;
}

/** The label box moved with the run it sits beside (within 12px), when the route kept its shape. */
function carry(before: Point[], after: Point[], box: Box): Box | undefined {
  if (before.length !== after.length) return undefined;
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  let best: { d: number; dx: number; dy: number } | undefined;
  for (let i = 1; i < before.length; i++) {
    const p = before[i - 1];
    const q = before[i];
    const moved = after[i - 1];
    if (!p || !q || !moved) continue;
    const upright = Math.abs(p.x - q.x) < 0.5;
    const [lo, hi] = upright
      ? [Math.min(p.y, q.y), Math.max(p.y, q.y)]
      : [Math.min(p.x, q.x), Math.max(p.x, q.x)];
    const along = upright ? c.y : c.x;
    if (along < lo - 1 || along > hi + 1) continue;
    const d = upright
      ? Math.max(0, Math.abs(c.x - p.x) - box.w / 2)
      : Math.max(0, Math.abs(c.y - p.y) - box.h / 2);
    if (d <= 12 && (!best || d < best.d)) best = { d, dx: moved.x - p.x, dy: moved.y - p.y };
  }
  return best ? { ...box, x: round(box.x + best.dx), y: round(box.y + best.dy) } : undefined;
}

/** Moves an edge's label and step badge together. */
function moveTag(e: SceneEdge, dx: number, dy: number): void {
  const move = (b: Box | undefined) => (b ? { ...b, x: round(b.x + dx), y: round(b.y + dy) } : b);
  if (e.labelBox) e.labelBox = move(e.labelBox);
  if (e.stepBox) e.stepBox = move(e.stepBox);
}
