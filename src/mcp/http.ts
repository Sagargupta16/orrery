// Stateless Streamable HTTP on POST /mcp at 127.0.0.1: origin check, mirrored headers, body limit.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isObj, type Obj } from "./kit.ts";
import { declaredVersion, dispatch, rpcError, VERSIONS } from "./protocol.ts";

const MAX_BODY = 16 * 1024 * 1024;
const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/i;

/** Browsers send an Origin; a page served from anywhere but this machine must not reach the server. */
function loopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (u.protocol === "http:" || u.protocol === "https:") && LOOPBACK.test(u.hostname);
  } catch {
    return false;
  }
}

class TooLarge extends Error {}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on("end", () =>
      size > MAX_BODY ? fail(new TooLarge()) : done(Buffer.concat(chunks).toString("utf8")),
    );
    req.on("error", fail);
  });
}

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return v === undefined ? undefined : String(v);
}

/** Mcp-Name carries a name that is not plain ASCII as =?base64?...?=. */
const decoded = (v: string) =>
  /^=\?base64\?(.*)\?=$/.test(v) ? Buffer.from(v.slice(9, -2), "base64").toString("utf8") : v;

/**
 * Headers a modern request mirrors from its body must match it (HeaderMismatch); a legacy request
 * may name its version in MCP-Protocol-Version (2025-06-18 on) and omits it before that.
 */
function headerProblem(req: IncomingMessage, msg: unknown): Obj | undefined {
  if (!isObj(msg) || !("id" in msg) || typeof msg.method !== "string") return undefined;
  const params = isObj(msg.params) ? msg.params : {};
  const version = declaredVersion(params);
  const sent = header(req, "mcp-protocol-version");
  if (version === undefined)
    return sent === undefined || VERSIONS.includes(sent)
      ? undefined
      : rpcError(msg.id, -32022, "Unsupported protocol version", {
          supported: VERSIONS,
          requested: sent,
        });
  const mismatch = (what: string) => rpcError(msg.id, -32020, `Header mismatch: ${what}`);
  if (sent === undefined) return mismatch("the MCP-Protocol-Version header is missing");
  if (sent !== version)
    return mismatch(`MCP-Protocol-Version ${sent} does not match the body's ${String(version)}`);
  const method = header(req, "mcp-method");
  if (method === undefined) return mismatch("the Mcp-Method header is missing");
  if (method !== msg.method) return mismatch(`Mcp-Method ${method} does not match ${msg.method}`);
  if (msg.method === "tools/call") {
    const name = header(req, "mcp-name");
    if (name === undefined) return mismatch("the Mcp-Name header is missing");
    if (decoded(name) !== params.name)
      return mismatch(`Mcp-Name ${name} does not match ${String(params.name)}`);
  }
  return undefined;
}

function respond(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleHttp(req: IncomingMessage, res: ServerResponse) {
  const origin = header(req, "origin");
  if (origin !== undefined && !loopbackOrigin(origin))
    return respond(
      res,
      403,
      rpcError(undefined, -32600, "Forbidden: requests from other origins are refused"),
    );
  if (new URL(req.url ?? "/", "http://127.0.0.1").pathname !== "/mcp") return respond(res, 404);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405);
  }
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (e) {
    if (!(e instanceof TooLarge)) throw e;
    return respond(res, 413, rpcError(undefined, -32600, "Request body is over 16 MB"));
  }
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return respond(res, 400, rpcError(undefined, -32700, "Parse error"));
  }
  if (Array.isArray(msg))
    return respond(
      res,
      400,
      rpcError(undefined, -32600, "Invalid Request: one message per POST, no batches"),
    );
  const problem = headerProblem(req, msg);
  if (problem) return respond(res, 400, problem);
  const reply = await dispatch(msg, { http: true });
  if (!reply) return respond(res, 202);
  respond(res, reply.status, reply.body);
}

export function serveHttp(port: number): Promise<void> {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      handleHttp(req, res).catch((e: unknown) => {
        process.stderr.write(`orrery mcp: ${(e as Error)?.stack ?? e}\n`);
        if (!res.headersSent) respond(res, 500, rpcError(undefined, -32603, "Internal error"));
      });
    });
    // A first render may download an icon library; never cut a request short.
    server.requestTimeout = 0;
    server.on("error", (e) => {
      process.stderr.write(`orrery mcp: cannot listen on 127.0.0.1:${port}: ${e.message}\n`);
      process.exitCode = 1;
      done();
    });
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const bound = typeof address === "object" && address ? address.port : port;
      process.stderr.write(`orrery mcp: listening on http://127.0.0.1:${bound}/mcp\n`);
    });
  });
}
