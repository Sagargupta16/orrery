import { ensureContrast, mixHex } from "./color.ts";
import { tokensFor } from "./themes.ts";
import type { Scene } from "./types.ts";

/**
 * Recolors a laid-out scene for the stage skin. Geometry is untouched (layout never reads the
 * skin), so classic and stage place every box and point the same. Stage has no vendor hues: every
 * frame is the structure color at one alpha and every label a stage text color. The stage renderer
 * draws from its own kit; these colors keep the review, its contrast checks and draw.io in step.
 */
export function stageColors(scene: Scene): Scene {
  const t = tokensFor(scene);
  const s = t.stage;
  if (!s) return scene;
  const canvas =
    scene.background && scene.background !== "transparent" ? scene.background : t.background;
  const panel = mixHex(s.line, canvas, s.panel);
  for (const g of scene.groups) {
    g.fill = g.dash || g.overlay ? "none" : panel;
    g.stroke = mixHex(s.line, canvas, s.frame);
    if (g.inner) g.inner.fill = panel;
    g.labelColor = ensureContrast(g.depth === 0 ? s.header : t.text, panel);
  }
  for (const nd of scene.nodes) {
    nd.ink = undefined;
    nd.inkMuted = undefined;
    // A colored shape lights up in its own color; its text holds 4.5:1 on that.
    if (nd.look !== "shape" || !nd.color) continue;
    const lit = mixHex(nd.color, s.tile, 0.15);
    const fill = mixHex(nd.color, canvas, scene.theme === "dark" ? 0.16 : 0.1);
    nd.ink = ensureContrast(ensureContrast(t.text, lit), fill);
    nd.inkMuted = ensureContrast(ensureContrast(t.muted, lit), fill);
  }
  return scene;
}
