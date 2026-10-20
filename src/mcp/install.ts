// orrery mcp install <client>: writes the MCP server entry into a client's own config file
// (Claude Code, Claude Desktop, Cursor, VS Code, Gemini CLI, Codex, Kiro), keeping what is there.
import type { Args } from "../cli/args.ts";

export async function cmdMcpInstall(_args: Args): Promise<void> {
  throw new Error("orrery mcp install is not built yet");
}
