// `orrery lsp` end to end: the server runs from src/ as a child process and the tests speak the
// Language Server Protocol to it over stdio, framed by Content-Length headers. The fix and locate
// helpers get a few direct checks for the edits an editor cannot easily trigger.
import { type ChildProcess, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixesFor } from "../src/lsp/fixes.ts";
import { locate, locator } from "../src/lsp/locate.ts";
import { parseSpec } from "../src/spec/index.ts";
import type { Diagnostic } from "../src/types.ts";
import { ROOT } from "./helpers.ts";

interface Position {
  line: number;
  character: number;
}
interface Range {
  start: Position;
  end: Position;
}
interface LspDiagnostic {
  range: Range;
  severity: number;
  code: string;
  source: string;
  message: string;
}
interface Incoming {
  id?: number;
  method?: string;
  params?: { uri?: string; diagnostics?: LspDiagnostic[] };
  result?: unknown;
  error?: { code: number; message: string };
}
interface TextEdit {
  range: Range;
  newText: string;
}
interface CodeAction {
  title: string;
  kind: string;
  isPreferred: boolean;
  edit: { changes: Record<string, TextEdit[]> };
}

const MAIN = join(ROOT, "src", "main.ts");
const uriOf = (name: string) => pathToFileURL(join(tmpdir(), "orrery-lsp", name)).href;
const SHOP = uriOf("shop.yaml");
const SHOP_TEXT = `title: Shop
groups:
  vpc: { type: aws:vpc }
nodes:
  web: { icon: aws:cloudfront, label: CDN }
  api: { icon: aws:lamda, label: API, in: vpc }
  db: aws:dynamodb
  lone: { icon: aws:s3, label: Uploads }
edges:
  - web -> api
  - api -> db
`;

let child: ChildProcess;
let stderr = "";
let pending = Buffer.alloc(0);
let nextId = 1;
const replies = new Map<number, (msg: Incoming) => void>();
const notes: Incoming[] = [];
let noteWaiters: (() => void)[] = [];
let exited: Promise<number | null>;

beforeAll(() => {
  child = spawn(process.execPath, [MAIN, "lsp"], { stdio: ["pipe", "pipe", "pipe"] });
  exited = new Promise((resolve) => child.once("exit", resolve));
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      const end = pending.indexOf("\r\n\r\n");
      if (end < 0) break;
      const length = Number(/Content-Length: (\d+)/.exec(pending.subarray(0, end).toString())?.[1]);
      if (pending.length < end + 4 + length) break;
      const msg = JSON.parse(pending.subarray(end + 4, end + 4 + length).toString("utf8"));
      pending = pending.subarray(end + 4 + length);
      if (msg.id !== undefined && !msg.method) {
        replies.get(msg.id)?.(msg);
        replies.delete(msg.id);
      } else {
        notes.push(msg);
        for (const wake of noteWaiters) wake();
        noteWaiters = [];
      }
    }
  });
});

afterAll(() => {
  if (child.exitCode === null) child.kill();
});

function write(msg: object) {
  const body = JSON.stringify({ jsonrpc: "2.0", ...msg });
  child.stdin?.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function request<T = unknown>(method: string, params?: unknown): Promise<T> {
  const id = nextId++;
  write({ id, method, params });
  return new Promise((resolve, reject) =>
    replies.set(id, (msg) =>
      msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result as T),
    ),
  );
}

const notify = (method: string, params?: unknown) => write({ method, params });

/** The first diagnostics published for `uri`, from index `from` on, that pass `test`. */
async function diagnosticsFor(
  uri: string,
  test: (list: LspDiagnostic[]) => boolean,
  from = 0,
): Promise<{ list: LspDiagnostic[]; index: number }> {
  for (let seen = from; ; ) {
    for (; seen < notes.length; seen++) {
      const n = notes[seen];
      if (n?.method !== "textDocument/publishDiagnostics" || n.params?.uri !== uri) continue;
      const list = n.params.diagnostics ?? [];
      if (test(list)) return { list, index: seen + 1 };
    }
    await new Promise<void>((wake) => noteWaiters.push(wake));
  }
}

const codes = (list: LspDiagnostic[]) => list.map((d) => d.code);

function applyEdits(text: string, edits: TextEdit[]): string {
  const lines = text.split("\n");
  const offset = (p: Position) =>
    lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
  let out = text;
  for (const e of [...edits].sort((a, b) => offset(b.range.start) - offset(a.range.start)))
    out = out.slice(0, offset(e.range.start)) + e.newText + out.slice(offset(e.range.end));
  return out;
}

