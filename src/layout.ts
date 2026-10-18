import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { contrast, ensureContrast, luminance, mixHex } from "./color.ts";
import type { LayoutHooks, NodeGeom } from "./hooks.ts";
import { iconAspect } from "./icons.ts";
import { journeyLayout } from "./journey.ts";
import { kindHooks } from "./kinds.ts";
import { laneHooks } from "./lanes.ts";
import { notationGeometry, placeNotation } from "./notation.ts";
import { vendorDir } from "./paths.ts";
import { stageColors } from "./skins.ts";
import { resolveGroupStyle } from "./styles.ts";
import { measure, textBlock } from "./text.ts";
import { THEME_TOKENS } from "./themes.ts";
import type {
  AnimateMode,
  Box,
  LegendEntry,
  Model,
  ModelEdge,
  ModelGroup,
  ModelNode,
  Point,
  Scene,
  SceneEdge,
  SceneGroup,
  SceneLegend,
  SceneNode,
  TextBlock,
  ThemeName,
} from "./types.ts";

// ---------------------------------------------------------------- ELK

interface ElkLabel {
  id?: string;
  text?: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
}
interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
  labels?: ElkLabel[];
  ports?: {
    id: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
  }[];
  layoutOptions?: Record<string, string>;
}
interface ElkSection {
  startPoint: Point;
  endPoint: Point;
  bendPoints?: Point[];
}
interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  labels?: ElkLabel[];
  sections?: ElkSection[];
}
interface Elk {
  layout(graph: ElkNode): Promise<ElkNode>;
}

let elkInstance: Elk | undefined;
function elk(): Elk {
  if (elkInstance) return elkInstance;
  const require = createRequire(import.meta.url);
  const vendored = join(vendorDir, "elk.bundled.cjs");
  const ELK = require(
    existsSync(vendored) ? vendored : "elkjs/lib/elk.bundled.js",
  ) as new () => Elk;
  elkInstance = new ELK();
  return elkInstance;
}

// ---------------------------------------------------------------- sizes

export const SIZES = {
  pad: 28,
  nodeLabel: 13,
  note: 11.5,
  groupLabel: 13,
  edgeLabel: 11.5,
  title: 20,
  subtitle: 13,
  iconLabelMax: 132,
  // Step badges: official AWS, Azure and Google badges are 0.54 to 0.75 of the icon size.
  step: 28,
  cardLabelMax: 168,
  shapeLabelMax: 156,
  edgeLabelMax: 150,
  // AWS group tiles are 40x40 next to 48px service icons in the deck ("DON'T: Resize group icons").
  tile: 40,
  inlineIcon: 20,
};

const ELK_DIRECTION = {
  right: "RIGHT",
  down: "DOWN",
  left: "LEFT",
  up: "UP",
} as const;
const ELK_ROUTING = {
  orthogonal: "ORTHOGONAL",
  polyline: "POLYLINE",
  spline: "SPLINES",
} as const;

const round = (v: number) => Math.round(v * 100) / 100;

/** The extension modules, in the order their hooks run. */
const HOOKS: LayoutHooks[] = [laneHooks, kindHooks];

function nodeGeometry(n: ModelNode, horizontal: boolean): NodeGeom {
  const notation = notationGeometry(n, horizontal);
  if (notation) return notation;
  const S = n.iconSize;
  if (n.look === "icon") {
    const label = textBlock(n.label, SIZES.nodeLabel, Math.max(SIZES.iconLabelMax, S + 40));
    const note = n.note
      ? textBlock(n.note, SIZES.note, Math.max(SIZES.iconLabelMax, S + 40))
      : undefined;
    const textW = Math.max(label.width, note?.width ?? 0);
    const textH = label.height + (note ? note.height + 2 : 0);
    // The label sits 6px under the icon in every direction (ELK's labelNode spacing when outside).
    if (horizontal)
      return {
        w: S,
        h: S,
        label,
        note,
        outside: { w: Math.ceil(textW), h: Math.ceil(textH) },
      };
    return {
      w: Math.ceil(Math.max(S, textW)),
      h: Math.ceil(S + 6 + textH),
      label,
      note,
    };
  }
  if (n.look === "card") {
    const label = textBlock(n.label, SIZES.nodeLabel, SIZES.cardLabelMax, 600);
    const note = n.note ? textBlock(n.note, SIZES.note, SIZES.cardLabelMax) : undefined;
    const textW = Math.max(label.width, note?.width ?? 0);
    const textH = label.height + (note ? note.height + 2 : 0);
    const icon = n.icon ? S + 12 : 0;
    return {
      w: Math.ceil(Math.max(150, 16 + icon + textW + 18)),
      h: Math.ceil(Math.max(56, Math.max(textH, n.icon ? S : 0) + 24)),
      label,
      note,
    };
  }
  const label = textBlock(n.label, SIZES.nodeLabel, SIZES.shapeLabelMax, 600);
  const note = n.note ? textBlock(n.note, SIZES.note, SIZES.shapeLabelMax) : undefined;
  const textW = Math.max(label.width, note?.width ?? 0);
  const textH = label.height + (note ? note.height + 2 : 0);
  const icon = n.icon ? 28 : 0;
  let w = Math.max(108, textW + icon + 32);
  let h = Math.max(52, textH + 26);
  switch (n.shape) {
    case "circle":
      w = h = Math.max(w, h, 72);
      break;
    case "diamond":
      w *= 1.45;
      h *= 1.45;
      break;
    case "hexagon":
      w += 28;
      break;
    case "cylinder":
      h += 16;
      break;
    case "queue":
      w += 24;
      break;
    case "document":
      h += 10;
      break;
    case "person":
      h += 30;
      break;
    case "cloud":
      w += 36;
      h += 22;
      break;
    case "stack":
      w += 8;
      h += 8;
      break;
    case "note":
      w += 8;
      break;
    default:
      break;
  }
  return { w: Math.ceil(w), h: Math.ceil(h), label, note };
}

/**
 * A node badge pill at the anchor's top-right corner, sized from the measured text. Its left
 * edge stays right of the anchor's center so a long pill never covers an arrow arriving there.
 */
function badgePill(text: string, anchor: Box): Box {
  const w = round(Math.max(18, measure(text, 10, 600) + 10));
  const x = Math.max(anchor.x + anchor.w - w / 2 - 2, anchor.x + anchor.w / 2 + 6);
  return { x: round(x), y: round(anchor.y - 7), w, h: 16 };
}

interface GroupGeom {
  label: TextBlock;
  header: number;
  minWidth: number;
  icon?: string;
  iconStyle: "tile" | "tile-center" | "inline";
  center: boolean;
}

function groupGeometry(g: ModelGroup): GroupGeom {
  const style = resolveGroupStyle(g.type);
  const icon = g.icon === null ? undefined : (g.icon ?? style?.icon);
  const iconStyle = style?.iconStyle ?? "inline";
  const label = textBlock(g.label, SIZES.groupLabel, 1000, 600);
  const center = style?.labelAlign === "center";
  let header: number;
  let minWidth: number;
  if (iconStyle === "tile-center") {
    header = (icon ? SIZES.tile + 3 : 6) + label.height + 4;
    minWidth = Math.max(icon ? SIZES.tile : 0, label.width) + 32;
  } else if (iconStyle === "tile") {
    header = icon ? Math.max(SIZES.tile, label.height + 12) : label.height + 12;
    minWidth = (icon ? SIZES.tile + 8 : 12) + label.width + 16;
  } else {
    // Wrapped labels grow the header so their last line stays above the content.
    header = Math.max(34, label.height + 17);
    minWidth = 12 + (icon ? SIZES.inlineIcon + 8 : 0) + label.width + 16;
  }
  return {
    label,
    header: Math.ceil(header),
    minWidth: Math.ceil(minWidth),
    icon,
    iconStyle,
    center,
  };
}

// ---------------------------------------------------------------- layout

export interface LayoutOptions {
  theme?: ThemeName;
  /** Groups whose corner label must end left of the top center (set by the second pass). */
  widen?: Set<string>;
  /** Extra top padding per group, so an overlay's header clears the headers above it (second pass). */
  room?: Map<string, number>;
}

