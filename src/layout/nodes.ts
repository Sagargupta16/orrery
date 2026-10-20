// Scene nodes from ELK's boxes: where the icon, label and note go for each look, the ink that keeps
// contrast on a filled group, notation symbols and badges; and fitIcons, which narrows an icon box
// to its glyph once the icon libraries are loaded.

import { ensureContrast } from "../color.ts";
import { iconAspect } from "../icons/index.ts";
import type { Box, ModelNode, Scene, SceneGroup, SceneNode } from "../types.ts";
import type { Laid } from "./context.ts";
import type { ElkNode } from "./elk.ts";
import { round } from "./geometry.ts";
import type { NodeGeom } from "./hooks.ts";
import { badgePill } from "./measure.ts";
import { placeNotation } from "./notation.ts";

export function sceneNodes(
  ctx: Laid,
  placed: Map<string, ElkNode>,
  groups: SceneGroup[],
  top: number,
): SceneNode[] {
  const { model, nodeGeom, tokens: t, horizontal } = ctx;
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
    if (n.look === "icon") iconText(node, n, g, el, horizontal, top);
    else if (n.look === "card") cardText(node, n, g);
    else shapeText(node, n, g);
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
  return nodes;
}

/** Icon look: the icon on top, the label under it (where ELK put it in a horizontal flow). */
function iconText(
  node: SceneNode,
  n: ModelNode,
  g: NodeGeom,
  el: ElkNode,
  horizontal: boolean,
  top: number,
): void {
  const { box } = node;
  const S = n.iconSize;
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
}

/** Card look: the icon at the left, label and note beside it, centered across the card. */
function cardText(node: SceneNode, n: ModelNode, g: NodeGeom): void {
  const { box } = node;
  const S = n.iconSize;
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
}

/** Shape look: a small icon and the text centered in the shape's inner area. */
function shapeText(node: SceneNode, n: ModelNode, g: NodeGeom): void {
  const { box } = node;
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
