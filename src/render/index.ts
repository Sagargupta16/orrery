import { checkScene } from "../check.ts";
import { layout } from "../layout.ts";
import type { Diagnostic, Model, Scene, ThemeName } from "../types.ts";
import { renderDrawio } from "./drawio.ts";
import { renderHtml } from "./html.ts";
import { renderPng } from "./png.ts";
import { renderSvg } from "./svg.ts";
import { componentName, renderTsx } from "./tsx.ts";

export const FORMATS = ["svg", "png", "drawio", "tsx", "html"] as const;
export type Format = (typeof FORMATS)[number];

export interface RenderRequest {
  model: Model;
  formats: Format[];
  themes: ThemeName[];
  /** Base name used for the TSX component and downloads. */
  name: string;
  scale?: number;
  fonts?: string[];
  animate?: boolean;
}

export interface Artifact {
  format: Format;
  theme?: ThemeName;
  data: string | Uint8Array;
  width: number;
  height: number;
}

export interface RenderResult {
  artifacts: Artifact[];
  diagnostics: Diagnostic[];
  scenes: Partial<Record<ThemeName, Scene>>;
}

export async function renderModel(req: RenderRequest): Promise<RenderResult> {
  const model = req.animate ? { ...req.model, animate: true } : req.model;
  const themes = [
    ...new Set(req.formats.includes("html") ? [...req.themes, "light", "dark"] : req.themes),
  ] as ThemeName[];
  const scenes: Partial<Record<ThemeName, Scene>> = {};
  for (const theme of themes) scenes[theme] = await layout(model, { theme });
  const first = scenes[req.themes[0] ?? model.theme] ?? Object.values(scenes)[0];
  const diagnostics = first ? checkScene(first, model) : [];
  const artifacts: Artifact[] = [];
  for (const theme of req.themes) {
    const scene = scenes[theme];
    if (!scene) continue;
    const svg = renderSvg(scene);
    for (const format of req.formats) {
      const base = { format, theme, width: scene.width, height: scene.height };
      if (format === "svg") artifacts.push({ ...base, data: svg });
      if (format === "png") {
        // PNGs are a still frame; the animated dash pattern would freeze mid-cycle.
        const still = scene.animate ? renderSvg({ ...scene, animate: false }) : svg;
        artifacts.push({
          ...base,
          data: await renderPng(still, { scale: req.scale, fonts: req.fonts }),
          width: Math.round(scene.width * (req.scale ?? 2)),
          height: Math.round(scene.height * (req.scale ?? 2)),
        });
      }
      if (format === "drawio")
        artifacts.push({
          ...base,
          data: renderDrawio({ ...scene, animate: false }, model.title ?? req.name),
        });
      if (format === "tsx")
        artifacts.push({ ...base, data: renderTsx(scene, componentName(model.title, req.name)) });
    }
  }
  if (req.formats.includes("html") && scenes.light && scenes.dark) {
    artifacts.push({
      format: "html",
      data: renderHtml({
        title: model.title ?? req.name,
        light: renderSvg(scenes.light),
        dark: renderSvg(scenes.dark),
        name: req.name,
        initial: req.themes[0] ?? model.theme,
      }),
      width: scenes.light.width,
      height: scenes.light.height,
    });
  }
  return { artifacts, diagnostics, scenes };
}
