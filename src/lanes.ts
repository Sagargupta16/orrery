// Pools and swimlanes: groups of type pool and lane. ELK lays the flow out without them, then the
// lanes become bands across the flow and every node moves into its own lane's band.
//
// The flow keeps ELK's layers along the main axis (x in a right or left flow); across it each band
// is as deep as its deepest layer, stacked in spec order. A lone node sits on its band's center
// line, so a chain inside one lane is one straight line. Every edge is then routed again on a grid
// of the gaps between layers and the bands' center lines and channels, because ELK's routes point
// at where the nodes were.

import { contrast, ensureContrast, luminance, mixHex } from "./color.ts";
import type { AfterLayout, LayoutHooks } from "./hooks.ts";
import { symbolBox } from "./notation.ts";
import { resolveGroupStyle } from "./styles.ts";
import { textBlock } from "./text.ts";
import { THEME_TOKENS } from "./themes.ts";
import {
  type Box,
  isBpmnEvent,
  isBpmnGateway,
  type Model,
  type ModelGroup,
  type Point,
  type SceneEdge,
  type SceneGroup,
  type SceneNode,
  type TextBlock,
} from "./types.ts";

// Sizes in px. Group labels match layout's (13px semibold); bpmn-js draws pool and lane names in
// a 30px strip.
const LABEL = 13;
const EDGE_LABEL = 11.5;
const EDGE_LABEL_MAX = 150;
const STEP = 28;
const STRIP = 30;
/** Across the flow: between a band's border and its deepest layer, and between stacked nodes. */
const PAD = 24;
const STACK = 24;
const MIN_BAND = 96;
/** A pool with nothing in it (a black-box participant that only sends and receives messages). */
const BLACK_BOX = 64;
/** Between two pools, where message flows cross. */
const POOL_GAP = 60;
/** Along the flow: between the strip and the first layer, and after the last one. */
const RUN = 28;
/** Back edges run along a band this far inside its border. */
const CHANNEL = 12;
/** Nodes keep lines this far away. */
const CLEAR = 6;
/** What a bend costs a route, in px of length. */
const BEND = 28;

const round = (v: number) => Math.round(v * 100) / 100;

const isBandType = (g: ModelGroup | undefined): g is ModelGroup =>
  !!g && !g.around && (g.type === "pool" || g.type === "lane");

/** Pools and lanes drawn as bands: at the top level, or nested only in each other. */
function bandIds(model: Model): Set<string> {
  const byId = new Map(model.groups.map((g) => [g.id, g]));
  const out = new Set<string>();
  for (const g of model.groups) {
    let ok = isBandType(g);
    for (let p = g.parent; ok && p; p = byId.get(p)?.parent) ok = isBandType(byId.get(p));
    if (ok) out.add(g.id);
  }
  return out;
}

/** Band order, depth first: a pool's own nodes, then its lanes in spec order. */
function bandRanks(model: Model, ids: Set<string>): Map<string, number> {
  const rank = new Map<string, number>();
  const visit = (id: string) => {
    rank.set(id, rank.size);
    for (const g of model.groups) if (g.parent === id && ids.has(g.id)) visit(g.id);
  };
  for (const g of model.groups) if (ids.has(g.id) && !g.parent) visit(g.id);
  return rank;
}

export const laneHooks: LayoutHooks = {
  hiddenGroups: (model) => bandIds(model),
  elkOptions(model) {
    const ids = bandIds(model);
    if (!ids.size) return {};
    // A loop back (retry, rework) is the edge against the order the steps are written in; ELK's
    // greedy cycle breaking can instead turn the loop's decision into the first step.
    const options: Record<string, string> = { "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST" };
    // The bands are tighter than ELK's flat layout, so ELK must not size the canvas: layout sizes
    // it from the bands. The option reaches every group too, so only when no other group exists.
    if (model.groups.every((g) => ids.has(g.id) || g.around))
      options["elk.nodeSize.fixedGraphSize"] = "true";
    return options;
  },
  order(model) {
    const ids = bandIds(model);
    if (!ids.size) return undefined;
    const rank = bandRanks(model, ids);
    const out = new Map<string, number>();
    for (const x of [...model.groups, ...model.nodes]) {
      if (ids.has(x.id)) continue;
      if (!x.parent) out.set(x.id, rank.size);
      else if (ids.has(x.parent)) out.set(x.id, rank.get(x.parent) ?? 0);
    }
    return out;
  },
  after: (ctx) => {
    const ids = bandIds(ctx.model);
    if (ids.size) bandLayout(ctx, ids);
  },
};

// ---------------------------------------------------------------- geometry

type Key = "x" | "y";
type Len = "w" | "h";
interface Axis {
  /** Along the flow. */
  m: Key;
  mw: Len;
  /** Across the flow. */
  c: Key;
  cw: Len;
}

function union(boxes: (Box | undefined)[]): Box {
  const list = boxes.filter((b): b is Box => !!b && (b.w > 0 || b.h > 0));
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...list.map((b) => b.x + b.w)) - x,
    h: Math.max(...list.map((b) => b.y + b.h)) - y,
  };
}

const grow = (b: Box, d: number): Box => ({
  x: b.x - d,
  y: b.y - d,
  w: b.w + 2 * d,
  h: b.h + 2 * d,
});

const hits = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/** Whether segment pq (horizontal or vertical) enters the inside of box b. */
function cuts(p: Point, q: Point, b: Box): boolean {
  if (Math.abs(p.y - q.y) < 0.01) {
    const [a, c] = p.x < q.x ? [p.x, q.x] : [q.x, p.x];
    return p.y > b.y + 0.01 && p.y < b.y + b.h - 0.01 && a < b.x + b.w - 0.01 && c > b.x + 0.01;
  }
  const [a, c] = p.y < q.y ? [p.y, q.y] : [q.y, p.y];
  return p.x > b.x + 0.01 && p.x < b.x + b.w - 0.01 && a < b.y + b.h - 0.01 && c > b.y + 0.01;
}

/** Runs of overlapping intervals, in order. */
function clusters<T>(list: T[], span: (t: T) => [number, number]): T[][] {
  const sorted = [...list].sort((a, b) => span(a)[0] - span(b)[0]);
  const out: T[][] = [];
  let end = Number.NEGATIVE_INFINITY;
  for (const t of sorted) {
    const [s, e] = span(t);
    const last = out[out.length - 1];
    if (last && s < end - 0.5) {
      last.push(t);
      end = Math.max(end, e);
    } else {
      out.push([t]);
      end = e;
    }
  }
  return out;
}

function dropStraight(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    if (prev && last) {
      const cross = (last.x - prev.x) * (p.y - prev.y) - (last.y - prev.y) * (p.x - prev.x);
      const ahead = (last.x - prev.x) * (p.x - last.x) + (last.y - prev.y) * (p.y - last.y) >= 0;
      if (Math.abs(cross) < 0.01 && ahead) out.pop();
    }
    out.push(p);
  }
  return out.length >= 2 ? out : points;
}

// ---------------------------------------------------------------- bands

interface Band {
  /** Unset: a pool's own nodes beside its lanes, or the nodes in no band (both undrawn). */
  group?: ModelGroup;
  kids: Band[];
  items: Item[];
  depth: number;
  /** Across the flow: where the band starts and how deep it is. */
  c0: number;
  size: number;
  /** Along the flow: its label strip, and the strips of the bands around it. */
  strip: number;
  inset: number;
  label?: TextBlock;
  scene?: SceneGroup;
}