describe("orrery lsp over stdio", () => {
  let shopText = SHOP_TEXT;
  let after = 0;
  let unknownIcon: LspDiagnostic | undefined;

  it("answers initialize with its capabilities", async () => {
    const result = await request<{ capabilities: Record<string, unknown>; serverInfo: object }>(
      "initialize",
      { processId: null, rootUri: null, capabilities: {} },
    );
    expect(result.capabilities).toMatchObject({
      textDocumentSync: { openClose: true, change: 2 },
      hoverProvider: true,
      documentSymbolProvider: true,
      codeActionProvider: { codeActionKinds: ["quickfix"] },
      completionProvider: { triggerCharacters: [":", " "] },
    });
    expect(result.serverInfo).toMatchObject({ name: "orrery" });
    notify("initialized", {});
  });

  it("reports an unknown icon on the characters of its id, with the fixes in the message", async () => {
    notify("textDocument/didOpen", {
      textDocument: { uri: SHOP, languageId: "yaml", version: 1, text: shopText },
    });
    const { list, index } = await diagnosticsFor(SHOP, (l) => l.length > 0);
    after = index;
    unknownIcon = list.find((d) => d.code === "DG101");
    const line = shopText.split("\n")[5] ?? "";
    expect(line).toContain("aws:lamda");
    expect(unknownIcon).toMatchObject({
      severity: 1,
      source: "orrery",
      range: {
        start: { line: 5, character: line.indexOf("aws:lamda") },
        end: { line: 5, character: line.indexOf("aws:lamda") + "aws:lamda".length },
      },
    });
    expect(unknownIcon?.message).toContain('node "api" uses unknown icon "aws:lamda"');
    expect(unknownIcon?.message).toContain('fix: use icon "aws:lambda"');
  });

  it("offers the icon suggestion as a quick fix that makes the spec valid", async () => {
    const actions = await request<CodeAction[]>("textDocument/codeAction", {
      textDocument: { uri: SHOP },
      range: unknownIcon?.range,
      context: { diagnostics: [unknownIcon] },
    });
    const fix = actions.find((a) => a.title === 'use icon "aws:lambda"');
    expect(fix).toMatchObject({ kind: "quickfix", isPreferred: true });
    const edits = fix?.edit.changes[SHOP] ?? [];
    expect(edits).toEqual([{ range: unknownIcon?.range, newText: "aws:lambda" }]);
    const fixed = applyEdits(shopText, edits);
    expect(parseSpec(fixed).diagnostics.filter((d) => d.severity === "error")).toEqual([]);

    // The editor applies it as an incremental change; the error goes at once, and layout's
    // warnings follow once the typing has stopped.
    notify("textDocument/didChange", {
      textDocument: { uri: SHOP, version: 2 },
      contentChanges: edits.map((e) => ({ range: e.range, text: e.newText })),
    });
    shopText = fixed;
    const parsed = await diagnosticsFor(SHOP, (l) => !codes(l).includes("DG101"), after);
    const laidOut = await diagnosticsFor(SHOP, (l) => codes(l).includes("DG208"), parsed.index);
    after = laidOut.index;
    const lone = laidOut.list.find((d) => d.code === "DG208");
    expect(lone?.severity).toBe(2);
    expect(lone?.message).toContain('node "lone" has no connections');
    expect(lone?.range.start).toEqual({ line: 7, character: 2 });
  });

  it("completes icon ids ranked by search, group types, ids and top-level keys", async () => {
    const uri = uriOf("typing.yaml");
    const text =
      "groups:\n  vpc:\n    type: aws:vp\nnodes:\n  fn:\n    icon: aws:lam\n    in: v\nedges:\n  - fn -> \n";
    notify("textDocument/didOpen", { textDocument: { uri, languageId: "yaml", version: 1, text } });
    type List = { isIncomplete: boolean; items: { label: string; textEdit: TextEdit }[] };
    const at = (line: number, character: number) =>
      request<List>("textDocument/completion", {
        textDocument: { uri },
        position: { line, character },
      });
    const icons = await at(5, "    icon: aws:lam".length);
    expect(icons.isIncomplete).toBe(true);
    expect(icons.items[0]?.label).toBe("aws:lambda");
    expect(icons.items[0]?.textEdit).toEqual({
      range: { start: { line: 5, character: 10 }, end: { line: 5, character: 17 } },
      newText: "aws:lambda",
    });
    expect((await at(2, "    type: aws:vp".length)).items[0]?.label).toBe("aws:vpc");
    expect((await at(6, "    in: v".length)).items.map((i) => i.label)).toEqual(["vpc"]);
    expect((await at(8, "  - fn -> ".length)).items.map((i) => i.label)).toEqual(["fn", "vpc"]);
    const keys = (await at(9, 0)).items.map((i) => i.label);
    expect(keys).toContain("title");
    expect(keys).not.toContain("nodes");
  });

  it("shows an icon's official name, pack and category on hover", async () => {
    const line = shopText.split("\n")[5] ?? "";
    const hover = await request<{ contents: { kind: string; value: string }; range: Range }>(
      "textDocument/hover",
      { textDocument: { uri: SHOP }, position: { line: 5, character: line.indexOf("lambda") } },
    );
    expect(hover.contents.kind).toBe("markdown");
    expect(hover.contents.value).toContain("**AWS Lambda** `aws:lambda`");
    expect(hover.contents.value).toContain("Pack: AWS Architecture Icons");
    expect(hover.contents.value).toContain("Category: Compute");
    expect(hover.range.start.character).toBe(line.indexOf("aws:lambda"));
  });

  it("lists groups and nodes as document symbols", async () => {
    type Sym = { name: string; children?: Sym[]; selectionRange: Range };
    const symbols = await request<Sym[]>("textDocument/documentSymbol", {
      textDocument: { uri: SHOP },
    });
    expect(symbols.map((s) => [s.name, s.children?.map((c) => c.name)])).toEqual([
      ["groups", ["vpc"]],
      ["nodes", ["web", "api", "db", "lone"]],
    ]);
    expect(symbols[1]?.children?.[1]?.selectionRange.start).toEqual({ line: 5, character: 2 });
  });

  it("leaves YAML that is not a spec alone", async () => {
    const uri = uriOf("deploy.yaml");
    notify("textDocument/didOpen", {
      textDocument: { uri, languageId: "yaml", version: 1, text: "kind: Deployment\nspec: {}\n" },
    });
    const { list } = await diagnosticsFor(uri, () => true);
    expect(list).toEqual([]);
    expect(
      await request("textDocument/hover", {
        textDocument: { uri },
        position: { line: 0, character: 0 },
      }),
    ).toBeNull();
  });

  it("shuts down and exits with code 0", async () => {
    expect(await request("shutdown")).toBeNull();
    notify("exit");
    expect(await exited).toBe(0);
    expect(stderr).toBe("");
  });
});

