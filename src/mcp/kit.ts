// What every MCP tool shares: the Tool shape, content builders, argument readers and spec input.
import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { readSpec, renderFailure } from "../cli/io.ts";
import { type RenderRequest, renderModel } from "../render/index.ts";
import { parseSpec } from "../spec/index.ts";
import { type Diagnostic, type Model, type Scene, SKINS, THEMES } from "../types.ts";

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The call failed in a way the model can act on: an isError result, not a protocol error. */
export class ToolError extends Error {}

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export interface Context {
  /** Over HTTP the caller may not share this machine's files: paths and out_dir are refused. */
  http: boolean;
  /** The client renders MCP Apps views, so render and review add the viewer's data (mcp/viewer.ts). */
  ui?: boolean;
}

export type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/** A result with _meta for the client (never the model) next to its content. */
export interface ToolOutput {
  content: Content[];
  _meta?: Obj;
}

export interface Tool {
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
  /** Listed as is: render and review name the viewer here (`_meta.ui.resourceUri`). */
  _meta?: Obj;
  run(input: Obj, ctx: Context): Promise<Content[] | ToolOutput>;
}

export const text = (t: string): Content => ({ type: "text", text: t });
export const json = (v: unknown): Content => text(JSON.stringify(v, null, 2));
export const png = (data: Uint8Array): Content => ({
  type: "image",
  data: Buffer.from(data).toString("base64"),
  mimeType: "image/png",
});

// ---------------------------------------------------------------- arguments

export function str(input: Obj, key: string): string | undefined {
  const v = input[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new ToolError(`${key} must be a string`);
  return v;
}

export function oneOf<T extends string>(
  input: Obj,
  key: string,
  options: readonly T[],
): T | undefined {
  const v = str(input, key);
  if (v !== undefined && !options.includes(v as T))
    throw new ToolError(`${key} must be one of ${options.join(", ")} (got "${v}")`);
  return v as T | undefined;
}

export function num(
  input: Obj,
  key: string,
  min: number,
  max: number,
  int = false,
): number | undefined {
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

export function specInput(input: Obj, ctx: Context): Spec {
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

export function parse(spec: Spec, ctx: Context) {
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

export const errors = (list: Diagnostic[]) => list.filter((d) => d.severity === "error").length;

export function verdict(diagnostics: Diagnostic[], extra: Obj = {}): Obj {
  const e = errors(diagnostics);
  return { ok: e === 0, errors: e, warnings: diagnostics.length - e, ...extra, diagnostics };
}

export const stats = (model: Model, scene?: Scene) => ({
  nodes: model.nodes.length,
  groups: model.groups.length,
  edges: model.edges.length,
  width: scene?.width,
  height: scene?.height,
});

/** renderModel with a library download or a bad local icon file reported as a diagnostic. */
export async function renderSafe(
  req: RenderRequest,
): Promise<Awaited<ReturnType<typeof renderModel>>> {
  try {
    return await renderModel(req);
  } catch (e) {
    const failure = renderFailure(e);
    if (!failure) throw e;
    return { artifacts: [], diagnostics: [failure], scenes: {} };
  }
}

// ---------------------------------------------------------------- schema parts

export const SPEC_PROPS = {
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
export const THEME = {
  type: "string",
  enum: [...THEMES],
  description: "Default: the spec's theme.",
};
export const SKIN = {
  type: "string",
  enum: [...SKINS],
  description: "classic (vendor deck look) or stage (dark product look). Default: the spec's skin.",
};
