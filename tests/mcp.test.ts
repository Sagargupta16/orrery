// `orrery mcp` end to end: the server runs from src/ as a child process and the tests speak
// JSON-RPC to it, over stdio and over Streamable HTTP on a free loopback port.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { inflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXAMPLES_DIR, PNG_SIGNATURE, ROOT } from "./helpers.ts";

interface Content {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}
interface ToolResult {
  content: Content[];
  isError?: boolean;
}
interface Response {
  id?: number | string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: Record<string, unknown> };
}

const MAIN = join(ROOT, "src", "main.ts");
const STARTER = join(EXAMPLES_DIR, "starter.yaml");
const STARTER_TEXT = readFileSync(STARTER, "utf8");
// Spec text the logs must never repeat.
const MARKER = "zebra-marker-5521";
const MARKED = `nodes:\n  a: { icon: aws:lambda, label: ${MARKER} }\n  b: { icon: aws:s3, label: Store }\nedges:\n  - a -> b\n`;
const MODERN = "2026-07-28";
const meta = {
  "io.modelcontextprotocol/protocolVersion": MODERN,
  "io.modelcontextprotocol/clientCapabilities": {},
};

const TOOL_NAMES = [
  "get_authoring_guide",
  "validate",
  "render",
  "review",
  "icons_search",
  "list_templates",
  "get_template",
  "try_patches",
  "drawio_link",
];

const textOf = (r: ToolResult, i = 0) => r.content[i]?.text ?? "";
const jsonOf = <T = Record<string, unknown>>(r: ToolResult, i = 0) => JSON.parse(textOf(r, i)) as T;
const isPng = (c?: Content) =>
  c?.type === "image" &&
  c.mimeType === "image/png" &&
  [...Buffer.from(c.data ?? "", "base64").subarray(0, 8)].join() === PNG_SIGNATURE.join();

let dir = "";

// ---------------------------------------------------------------- stdio

let child: ChildProcess;
let stderr = "";
const waiting = new Map<number, (r: Response) => void>();
let nextId = 1;

function rpc(method: string, params?: unknown): Promise<Response> {
  const id = nextId++;
  child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve) => waiting.set(id, resolve));
}

async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const r = await rpc("tools/call", { name, arguments: args });
  if (!r.result) throw new Error(`tools/call ${name}: ${JSON.stringify(r.error)}`);
  return r.result as unknown as ToolResult;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "orrery-mcp-"));
  child = spawn(process.execPath, [MAIN, "mcp"], { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  createInterface({ input: child.stdout as NodeJS.ReadableStream }).on("line", (line) => {
    const msg = JSON.parse(line) as Response;
    waiting.get(Number(msg.id))?.(msg);
    waiting.delete(Number(msg.id));
  });
});