/** A node, or an ordinary group with everything in it, that moves as one into a band. */
interface Item {
  id: string;
  boxes: Box[];
  /** Edges inside a group item, which move with it. */
  inner: SceneEdge[];
  /** Where edges attach, and what lone items center on their band's line. */
  attach: Box;
  foot: Box;
}

const blackBox = (b: Band) => b.group?.type === "pool" && !b.kids.length && !b.items.length;

function nodeBoxes(n: SceneNode): Box[] {
  return [n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox].filter((b): b is Box => !!b);
}

function footOf(n: SceneNode): Box {
  return union([n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox]);
}

function bandLayout(ctx: AfterLayout, ids: Set<string>): void {
  const { model, nodes, groups, edges, horizontal } = ctx;
  const A: Axis = horizontal
    ? { m: "x", mw: "w", c: "y", cw: "h" }
    : { m: "y", mw: "h", c: "x", cw: "w" };
  const sign = model.direction === "left" || model.direction === "up" ? -1 : 1;
  const sceneNode = new Map(nodes.map((n) => [n.id, n]));
  const sceneGroup = new Map(groups.map((g) => [g.id, g]));
  const parentOf = new Map<string, string | undefined>(
    [...model.nodes, ...model.groups].map((x) => [x.id, x.parent]),
  );
  const within = (id: string, anc: string) => {
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) if (p === anc) return true;
    return false;
  };
  /** Where edges attach: an event's or gateway's symbol, an icon in a horizontal flow, the box. */
  const attachOf = (n: SceneNode): Box =>
    symbolBox(n) ?? (n.look === "icon" && horizontal && n.iconBox ? n.iconBox : n.box);

  // The band tree, in spec order.
  const make = (group: ModelGroup | undefined, depth: number): Band => ({
    group,
    kids: [],
    items: [],
    depth,
    c0: 0,
    size: 0,
    strip: 0,
    inset: 0,
  });
  const bands = new Map<string, Band>();
  const roots: Band[] = [];
  for (const g of model.groups) if (ids.has(g.id)) bands.set(g.id, make(g, 0));
  for (const g of model.groups) {
    const b = bands.get(g.id);
    if (!b) continue;
    const parent = g.parent ? bands.get(g.parent) : undefined;
    if (parent) parent.kids.push(b);
    else roots.push(b);
  }
  const deepen = (b: Band, d: number) => {
    b.depth = d;
    for (const k of b.kids) deepen(k, d + 1);
  };
  for (const r of roots) deepen(r, 0);
  let loose: Band | undefined;
  const own = new Map<Band, Band>();
  const bandFor = (parent: string | undefined): Band => {
    const b = parent ? bands.get(parent) : undefined;
    if (!b) {
      loose ??= make(undefined, 0);
      return loose;
    }
    if (!b.kids.length || own.has(b)) return own.get(b) ?? b;
    const o = make(undefined, b.depth + 1);
    own.set(b, o);
    b.kids.unshift(o);
    return o;
  };

  // Items: nodes and ordinary groups that sit in a band (or in none), with their ELK positions.
  const items: Item[] = [];
  const elkCross = new Map<Item, number>();
  for (const n of model.nodes) {
    if (n.parent && !ids.has(n.parent)) continue;
    const sn = sceneNode.get(n.id);
    if (!sn) continue;
    const it: Item = {
      id: n.id,
      boxes: nodeBoxes(sn),
      inner: [],
      attach: attachOf(sn),
      foot: footOf(sn),
    };
    bandFor(n.parent).items.push(it);
    items.push(it);
  }
  for (const g of model.groups) {
    if (ids.has(g.id) || g.around || (g.parent && !ids.has(g.parent))) continue;
    const sg = sceneGroup.get(g.id);
    if (!sg) continue;
    const boxes: (Box | undefined)[] = [sg.box, sg.labelBox, sg.iconBox, sg.inner?.box];
    for (const x of [...model.nodes, ...model.groups]) {
      if (!within(x.id, g.id)) continue;
      const n = sceneNode.get(x.id);
      const s = sceneGroup.get(x.id);
      if (n) boxes.push(...nodeBoxes(n));
      if (s) boxes.push(s.box, s.labelBox, s.iconBox, s.inner?.box);
    }
    const inner = edges.filter((e) =>
      [e.from, e.to].every((id) => id === g.id || within(id, g.id)),
    );
    const it: Item = {
      id: g.id,
      boxes: boxes.filter((b): b is Box => !!b),
      inner,
      attach: sg.box,
      foot: union([sg.box, sg.labelBox, sg.iconBox]),
    };
    bandFor(g.parent).items.push(it);
    items.push(it);
  }
  for (const it of items) elkCross.set(it, it.attach[A.c] + it.attach[A.cw] / 2);
  const itemOf = new Map<string, Item>();
  for (const it of items) {
    itemOf.set(it.id, it);
    for (const x of [...model.nodes, ...model.groups])
      if (within(x.id, it.id)) itemOf.set(x.id, it);
  }
  // Overlays (around:) outline their members: they follow them, keeping their margins.
  const overlays = groups
    .filter((g) => g.overlay)
    .map((g) => {
      const members = model.groups.find((x) => x.id === g.id)?.around ?? [];
      return { g, members, before: memberBox(members) };
    });
  function memberBox(members: string[]): Box | undefined {
    const boxes = members.flatMap((id) => {
      const n = sceneNode.get(id);
      if (n) return [footOf(n)];
      const s = sceneGroup.get(id);
      return s ? [s.box] : [];
    });
    return boxes.length ? union(boxes) : undefined;
  }

  // Depth across the flow: each leaf band holds its deepest layer, a lone node centered.
  const all: Band[] = [];
  const collect = (b: Band) => {
    all.push(b);
    for (const k of b.kids) collect(k);
  };
  for (const r of roots) collect(r);
  if (loose) all.push(loose);
  const cspan = (b: Box): [number, number] => [b[A.c], b[A.c] + b[A.cw]];
  const mspan = (b: Box): [number, number] => [b[A.m], b[A.m] + b[A.mw]];
  const center = (b: Box, k: Key, w: Len) => b[k] + b[w] / 2;
  const layers = new Map<Band, Item[][]>();
  const leafSize = (b: Band): number => {
    if (blackBox(b)) return BLACK_BOX;
    const cols = clusters(b.items, (it) => mspan(it.foot)).map((col) =>
      col.sort((p, q) => (elkCross.get(p) ?? 0) - (elkCross.get(q) ?? 0)),
    );
    layers.set(b, cols);
    let need = 0;
    for (const col of cols) {
      const first = col[0];
      if (col.length === 1 && first) {
        const mid = center(first.attach, A.c, A.cw);
        const [f0, f1] = cspan(first.foot);
        need = Math.max(need, 2 * Math.max(mid - f0, f1 - mid));
      } else {
        const depth = col.reduce((s, it) => s + it.foot[A.cw], 0) + STACK * (col.length - 1);
        need = Math.max(need, depth);
      }
    }
    return b.group ? Math.max(MIN_BAND, need + 2 * PAD) : need + 2 * PAD;
  };
  /** Adds `d` to a band and to its last descendant, so the parent's sum still holds. */
  const deeper = (b: Band, d: number) => {
    b.size += d;
    const last = b.kids[b.kids.length - 1];
    if (last) deeper(last, d);
  };
  const size = (b: Band) => {
    for (const k of b.kids) size(k);
    b.size = b.kids.length ? b.kids.reduce((s, k) => s + k.size, 0) : leafSize(b);
    if (!b.group) return;
    // The name runs across the flow in its strip, so it wraps to the band's depth, but never
    // narrower than a short name: the band grows instead.
    const room = b.size - 20;
    let label = textBlock(b.group.label, LABEL, 1000, 600);
    if (!blackBox(b) && label.width > room)
      label = textBlock(b.group.label, LABEL, Math.max(120, room), 600);
    if (!blackBox(b) && label.width > room) deeper(b, Math.ceil(label.width - room));
    b.label = label;
  };
  for (const b of [...roots, ...(loose ? [loose] : [])]) size(b);

  // Strips along the flow: one thickness per nesting depth, wide enough for a wrapped name.
  const strips = new Map<number, number>();
  for (const b of all) {
    if (!b.group || !b.label || blackBox(b)) continue;
    const need = Math.ceil(Math.max(STRIP, b.label.height + 13));
    strips.set(b.depth, Math.max(strips.get(b.depth) ?? 0, need));
  }
  const inset = (b: Band, at: number) => {
    b.inset = at;
    b.strip = b.group && !blackBox(b) ? (strips.get(b.depth) ?? STRIP) : 0;
    for (const k of b.kids) inset(k, at + b.strip);
  };
  for (const r of roots) inset(r, 0);
  const lead = Math.max(0, ...all.map((b) => b.inset + b.strip));

  // Along the flow ELK's layers stay in order, but ELK widened the gap between two layers for each
  // edge label it put there. Labels now go beside the new routes, so a gap keeps only the room the
  // labels of the edges across it need (one gap per edge, its widest).
  const columns = clusters(items, (it) => mspan(it.foot));
  const colOf = new Map<Item, number>();
  columns.forEach((col, k) => {
    for (const it of col) colOf.set(it, k);
  });
  const reach = columns.map((col) => [
    Math.min(...col.map((it) => it.foot[A.m])),
    Math.max(...col.map((it) => it.foot[A.m] + it.foot[A.mw])),
  ]);
  const gapAfter = (k: number) => (reach[k + 1]?.[0] ?? 0) - (reach[k]?.[1] ?? 0);
  const floor = Math.round(64 * model.spacing);
  const need = columns.map(() => floor);
  for (const e of model.edges) {
    if ((!e.label && e.step === undefined) || e.flow === "message") continue;
    const a = itemOf.get(e.from);
    const b = itemOf.get(e.to);
    const ka = a ? colOf.get(a) : undefined;
    const kb = b ? colOf.get(b) : undefined;
    if (ka === undefined || kb === undefined || ka === kb) continue;
    const [lo, hi] = ka < kb ? [ka, kb] : [kb, ka];
    const block = textBlock(e.label ?? "", EDGE_LABEL, EDGE_LABEL_MAX);
    const stepW = e.step !== undefined ? STEP + 2 : 0;
    const w = (e.label ? block.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0);
    const h = Math.max(e.label ? block.height + 6 : 0, stepW ? STEP : 0);
    let k = lo;
    for (let j = lo; j < hi; j++) if (gapAfter(j) > gapAfter(k)) k = j;
    need[k] = Math.max(need[k] ?? floor, (horizontal ? w : h) + 28);
  }
  const along = new Map<Item, number>();
  let pulled = 0;
  columns.forEach((col, k) => {
    if (k > 0) pulled += Math.min(0, (need[k - 1] ?? floor) - gapAfter(k - 1));
    for (const it of col) along.set(it, pulled);
  });

  // Then everything moves by one offset so the strips fit.
  const feet = items.map((it) => {
    const [s0, s1] = mspan(it.foot);
    const d = along.get(it) ?? 0;
    return [s0 + d, s1 + d] as const;
  });
  const first = Math.min(...feet.map(([s]) => s));
  const last = Math.max(...feet.map(([, e]) => e));
  const m0 = (horizontal ? 28 : ctx.top + 28) - (first - RUN - lead);
  const startM = first - RUN - lead + m0;
  const endM = last + RUN + m0;
  const contentM = startM + lead;

  // Across the flow: pools apart, neighboring standalone lanes sharing a border.
  let c = horizontal ? ctx.top + 28 : 28;
  const stack = [...roots, ...(loose?.items.length ? [loose] : [])];
  const place = (b: Band, at: number) => {
    b.c0 = at;
    let k = at;
    for (const kid of b.kids) {
      place(kid, k);
      k += kid.size;
    }
  };
  stack.forEach((b, i) => {
    const prev = stack[i - 1];
    if (prev) c += prev.group?.type === "lane" && b.group?.type === "lane" ? 0 : POOL_GAP;
    place(b, c);
    c += b.size;
  });

  // Move each item into its band.
  const moved = new Set<Box>();
  const shiftBox = (b: Box | undefined, dm: number, dc: number) => {
    if (!b || moved.has(b)) return;
    moved.add(b);
    b[A.m] = round(b[A.m] + dm);
    b[A.c] = round(b[A.c] + dc);
  };
  const move = (it: Item, dc: number) => {
    const dm = m0 + (along.get(it) ?? 0);
    for (const b of it.boxes) shiftBox(b, dm, dc);
    it.foot = { ...it.foot, [A.m]: it.foot[A.m] + dm, [A.c]: it.foot[A.c] + dc };
    for (const e of it.inner) {
      const d = horizontal ? { x: dm, y: dc } : { x: dc, y: dm };
      e.points = e.points.map((p) => ({ x: round(p.x + d.x), y: round(p.y + d.y) }));
      shiftBox(e.labelBox, dm, dc);
      shiftBox(e.stepBox, dm, dc);
    }
  };
  for (const b of all) {
    if (b === loose && !b.items.length) continue;
    const mid = b.c0 + b.size / 2;
    for (const col of layers.get(b) ?? []) {
      const only = col[0];
      if (col.length === 1 && only) {
        move(only, mid - center(only.attach, A.c, A.cw));
        continue;
      }
      const depth = col.reduce((s, it) => s + it.foot[A.cw], 0) + STACK * (col.length - 1);
      let at = mid - depth / 2;
      for (const it of col) {
        move(it, at - it.foot[A.c]);
        at += it.foot[A.cw] + STACK;
      }
    }
  }
  for (const o of overlays) {
    const now = memberBox(o.members);
    if (!now || !o.before) continue;
    const dx = now.x - o.before.x;
    const dy = now.y - o.before.y;
    const g = o.g;
    const b = g.box;
    const right = b.x + b.w - (o.before.x + o.before.w);
    const bottom = b.y + b.h - (o.before.y + o.before.h);
    g.box = {
      x: round(b.x + dx),
      y: round(b.y + dy),
      w: round(now.x + now.w + right - (b.x + dx)),
      h: round(now.y + now.h + bottom - (b.y + dy)),
    };
    for (const x of [g.labelBox, g.iconBox]) {
      if (!x) continue;
      x.x = round(x.x + dx);
      x.y = round(x.y + dy);
    }
  }

  // Scene groups: the band, and its strip across the flow.
  const t = THEME_TOKENS[ctx.theme];
  const boxOf = (m: number, mlen: number, c0: number, clen: number): Box =>
    horizontal
      ? { x: round(m), y: round(c0), w: round(mlen), h: round(clen) }
      : { x: round(c0), y: round(m), w: round(clen), h: round(mlen) };
  const painted: SceneGroup[] = [];
  for (const b of all) {
    const g = b.group;
    const label = b.label;
    if (!g || !label) continue;
    const style = resolveGroupStyle(g.type);
    const box = boxOf(startM + b.inset, endM - startM - b.inset, b.c0, b.size);
    const header = blackBox(b) ? { ...box } : boxOf(startM + b.inset, b.strip, b.c0, b.size);
    // A strip's name runs across the flow (rotated in a horizontal flow), a black box's along it.
    const rotated = horizontal !== blackBox(b);
    const lw = rotated ? label.height : label.width;
    const lh = rotated ? label.width : label.height;
    const strokeBase = g.color ?? style?.stroke ?? t.text;
    let stroke = strokeBase;
    let fill = g.fill === "none" ? "none" : (g.fill ?? style?.fill ?? "none");
    let labelColor =
      g.color ?? (style?.labelColor && style.labelColor !== "ink" ? style.labelColor : t.text);
    if (ctx.theme === "dark") {
      // As layout paints groups: a near-black line turns light, a fill becomes a tint.
      if (luminance(strokeBase) < 0.04) stroke = "#c9d1d9";
      else if (contrast(strokeBase, t.background) < 2) stroke = mixHex(strokeBase, "#ffffff", 0.55);
      if (fill !== "none") fill = mixHex(fill, t.background, 0.14);
      if (!g.color && luminance(labelColor) < 0.04) labelColor = t.text;
    }
    labelColor = ensureContrast(labelColor, fill === "none" ? t.background : fill, 4.5);
    const sg: SceneGroup = {
      id: g.id,
      type: g.type,
      box,
      depth: b.depth,
      label,
      labelBox: {
        x: round(header.x + (header.w - lw) / 2),
        y: round(header.y + (header.h - lh) / 2),
        w: round(lw),
        h: round(lh),
      },
      stroke,
      fill,
      labelColor,
      dash: g.dashed ? "6 4" : style?.dash,
      strokeWidth: style?.strokeWidth ?? 1.5,
      radius: 0,
      parent: g.parent,
      lane: { horizontal, header },
    };
    b.scene = sg;
    painted.push(sg);
  }
  groups.push(...painted);
  // Frames draw in order: pools under their lanes, both under the groups inside a lane.
  groups.sort((a, b) => a.depth - b.depth);
  // Text on a filled band keeps 4.5:1, as layout does for nodes on a filled group.
  for (const n of nodes) {
    if (n.ink) continue;
    let surface: string | undefined;
    for (let p = n.parent; p && !surface; p = parentOf.get(p)) {
      const fill = bands.get(p)?.scene?.fill;
      if (fill && fill !== "none") surface = fill;
      else if (!bands.has(p) && (sceneGroup.get(p)?.fill ?? "none") !== "none") break;
    }
    if (!surface) continue;
    const ink = ensureContrast(t.text, surface, 4.5);
    const inkMuted = ensureContrast(t.muted, surface, 4.5);
    if (ink !== t.text) n.ink = ink;
    if (inkMuted !== t.muted) n.inkMuted = inkMuted;
  }

  // ------------------------------------------------------------- edges
  const routes = routeEdges({
    ctx,
    A,
    sign,
    all,
    items,
    layers,
    bands,
    itemOf,
    sceneNode,
    sceneGroup: new Map(groups.map((g) => [g.id, g])),
    contentM,
    endM,
  });
  edges.splice(0, edges.length, ...routes);
}

