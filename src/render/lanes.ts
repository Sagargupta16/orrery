// Drawing for pool and lane bands (SceneGroup.lane): the band and its label strip, in classic and
// in stage. Undefined means the group is drawn as an ordinary group.

import type { StageInk, Theme } from "../themes.ts";
import type { SceneGroup } from "../types.ts";

export interface LaneDrawing {
  /** Drawn with the group frames, under the edges. */
  frame: string;
  /** Drawn with the group headers, over the edges. */
  header: string;
}

export function laneClassic(_g: SceneGroup, _t: Theme): LaneDrawing | undefined {
  return undefined;
}

/**
 * Stage: `h` is one display pixel in scene units and `glow` wraps lit content in the build
 * animation (or returns it as is in a still frame).
 */
export function laneStage(
  _g: SceneGroup,
  _k: StageInk,
  _t: Theme,
  _h: number,
  _glow: (body: string) => string,
): LaneDrawing | undefined {
  return undefined;
}