afterAll(async () => {
  child.stdin?.end();
  await new Promise((resolve) => child.once("close", resolve));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("mcp over stdio", () => {
  it("answers initialize with the client's version, or its latest handshake version", async () => {
    const asked = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    expect(asked.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "orrery" },
    });
    expect(String(asked.result?.instructions)).toContain("get_authoring_guide");
    expect(asked.result).not.toHaveProperty("resultType");
    child.stdin?.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );
    const unknown = await rpc("initialize", { protocolVersion: "1999-01-01", capabilities: {} });
    expect(unknown.result?.protocolVersion).toBe("2025-11-25");
  });

  it("serves modern requests from their _meta and refuses versions it does not speak", async () => {
    const discover = await rpc("server/discover", { _meta: meta });
    expect(discover.result).toMatchObject({ resultType: "complete", capabilities: { tools: {} } });
    expect(discover.result?.supportedVersions).toEqual([
      MODERN,
      "2025-11-25",
      "2025-06-18",
      "2025-03-26",
      "2024-11-05",
    ]);
    const list = await rpc("tools/list", { _meta: meta });
    expect(list.result?.resultType).toBe("complete");
    expect(list.result?._meta).toEqual({
      "io.modelcontextprotocol/serverInfo": expect.objectContaining({ name: "orrery" }),
    });
    const old = await rpc("tools/list", {
      _meta: { ...meta, "io.modelcontextprotocol/protocolVersion": "1900-01-01" },
    });
    expect(old.error?.code).toBe(-32022);
    expect(old.error?.data).toMatchObject({
      requested: "1900-01-01",
      supported: expect.any(Array),
    });
    const noCaps = await rpc("tools/list", {
      _meta: { "io.modelcontextprotocol/protocolVersion": MODERN },
    });
    expect(noCaps.error?.code).toBe(-32602);
    expect((await rpc("resources/list")).error?.code).toBe(-32601);
  });

  it("lists the nine tools, read-only ones marked", async () => {
    const tools = (await rpc("tools/list")).result?.tools as {
      name: string;
      inputSchema: { type: string };
      annotations?: { readOnlyHint?: boolean };
    }[];
    expect(tools.map((t) => t.name)).toEqual(TOOL_NAMES);
    for (const t of tools) expect(t.inputSchema.type).toBe("object");
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly).toEqual(TOOL_NAMES.filter((n) => n !== "render"));
  });

  it("get_authoring_guide returns the skill and the spec reference", async () => {
    const r = await call("get_authoring_guide", {});
    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toContain("===== SKILL.md =====");
    expect(textOf(r)).toContain("===== references/spec.md =====");
    const review = await call("get_authoring_guide", { topic: "review" });
    expect(textOf(review)).toContain("references/review/loop.md");
  });

  it("validate reports a clean spec and a broken one as normal results", async () => {
    const good = await call("validate", { spec_path: STARTER });
    expect(good.isError).toBeFalsy();
    expect(jsonOf(good)).toMatchObject({ ok: true, errors: 0, stats: { nodes: 6, groups: 3 } });
    const bad = await call("validate", { spec: "nodes:\n  f: { icon: aws:lamda }\n" });
    expect(bad.isError).toBeFalsy();
    const verdict = jsonOf<{ ok: boolean; diagnostics: { code: string; fixes?: string[] }[] }>(bad);
    expect(verdict.ok).toBe(false);
    expect(verdict.diagnostics.length).toBeGreaterThan(0);
    expect(verdict.diagnostics[0]?.fixes?.join(" ")).toContain("aws:lambda");
  });

  it("render returns the SVG as text and the PNG as an image", async () => {
    const r = await call("render", { spec: STARTER_TEXT, name: "starter", scale: 1 });
    expect(r.isError).toBeFalsy();
    const receipt = jsonOf<{
      ok: boolean;
      outputs: { file: string; format: string; content: number }[];
    }>(r);
    expect(receipt.ok).toBe(true);
    expect(receipt.outputs.map((o) => o.file)).toEqual(["starter.svg", "starter.png"]);
    const svg = receipt.outputs.find((o) => o.format === "svg");
    const image = receipt.outputs.find((o) => o.format === "png");
    expect(textOf(r, svg?.content)).toMatch(/^<svg /);
    expect(isPng(r.content[image?.content ?? -1])).toBe(true);
  });

  it("render with out_dir writes the files and returns their paths", async () => {
    const out = join(dir, "out");
    const r = await call("render", {
      spec_path: STARTER,
      formats: ["svg", "drawio"],
      theme: "both",
      out_dir: out,
    });
    const paths = jsonOf<{ outputs: { path: string }[] }>(r).outputs.map((o) => o.path);
    expect(paths).toEqual(
      ["starter-light.svg", "starter-light.drawio", "starter-dark.svg", "starter-dark.drawio"].map(
        (f) => join(out, f),
      ),
    );
    for (const p of paths) expect(existsSync(p)).toBe(true);
    expect(r.content).toHaveLength(1);
  });

  it("review returns the report and the reader's PNG", async () => {
    const r = await call("review", { spec_path: STARTER, width: 880 });
    expect(r.isError).toBeFalsy();
    const report = jsonOf<{ width: number; score: number; pass: boolean; dimensions: object }>(r);
    expect(report.width).toBe(880);
    expect(report.score).toBeGreaterThan(0);
    expect(Object.keys(report.dimensions)).toContain("overlap");
    expect(isPng(r.content[1])).toBe(true);
  });

  it("icons_search finds official icons", async () => {
    const r = await call("icons_search", { words: "lambda", pack: "aws", limit: 5 });
    const ids = jsonOf<{ id: string }[]>(r).map((i) => i.id);
    expect(ids).toContain("aws:lambda");
    expect(ids.length).toBeLessThanOrEqual(5);
  });

  it("list_templates and get_template hand out the bundled examples", async () => {
    const list = jsonOf<{ name: string; title?: string }[]>(await call("list_templates", {}));
    expect(list).toContainEqual(
      expect.objectContaining({ name: "starter", title: "Web app on AWS" }),
    );
    const r = await call("get_template", { name: "starter" });
    expect(textOf(r)).toBe(STARTER_TEXT);
    const local = await call("get_template", { name: "local-icons-order-desk" });
    expect(textOf(local, 1)).toContain("spec_path");
    const missing = await call("get_template", { name: "../package" });
    expect(missing.isError).toBe(true);
  });

  it("try_patches scores each candidate and returns the best spec", async () => {
    const r = await call("try_patches", {
      spec_path: STARTER,
      candidates: [
        [{ op: "set", path: "direction", value: "down" }],
        [{ op: "set", path: "nodes.nope.label", value: "x" }],
        [{ op: "unset", path: "layout" }],
      ],
    });
    expect(r.isError).toBeFalsy();
    const summary = jsonOf<{
      before: { score: number };
      results: { index: number; kept: boolean; score?: number; reason: string }[];
      best: number | null;
    }>(r);
    expect(summary.results.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(typeof summary.before.score).toBe("number");
    // An op that cannot apply drops its candidate; it is a verdict, not a failed call.
    expect(summary.results[1]).toMatchObject({
      kept: false,
      reason: expect.stringContaining("nope"),
    });
    if (summary.best === null) expect(r.content).toHaveLength(1);
    else {
      expect(summary.results[summary.best]?.kept).toBe(true);
      expect(textOf(r, 1)).toContain("nodes:");
    }
  });

  it("drawio_link carries the draw.io file in the link", async () => {
    const r = await call("drawio_link", { spec_path: STARTER });
    const link = textOf(r);
    expect(link.startsWith("https://app.diagrams.net/#create=")).toBe(true);
    const payload = JSON.parse(decodeURIComponent(link.split("#create=")[1] ?? "")) as {
      data: string;
    };
    const xml = decodeURIComponent(inflateRawSync(Buffer.from(payload.data, "base64")).toString());
    expect(xml.startsWith("<mxfile")).toBe(true);
  });

  it("refuses bad inputs as tool errors and unknown tools as protocol errors", async () => {
    const both = await call("validate", { spec: STARTER_TEXT, spec_path: STARTER });
    expect(both.isError).toBe(true);
    expect(textOf(both)).toMatch(/exactly one/);
    const none = await call("render", {});
    expect(none.isError).toBe(true);
    const missing = await call("validate", { spec_path: join(dir, "nope.yaml") });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toMatch(/not found/);
    const relativePath = await call("review", { spec_path: "diagram.yaml" });
    expect(textOf(relativePath)).toMatch(/absolute/);
    const typo = await call("render", { spec: STARTER_TEXT, format: ["svg"] });
    expect(textOf(typo)).toMatch(/unknown argument format/);
    const badFormat = await call("render", { spec: STARTER_TEXT, formats: ["gif"] });
    expect(badFormat.isError).toBe(true);
    const unknown = await rpc("tools/call", { name: "draw", arguments: {} });
    expect(unknown.error?.code).toBe(-32602);
  });

  it("logs one line per call on stderr, without the spec", async () => {
    await call("validate", { spec: MARKED });
    await call("render", { spec: MARKED, spec_path: STARTER });
    const lines = stderr
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.length).toBeGreaterThanOrEqual(10);
    for (const l of lines) {
      expect(l.event).toBe("tool_call");
      expect(Object.keys(l).sort()).toEqual(expect.arrayContaining(["event", "ms", "ok", "tool"]));
      expect(l).not.toHaveProperty("arguments");
    }
    expect(lines.at(-1)).toMatchObject({ tool: "render", ok: false, error: "refused" });
    expect(stderr).not.toContain(MARKER);
  });
});

