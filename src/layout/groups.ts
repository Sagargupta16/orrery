// Scene groups: colors for the theme, where the header's icon and label go for each icon style
// (overlays carry a legend on their top border), and sliding a header off the edges crossing it.

import { contrast, ensureContrast, luminance, mixHex } from "../color.ts";
import { type GroupStyle, resolveGroupStyle } from "../styles.ts";
import type { Theme } from "../themes.ts";
import type { Box, ModelGroup, SceneEdge, SceneGroup, SceneNode, ThemeName } from "../types.ts";
import type { Placed } from "./context.ts";
import { round, segmentBox, union } from "./geometry.ts";
import type { GroupGeom } from "./measure.ts";
import { depthOf } from "./relations.ts";
import { SIZES } from "./sizes.ts";

export interface HeaderRoom {
  /** The icon moves with the label (inline icons, legends); a corner tile stays put. */
  moveIcon: boolean;
  /** Left and right limits for the moving part. */
  lo: number;
  hi: number;
}

/** What painting a group reads; it records the group's header room as it goes. */
export type PaintContext = Pick<Placed, "model" | "theme" | "tokens" | "groupGeom" | "headerRoom">;

export function paintGroup(
  ctx: PaintContext,
  grp: ModelGroup,
  box: Box,
  overlay: boolean,
): SceneGroup | undefined {
  const { model, theme, tokens: t, groupGeom, headerRoom } = ctx;
  const gg = groupGeom.get(grp.id);
  const style = resolveGroupStyle(grp.type);
  if (!gg || !style) return undefined;
  const { stroke, fill, labelColor } = groupColors(grp, style, theme, t, overlay);
  const { iconBox, labelX, labelY } = headerAt(gg, box, overlay);
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
    depth: overlay ? 1000 : depthOf(model, grp.parent),
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
}

function groupColors(
  grp: ModelGroup,
  style: GroupStyle,
  theme: ThemeName,
  t: Theme,
  overlay: boolean,
): { stroke: string; fill: string; labelColor: string } {
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
    if (!grp.color && !ink && luminance(style.labelColor ?? "#000000") < 0.04) labelColor = t.text;
  }
  labelColor = ensureContrast(labelColor, fill === "none" ? t.background : fill, 4.5);
  return { stroke, fill, labelColor };
}

/**
 * Where the header's icon and label go. Overlays carry a legend on their top border instead of a
 * corner header, so they never cover the header of the group they are drawn over.
 */
function headerAt(
  gg: GroupGeom,
  box: Box,
  overlay: boolean,
): { iconBox: Box | undefined; labelX: number; labelY: number } {
  const L = gg.label;
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
  return { iconBox, labelX, labelY };
}

/**
 * Slides a group's header label sideways off the edges that cross it: renderers paint a chip
 * behind the label, which would cut those edges. Returns false when no free stretch fits.
 */
export function clearHeader(
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