export async function layout(model: Model, opts: LayoutOptions = {}): Promise<Scene> {
  const theme = opts.theme ?? model.theme;
  // A journey is a grid of stages and lanes with its own layout.
  if (model.kind === "journey") {
    const grid = await journeyLayout(model, theme);
    if (grid) return model.skin === "stage" ? stageColors(grid) : grid;
  }
  const t = THEME_TOKENS[theme];
  const horizontal = model.direction === "right" || model.direction === "left";
  const s = model.spacing;
  // A group whose header no edge could avoid (second pass) is wide enough for its corner label to
  // end left of the top center, where edges enter in a vertical flow, as in AWS reference
  // diagrams (the label ends minWidth - 16 from the left border).
  const minWidthOf = (id: string, gg: GroupGeom) =>
    !horizontal && opts.widen?.has(id)
      ? Math.max(gg.minWidth, 2 * (gg.minWidth - 10))
      : gg.minWidth;

  const base: Record<string, string> = {
    "elk.algorithm": "layered",
    "elk.direction": ELK_DIRECTION[model.direction],
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.edgeRouting": ELK_ROUTING[model.routing],
    "elk.layered.layering.strategy":
      model.layering === "simplex" ? "NETWORK_SIMPLEX" : "LONGEST_PATH_SOURCE",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    // Orders each layer by the elk.position hints below, so siblings keep spec order (AZ A left
    // of AZ B). considerModelOrder would do the same but crashes elkjs 0.12 on nested graphs.
    "elk.layered.crossingMinimization.semiInteractive": "true",
    "elk.spacing.nodeNode": String(Math.round(40 * s)),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(Math.round(64 * s)),
    "elk.spacing.edgeNode": String(Math.round(18 * s)),
    "elk.spacing.edgeEdge": String(Math.round(10 * s)),
    "elk.layered.spacing.edgeNodeBetweenLayers": String(Math.round(20 * s)),
    "elk.layered.spacing.edgeEdgeBetweenLayers": String(Math.round(10 * s)),
    "elk.spacing.edgeLabel": "4",
    "elk.spacing.labelNode": "6",
    "elk.edgeLabels.placement": "CENTER",
    // One side for every label (and its step badge); ELK's default picks per edge.
    "elk.layered.edgeLabels.sideSelection": "ALWAYS_UP",
    "elk.json.shapeCoords": "ROOT",
    "elk.json.edgeCoords": "ROOT",
    "elk.layered.mergeEdges": model.merge ? "true" : "false",
    "elk.layered.unnecessaryBendpoints": "true",
    "elk.layered.thoroughness": "12",
    ...Object.assign({}, ...HOOKS.map((h) => h.elkOptions?.(model) ?? {})),
  };
  // Groups ELK never sees (pools and lanes): their members join the nearest group it lays out.
  const hidden = new Set(HOOKS.flatMap((h) => [...(h.hiddenGroups?.(model) ?? [])]));
  const order = new Map(HOOKS.flatMap((h) => [...(h.order?.(model) ?? [])]));

  const nodeGeom = new Map<string, NodeGeom>();
  const groupGeom = new Map<string, GroupGeom>();
  const elkNodes = new Map<string, ElkNode>();

  for (const n of model.nodes) {
    const g = nodeGeometry(n, horizontal);
    nodeGeom.set(n.id, g);
    // Centered in its layer, so a column of different sizes shares one center line.
    const node: ElkNode = {
      id: n.id,
      width: g.w,
      height: g.h,
      layoutOptions: { "elk.alignment": "CENTER" },
    };
    if (g.outside) {
      node.labels = [
        {
          id: `${n.id}__label`,
          text: n.label,
          width: g.outside.w,
          height: g.outside.h,
        },
      ];
      node.layoutOptions = {
        ...node.layoutOptions,
        "elk.nodeLabels.placement": "OUTSIDE V_BOTTOM H_CENTER",
        "elk.spacing.labelNode": "6",
      };
    }
    if (n.badge) {
      // ELK layered ignores elk.margins, so a label beside the top-right corner reserves the
      // pill's overhang: it can then run neither into a neighbor nor out of the group.
      const S = n.iconSize;
      const anchor: Box =
        n.look === "icon"
          ? { x: horizontal ? 0 : (g.w - S) / 2, y: 0, w: S, h: S }
          : { x: 0, y: 0, w: g.w, h: g.h };
      const pill = badgePill(n.badge, anchor);
      const overhang = Math.ceil(pill.x + pill.w - g.w);
      if (overhang > 0)
        node.labels = [
          ...(node.labels ?? []),
          {
            id: `${n.id}__badge`,
            text: n.badge,
            width: overhang,
            height: 16,
            layoutOptions: {
              "elk.nodeLabels.placement": "OUTSIDE V_TOP H_RIGHT H_PRIORITY",
            },
          },
        ];
    }
    elkNodes.set(n.id, node);
  }
  for (const grp of model.groups) groupGeom.set(grp.id, groupGeometry(grp));
  // Siblings share the tallest header, so frames side by side (an AWS tile header next to an
  // inline one) start their content, and their top edge, on one line.
  for (const grp of model.groups) {
    const gg = groupGeom.get(grp.id);
    if (!gg || grp.around || hidden.has(grp.id)) continue;
    const siblings = model.groups.filter(
      (o) => !o.around && !hidden.has(o.id) && o.parent === grp.parent,
    );
    gg.header = Math.max(...siblings.map((o) => groupGeom.get(o.id)?.header ?? 0));
  }
  for (const grp of model.groups) {
    const gg = groupGeom.get(grp.id);
    if (!gg || grp.around || hidden.has(grp.id)) continue;
    const top = gg.header + 18 + (opts.room?.get(grp.id) ?? 0);
    elkNodes.set(grp.id, {
      id: grp.id,
      children: [],
      layoutOptions: {
        ...base,
        "elk.padding": `[top=${top},left=20,bottom=20,right=20]`,
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        // ELK applies a compound minimum in its rotated frame when the flow is vertical.
        "elk.nodeSize.minimum": horizontal
          ? `(${gg.minWidth}, ${top + 24})`
          : `(${top + 24}, ${minWidthOf(grp.id, gg)})`,
        // Centered in a column; frames side by side in a row share their top edge.
        "elk.alignment": horizontal ? "CENTER" : "TOP",
        // A group widened by its label keeps its children centered under the header.
        "elk.contentAlignment": horizontal ? "V_TOP H_CENTER" : "V_CENTER H_CENTER",
      },
    });
  }

  const titleBlock = model.title ? textBlock(model.title, SIZES.title, 1400, 600, 1.25) : undefined;
  const subtitleBlock = model.subtitle
    ? textBlock(model.subtitle, SIZES.subtitle, 1400, 400)
    : undefined;

  const root: ElkNode = {
    id: "__root",
    layoutOptions: {
      ...base,
      "elk.padding": `[top=${SIZES.pad},left=${SIZES.pad},bottom=${SIZES.pad},right=${SIZES.pad}]`,
    },
    children: [],
    edges: [],
  };
  /** The ELK node an item goes into: its parent, skipping groups ELK does not see. */
  const host = (parent: string | undefined): ElkNode | undefined => {
    let p = parent;
    while (p && hidden.has(p)) p = model.groups.find((g) => g.id === p)?.parent;
    return p ? elkNodes.get(p) : root;
  };
  // Children keep spec order: groups first, then nodes, each under its parent.
  for (const item of [...model.groups, ...model.nodes]) {
    const el = elkNodes.get(item.id);
    if (!el) continue;
    const parent = host(item.parent);
    (parent?.children ?? root.children)?.push(el);
  }
  // Spec-order hints along the cross axis for semi-interactive crossing minimization; a hook's
  // order (lanes) goes first, spec order breaks ties.
  for (const parent of [root, ...elkNodes.values()]) {
    const kids = parent.children ?? [];
    const rank = order.size
      ? new Map(
          kids
            .map((c, i) => [c, i] as const)
            .sort(([a, i], [b, j]) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || i - j)
            .map(([c], r) => [c, r] as const),
        )
      : undefined;
    kids.forEach((c, i) => {
      const at = rank?.get(c) ?? i;
      c.layoutOptions = {
        ...c.layoutOptions,
        "elk.position": horizontal ? `(0,${at * 10})` : `(${at * 10},0)`,
      };
    });
  }
  // Empty groups still need a size.
  for (const grp of model.groups) {
    const el = elkNodes.get(grp.id);
    const gg = groupGeom.get(grp.id);
    if (el && gg && !el.children?.length) {
      el.width = gg.minWidth;
      el.height = gg.header + 60;
    }
  }

  const groupIds = new Set(model.groups.map((g) => g.id));
  // Overlays (around:) are outlined after layout, so ELK never sees them: an edge with an overlay
  // end is routed afterwards like constraint: false, to the overlay's border. While laying out,
  // ELK gets hidden copies of it to the overlay's members, so it still orders the layers.
  const overlays = new Map(
    model.groups.filter((g) => g.around?.length).map((g) => [g.id, g.around ?? []]),
  );
  const free = (e: ModelEdge) =>
    !e.constraint ||
    overlays.has(e.from) ||
    overlays.has(e.to) ||
    hidden.has(e.from) ||
    hidden.has(e.to);
  /** The nodes a group ELK does not see stands for: an overlay's members, a lane's contents. */
  const inside = (id: string): string[] =>
    [...model.nodes, ...model.groups]
      .filter((x) => x.parent === id)
      .flatMap((x) => (hidden.has(x.id) ? inside(x.id) : [x.id]));
  const members = (id: string) =>
    (overlays.get(id) ?? (hidden.has(id) ? inside(id) : [id])).filter((m) => !overlays.has(m));
  const port = (nodeId: string, side: "in" | "out", e: ModelEdge): string => {
    if (!model.merge || groupIds.has(nodeId)) return nodeId;
    const el = elkNodes.get(nodeId);
    if (!el) return nodeId;
    const head =
      side === "in"
        ? e.arrow === "end" || e.arrow === "both"
        : e.arrow === "start" || e.arrow === "both";
    const id = `${nodeId}::${side}::${e.line}::${head ? 1 : 0}::${e.color ?? ""}`;
    el.ports ??= [];
    if (!el.ports.some((p) => p.id === id)) el.ports.push({ id, width: 0, height: 0 });
    el.layoutOptions = { ...el.layoutOptions, "elk.portConstraints": "FREE" };
    return id;
  };
  // A labelled edge gets its own layer for the label; give its unlabelled siblings an
  // empty label of the same kind so a fan-out stays in one column.
  const labelledFrom = new Set(
    model.edges.filter((e) => !free(e) && (e.label || e.step !== undefined)).map((e) => e.from),
  );
  const edgeLabels = new Map<string, { block: TextBlock; w: number; h: number; stepW: number }>();
  for (const e of model.edges) {
    if (free(e)) {
      if (!e.constraint) continue;
      let i = 0;
      for (const s of members(e.from))
        for (const t of members(e.to))
          if (s !== t) root.edges?.push({ id: `${e.id}__via${i++}`, sources: [s], targets: [t] });
      continue;
    }
    const elkEdge: ElkEdge = {
      id: e.id,
      sources: [port(e.from, "out", e)],
      targets: [port(e.to, "in", e)],
    };
    if (!e.label && e.step === undefined && labelledFrom.has(e.from)) {
      elkEdge.labels = [{ id: `${e.id}__spacer`, text: " ", width: 1, height: 1 }];
    }
    const stepW = e.step !== undefined ? SIZES.step + 2 : 0;
    if (e.label || e.step !== undefined) {
      const block = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
      const w = Math.ceil((e.label ? block.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0));
      const h = Math.ceil(Math.max(e.label ? block.height + 6 : 0, stepW ? SIZES.step : 0));
      edgeLabels.set(e.id, { block, w, h, stepW });
      elkEdge.labels = [
        {
          id: `${e.id}__label`,
          text: e.label || `step ${e.step}`,
          width: w,
          height: h,
        },
      ];
    }
    root.edges?.push(elkEdge);
  }

  let { graph: result, fallback } = await runElk(root);
  // Spec order holds wherever it costs no crossing: when the ordered layout crosses edges, the
  // nodes at the ends of those edges (never groups) may reorder, and fewer crossings win.
  const strict = crossings(result);
  if (strict.count > 0) {
    const free = structuredClone(root);
    const leaves = new Set(model.nodes.map((n) => n.id).filter((id) => strict.nodes.has(id)));
    const unpin = (n: ElkNode) => {
      if (leaves.has(n.id) && n.layoutOptions) delete n.layoutOptions["elk.position"];
      for (const c of n.children ?? []) unpin(c);
    };
    unpin(free);
    const alt = await runElk(free);
    if (crossings(alt.graph).count < strict.count) ({ graph: result, fallback } = alt);
  }

  // ------------------------------------------------------------- scene
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

  const depth = (id: string | undefined): number => {
    let d = 0;
    let p = id;
    while (p) {
      d += 1;
      p = model.groups.find((g) => g.id === p)?.parent;
    }
    return d;
  };

  // ELK counts the bend point it puts 5px outside a nested border as content, so a group an edge
  // enters gets 25px on that side instead of 20. Trim it back, innermost first, while nothing
  // drawn (child, edge point, edge label) ends up outside and the header still fits.
  const elkEdges = [...placed.values()].flatMap((n) => n.edges ?? []);
  const edgeMarks: Box[] = elkEdges.flatMap((e) => [
    ...(e.sections ?? []).flatMap((s) =>
      [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => ({
        ...p,
        w: 0,
        h: 0,
      })),
    ),
    ...(e.labels ?? []).map((l) => ({
      x: l.x ?? 0,
      y: l.y ?? 0,
      w: l.width,
      h: l.height,
    })),
  ]);
  const byDepth = model.groups
    .filter((g) => !g.around)
    .sort((a, b) => depth(b.parent) - depth(a.parent));
  for (const grp of byDepth) {
    const el = placed.get(grp.id);
    const gg = groupGeom.get(grp.id);
    if (!el?.children?.length || !gg) continue;
    const kids = el.children.flatMap((c) => [
      { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 },
      ...(c.labels ?? []).map((l) => ({
        x: l.x ?? 0,
        y: l.y ?? 0,
        w: l.width,
        h: l.height,
      })),
    ]);
    const old = {
      x: el.x ?? 0,
      y: el.y ?? 0,
      w: el.width ?? 0,
      h: el.height ?? 0,
    };
    const k = union(kids);
    let x0 = Math.max(old.x, k.x - 20);
    let y0 = Math.max(old.y, k.y - gg.header - 18 - (opts.room?.get(grp.id) ?? 0));
    let x1 = Math.min(old.x + old.w, k.x + k.w + 20);
    let y1 = Math.min(old.y + old.h, k.y + k.h + 20);
    if (x1 - x0 < minWidthOf(grp.id, gg)) [x0, x1] = [old.x, old.x + old.w];
    if (y1 - y0 < gg.header + 42) [y0, y1] = [old.y, old.y + old.h];
    for (const b of edgeMarks) {
      if (!contains(old, b)) continue;
      if (b.x < x0) x0 = old.x;
      if (b.y < y0) y0 = old.y;
      if (b.x + b.w > x1) x1 = old.x + old.w;
      if (b.y + b.h > y1) y1 = old.y + old.h;
    }
    Object.assign(el, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  stretchColumns(model, placed, elkEdges);

  const groups: SceneGroup[] = [];
  // Where each header may slide to clear edges (clearHeader), and whether its icon goes along.
  const headerRoom = new Map<string, HeaderRoom>();
  const paintGroup = (grp: ModelGroup, box: Box, overlay: boolean): SceneGroup | undefined => {
    const gg = groupGeom.get(grp.id);
    const style = resolveGroupStyle(grp.type);
    if (!gg || !style) return undefined;
    const strokeBase = grp.color ?? style.stroke;
    let stroke = strokeBase;
    let fill = grp.fill === "none" ? "none" : (grp.fill ?? style.fill ?? "none");
    if (overlay) fill = "none";
    const ink = style.labelColor === "ink" || !style.labelColor;
    let labelColor = grp.color ?? (ink ? t.text : (style.labelColor ?? t.text));
    if (theme === "dark") {
      // Near-black outlines (AWS Cloud, Google's #1F2124, C4 grey) turn light; fills become tints.
      if (luminance(strokeBase) < 0.04) stroke = "#c9d1d9";
      else if (contrast(strokeBase, t.background) < 2) stroke = mixHex(strokeBase, "#ffffff", 0.55);
      if (fill !== "none") fill = mixHex(fill, t.background, 0.14);
      if (!grp.color && !ink && luminance(style.labelColor ?? "#000000") < 0.04)
        labelColor = t.text;
    }
    labelColor = ensureContrast(labelColor, fill === "none" ? t.background : fill, 4.5);
    const L = gg.label;
    // Overlays carry a legend on their top border instead of a corner header, so they never
    // cover the header of the group they are drawn over.
    let iconBox: Box | undefined;
    let labelX: number;
    let labelY: number;
    if (overlay && gg.iconStyle === "tile-center" && gg.icon) {
      // The AWS deck's Auto Scaling group: the full tile centered on the top border, the label
      // centered under it.
      iconBox = {
        x: box.x + (box.w - SIZES.tile) / 2,
        y: box.y - SIZES.tile / 2,
        w: SIZES.tile,
        h: SIZES.tile,
      };
      labelX = box.x + (box.w - L.width) / 2;
      labelY = iconBox.y + SIZES.tile + 3;
    } else if (overlay) {
      iconBox = gg.icon ? { x: box.x + 10, y: box.y - 8, w: 16, h: 16 } : undefined;
      labelX = iconBox ? iconBox.x + iconBox.w + 5 : box.x + 12;
      labelY = box.y - L.height / 2;
    } else if (gg.iconStyle === "tile-center") {
      iconBox = gg.icon
        ? {
            x: box.x + (box.w - SIZES.tile) / 2,
            y: box.y,
            w: SIZES.tile,
            h: SIZES.tile,
          }
        : undefined;
      labelX = box.x + (box.w - L.width) / 2;
      labelY = box.y + (gg.icon ? SIZES.tile + 3 : 6);
    } else if (gg.iconStyle === "tile") {
      iconBox = gg.icon ? { x: box.x, y: box.y, w: SIZES.tile, h: SIZES.tile } : undefined;
      labelX = gg.center
        ? box.x + (box.w - L.width) / 2
        : iconBox
          ? box.x + SIZES.tile + 8
          : box.x + 12;
      // Centered on the tile; a label taller than the tile starts at the top instead of above it.
      labelY = iconBox ? box.y + Math.max(6, (SIZES.tile - L.height) / 2) : box.y + 6;
    } else {
      iconBox = gg.icon
        ? {
            x: box.x + 12,
            y: box.y + 9,
            w: SIZES.inlineIcon,
            h: SIZES.inlineIcon,
          }
        : undefined;
      labelX =
        gg.center && !iconBox
          ? box.x + (box.w - L.width) / 2
          : iconBox
            ? iconBox.x + iconBox.w + 8
            : box.x + 12;
      labelY = box.y + 10;
    }
    // A corner tile stays in its corner; inline icons and legends travel with their label.
    const cornerTile = !overlay && gg.iconStyle === "tile" && !!iconBox;
    const inset = overlay ? 10 : 12;
    headerRoom.set(grp.id, {
      moveIcon: !!iconBox && !cornerTile,
      lo: cornerTile ? box.x + SIZES.tile + 8 : box.x + inset,
      hi: box.x + box.w - inset,
    });
    const innerFill =
      !overlay && style.innerFill
        ? theme === "dark"
          ? mixHex(style.innerFill, t.background, 0.06)
          : style.innerFill
        : undefined;
    const headerH = gg.header + 4;
    const inner = innerFill
      ? {
          box: {
            x: round(box.x + 8),
            y: round(box.y + headerH),
            w: round(box.w - 16),
            h: round(box.h - headerH - 8),
          },
          fill: innerFill,
        }
      : undefined;
    return {
      inner,
      id: grp.id,
      type: grp.type,
      box,
      depth: overlay ? 1000 : depth(grp.parent),
      label: gg.label,
      labelBox: {
        x: round(labelX),
        y: round(labelY),
        w: round(gg.label.width),
        h: round(gg.label.height),
      },
      iconBox,
      icon: gg.icon,
      stroke,
      fill,
      labelColor,
      dash: grp.dashed === false ? undefined : (style.dash ?? (grp.dashed ? "6 4" : undefined)),
      strokeWidth: style.strokeWidth,
      radius: style.rounded,
      parent: overlay ? undefined : grp.parent,
      overlay: overlay || undefined,
    };
  };
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
    const sg = paintGroup(grp, box, false);
    if (sg) groups.push(sg);
  }
  groups.sort((a, b) => a.depth - b.depth);

  const nodes: SceneNode[] = [];
  for (const n of model.nodes) {
    const el = placed.get(n.id);
    const g = nodeGeom.get(n.id);
    if (!el || !g) continue;
    const box: Box = {
      x: round(el.x ?? 0),
      y: round((el.y ?? 0) + top),
      w: round(el.width ?? 0),
      h: round(el.height ?? 0),
    };
    const node: SceneNode = {
      id: n.id,
      look: n.look,
      shape: n.shape,
      box,
      icon: n.icon,
      label: g.label,
      labelBox: { x: 0, y: 0, w: 0, h: 0 },
      note: g.note,
      color: n.color,
      badge: n.badge,
      url: n.url,
      parent: n.parent,
      ...(n.bpmn ? { bpmn: n.bpmn } : {}),
      ...(n.stage !== undefined ? { stage: n.stage } : {}),
      ...(n.score !== undefined ? { score: n.score } : {}),
    };
    // Text on a filled group (Google's blue frame, Azure's VNet panel) keeps 4.5:1 contrast.
    let surface: string | undefined;
    for (let p = n.parent; p && !surface; p = model.groups.find((g) => g.id === p)?.parent) {
      const sg = groups.find((g) => g.id === p);
      if (sg?.inner) surface = sg.inner.fill;
      else if (sg && sg.fill !== "none") surface = sg.fill;
    }
    if (surface) {
      const ink = ensureContrast(t.text, surface, 4.5);
      const inkMuted = ensureContrast(t.muted, surface, 4.5);
      if (ink !== t.text) node.ink = ink;
      if (inkMuted !== t.muted) node.inkMuted = inkMuted;
    }
    const S = n.iconSize;
    if (n.look === "icon") {
      if (horizontal) {
        node.iconBox = { ...box };
        const lab = el.labels?.[0];
        const lx = lab?.x !== undefined ? lab.x : box.x + (S - (g.outside?.w ?? 0)) / 2;
        const ly = lab?.y !== undefined ? lab.y + top : box.y + S + 6;
        const ow = g.outside?.w ?? g.label.width;
        node.labelBox = {
          x: round(lx + (ow - g.label.width) / 2),
          y: round(ly),
          w: round(g.label.width),
          h: round(g.label.height),
        };
      } else {
        node.iconBox = {
          x: round(box.x + (box.w - S) / 2),
          y: box.y,
          w: S,
          h: S,
        };
        node.labelBox = {
          x: round(box.x + (box.w - g.label.width) / 2),
          y: round(box.y + S + 6),
          w: round(g.label.width),
          h: round(g.label.height),
        };
      }
      if (g.note) {
        node.noteBox = {
          x: round(node.labelBox.x + (g.label.width - g.note.width) / 2),
          y: round(node.labelBox.y + g.label.height + 2),
          w: round(g.note.width),
          h: round(g.note.height),
        };
      }
    } else if (n.look === "card") {
      const textH = g.label.height + (g.note ? g.note.height + 2 : 0);
      const ix = box.x + 16;
      if (n.icon)
        node.iconBox = {
          x: round(ix),
          y: round(box.y + (box.h - S) / 2),
          w: S,
          h: S,
        };
      const tx = n.icon ? ix + S + 12 : box.x + 16;
      const ty = box.y + (box.h - textH) / 2;
      node.labelBox = {
        x: round(tx),
        y: round(ty),
        w: round(g.label.width),
        h: round(g.label.height),
      };
      if (g.note)
        node.noteBox = {
          x: round(tx),
          y: round(ty + g.label.height + 2),
          w: round(g.note.width),
          h: round(g.note.height),
        };
    } else {
      const textH = g.label.height + (g.note ? g.note.height + 2 : 0);
      const extraTop =
        n.shape === "person" ? 30 : n.shape === "cylinder" ? 10 : n.shape === "cloud" ? 8 : 0;
      const innerH = box.h - extraTop - (n.shape === "document" ? 10 : 0);
      const iconW = n.icon ? 28 : 0;
      const textW = Math.max(g.label.width, g.note?.width ?? 0);
      const startX = box.x + (box.w - (textW + iconW)) / 2;
      const ty = box.y + extraTop + (innerH - textH) / 2;
      if (n.icon)
        node.iconBox = {
          x: round(startX),
          y: round(ty + (textH - 20) / 2),
          w: 20,
          h: 20,
        };
      const tx = startX + iconW;
      node.labelBox = {
        x: round(tx + (textW - g.label.width) / 2),
        y: round(ty),
        w: round(g.label.width),
        h: round(g.label.height),
      };
      if (g.note) {
        node.noteBox = {
          x: round(tx + (textW - g.note.width) / 2),
          y: round(ty + g.label.height + 2),
          w: round(g.note.width),
          h: round(g.note.height),
        };
      }
    }
    const outside = el.labels?.find((l) => l.id === `${n.id}__label`);
    placeNotation(node, n, g, {
      horizontal,
      label:
        outside?.x !== undefined && outside.y !== undefined
          ? { x: round(outside.x), y: round(outside.y + top) }
          : undefined,
    });
    if (n.badge)
      node.badgeBox = badgePill(n.badge, node.iconBox && n.look === "icon" ? node.iconBox : box);
    nodes.push(node);
  }

  // Overlay groups (around:) are drawn around their members' drawn footprint, plus a header.
  for (const grp of model.groups) {
    if (!grp.around?.length) continue;
    const gg = groupGeom.get(grp.id);
    const boxes: Box[] = [];
    for (const id of grp.around) {
      const nd = nodes.find((x) => x.id === id);
      if (nd)
        boxes.push(
          ...[nd.box, nd.iconBox, nd.labelBox, nd.noteBox, nd.badgeBox].filter(
            (b): b is Box => !!b && b.w > 0,
          ),
        );
      const sg = groups.find((x) => x.id === id);
      if (sg) boxes.push(sg.box);
    }
    if (!boxes.length || !gg) continue;
    const pad = 12;
    // A tile centered on the top border has its label under it, above the members.
    const head =
      gg.iconStyle === "tile-center" && gg.icon
        ? Math.ceil(SIZES.tile / 2 + 3 + gg.label.height + 6)
        : pad + 2;
    let x0 = Math.min(...boxes.map((b) => b.x)) - pad;
    let x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
    // Too narrow for its legend: grow both sides evenly so it does not reach into the next layer.
    const short = gg.minWidth + 2 * pad - (x1 - x0);
    if (short > 0) [x0, x1] = [x0 - short / 2, x1 + short / 2];
    const y0 = Math.min(...boxes.map((b) => b.y)) - head;
    const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
    const sg = paintGroup(
      grp,
      { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) },
      true,
    );
    if (sg) groups.push(sg);
  }

  const edges: SceneEdge[] = [];
  // Side: what a horizontal line meets (the icon of an icon node). Full: the node with its label
  // and note, so a vertical line leaves below the text instead of through it.
  const attachBox = (id: string): Attach | undefined => {
    const nd = nodes.find((x) => x.id === id);
    if (nd) {
      const side = nd.look === "icon" && horizontal && nd.iconBox ? nd.iconBox : nd.box;
      return {
        side,
        full: union([nd.box, nd.iconBox, nd.labelBox, nd.noteBox]),
      };
    }
    const g = groups.find((x) => x.id === id);
    if (!g) return undefined;
    const head = g.overlay ? [g.iconBox, g.labelBox].filter((b): b is Box => !!b && b.w > 0) : [];
    return { side: g.box, full: g.box, avoid: head.length ? union(head) : undefined };
  };
  // Free edges (constraint: false) are routed here. Straight routes cannot move, so they claim
  // their line first; each elbow then steps aside from the lines of unrelated free edges.
  const freeRoutes = new Map<string, Point[]>();
  const claimed: { e: ModelEdge; p: Point; q: Point }[] = [];
  const related = (a: ModelEdge, b: ModelEdge) =>
    [a.from, a.to].some((id) => id === b.from || id === b.to);
  const fits = (points: Point[], e: ModelEdge): boolean => {
    const [s, p, q, t] = points;
    if (!s || !p || !q || !t) return true;
    const v = Math.abs(p.x - q.x) < 0.5;
    const at = v ? p.x : p.y;
    const [lo, hi] = v ? [s.x, t.x].sort((m, n) => m - n) : [s.y, t.y].sort((m, n) => m - n);
    if (at < (lo ?? at) + 8 || at > (hi ?? at) - 8) return false;
    const span = (a: Point, b: Point) => (v ? [a.y, b.y] : [a.x, b.x]).sort((m, n) => m - n);
    const [a0 = 0, a1 = 0] = span(p, q);
    return !claimed.some((c) => {
      if (related(c.e, e) || Math.abs(c.p.x - c.q.x) < 0.5 !== v) return false;
      if (Math.abs((v ? c.p.x : c.p.y) - at) >= 6) return false;
      const [b0 = 0, b1 = 0] = span(c.p, c.q);
      return Math.min(a1, b1) - Math.max(a0, b0) > 0.5;
    });
  };
  for (const straight of [true, false]) {
    for (const e of model.edges) {
      const a = attachBox(e.from);
      const b = attachBox(e.to);
      if (!free(e) || !a || !b) continue;
      const route = (d: number) =>
        steer(steer(freeRoute(a, b, d), "to", b.avoid, b.full), "from", a.avoid, a.full);
      let points = route(0);
      if ((points.length === 2) !== straight) continue;
      if (!straight)
        points = [0, 12, -12, 24, -24, 36, -36].map(route).find((p) => fits(p, e)) ?? points;
      freeRoutes.set(e.id, points);
      claimed.push(...points.slice(1).map((q, i) => ({ e, p: points[i] ?? q, q })));
    }
  }
  for (const e of model.edges) {
    if (free(e)) {
      const points = freeRoutes.get(e.id);
      if (points)
        edges.push({
          id: e.id,
          from: e.from,
          to: e.to,
          points,
          line: e.line,
          arrow: e.arrow,
          color: e.color,
          step: e.step,
          ...(e.flow ? { flow: e.flow } : {}),
        });
      continue;
    }
    const el = result.edges?.find((x) => x.id === e.id) ?? findEdge(result, e.id);
    const section = el?.sections?.[0];
    if (!el || !section) continue;
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(shift);
    const edge: SceneEdge = {
      id: e.id,
      from: e.from,
      to: e.to,
      points,
      line: e.line,
      arrow: e.arrow,
      color: e.color,
      step: e.step,
      ...(e.flow ? { flow: e.flow } : {}),
    };
    const lab = edgeLabels.get(e.id);
    const elkLabel = el.labels?.[0];
    if (lab && elkLabel?.x !== undefined && elkLabel.y !== undefined) {
      const box = {
        x: round(elkLabel.x),
        y: round(elkLabel.y + top),
        w: lab.w,
        h: lab.h,
      };
      if (e.step !== undefined) {
        edge.stepBox = {
          x: box.x,
          y: round(box.y + (box.h - SIZES.step) / 2),
          w: SIZES.step,
          h: SIZES.step,
        };
      }
      if (e.label) {
        edge.label = lab.block;
        edge.labelBox = {
          x: round(box.x + lab.stepW + (lab.stepW ? 2 : 0)),
          y: box.y,
          w: round(lab.w - lab.stepW - (lab.stepW ? 2 : 0)),
          h: lab.h,
        };
      }
    }
    edges.push(edge);
  }

  // Spline points are Bezier controls; the other routings keep only real bends.
  if (model.routing !== "spline") for (const e of edges) e.points = dropStraightPoints(e.points);
  if (model.routing === "orthogonal") {
    // An end may slide along the icon it points at, or along the box it leaves.
    const sides = new Map<string, Box[]>([
      ...groups.filter((g) => !g.overlay).map((g): [string, Box[]] => [g.id, [g.box]]),
      ...nodes.map((n): [string, Box[]] => [
        n.id,
        n.look === "icon" && n.iconBox ? [n.iconBox, n.box] : [n.box],
      ]),
    ]);
    for (const e of edges) {
      straightenEnd(e, "to", sides.get(e.to), edges);
      straightenEnd(e, "from", sides.get(e.from), edges);
      e.points = dropStraightPoints(e.points);
    }
  }

  // Free-edge labels and steps go beside a vertical run, clear of nodes and other labels.
  const footprints = nodes.map((n) => union([n.box, n.iconBox, n.labelBox, n.noteBox]));
  for (const e of model.edges) {
    const edge = edges.find((x) => x.id === e.id);
    if (!free(e) || !edge || (!e.label && e.step === undefined)) continue;
    const block = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
    const stepW = e.step !== undefined ? SIZES.step + 2 : 0;
    const w = Math.ceil((e.label ? block.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0));
    const h = Math.ceil(Math.max(e.label ? block.height + 6 : 0, stepW ? SIZES.step : 0));
    const box = freeLabelBox(edge.points, w, h, [
      ...footprints,
      ...edges.flatMap((x) => [x.labelBox, x.stepBox]),
      ...groups.map((g) => g.labelBox),
    ]);
    if (e.step !== undefined)
      edge.stepBox = {
        x: box.x,
        y: round(box.y + (h - SIZES.step) / 2),
        w: SIZES.step,
        h: SIZES.step,
      };
    if (e.label) {
      edge.label = block;
      edge.labelBox = {
        x: round(box.x + stepW + (stepW ? 2 : 0)),
        y: box.y,
        w: round(w - stepW - (stepW ? 2 : 0)),
        h,
      };
    }
  }

  for (const h of HOOKS) h.after?.({ model, theme, horizontal, top, nodes, groups, edges });

  // Overlays are drawn around their members after routing, so an edge can run right along an
  // overlay's border and read as a double line: move that side out until the edge is 8px clear.
  for (const [i, g] of groups.entries()) {
    const grp = g.overlay ? model.groups.find((x) => x.id === g.id) : undefined;
    if (!grp) continue;
    let [x0, y0, x1, y1] = [g.box.x, g.box.y, g.box.x + g.box.w, g.box.y + g.box.h];
    for (const e of edges)
      for (let k = 1; k < e.points.length; k++) {
        const p = e.points[k - 1];
        const q = e.points[k];
        if (!p || !q) continue;
        const flat = Math.abs(p.y - q.y) < 0.5;
        if (!flat && Math.abs(p.x - q.x) >= 0.5) continue;
        const [lo, hi] = flat
          ? [Math.min(p.x, q.x), Math.max(p.x, q.x)]
          : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
        const [from, to] = flat ? [x0, x1] : [y0, y1];
        if (Math.min(hi, to) - Math.max(lo, from) < 20) continue;
        const at = flat ? p.y : p.x;
        if (flat && Math.abs(at - y0) < 8) y0 = Math.min(y0, at - 8);
        if (flat && Math.abs(at - y1) < 8) y1 = Math.max(y1, at + 8);
        if (!flat && Math.abs(at - x0) < 8) x0 = Math.min(x0, at - 8);
        if (!flat && Math.abs(at - x1) < 8) x1 = Math.max(x1, at + 8);
      }
    if (x0 === g.box.x && y0 === g.box.y && x1 === g.box.x + g.box.w && y1 === g.box.y + g.box.h)
      continue;
    const box = { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) };
    const sg = paintGroup(grp, box, true);
    if (sg) groups[i] = sg;
  }

  const blocked: string[] = [];
  for (const g of groups) {
    const room = headerRoom.get(g.id);
    if (room && !clearHeader(g, room, groups, nodes, edges)) blocked.push(g.id);
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
  // An overlay's header sits above its members, so when they are the first row of their group it
  // lands on that group's header (or one above it). The second pass gives each member's own group
  // more top padding, which moves the members, and the header with them, down until it clears.
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
    for (const id of overlays.get(ov.id) ?? []) {
      const parent =
        model.nodes.find((n) => n.id === id)?.parent ??
        model.groups.find((g) => g.id === id)?.parent;
      if (parent && !overlays.has(parent))
        room.set(parent, Math.max(room.get(parent) ?? 0, Math.ceil(need)));
    }
  }
  const wider = !horizontal && widen.length > 0;
  if (!opts.widen && !opts.room && (wider || room.size))
    return layout(model, {
      ...opts,
      widen: wider ? new Set(widen) : undefined,
      room: room.size ? room : undefined,
    });

  // Overlay legends (a tile on the top border) and free-edge labels are placed after ELK and can
  // land left of or above the canvas, or on the title: move the content clear of both.
  const drawn = [
    ...groups.flatMap((g) => [g.box, g.labelBox, g.iconBox]),
    ...nodes.flatMap((n) => [n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox]),
    ...edges.flatMap((e) => [
      e.labelBox,
      e.stepBox,
      ...e.points.map((p) => ({ ...p, w: 0, h: 0 })),
    ]),
  ].filter((b): b is Box => !!b);
  const dx = Math.max(0, Math.ceil(4 - Math.min(...drawn.map((b) => b.x))));
  const dy = Math.max(
    0,
    Math.ceil(top + (titleBlock ? 8 : 4) - Math.min(...drawn.map((b) => b.y))),
  );
  if (dx || dy) {
    const moved = new Set<Box>();
    const move = (b: Box | undefined) => {
      if (!b || moved.has(b)) return;
      moved.add(b);
      b.x = round(b.x + dx);
      b.y = round(b.y + dy);
    };
    for (const g of groups) [g.box, g.labelBox, g.iconBox, g.inner?.box].forEach(move);
    for (const n of nodes) [n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox].forEach(move);
    for (const e of edges) {
      [e.labelBox, e.stepBox].forEach(move);
      e.points = e.points.map((p) => ({
        x: round(p.x + dx),
        y: round(p.y + dy),
      }));
    }
  }

  let width = round((result.width ?? 0) + dx);
  let height = round((result.height ?? 0) + top + dy);
  // Overlay groups and free-edge labels are placed after ELK sized the canvas; so is everything a
  // hook moved (lanes, trees).
  const hooked =
    model.kind !== "architecture" || hidden.size > 0
      ? nodes.flatMap((n) => [n.box, n.labelBox, n.noteBox, n.badgeBox])
      : [];
  for (const b of [
    ...groups.map((g) => g.box),
    ...edges.flatMap((e) => [e.labelBox, e.stepBox]),
    ...hooked,
  ]) {
    if (!b) continue;
    width = Math.max(width, round(b.x + b.w + SIZES.pad));
    height = Math.max(height, round(b.y + b.h + SIZES.pad));
  }
  let titleBox: Box | undefined;
  let subtitleBox: Box | undefined;
  if (titleBlock) {
    titleBox = {
      x: SIZES.pad,
      y: SIZES.pad - 4,
      w: round(titleBlock.width),
      h: round(titleBlock.height),
    };
    width = Math.max(width, round(titleBlock.width + SIZES.pad * 2));
    if (subtitleBlock) {
      subtitleBox = {
        x: SIZES.pad,
        y: round(titleBox.y + titleBlock.height + 4),
        w: round(subtitleBlock.width),
        h: round(subtitleBlock.height),
      };
      width = Math.max(width, round(subtitleBlock.width + SIZES.pad * 2));
    }
  }
  width = Math.ceil(width);
  height = Math.ceil(height);
  let legend: SceneLegend | undefined;
  if (model.legend?.length) {
    legend = placeLegend(model.legend, width, height);
    width = Math.max(width, Math.ceil(legend.box.w + SIZES.pad * 2));
    height = Math.ceil(legend.box.y + legend.box.h + SIZES.pad);
  }

  const scene: Scene = {
    width,
    height,
    theme,
    direction: model.direction,
    routing: model.routing,
    arrowhead: model.arrowhead,
    animate: animateOf(model),
    skin: model.skin,
    background: model.background,
    title: titleBlock,
    titleBox,
    subtitle: subtitleBlock,
    subtitleBox,
    nodes,
    groups,
    edges,
    legend,
    layoutFallback: fallback,
    description: describe(model),
    kind: model.kind,
    ...(model.story ? { story: model.story } : {}),
  };
  // The skin only recolors: every box and point above is the same for classic and stage.
  return model.skin === "stage" ? stageColors(scene) : scene;
}

