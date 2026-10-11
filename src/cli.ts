import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  allIcons,
  iconInfo,
  loadIconLibraries,
  PACK_ORDER,
  packInfo,
  renderIcon,
  searchIcons,
} from "./icons.ts";
import { importMermaid } from "./import/mermaid.ts";
import { cachePath, LibraryError, librarySource, loadLibrary } from "./libraries.ts";
import { examplesDir, skillRoot } from "./paths.ts";
import { FORMATS, type Format, renderModel } from "./render/index.ts";
import { renderPng } from "./render/png.ts";
import { parseSpec } from "./spec.ts";
import { GROUP_STYLES } from "./styles.ts";
import { THEME_TOKENS } from "./themes.ts";
import {
  ANIMATE_MODES,
  type AnimateMode,
  type Diagnostic,
  SHAPES,
  type ThemeName,
} from "./types.ts";

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

const HELP = `diagramify ${VERSION}: architecture and system design diagrams with official icons

Usage:
  diagramify render <spec.yaml> [-o out] [-f svg,png,drawio,tsx,html|all] [--theme light|dark|both]
                    [--scale 3] [--animate packets|flow|none] [--static] [--font extra.ttf]
                    [--strict] [--force] [--json]
  diagramify validate <spec.yaml> [--strict] [--json]
  diagramify icons search <words...> [--pack aws] [--type service] [--limit 15] [--json]
  diagramify icons show <icon-id> [-o icon.svg|icon.png] [--theme dark]
  diagramify icons list [--pack aws] [--category Compute] [--type service] [--json]
  diagramify icons packs [--json]
  diagramify icons fetch [pack...]
  diagramify styles [--json]
  diagramify import mermaid <flowchart.mmd|-> [-o diagram.yaml]
  diagramify init [template] [-o diagram.yaml] [--list]
  diagramify doctor
  diagramify demo [out-dir]

Packs: ${PACK_ORDER.join(", ")}. Spec reference: references/spec.md in the skill folder.
Exit codes: 0 ok, 1 diagram errors (or warnings with --strict), 2 bad command line.`;

interface Args {
  _: string[];
  flags: Record<string, string | boolean>;
}

const BOOL = new Set(["json", "strict", "force", "static", "list", "help", "version"]);

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "-h") out.flags.help = true;
    else if (a.startsWith("--") || (a.startsWith("-") && a.length === 2)) {
      const eq = a.indexOf("=");
      let key = a.replace(/^--?/, "");
      let value: string | boolean | undefined;
      if (eq > 0) {
        key = a.slice(a.startsWith("--") ? 2 : 1, eq);
        value = a.slice(eq + 1);
      }
      const short: Record<string, string> = {
        o: "out",
        f: "format",
        t: "theme",
        s: "scale",
        n: "limit",
        p: "pack",
      };
      key = short[key] ?? key;
      if (value === undefined) {
        // A bare --animate (v0.1 style) means the default mode.
        if (
          BOOL.has(key) ||
          (key === "animate" && !ANIMATE_MODES.includes(argv[i + 1] as AnimateMode))
        )
          value = true;
        else {
          value = argv[i + 1];
          i += 1;
        }
      }
      if (value === undefined) usage(`--${key} needs a value`);
      const prev = out.flags[key];
      out.flags[key] =
        key === "font" && typeof prev === "string"
          ? `${prev},${value}`
          : (value as string | boolean);
    } else out._.push(a);
  }
  return out;
}

function usage(message: string): never {
  process.stderr.write(`diagramify: ${message}\n\n${HELP}\n`);
  process.exit(2);
}

const sha = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

