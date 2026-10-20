// orrery diff: what changed between two specs (nodes, groups and edges added, removed or
// changed), as text, JSON, or an SVG of the new diagram with the changes colored.
import type { Args } from "./cli/args.ts";

export async function cmdDiff(_args: Args): Promise<void> {
  throw new Error("orrery diff is not built yet");
}