/** The spec's animate mode, else the skin's: relay for stage, packets for classic. */
export const animateOf = (model: Pick<Model, "animate" | "skin">): AnimateMode =>
  model.animate ?? (model.skin === "stage" ? "relay" : "packets");

/**
 * The line-style key: one row per entry in spec order (a 28x12 sample, 8px gap, the meaning),
 * in a box under all content with its right edge on the right margin.
 */
function placeLegend(entries: LegendEntry[], width: number, height: number): SceneLegend {
  const P = 10;
  const rows = entries.map((e) => ({
    line: e.line,
    label: textBlock(e.label, SIZES.edgeLabel, 240),
  }));
  const w = Math.ceil(P + 28 + 8 + Math.max(...rows.map((r) => r.label.width)) + P);
  // Rows sit 18px apart; a wrapped meaning pushes the next row down.
  const pitch = rows.map((r) => Math.max(18, r.label.height + 3));
  const last = rows[rows.length - 1]?.label.height ?? 0;
  const h = Math.ceil(P + pitch.slice(0, -1).reduce((a, b) => a + b, 0) + last + P);
  // Under the content, which ends a page margin above the current bottom.
  const box = {
    x: Math.max(SIZES.pad, width - SIZES.pad - w),
    y: height - SIZES.pad + 12,
    w,
    h,
  };
  let y = box.y + P;
  const items = rows.map((r, i) => {
    const swatch = {
      x: box.x + P,
      y: round(y + (r.label.lead - 12) / 2),
      w: 28,
      h: 12,
    };
    const labelBox = {
      x: box.x + P + 36,
      y: round(y),
      w: round(r.label.width),
      h: round(r.label.height),
    };
    y += pitch[i] ?? 18;
    return { line: r.line, swatch, label: r.label, labelBox };
  });
  return { box, items };
}