// ---------------------------------------------------------------- routing

interface Routing {
  ctx: AfterLayout;
  A: Axis;
  sign: number;
  all: Band[];
  items: Item[];
  layers: Map<Band, Item[][]>;
  bands: Map<string, Band>;
  itemOf: Map<string, Item>;
  sceneNode: Map<string, SceneNode>;
  sceneGroup: Map<string, SceneGroup>;
  /** Along the flow: where content starts after the strips, and where the bands end. */
  contentM: number;
  endM: number;
}

/** Directions of travel in screen space. */
type Dir = 0 | 1 | 2 | 3;
const STEPS: Record<Dir, Point> = {
  0: { x: 1, y: 0 },
  1: { x: -1, y: 0 },
  2: { x: 0, y: 1 },
  3: { x: 0, y: -1 },
};
const flip = (d: Dir): Dir => (d === 0 ? 1 : d === 1 ? 0 : d === 2 ? 3 : 2);

interface Port {
  p: Point;
  /** Leaving: the direction it leaves in; arriving: the direction it travels into the end. */
  d: Dir;
  cost: number;
  /** Obstacles around the port's own box (and a label it starts below) its ray leaves through. */
  skip?: Box[];
  /** The end's own label or note the port moved past. */
  through?: Box[];
}

interface Obstacle {
  box: Box;
  /** Part of an edge end: the fallback route keeps only these. */
  own: boolean;
}

