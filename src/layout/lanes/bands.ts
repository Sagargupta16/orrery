// Pools and lanes as bands: the band tree, the items that move into it, band sizes, strips and
// placement, and the scene groups the bands paint. Edges are routed again at the end.

import { contrast, ensureContrast, luminance, mixHex } from "../color.ts";
import type { AfterLayout } from "../hooks.ts";
import { symbolBox } from "../notation.ts";
import { resolveGroupStyle } from "../styles.ts";
import { textBlock } from "../text.ts";
import { THEME_TOKENS } from "../themes.ts";
import type { Box, Model, ModelGroup, SceneGroup, SceneNode } from "../types.ts";
import { routeEdges } from "./lane-routes.ts";
import {
  type Axis,
  type Band,
  BLACK_BOX,
  blackBox,
  clusters,
  EDGE_LABEL,
  EDGE_LABEL_MAX,
  footOf,
  type Item,
  type Key,
  LABEL,
  type Len,
  MIN_BAND,
  nodeBoxes,
  PAD,
  POOL_GAP,
  RUN,
  round,
  STACK,
  STEP,
  STRIP,
  union,
} from "./lane-shared.ts";

/** What every phase of the band layout reads. */
interface Scope {
  ctx: AfterLayout;
  ids: Set<string>;
  A: Axis;
  sceneNode: Map<string, SceneNode>;
  sceneGroup: Map<string, SceneGroup>;
  parentOf: Map<string, string | undefined>;
  within: (id: string, anc: string) => boolean;
}

/** The band tree, in spec order. */
interface Tree {
  bands: Map<string, Band>;
  roots: Band[];
  /** The band of the nodes in no band, once one turns up. */
  loose?: Band;
  /** The band a node or group with this parent goes in. */
  bandFor(parent: string | undefined): Band;
}

interface Items {
  items: Item[];
  elkCross: Map<Item, number>;
  itemOf: Map<string, Item>;
}

interface Overlay {
  g: SceneGroup;
  members: string[];
  before: Box | undefined;
}

/** Along the flow: the offset items move by, where the bands start and end, where content starts. */
interface Run {
  m0: number;
  startM: number;
  endM: number;
  contentM: number;
}

const cspan = (A: Axis, b: Box): [number, number] => [b[A.c], b[A.c] + b[A.cw]];
const mspan = (A: Axis, b: Box): [number, number] => [b[A.m], b[A.m] + b[A.mw]];
const center = (b: Box, k: Key, w: Len) => b[k] + b[w] / 2;

export function bandLayout(ctx: AfterLayout, ids: Set<string>): void {
  const { model, nodes, groups, edges, horizontal } = ctx;
  const A: Axis = horizontal
    ? { m: "x", mw: "w", c: "y", cw: "h" }
    : { m: "y", mw: "h", c: "x", cw: "w" };
  const sign = model.direction === "left" || model.direction === "up" ? -1 : 1;
  const parentOf = new Map<string, string | undefined>(
    [...model.nodes, ...model.groups].map((x) => [x.id, x.parent]),
  );
  const sc: Scope = {
    ctx,
    ids,
    A,
    sceneNode: new Map(nodes.map((n) => [n.id, n])),
    sceneGroup: new Map(groups.map((g) => [g.id, g])),
    parentOf,
    within: (id: string, anc: string) => {
      for (let p = parentOf.get(id); p; p = parentOf.get(p)) if (p === anc) return true;
      return false;
    },
  };
  const tree = bandTree(model, ids);
  const { items, elkCross, itemOf } = collectItems(sc, tree);
  const overlays = overlaysOf(sc);
  const all = allBands(tree);
  const layers = sizeBands(sc, tree, elkCross);
  const lead = insetStrips(tree, all);
  const along = pullColumns(sc, items, itemOf);
  const run = runOf(sc, items, along, lead);
  placeAcross(ctx, tree);
  moveItems(sc, tree, all, layers, along, run.m0);
  followOverlays(sc, overlays);
  paintBands(ctx, all, run);
  inkOnBands(sc, tree.bands);

  // ------------------------------------------------------------- edges
  const routes = routeEdges({
    ctx,
    A,
    sign,
    all,
    items,
    layers,
    bands: tree.bands,
    itemOf,
    sceneNode: sc.sceneNode,
    sceneGroup: new Map(groups.map((g) => [g.id, g])),
    contentM: run.contentM,
    endM: run.endM,
  });
  edges.splice(0, edges.length, ...routes);
}