/**
 * Narrows each icon node's iconBox to the drawn glyph in horizontal flows and moves the edge ends
 * on its left or right side onto the glyph, so arrows touch a tall logo instead of stopping short
 * of it. Needs the npm icon libraries loaded (iconAspect); label and note stay where they are.
 * Idempotent.
 */
export function fitIcons(scene: Scene): void {
  if (scene.direction !== "right" && scene.direction !== "left") return;
  for (const n of scene.nodes) {
    const b = n.iconBox;
    const aspect = n.look === "icon" && n.icon ? iconAspect(n.icon) : undefined;
    if (!b || !aspect || aspect >= 1) continue;
    const w = round(b.h * aspect);
    if (w >= b.w - 0.01) continue;
    const x = round(b.x + (b.w - w) / 2);
    for (const e of scene.edges) {
      const ends = [e.from === n.id ? 0 : -1, e.to === n.id ? e.points.length - 1 : -1];
      for (const i of ends) {
        const p = e.points[i];
        const next = e.points[i === 0 ? 1 : i - 1];
        if (!p || !next || Math.abs(next.y - p.y) > 0.5 || p.y < b.y || p.y > b.y + b.h) continue;
        if (Math.abs(p.x - b.x) < 0.5) e.points[i] = { x, y: p.y };
        else if (Math.abs(p.x - (b.x + b.w)) < 0.5) e.points[i] = { x: round(x + w), y: p.y };
      }
    }
    n.iconBox = { ...b, x, w };
    if (n.badge) n.badgeBox = badgePill(n.badge, n.iconBox);
  }
}