interface Placed {
  edge: SceneEdge;
  p: Point;
  q: Point;
}

/** An edge end: a node's attach box, a group's box, or a band's border. */
interface End {
  id: string;
  box: Box;
  /** Pieces the line must stay out of: the attach box, the label and note under it. */
  parts: Box[];
  band?: Band;
  /** The node's whole box when lines attach to a part of it (a symbol over its label). */
  frame?: Box;
  /** A circle or a diamond: lines meet it only in the middle of a side. */
  curved?: boolean;
}

function routeEdges(r: Routing): SceneEdge[] {
  const { ctx, A, sign } = r;
  const { model, horizontal } = ctx;
  const existing = new Map(ctx.edges.map((e) => [e.id, e]));

  // Grid lines along the flow: the gaps between layers (a few tracks each), and before and after
  // them; across it: every node's center line, each band's center and channels, pool gaps.
  const mLines = new Set<number>();
  const cLines = new Set<number>();
  const columns = clusters(
    r.items,
    (it) => [it.foot[A.m], it.foot[A.m] + it.foot[A.mw]] as [number, number],
  );
  const spans = columns.map((col) => [
    Math.min(...col.map((it) => it.foot[A.m])),
    Math.max(...col.map((it) => it.foot[A.m] + it.foot[A.mw])),
  ]);
  const gaps: [number, number][] = [];
  let prevEnd = r.contentM;
  for (const [s = 0, e = 0] of spans) {
    gaps.push([prevEnd, s]);
    prevEnd = e;
  }
  gaps.push([prevEnd, r.endM]);
  for (const [s, e] of gaps) {
    const mid = (s + e) / 2;
    if (e - s > 2) mLines.add(round(mid));
    for (let k = 1; k <= 3; k++)
      for (const v of [mid + 12 * k, mid - 12 * k])
        if (v > s + 8 && v < e - 8) mLines.add(round(v));
  }
  for (const it of r.items) {
    mLines.add(round(it.attach[A.m] + it.attach[A.mw] / 2));
    cLines.add(round(it.attach[A.c] + it.attach[A.cw] / 2));
  }
  const drawn = r.all.filter((b) => b.group || b.items.length);
  for (const b of drawn) {
    cLines.add(round(b.c0 + b.size / 2));
    cLines.add(round(b.c0 + CHANNEL));
    cLines.add(round(b.c0 + b.size - CHANNEL));
  }
  const tops = r.all.filter((b) => b.depth === 0 && (b.group || b.items.length));
  const outer0 = Math.min(...tops.map((b) => b.c0));
  const outer1 = Math.max(...tops.map((b) => b.c0 + b.size));
  cLines.add(round(outer0 - 16));
  cLines.add(round(outer1 + 16));
  const sortedTops = [...tops].sort((a, b) => a.c0 - b.c0);
  const poolGaps: [number, number][] = [];
  for (let i = 1; i < sortedTops.length; i++) {
    const a = sortedTops[i - 1];
    const b = sortedTops[i];
    if (!a || !b) continue;
    const s = a.c0 + a.size;
    if (b.c0 - s <= 16) continue;
    poolGaps.push([s, b.c0]);
    for (const v of [(s + b.c0) / 2, (s + b.c0) / 2 - 12, (s + b.c0) / 2 + 12])
      cLines.add(round(v));
  }
  for (const cols of r.layers.values())
    for (const col of cols)
      for (let i = 1; i < col.length; i++) {
        const a = col[i - 1];
        const b = col[i];
        if (a && b) cLines.add(round((a.foot[A.c] + a.foot[A.cw] + b.foot[A.c]) / 2));
      }

  // What lines stay out of: other nodes, label strips, black boxes, group headers.
  const strips = r.all.flatMap((b) =>
    b.scene?.lane ? [{ band: b, box: b.scene.lane.header }] : [],
  );
  const groupHeads = ctx.groups
    .filter((g) => !g.lane && g.label.lines.length && g.labelBox.w > 0)
    .map((g) => grow(g.labelBox, 2));
  const endOf = (id: string): End | undefined => {
    const n = r.sceneNode.get(id);
    if (n) {
      // An event or a gateway is its symbol; in a vertical flow its label sits under it in the box.
      const box =
        symbolBox(n) ?? (n.look === "icon" && horizontal && n.iconBox ? n.iconBox : n.box);
      const parts = [n.box, n.iconBox, n.labelBox, n.noteBox].filter(
        (b): b is Box => !!b && b.w > 0 && b.h > 0,
      );
      const curved =
        n.shape === "diamond" ||
        n.shape === "circle" ||
        n.shape === "initial" ||
        n.shape === "final" ||
        isBpmnEvent(n.bpmn) ||
        isBpmnGateway(n.bpmn);
      return { id, box, parts, curved, ...(box !== n.box ? { frame: n.box } : {}) };
    }
    const g = r.sceneGroup.get(id);
    if (!g) return undefined;
    const band = r.bands.get(id);
    return { id, box: g.box, parts: [], band };
  };

  const xsOf = () => [...(horizontal ? mLines : cLines)];
  const ysOf = () => [...(horizontal ? cLines : mLines)];
  const addX = (v: number) => (horizontal ? mLines : cLines).add(round(v));
  const addY = (v: number) => (horizontal ? cLines : mLines).add(round(v));
  const placed: Placed[] = [];
  const inside = drawn.filter((b) => b.group).map((b) => [b.c0, b.c0 + b.size] as const);
  // A split shares its trunk and a join its last run, but only between edges drawn alike.
  const kindOf = (e: { flow?: string; line: string }) => `${e.flow ?? "sequence"} ${e.line}`;
  const related = (a: SceneEdge, b: SceneEdge) =>
    (a.from === b.from || a.to === b.to) && kindOf(a) === kindOf(b);
  const joins = new Map<string, number>();
  for (const e of model.edges) joins.set(e.to, (joins.get(e.to) ?? 0) + 1);

  // Along-the-flow and across-the-flow sides of a box, as ports.
  const mAt = (b: Box, end: boolean) => (end === sign > 0 ? b[A.m] + b[A.mw] : b[A.m]);
  const pt = (m: number, c: number): Point => (horizontal ? { x: m, y: c } : { x: c, y: m });
  const fwd = (s: number): Dir => (horizontal ? (s > 0 ? 0 : 1) : s > 0 ? 2 : 3);
  const across = (s: number): Dir => (horizontal ? (s > 0 ? 2 : 3) : s > 0 ? 0 : 1);
  const cMid = (b: Box) => b[A.c] + b[A.cw] / 2;
  const mMid = (b: Box) => b[A.m] + b[A.mw] / 2;
  // Points where an edge already ends, per node: a split leaves from one point and a join enters
  // at one, but a message never shares its point with another edge.
  const used = new Map<string, { p: Point; out: boolean; msg: boolean; kind: string }[]>();
  let shareAll = false;
  /** The kind of the edge being routed (see kindOf). */
  let edgeKind = "";
  const taken = (id: string, p: Point, out: boolean, msg: boolean, kind: string) =>
    !shareAll &&
    (used.get(id) ?? []).some(
      (u) =>
        Math.abs(u.p.x - p.x) < 1 &&
        Math.abs(u.p.y - p.y) < 1 &&
        (u.out !== out || u.msg || msg || u.kind !== kind),
    );
  /**
   * Ports on a node's sides, leaving (out) or arriving (in), each with a cost. A box side also
   * offers two points a quarter in from its middle: messages across the flow take them when the
   * middle is taken, or when a line already runs there.
   */
  const sides = (
    e: End,
    out: boolean,
    costs: { flow: number; back: number; c0: number; c1: number },
    msg: boolean,
  ): Port[] => {
    const b = e.box;
    const ports: Port[] = [];
    const add = (p: Point, d: Dir, cost: number, along: boolean) => {
      if (!Number.isFinite(cost)) return;
      const len = along ? b[A.cw] : b[A.mw];
      const offsets = e.curved || !(msg || !along) ? [0] : [0, -len / 4, len / 4];
      for (const o of offsets) {
        let q = o ? (along ? { ...p, [A.c]: p[A.c] + o } : { ...p, [A.m]: p[A.m] + o }) : p;
        if (taken(e.id, q, out, msg, edgeKind)) continue;
        // A label right under an event or a gateway (a vertical flow): the line starts below it.
        const step = STEPS[out ? d : flip(d)];
        const ahead = { x: q.x + step.x * 24, y: q.y + step.y * 24 };
        const through = e.parts.filter(
          (part) => part !== e.box && part !== e.frame && cuts(q, ahead, part),
        );
        if (through.length) {
          const far = union([...through, e.frame && cuts(q, ahead, e.frame) ? e.frame : undefined]);
          q = step.x
            ? { ...q, x: step.x > 0 ? far.x + far.w : far.x }
            : { ...q, y: step.y > 0 ? far.y + far.h : far.y };
        }
        // Past its own label costs a little, so a clean side wins a tie.
        const extra = (o ? 6 + Math.abs(o) : 0) + (through.length ? 20 : 0);
        ports.push({ p: q, d, cost: cost + extra, ...(through.length ? { through } : {}) });
      }
    };
    // Leaving along the flow from its far side; arriving along the flow into its near side.
    add(pt(mAt(b, out), cMid(b)), fwd(sign), costs.flow, true);
    add(pt(mAt(b, !out), cMid(b)), fwd(-sign), costs.back, true);
    add(pt(mMid(b), b[A.c]), across(out ? -1 : 1), costs.c0, false);
    add(pt(mMid(b), b[A.c] + b[A.cw]), across(out ? 1 : -1), costs.c1, false);
    if (!ports.length && !shareAll) {
      shareAll = true;
      const again = sides(e, out, costs, msg);
      shareAll = false;
      return again;
    }
    return ports;
  };
  /** A band end: its border facing the other end, level with it along the flow. */
  const bandPort = (e: End, other: End, out: boolean): Port[] => {
    const b = e.box;
    const lo = Math.max(r.contentM + 10, b[A.m] + 10);
    const hi = b[A.m] + b[A.mw] - 10;
    const m = Math.min(hi, Math.max(lo, mMid(other.box)));
    const below = cMid(other.box) > cMid(b);
    const c = below ? b[A.c] + b[A.cw] : b[A.c];
    const d = across(out ? (below ? 1 : -1) : below ? -1 : 1);
    return [{ p: pt(m, c), d, cost: 0 }];
  };

  const INF = Number.POSITIVE_INFINITY;
  // A forward edge leaves along the flow; a decision may branch out of a side vertex instead.
  const aside = (e: End) => (e.curved ? 70 : 150);
  const out: SceneEdge[] = [];
  const order = model.edges.map((me, i) => {
    const a = endOf(me.from);
    const b = endOf(me.to);
    const msg = me.flow === "message";
    const span = a && b ? Math.abs(mMid(b.box) - mMid(a.box)) : 0;
    const rank = msg ? 2 : a?.band || b?.band ? 3 : 0;
    return { me, i, a, b, rank, span };
  });
  order.sort((p, q) => p.rank - q.rank || p.span - q.span || p.i - q.i);
  const result = new Map<string, SceneEdge>();
  for (const { me, a, b } of order) {
    const prior = existing.get(me.id);
    // Inside one group item the edge moved with it.
    if (prior && r.items.some((it) => it.inner.includes(prior))) {
      result.set(me.id, prior);
      continue;
    }
    const edge: SceneEdge = prior ?? {
      id: me.id,
      from: me.from,
      to: me.to,
      points: [],
      line: me.line,
      arrow: me.arrow,
      color: me.color,
      step: me.step,
      ...(me.flow ? { flow: me.flow } : {}),
    };
    if (me.label && !edge.label) edge.label = textBlock(me.label, EDGE_LABEL, EDGE_LABEL_MAX);
    edge.labelBox = undefined;
    edge.stepBox = undefined;
    if (!a || !b) {
      if (prior) result.set(me.id, prior);
      continue;
    }
    edgeKind = kindOf(me);
    // A message, or an association to data, leaves across the flow and keeps a point of its own.
    const msg = me.flow === "message" || me.flow === "association";
    const ahead = (mMid(b.box) - mMid(a.box)) * sign;
    const [as0, as1] = [a.box[A.m], a.box[A.m] + a.box[A.mw]];
    const [bs0, bs1] = [b.box[A.m], b.box[A.m] + b.box[A.mw]];
    const level = Math.min(as1, bs1) - Math.max(as0, bs0) > 0.5;
    const below = cMid(b.box) > cMid(a.box);
    let starts: Port[];
    let ends: Port[];
    if (me.from === me.to) {
      starts = sides(a, true, { flow: 0, back: INF, c0: INF, c1: INF }, msg);
      ends = sides(b, false, { flow: INF, back: INF, c0: 0, c1: 10 }, msg);
    } else if (msg || level) {
      // Message flows (and nodes in one layer) cross the flow: out of the facing side.
      const near = { c0: below ? 40 : 0, c1: below ? 0 : 40 };
      const far = { c0: below ? 0 : 40, c1: below ? 40 : 0 };
      starts = a.band
        ? bandPort(a, b, true)
        : sides(a, true, { flow: 80, back: 120, ...near }, msg);
      ends = b.band ? bandPort(b, a, false) : sides(b, false, { flow: 80, back: 120, ...far }, msg);
    } else if (ahead > 0) {
      starts = a.band
        ? bandPort(a, b, true)
        : sides(a, true, { flow: 0, back: INF, c0: aside(a), c1: aside(a) }, msg);
      ends = b.band
        ? bandPort(b, a, false)
        : sides(b, false, { flow: 0, back: INF, c0: aside(b), c1: aside(b) }, msg);
    } else {
      // Back edges loop around the outside: out of a side across the flow, back, and in again.
      starts = a.band
        ? bandPort(a, b, true)
        : sides(a, true, { flow: 25, back: INF, c0: 0, c1: 0 }, msg);
      ends = b.band
        ? bandPort(b, a, false)
        : sides(b, false, { flow: 25, back: INF, c0: 0, c1: 0 }, msg);
    }
    const obstacles: Obstacle[] = [];
    for (const n of ctx.nodes) {
      if (n.id === me.from || n.id === me.to) continue;
      obstacles.push({ box: grow(footOf(n), CLEAR), own: false });
    }
    for (const s of strips) {
      if (s.band.group && (s.band.group.id === me.from || s.band.group.id === me.to)) continue;
      obstacles.push({ box: s.box, own: false });
    }
    for (const h of groupHeads) obstacles.push({ box: h, own: false });
    // An end's own box keeps lines a little away, except the ray out of its port, which only its
    // own label or note in the way stops.
    for (const [end, ports, out] of [
      [a, starts, true],
      [b, ends, false],
    ] as const)
      for (const part of end.parts) {
        const o = { box: grow(part, part === end.box ? 4 : 2), own: true };
        obstacles.push(o);
        for (const port of ports) {
          const step = STEPS[out ? port.d : flip(port.d)];
          const far = { x: port.p.x + step.x * 1e4, y: port.p.y + step.y * 1e4 };
          const mine = part === end.box || part === end.frame || port.through?.includes(part);
          if (mine || !cuts(port.p, far, part)) port.skip = [...(port.skip ?? []), o.box];
        }
      }
    for (const port of [...starts, ...ends]) {
      if (STEPS[port.d].x) addY(port.p.y);
      else addX(port.p.x);
    }
    const pref = (joins.get(me.to) ?? 0) > 1 ? ends : starts;
    const prefM = pref[0] ? (horizontal ? pref[0].p.x : pref[0].p.y) : 0;
    const penalty = (p: Point, q: Point): number => {
      let cost = 0;
      const flat = Math.abs(p.y - q.y) < 0.01;
      // Turns across the flow near the preferred end: a split turns at once, a join at the end.
      const crossFlow = flat !== horizontal;
      if (crossFlow) cost += 0.02 * Math.abs((horizontal ? p.x : p.y) - prefM);
      // A message runs along the flow in the gap between pools, not through a band.
      if (me.flow === "message" && !crossFlow) {
        const at = horizontal ? p.y : p.x;
        const len = flat ? Math.abs(q.x - p.x) : Math.abs(q.y - p.y);
        if (inside.some(([c0, c1]) => at > c0 && at < c1)) cost += 0.25 * len;
        // Its middle, where a label fits above or below the line.
        const gap = poolGaps.find(([g0, g1]) => at > g0 && at < g1);
        if (gap) cost += 0.02 * len * Math.abs(at - (gap[0] + gap[1]) / 2);
      }
      for (const s of placed) {
        if (related(s.edge, edge)) continue;
        const sFlat = Math.abs(s.p.y - s.q.y) < 0.01;
        if (sFlat === flat) {
          const at = flat ? p.y : p.x;
          const sAt = flat ? s.p.y : s.p.x;
          const [a0, a1] = flat
            ? [Math.min(p.x, q.x), Math.max(p.x, q.x)]
            : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
          const [b0, b1] = flat
            ? [Math.min(s.p.x, s.q.x), Math.max(s.p.x, s.q.x)]
            : [Math.min(s.p.y, s.q.y), Math.max(s.p.y, s.q.y)];
          const shared = Math.min(a1, b1) - Math.max(a0, b0);
          // On one line, or so close the two read as one.
          if (shared > 0.5 && Math.abs(at - sAt) < 1) cost += 400 + 4 * shared;
          else if (shared > 0.5 && Math.abs(at - sAt) < 8) cost += 300 + 3 * shared;
          else if (shared > 0.5 && Math.abs(at - sAt) < 11) cost += 40 + 1.2 * shared;
        } else {
          const h = flat ? { p, q } : { p: s.p, q: s.q };
          const v = flat ? { p: s.p, q: s.q } : { p, q };
          const x = v.p.x;
          const y = h.p.y;
          if (
            x > Math.min(h.p.x, h.q.x) + 0.5 &&
            x < Math.max(h.p.x, h.q.x) - 0.5 &&
            y > Math.min(v.p.y, v.q.y) + 0.5 &&
            y < Math.max(v.p.y, v.q.y) - 0.5
          )
            cost += 14;
        }
      }
      return cost;
    };
    let points = gridRoute(xsOf(), ysOf(), starts, ends, obstacles, penalty);
    if (!points)
      points = gridRoute(
        xsOf(),
        ysOf(),
        starts,
        ends,
        obstacles.filter((o) => o.own),
        () => 0,
      );
    const s0 = starts[0];
    const e0 = ends[0];
    if (!points && s0 && e0) points = elbow(s0.p, e0.p, horizontal);
    if (!points) {
      if (prior) result.set(me.id, prior);
      continue;
    }
    edge.points = dropStraight(points.map((p) => ({ x: round(p.x), y: round(p.y) })));
    const p0 = edge.points[0];
    const p1 = edge.points[edge.points.length - 1];
    const kind = edgeKind;
    if (p0) used.set(me.from, [...(used.get(me.from) ?? []), { p: p0, out: true, msg, kind }]);
    if (p1) used.set(me.to, [...(used.get(me.to) ?? []), { p: p1, out: false, msg, kind }]);
    for (let k = 1; k < edge.points.length; k++) {
      const p = edge.points[k - 1];
      const q = edge.points[k];
      if (p && q) placed.push({ edge, p, q });
    }
    result.set(me.id, edge);
  }
  for (const me of model.edges) {
    const e = result.get(me.id);
    if (e) out.push(e);
  }
  placeLabels(r, out);
  return out;
}

