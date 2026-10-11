import type { ThemeName } from "./types.ts";

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
    stepFill: "#232f3e",
    stepText: "#ffffff",
    shadow: "#0f172a",
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
  },
};

export const FONT_STACK =
  "Inter, 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif";