/**
 * Frames of one type stacked in a column (AWS accounts in a Region) take the column's widest
 * extent. A frame stays as it is when the strip it would gain holds a node, another frame, an
 * edge label, an edge end on its border or any line other than one passing straight into it.
 */
function stretchColumns(model: Model, placed: Map<string, ElkNode>, edges: ElkEdge[]): void {
  const parentOf = new Map([...model.groups, ...model.nodes].map((x) => [x.id, x.parent]));
  const related = (a: string, b: string) => {
    for (let p = parentOf.get(a); p; p = parentOf.get(p)) if (p === b) return true;
    for (let p = parentOf.get(b); p; p = parentOf.get(p)) if (p === a) return true;
    return a === b;
  };
  const boxOf = (n: ElkNode): Box => ({
    x: n.x ?? 0,
    y: n.y ?? 0,
    w: n.width ?? 0,
    h: n.height ?? 0,
  });
  const items = [...placed.values()]
    .filter((n) => n.id !== "__root")
    .flatMap((n) => [
      { id: n.id, box: boxOf(n) },
      ...(n.labels ?? []).map((l) => ({
        id: n.id,
        box: { x: l.x ?? 0, y: l.y ?? 0, w: l.width, h: l.height },
      })),
    ]);
  const labels = edges.flatMap((e) =>
    (e.labels ?? []).map((l) => ({
      x: l.x ?? 0,
      y: l.y ?? 0,
      w: l.width,
      h: l.height,
    })),
  );
  const segments = edges.flatMap((e) =>
    (e.sections ?? []).flatMap((s) => {
      const pts = dropStraightPoints([s.startPoint, ...(s.bendPoints ?? []), s.endPoint]);
      return pts.slice(1).map((q, i) => [pts[i] ?? q, q] as const);
    }),
  );
  const columns: ModelGroup[][] = [];
  for (const grp of model.groups) {
    const el = placed.get(grp.id);
    if (grp.around || !el) continue;
    const b = boxOf(el);
    const column = columns.find((c) =>
      c.every((o) => {
        const ob = boxOf(placed.get(o.id) ?? el);
        const shared = Math.min(b.x + b.w, ob.x + ob.w) - Math.max(b.x, ob.x);
        const stacked = b.y >= ob.y + ob.h || ob.y >= b.y + b.h;
        return o.type === grp.type && o.parent === grp.parent && stacked && shared > b.w / 2;
      }),
    );
    if (column) column.push(grp);
    else columns.push([grp]);
  }
  for (const column of columns.filter((c) => c.length > 1)) {
    const els = column.map((g) => placed.get(g.id)).filter((n): n is ElkNode => !!n);
    const x0 = Math.min(...els.map((n) => n.x ?? 0));
    const x1 = Math.max(...els.map((n) => (n.x ?? 0) + (n.width ?? 0)));
    for (const el of els) {
      const b = boxOf(el);
      // Only even out near misses: stretching a much narrower frame leaves its content off-center.
      if (b.w < (x1 - x0) * 0.75) continue;
      const strips = [
        { x: x0, y: b.y, w: b.x - x0, h: b.h, left: true },
        { x: b.x + b.w, y: b.y, w: x1 - b.x - b.w, h: b.h, left: false },
      ];
      const open = strips.every((s) => {
        if (s.w < 0.5) return true;
        const hit = (o: Box) => overlaps(s, { x: o.x, y: o.y, w: o.w || 0.01, h: o.h || 0.01 });
        if (items.some((it) => !related(it.id, el.id) && hit(it.box))) return false;
        if (labels.some(hit)) return false;
        // Only a horizontal line that crosses the whole strip and the border may stay.
        return segments.every(([p, q]) => {
          const [lo, hi] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
          const across = s.left
            ? lo <= s.x + 0.01 && hi > b.x + 0.5
            : hi >= x1 - 0.01 && lo < s.x - 0.5;
          return !hit(segmentBox(p, q)) || (Math.abs(p.y - q.y) < 0.5 && across);
        });
      });
      if (open) Object.assign(el, { x: x0, width: x1 - x0 });
    }
  }
}