/** An elbow between two points when no grid route exists. */
function elbow(p: Point, q: Point, horizontal: boolean): Point[] {
  if (horizontal) {
    const mx = (p.x + q.x) / 2;
    return [p, { x: mx, y: p.y }, { x: mx, y: q.y }, q];
  }
  const my = (p.y + q.y) / 2;
  return [p, { x: p.x, y: my }, { x: q.x, y: my }, q];
}

/**
 * The cheapest orthogonal route on the grid of lines `xs` and `ys` from one of the start ports to
 * one of the end ports: length, plus a cost per bend, plus `penalty` per segment. Obstacles are
 * boxes no segment may enter; a port's own ray out of its node skips that node.
 */
function gridRoute(
  xsIn: number[],
  ysIn: number[],
  starts: Port[],
  ends: Port[],
  obstacles: Obstacle[],
  penalty: (p: Point, q: Point) => number,
): Point[] | undefined {
  const uniq = (v: number[]) =>
    [...v].sort((a, b) => a - b).filter((x, i, s) => i === 0 || x - (s[i - 1] ?? 0) > 0.5);
  const xs = uniq(xsIn);
  const ys = uniq(ysIn);
  const nx = xs.length;
  const ny = ys.length;
  const at = (i: number, j: number): Point => ({ x: xs[i] ?? 0, y: ys[j] ?? 0 });
  const blocked = (p: Point, q: Point, skip?: Box[]) =>
    obstacles.some((o) => !skip?.includes(o.box) && cuts(p, q, o.box));
  const indexOf = (list: number[], v: number) => list.findIndex((x) => Math.abs(x - v) <= 0.5);
  // Segment costs between neighbors, per edge; Infinity where blocked.
  const right = new Float64Array(nx * ny).fill(Number.POSITIVE_INFINITY);
  const down = new Float64Array(nx * ny).fill(Number.POSITIVE_INFINITY);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const p = at(i, j);
      if (i + 1 < nx) {
        const q = at(i + 1, j);
        if (!blocked(p, q)) right[i * ny + j] = q.x - p.x + penalty(p, q);
      }
      if (j + 1 < ny) {
        const q = at(i, j + 1);
        if (!blocked(p, q)) down[i * ny + j] = q.y - p.y + penalty(p, q);
      }
    }
  const N = nx * ny * 4;
  const dist = new Float64Array(N + 1).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(N + 1).fill(-1);
  const startOf = new Map<number, Point>();
  const heap: [number, number][] = [];
  const push = (cost: number, s: number) => {
    heap.push([cost, s]);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const a = heap[parent];
      const b = heap[i];
      if (!a || !b || a[0] <= b[0]) break;
      heap[parent] = b;
      heap[i] = a;
      i = parent;
    }
  };
  const pop = (): [number, number] | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (!top || !last) return undefined;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const rr = l + 1;
        let m = i;
        if ((heap[l]?.[0] ?? Number.POSITIVE_INFINITY) < (heap[m]?.[0] ?? 0)) m = l;
        if ((heap[rr]?.[0] ?? Number.POSITIVE_INFINITY) < (heap[m]?.[0] ?? 0)) m = rr;
        if (m === i) break;
        const a = heap[m];
        const b = heap[i];
        if (!a || !b) break;
        heap[m] = b;
        heap[i] = a;
        i = m;
      }
    }
    return top;
  };
  const state = (i: number, j: number, d: Dir) => (i * ny + j) * 4 + d;
  // Rays: from a start port out to each line it crosses, until something blocks it.
  const ray = (port: Port, back: boolean, visit: (i: number, j: number, cost: number) => void) => {
    const step = STEPS[port.d];
    const s = back ? -1 : 1;
    const p = port.p;
    if (step.x) {
      const j = indexOf(ys, p.y);
      if (j < 0) return;
      const order = xs.map((x, i) => [x, i] as const).filter(([x]) => (x - p.x) * step.x * s > 0.5);
      order.sort((a, b) => Math.abs(a[0] - p.x) - Math.abs(b[0] - p.x));
      for (const [x, i] of order) {
        const q = { x, y: p.y };
        if (blocked(p, q, port.skip)) break;
        visit(i, j, Math.abs(x - p.x) + penalty(p, q));
      }
    } else {
      const i = indexOf(xs, p.x);
      if (i < 0) return;
      const order = ys.map((y, j) => [y, j] as const).filter(([y]) => (y - p.y) * step.y * s > 0.5);
      order.sort((a, b) => Math.abs(a[0] - p.y) - Math.abs(b[0] - p.y));
      for (const [y, j] of order) {
        const q = { x: p.x, y };
        if (blocked(p, q, port.skip)) break;
        visit(i, j, Math.abs(y - p.y) + penalty(p, q));
      }
    }
  };
  for (const port of starts)
    ray(port, false, (i, j, len) => {
      const s = state(i, j, port.d);
      const cost = port.cost + len;
      if (cost < (dist[s] ?? 0)) {
        dist[s] = cost;
        prev[s] = -1;
        startOf.set(s, port.p);
        push(cost, s);
      }
    });
  const goals = new Map<number, { extra: number; port: Port }>();
  for (const port of ends)
    ray(port, true, (i, j, len) => {
      const s = state(i, j, port.d);
      const extra = port.cost + len;
      const had = goals.get(s);
      if (!had || extra < had.extra) goals.set(s, { extra, port });
    });
  const GOAL = N;
  let goalFrom = -1;
  for (;;) {
    const top = pop();
    if (!top) break;
    const [cost, s] = top;
    if (cost > (dist[s] ?? 0)) continue;
    if (s === GOAL) break;
    const goal = goals.get(s);
    if (goal && cost + goal.extra < (dist[GOAL] ?? 0)) {
      dist[GOAL] = cost + goal.extra;
      goalFrom = s;
      push(dist[GOAL] ?? 0, GOAL);
    }
    const d = (s % 4) as Dir;
    const cell = (s - d) / 4;
    const i = Math.floor(cell / ny);
    const j = cell % ny;
    const relax = (t: number, c: number) => {
      if (c < (dist[t] ?? 0)) {
        dist[t] = c;
        prev[t] = s;
        push(c, t);
      }
    };
    // Straight on.
    if (d === 0 && i + 1 < nx) relax(state(i + 1, j, 0), cost + (right[i * ny + j] ?? 0));
    if (d === 1 && i > 0) relax(state(i - 1, j, 1), cost + (right[(i - 1) * ny + j] ?? 0));
    if (d === 2 && j + 1 < ny) relax(state(i, j + 1, 2), cost + (down[i * ny + j] ?? 0));
    if (d === 3 && j > 0) relax(state(i, j - 1, 3), cost + (down[i * ny + j - 1] ?? 0));
    // Turns.
    for (const t of (d < 2 ? [2, 3] : [0, 1]) as Dir[]) relax(state(i, j, t), cost + BEND);
  }
  if (goalFrom < 0) return undefined;
  const goal = goals.get(goalFrom);
  if (!goal) return undefined;
  const path: Point[] = [goal.port.p];
  let s = goalFrom;
  let first = s;
  while (s >= 0) {
    const cell = (s - (s % 4)) / 4;
    path.push(at(Math.floor(cell / ny), cell % ny));
    first = s;
    s = prev[s] ?? -1;
  }
  const origin = startOf.get(first);
  if (origin) path.push(origin);
  return path.reverse();
}