const makeBand = (group: ModelGroup | undefined, depth: number): Band => ({
  group,
  kids: [],
  items: [],
  depth,
  c0: 0,
  size: 0,
  strip: 0,
  inset: 0,
});

/** The band tree, in spec order. */
function bandTree(model: Model, ids: Set<string>): Tree {
  const bands = new Map<string, Band>();
  const roots: Band[] = [];
  for (const g of model.groups) if (ids.has(g.id)) bands.set(g.id, makeBand(g, 0));
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
  const own = new Map<Band, Band>();
  const tree: Tree = {
    bands,
    roots,
    bandFor(parent) {
      const b = parent ? bands.get(parent) : undefined;
      if (!b) {
        tree.loose ??= makeBand(undefined, 0);
        return tree.loose;
      }
      if (!b.kids.length || own.has(b)) return own.get(b) ?? b;
      const o = makeBand(undefined, b.depth + 1);
      own.set(b, o);
      b.kids.unshift(o);
      return o;
    },
  };
  return tree;
}

/** Items: nodes and ordinary groups that sit in a band (or in none), with their ELK positions. */
function collectItems(sc: Scope, tree: Tree): Items {
  const { ctx, ids, A, sceneNode, sceneGroup, within } = sc;
  const { model, edges, horizontal } = ctx;
  /** Where edges attach: an event's or gateway's symbol, an icon in a horizontal flow, the box. */
  const attachOf = (n: SceneNode): Box =>
    symbolBox(n) ?? (n.look === "icon" && horizontal && n.iconBox ? n.iconBox : n.box);
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
    tree.bandFor(n.parent).items.push(it);
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
    tree.bandFor(g.parent).items.push(it);
    items.push(it);
  }
  for (const it of items) elkCross.set(it, it.attach[A.c] + it.attach[A.cw] / 2);
  const itemOf = new Map<string, Item>();
  for (const it of items) {
    itemOf.set(it.id, it);
    for (const x of [...model.nodes, ...model.groups])
      if (within(x.id, it.id)) itemOf.set(x.id, it);
  }
  return { items, elkCross, itemOf };
}

/** Overlays (around:) outline their members: they follow them, keeping their margins. */
function overlaysOf(sc: Scope): Overlay[] {
  const { model, groups } = sc.ctx;
  return groups
    .filter((g) => g.overlay)
    .map((g) => {
      const members = model.groups.find((x) => x.id === g.id)?.around ?? [];
      return { g, members, before: memberBox(sc, members) };
    });
}

function memberBox(sc: Scope, members: string[]): Box | undefined {
  const boxes = members.flatMap((id) => {
    const n = sc.sceneNode.get(id);
    if (n) return [footOf(n)];
    const s = sc.sceneGroup.get(id);
    return s ? [s.box] : [];
  });
  return boxes.length ? union(boxes) : undefined;
}

/** Every band, depth first, and the loose band last. */
function allBands(tree: Tree): Band[] {
  const all: Band[] = [];
  const collect = (b: Band) => {
    all.push(b);
    for (const k of b.kids) collect(k);
  };
  for (const r of tree.roots) collect(r);
  if (tree.loose) all.push(tree.loose);
  return all;
}

/**
 * Depth across the flow: each leaf band holds its deepest layer, a lone node centered. Returns
 * each leaf band's layers, its items in columns along the flow.
 */
