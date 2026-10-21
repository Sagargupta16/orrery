// Fewest bends. For an orthogonal edge between two nodes or groups, the simpler routes between
// their faces (straight, one bend, two bends, out of and into any face), and the tests one must
// pass to replace the route drawn: it runs through no node, label, note, edge label, header or
// title, crosses no group border the drawn one does not and no more edges, runs on top of or
// close beside no other line, and its label still finds a clear spot. Layout takes the simplest
// clear one (straighten.ts); the review flags a route with more bends than one of them
// (review/grid.ts), so the router and the rule agree.

import type { Box, Point, SceneEdge, SceneGroup, SceneNode } from "../types.ts";
import { alongBorder, clearOfFrames, HEAD_ROOM } from "./elbows.ts";
import {
  type Face,
  faceBox,
  facesOf,
  type Item,
  level,
  outward,
  type Side,
  window,
} from "./faces.ts";
import {
  collinear,
  dropStraightPoints,
  meet,
  round,
  segmentHits,
  segmentsOf,
  union,
} from "./geometry.ts";
import { labelSpot } from "./labels.ts";
import { ENDS } from "./sizes.ts";

/** What the search reads: the scene's nodes, groups and edges as drawn so far. */
export interface RouteView {
  nodes: SceneNode[];
  groups: SceneGroup[];
  edges: SceneEdge[];
}

/** An edge's label and step together, as one box beside the line. */
export interface Tag {
  w: number;
  h: number;
}

export interface Simpler {
  points: Point[];
  bends: number;
  /** Where the edge's tag goes beside the new route, when it has one. */
  tag?: Box;
}

/** The band under a group's top border its title reads in (DG225). */
const TITLE_BAND = 28;
/** A node closer than this to a line reads as touching it (DG221). */
const SKIM = 10;
/** Two unrelated lines closer than this, parallel over more than BESIDE_ALONG, read as one. */
const BESIDE = 12;
const BESIDE_ALONG = 48;

export const bendsOf = (points: Point[]) => Math.max(0, dropStraightPoints(points).length - 2);

const real = (b: Box | undefined): b is Box => !!b && b.w > 0 && b.h > 0;
const grow = (b: Box, d: number): Box => ({
  x: b.x - d,
  y: b.y - d,
  w: b.w + 2 * d,
  h: b.h + 2 * d,
});
const orthogonal = (points: Point[]) =>
  segmentsOf(points).every(([p, q]) => Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5);
const lengthOf = (points: Point[]) =>
  segmentsOf(points).reduce((s, [p, q]) => s + Math.abs(q.x - p.x) + Math.abs(q.y - p.y), 0);

/** The node or group an end is on; overlays and lanes are drawn around others, never searched. */
function itemOf(view: RouteView, id: string): Item | undefined {
  const nd = view.nodes.find((n) => n.id === id);
  if (nd) return nd.bpmn ? undefined : nd;
  const g = view.groups.find((x) => x.id === id);
  return g && !g.overlay && !g.lane ? g : undefined;
}

const holds = (outer: Box, inner: Box) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.w <= outer.x + outer.w + 0.5 &&
  inner.y + inner.h <= outer.y + outer.h + 0.5;

/**
 * Whether the search applies to an edge: orthogonal, between two different nodes or groups where
 * neither holds the other, neither a pool, lane, overlay or BPMN symbol, and no end in `skip`
 * (nodes on a border, whose stubs seats.ts owns).
 */
export function searchable(view: RouteView, e: SceneEdge, skip?: Set<string>): boolean {
  if (e.from === e.to || skip?.has(e.from) || skip?.has(e.to)) return false;
  const a = itemOf(view, e.from);
  const b = itemOf(view, e.to);
  if (!a || !b || holds(a.box, b.box) || holds(b.box, a.box)) return false;
  return orthogonal(e.points);
}

/**
 * Whether an end of the edge is one arrowhead or one trunk with other edges on a card, shape or
 * group (merge: true): the search leaves those alone, since a simpler route of one of them would
 * split the shared end. On an icon the ends spread over the tile anyway (straighten.ts).
 */
