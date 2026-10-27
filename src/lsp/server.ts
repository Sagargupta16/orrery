// The language server: the documents as the editor holds them, diagnostics published on every
// change (parseSpec at once, layout's checkScene warnings once typing stops for 300 ms), and the
// requests. Only YAML with a top-level `nodes:` is treated as a spec; other YAML gets nothing.
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../cli/help.ts";
import { renderFailure } from "../cli/io.ts";
import { renderModel } from "../render/index.ts";
import { parseSpec } from "../spec/index.ts";
import { isObj } from "../spec/values.ts";
import type { Diagnostic, Model } from "../types.ts";
import { complete, type Ids } from "./complete.ts";
import { fixesFor } from "./fixes.ts";
import { hover } from "./hover.ts";
import { locate, locator, type Target } from "./locate.ts";
import type { Message } from "./rpc.ts";
import { documentSymbols } from "./symbols.ts";
import { applyChange, lineStarts, offsetAt, type Position, type Range, rangeOf } from "./text.ts";

export const LAYOUT_DELAY_MS = 300;

interface Doc {
  uri: string;
  version: number;
  text: string;
  /** The path parseSpec resolves `icons:` files against; a stand-in for an unsaved document. */
  path: string;
  /** parseSpec's findings on the current text. */
  parsed: Diagnostic[];
  model?: Model;
  /** checkScene's warnings from the last layout, placed again on each new text until the next. */
  layout: Diagnostic[];
  /** What was last published, with the characters each finding is about, for code actions. */
  placed: { d: Diagnostic; t: Target }[];
  ids: Ids;
  timer?: NodeJS.Timeout;
}

/** The parameters of the methods served, all optional: a client may send any of them wrong. */
interface Params {
  textDocument?: { uri?: string; version?: number; text?: string };
  position?: Position;
  range?: Range;
  context?: { only?: string[] };
  contentChanges?: { range?: Range; text: string }[];
}

const ORIGIN: Position = { line: 0, character: 0 };

