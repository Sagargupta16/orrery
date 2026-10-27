// JSON-RPC 2.0 for MCP: protocol versions, the methods the server answers, and tool calls.
import { type Context, isObj, type Obj, ToolError, text } from "./kit.ts";
import { TOOLS } from "./tools/index.ts";
import { readViewer, supportsUi, UI_EXTENSION, VIEWER_RESOURCE } from "./viewer.ts";

declare const __VERSION__: string;
const SERVER = {
  name: "orrery",
  title: "orrery",
  version: typeof __VERSION__ === "string" ? __VERSION__ : "dev",
};

/** Per-request (modern) versions, then the initialize handshake (legacy) ones, newest first. */
const MODERN = ["2026-07-28"];
const LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_LEGACY = "2025-11-25";
export const VERSIONS = [...MODERN, ...LEGACY];
const META = "io.modelcontextprotocol/";
// The one resource is the MCP Apps viewer; the extension entry tells Apps hosts to look for it.
const CAPABILITIES = {
  tools: { listChanged: false },
  resources: { listChanged: false },
  extensions: { [UI_EXTENSION]: {} },
};

const INSTRUCTIONS =
  "orrery draws architecture, system design and business flow diagrams from a small YAML spec, with official AWS, Azure, Google Cloud, Kubernetes and GitHub icons. " +
  "Call get_authoring_guide before writing a spec, find icon ids with icons_search, run validate until it reports no errors, then render, and review the diagram at the width readers see it. " +
  "Every spec tool takes the spec as spec (its YAML text) or spec_path (an absolute path, stdio only), never both. " +
  "A result with ok false, diagnostics or a failing review is a verdict on the diagram: change the spec and call again. isError means the call itself failed.";

