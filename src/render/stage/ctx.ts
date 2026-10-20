// The context every stage drawing step shares, and the paint attribute helpers they build with.

import type { StageInk, Theme } from "../../themes.ts";
import type { Box, Scene } from "../../types.ts";
import { n } from "../svg.ts";
import type { Story } from "./story.ts";

export interface Ctx {
  t: Theme;
  k: StageInk;
  prefix: string;
  scene: Scene;
  /** One display pixel in scene units. */
  h: number;
  story: Story;
  /** Scene-wide sizes for node and edge labels, so neighbors match. */
  sizes: { label: number; note: number; edge: number };
  symbols: Map<string, string>;
  filters: Map<string, string>;
  defs: string[];
}

export const fill = (c: string, a = 1) => `fill="${c}"${a < 1 ? ` fill-opacity="${a}"` : ""}`;
export const stroke = (c: string, a: number, w: number) =>
  `stroke="${c}"${a < 1 ? ` stroke-opacity="${a}"` : ""} stroke-width="${n(w)}"`;
export const rect = (b: Box, rx: number, paint: string, extra = "") =>
  `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}"${rx ? ` rx="${n(rx)}"` : ""} ${paint}${extra}/>`;
