// orrery's commands as Model Context Protocol tools, over stdio (and HTTP with --port).
import type { Args } from "./cli.ts";

export async function cmdMcp(_args: Args): Promise<void> {
  throw new Error("orrery mcp is not built yet");
}
