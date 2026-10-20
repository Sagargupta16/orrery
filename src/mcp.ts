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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { deflateRawSync } from "node:zlib";
import { type Args, readSpec, renderFailure, usage, writeAtomic } from "./cli.ts";
import { PACK_ORDER, searchIcons } from "./icons.ts";
import { PatchError, type PatchOp, tryCandidates } from "./patch.ts";
import { examplesDir, skillRoot } from "./paths.ts";
import { FORMATS, type Format, type RenderRequest, renderModel } from "./render/index.ts";
import { DEFAULT_REVIEW_WIDTH, reviewModel } from "./review.ts";
import { parseSpec } from "./spec.ts";
import {
  ANIMATE_MODES,
  type Diagnostic,
  type Model,
  type Scene,
  SKINS,
  THEMES,
  type ThemeName,
} from "./types.ts";

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
const VERSIONS = [...MODERN, ...LEGACY];
const META = "io.modelcontextprotocol/";
const CAPABILITIES = { tools: { listChanged: false } };
const MAX_BODY = 16 * 1024 * 1024;
/** diagrams.net reads the whole diagram from the link; past this a browser may refuse it. */
const MAX_LINK_XML = 2 * 1024 * 1024;
const MAX_CANDIDATES = 12;
const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const PATCH_OPS = ["set", "unset", "add", "move", "edge"];
const ICON_TYPES = ["service", "resource", "group", "category", "logo", "glyph"];

const INSTRUCTIONS =
  "orrery draws architecture, system design and business flow diagrams from a small YAML spec, with official AWS, Azure, Google Cloud, Kubernetes and GitHub icons. " +
  "Call get_authoring_guide before writing a spec, find icon ids with icons_search, run validate until it reports no errors, then render, and review the diagram at the width readers see it. " +
  "Every spec tool takes the spec as spec (its YAML text) or spec_path (an absolute path, stdio only), never both. " +
  "A result with ok false, diagnostics or a failing review is a verdict on the diagram: change the spec and call again. isError means the call itself failed.";

/** The call failed in a way the model can act on: an isError result, not a protocol error. */
class ToolError extends Error {}

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

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

interface Context {
  /** Over HTTP the caller may not share this machine's files: paths and out_dir are refused. */
  http: boolean;
}

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Obj;
    required?: string[];
    additionalProperties: false;
  };
  annotations?: { readOnlyHint?: boolean; idempotentHint?: boolean };
  run(input: Obj, ctx: Context): Promise<Content[]>;
}

const text = (t: string): Content => ({ type: "text", text: t });
const json = (v: unknown): Content => text(JSON.stringify(v, null, 2));
const png = (data: Uint8Array): Content => ({
  type: "image",
  data: Buffer.from(data).toString("base64"),
  mimeType: "image/png",
});

// ---------------------------------------------------------------- arguments

