// render and validate: spec in, files and a receipt (text or --json) out.
import { extname, resolve } from "node:path";
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
import { viewsOf } from "../views.ts";
import type { Args } from "./args.ts";
import {
  fontFiles,
  inFolder,
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
  if (!args._.length) usage(`${validateOnly ? "validate" : "render"} needs a spec file`);
  const json = args.flags.json === true;
  // Every spec is read and every target settled before the first is drawn, so a bad path or two
  // specs aiming at one file stops the run before anything is written.
  const specs = args._.map(readSpec);
  const fonts = fontFiles(args);
  const targets = specs.map((spec) => outputTarget(args, spec));
  if (specs.length > 1) {
    const out = typeof args.flags.out === "string" ? args.flags.out : undefined;
    if (out && !inFolder(out, "x"))
      usage("-o must be a folder (end it with /) for more than one spec");
    const seen = new Map<string, string>();
    specs.forEach((spec, i) => {
      const base = targets[i]?.base ?? "";
      const other = seen.get(base);
      if (other) usage(`${other} and ${spec.path} would both write ${base}.*; render them apart`);
      seen.set(base, spec.path);
    });
  }
  const receipts: Receipt[] = [];
  for (const [i, spec] of specs.entries())
    receipts.push(await renderSpec(args, spec, validateOnly, targets[i], fonts));
  printReceipts(receipts, json);
  process.exitCode = receipts.every((r) => r.ok) ? 0 : 1;
}

async function renderSpec(
  args: Args,
  spec: Spec,
  validateOnly: boolean,
  target: ReturnType<typeof outputTarget> | undefined,
  fonts: string[],
): Promise<Receipt> {
  const strict = args.flags.strict === true;
  const parsed = parseSpec(spec.text, spec.path);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];
  const themes = themesOf(args, parsed.model?.theme);
  const { formats, base } = target ?? outputTarget(args, spec);

  const receipt: Receipt = {
    ok: !diagnostics.some((d) => d.severity === "error"),
    spec: { path: spec.path, sha256: sha(spec.text) },
    outputs: [],
    diagnostics,
  };
  if (parsed.model && receipt.ok) {
    const scale = args.flags.scale !== undefined ? Number(args.flags.scale) : 3;
    if (!(scale > 0 && scale <= 8)) usage("--scale must be between 0 and 8");
    const animateFlag =
      args.flags.static === true
        ? "none"
        : args.flags.animate === true
          ? "packets"
          : args.flags.animate;
    // The whole diagram, or with --view one figure per named view (`<base>.<view>.<format>`).
    const views = viewsOf(parsed.model, args.flags.view);
    if (!validateOnly) clashingPaths(views, themes, formats, base);
    const drawn: { name: string | undefined; result: RenderResult }[] = [];
    for (const view of views) {
      const result = await renderOrFail(
        {
          model: view.model,
          formats: validateOnly ? [] : formats,
          themes: validateOnly ? [themes[0] ?? "light"] : themes,
          name: view.name ? `${spec.name}.${view.name}` : spec.name,
          scale,
          // Only the default scale may be lowered to keep a large PNG inside the pixel budget.
          scaleExplicit: args.flags.scale !== undefined,
          fonts,
          animate: animateFlag as AnimateMode | undefined,
          skin: args.flags.skin as Skin | undefined,
          source: spec.text,
        },
        diagnostics,
      );
      // A warning from one of several views says which view it came from.
      diagnostics.push(
        ...result.diagnostics.map((d) =>
          view.name ? { ...d, subject: { view: view.name, ...d.subject } } : d,
        ),
      );
      receipt.stats ??= renderStats(view.model, result.scenes[themes[0] ?? "light"]);
      drawn.push({ name: view.name, result });
    }
    // --strict stops every view before any file is written; --force writes anyway and the
    // warnings stay listed, so a run that wrote its files is not reported as one that wrote none.
    const blocked = strict && diagnostics.some((d) => d.severity === "warning");
    const force = !validateOnly && args.flags.force === true;
    if (!validateOnly && (!blocked || force))
      for (const { name, result } of drawn)
        receipt.outputs.push(
          ...writeArtifacts(result.artifacts, themes, name ? `${base}.${name}` : base),
        );
    receipt.ok = !blocked || force;
  }
  receipt.ok = receipt.ok && !diagnostics.some((d) => d.severity === "error");
  return receipt;
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
  else
    base =
      inFolder(outFlag, spec.name) ??
      resolve(
        FORMATS.includes(outExt as Format) ? outFlag.slice(0, -(outExt.length + 1)) : outFlag,
      );
  return { formats, base };
}

/** The file an artifact goes to: next to base, with a -<theme> suffix when there are two. */
const artifactPath = (base: string, themes: ThemeName[], format: Format, theme?: ThemeName) =>
  `${base}${themes.length > 1 && format !== "html" ? `-${theme}` : ""}.${format}`;

/**
 * Stops before writing when two outputs would land on one file: a view named drawio or
 * sequence, drawn with --view all, writes `<base>.drawio.svg` over the editable SVG.
 */
function clashingPaths(
  views: ReturnType<typeof viewsOf>,
  themes: ThemeName[],
  formats: Format[],
  base: string,
): void {
  const seen = new Map<string, string>();
  for (const view of views)
    for (const format of formats)
      for (const theme of format === "html" ? [themes[0]] : themes) {
        const path = artifactPath(view.name ? `${base}.${view.name}` : base, themes, format, theme);
        const what = `${view.name ? `view ${view.name}` : "the diagram"} as ${format}`;
        const other = seen.get(path);
        if (other)
          usage(`${other} and ${what} would both write ${path}; rename the view or drop a format`);
        seen.set(path, what);
      }
}

/** Renders, or for validate only lays out; a library or local icon failure becomes a diagnostic. */
async function renderOrFail(req: RenderRequest, diagnostics: Diagnostic[]): Promise<RenderResult> {
  try {
    return await renderModel(req);
  } catch (e) {
    const failure = renderFailure(e);
    if (failure) {
      diagnostics.push(failure);
      return { artifacts: [], diagnostics: [], scenes: {} };
    }
    // resvg refuses a PNG under 1 px, which a small enough --scale asks for.
    if (req.formats.includes("png") && /target size is zero/i.test((e as Error)?.message ?? ""))
      usage(`--scale ${req.scale} draws the PNG smaller than 1 px; use a larger --scale`);
    throw e;
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
    const path = artifactPath(base, themes, a.format, a.theme);
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

/** One receipt prints as itself; several print as an array (--json) or one line each. */
function printReceipts(receipts: Receipt[], json: boolean) {
  const many = receipts.length > 1;
  for (const r of receipts) printDiagnostics(r.diagnostics, json);
  if (json) {
    const body = many ? receipts : receipts[0];
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
    return;
  }
  for (const r of receipts) {
    const errors = r.diagnostics.filter((d) => d.severity === "error").length;
    const warnings = r.diagnostics.length - errors;
    for (const o of r.outputs) process.stdout.write(`wrote ${o.path} (${o.bytes} bytes)\n`);
    process.stdout.write(
      `${many ? `${r.spec.path}: ` : ""}${r.ok ? "ok" : "failed"}: ${errors} error(s), ${warnings} warning(s)\n`,
    );
  }
}
