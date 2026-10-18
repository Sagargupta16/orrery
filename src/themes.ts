import { ensureContrast, mixHex } from "./color.ts";
import type { Skin, ThemeName } from "./types.ts";

export interface Theme {
  name: ThemeName;
  background: string;
  text: string;
  muted: string;
  edge: string;
  edgeLabel: string;
  surface: string;
  border: string;
  zone: string;
  stepFill: string;
  stepText: string;
  shadow: string;
  /** Packets traveling the edges in an animated SVG. */
  flow: string;
  /** Stage skin only: the scene kit (see render/stage.ts). */
  stage?: StageInk;
}

/**
 * The stage skin's kit, after the owner's portfolio scenes: structure is one color at a ladder of
 * alphas (white on dark, ink on light), one tint lights whatever is active, nothing else has hue.
 */
export interface StageInk {
  /** Structure color, drawn at the alphas below. */
  line: string;
  /** Canvas gradient from `top` (top left) to the background. */
  top: string;
  /** Tiles, cards and chips: opaque, so the grid stops at their edges. */
  tile: string;
  /** The accent: lit frames and tiles, the packet and the trace it leaves. */
  tint: string;
  /** Digits and glyphs on a solid tint. */
  onTint: string;
  /** Glyphs, opaque (`line` at about 55 percent). */
  glyph: string;
  /** Header of a top-level group. */
  header: string;
  /** Alphas of `line`: grid texture, panel fill, chip border, frames and tiles, wires, arrows. */
  grid: number;
  panel: number;
  hair: number;
  frame: number;
  wire: number;
  arrow: number;
  /** Alpha of the one tint wash behind the story. */
  wash: number;
  /** Scale of the lit group fills (nested groups stack them). */
  glow: number;
}

export const THEME_TOKENS: Record<ThemeName, Theme> = {
  light: {
    name: "light",
    background: "#ffffff",
    text: "#232f3e",
    muted: "#5f6b7a",
    edge: "#545b64",
    edgeLabel: "#3b4552",
    surface: "#ffffff",
    border: "#c6ccd4",
    zone: "#f4f6f8",
    // Numbered callouts are black with white digits in the AWS deck.
    stepFill: "#000000",
    stepText: "#ffffff",
    shadow: "#0f172a",
    flow: "#0972d3",
  },
  dark: {
    name: "dark",
    background: "#0d1117",
    text: "#e6edf3",
    muted: "#9aa4b2",
    edge: "#8b949e",
    edgeLabel: "#c9d1d9",
    surface: "#161b22",
    border: "#3d444d",
    zone: "#151b23",
    stepFill: "#e6edf3",
    stepText: "#0d1117",
    shadow: "#000000",
    flow: "#58a6ff",
  },
};

// Stage: the owner's portfolio scene language. Text colors are opaque and hold 4.5:1, so PNGs,
// header chips and the contrast checks agree; lines and fills stay translucent over the grid.
const INK = "#0b1012";
const PAPER = "#eef2f6";
const BLUE = "#60a5fa";
const DEEP = "#2563eb";
/**
 * `fg` at `alpha` over the canvas, held at 4.5:1 against the busiest surface text can land on:
 * two stacked group panels under the lit tint and the wash.
 */
const over = (fg: string, bg: string, alpha: number) => {
  const tint = bg === INK ? BLUE : DEEP;
  const busiest = mixHex(tint, mixHex(bg === INK ? "#ffffff" : INK, bg, 0.06), 0.14);
  return ensureContrast(mixHex(fg, bg, alpha), busiest);
};
const STAGE_TOKENS: Record<ThemeName, Theme> = {
  dark: {
    name: "dark",
    background: INK,
    text: over("#ffffff", INK, 0.6),
    muted: over("#ffffff", INK, 0.5),
    edge: mixHex("#ffffff", INK, 0.25),
    edgeLabel: over("#ffffff", INK, 0.55),
    surface: INK,
    border: mixHex("#ffffff", INK, 0.16),
    zone: mixHex("#ffffff", INK, 0.03),
    stepFill: BLUE,
    stepText: INK,
    shadow: "#000000",
    flow: BLUE,
    stage: {
      line: "#ffffff",
      top: "#0e1a24",
      tile: INK,
      tint: BLUE,
      onTint: INK,
      glyph: mixHex("#ffffff", INK, 0.55),
      header: over(BLUE, INK, 0.85),
      grid: 0.045,
      panel: 0.03,
      hair: 0.1,
      frame: 0.16,
      wire: 0.25,
      arrow: 0.4,
      wash: 0.12,
      glow: 1,
    },
  },
  light: {
    name: "light",
    background: PAPER,
    text: over(INK, PAPER, 0.66),
    muted: over(INK, PAPER, 0.58),
    edge: mixHex(INK, PAPER, 0.3),
    edgeLabel: over(INK, PAPER, 0.62),
    surface: "#ffffff",
    border: mixHex(INK, PAPER, 0.16),
    zone: mixHex(INK, PAPER, 0.03),
    stepFill: DEEP,
    stepText: "#ffffff",
    shadow: "#0f172a",
    flow: DEEP,
    stage: {
      line: INK,
      top: "#ffffff",
      tile: "#ffffff",
      tint: DEEP,
      onTint: "#ffffff",
      glyph: mixHex(INK, "#ffffff", 0.6),
      header: over(DEEP, PAPER, 0.9),
      grid: 0.05,
      panel: 0.025,
      hair: 0.1,
      frame: 0.16,
      wire: 0.28,
      arrow: 0.45,
      wash: 0.08,
      glow: 0.5,
    },
  },
};

/** The tokens a scene is drawn with: its theme in its skin. */
export function tokensFor(scene: { theme: ThemeName; skin?: Skin }): Theme {
  return scene.skin === "stage" ? STAGE_TOKENS[scene.theme] : THEME_TOKENS[scene.theme];
}

export const FONT_STACK =
  "Inter, 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif";
