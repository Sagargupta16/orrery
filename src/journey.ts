// Customer journey maps (kind: journey): stages as columns, lanes as rows, a card per step and an
// emotion curve from the steps' scores. Its own grid layout, not ELK's.

import type { Box, Model, Point, Scene, TextBlock, ThemeName } from "./types.ts";

export interface SceneJourney {
  /** Column headers, one per stage, in order. */
  stages: { label: TextBlock; box: Box; labelBox: Box }[];
  /** Row bands, one per lane, with their headers. */
  rows: { id: string; label: TextBlock; box: Box; labelBox: Box }[];
  /** The emotion curve across the stages, when steps carry score:. */
  curve?: { band: Box; points: Point[]; scores: number[] };
}

/** The whole scene for a journey spec, or undefined to lay it out as a flow. */
export async function journeyLayout(_model: Model, _theme: ThemeName): Promise<Scene | undefined> {
  return undefined;
}
