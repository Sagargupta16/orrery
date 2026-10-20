// render and validate: spec in, files and a receipt (text or --json) out.
import { existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import {
  type Artifact,
  FORMATS,
  type Format,
  formatOf,
  type RenderRequest,
  type RenderResult,
  renderModel,
} from "../render/index.ts";
import { parseSpec } from "../spec/index.ts";
import type { AnimateMode, Diagnostic, Model, Scene, Skin, ThemeName } from "../types.ts";
import type { Args } from "./args.ts";
import {
  fontFiles,
  printDiagnostics,
  readSpec,
  renderFailure,
  sha,
  usage,
  writeAtomic,
} from "./io.ts";

interface Output {
  path: string;
  format: Format;
  theme: string | undefined;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
}

interface Receipt {
  ok: boolean;
  spec: { path: string; sha256: string };
  outputs: Output[];
  diagnostics: Diagnostic[];
  stats?: Record<string, unknown>;
}

type Spec = ReturnType<typeof readSpec>;

export async function cmdRender(args: Args, validateOnly: boolean) {
  const [specPath] = args._;
  if (!specPath) usage(`${validateOnly ? "validate" : "render"} needs a spec file`);
  const json = args.flags.json === true;
  const strict = args.flags.strict === true;
  const spec = readSpec(specPath);
  const parsed = parseSpec(spec.text, spec.path);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];
  const themes = themesOf(args, parsed.model?.theme);
  const fonts = fontFiles(args);
  const { formats, base } = outputTarget(args, spec);

  let ok = !diagnostics.some((d) => d.severity === "error");
  const receipt: Receipt = {
    ok,
    spec: { path: spec.path, sha256: sha(spec.text) },
    outputs: [],
    diagnostics,
  };
  if (parsed.model && ok) {
    const scale = args.flags.scale !== undefined ? Number(args.flags.scale) : 3;
    if (!(scale > 0 && scale <= 8)) usage("--scale must be between 0 and 8");
    const animateFlag =
      args.flags.static === true
        ? "none"
        : args.flags.animate === true
          ? "packets"
          : args.flags.animate;
    const result = await renderOrFail(
      {
        model: parsed.model,
        formats: validateOnly ? [] : formats,
        themes: validateOnly ? [themes[0] ?? "light"] : themes,
        name: spec.name,
        scale,
        fonts,
        animate: animateFlag as AnimateMode | undefined,
        skin: args.flags.skin as Skin | undefined,
      },
      diagnostics,
    );
    diagnostics.push(...result.diagnostics);
    receipt.stats = renderStats(parsed.model, result.scenes[themes[0] ?? "light"]);
    const blocked = strict && diagnostics.some((d) => d.severity === "warning");
    if (!validateOnly && (!blocked || args.flags.force === true))
      receipt.outputs.push(...writeArtifacts(result.artifacts, themes, base));
    ok = !blocked;
  }
  receipt.ok = ok && !diagnostics.some((d) => d.severity === "error");
  printReceipt(receipt, json);
  process.exitCode = receipt.ok ? 0 : 1;
}

/** --theme (or the spec's theme, or dark) as the list of themes to draw. */
function themesOf(args: Args, specTheme: ThemeName | undefined): ThemeName[] {
  const themeFlag = String(args.flags.theme ?? specTheme ?? "dark");
  if (!["light", "dark", "both"].includes(themeFlag)) usage(`--theme must be light, dark or both`);
  return themeFlag === "both" ? ["light", "dark"] : [themeFlag as ThemeName];
}

/** The formats to write and the path every file name starts with, from -f and -o. */
function outputTarget(args: Args, spec: Spec): { formats: Format[]; base: string } {
  const outFlag = typeof args.flags.out === "string" ? args.flags.out : undefined;
  let formats: Format[];
  const fmtFlag = typeof args.flags.format === "string" ? args.flags.format : undefined;
  const outExt = outFlag ? (formatOf(outFlag) ?? extname(outFlag).slice(1).toLowerCase()) : "";
  if (fmtFlag) {
    formats =
      fmtFlag === "all" ? [...FORMATS] : (fmtFlag.split(",").map((f) => f.trim()) as Format[]);
    for (const f of formats)
      if (!FORMATS.includes(f)) usage(`unknown format "${f}" (use ${FORMATS.join(", ")} or all)`);
  } else if (FORMATS.includes(outExt as Format)) formats = [outExt as Format];
  else formats = ["svg", "png"];
  let base: string;
  if (!outFlag)
    base =
      spec.path === "stdin.yaml" ? resolve("diagram") : spec.path.replace(/\.(ya?ml|json)$/i, "");
  else if (
    outFlag.endsWith("/") ||
    outFlag.endsWith("\\") ||
    (existsSync(outFlag) && statSync(outFlag).isDirectory())
  )
    base = join(resolve(outFlag), spec.name);
  else
    base = resolve(
      FORMATS.includes(outExt as Format) ? outFlag.slice(0, -(outExt.length + 1)) : outFlag,
    );
  return { formats, base };
}

/** Renders, or for validate only lays out; a library or local icon failure becomes a diagnostic. */
async function renderOrFail(req: RenderRequest, diagnostics: Diagnostic[]): Promise<RenderResult> {
  try {
    return await renderModel(req);
  } catch (e) {
    const failure = renderFailure(e);
    if (!failure) throw e;
    diagnostics.push(failure);
    return { artifacts: [], diagnostics: [], scenes: {} };
  }
}

function renderStats(model: Model, scene: Scene | undefined): Record<string, unknown> {
  const iconsByPack: Record<string, number> = {};
  for (const n of model.nodes) {
    if (n.icon) {
      const p = n.icon.split(":")[0] ?? "";
      iconsByPack[p] = (iconsByPack[p] ?? 0) + 1;
    }
  }
  return {
    nodes: model.nodes.length,
    groups: model.groups.length,
    edges: model.edges.length,
    icons: iconsByPack,
    width: scene?.width,
    height: scene?.height,
  };
}

/** Writes each artifact next to base (a -<theme> suffix when there are two) and lists it. */
function writeArtifacts(artifacts: Artifact[], themes: ThemeName[], base: string): Output[] {
  const outputs: Output[] = [];
  for (const a of artifacts) {
    const suffix = themes.length > 1 && a.format !== "html" ? `-${a.theme}` : "";
    const path = `${base}${suffix}.${a.format}`;
    writeAtomic(path, a.data);
    outputs.push({
      path,
      format: a.format,
      theme: a.format === "html" ? "light+dark" : a.theme,
      bytes: typeof a.data === "string" ? Buffer.byteLength(a.data) : a.data.length,
      sha256: sha(a.data),
      width: a.width,
      height: a.height,
    });
  }
  return outputs;
}

function printReceipt(receipt: Receipt, json: boolean) {
  const { diagnostics } = receipt;
  printDiagnostics(diagnostics, json);
  if (json) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  else {
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    const warnings = diagnostics.length - errors;
    for (const o of receipt.outputs) process.stdout.write(`wrote ${o.path} (${o.bytes} bytes)\n`);
    process.stdout.write(
      `${receipt.ok ? "ok" : "failed"}: ${errors} error(s), ${warnings} warning(s)\n`,
    );
  }
}
