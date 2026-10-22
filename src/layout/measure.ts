// What each node and group measures before ELK sees it: box size, label and note text, an outside
// label's room, a group's header height and minimum width, and a badge pill's box.

import { resolveGroupStyle } from "../styles.ts";
import { measure, textBlock } from "../text.ts";
import type { Box, ModelGroup, ModelNode, TextBlock } from "../types.ts";
import type { Setup } from "./context.ts";
import { erGeometry } from "./er/index.ts";
import { round } from "./geometry.ts";
import type { NodeGeom } from "./hooks.ts";
import { notationGeometry } from "./notation.ts";
import { SIZES } from "./sizes.ts";

export function nodeGeometry(n: ModelNode, horizontal: boolean): NodeGeom {
  // Only an er diagram parses fields, so a node with them is an entity table.
  const table = n.fields ? erGeometry(n, horizontal) : undefined;
  if (table) return table;
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
export function badgePill(text: string, anchor: Box): Box {
  const w = round(Math.max(18, measure(text, 10, 600) + 10));
  const x = Math.max(anchor.x + anchor.w - w / 2 - 2, anchor.x + anchor.w / 2 + 6);
  return { x: round(x), y: round(anchor.y - 7), w, h: 16 };
}

export interface GroupGeom {
  label: TextBlock;
  header: number;
  minWidth: number;
  icon?: string;
  iconStyle: "tile" | "tile-center" | "inline";
  center: boolean;
}

export function groupGeometry(g: ModelGroup): GroupGeom {
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

// A group whose header no edge could avoid (second pass) is wide enough for its corner label to
// end left of the top center, where edges enter in a vertical flow, as in AWS reference
// diagrams (the label ends minWidth - 16 from the left border).
export const minWidthOf = (ctx: Setup, id: string, gg: GroupGeom) =>
  !ctx.horizontal && ctx.opts.widen?.has(id)
    ? Math.max(gg.minWidth, 2 * (gg.minWidth - 10))
    : gg.minWidth;