function str(input: Obj, key: string): string | undefined {
  const v = input[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new ToolError(`${key} must be a string`);
  return v;
}

function oneOf<T extends string>(input: Obj, key: string, options: readonly T[]): T | undefined {
  const v = str(input, key);
  if (v !== undefined && !options.includes(v as T))
    throw new ToolError(`${key} must be one of ${options.join(", ")} (got "${v}")`);
  return v as T | undefined;
}

function num(input: Obj, key: string, min: number, max: number, int = false): number | undefined {
  const v = input[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !(v >= min && v <= max) || (int && !Number.isInteger(v)))
    throw new ToolError(`${key} must be ${int ? "an integer" : "a number"} from ${min} to ${max}`);
  return v;
}

interface Spec {
  text: string;
  name: string;
  /** Where the spec lives; its folder resolves relative `icons:` paths. */
  path: string;
}

function specInput(input: Obj, ctx: Context): Spec {
  const path = str(input, "spec_path");
  const source = str(input, "spec");
  if (ctx.http && path !== undefined)
    throw new ToolError(
      "spec_path is refused over HTTP, where the server may not see your files: pass the spec's text as spec",
    );
  if ((path === undefined) === (source === undefined))
    throw new ToolError("pass exactly one of spec (the YAML text) or spec_path (an absolute path)");
  const name = str(input, "name");
  if (name !== undefined && !NAME.test(name))
    throw new ToolError(
      "name must be lowercase letters, digits and -, starting with a letter or digit",
    );
  if (path !== undefined) {
    if (!isAbsolute(path)) throw new ToolError(`spec_path must be an absolute path (got ${path})`);
    if (!existsSync(path) || !statSync(path).isFile())
      throw new ToolError(`spec_path not found: ${path}`);
    const spec = readSpec(path);
    return { text: spec.text, name: name ?? spec.name, path: spec.path };
  }
  if (!source?.trim()) throw new ToolError("spec is empty");
  const stem = name ?? "diagram";
  // Relative icons: paths in a pasted spec resolve against the server's folder, as a file there would.
  return { text: source, name: stem, path: resolve(`${stem}.yaml`) };
}

function parse(spec: Spec, ctx: Context) {
  const parsed = parseSpec(spec.text, spec.path);
  // Refused whether or not the files exist: "not found" would answer that question too.
  const declares =
    !!parsed.model?.icons?.length || parsed.diagnostics.some((d) => d.subject?.where === "icons");
  if (ctx.http && declares)
    throw new ToolError(
      "icons: names SVG files on the server's disk, which is refused over HTTP: use icon ids from icons_search, or run the server over stdio",
    );
  return parsed;
}

const errors = (list: Diagnostic[]) => list.filter((d) => d.severity === "error").length;

function verdict(diagnostics: Diagnostic[], extra: Obj = {}): Obj {
  const e = errors(diagnostics);
  return { ok: e === 0, errors: e, warnings: diagnostics.length - e, ...extra, diagnostics };
}

const stats = (model: Model, scene?: Scene) => ({
  nodes: model.nodes.length,
  groups: model.groups.length,
  edges: model.edges.length,
  width: scene?.width,
  height: scene?.height,
});

/** renderModel with a library download or a bad local icon file reported as a diagnostic. */
async function renderSafe(req: RenderRequest): Promise<Awaited<ReturnType<typeof renderModel>>> {
  try {
    return await renderModel(req);
  } catch (e) {
    const failure = renderFailure(e);
    if (!failure) throw e;
    return { artifacts: [], diagnostics: [failure], scenes: {} };
  }
}

function templates(): string[] {
  if (!existsSync(examplesDir)) return [];
  return readdirSync(examplesDir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => f.replace(/\.ya?ml$/, ""))
    .sort();
}

const field = (yaml: string, key: string) =>
  yaml
    .match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]
    ?.trim()
    .replace(/^(["'])(.*)\1$/, "$2");

/** diagrams.net's #create= payload: the URL-encoded XML, raw-deflated and base64, in JSON. */
function diagramsNetLink(xml: string): string {
  const data = deflateRawSync(Buffer.from(encodeURIComponent(xml)), { level: 9 }).toString(
    "base64",
  );
  return `https://app.diagrams.net/#create=${encodeURIComponent(JSON.stringify({ type: "xml", compressed: true, data }))}`;
}

// ---------------------------------------------------------------- tools

const SPEC_PROPS = {
  spec: {
    type: "string",
    description: "The diagram spec as YAML (or JSON) text. Pass this or spec_path, not both.",
  },
  spec_path: {
    type: "string",
    description:
      "Absolute path of a spec file on this machine (stdio only). Its folder resolves relative icons: paths.",
  },
  name: {
    type: "string",
    description:
      "File name stem for outputs: lowercase letters, digits and -. Default: the spec file's name, else diagram.",
  },
};
const THEME = { type: "string", enum: [...THEMES], description: "Default: the spec's theme." };
const SKIN = {
  type: "string",
  enum: [...SKINS],
  description: "classic (vendor deck look) or stage (dark product look). Default: the spec's skin.",
};

const TOOLS: Tool[] = [
  {
    name: "get_authoring_guide",
    title: "Authoring guide",
    description:
      "Read this before writing a spec. topic diagram (default) returns the orrery skill (fast path, authoring rules, outputs) and the full spec reference; topic review returns the review loop and the patch ops try_patches takes.",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string", enum: ["diagram", "review"] } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(input) {
      const topic = oneOf(input, "topic", ["diagram", "review"]) ?? "diagram";
      const files =
        topic === "diagram"
          ? ["SKILL.md", join("references", "spec.md")]
          : [join("references", "review", "loop.md")];
      const note =
        "Over MCP the commands this guide names are tools: render, validate, review, icons_search (icons search), list_templates and get_template (init), try_patches (patch) and drawio_link. " +
        "Where it says to run a command, call the tool instead, passing the spec as spec or spec_path. Paths such as references/... are inside the skill folder; get_authoring_guide topic review returns the review loop.";
      const body = files.map(
        (f) =>
          `===== ${f.replaceAll("\\", "/")} =====\n${readFileSync(join(skillRoot, f), "utf8")}`,
      );
      return [text([note, ...body].join("\n\n"))];
    },
  },
  {
    name: "validate",
    title: "Validate a spec",
    description:
      "Check a spec without rendering: parse errors, unknown icons (with the closest ids), bad references and layout warnings, each with a code, a message and concrete fixes. Returns JSON with ok, the counts, the diagnostics and the diagram's size.",
    inputSchema: { type: "object", properties: SPEC_PROPS, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(input, ctx) {
      const spec = specInput(input, ctx);
      const parsed = parse(spec, ctx);
      const diagnostics = [...parsed.diagnostics];
      const model = parsed.model;
      if (!model || errors(diagnostics)) return [json(verdict(diagnostics))];
      const r = await renderSafe({ model, formats: [], themes: [model.theme], name: spec.name });
      diagnostics.push(...r.diagnostics);
      return [json(verdict(diagnostics, { stats: stats(model, r.scenes[model.theme]) }))];
    },
  },
  {
    name: "render",
    title: "Render a diagram",
    description:
      "Render a spec to SVG, PNG, draw.io, editable draw.io SVG, a React TSX component or a standalone HTML page. Nothing renders while the spec has errors (see the diagnostics). " +
      "With out_dir (stdio only) the files are written there and their paths returned; otherwise the result carries a JSON receipt, then each output in order: PNGs as images, the others as text.",
    inputSchema: {
      type: "object",
      properties: {
        ...SPEC_PROPS,
        formats: {
          type: "array",
          items: { type: "string", enum: [...FORMATS] },
          description: "Default: svg and png.",
        },
        theme: {
          type: "string",
          enum: [...THEMES, "both"],
          description: "both renders a light and a dark file. Default: the spec's theme.",
        },
        skin: SKIN,
        animate: {
          type: "string",
          enum: [...ANIMATE_MODES],
          description:
            "SVG motion: packets, flow, relay or none. Default: the skin's (packets for classic, relay for stage). PNG is always still.",
        },
        scale: {
          type: "number",
          minimum: 0.1,
          maximum: 8,
          description: "PNG pixels per diagram unit. Default 3 with out_dir, 2 inline.",
        },
        out_dir: {
          type: "string",
          description:
            "Absolute folder to write the files to (stdio only). Existing files are replaced.",
        },
      },
      additionalProperties: false,
    },
    async run(input, ctx) {
      const spec = specInput(input, ctx);
      const raw = input.formats;
      const formats: Format[] =
        raw === undefined || raw === null
          ? ["svg", "png"]
          : raw === "all"
            ? [...FORMATS]
            : (formatList(raw) as Format[]);
      const themeArg = oneOf(input, "theme", [...THEMES, "both"] as const);
      const skin = oneOf(input, "skin", SKINS);
      const animate = oneOf(input, "animate", ANIMATE_MODES);
      const outDir = str(input, "out_dir");
      if (outDir !== undefined && ctx.http)
        throw new ToolError(
          "out_dir is refused over HTTP: leave it out and the outputs come back in the result",
        );
      if (outDir !== undefined && !isAbsolute(outDir))
        throw new ToolError(`out_dir must be an absolute path (got ${outDir})`);
      const scale = num(input, "scale", 0.1, 8) ?? (outDir ? 3 : 2);
      const parsed = parse(spec, ctx);
      const diagnostics = [...parsed.diagnostics];
      const model = parsed.model;
      if (!model || errors(diagnostics)) return [json(verdict(diagnostics, { outputs: [] }))];
      const theme = themeArg ?? model.theme;
      const themes: ThemeName[] = theme === "both" ? ["light", "dark"] : [theme];
      const r = await renderSafe({
        model,
        formats,
        themes,
        name: spec.name,
        scale,
        animate,
        skin,
      });
      diagnostics.push(...r.diagnostics);
      const content: Content[] = [];
      const outputs = r.artifacts.map((a) => {
        const file = `${spec.name}${themes.length > 1 && a.format !== "html" ? `-${a.theme}` : ""}.${a.format}`;
        const bytes = typeof a.data === "string" ? Buffer.byteLength(a.data) : a.data.length;
        const meta = {
          format: a.format,
          theme: a.format === "html" ? "light+dark" : a.theme,
          bytes,
          width: a.width,
          height: a.height,
        };
        if (outDir) {
          const path = join(outDir, file);
          writeAtomic(path, a.data);
          return { path, ...meta };
        }
        content.push(typeof a.data === "string" ? text(a.data) : png(a.data));
        // Index in the result's content list, after this receipt.
        return { file, content: content.length, ...meta };
      });
      const scene = r.scenes[themes[0] ?? model.theme];
      return [json(verdict(diagnostics, { stats: stats(model, scene), outputs })), ...content];
    },
  },
  {
    name: "review",
    title: "Review a diagram",
    description:
      "Measure the diagram at the width readers see it (a README column is 880 px): six scored dimensions (conventions, layout, grid, flow, overlap, quality), hard counts, findings with evidence and spec fixes, and pass (no blocker or major and score >= 85). " +
      "Returns the report JSON and the PNG exactly as the reader sees it. A failing review is a normal result: fix the spec, or try fixes with try_patches.",
    inputSchema: {
      type: "object",
      properties: {
        ...SPEC_PROPS,
        width: {
          type: "integer",
          minimum: 200,
          maximum: 4000,
          description: `Display width in CSS px. Default ${DEFAULT_REVIEW_WIDTH}.`,
        },
        theme: THEME,
        skin: SKIN,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(input, ctx) {
      const spec = specInput(input, ctx);
      const width = num(input, "width", 200, 4000, true) ?? DEFAULT_REVIEW_WIDTH;
      const theme = oneOf(input, "theme", THEMES);
      const skin = oneOf(input, "skin", SKINS);
      const parsed = parse(spec, ctx);
      const model = parsed.model;
      if (!model) return [json(verdict(parsed.diagnostics))];
      let run: Awaited<ReturnType<typeof reviewModel>>;
      try {
        run = await reviewModel({
          model: skin ? { ...model, skin } : model,
          name: spec.name,
          width,
          theme: theme ?? model.theme,
          diagnostics: parsed.diagnostics,
        });
      } catch (e) {
        const failure = renderFailure(e);
        if (!failure) throw e;
        return [json(verdict([...parsed.diagnostics, failure]))];
      }
      // A run that renders the reader's look as well hands that picture over instead.
      const look = "look" in run && run.look instanceof Uint8Array ? run.look : run.png;
      return [json(run.report), ...(look ? [png(look)] : [])];
    },
  },
  {
    name: "icons_search",
    title: "Search icons",
    description:
      "Find icon ids for a spec's icon: field across the official AWS, Azure, Google Cloud, Kubernetes, GitHub and IBM packs, 5,500 tech logos and the generic symbol sets, ranked best first. Returns JSON: id, name, category, type.",
    inputSchema: {
      type: "object",
      properties: {
        words: {
          type: "string",
          description: "What to draw, for example 'load balancer' or 'redis'.",
        },
        pack: { type: "string", enum: [...PACK_ORDER], description: "Only this pack." },
        type: { type: "string", enum: ICON_TYPES, description: "Only this kind of icon." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Default 15." },
      },
      required: ["words"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(input) {
      const words = str(input, "words")?.trim();
      if (!words) throw new ToolError("words is required, for example 'load balancer'");
      const results = searchIcons(words, {
        pack: oneOf(input, "pack", PACK_ORDER),
        type: oneOf(input, "type", ICON_TYPES),
        limit: num(input, "limit", 1, 50, true) ?? 15,
      });
      return [json(results)];
    },
  },
  {
    name: "list_templates",
    title: "List templates",
    description:
      "The bundled reference diagrams (AWS, Azure, Google Cloud, Kubernetes, C4, system design, flowcharts, BPMN, state machines, journeys), each with its title. Start from the closest one with get_template.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run() {
      return [
        json(
          templates().map((name) => {
            const yaml = readFileSync(join(examplesDir, `${name}.yaml`), "utf8");
            return { name, title: field(yaml, "title"), subtitle: field(yaml, "subtitle") };
          }),
        ),
      ];
    },
  },
  {
    name: "get_template",
    title: "Get a template",
    description:
      "One bundled template's spec YAML (names from list_templates; starter is the general one). Edit it and pass it to validate, render or review as spec.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "A name from list_templates." } },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(input, ctx) {
      const name = str(input, "name");
      const list = templates();
      if (!name || !list.includes(name))
        throw new ToolError(`no template "${name ?? ""}"; templates: ${list.join(", ")}`);
      const file = join(examplesDir, `${name}.yaml`);
      const yaml = readFileSync(file, "utf8");
      const icons = parseSpec(yaml, file).model?.icons ?? [];
      if (!icons.length) return [text(yaml)];
      const files = icons.map((i) => relative(examplesDir, i.path).replaceAll("\\", "/"));
      return [
        text(yaml),
        text(
          `This template draws local icons from SVG files beside it (${files.join(", ")}). ` +
            (ctx.http
              ? "Over HTTP, swap them for icon ids from icons_search before rendering."
              : `To render it as is, pass spec_path ${file}.`),
        ),
      ];
    },
  },
  {
    name: "try_patches",
    title: "Try spec patches",
    description:
      "Review each candidate (a list of patch ops) on its own copy of the spec and keep only those that raise the score without raising any hard count or adding a blocker or major finding. " +
      "Ops: {op: set, path, value}, {op: unset, path}, {op: add, path, value}, {op: move, path, after|before}, {op: edge, match: a spec edge line or null to append, value: the new line or null to remove}; paths are dotted, for example nodes.db.note. " +
      "Returns each candidate's score and verdict, then the best patched spec text when one was kept.",
    inputSchema: {
      type: "object",
      properties: {
        ...SPEC_PROPS,
        candidates: {
          type: "array",
          minItems: 1,
          maxItems: MAX_CANDIDATES,
          description: "Candidate fixes, each a list of patch ops applied in order.",
          items: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                op: { type: "string", enum: PATCH_OPS },
                path: {
                  type: "string",
                  description: "Dotted spec path, for example nodes.api.label.",
                },
                value: {
                  description:
                    "The new value (set, add) or edge line (edge); null removes an edge.",
                },
                after: { type: "string", description: "move: the sibling id to follow." },
                before: { type: "string", description: "move: the sibling id to precede." },
                match: { type: "string", description: "edge: the spec edge line to replace." },
              },
              required: ["op"],
            },
          },
        },
        width: {
          type: "integer",
          minimum: 200,
          maximum: 4000,
          description: `Display width in CSS px. Default ${DEFAULT_REVIEW_WIDTH}.`,
        },
        theme: THEME,
        skin: SKIN,
      },
      required: ["candidates"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(input, ctx) {
      const spec = specInput(input, ctx);
      const candidates = candidatesOf(input.candidates);
      const width = num(input, "width", 200, 4000, true);
      const theme = oneOf(input, "theme", THEMES);
      const skin = oneOf(input, "skin", SKINS);
      const parsed = parse(spec, ctx);
      if (!parsed.model) return [json(verdict(parsed.diagnostics))];
      let run: Awaited<ReturnType<typeof tryCandidates>>;
      try {
        run = await tryCandidates({
          source: spec.text,
          filename: spec.path,
          candidates,
          ...(width ? { width } : {}),
          ...(theme ? { theme } : {}),
          ...(skin ? { skin } : {}),
        });
      } catch (e) {
        if (e instanceof PatchError) throw new ToolError(e.message);
        const failure = renderFailure(e);
        if (!failure) throw e;
        return [json(verdict([...parsed.diagnostics, failure]))];
      }
      const summary = {
        before: { score: run.before.score, pass: run.before.pass },
        results: run.results.map((r) => ({
          index: r.index,
          kept: r.kept,
          score: r.report?.score,
          pass: r.report?.pass,
          reason: r.reason,
        })),
        best: run.best?.index ?? null,
      };
      return [json(summary), ...(run.best?.source ? [text(run.best.source)] : [])];
    },
  },
  {
    name: "drawio_link",
    title: "Open in diagrams.net",
    description:
      "A link that opens the diagram in diagrams.net, loaded and editable. Nothing is uploaded: the draw.io file travels in the link's fragment, which the browser never sends to a server.",
    inputSchema: {
      type: "object",
      properties: { ...SPEC_PROPS, theme: THEME, skin: SKIN },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(input, ctx) {
      const spec = specInput(input, ctx);
      const theme = oneOf(input, "theme", THEMES);
      const skin = oneOf(input, "skin", SKINS);
      const parsed = parse(spec, ctx);
      const diagnostics = [...parsed.diagnostics];
      const model = parsed.model;
      if (!model || errors(diagnostics)) return [json(verdict(diagnostics))];
      const r = await renderSafe({
        model,
        formats: ["drawio"],
        themes: [theme ?? model.theme],
        name: spec.name,
        skin,
      });
      const xml = r.artifacts.find((a) => a.format === "drawio")?.data;
      if (typeof xml !== "string") return [json(verdict([...diagnostics, ...r.diagnostics]))];
      if (Buffer.byteLength(xml) > MAX_LINK_XML)
        throw new ToolError(
          "the draw.io file is over 2 MB, too long for a link: render it with formats [drawio] and open the file in draw.io",
        );
      return [text(diagramsNetLink(xml))];
    },
  },
];

function formatList(v: unknown): string[] {
  const items = typeof v === "string" ? v.split(",").map((s) => s.trim()) : v;
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.some((i) => typeof i !== "string" || !FORMATS.includes(i as Format))
  )
    throw new ToolError(`formats must be a list of ${FORMATS.join(", ")}`);
  return [...new Set(items as string[])];
}

function candidatesOf(v: unknown): PatchOp[][] {
  if (!Array.isArray(v) || !v.length || v.length > MAX_CANDIDATES)
    throw new ToolError(
      `candidates must be a list of 1 to ${MAX_CANDIDATES} candidates, each a list of patch ops`,
    );
  for (const [i, c] of v.entries()) {
    if (!Array.isArray(c) || !c.length)
      throw new ToolError(`candidate ${i} must be a non-empty list of patch ops`);
    for (const op of c)
      if (!isObj(op) || !PATCH_OPS.includes(String(op.op)))
        throw new ToolError(`candidate ${i}: every op needs op: ${PATCH_OPS.join(", ")}`);
  }
  return v as PatchOp[][];
}

// ---------------------------------------------------------------- JSON-RPC

const SERVER_META = { [`${META}serverInfo`]: SERVER };

const rpcError = (id: unknown, code: number, message: string, data?: unknown) => ({
  jsonrpc: "2.0",
  ...(id === undefined ? {} : { id }),
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

/** The version a modern request carries in params._meta; undefined for a legacy request. */
function declaredVersion(params: Obj): unknown {
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
    const content = await tool.run(args, ctx);
    logCall(tool.name, started);
    return { content };
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

async function result(method: string, params: Obj, ctx: Context): Promise<Obj> {
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
  const done = (r: Obj): Obj => (modern ? { resultType: "complete", ...r, _meta: SERVER_META } : r);
  switch (method) {
    case "initialize": {
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
    case "tools/call":
      return done(await serial(() => callTool(params, ctx)));
    default:
      throw new RpcError(-32601, `Method not found: ${method}`, modern ? 404 : 200);
  }
}

interface Reply {
  status: number;
  body: Obj;
}

/** The reply to one message, or undefined for a notification or a client's response. */
async function dispatch(msg: unknown, ctx: Context): Promise<Reply | undefined> {
  if (!isObj(msg) || msg.jsonrpc !== "2.0")
    return { status: 400, body: rpcError(null, -32600, "Invalid Request") };
  const { id, method } = msg;
  if (typeof method !== "string") {
    if ("result" in msg || "error" in msg) return undefined;
    return { status: 400, body: rpcError(id ?? null, -32600, "Invalid Request: no method") };
  }
  // notifications/initialized and notifications/cancelled need nothing: calls run to the end.
  if (!("id" in msg)) return undefined;
  if (typeof id !== "string" && typeof id !== "number")
    return {
      status: 400,
      body: rpcError(null, -32600, "Invalid Request: id must be a string or number"),
    };
  try {
    const params = isObj(msg.params) ? msg.params : {};
    return { status: 200, body: { jsonrpc: "2.0", id, result: await result(method, params, ctx) } };
  } catch (e) {
    if (!(e instanceof RpcError)) throw e;
    return { status: e.status, body: rpcError(id, e.code, e.message, e.data) };
  }
}

// ---------------------------------------------------------------- stdio

function serveStdio(): Promise<void> {
  const send = (body: unknown) => process.stdout.write(`${JSON.stringify(body)}\n`);
  const ctx: Context = { http: false };
  const pending = new Set<Promise<void>>();
  return new Promise((done) => {
    const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
    lines.on("line", (line) => {
      if (!line.trim()) return;
      let msg: unknown;
      try {
        msg = JSON.parse(line);
      } catch {
        return void send(rpcError(null, -32700, "Parse error"));
      }
      if (Array.isArray(msg))
        return void send(
          rpcError(null, -32600, "Invalid Request: one message per line, no batches"),
        );
      const job: Promise<void> = dispatch(msg, ctx)
        .then((reply) => {
          if (reply) send(reply.body);
        })
        .catch((e: unknown) => {
          process.stderr.write(`orrery mcp: ${(e as Error)?.stack ?? e}\n`);
          if (isObj(msg) && "id" in msg) send(rpcError(msg.id, -32603, "Internal error"));
        })
        .finally(() => pending.delete(job));
      pending.add(job);
    });
    // Calls still running when the client closes stdin are answered before the server exits.
    lines.on("close", () => void Promise.allSettled([...pending]).then(() => done()));
  });
}

// ---------------------------------------------------------------- Streamable HTTP

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

function serveHttp(port: number): Promise<void> {
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

export async function cmdMcp(args: Args): Promise<void> {
  if (args._.length) usage(`mcp takes no arguments (got ${args._.join(" ")})`);
  const port = args.flags.port;
  if (port === undefined) return serveStdio();
  if (!/^\d{1,5}$/.test(String(port)) || Number(port) > 65535)
    usage(`--port must be a port number from 0 to 65535 (got "${port}")`);
  return serveHttp(Number(port));
}