// ---------------------------------------------------------------- HTTP

let server: ChildProcess;
let url = "";

const post = async (body: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, json: text ? (JSON.parse(text) as Response) : undefined };
};

/** A modern request with the headers Streamable HTTP mirrors from the body. */
const modern = (
  method: string,
  params: Record<string, unknown> = {},
  extra: Record<string, string> = {},
) =>
  post(
    { jsonrpc: "2.0", id: 7, method, params: { ...params, _meta: meta } },
    {
      "mcp-protocol-version": MODERN,
      "mcp-method": method,
      ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
      ...extra,
    },
  );

describe("mcp over HTTP", () => {
  beforeAll(async () => {
    server = spawn(process.execPath, [MAIN, "mcp", "--port", "0"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    url = await new Promise<string>((resolve, reject) => {
      let log = "";
      const timer = setTimeout(() => reject(new Error(`no listening line: ${log}`)), 20_000);
      server.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
        log += chunk;
        const m = log.match(/listening on (http:\/\/127\.0\.0\.1:\d+\/mcp)/);
        if (m?.[1]) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
    });
  });

  afterAll(() => {
    server?.kill();
  });

  it("answers a legacy handshake and takes notifications with 202", async () => {
    const init = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "t", version: "0" },
      },
    });
    expect(init.status).toBe(200);
    expect(init.json?.result?.protocolVersion).toBe("2025-03-26");
    const note = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(note).toEqual({ status: 202, json: undefined });
    const list = await post(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { "mcp-protocol-version": "2025-06-18" },
    );
    expect(list.json?.result?.tools).toHaveLength(TOOL_NAMES.length);
  });

  it("runs a modern tool call with spec text", async () => {
    const r = await modern("tools/call", { name: "validate", arguments: { spec: STARTER_TEXT } });
    expect(r.status).toBe(200);
    expect(r.json?.result?.resultType).toBe("complete");
    const result = r.json?.result as unknown as ToolResult;
    expect(jsonOf(result).ok).toBe(true);
  });

  it("refuses paths, out_dir and icon files over HTTP", async () => {
    const tool = async (name: string, args: Record<string, unknown>) =>
      (await modern("tools/call", { name, arguments: args })).json?.result as unknown as ToolResult;
    const path = await tool("validate", { spec_path: STARTER });
    expect(path.isError).toBe(true);
    expect(textOf(path)).toMatch(/refused over HTTP/);
    const out = await tool("render", { spec: STARTER_TEXT, out_dir: tmpdir() });
    expect(textOf(out)).toMatch(/out_dir is refused/);
    const icons = await tool("render", {
      spec: `icons: { x: ./x.svg }\nnodes:\n  a: { icon: local:x }\n`,
    });
    expect(textOf(icons)).toMatch(/refused over HTTP/);
  });

  it("checks the mirrored headers and the version", async () => {
    const missing = await post({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: { _meta: meta },
    });
    expect(missing.status).toBe(400);
    expect(missing.json?.error?.code).toBe(-32020);
    const wrongName = await modern(
      "tools/call",
      { name: "validate", arguments: {} },
      { "mcp-name": "render" },
    );
    expect(wrongName.json?.error?.code).toBe(-32020);
    const encoded = await modern(
      "tools/call",
      { name: "list_templates", arguments: {} },
      { "mcp-name": `=?base64?${Buffer.from("list_templates").toString("base64")}?=` },
    );
    expect(encoded.status).toBe(200);
    const old = await post(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "ping",
        params: { _meta: { ...meta, "io.modelcontextprotocol/protocolVersion": "1900-01-01" } },
      },
      { "mcp-protocol-version": "1900-01-01", "mcp-method": "ping" },
    );
    expect(old.status).toBe(400);
    expect(old.json?.error?.code).toBe(-32022);
    const legacyBad = await post(
      { jsonrpc: "2.0", id: 5, method: "ping" },
      { "mcp-protocol-version": "1900-01-01" },
    );
    expect(legacyBad.status).toBe(400);
    const unknown = await modern("prompts/list");
    expect(unknown.status).toBe(404);
    expect(unknown.json?.error?.code).toBe(-32601);
  });

  it("returns 405, 404, 403, 400 and 413 where the transport says so", async () => {
    const get = await fetch(url);
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    expect((await fetch(url, { method: "DELETE" })).status).toBe(405);
    expect(
      (await fetch(url.replace(/\/mcp$/, "/other"), { method: "POST", body: "{}" })).status,
    ).toBe(404);
    const ping = { jsonrpc: "2.0", id: 6, method: "ping" };
    expect((await post(ping, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post(ping, { origin: "http://localhost:5173" })).status).toBe(200);
    const bad = await post("{not json");
    expect(bad.status).toBe(400);
    expect(bad.json?.error?.code).toBe(-32700);
    expect((await post([ping])).status).toBe(400);
    const big = await post(`"${"x".repeat(16 * 1024 * 1024 + 10)}"`);
    expect(big.status).toBe(413);
  });
});
