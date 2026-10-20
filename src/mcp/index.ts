// orrery's commands as Model Context Protocol tools, so any MCP client can draw without the skill.
// No dependencies: newline-delimited JSON-RPC 2.0 on stdin and stdout (the stdio transport), or
// with --port, stateless Streamable HTTP on POST /mcp at 127.0.0.1 only.
//
// Dual era (https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning): a request
// that names its protocol version in _meta is a modern one and gets resultType and serverInfo on its
// result; an initialize handshake (2025-11-25 and earlier) is answered with the client's version
// when it is one of ours. Nothing is kept between requests either way, so one handler serves both.
//
// A diagram with problems is a normal result (ok false, diagnostics, a failing review) the model
// fixes and calls again; isError means the call itself failed (bad arguments, a crash).
//
// mcp/protocol.ts answers the JSON-RPC methods, mcp/stdio.ts and mcp/http.ts carry them,
// mcp/tools/ holds one file per tool and mcp/kit.ts what the tools share.
import type { Args } from "../cli/args.ts";
import { usage } from "../cli/io.ts";
import { serveHttp } from "./http.ts";
import { serveStdio } from "./stdio.ts";

export async function cmdMcp(args: Args): Promise<void> {
  if (args._.length) usage(`mcp takes no arguments (got ${args._.join(" ")})`);
  const port = args.flags.port;
  if (port === undefined) return serveStdio();
  if (!/^\d{1,5}$/.test(String(port)) || Number(port) > 65535)
    usage(`--port must be a port number from 0 to 65535 (got "${port}")`);
  return serveHttp(Number(port));
}