/** A JSON-RPC error, with the status Streamable HTTP sends it under. */
class RpcError extends Error {
  code: number;
  status: number;
  data?: unknown;
  constructor(code: number, message: string, status = 200, data?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

const SERVER_META = { [`${META}serverInfo`]: SERVER };

export const rpcError = (id: unknown, code: number, message: string, data?: unknown) => ({
  jsonrpc: "2.0",
  ...(id === undefined ? {} : { id }),
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

/** The version a modern request carries in params._meta; undefined for a legacy request. */
export function declaredVersion(params: Obj): unknown {
  return isObj(params._meta) ? params._meta[`${META}protocolVersion`] : undefined;
}

/** One usage line per call on stderr: never the arguments, which hold the user's spec. */
function logCall(tool: string, started: number, error?: "refused" | "crashed") {
  const ms = Math.round(performance.now() - started);
  process.stderr.write(
    `${JSON.stringify({ event: "tool_call", tool, ms, ok: !error, ...(error ? { error } : {}) })}\n`,
  );
}

// Calls run one at a time: a render is CPU-bound, and two would only slow each other down.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/** Each connection's requests in flight (stdio has one), and whether the client cancelled each. */
const inFlight = new WeakMap<Context, Map<unknown, boolean>>();

async function callTool(params: Obj, ctx: Context): Promise<Obj> {
  const tool = TOOLS.find((t) => t.name === params.name);
  if (!tool) throw new RpcError(-32602, `Unknown tool: ${String(params.name)}`);
  const args = params.arguments ?? {};
  if (!isObj(args)) throw new RpcError(-32602, "tools/call arguments must be an object");
  const started = performance.now();
  try {
    const unknown = Object.keys(args).filter((k) => !(k in tool.inputSchema.properties));
    if (unknown.length)
      throw new ToolError(
        `unknown argument ${unknown.join(", ")}; ${tool.name} takes ${Object.keys(tool.inputSchema.properties).join(", ") || "none"}`,
      );
    const out = await tool.run(args, ctx);
    logCall(tool.name, started);
    return Array.isArray(out) ? { content: out } : { ...out };
  } catch (e) {
    if (e instanceof ToolError) {
      logCall(tool.name, started, "refused");
      return { content: [text(e.message)], isError: true };
    }
    // The stack goes to the log; the caller gets the message.
    process.stderr.write(`orrery mcp: ${tool.name} crashed: ${(e as Error)?.stack ?? e}\n`);
    logCall(tool.name, started, "crashed");
    return {
      content: [text(`orrery ${tool.name} failed: ${(e as Error)?.message ?? e}`)],
      isError: true,
    };
  }
}

async function result(
  method: string,
  params: Obj,
  ctx: Context,
  cancelled: () => boolean,
): Promise<Obj> {
  const version = declaredVersion(params);
  const modern = version !== undefined;
  if (modern) {
    if (typeof version !== "string" || !VERSIONS.includes(version))
      throw new RpcError(-32022, "Unsupported protocol version", 400, {
        supported: VERSIONS,
        requested: version,
      });
    const meta = params._meta as Obj;
    if (!isObj(meta[`${META}clientCapabilities`]))
      throw new RpcError(-32602, `Invalid params: _meta needs ${META}clientCapabilities`, 400);
  }
  // A modern request carries the client's capabilities itself; a legacy one had them at initialize.
  const call: Context = modern
    ? { ...ctx, ui: supportsUi((params._meta as Obj)[`${META}clientCapabilities`]) }
    : ctx;
  const done = (r: Obj): Obj =>
    modern
      ? {
          resultType: "complete",
          ...r,
          _meta: { ...(isObj(r._meta) ? r._meta : {}), ...SERVER_META },
        }
      : r;
  switch (method) {
    case "initialize": {
      // Kept for the connection (stdio); over HTTP each request has its own context.
      ctx.ui = supportsUi(params.capabilities);
      const asked = params.protocolVersion;
      return {
        protocolVersion:
          typeof asked === "string" && LEGACY.includes(asked) ? asked : LATEST_LEGACY,
        capabilities: CAPABILITIES,
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      };
    }
    case "server/discover":
      return {
        resultType: "complete",
        supportedVersions: VERSIONS,
        capabilities: CAPABILITIES,
        instructions: INSTRUCTIONS,
        _meta: SERVER_META,
      };
    case "ping":
      return done({});
    case "tools/list":
      return done({ tools: TOOLS.map(({ run, ...t }) => t) });
    case "tools/call": {
      // A call cancelled while it waits never starts; dispatch drops its reply either way.
      const job = async (): Promise<Obj> => (cancelled() ? {} : callTool(params, call));
      return done(await serial(job));
    }
    case "resources/list":
      return done({ resources: [VIEWER_RESOURCE] });
    case "resources/templates/list":
      return done({ resourceTemplates: [] });
    case "resources/read": {
      const contents = readViewer(params.uri);
      // -32602 from 2026-07-28 on; earlier revisions said -32002.
      if (!contents)
        throw new RpcError(modern ? -32602 : -32002, "Resource not found", 200, {
          uri: params.uri,
        });
      return done({ contents });
    }
    default:
      throw new RpcError(-32601, `Method not found: ${method}`, modern ? 404 : 200);
  }
}

export interface Reply {
  status: number;
  body: Obj;
}

/** The reply to one message; undefined for a notification, a response or a cancelled request. */
export async function dispatch(msg: unknown, ctx: Context): Promise<Reply | undefined> {
  if (!isObj(msg) || msg.jsonrpc !== "2.0")
    return { status: 400, body: rpcError(null, -32600, "Invalid Request") };
  const { id, method } = msg;
  if (typeof method !== "string") {
    if ("result" in msg || "error" in msg) return undefined;
    return { status: 400, body: rpcError(id ?? null, -32600, "Invalid Request: no method") };
  }
  const params = isObj(msg.params) ? msg.params : {};
  const calls = inFlight.get(ctx) ?? new Map<unknown, boolean>();
  inFlight.set(ctx, calls);
  // notifications/initialized needs nothing. A request the client cancels (stdio) gets no reply,
  // and a queued call is skipped; one already running still runs to the end.
  if (!("id" in msg)) {
    if (method === "notifications/cancelled" && calls.has(params.requestId))
      calls.set(params.requestId, true);
    return undefined;
  }
  if (typeof id !== "string" && typeof id !== "number")
    return {
      status: 400,
      body: rpcError(null, -32600, "Invalid Request: id must be a string or number"),
    };
  calls.set(id, false);
  const cancelled = () => calls.get(id) === true;
  try {
    const body = { jsonrpc: "2.0", id, result: await result(method, params, ctx, cancelled) };
    return cancelled() ? undefined : { status: 200, body };
  } catch (e) {
    if (!(e instanceof RpcError)) throw e;
    if (cancelled()) return undefined;
    return { status: e.status, body: rpcError(id, e.code, e.message, e.data) };
  } finally {
    calls.delete(id);
  }
}
