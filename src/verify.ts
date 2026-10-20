// orrery verify: every `evidence:` on a node, group or edge must still point at a real file, a
// line inside it and, when it names one, an identifier on that line; --link turns each into a
// commit-pinned permalink on the node's url.
import type { Args } from "./cli/args.ts";

export async function cmdVerify(_args: Args): Promise<void> {
  throw new Error("orrery verify is not built yet");
}