export function sharesEnd(view: RouteView, e: SceneEdge): boolean {
  const endsAt = (x: SceneEdge): [string, Point | undefined][] => [
    [x.from, x.points[0]],
    [x.to, x.points.at(-1)],
  ];
  const icon = (id: string) => view.nodes.some((n) => n.id === id && n.look === "icon");
  return endsAt(e).some(
    ([id, p]) =>
      !!p &&
      !icon(id) &&
      view.edges.some(
        (o) =>
          o !== e &&
          endsAt(o).some(
            ([oid, q]) =>
              oid === id && !!q && Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5,
          ),
      ),
  );
}

/**
 * The simplest clear route between the edge's two faces with fewer bends than the one drawn, or
 * undefined. `tag` is the size of the edge's label (with its step), which must fit beside it.
 * With `repair` (the drawn route runs through a node, a header or a label) any number of bends up
 * to two will do: a clear route beats a simpler one through something.
 */
export function simplerRoute(
  view: RouteView,
  e: SceneEdge,
  tag?: Tag,
  repair = false,
): Simpler | undefined {
  const a = itemOf(view, e.from);
  const b = itemOf(view, e.to);
  if (!a || !b) return undefined;
  const now = bendsOf(e.points);
  if (!repair && !now) return undefined;
  const heads = {
    start: e.arrow === "start" || e.arrow === "both",
    end: e.arrow === "end" || e.arrow === "both",
  };
  const found = candidates(a, b, e, repair ? 3 : now, heads, linesOf(view))
    .map((points) => ({ points, bends: bendsOf(points), cost: costOf(points, a, b) }))
    .filter((c) => repair || c.bends < now)
    .sort((x, y) => x.bends - y.bends || x.cost - y.cost);
  if (!found.length) return undefined;
  const test = tester(view, e, a, b, tag);
  for (const c of found) {
    const spot = test(c.points);
    if (spot) return { points: c.points, bends: c.bends, ...(spot === true ? {} : { tag: spot }) };
  }
  return undefined;
}

/** Ends off their face's center cost their offset; then the length. */
function costOf(points: Point[], a: Item, b: Item): number {
  const off = (it: Item, p: Point | undefined) => {
    const t = faceBox(it);
    // A group's side is long; where along it an end lands is no defect.
    if (!p || !("look" in it)) return 0;
    const dx = Math.abs(p.x - (t.x + t.w / 2));
    const dy = Math.abs(p.y - (t.y + t.h / 2));
    // Only along the face it is on: the other offset is the face's own distance from the center.
    const onLevel = Math.abs(p.y - t.y) < 0.5 || p.y >= t.y + t.h - 0.5;
    return onLevel ? dx : dy;
  };
  return 4 * (off(a, points[0]) + off(b, points.at(-1))) + lengthOf(points);
}

// ---------------------------------------------------------------- candidates

/** Every group frame and node footprint: a riser keeps to the channels between them. */
type Lines = Box[];

function linesOf(view: RouteView): Lines {
  return [
    ...view.groups.filter((g) => !g.overlay && !g.lane).map((g) => g.box),
    ...view.nodes.map((n) => union([n.box, n.iconBox, n.labelBox, n.noteBox])),
  ];
}

/**
 * The middle of each channel at least 32px wide between s and t, across x (`upright` risers) or
 * y, cut by the sides of the boxes that reach into the riser's span `lo`..`hi`.
 */
function channels(boxes: Lines, upright: boolean, s: number, t: number, lo: number, hi: number) {
  const [a, b] = [Math.min(s, t), Math.max(s, t)];
  const at = boxes
    .filter((r) => (upright ? r.y < hi && r.y + r.h > lo : r.x < hi && r.x + r.w > lo))
    .flatMap((r) => (upright ? [r.x, r.x + r.w] : [r.y, r.y + r.h]))
    .filter((v) => v > a && v < b)
    .sort((m, n) => m - n);
  const cut = [a, ...at, b];
  return cut.slice(1).flatMap((v, i) => {
    const u = cut[i] ?? v;
    return v - u >= 32 ? [(u + v) / 2] : [];
  });
}

