import { mixHex } from "./color.ts";
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
  /** Stage skin only: the canvas gradient, tint wash and dot texture, and the group wash. */
  stage?: StageCanvas;
}

export interface StageCanvas {
  /** Gradient from `top` (top left) to `background` (bottom right). */
  top: string;
  /** One tint wash in the top right corner, and the color lines light up in. */
  tint: string;
  tintOpacity: number;
  dot: string;
  dotOpacity: number;
  /** Neutral group fills become this color at this opacity over the canvas. */
  wash: string;
  washOpacity: number;
  /** Ring around step and node badges. */
  ring: string;
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

// Stage: the owner's portfolio scene language (near-black canvas with one blue tint, white alphas
// for structure, no glow or blur), with lines bright enough to pass 3:1 and text 4.5:1. Every
// alpha is baked into an opaque color so PNGs, header chips and the contrast checks agree.
const INK = "#0b1012";
const PAPER = "#eef2f6";
const STAGE_TOKENS: Record<ThemeName, Theme> = {
  dark: {
    name: "dark",
    background: INK,
    text: "#e6edf3",
    muted: mixHex("#e6edf3", INK, 0.68),
    edge: mixHex("#ffffff", INK, 0.42),
    edgeLabel: mixHex("#e6edf3", INK, 0.86),
    surface: mixHex("#ffffff", INK, 0.05),
    border: mixHex("#ffffff", INK, 0.16),
    zone: mixHex("#ffffff", INK, 0.03),
    stepFill: INK,
    stepText: "#e6edf3",
    shadow: "#000000",
    flow: "#60a5fa",
    stage: {
      top: "#0e1a24",
      tint: "#2563eb",
      tintOpacity: 0.14,
      dot: "#ffffff",
      dotOpacity: 0.06,
      wash: "#ffffff",
      washOpacity: 0.035,
      ring: "#60a5fa",
    },
  },
  light: {
    name: "light",
    background: PAPER,
    text: "#1f2933",
    muted: mixHex("#1f2933", PAPER, 0.74),
    edge: mixHex("#0b1012", PAPER, 0.56),
    edgeLabel: "#2b3640",
    surface: "#ffffff",
    border: mixHex("#0b1012", PAPER, 0.16),
    zone: mixHex("#ffffff", PAPER, 0.6),
    stepFill: INK,
    stepText: "#ffffff",
    shadow: "#0f172a",
    flow: "#2563eb",
    stage: {
      top: "#ffffff",
      tint: "#2563eb",
      tintOpacity: 0.08,
      dot: "#0b1012",
      dotOpacity: 0.07,
      wash: "#ffffff",
      washOpacity: 0.7,
      ring: "#2563eb",
    },
  },
};

/** The tokens a scene is drawn with: its theme in its skin. */
export function tokensFor(scene: { theme: ThemeName; skin?: Skin }): Theme {
  return scene.skin === "stage" ? STAGE_TOKENS[scene.theme] : THEME_TOKENS[scene.theme];
}

export const FONT_STACK =
  "Inter, 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif";
