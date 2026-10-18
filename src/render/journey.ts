// Drawing for the journey grid (Scene.journey): stage headers, lane bands and the emotion curve,
// under the cards and edges, in classic and in stage.

import type { StageInk, Theme } from "../themes.ts";
import type { Scene } from "../types.ts";

export function journeyClassic(_scene: Scene, _t: Theme): string {
  return "";
}

/** Stage: `h` is one display pixel in scene units. */
export function journeyStage(_scene: Scene, _k: StageInk, _t: Theme, _h: number): string {
  return "";
}