interface HeaderRoom {
  /** The icon moves with the label (inline icons, legends); a corner tile stays put. */
  moveIcon: boolean;
  /** Left and right limits for the moving part. */
  lo: number;
  hi: number;
}

const segmentBox = (p: Point, q: Point): Box => ({
  x: Math.min(p.x, q.x),
  y: Math.min(p.y, q.y),
  w: Math.abs(q.x - p.x),
  h: Math.abs(q.y - p.y),
});

/**
 * Slides a group's header label sideways off the edges that cross it: renderers paint a chip
 * behind the label, which would cut those edges. Returns false when no free stretch fits.
 */
function clearHeader(
  g: SceneGroup,
  room: HeaderRoom,
  groups: SceneGroup[],
  nodes: SceneNode[],
  edges: SceneEdge[],
): boolean {
  const icon = room.moveIcon ? g.iconBox : undefined;
  const u = union([g.labelBox, icon]);
  // The renderer's 4px chip plus 2px, so a line beside it keeps its whole stroke.
  const chip = { x: u.x - 6, y: u.y - 1, w: u.w + 12, h: u.h + 2 };
  const inBand = (b: Box) => b.y < chip.y + chip.h - 0.5 && b.y + b.h > chip.y + 0.5;
  const hit = (b: Box, dx: number) =>
    b.x < chip.x + dx + chip.w - 0.01 && b.x + b.w > chip.x + dx + 0.01;
  const segments = edges
    .flatMap((e) => e.points.slice(1).map((q, i) => segmentBox(e.points[i] ?? q, q)))
    .filter(inBand);
  const others = [
    ...segments,
    ...nodes.flatMap((n) => [n.box, n.iconBox, n.labelBox, n.noteBox, n.badgeBox]),
    ...edges.flatMap((e) => [e.labelBox, e.stepBox]),
    ...groups.filter((o) => o !== g).flatMap((o) => [o.labelBox, o.iconBox]),
  ].filter((b): b is Box => !!b && inBand(b));
  // An overlay's legend sits over other content, so it also steps off nodes and headers.
  if (!(g.overlay ? others : segments).some((b) => hit(b, 0))) return true;
  const min = room.lo - u.x;
  const max = room.hi - (u.x + u.w);
  // Free spots start or end against an obstacle; take the one closest to the styled place.
  const dx = others
    .flatMap((b) => [b.x - (chip.x + chip.w), b.x + b.w - chip.x])
    .filter((d) => d >= min - 0.01 && d <= max + 0.01 && !others.some((b) => hit(b, d)))
    .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)[0];
  if (dx === undefined) return false;
  g.labelBox.x = round(g.labelBox.x + dx);
  if (icon) icon.x = round(icon.x + dx);
  return true;
}

