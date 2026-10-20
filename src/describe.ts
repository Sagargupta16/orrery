// A plain-text account of a laid-out diagram (groups, nodes, where they sit, what connects to
// what), for text-only models, alt text and the MCP describe tool.
import type { Args } from "./cli/args.ts";
import type { Model, Scene } from "./types.ts";

export function describeScene(_scene: Scene, _model: Model): string {
  return "";
}

export async function cmdDescribe(_args: Args): Promise<void> {
  throw new Error("orrery describe is not built yet");
}