/** Positions an end may take along a face: the center and a pitch to either side, inside it. */
function positions(it: Item, face: Face, toward: number, was: number | undefined): number[] {
  const [lo, hi] = window(face);
  if (hi < lo) return [];
  const c = (face.lo + face.hi) / 2;
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
  // A group's side is long: an end on it lines up with the other end, or stays where it was.
  const group = !("look" in it);
  const list = group ? [was, clamp(toward), c] : [c, c - ENDS.pitch, c + ENDS.pitch, was];
  return [
    ...new Set(
      list
        .filter((v): v is number => v !== undefined && v >= lo - 0.01 && v <= hi + 0.01)
        .map(round),
    ),
  ];
}

function candidates(
  a: Item,
  b: Item,
  e: SceneEdge,
  now: number,
  heads: { start: boolean; end: boolean },
  lines: Lines,
): Point[][] {
  const fa = facesOf(a);
  const fb = facesOf(b);
  const ta = faceBox(a);
  const tb = faceBox(b);
  const center = (t: Box): Point => ({ x: t.x + t.w / 2, y: t.y + t.h / 2 });
  const ca = center(ta);
  const cb = center(tb);
  const first = e.points[0];
  const last = e.points.at(-1);
  const runA = heads.start ? HEAD_ROOM : 8;
  const runB = heads.end ? HEAD_ROOM : 8;
  /** Where the drawn end sits along a face, when it is on that face. */
  const was = (f: Face, p: Point | undefined) => {
    if (!p) return undefined;
    const at = level(f.side) ? p.y : p.x;
    return Math.abs(at - f.line) < 0.5 ? (level(f.side) ? p.x : p.y) : undefined;
  };
  const posA = (s: Side) => positions(a, fa[s], level(s) ? cb.x : cb.y, was(fa[s], first));
  const posB = (s: Side) => positions(b, fb[s], level(s) ? ca.x : ca.y, was(fb[s], last));
  const pt = (x: number, y: number): Point => ({ x: round(x), y: round(y) });
  const out: Point[][] = [];
  // Off the face by `run` at least, outward.
  const clears = (v: number, f: Face, run: number) => (v - f.line) * outward(f.side) >= run;

  // Straight: the faces that face each other, where both spans leave room for one line.
  for (const [sa, sb] of [
    ["right", "left"],
    ["left", "right"],
    ["bottom", "top"],
    ["top", "bottom"],
  ] as const) {
    const A = fa[sa];
    const B = fb[sb];
    if (!clears(B.line, A, Math.max(runA, runB))) continue;
    const [a0, a1] = window(A);
    const [b0, b1] = window(B);
    const lo = Math.max(a0, b0);
    const hi = Math.min(a1, b1);
    if (hi < lo) continue;
    const mid = level(sa) ? (ca.x + cb.x) / 2 : (ca.y + cb.y) / 2;
    const at = Math.min(hi, Math.max(lo, mid));
    for (const v of new Set([at, at - ENDS.pitch, at + ENDS.pitch].map(round)))
      if (v >= lo - 0.01 && v <= hi + 0.01)
        out.push(level(sa) ? [pt(v, A.line), pt(v, B.line)] : [pt(A.line, v), pt(B.line, v)]);
  }
  if (now < 2) return out;

  // One bend: out of a side face and into a top or bottom one, or the other way round.
  for (const sa of ["left", "right", "top", "bottom"] as const) {
    const A = fa[sa];
    const across: Side[] = level(sa) ? ["left", "right"] : ["top", "bottom"];
    for (const sb of across) {
      const B = fb[sb];
      for (const u of posA(sa))
        for (const v of posB(sb)) {
          // u along A's face, v along B's; the corner is at (v, u) for a side face of A.
          if (!clears(v, A, runA)) continue;
          if ((u - B.line) * outward(sb) < runB) continue;
          out.push(
            level(sa)
              ? [pt(u, A.line), pt(u, v), pt(B.line, v)]
              : [pt(A.line, u), pt(v, u), pt(v, B.line)],
          );
        }
    }
  }
  if (now < 3) return out;

  // Two bends: out of and into faces of one direction, a riser between them or round both.
  for (const sa of ["left", "right", "top", "bottom"] as const) {
    const A = fa[sa];
    const pair: Side[] = level(sa) ? ["top", "bottom"] : ["left", "right"];
    for (const sb of pair) {
      const B = fb[sb];
      const facing = outward(sa) !== outward(sb);
      const s = A.line;
      const t = B.line;
      const risers = facing
        ? [
            s + (t - s) * 0.45,
            (s + t) / 2,
            s + 24 * Math.sign(t - s),
            t - 24 * Math.sign(t - s),
            ...(level(sa)
              ? channels(lines, false, s, t, Math.min(ca.x, cb.x), Math.max(ca.x, cb.x))
              : channels(lines, true, s, t, Math.min(ca.y, cb.y), Math.max(ca.y, cb.y))),
          ]
        : [0, 12].map(
            (d) => (outward(sa) > 0 ? Math.max(s, t) : Math.min(s, t)) + outward(sa) * (24 + d),
          );
      for (const m of risers) {
        if (!clears(m, A, runA) || !clears(m, B, runB)) continue;
        for (const u of posA(sa))
          for (const v of posB(sb)) {
            if (Math.abs(u - v) < 1) continue;
            out.push(
              level(sa)
                ? [pt(u, s), pt(u, m), pt(v, m), pt(v, t)]
                : [pt(s, u), pt(m, u), pt(m, v), pt(t, v)],
            );
          }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- tests

/** What a route runs into, counted: a replacement must have none, a moved route no more. */
export interface Defects {
  /** Runs through another node, its text or another edge's label, as the review counts. */
  hard: number;
  /** Runs through a group header's chip (crossedHeaders names them). */
  headers: number;
  /** Runs through its own ends' tiles, text or group boxes (it may only touch their faces). */
  own: number;
  /** Runs through or within 10px of another node, 4px of its text, or over a label or header. */
  walls: number;
  /** Lies on a group border, runs along one or beside a group title. */
  frames: number;
  /** Group borders crossed more often than the drawn route crosses them. */
  borders: number;
  /** Runs on top of another line, or close beside an unrelated one. */
  lines: number;
  /** Crossings with other edges. */
  crossings: number;
}

/**
 * The counts of what a route of `e` runs into, against the scene as drawn now; borders count
 * against `ref`, the route it would replace.
 */
export function probe(
  view: RouteView,
  e: SceneEdge,
  ref: Point[] = e.points,
): ((points: Point[]) => Defects) | undefined {
  const a = itemOf(view, e.from);
  const b = itemOf(view, e.to);
  return a && b ? prober(view, e, a, b, ref) : undefined;
}

function prober(
  view: RouteView,
  e: SceneEdge,
  a: Item,
  b: Item,
  ref: Point[] = e.points,
): (points: Point[]) => Defects {
  const ends = new Set([e.from, e.to]);
  const others = view.edges.filter((o) => o !== e);
  const related = (o: SceneEdge) => ends.has(o.from) || ends.has(o.to);
  // Its own ends: the drawn parts (a tile and its text, a box), touched only at the face.
  const own = [a, b].flatMap((it) =>
    "look" in it
      ? [faceBox(it), it.label.lines.length ? it.labelBox : undefined, it.noteBox].filter(real)
      : [it.box],
  );
  const strangers = view.nodes.filter((n) => !ends.has(n.id));
  const walls = [
    ...strangers.flatMap((n) => [
      grow(n.box, SKIM),
      grow(union([n.box, n.iconBox, n.labelBox, n.noteBox].filter(real)), 4),
    ]),
    ...view.nodes.flatMap((n) => (real(n.badgeBox) ? [grow(n.badgeBox, 2)] : [])),
    ...others.flatMap((o) => [o.labelBox, o.stepBox].filter(real).map((x) => grow(x, 2))),
    ...view.groups.flatMap((g) =>
      [g.label.lines.length ? g.labelBox : undefined, g.iconBox]
        .filter(real)
        .map((x) => ({ x: x.x - 4, y: x.y - 1, w: x.w + 8, h: x.h + 2 })),
    ),
  ];
  // As sceneDefects and the checks read them: a node's box 3px in, its text 1px in, a label or
  // a header's chip 0.5px in.
  const hard: [Box, number][] = [
    ...strangers.flatMap((n): [Box, number][] => [
      [n.box, 3],
      ...[n.labelBox, n.noteBox].filter(real).map((x): [Box, number] => [x, 1]),
    ]),
    ...others.flatMap((o) =>
      [o.labelBox, o.stepBox].filter(real).map((x): [Box, number] => [x, 0.5]),
    ),
  ];
  const frames = view.groups.filter((g) => !g.overlay && !g.lane);
  const borders = frames.map((g) => g.box);
  const titles = frames.filter((g) => g.label.lines.length).map((g) => g.labelBox);
  const counted = frames.filter((g) => !ends.has(g.id));
  const crossedBefore = counted.map((g) => borderCrossings(ref, g.box));
  const otherSegs = others.flatMap((o) => segmentsOf(o.points).map((s) => ({ o, s })));
  return (points) => {
    const segs = segmentsOf(points);
    const hits = (boxes: Box[], inset: number) =>
      segs.filter(([p, q]) => boxes.some((w) => segmentHits(p, q, w, inset))).length;
    let lines = 0;
    for (const { o, s } of otherSegs)
      if (collinear(points, s[0], s[1]) || (!related(o) && beside(segs, s))) lines++;
    return {
      hard: segs.filter(([p, q]) => hard.some(([w, inset]) => segmentHits(p, q, w, inset))).length,
      headers: crossedHeaders(view, points).length,
      own: hits(own, 1),
      walls: hits(walls, 0),
      frames:
        (clearOfFrames(points, borders, titles) ? 0 : 1) + (alongBorder(points, borders) ? 1 : 0),
      borders: counted.reduce(
        (n, g, i) => n + Math.max(0, borderCrossings(points, g.box) - (crossedBefore[i] ?? 0)),
        0,
      ),
      lines,
      crossings: crossings(points, otherSegs),
    };
  };
}

/** What an edge's tag keeps off: nodes with their text, badges, other tags, headers, borders. */
function tagAvoid(view: RouteView, e: SceneEdge): Box[] {
  const others = view.edges.filter((o) => o !== e);
  const frames = view.groups.filter((g) => !g.overlay && !g.lane);
  return [
    ...view.nodes.map((n) => union([n.box, n.iconBox, n.labelBox, n.noteBox])),
    ...view.nodes.flatMap((n) => (real(n.badgeBox) ? [n.badgeBox] : [])),
    ...others.flatMap((o) => [o.labelBox, o.stepBox].filter(real)),
    ...view.groups.flatMap((g) => [g.label.lines.length ? g.labelBox : undefined, g.iconBox]),
    ...frames.flatMap((g) => [
      { x: g.box.x - 1, y: g.box.y, w: 2, h: g.box.h },
      { x: g.box.x + g.box.w - 1, y: g.box.y, w: 2, h: g.box.h },
      { x: g.box.x, y: g.box.y - 1, w: g.box.w, h: 2 },
      { x: g.box.x, y: g.box.y + g.box.h - 1, w: g.box.w, h: 2 },
    ]),
    // A label in the band under a group's top border reads as part of its title (DG225).
    ...frames
      .filter((g) => g.label.lines.length)
      .map((g) => ({
        ...g.box,
        h: Math.max(TITLE_BAND, g.labelBox.y + g.labelBox.h - g.box.y),
      })),
  ].filter(real);
}

/** Where the edge's tag goes beside a route, clear of everything drawn; undefined when nowhere. */
export function tagSpot(view: RouteView, e: SceneEdge, points: Point[], tag: Tag): Box | undefined {
  const lines = view.edges.filter((o) => o !== e).map((o) => o.points);
  return labelSpot(points, tag.w, tag.h, tagAvoid(view, e), lines);
}

/** Whether a tag at `box` clears what tagSpot keeps it off, the lines and their tips included. */
export function tagFits(view: RouteView, e: SceneEdge, points: Point[], box: Box): boolean {
  const lines = [...view.edges.filter((o) => o !== e).map((o) => o.points), points];
  const strokes = lines.flatMap((pts) => [
    ...segmentsOf(pts).map(([p, q]) => ({
      x: Math.min(p.x, q.x) - 1,
      y: Math.min(p.y, q.y) - 1,
      w: Math.abs(q.x - p.x) + 2,
      h: Math.abs(q.y - p.y) + 2,
    })),
    ...[pts[0], pts.at(-1)].flatMap((p) => (p ? [{ x: p.x - 6, y: p.y - 6, w: 12, h: 12 }] : [])),
  ]);
  return ![...tagAvoid(view, e), ...strokes].some((o) => meet(box, o));
}

/**
 * The test a candidate must pass, built once per edge: true when it clears and the edge has no
 * tag, the tag's spot when it has one, false otherwise. Clear: nothing run into, and no more
 * crossings than the drawn route.
 */
function tester(
  view: RouteView,
  e: SceneEdge,
  a: Item,
  b: Item,
  tag: Tag | undefined,
): (points: Point[]) => Box | boolean {
  const count = prober(view, e, a, b);
  const before = count(e.points).crossings;
  return (points) => {
    const d = count(points);
    const bad = d.hard || d.headers || d.own || d.walls || d.frames || d.borders || d.lines;
    if (bad || d.crossings > before) return false;
    return tag ? (tagSpot(view, e, points, tag) ?? false) : true;
  };
}

/** The groups whose header chip (the label 4px out, as DG209 reads it) the path runs through. */
export function crossedHeaders(view: RouteView, points: Point[]): SceneGroup[] {
  const segs = segmentsOf(points);
  return view.groups.filter((g) => {
    const x = g.label.lines.length ? g.labelBox : undefined;
    if (!real(x)) return false;
    const chip = { x: x.x - 4, y: x.y - 1, w: x.w + 8, h: x.h + 2 };
    return segs.some(([p, q]) => segmentHits(p, q, chip, 0.5));
  });
}

/** How many times a path crosses a box's border, strictly inside the path's segments. */
export function borderCrossings(points: Point[], b: Box): number {
  let n = 0;
  for (const [p, q] of segmentsOf(points)) {
    if (Math.abs(p.x - q.x) < 0.5) {
      if (p.x <= b.x || p.x >= b.x + b.w) continue;
      const [y0, y1] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
      for (const y of [b.y, b.y + b.h]) if (y > y0 + 0.5 && y < y1 - 0.5) n++;
    } else if (Math.abs(p.y - q.y) < 0.5) {
      if (p.y <= b.y || p.y >= b.y + b.h) continue;
      const [x0, x1] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
      for (const x of [b.x, b.x + b.w]) if (x > x0 + 0.5 && x < x1 - 0.5) n++;
    }
  }
  return n;
}

/** Crossings of a path with other edges' segments, each one strictly inside both. */
function crossings(points: Point[], others: { s: readonly [Point, Point] }[]): number {
  let n = 0;
  for (const [a, b] of segmentsOf(points)) {
    const flat = Math.abs(a.y - b.y) < 0.5;
    for (const {
      s: [p, q],
    } of others) {
      const level = Math.abs(p.y - q.y) < 0.5;
      if (level === flat) continue;
      const [h0, h1, v0, v1] = flat ? [a, b, p, q] : [p, q, a, b];
      const x = v0.x;
      const y = h0.y;
      if (
        x > Math.min(h0.x, h1.x) + 0.5 &&
        x < Math.max(h0.x, h1.x) - 0.5 &&
        y > Math.min(v0.y, v1.y) + 0.5 &&
        y < Math.max(v0.y, v1.y) - 0.5
      )
        n++;
    }
  }
  return n;
}

/** Whether a segment of the path runs parallel to pq closer than BESIDE over BESIDE_ALONG. */
function beside(segs: readonly (readonly [Point, Point])[], [p, q]: readonly [Point, Point]) {
  const v = Math.abs(p.x - q.x) < 0.5;
  if (!v && Math.abs(p.y - q.y) >= 0.5) return false;
  const [b0, b1] = (v ? [p.y, q.y] : [p.x, q.x]).sort((m, n) => m - n);
  return segs.some(([r, s]) => {
    if (Math.abs(r.x - s.x) < 0.5 !== v || (!v && Math.abs(r.y - s.y) >= 0.5)) return false;
    if (Math.abs((v ? r.x : r.y) - (v ? p.x : p.y)) >= BESIDE) return false;
    const [a0, a1] = (v ? [r.y, s.y] : [r.x, s.x]).sort((m, n) => m - n);
    return Math.min(a1 ?? 0, b1 ?? 0) - Math.max(a0 ?? 0, b0 ?? 0) > BESIDE_ALONG;
  });
}
