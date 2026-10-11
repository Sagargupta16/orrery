import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { contrast, ensureContrast, luminance, mixHex } from "./color.ts";
import { iconInfo } from "./icons.ts";
import { vendorDir } from "./paths.ts";
import { resolveGroupStyle } from "./styles.ts";
import { measure, textBlock } from "./text.ts";
import { THEME_TOKENS } from "./themes.ts";
import type {
  Box,
  Model,
  ModelEdge,
  ModelGroup,
  ModelNode,
  Point,
  Scene,
  SceneEdge,
  SceneGroup,
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
  ports?: { id: string; width: number; height: number; x?: number; y?: number }[];
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
  cardLabelMax: 168,
  shapeLabelMax: 156,
  edgeLabelMax: 150,
  tile: 32,
  inlineIcon: 20,
};

const ELK_DIRECTION = { right: "RIGHT", down: "DOWN", left: "LEFT", up: "UP" } as const;
const ELK_ROUTING = { orthogonal: "ORTHOGONAL", polyline: "POLYLINE", spline: "SPLINES" } as const;

const round = (v: number) => Math.round(v * 100) / 100;

interface NodeGeom {
  /** Size ELK lays out. */
  w: number;
  h: number;
  label: TextBlock;
  note?: TextBlock;
  /** Outside label (icon look in a horizontal flow). */
  outside?: { w: number; h: number };
}