// ---------------------------------------------------------------- labels

/**
 * Edge labels (and step badges) go beside a segment of the new route: above a run along the flow
 * in a horizontal flow, beside one in a vertical flow, clear of nodes, strips, other labels and
 * every line. Branches out of a gateway keep theirs near the start.
 */
function placeLabels(r: Routing, edges: SceneEdge[]): void {
  const { ctx, A } = r;
  const { model, horizontal } = ctx;
  const blocks: Box[] = [
    ...ctx.nodes.map((n) => grow(footOf(n), 3)),
    ...ctx.groups.flatMap((g) => (g.lane ? [g.lane.header] : g.labelBox.w > 0 ? [g.labelBox] : [])),
  ];
  // Band borders across the flow: a label astride one reads as belonging to neither band.
  const borders = r.all.flatMap((b) => (b.group || b.items.length ? [b.c0, b.c0 + b.size] : []));
  const segments = edges.flatMap((e) =>
    e.points.slice(1).map((q, i) => ({ e, p: e.points[i] ?? q, q })),
  );
  const fanOut = new Map<string, number>();
  for (const e of model.edges) fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
  for (const e of edges) {
    const me = model.edges.find((x) => x.id === e.id);
    if (!me || (!me.label && me.step === undefined) || e.points.length < 2) continue;
    if (e.labelBox || e.stepBox) continue;
    const block = e.label ?? textBlock(me.label ?? "", EDGE_LABEL, EDGE_LABEL_MAX);
    const stepW = me.step !== undefined ? STEP + 2 : 0;
    const w = Math.ceil((me.label ? block.width + 12 : 0) + stepW + (me.label && stepW ? 2 : 0));
    const h = Math.ceil(Math.max(me.label ? block.height + 6 : 0, stepW ? STEP : 0));
    const early = (fanOut.get(e.from) ?? 0) > 1;
    let best: { box: Box; score: number } | undefined;
    const consider = (box: Box, base: number) => {
      const c0 = box[A.c];
      const c1 = box[A.c] + box[A.cw];
      const m0 = box[A.m];
      const m1 = box[A.m] + box[A.mw];
      const astride =
        borders.some((v) => v > c0 - 3 && v < c1 + 3) || (m0 < r.endM + 3 && m1 > r.endM - 3);
      const score = base + (astride ? 30 : 0);
      if (best && best.score <= score) return;
      if (blocks.some((b) => hits(box, b))) return;
      if (segments.some((s) => cuts(s.p, s.q, grow(box, 1)))) return;
      best = { box, score };
    };
    e.points.slice(1).forEach((q, k) => {
      const p = e.points[k];
      if (!p) return;
      const flat = Math.abs(p.y - q.y) < 0.01;
      const len = flat ? Math.abs(q.x - p.x) : Math.abs(q.y - p.y);
      const along = flat === horizontal;
      // Shared with a sibling (the trunk of a split): the label would name the wrong branch.
      const shared = segments.some(
        (s) =>
          s.e !== e &&
          Math.abs(flat ? s.p.y - p.y : s.p.x - p.x) < 0.5 &&
          Math.abs(flat ? s.q.y - q.y : s.q.x - q.x) < 0.5 &&
          Math.min(
            flat ? Math.max(p.x, q.x) : Math.max(p.y, q.y),
            flat ? Math.max(s.p.x, s.q.x) : Math.max(s.p.y, s.q.y),
          ) -
            Math.max(
              flat ? Math.min(p.x, q.x) : Math.min(p.y, q.y),
              flat ? Math.min(s.p.x, s.q.x) : Math.min(s.p.y, s.q.y),
            ) >
            0.5,
      );
      const base = (along ? 0 : 12) + (shared ? 60 : 0) + k * (early ? 6 : 1);
      const need = (flat ? w : h) + 12;
      if (len < need && !(len >= (flat ? w : h) + 4)) return;
      const lo = flat ? Math.min(p.x, q.x) : Math.min(p.y, q.y);
      const hi = flat ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
      const size = flat ? w : h;
      const forward = flat ? q.x > p.x : q.y > p.y;
      const nearStart = forward ? lo + 8 : hi - 8 - size;
      const nearEnd = forward ? hi - 14 - size : lo + 14;
      const mid = (lo + hi) / 2 - size / 2;
      const spots = early
        ? [
            [nearStart, 0],
            [mid, 3],
            [nearEnd, 6],
          ]
        : [
            [mid, 0],
            [nearStart, 3],
            [nearEnd, 4],
          ];
      for (const [v = 0, s = 0] of spots) {
        if (v < lo + 2 || v + size > hi - 2) continue;
        if (flat) {
          consider({ x: v, y: p.y - 4 - h, w, h }, base + s);
          consider({ x: v, y: p.y + 4, w, h }, base + s + 4);
        } else {
          consider({ x: p.x + 6, y: v, w, h }, base + s);
          consider({ x: p.x - 6 - w, y: v, w, h }, base + s + 4);
        }
      }
    });
    if (!best) {
      // No clear spot: above the middle of the longest segment.
      const segs = e.points.slice(1).map((q, k) => [e.points[k] ?? q, q] as const);
      segs.sort(
        ([a, b], [c, d]) => Math.hypot(d.x - c.x, d.y - c.y) - Math.hypot(b.x - a.x, b.y - a.y),
      );
      const [p, q] = segs[0] ?? [e.points[0], e.points[1]];
      if (!p || !q) continue;
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      best = {
        box:
          Math.abs(p.y - q.y) < 0.01
            ? { x: mx - w / 2, y: my - 4 - h, w, h }
            : { x: mx + 6, y: my - h / 2, w, h },
        score: 0,
      };
    }
    const box = { x: round(best.box.x), y: round(best.box.y), w, h };
    blocks.push(grow(box, 2));
    if (me.step !== undefined)
      e.stepBox = { x: box.x, y: round(box.y + (h - STEP) / 2), w: STEP, h: STEP };
    if (me.label) {
      e.label = block;
      e.labelBox = {
        x: round(box.x + stepW + (stepW ? 2 : 0)),
        y: box.y,
        w: round(w - stepW - (stepW ? 2 : 0)),
        h,
      };
    }
  }
}