describe("lsp fixes", () => {
  const fixOf = (text: string, d: Diagnostic) => {
    const at = locator(text);
    const t = locate(at, d);
    return { t, fixes: fixesFor(text, d, t) };
  };
  const apply = (text: string, edits: { start: number; end: number; text: string }[]) =>
    edits.reduceRight((s, e) => s.slice(0, e.start) + e.text + s.slice(e.end), text);

  it("renames an unknown key and keeps its quotes", () => {
    const text = 'nodes:\n  a: { icon: aws:s3, "lable": Store }\n';
    const [d] = parseSpec(text).diagnostics;
    expect(d?.code).toBe("DG108");
    const { fixes } = fixOf(text, d as Diagnostic);
    expect(fixes.map((f) => f.title)).toEqual(['rename "lable" to "label"']);
    expect(apply(text, fixes[0]?.edits ?? [])).toBe(
      'nodes:\n  a: { icon: aws:s3, "label": Store }\n',
    );
  });

  it("replaces an unknown id inside an edge line, and nothing else", () => {
    const text = "nodes:\n  api: aws:lambda\n  db: aws:rds\nedges:\n  - api -> dbs: SQL\n";
    const d = parseSpec(text).diagnostics.find((x) => x.code === "DG106") as Diagnostic;
    const { t, fixes } = fixOf(text, d);
    expect(text.slice(t.start, t.end)).toBe("dbs");
    expect(apply(text, fixes[0]?.edits ?? [])).toContain("  - api -> db: SQL\n");
  });

  it("sets a top-level setting for a layout finding the way orrery patch does", () => {
    const text =
      "title: Shop\n# the services\nnodes:\n  a: aws:s3\n  b: aws:rds\nedges:\n  - a -> b\n";
    const d: Diagnostic = {
      code: "DG205",
      severity: "warning",
      message: "the diagram is very wide",
      fixes: ["use direction: down", "try layout: { layering: simplex }"],
    };
    const { fixes } = fixOf(text, d);
    expect(fixes.map((f) => f.title)).toEqual(d.fixes);
    expect(apply(text, fixes[0]?.edits ?? [])).toBe(
      // A comment directly above a section belongs to it, so the new key goes above both.
      "title: Shop\ndirection: down\n# the services\nnodes:\n  a: aws:s3\n  b: aws:rds\nedges:\n  - a -> b\n",
    );
  });

  it("places a layout finding about edge e2 on the list item that made it", () => {
    const text =
      "nodes:\n  a: aws:s3\n  b: aws:rds\n  c: aws:sqs\nedges:\n  - a -> b\n  - b -> c\n";
    const d: Diagnostic = {
      code: "DG201",
      severity: "warning",
      message: "edge crosses a node",
      subject: { edge: "e2", from: "b", to: "c", node: "a" },
    };
    const { t } = fixOf(text, d);
    expect(text.slice(t.start, t.end)).toBe("b -> c");
  });
});
