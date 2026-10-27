// Drawing for pool and lane bands (SceneGroup.lane): the band and its label strip, in classic and
// in stage. Undefined means the group is drawn as an ordinary group.

import type { StageInk, Theme } from "../themes.ts";
import type { Box, SceneGroup, TextBlock } from "../types.ts";
import { esc, n } from "./svg.ts";

export interface LaneDrawing {
  /** Drawn with the group frames, under the edges. */
  frame: string;
  /**
   * A dashed band's border, drawn after every frame and still under the edges, so its gaps are
   * not filled by the solid lines its pool and the bands beside it draw on the same place.
   */
  outline?: string;
  /** Drawn with the group headers, over the edges. */
  header: string;
}

// Inter's vertical metrics, as svg.ts sets them.
const ASCENT = 0.96875;
const DESCENT = 0.2412;
/** Geist Mono advances every glyph 0.6 em; the stage's header face tracks 0.1 em. */
const ADVANCE = 0.6;
const TRACK = 0.1;
const HEADER = 11;

const same = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Where the name goes and whether it reads bottom to top (a strip across a horizontal flow). */
function nameOf(g: SceneGroup): { cx: number; cy: number; rotated: boolean; room: number } {
  const lane = g.lane;
  const b = g.labelBox;
  const black = !!lane && same(lane.header, g.box);
  const rotated = !!lane && lane.horizontal !== black;
  const box = lane?.header ?? g.box;
  return {
    cx: b.x + b.w / 2,
    cy: b.y + b.h / 2,
    rotated,
    room: (rotated ? box.h : box.w) - 12,
  };
}

/** The line between the strip and the band's content; none for a black box. */
function divider(g: SceneGroup): string | undefined {
  const lane = g.lane;
  if (!lane || same(lane.header, g.box)) return undefined;
  const s = lane.header;
  return lane.horizontal
    ? `M${n(s.x + s.w)} ${n(s.y)}V${n(s.y + s.h)}`
    : `M${n(s.x)} ${n(s.y + s.h)}H${n(s.x + s.w)}`;
}

/** A block of lines centered on (cx, cy); rotated -90 degrees, its first line is leftmost. */
function lines(
  block: TextBlock,
  at: { cx: number; cy: number; rotated: boolean },
  baseline: (center: number) => number,
  attrs: string,
  caps = false,
  dx = 0,
): string {
  if (!block.lines.length) return "";
  const top = at.cy - (block.lines.length * block.lead) / 2;
  const spans = block.lines
    .map((line, i) => {
      const y = baseline(top + (i + 0.5) * block.lead);
      return `<tspan x="${n(at.cx + dx)}" y="${n(y)}">${esc(caps ? line.toUpperCase() : line)}</tspan>`;
    })
    .join("");
  const turn = at.rotated ? ` transform="rotate(-90 ${n(at.cx)} ${n(at.cy)})"` : "";
  return `<text${attrs} text-anchor="middle"${turn}>${spans}</text>`;
}

/**
 * Classic: the BPMN modeler look (bpmn-js): square bands in one dark line, 1.5px, no fill, and the
 * name centered in its strip, read bottom to top across a horizontal flow. `surface` is the color
 * under the band, which a dashed border's gaps show.
 */
export function laneClassic(g: SceneGroup, _t: Theme, surface = "none"): LaneDrawing | undefined {
  if (!g.lane) return undefined;
  const b = g.box;
  const rect = (paint: string) =>
    `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" ${paint}/>`;
  const line = `stroke="${g.stroke}" stroke-width="${g.strokeWidth}"`;
  const frame = rect(`fill="${g.fill}" ${g.dash ? `stroke="none"` : line}`);
  // A solid line in the surface color first knocks out the lines shared with the pool and the
  // bands beside it, so the dashes show.
  const outline = g.dash
    ? rect(`fill="none" stroke="${surface}" stroke-width="${n(g.strokeWidth + 1)}"`) +
      rect(`fill="none" ${line} stroke-dasharray="${g.dash}"`)
    : undefined;
  const parts: string[] = [];
  const d = divider(g);
  if (d) parts.push(`<path d="${d}" fill="none" ${line}/>`);
  const L = g.label;
  const weight = L.weight === 600 ? ` font-weight="600"` : "";
  // Each line's em box centered on its slot, as svg.ts sets text.
  const baseline = (c: number) => c - (L.size * (ASCENT + DESCENT)) / 2 + L.size * ASCENT;
  parts.push(
    lines(L, nameOf(g), baseline, ` font-size="${n(L.size)}"${weight} fill="${g.labelColor}"`),
  );
  return { frame, ...(outline ? { outline } : {}), header: parts.join("") };
}

/**
 * Stage: `h` is one display pixel in scene units and `glow` wraps lit content in the build
 * animation (or returns it as is in a still frame). Hairline bands at the frame alpha, the name
 * in the stage's mono caps; lit, the frame and the strip's edge take the tint.
 */
export function laneStage(
  g: SceneGroup,
  k: StageInk,
  _t: Theme,
  h: number,
  glow: (body: string) => string,
): LaneDrawing | undefined {
  const lane = g.lane;
  if (!lane) return undefined;
  const b = g.box;
  const rect = (r: Box, paint: string) =>
    `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" ${paint}/>`;
  const line = (c: string, a: number) =>
    `stroke="${c}"${a < 1 ? ` stroke-opacity="${n(a)}"` : ""} stroke-width="${n(h)}"`;
  const tone = (c: string, a: number) => `fill="${c}"${a < 1 ? ` fill-opacity="${n(a)}"` : ""}`;
  const dash = g.dash ? ` stroke-dasharray="${n(3 * h)} ${n(3 * h)}"` : "";
  // Panels stack where bands nest, so only the outer band lays one.
  const panel = g.depth === 0 ? tone(k.line, k.panel) : `fill="none"`;
  const frame =
    rect(b, `${panel} ${line(k.line, k.frame)}${dash}`) +
    glow(rect(b, `fill="none" ${line(k.tint, 0.45)}${dash}`));
  const parts: string[] = [];
  const d = divider(g);
  if (d) {
    // The strip is a shade darker than the band, so a name reads as a header, not as content.
    parts.push(rect(lane.header, tone(k.line, k.panel)));
    parts.push(`<path d="${d}" fill="none" ${line(k.line, k.frame)}/>`);
    parts.push(
      glow(
        rect(lane.header, tone(k.tint, 0.06 * k.glow)) +
          `<path d="${d}" fill="none" ${line(k.tint, 0.6)}/>`,
      ),
    );
  }
  const L = g.label;
  const at = nameOf(g);
  const widest = Math.max(1, ...L.lines.map((l) => [...l].length));
  // The largest size up to the header face's own at which every line fits the strip.
  const fits = (at.room + HEADER * TRACK) / (widest * (ADVANCE + TRACK));
  const size = Math.max(7.5, Math.floor(Math.min(HEADER, fits) * 4) / 4);
  const track = TRACK * size;
  const block = { ...L, lead: Math.max(L.lead, size * 1.4) };
  parts.push(
    lines(
      block,
      at,
      (c) => c + 0.355 * size,
      ` font-size="${n(size)}" font-weight="700" letter-spacing="${n(track)}" fill="${g.labelColor}"`,
      true,
      // text-anchor middle also centers the spacing after the last letter; shift that back.
      track / 2,
    ),
  );
  return { frame, header: parts.join("") };
}
