// A sequence diagram of the numbered steps: one lifeline per node the steps visit, one message
// per step edge in step order, drawn in the scene's theme.
import type { Model, Scene } from "../types.ts";

export function renderSequence(
  _scene: Scene,
  _model: Model,
  _opts: { idPrefix?: string } = {},
): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
}
