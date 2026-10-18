import { ensureContrast, mixHex, parseHex } from "./color.ts";
import { tokensFor } from "./themes.ts";
import type { Scene } from "./types.ts";

/** A grey or white fill (no hue): the stage skin washes these; colored vendor fills stay. */
function neutral(hex: string): boolean {
  const c = parseHex(hex);
  if (!c) return false;
  return Math.max(...c) - Math.min(...c) < 26;
}

/**
 * Recolors a laid-out scene for the stage skin. Geometry is untouched (layout never reads the
 * skin), so classic and stage place every box and point the same. Neutral group fills become a
 * translucent wash over the canvas texture; vendor hues (borders, tiles, Google's blue frame) stay.
 */
export function stageColors(scene: Scene): Scene {
  const t = tokensFor(scene);
  const s = t.stage;
  if (!s) return scene;
  const canvas =
    scene.background && scene.background !== "transparent" ? scene.background : t.background;
  const washed = mixHex(s.wash, canvas, s.washOpacity);
  for (const g of scene.groups) {
    if (g.fill === "none" || !neutral(g.fill)) continue;
    g.fill = washed;
    const inner = g.inner && neutral(g.inner.fill);
    if (g.inner && inner) g.inner.fill = washed;
    g.wash = { color: s.wash, opacity: s.washOpacity, ...(inner ? { inner: true } : {}) };
    // Layout tuned the label to 4.5:1 on the classic fill; hold it there on the wash.
    g.labelColor = ensureContrast(g.labelColor, washed, 4.5);
  }
  return scene;
}