function writeAtomic(path: string, data: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

function printDiagnostics(list: Diagnostic[], json: boolean) {
  if (json) return;
  for (const d of list) {
    const where = d.subject ? ` ${JSON.stringify(d.subject)}` : "";
    process.stderr.write(
      `${d.severity === "error" ? "error" : "warn "} ${d.code} ${d.message}${where}\n`,
    );
    for (const fix of d.fixes ?? []) process.stderr.write(`      fix: ${fix}\n`);
  }
}

function readSpec(path: string): { text: string; name: string; path: string } {
  if (path === "-") return { text: readFileSync(0, "utf8"), name: "diagram", path: "stdin.yaml" };
  const full = resolve(path);
  if (!existsSync(full)) usage(`no such spec file: ${path}`);
  return {
    text: readFileSync(full, "utf8"),
    name: basename(full).replace(/\.(ya?ml|json)$/i, ""),
    path: full,
  };
}

// ---------------------------------------------------------------- commands

async function cmdRender(args: Args, validateOnly: boolean) {
  const [specPath] = args._;
  if (!specPath) usage(`${validateOnly ? "validate" : "render"} needs a spec file`);
  const json = args.flags.json === true;
  const strict = args.flags.strict === true;
  const spec = readSpec(specPath);
  const parsed = parseSpec(spec.text, spec.path);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];
  const themeFlag = String(args.flags.theme ?? parsed.model?.theme ?? "light");
  if (!["light", "dark", "both"].includes(themeFlag)) usage(`--theme must be light, dark or both`);
  const themes: ThemeName[] = themeFlag === "both" ? ["light", "dark"] : [themeFlag as ThemeName];

  // Output path and formats.
  const outFlag = typeof args.flags.out === "string" ? args.flags.out : undefined;
  let formats: Format[];
  const fmtFlag = typeof args.flags.format === "string" ? args.flags.format : undefined;
  const outExt = outFlag ? extname(outFlag).slice(1).toLowerCase() : "";
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

  let ok = !diagnostics.some((d) => d.severity === "error");
  const receipt: Record<string, unknown> = {
    ok,
    spec: { path: spec.path, sha256: sha(spec.text) },
    outputs: [] as unknown[],
    diagnostics,
  };
  if (parsed.model && ok) {
    const scale = args.flags.scale !== undefined ? Number(args.flags.scale) : 3;
    if (!(scale > 0 && scale <= 8)) usage("--scale must be between 0 and 8");
    const fonts = typeof args.flags.font === "string" ? args.flags.font.split(",") : [];
    const animateFlag =
      args.flags.static === true
        ? "none"
        : args.flags.animate === true
          ? "packets"
          : args.flags.animate;
    if (animateFlag !== undefined && !ANIMATE_MODES.includes(animateFlag as AnimateMode))
      usage(`--animate must be ${ANIMATE_MODES.join(", ")}`);
    let result: Awaited<ReturnType<typeof renderModel>>;
    try {
      result = await renderModel({
        model: parsed.model,
        formats: validateOnly ? [] : formats,
        themes: validateOnly ? [themes[0] ?? "light"] : themes,
        name: spec.name,
        scale,
        fonts,
        animate: animateFlag as AnimateMode | undefined,
      });
    } catch (e) {
      if (!(e instanceof LibraryError)) throw e;
      result = { artifacts: [], diagnostics: [], scenes: {} };
      diagnostics.push({ severity: "error", code: "DG301", message: e.message, fixes: e.fixes });
    }
    diagnostics.push(...result.diagnostics);
    const scene = result.scenes[themes[0] ?? "light"];
    const iconsByPack: Record<string, number> = {};
    for (const n of parsed.model.nodes) {
      if (n.icon) {
        const p = n.icon.split(":")[0] ?? "";
        iconsByPack[p] = (iconsByPack[p] ?? 0) + 1;
      }
    }
    receipt.stats = {
      nodes: parsed.model.nodes.length,
      groups: parsed.model.groups.length,
      edges: parsed.model.edges.length,
      icons: iconsByPack,
      width: scene?.width,
      height: scene?.height,
    };
    const blocked = strict && diagnostics.some((d) => d.severity === "warning");
    if (!validateOnly && (!blocked || args.flags.force === true)) {
      const outputs = receipt.outputs as unknown[];
      for (const a of result.artifacts) {
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
    }
    ok = !blocked;
  }
  receipt.ok = ok && !diagnostics.some((d) => d.severity === "error");
  printDiagnostics(diagnostics, json);
  if (json) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  else {
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    const warnings = diagnostics.length - errors;
    const outputs = receipt.outputs as { path: string; bytes: number }[];
    for (const o of outputs) process.stdout.write(`wrote ${o.path} (${o.bytes} bytes)\n`);
    process.stdout.write(
      `${receipt.ok ? "ok" : "failed"}: ${errors} error(s), ${warnings} warning(s)\n`,
    );
  }
  process.exitCode = receipt.ok ? 0 : 1;
}

async function cmdIcons(args: Args) {
  const [sub, ...rest] = args._;
  const json = args.flags.json === true;
  if (sub === "packs") {
    const packs = packInfo();
    if (json) return void process.stdout.write(`${JSON.stringify(packs, null, 2)}\n`);
    for (const key of PACK_ORDER) {
      const p = packs[key];
      const from = p?.lib ? `npm ${p.lib.npm}@${p.lib.version}, loaded on first use` : "bundled";
      if (p)
        process.stdout.write(
          `${key.padEnd(7)} ${String(p.count).padStart(5)}  ${p.title} (${p.version}; ${from})\n        ${p.source}\n`,
        );
    }
    return;
  }
  if (sub === "fetch") {
    const packs = packInfo();
    const wanted = rest.length ? rest : PACK_ORDER.filter((k) => packs[k]?.lib);
    for (const key of wanted) {
      const lib = packs[key]?.lib;
      if (!lib) {
        process.stdout.write(`${key.padEnd(7)} bundled, nothing to fetch\n`);
        continue;
      }
      const before = librarySource(lib);
      await loadLibrary(key, lib);
      process.stdout.write(
        `${key.padEnd(7)} ${lib.npm}@${lib.version} ${before ? `from ${before}` : `downloaded to ${cachePath(lib)}`}\n`,
      );
    }
    return;
  }
  if (sub === "search") {
    const query = rest.join(" ");
    if (!query) usage("icons search needs words, e.g. icons search load balancer");
    const results = searchIcons(query, {
      pack: typeof args.flags.pack === "string" ? args.flags.pack : undefined,
      type: typeof args.flags.type === "string" ? args.flags.type : undefined,
      limit: args.flags.limit ? Number(args.flags.limit) : 15,
    });
    if (json) return void process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    if (!results.length) process.stdout.write(`no icons match "${query}"\n`);
    const w = Math.max(10, ...results.map((r) => r.id.length));
    for (const r of results)
      process.stdout.write(`${r.id.padEnd(w)}  ${r.name}  [${r.category}, ${r.type}]\n`);
    return;
  }
  if (sub === "list") {
    const pack = typeof args.flags.pack === "string" ? args.flags.pack : undefined;
    const category =
      typeof args.flags.category === "string" ? args.flags.category.toLowerCase() : undefined;
    const type = typeof args.flags.type === "string" ? args.flags.type : undefined;
    const list = allIcons().filter(
      (i) =>
        (!pack || i.pack === pack) &&
        (!category || i.category.toLowerCase().includes(category)) &&
        (!type || i.type === type),
    );
    if (json) return void process.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
    for (const i of list) process.stdout.write(`${i.id}  ${i.name}  [${i.category}]\n`);
    process.stdout.write(`${list.length} icons\n`);
    return;
  }
  if (sub === "show") {
    const [id] = rest;
    if (!id) usage("icons show needs an icon id");
    const info = iconInfo(id);
    if (!info) {
      const near = searchIcons(id.split(":").pop() ?? id, { limit: 5 }).map((i) => i.id);
      process.stderr.write(
        `unknown icon "${id}"${near.length ? `; closest: ${near.join(", ")}` : ""}\n`,
      );
      process.exitCode = 1;
      return;
    }
    const theme = (args.flags.theme === "dark" ? "dark" : "light") as ThemeName;
    const t = THEME_TOKENS[theme];
    await loadIconLibraries([info.id]);
    const r = renderIcon(info.id, "s", { theme, background: t.background, ink: t.text });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="96" height="96" viewBox="${r.viewBox.join(" ")}">${r.body}</svg>\n`;
    const out = typeof args.flags.out === "string" ? args.flags.out : undefined;
    if (out) {
      writeAtomic(resolve(out), out.endsWith(".png") ? await renderPng(svg, { scale: 4 }) : svg);
      process.stdout.write(`wrote ${resolve(out)}\n`);
    }
    process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
    return;
  }
  usage(`unknown icons command "${sub ?? ""}" (use search, show, list, packs or fetch)`);
}

function cmdStyles(args: Args) {
  if (args.flags.json === true) {
    return void process.stdout.write(
      `${JSON.stringify({ groups: GROUP_STYLES, shapes: SHAPES }, null, 2)}\n`,
    );
  }
  process.stdout.write("Group types (groups: { id: { type: ... } }):\n");
  for (const s of Object.values(GROUP_STYLES))
    process.stdout.write(`  ${s.key.padEnd(22)} ${s.description}\n`);
  process.stdout.write(`\nNode shapes (nodes: { id: { shape: ... } }): ${SHAPES.join(", ")}\n`);
  process.stdout.write(
    "Node looks: icon (icon over label), card (icon beside label in a box), shape\n",
  );
}

function templates(): string[] {
  if (!existsSync(examplesDir)) return [];
  return readdirSync(examplesDir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => f.replace(/\.ya?ml$/, ""))
    .sort();
}

function cmdInit(args: Args) {
  const list = templates();
  if (args.flags.list === true) {
    for (const t of list) process.stdout.write(`${t}\n`);
    return;
  }
  const name = args._[0] ?? "starter";
  const file = join(examplesDir, `${name}.yaml`);
  if (!existsSync(file)) usage(`no template "${name}" (templates: ${list.join(", ")})`);
  const out = resolve(typeof args.flags.out === "string" ? args.flags.out : "diagram.yaml");
  if (existsSync(out) && args.flags.force !== true) {
    process.stderr.write(`${out} exists; pass --force to overwrite\n`);
    process.exitCode = 1;
    return;
  }
  writeAtomic(out, readFileSync(file, "utf8"));
  process.stdout.write(
    `wrote ${out} from template ${name}\nnext: diagramify render ${basename(out)}\n`,
  );
}

function cmdImport(args: Args) {
  const [kind, file] = args._;
  if (kind !== "mermaid") usage('import supports "mermaid" (flowchart and graph diagrams)');
  if (!file) usage("import mermaid needs a file, or - for stdin");
  const text = file === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(file), "utf8");
  const result = importMermaid(text.replace(/^```mermaid\s*|```\s*$/gm, ""));
  for (const w of result.warnings) process.stderr.write(`warn  ${w}\n`);
  const out = typeof args.flags.out === "string" ? resolve(args.flags.out) : undefined;
  if (!out) return void process.stdout.write(result.yaml);
  if (existsSync(out) && args.flags.force !== true) {
    process.stderr.write(`${out} exists; pass --force to overwrite\n`);
    process.exitCode = 1;
    return;
  }
  writeAtomic(out, result.yaml);
  const guessed = Object.keys(result.guessed).length;
  process.stdout.write(
    `wrote ${out}${guessed ? ` (${guessed} icon(s) guessed from exact names)` : ""}\nnext: add icons, then diagramify validate ${basename(out)}\n`,
  );
}

async function cmdDoctor() {
  const checks: [string, boolean, string][] = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push(["node >= 22", major >= 22, process.versions.node]);
  const packs = packInfo();
  const total = Object.values(packs).reduce((s, p) => s + p.count, 0);
  checks.push([
    "icon catalogs",
    total > 1000,
    `${total} icons in ${Object.keys(packs).length} packs`,
  ]);
  const missing = Object.keys(packs).filter(
    (p) => !packs[p]?.lib && !existsSync(join(skillRoot, "assets", "icons", `${p}.json`)),
  );
  checks.push([
    "bundled icon packs",
    !missing.length,
    missing.length ? `missing ${missing.join(", ")}` : "all present",
  ]);
  const libs = Object.values(packs).flatMap((p) => (p.lib ? [p.lib] : []));
  const ready = libs.filter((lib) => librarySource(lib)).length;
  checks.push([
    "icon libraries",
    true,
    `${ready}/${libs.length} available offline${ready < libs.length ? "; the rest download on first use (icons fetch)" : ""}`,
  ]);
  try {
    const parsed = parseSpec(
      "nodes:\n  a: { icon: aws:lambda }\n  b: { icon: generic:database }\nedges:\n  - a -> b\n",
      "doctor.yaml",
    );
    if (!parsed.model) throw new Error(parsed.diagnostics.map((d) => d.message).join("; "));
    const r = await renderModel({
      model: parsed.model,
      formats: ["svg", "png"],
      themes: ["light"],
      name: "doctor",
    });
    const png = r.artifacts.find((a) => a.format === "png");
    checks.push(["layout (ELK)", true, `${r.scenes.light?.width}x${r.scenes.light?.height}`]);
    checks.push([
      "PNG (resvg wasm + Inter)",
      !!png && png.data.length > 1000,
      `${png?.data.length ?? 0} bytes`,
    ]);
  } catch (e) {
    checks.push(["render", false, (e as Error).message]);
  }
  for (const [name, pass, detail] of checks)
    process.stdout.write(`${pass ? "ok  " : "FAIL"} ${name.padEnd(26)} ${detail}\n`);
  process.exitCode = checks.every(([, p]) => p) ? 0 : 1;
}

async function cmdDemo(args: Args) {
  const dir = resolve(args._[0] ?? "diagramify-demo");
  let failed = 0;
  for (const t of templates()) {
    const text = readFileSync(join(examplesDir, `${t}.yaml`), "utf8");
    const parsed = parseSpec(text, `${t}.yaml`);
    if (!parsed.model) {
      failed += 1;
      process.stderr.write(`${t}: ${parsed.diagnostics.map((d) => d.message).join("; ")}\n`);
      continue;
    }
    const r = await renderModel({
      model: parsed.model,
      formats: ["svg", "png"],
      themes: [parsed.model.theme],
      name: t,
    });
    for (const a of r.artifacts) writeAtomic(join(dir, `${t}.${a.format}`), a.data);
    const scene = r.scenes[parsed.model.theme];
    process.stdout.write(`${t}: ${scene?.width}x${scene?.height}\n`);
  }
  process.stdout.write(`wrote ${dir}\n`);
  process.exitCode = failed ? 1 : 0;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const [cmd, ...rest] = args._;
  args._ = rest;
  if (args.flags.version === true) return void process.stdout.write(`${VERSION}\n`);
  if (!cmd || args.flags.help === true || cmd === "help")
    return void process.stdout.write(`${HELP}\n`);
  switch (cmd) {
    case "render":
      return cmdRender(args, false);
    case "validate":
    case "check":
      return cmdRender(args, true);
    case "icons":
    case "icon":
      return cmdIcons(args);
    case "styles":
      return cmdStyles(args);
    case "init":
      return cmdInit(args);
    case "import":
      return cmdImport(args);
    case "doctor":
      return cmdDoctor();
    case "demo":
      return cmdDemo(args);
    default:
      usage(`unknown command "${cmd}"`);
  }
}