interface Attach {
  side: Box;
  full: Box;
  /** An overlay's header (tile and label) on its border: a line ends beside it, not under it. */
  avoid?: Box;
}

const contains = (outer: Box, b: Box): boolean =>
  b.x >= outer.x - 0.01 &&
  b.y >= outer.y - 0.01 &&
  b.x + b.w <= outer.x + outer.w + 0.01 &&
  b.y + b.h <= outer.y + outer.h + 0.01;

function union(boxes: (Box | undefined)[]): Box {
  const list = boxes.filter((b): b is Box => !!b);
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  const w = Math.max(...list.map((b) => b.x + b.w)) - x;
  const h = Math.max(...list.map((b) => b.y + b.h)) - y;
  return { x, y, w, h };
}

/**
 * Slides a free edge's end that would sit under an overlay's header along the border to just
 * past the header, on the side of the edge's other end. A straight line becomes an elbow.
 */
function steer(points: Point[], end: "from" | "to", avoid: Box | undefined, border: Box): Point[] {
  if (!avoid) return points;
  // End first: pts[0] is the end that may sit under the header.
  const pts = (end === "to" ? [...points].reverse() : [...points]).map((q) => ({ ...q }));
  const [e, p] = pts;
  const far = pts.at(-1);
  if (!e || !p || !far || pts.length < 2) return points;
  const gap = 12;
  const under =
    e.x >= avoid.x - gap &&
    e.x <= avoid.x + avoid.w + gap &&
    e.y >= avoid.y - gap &&
    e.y <= avoid.y + avoid.h + gap;
  if (!under) return points;
  const vertical = Math.abs(p.x - e.x) < 0.5;
  const k = vertical ? "x" : "y";
  const j = vertical ? "y" : "x";
  // Clear of the header by more than an arrowhead, so the head does not read as touching the text.
  const clear = 20;
  const lo = (vertical ? avoid.x : avoid.y) - clear;
  const hi = (vertical ? avoid.x + avoid.w : avoid.y + avoid.h) + clear;
  const min = (vertical ? border.x : border.y) + gap;
  const max = (vertical ? border.x + border.w : border.y + border.h) - gap;
  const to = (far[k] <= (lo + hi) / 2 ? [lo, hi] : [hi, lo])
    .map(round)
    .find((v) => v >= min && v <= max);
  if (to === undefined) return points;
  let out: Point[] = pts;
  if (pts.length === 2) {
    const mid = round((e[j] + far[j]) / 2);
    const at = (a: number, b: number): Point => (vertical ? { x: a, y: b } : { x: b, y: a });
    out = [at(to, e[j]), at(to, mid), at(far[k], mid), far];
  } else {
    e[k] = to;
    p[k] = to;
  }
  return end === "to" ? out.reverse() : out;
}

/**
 * An orthogonal connector between two placed nodes or groups, for edges the layout ignored.
 * `shift` moves the elbow off the midpoint so unrelated connectors do not share a trunk.
 */