function nodeGeometry(n: ModelNode, horizontal: boolean): NodeGeom {
  const S = n.iconSize;
  if (n.look === "icon") {
    const label = textBlock(n.label, SIZES.nodeLabel, Math.max(SIZES.iconLabelMax, S + 40));
    const note = n.note
      ? textBlock(n.note, SIZES.note, Math.max(SIZES.iconLabelMax, S + 40))
      : undefined;
    const textW = Math.max(label.width, note?.width ?? 0);
    const textH = label.height + (note ? note.height + 2 : 0);
    if (horizontal)
      return {
        w: S,
        h: S,
        label,
        note,
        outside: { w: Math.ceil(textW + 4), h: Math.ceil(textH + 2) },
      };
    return { w: Math.ceil(Math.max(S, textW + 4)), h: Math.ceil(S + 8 + textH), label, note };
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
    header = icon ? SIZES.tile : label.height + 12;
    minWidth = (icon ? SIZES.tile + 8 : 12) + label.width + 16;
  } else {
    header = 34;
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
}

export async function layout(model: Model, opts: LayoutOptions = {}): Promise<Scene> {
  const theme = opts.theme ?? model.theme;
  const t = THEME_TOKENS[theme];
  const horizontal = model.direction === "right" || model.direction === "left";
  const s = model.spacing;

  const base: Record<string, string> = {
    "elk.algorithm": "layered",
    "elk.direction": ELK_DIRECTION[model.direction],
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.edgeRouting": ELK_ROUTING[model.routing],
    "elk.layered.layering.strategy":
      model.layering === "simplex" ? "NETWORK_SIMPLEX" : "LONGEST_PATH_SOURCE",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    // Keeps siblings in spec order where it costs no crossings (AZ A left of AZ B).
    "elk.layered.considerModelOrder.strategy": "PREFER_EDGES",
    "elk.spacing.nodeNode": String(Math.round(40 * s)),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(Math.round(64 * s)),
    "elk.spacing.edgeNode": String(Math.round(18 * s)),
    "elk.spacing.edgeEdge": String(Math.round(10 * s)),
    "elk.layered.spacing.edgeNodeBetweenLayers": String(Math.round(20 * s)),
    "elk.layered.spacing.edgeEdgeBetweenLayers": String(Math.round(10 * s)),
    "elk.spacing.edgeLabel": "4",
    "elk.spacing.labelNode": "6",
    "elk.edgeLabels.placement": "CENTER",
    "elk.json.shapeCoords": "ROOT",
    "elk.json.edgeCoords": "ROOT",
    "elk.layered.mergeEdges": model.merge ? "true" : "false",
    "elk.layered.unnecessaryBendpoints": "true",
    "elk.layered.thoroughness": "12",
  };

  const nodeGeom = new Map<string, NodeGeom>();
  const groupGeom = new Map<string, GroupGeom>();
  const elkNodes = new Map<string, ElkNode>();

  for (const n of model.nodes) {
    const g = nodeGeometry(n, horizontal);
    nodeGeom.set(n.id, g);
    const node: ElkNode = { id: n.id, width: g.w, height: g.h };
    if (g.outside) {
      node.labels = [
        { id: `${n.id}__label`, text: n.label, width: g.outside.w, height: g.outside.h },
      ];
      node.layoutOptions = {
        "elk.nodeLabels.placement": "OUTSIDE V_BOTTOM H_CENTER",
        "elk.spacing.labelNode": "6",
      };
    }
    elkNodes.set(n.id, node);
  }
  for (const grp of model.groups) {
    const gg = groupGeometry(grp);
    groupGeom.set(grp.id, gg);
    if (grp.around) continue;
    const top = gg.header + 18;
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
          : `(${top + 24}, ${gg.minWidth})`,
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
  // Children keep spec order: groups first, then nodes, each under its parent.
  for (const item of [...model.groups, ...model.nodes]) {
    const el = elkNodes.get(item.id);
    if (!el) continue;
    const parent = item.parent ? elkNodes.get(item.parent) : root;
    (parent?.children ?? root.children)?.push(el);
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
    model.edges.filter((e) => e.constraint && (e.label || e.step !== undefined)).map((e) => e.from),
  );
  const edgeLabels = new Map<string, { block: TextBlock; w: number; h: number; stepW: number }>();
  for (const e of model.edges) {
    if (!e.constraint) continue;
    const elkEdge: ElkEdge = {
      id: e.id,
      sources: [port(e.from, "out", e)],
      targets: [port(e.to, "in", e)],
    };
    if (!e.label && e.step === undefined && labelledFrom.has(e.from)) {
      elkEdge.labels = [{ id: `${e.id}__spacer`, text: " ", width: 1, height: 1 }];
    }
    const stepW = e.step !== undefined ? 22 : 0;
    if (e.label || e.step !== undefined) {
      const block = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
      const w = Math.ceil((e.label ? block.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0));
      const h = Math.ceil(Math.max(e.label ? block.height + 6 : 0, stepW ? 20 : 0));
      edgeLabels.set(e.id, { block, w, h, stepW });
      elkEdge.labels = [
        { id: `${e.id}__label`, text: e.label || `step ${e.step}`, width: w, height: h },
      ];
    }
    root.edges?.push(elkEdge);
  }

  const result = await runElk(root);

  // ------------------------------------------------------------- scene
  const top = titleBlock
    ? SIZES.pad + titleBlock.height + (subtitleBlock ? subtitleBlock.height + 4 : 0) - 6
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

  const groups: SceneGroup[] = [];
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
    if (overlay) {
      iconBox = gg.icon ? { x: box.x + 10, y: box.y - 8, w: 16, h: 16 } : undefined;
      labelX = iconBox ? iconBox.x + iconBox.w + 5 : box.x + 12;
      labelY = box.y - L.height / 2;
    } else if (gg.iconStyle === "tile-center") {
      iconBox = gg.icon
        ? { x: box.x + (box.w - SIZES.tile) / 2, y: box.y, w: SIZES.tile, h: SIZES.tile }
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
      labelY = iconBox ? box.y + (SIZES.tile - L.height) / 2 : box.y + 6;
    } else {
      iconBox = gg.icon
        ? { x: box.x + 12, y: box.y + 9, w: SIZES.inlineIcon, h: SIZES.inlineIcon }
        : undefined;
      labelX =
        gg.center && !iconBox
          ? box.x + (box.w - L.width) / 2
          : iconBox
            ? iconBox.x + iconBox.w + 8
            : box.x + 12;
      labelY = box.y + 10;
    }
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
        node.iconBox = { x: round(box.x + (box.w - S) / 2), y: box.y, w: S, h: S };
        node.labelBox = {
          x: round(box.x + (box.w - g.label.width) / 2),
          y: round(box.y + S + 8),
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
      if (n.icon) node.iconBox = { x: round(ix), y: round(box.y + (box.h - S) / 2), w: S, h: S };
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
        node.iconBox = { x: round(startX), y: round(ty + (textH - 20) / 2), w: 20, h: 20 };
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
          ...[nd.box, nd.iconBox, nd.labelBox, nd.noteBox].filter((b): b is Box => !!b && b.w > 0),
        );
      const sg = groups.find((x) => x.id === id);
      if (sg) boxes.push(sg.box);
    }
    if (!boxes.length || !gg) continue;
    const pad = 12;
    const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
    const y0 = Math.min(...boxes.map((b) => b.y)) - pad - 2;
    const x1 = Math.max(...boxes.map((b) => b.x + b.w), x0 + gg.minWidth) + pad;
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
      return { side, full: union([nd.box, nd.iconBox, nd.labelBox, nd.noteBox]) };
    }
    const box = groups.find((x) => x.id === id)?.box;
    return box ? { side: box, full: box } : undefined;
  };
  for (const e of model.edges) {
    if (!e.constraint) {
      const a = attachBox(e.from);
      const b = attachBox(e.to);
      if (!a || !b) continue;
      const points = freeRoute(a, b);
      const edge: SceneEdge = {
        id: e.id,
        from: e.from,
        to: e.to,
        points,
        line: e.line,
        arrow: e.arrow,
        color: e.color,
        step: e.step,
      };
      if (e.label || e.step !== undefined) {
        const block = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
        const stepW = e.step !== undefined ? 22 : 0;
        const w = Math.ceil((e.label ? block.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0));
        const h = Math.ceil(Math.max(e.label ? block.height + 6 : 0, stepW ? 20 : 0));
        const mid = midpoint(points);
        const box = { x: round(mid.x - w / 2), y: round(mid.y - h - 3), w, h };
        if (e.step !== undefined)
          edge.stepBox = { x: box.x, y: round(box.y + (h - 20) / 2), w: 20, h: 20 };
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
      edges.push(edge);
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
    };
    const lab = edgeLabels.get(e.id);
    const elkLabel = el.labels?.[0];
    if (lab && elkLabel?.x !== undefined && elkLabel.y !== undefined) {
      const box = { x: round(elkLabel.x), y: round(elkLabel.y + top), w: lab.w, h: lab.h };
      if (e.step !== undefined) {
        edge.stepBox = { x: box.x, y: round(box.y + (box.h - 20) / 2), w: 20, h: 20 };
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

  let width = round(result.width ?? 0);
  let height = round((result.height ?? 0) + top);
  for (const g of groups) {
    width = Math.max(width, round(g.box.x + g.box.w + SIZES.pad));
    height = Math.max(height, round(g.box.y + g.box.h + SIZES.pad));
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

  return {
    width,
    height,
    theme,
    direction: model.direction,
    routing: model.routing,
    arrowhead: model.arrowhead,
    animate: model.animate,
    background: model.background,
    title: titleBlock,
    titleBox,
    subtitle: subtitleBlock,
    subtitleBox,
    nodes,
    groups,
    edges,
    description: describe(model),
  };
}

interface Attach {
  side: Box;
  full: Box;
}

function union(boxes: (Box | undefined)[]): Box {
  const list = boxes.filter((b): b is Box => !!b);
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  const w = Math.max(...list.map((b) => b.x + b.w)) - x;
  const h = Math.max(...list.map((b) => b.y + b.h)) - y;
  return { x, y, w, h };
}

/** An orthogonal connector between two placed nodes or groups, for edges the layout ignored. */
function freeRoute(from: Attach, to: Attach): Point[] {
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
    const mx = round((sx + ex) / 2);
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
  const my = round((sy + ey) / 2);
  return [
    { x: ac.x, y: sy },
    { x: ac.x, y: my },
    { x: bc.x, y: my },
    { x: bc.x, y: ey },
  ];
}

function midpoint(points: Point[]): Point {
  const i = Math.max(0, Math.floor((points.length - 1) / 2));
  const a = points[i] ?? { x: 0, y: 0 };
  const b = points[i + 1] ?? a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function findEdge(n: ElkNode, id: string): ElkEdge | undefined {
  for (const e of n.edges ?? []) if (e.id === id) return e;
  for (const c of n.children ?? []) {
    const f = findEdge(c, id);
    if (f) return f;
  }
  return undefined;
}

/** ELK occasionally throws on unusual graphs; retry with simpler strategies before giving up. */
async function runElk(root: ElkNode): Promise<ElkNode> {
  const noOrder = { "elk.layered.considerModelOrder.strategy": "NONE" };
  const fallbacks: Record<string, string>[] = [
    {},
    noOrder,
    {
      ...noOrder,
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
    },
    {
      ...noOrder,
      "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
      "elk.layered.nodePlacement.strategy": "SIMPLE",
    },
  ];
  let lastError: unknown;
  for (const extra of fallbacks) {
    const graph = applyOptions(structuredClone(root), extra);
    try {
      return await elk().layout(graph);
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

export function measureLabel(text: string): number {
  return measure(text, SIZES.nodeLabel);
}

export function iconName(id: string): string {
  return iconInfo(id)?.name ?? id;
}