function sizeBands(sc: Scope, tree: Tree, elkCross: Map<Item, number>): Map<Band, Item[][]> {
  const { A } = sc;
  const layers = new Map<Band, Item[][]>();
  const leafSize = (b: Band): number => {
    if (blackBox(b)) return BLACK_BOX;
    const cols = clusters(b.items, (it) => mspan(A, it.foot)).map((col) =>
      col.sort((p, q) => (elkCross.get(p) ?? 0) - (elkCross.get(q) ?? 0)),
    );
    layers.set(b, cols);
    let need = 0;
    for (const col of cols) {
      const first = col[0];
      if (col.length === 1 && first) {
        const mid = center(first.attach, A.c, A.cw);
        const [f0, f1] = cspan(A, first.foot);
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
  for (const b of [...tree.roots, ...(tree.loose ? [tree.loose] : [])]) size(b);
  return layers;
}

/**
 * Strips along the flow: one thickness per nesting depth, wide enough for a wrapped name. Returns
 * how far the deepest strip reaches.
 */
function insetStrips(tree: Tree, all: Band[]): number {
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
  for (const r of tree.roots) inset(r, 0);
  return Math.max(0, ...all.map((b) => b.inset + b.strip));
}

/**
 * Along the flow ELK's layers stay in order, but ELK widened the gap between two layers for each
 * edge label it put there. Labels now go beside the new routes, so a gap keeps only the room the
 * labels of the edges across it need (one gap per edge, its widest).
 */
function pullColumns(sc: Scope, items: Item[], itemOf: Map<string, Item>): Map<Item, number> {
  const { A } = sc;
  const { model, horizontal } = sc.ctx;
  const columns = clusters(items, (it) => mspan(A, it.foot));
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
  return along;
}

/** Then everything moves by one offset so the strips fit. */
function runOf(sc: Scope, items: Item[], along: Map<Item, number>, lead: number): Run {
  const { ctx, A } = sc;
  const feet = items.map((it) => {
    const [s0, s1] = mspan(A, it.foot);
    const d = along.get(it) ?? 0;
    return [s0 + d, s1 + d] as const;
  });
  const first = Math.min(...feet.map(([s]) => s));
  const last = Math.max(...feet.map(([, e]) => e));
  const m0 = (ctx.horizontal ? 28 : ctx.top + 28) - (first - RUN - lead);
  const startM = first - RUN - lead + m0;
  const endM = last + RUN + m0;
  const contentM = startM + lead;
  return { m0, startM, endM, contentM };
}

/** Across the flow: pools apart, neighboring standalone lanes sharing a border. */
function placeAcross(ctx: AfterLayout, tree: Tree): void {
  let c = ctx.horizontal ? ctx.top + 28 : 28;
  const loose = tree.loose;
  const stack = [...tree.roots, ...(loose?.items.length ? [loose] : [])];
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
}

/** Move each item into its band. */
function moveItems(
  sc: Scope,
  tree: Tree,
  all: Band[],
  layers: Map<Band, Item[][]>,
  along: Map<Item, number>,
  m0: number,
): void {
  const { A } = sc;
  const { horizontal } = sc.ctx;
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
    if (b === tree.loose && !b.items.length) continue;
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
}

function followOverlays(sc: Scope, overlays: Overlay[]): void {
  for (const o of overlays) {
    const now = memberBox(sc, o.members);
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
}

/** Scene groups: the band, and its strip across the flow. */
function paintBands(ctx: AfterLayout, all: Band[], run: Run): void {
  const { groups, horizontal } = ctx;
  const { startM, endM } = run;
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
}

/** Text on a filled band keeps 4.5:1, as layout does for nodes on a filled group. */
function inkOnBands(sc: Scope, bands: Map<string, Band>): void {
  const { ctx, parentOf, sceneGroup } = sc;
  const t = THEME_TOKENS[ctx.theme];
  for (const n of ctx.nodes) {
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
}