const isSpec = (text: string) => /^["']?nodes["']?\s*:/m.test(text);

function pathOf(uri: string): string {
  try {
    if (uri.startsWith("file:")) return fileURLToPath(uri);
  } catch {}
  return "diagram.yaml";
}

/** Node and group ids as the YAML has them, valid spec or not. */
function idsOf(data: Record<string, unknown>): Ids {
  const ids = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.flatMap((x) => {
          if (!isObj(x)) return [];
          if (typeof x.id === "string") return [x.id];
          const keys = Object.keys(x);
          return keys.length === 1 ? keys : [];
        })
      : isObj(v)
        ? Object.keys(v)
        : [];
  return { nodes: ids(data.nodes), groups: ids(data.groups) };
}

function toLsp(d: Diagnostic, t: Target, starts: number[]) {
  const fixes = (d.fixes ?? []).map((f) => `\nfix: ${f}`).join("");
  return {
    range: rangeOf(starts, t),
    severity: d.severity === "error" ? 1 : 2,
    code: d.code,
    source: "orrery",
    message: `${d.message}${fixes}`,
  };
}

export interface Server {
  /** Answers one message; every handler is synchronous, so replies keep the order of requests. */
  handle(msg: unknown): void;
  /** The exit code the protocol asks for: 0 after a shutdown request, 1 otherwise. */
  exitCode(): number;
  close(): void;
}

/** A server that writes every response and notification with `send`, and calls `exit` once. */
export function createServer(send: (msg: unknown) => void, exit: (code: number) => void): Server {
  const docs = new Map<string, Doc>();
  let initialized = false;
  let shutdown = false;
  let closed = false;
  const notify = (method: string, params: unknown) => {
    if (!closed) send({ jsonrpc: "2.0", method, params });
  };

  function publish(doc: Doc) {
    const at = locator(doc.text);
    const ids = idsOf(at.data);
    // Half-typed YAML keeps the ids of the last text that had some.
    if (ids.nodes.length || ids.groups.length || !at.doc.errors.length) doc.ids = ids;
    const starts = lineStarts(doc.text);
    doc.placed = [...doc.parsed, ...doc.layout].map((d) => ({ d, t: locate(at, d) }));
    notify("textDocument/publishDiagnostics", {
      uri: doc.uri,
      version: doc.version,
      diagnostics: doc.placed.map(({ d, t }) => toLsp(d, t, starts)),
    });
  }

  async function runLayout(doc: Doc, version: number) {
    const model = doc.model;
    if (!model) return;
    let found: Diagnostic[];
    try {
      const name = basename(doc.path).replace(/\.(ya?ml|json)$/i, "");
      found = (await renderModel({ model, formats: [], themes: [model.theme], name })).diagnostics;
    } catch (e) {
      const failure = renderFailure(e);
      if (!failure) {
        process.stderr.write(`orrery lsp: layout failed: ${(e as Error)?.stack ?? e}\n`);
        return;
      }
      found = [failure];
    }
    // A newer text has its own run coming.
    if (closed || docs.get(doc.uri) !== doc || doc.version !== version) return;
    doc.layout = found;
    publish(doc);
  }

  function analyze(doc: Doc, opened = false) {
    clearTimeout(doc.timer);
    doc.model = undefined;
    doc.parsed = [];
    if (!isSpec(doc.text)) {
      // Other YAML is never parsed: an empty list on open, and once when a spec stops being one.
      doc.layout = [];
      if (opened || doc.placed.length) {
        doc.placed = [];
        notify("textDocument/publishDiagnostics", {
          uri: doc.uri,
          version: doc.version,
          diagnostics: [],
        });
      }
      return;
    }
    try {
      const result = parseSpec(doc.text, doc.path);
      doc.parsed = result.diagnostics;
      doc.model = result.model;
    } catch (e) {
      process.stderr.write(`orrery lsp: parse failed: ${(e as Error)?.stack ?? e}\n`);
    }
    if (!doc.model) doc.layout = [];
    publish(doc);
    const version = doc.version;
    if (doc.model) doc.timer = setTimeout(() => void runLayout(doc, version), LAYOUT_DELAY_MS);
  }

  /** The document a request names, when it is a spec. */
  const specDoc = (p: Params): Doc | undefined => {
    const doc = docs.get(p.textDocument?.uri ?? "");
    return doc && isSpec(doc.text) ? doc : undefined;
  };

  function codeActions(p: Params) {
    const doc = specDoc(p);
    if (!doc) return [];
    const only = p.context?.only;
    // A kind asks for itself and the kinds below it; "" asks for every kind.
    if (only && !only.some((k) => k === "" || k === "quickfix")) return [];
    const starts = lineStarts(doc.text);
    const range = p.range ?? { start: ORIGIN, end: ORIGIN };
    const a = offsetAt(doc.text, starts, range.start);
    const b = offsetAt(doc.text, starts, range.end);
    const actions: unknown[] = [];
    for (const { d, t } of doc.placed) {
      if (t.start > b || t.end < a) continue;
      for (const [i, fix] of fixesFor(doc.text, d, t).entries())
        actions.push({
          title: fix.title,
          kind: "quickfix",
          diagnostics: [toLsp(d, t, starts)],
          isPreferred: i === 0,
          edit: {
            changes: {
              [doc.uri]: fix.edits.map((e) => ({ range: rangeOf(starts, e), newText: e.text })),
            },
          },
        });
    }
    return actions;
  }

  const requests: Record<string, (p: Params) => unknown> = {
    initialize: () => {
      initialized = true;
      return {
        capabilities: {
          positionEncoding: "utf-16",
          // Incremental: the editor sends only the changed ranges (a full text is read too).
          textDocumentSync: { openClose: true, change: 2 },
          completionProvider: { triggerCharacters: [":", " "] },
          hoverProvider: true,
          codeActionProvider: { codeActionKinds: ["quickfix"] },
          documentSymbolProvider: true,
        },
        serverInfo: { name: "orrery", version: VERSION },
      };
    },
    shutdown: () => {
      shutdown = true;
      return null;
    },
    "textDocument/completion": (p) => {
      const doc = specDoc(p);
      if (!doc) return { isIncomplete: false, items: [] };
      const present = [...doc.text.matchAll(/^([A-Za-z$][\w$-]*)\s*:/gm)].map((m) => m[1] ?? "");
      return complete(doc.text, p.position ?? ORIGIN, doc.ids, present);
    },
    "textDocument/hover": (p) => {
      const doc = specDoc(p);
      return doc ? hover(doc.text, p.position ?? ORIGIN) : null;
    },
    "textDocument/codeAction": codeActions,
    "textDocument/documentSymbol": (p) => {
      const doc = specDoc(p);
      return doc ? documentSymbols(locator(doc.text), lineStarts(doc.text)) : [];
    },
  };

  const notifications: Record<string, (p: Params) => void> = {
    exit: () => exit(shutdown ? 0 : 1),
    "textDocument/didOpen": (p) => {
      const { uri, version = 0, text = "" } = p.textDocument ?? {};
      if (!uri) return;
      const old = docs.get(uri);
      if (old) clearTimeout(old.timer);
      const doc: Doc = {
        uri,
        version,
        text,
        path: pathOf(uri),
        parsed: [],
        layout: [],
        placed: [],
        ids: { nodes: [], groups: [] },
      };
      docs.set(uri, doc);
      analyze(doc, true);
    },
    "textDocument/didChange": (p) => {
      const doc = docs.get(p.textDocument?.uri ?? "");
      if (!doc) return;
      for (const change of p.contentChanges ?? []) doc.text = applyChange(doc.text, change);
      doc.version = p.textDocument?.version ?? doc.version + 1;
      analyze(doc);
    },
    "textDocument/didClose": (p) => {
      const doc = docs.get(p.textDocument?.uri ?? "");
      if (!doc) return;
      clearTimeout(doc.timer);
      docs.delete(doc.uri);
      notify("textDocument/publishDiagnostics", { uri: doc.uri, diagnostics: [] });
    },
  };

  const reply = (id: Message["id"], body: Pick<Message, "result" | "error">) => {
    if (!closed) send({ jsonrpc: "2.0", id, ...body });
  };

  return {
    handle(raw) {
      if (!isObj(raw) || typeof raw.method !== "string") return; // a response, or noise
      const msg = raw as unknown as Message & { method: string };
      const params = (msg.params ?? {}) as Params;
      if (msg.id === undefined || msg.id === null) {
        if (!initialized && msg.method !== "exit") return;
        try {
          notifications[msg.method]?.(params);
        } catch (e) {
          process.stderr.write(`orrery lsp: ${msg.method}: ${(e as Error)?.stack ?? e}\n`);
        }
        return;
      }
      if (shutdown)
        return reply(msg.id, { error: { code: -32600, message: "the server is shutting down" } });
      if (!initialized && msg.method !== "initialize")
        return reply(msg.id, { error: { code: -32002, message: "initialize first" } });
      const handler = requests[msg.method];
      if (!handler)
        return reply(msg.id, { error: { code: -32601, message: `no method ${msg.method}` } });
      try {
        reply(msg.id, { result: handler(params) ?? null });
      } catch (e) {
        process.stderr.write(`orrery lsp: ${msg.method}: ${(e as Error)?.stack ?? e}\n`);
        reply(msg.id, { error: { code: -32603, message: "Internal error" } });
      }
    },
    exitCode: () => (shutdown ? 0 : 1),
    close() {
      closed = true;
      for (const doc of docs.values()) clearTimeout(doc.timer);
      docs.clear();
    },
  };
}