function freeRoute(from: Attach, to: Attach, shift: number): Point[] {
  const sideBySide = from.full.x + from.full.w <= to.full.x || to.full.x + to.full.w <= from.full.x;
  const a = sideBySide ? from.side : from.full;
  const b = sideBySide ? to.side : to.full;
  const ac = { x: from.side.x + from.side.w / 2, y: a.y + a.h / 2 };
  const bc = { x: to.side.x + to.side.w / 2, y: b.y + b.h / 2 };
  if (sideBySide) {
    const right = a.x + a.w <= b.x;
    const sx = right ? a.x + a.w : a.x;
    const ex = right ? b.x : b.x + b.w;
    if (Math.abs(ac.y - bc.y) < 1)
      return [
        { x: sx, y: ac.y },
        { x: ex, y: ac.y },
      ];
    const mx = round((sx + ex) / 2 + shift);
    return [
      { x: sx, y: ac.y },
      { x: mx, y: ac.y },
      { x: mx, y: bc.y },
      { x: ex, y: bc.y },
    ];
  }
  const down = a.y + a.h <= b.y;
  const sy = down ? a.y + a.h : a.y;
  const ey = down ? b.y : b.y + b.h;
  if (Math.abs(ac.x - bc.x) < 1)
    return [
      { x: ac.x, y: sy },
      { x: ac.x, y: ey },
    ];
  const my = round((sy + ey) / 2 + shift);
  return [
    { x: ac.x, y: sy },
    { x: ac.x, y: my },
    { x: bc.x, y: my },
    { x: bc.x, y: ey },
  ];
}

/**
 * Removes a jog of up to 6px next to an edge end, or the half-pixel skew ELK leaves where an edge
 * crosses a group border, by sliding the end along its node side. Only when the end stays on
 * that side and clear of the other edge ends there.
 */
function straightenEnd(
  e: SceneEdge,
  end: "from" | "to",
  sides: Box[] | undefined,
  edges: SceneEdge[],
): void {
  const n = e.points.length;
  const at = (i: number) => e.points[end === "to" ? n - 1 - i : i];
  const E = at(0);
  const P = at(1);
  const Q = at(2);
  if (!E || !P || !sides) return;
  const vertical = Math.abs(P.y - E.y) > Math.abs(P.x - E.x);
  const k = vertical ? "x" : "y";
  const a = vertical ? "y" : "x";
  let target = P[k];
  let moveP = false;
  if (Q) {
    const lateral = Math.abs(Q[k] - P[k]);
    const along = Math.abs(Q[a] - P[a]);
    const jog = along < 0.01 && lateral > 0.01 && lateral < 6 && n >= 4;
    const skew = lateral > 0.01 && lateral <= 1 && along > lateral;
    if (jog || skew) [target, moveP] = [Q[k], true];
  }
  if (Math.abs(target - E[k]) < 0.01 || Math.abs(target - E[k]) > 6) return;
  const side = sides.find((b) => {
    const edge = vertical ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
    const [lo, hi] = vertical ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
    return edge.some((v) => Math.abs(v - E[a]) < 0.5) && E[k] >= lo - 0.5 && E[k] <= hi + 0.5;
  });
  if (!side) return;
  const [lo, hi] = vertical ? [side.x, side.x + side.w] : [side.y, side.y + side.h];
  if (target < lo + 2 || target > hi - 2) return;
  const others = edges.flatMap((o) =>
    o === e ? [] : [o.points[0], o.points[o.points.length - 1]],
  );
  const near = (p: Point | undefined, q: Point, d: number) =>
    !!p && Math.abs(p.x - q.x) < d && Math.abs(p.y - q.y) < d;
  const moved = { ...E, [k]: target };
  if (others.some((p) => near(p, E, 0.5) || near(p, moved, 4))) return;
  const iE = end === "to" ? n - 1 : 0;
  e.points[iE] = moved;
  if (moveP) e.points[end === "to" ? n - 2 : 1] = { ...P, [k]: target };
}

/** Drops repeated points and points inside a straight run (draw.io would make them bends). */
function dropStraightPoints(points: Point[]): Point[] {
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

function midpoint(points: Point[]): Point {
  const i = Math.max(0, Math.floor((points.length - 1) / 2));
  const a = points[i] ?? { x: 0, y: 0 };
  const b = points[i + 1] ?? a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Where a free edge's label (and step) goes: beside its longest vertical run, right side unless
 * only the left is clear, so it never sits on the line or on a node's own label. A route with
 * no vertical run keeps it above its middle. Never left of or above the canvas.
 */
function freeLabelBox(points: Point[], w: number, h: number, avoid: (Box | undefined)[]): Box {
  const runs = points
    .slice(1)
    .map((q, i) => [points[i] ?? q, q] as const)
    .filter(([p, q]) => Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) > 0.5)
    .sort(([a, b], [c, d]) => Math.abs(d.y - c.y) - Math.abs(b.y - a.y));
  const inside = (b: Box): Box => ({
    ...b,
    x: round(Math.max(0, b.x)),
    y: round(Math.max(0, b.y)),
  });
  const clear = (b: Box) => !avoid.some((o) => o && overlaps(b, o));
  const pick = (first: Box, second: Box) => (clear(first) || !clear(second) ? first : second);
  const run = runs[0];
  if (!run) {
    const mid = midpoint(points);
    const above = inside({ x: mid.x - w / 2, y: mid.y - h - 3, w, h });
    return pick(above, inside({ ...above, y: mid.y + 3 }));
  }
  const [p, q] = run;
  const y = (p.y + q.y) / 2 - h / 2;
  return pick(inside({ x: p.x + 6, y, w, h }), inside({ x: p.x - 6 - w, y, w, h }));
}

function findEdge(n: ElkNode, id: string): ElkEdge | undefined {
  for (const e of n.edges ?? []) if (e.id === id) return e;
  for (const c of n.children ?? []) {
    const f = findEdge(c, id);
    if (f) return f;
  }
  return undefined;
}

/**
 * ELK occasionally throws on unusual graphs; retry with simpler placement strategies before
 * giving up. `fallback` names the strategy that worked when it was not the first.
 */
// Every theme (and review's extra one) lays out the same graph, so ELK runs once per graph.
const elkRuns = new Map<string, Promise<{ graph: ElkNode; fallback?: string }>>();

async function runElk(root: ElkNode): Promise<{ graph: ElkNode; fallback?: string }> {
  const key = JSON.stringify(root);
  let run = elkRuns.get(key);
  if (!run) {
    run = runElkUncached(root);
    elkRuns.set(key, run);
    run.catch(() => elkRuns.delete(key));
    if (elkRuns.size > 16) {
      const oldest = elkRuns.keys().next().value;
      if (oldest !== undefined) elkRuns.delete(oldest);
    }
  }
  const { graph, fallback } = await run;
  // Callers adjust boxes in place, so each gets its own copy.
  return { graph: structuredClone(graph), fallback };
}

/** Edge segments of an ELK result that cross, between edges that share no node, and those nodes. */
function crossings(graph: ElkNode): { count: number; nodes: Set<string> } {
  const nodeOf = (ref: string | undefined) => (ref ?? "").split("::")[0];
  const lines = (graph.edges ?? []).flatMap((e) => {
    const s = e.sections?.[0];
    if (!s) return [];
    const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint];
    const ends = [nodeOf(e.sources[0]), nodeOf(e.targets[0])];
    return [{ ends, segs: pts.slice(1).map((q, i) => [pts[i] ?? q, q] as const) }];
  });
  const cross = (a: Point, b: Point, c: Point, d: Point) => {
    const o = (p: Point, q: Point, r: Point) =>
      (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  let count = 0;
  const nodes = new Set<string>();
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (!a || !b || a.ends.some((x) => b.ends.includes(x))) continue;
      for (const [p, q] of a.segs)
        for (const [r, t] of b.segs)
          if (cross(p, q, r, t)) {
            count++;
            for (const x of [...a.ends, ...b.ends]) if (x) nodes.add(x);
          }
    }
  return { count, nodes };
}

async function runElkUncached(root: ElkNode): Promise<{ graph: ElkNode; fallback?: string }> {
  const fallbacks: [string | undefined, Record<string, string>][] = [
    [undefined, {}],
    [
      "brandes-koepf placement",
      {
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      },
    ],
    [
      "network-simplex layering, simple placement",
      {
        "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
        "elk.layered.nodePlacement.strategy": "SIMPLE",
      },
    ],
  ];
  let lastError: unknown;
  for (const [fallback, extra] of fallbacks) {
    const graph = applyOptions(structuredClone(root), extra);
    try {
      return { graph: await elk().layout(graph), fallback };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`layout failed: ${(lastError as Error)?.message ?? lastError}`);
}

function applyOptions(n: ElkNode, extra: Record<string, string>): ElkNode {
  if (n.layoutOptions && "elk.algorithm" in n.layoutOptions) Object.assign(n.layoutOptions, extra);
  for (const c of n.children ?? []) applyOptions(c, extra);
  return n;
}

function describe(model: Model): string {
  const name = (id: string) =>
    model.nodes.find((n) => n.id === id)?.label ??
    model.groups.find((g) => g.id === id)?.label ??
    id;
  const parts: string[] = [];
  if (model.title) parts.push(`${model.title}.`);
  parts.push(
    `${model.nodes.length} components${model.groups.length ? ` in ${model.groups.length} groups` : ""}.`,
  );
  const flows = model.edges
    .slice(0, 24)
    .map((e) => `${name(e.from)} to ${name(e.to)}${e.label ? ` (${e.label})` : ""}`);
  if (flows.length)
    parts.push(`Connections: ${flows.join("; ")}${model.edges.length > 24 ? "; and more" : ""}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
