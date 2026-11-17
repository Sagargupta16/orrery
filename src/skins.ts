import { contrast, ensureContrast, luminance, mixHex } from "./color.ts";
import { resolveGroupStyle, serviceGroupStroke } from "./styles.ts";
import { THEME_TOKENS, tokensFor } from "./themes.ts";
import type { Scene, SceneGroup } from "./types.ts";

/**
 * The frame color and fill the spec itself set on a group (`color`, `fill`), read back from the
 * scene: layout paints the type's own look unless the spec overrides it (layout/groups.ts), so a
 * stroke or fill that differs from that default is the spec's.
 */
function ownLook(g: SceneGroup, scene: Scene): { color?: string; fill?: string } {
  const style = resolveGroupStyle(g.type);
  if (!style) return {};
  const t = THEME_TOKENS[scene.theme];
  const base = serviceGroupStroke(g.type, g.icon) ?? style.stroke;
  const strokes = [base];
  let fill = style.fill ?? "none";
  if (scene.theme === "dark") {
    if (luminance(base) < 0.04) strokes.push("#c9d1d9");
    else if (contrast(base, t.background) < 2) strokes.push(mixHex(base, "#ffffff", 0.55));
    if (fill !== "none") fill = mixHex(fill, t.background, 0.14);
  }
  return {
    ...(strokes.includes(g.stroke) ? {} : { color: g.stroke }),
    ...(g.overlay || g.fill === "none" || g.fill === fill ? {} : { fill: g.fill }),
  };
}

/**
 * Recolors a laid-out scene for the stage skin. Geometry is untouched (layout never reads the
 * skin), so classic and stage place every box and point the same. Stage keeps vendor hues to its
 * icons, muted (render/stage/filters.ts): every group frame is the structure color at one alpha
 * and every label a stage text color. The stage renderer draws from its own kit; these colors
 * keep the review, its contrast checks and draw.io in step.
 */
export function stageColors(scene: Scene): Scene {
  const t = tokensFor(scene);
  const s = t.stage;
  if (!s) return scene;
  const canvas =
    scene.background && scene.background !== "transparent" ? scene.background : t.background;
  const panel = mixHex(s.line, canvas, s.panel);
  for (const g of scene.groups) {
    // A color or fill the spec set stays: the frame and header take the color (held to the
    // contrast floors against what is under them) and the fill tints the panel faintly.
    const own = ownLook(g, scene);
    const open = g.dash || g.overlay;
    const shown = own.fill ? mixHex(open ? canvas : panel, own.fill, 0.2) : panel;
    g.fill = own.fill || !open ? shown : "none";
    g.stroke = own.color ? ensureContrast(own.color, shown, 3) : mixHex(s.line, canvas, s.frame);
    if (g.inner) g.inner.fill = panel;
    g.labelColor = ensureContrast(own.color ?? (g.depth === 0 ? s.header : t.text), shown);
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
