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
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { cmdDoc } from "./doc.ts";
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
import {
  adoptIcon,
  checkIcon,
  ICON_RULES,
  LocalIconError,
  shownPath,
  starterIcon,
} from "./local-icons.ts";
import { cmdMcp } from "./mcp.ts";
import { cmdPatch } from "./patch.ts";
import { examplesDir, skillRoot } from "./paths.ts";
import { FORMATS, type Format, renderModel } from "./render/index.ts";
import { renderPng } from "./render/png.ts";
import { DEFAULT_REVIEW_WIDTH, formatReview, reviewModel } from "./review.ts";
import { distance, parseSpec } from "./spec.ts";
import { GROUP_STYLES } from "./styles.ts";
import { THEME_TOKENS } from "./themes.ts";
import {
  ANIMATE_MODES,
  type AnimateMode,
  type Diagnostic,
  SHAPES,
  SKINS,
  type Skin,
  type ThemeName,
} from "./types.ts";
import { cmdWatch } from "./watch.ts";

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

const HELP = `orrery ${VERSION}: architecture and system design diagrams with official icons

Usage:
  orrery render <spec.yaml> [-o out] [-f svg,png,drawio,tsx,html|all] [--theme light|dark|both]
                    [--scale 3] [--skin classic|stage] [--animate packets|flow|relay|none]
                    [--static] [--font extra.ttf]
                    [--strict] [--force] [--json]
  orrery validate <spec.yaml> [--strict] [--json]
  orrery review <spec.yaml> [-o out] [--width 880] [--theme light|dark] [--skin classic|stage]
                    [--strict] [--json]
  orrery icons search <words...> [--pack aws] [--type service] [--limit 15] [--json]
  orrery icons show <icon-id> [-o icon.svg|icon.png] [--theme dark]
  orrery icons list [--pack aws] [--category Compute] [--type service] [--json]
  orrery icons packs [--json]
  orrery icons fetch [pack...]
  orrery icons new <name> [--dir icons] [--force]
  orrery icons check <icon.svg> [-o sheet.png]
  orrery icons adopt <file.svg> --name <name> [--dir icons] [--force]
  orrery watch <spec.yaml> [-o out] [-f svg,png] [--theme dark] [--skin stage] [--review]
  orrery patch <spec.yaml> <candidates.json|-> [-o best.yaml] [--width 880] [--theme dark] [--json]
  orrery doc <design.md> [-o out.html|out.md|out.docx] [-f html,md,docx] [--theme light]
  orrery mcp [--port 8765]
  orrery styles [--json]
  orrery import mermaid <flowchart.mmd|-> [-o diagram.yaml]
  orrery init [template] [-o diagram.yaml] [--list]
  orrery doctor
  orrery demo [out-dir]

Packs: ${PACK_ORDER.join(", ")}. Spec reference: references/spec.md in the skill folder.
Exit codes: 0 ok, 1 diagram errors (or warnings with --strict), 2 bad command line.`;

export interface Args {
  _: string[];
  flags: Record<string, string | boolean>;
}

const BOOL = new Set(["json", "strict", "force", "static", "list", "help", "version", "review"]);
const KNOWN_FLAGS = new Set([
  ...BOOL,
  "out",
  "format",
  "theme",
  "scale",
  "animate",
  "skin",
  "font",
  "pack",
  "type",
  "limit",
  "category",
  "width",
  "dir",
  "name",
  "port",
]);

/** The option a typo most likely meant: a prefix match (--formats, --output) or a near spelling. */
function closest(word: string, options: Iterable<string>): string | undefined {
  const w = word.toLowerCase();
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const o of options) {
    const prefix = w.length >= 3 && (o.startsWith(w) || w.startsWith(o));
    const d = prefix ? 0 : distance(w, o);
    if (d < bestScore) {
      bestScore = d;
      best = o;
    }
  }
  return bestScore <= Math.max(2, Math.floor(w.length / 3)) ? best : undefined;
}

// A bare --animate (v0.1 style) means packets when it is followed by nothing, another flag or a
// spec file; anything else after it must be a mode.
const SPEC_FILE = /\.(ya?ml|json)$/i;

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "-h") out.flags.help = true;
    else if (a.startsWith("--") || (a.startsWith("-") && (a.length === 2 || a[2] === "="))) {
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
      if (!KNOWN_FLAGS.has(key)) {
        const near = closest(key, KNOWN_FLAGS);
        usage(
          `unknown flag ${eq > 0 ? a.slice(0, eq) : a}${near ? ` (did you mean --${near}?)` : ""}`,
        );
      }
      if (value === undefined) {
        const next = argv[i + 1];
        if (BOOL.has(key)) value = true;
        else if (
          key === "animate" &&
          !ANIMATE_MODES.includes(next as AnimateMode) &&
          (next === undefined || next.startsWith("-") || SPEC_FILE.test(next))
        )
          value = true;
        else {
          value = next;
          i += 1;
        }
      }
      if (value === undefined) usage(`--${key} needs a value`);
      // --strict=true / --json=false: every consumer tests `=== true`, so a string must not leak.
      if (BOOL.has(key) && typeof value === "string") {
        const b = value.toLowerCase();
        if (b !== "true" && b !== "false") usage(`--${key} must be true or false (got "${value}")`);
        value = b === "true";
      }
      if (key === "animate" && value !== true && !ANIMATE_MODES.includes(value as AnimateMode))
        usage(`--animate must be ${ANIMATE_MODES.join(", ")} (got "${value}")`);
      if (key === "skin" && !SKINS.includes(value as Skin))
        usage(`--skin must be ${SKINS.join(", ")} (got "${value}")`);
      const prev = out.flags[key];
      out.flags[key] =
        key === "font" && typeof prev === "string"
          ? `${prev},${value}`
          : (value as string | boolean);
    } else out._.push(a);
  }
  return out;
}

export function usage(message: string): never {
  process.stderr.write(`orrery: ${message}\n\n${HELP}\n`);
  process.exit(2);
}

const sha = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

export function writeAtomic(path: string, data: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

export function printDiagnostics(list: Diagnostic[], json: boolean) {
  if (json) return;
  for (const d of list) {
    const where = d.subject ? ` ${JSON.stringify(d.subject)}` : "";
    process.stderr.write(
      `${d.severity === "error" ? "error" : "warn "} ${d.code} ${d.message}${where}\n`,
    );
    for (const fix of d.fixes ?? []) process.stderr.write(`      fix: ${fix}\n`);
  }
}

/** A render stopped by a library download or a bad local icon file, as a diagnostic. */
export function renderFailure(e: unknown): Diagnostic | undefined {
  if (e instanceof LibraryError)
    return { severity: "error", code: "DG301", message: e.message, fixes: e.fixes };
  if (e instanceof LocalIconError)
    return {
      severity: "error",
      code: "DG111",
      message: `icon file ${e.file} ${e.problem}`,
      subject: { where: "icons", file: e.file },
      fixes: [e.fix],
    };
  return undefined;
}

export function readSpec(path: string): { text: string; name: string; path: string } {
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
  const themeFlag = String(args.flags.theme ?? parsed.model?.theme ?? "dark");
  if (!["light", "dark", "both"].includes(themeFlag)) usage(`--theme must be light, dark or both`);
  const themes: ThemeName[] = themeFlag === "both" ? ["light", "dark"] : [themeFlag as ThemeName];
  const fonts = typeof args.flags.font === "string" ? args.flags.font.split(",") : [];
  for (const f of fonts) if (!existsSync(f)) usage(`no such file: ${f} (from --font)`);

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
    const animateFlag =
      args.flags.static === true
        ? "none"
        : args.flags.animate === true
          ? "packets"
          : args.flags.animate;
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
        skin: args.flags.skin as Skin | undefined,
      });
    } catch (e) {
      const failure = renderFailure(e);
      if (!failure) throw e;
      result = { artifacts: [], diagnostics: [], scenes: {} };
      diagnostics.push(failure);
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
      if (Object.hasOwn(packs, key)) continue;
      const near = closest(key, Object.keys(packs));
      usage(
        `unknown pack "${key}"${near ? ` (did you mean ${near}?)` : ""}; packs: ${PACK_ORDER.join(", ")}`,
      );
    }
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
    const limit = args.flags.limit;
    if (limit !== undefined && !/^[1-9]\d*$/.test(String(limit)))
      usage(`--limit must be a positive integer (got "${limit}")`);
    const results = searchIcons(query, {
      pack: typeof args.flags.pack === "string" ? args.flags.pack : undefined,
      type: typeof args.flags.type === "string" ? args.flags.type : undefined,
      limit: limit === undefined ? 15 : Number(limit),
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
    const theme = (args.flags.theme === "light" ? "light" : "dark") as ThemeName;
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
  if (sub === "new") {
    const [name] = rest;
    if (!name || !ICON_NAME.test(name))
      usage("icons new needs a name of lowercase letters, digits and -, e.g. icons new invoice");
    const file = join(
      resolve(typeof args.flags.dir === "string" ? args.flags.dir : "icons"),
      `${name}.svg`,
    );
    if (existsSync(file) && args.flags.force !== true) {
      process.stderr.write(`${shownPath(file)} exists; pass --force to overwrite\n`);
      process.exitCode = 1;
      return;
    }
    writeAtomic(file, starterIcon(name));
    const shown = shownPath(file);
    process.stdout.write(
      `wrote ${shown}: a 24 grid starter (stroke 1.5, round caps and joins, currentColor)\n\nDrawing rules (references/icons.md in the skill folder has each one in full):\n`,
    );
    for (const r of ICON_RULES) process.stdout.write(`  ${r.id}  ${r.title}\n`);
    process.stdout.write(
      `\nnext:\n  1. replace the placeholder parts with the drawing: two to six parts, silhouette first\n  2. orrery icons check ${shown}   (writes ${name}.sheet.png next to it; look at it)\n  3. in the spec: icons: { ${name}: ./${shown} }, then icon: local:${name}\n`,
    );
    return;
  }
  if (sub === "check") {
    const [file] = rest;
    if (!file) usage("icons check needs an .svg file");
    if (!existsSync(file)) usage(`no such file: ${file}`);
    const out = typeof args.flags.out === "string" ? resolve(args.flags.out) : undefined;
    process.exitCode = (await checkIconFile(resolve(file), out)) ? 0 : 1;
    return;
  }
  if (sub === "adopt") {
    const [src] = rest;
    const name = args.flags.name;
    if (!src) usage("icons adopt needs an .svg file");
    if (typeof name !== "string" || !ICON_NAME.test(name))
      usage("icons adopt needs --name <name> of lowercase letters, digits and -");
    if (!existsSync(src)) usage(`no such file: ${src}`);
    const file = join(
      resolve(typeof args.flags.dir === "string" ? args.flags.dir : "icons"),
      `${name}.svg`,
    );
    if (existsSync(file) && args.flags.force !== true) {
      process.stderr.write(`${shownPath(file)} exists; pass --force to overwrite\n`);
      process.exitCode = 1;
      return;
    }
    const from = shownPath(resolve(src));
    let ok = false;
    try {
      const adopted = adoptIcon(readFileSync(resolve(src), "utf8"), from);
      writeAtomic(file, adopted.svg);
      process.stdout.write(`wrote ${shownPath(file)} from ${from}\n`);
      for (const note of adopted.notes) process.stdout.write(`  ${note}\n`);
      const out = typeof args.flags.out === "string" ? resolve(args.flags.out) : undefined;
      ok = await checkIconFile(file, out);
    } catch (e) {
      if (!(e instanceof LocalIconError)) throw e;
      process.stderr.write(`error ${e.file} ${e.problem}\n      fix: ${e.fix}\n`);
    }
    process.stdout.write(`${OWNED_MARK}\n`);
    process.exitCode = ok ? 0 : 1;
    return;
  }
  usage(
    `unknown icons command "${sub ?? ""}" (use search, show, list, packs, fetch, new, check or adopt)`,
  );
}

const ICON_NAME = /^[a-z0-9][a-z0-9-]*$/;
const OWNED_MARK =
  "reminder: a mark owned by someone else is theirs to publish; adopting it does not license it.";

/** Prints every rule's verdict and writes the contact sheet; true when the icon passes. */
async function checkIconFile(path: string, out?: string): Promise<boolean> {
  const shown = shownPath(path);
  let check: ReturnType<typeof checkIcon>;
  try {
    check = checkIcon(readFileSync(path, "utf8"), shown);
  } catch (e) {
    if (!(e instanceof LocalIconError)) throw e;
    process.stderr.write(`error ${shown} ${e.problem}\n      fix: ${e.fix}\n`);
    return false;
  }
  const [x0, y0, x1, y1] = check.box;
  process.stdout.write(
    `${shown}: drawn from ${x0},${y0} to ${x1},${y1}; ${check.parts} part(s), ${check.commands} command(s), stroke ${check.widths.join(", ") || "none"}\n`,
  );
  for (const r of check.results) {
    if (r.ok) process.stdout.write(`ok    ${r.id} ${r.title}${r.note ? ` (${r.note})` : ""}\n`);
    else
      process.stdout.write(
        `FAIL  ${r.id} ${r.title}: ${r.problems.join("; ")}\n      fix: ${r.fix}\n`,
      );
  }
  const sheet = out
    ? extname(out)
      ? out
      : `${out}.png`
    : join(dirname(path), `${basename(path, extname(path))}.sheet.png`);
  writeAtomic(sheet, await iconSheet(path));
  const failing = check.results.filter((r) => !r.ok).length;
  process.stdout.write(
    `wrote ${shownPath(sheet)}: look at all four tiles before handing over (IC10)\n${failing ? `failed: ${failing} rule(s)` : "ok: every rule passes"}\n`,
  );
  return !failing;
}

/**
 * The icon at 48 and 24 px in classic and stage, light and dark, drawn by the real renderers from
 * a two-node spec, so the sheet shows what a diagram will show.
 */
async function iconSheet(path: string): Promise<Uint8Array> {
  const name =
    basename(path, extname(path))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "icon";
  const file = path.replaceAll("\\", "/").replaceAll("'", "''");
  const tiles: { svg: string; w: number; h: number; caption: string }[] = [];
  for (const skin of SKINS) {
    const spec = [
      `skin: ${skin}`,
      "animate: none",
      `icons: { ${name}: '${file}' }`,
      "nodes:",
      `  large: { icon: "local:${name}", label: 48 px, size: 48 }`,
      `  small: { icon: "local:${name}", label: 24 px, size: 24 }`,
    ].join("\n");
    const parsed = parseSpec(spec, join(dirname(path), "sheet.yaml"));
    if (!parsed.model) throw new Error(parsed.diagnostics.map((d) => d.message).join("; "));
    const r = await renderModel({
      model: parsed.model,
      formats: ["svg"],
      themes: ["light", "dark"],
      name: `${name}-${skin}`,
    });
    for (const a of r.artifacts)
      tiles.push({ svg: String(a.data), w: a.width, h: a.height, caption: `${skin} ${a.theme}` });
  }
  const pad = 16;
  const cap = 22;
  const cw = Math.max(...tiles.map((t) => t.w));
  const ch = Math.max(...tiles.map((t) => t.h));
  const w = 2 * cw + 3 * pad;
  const h = 2 * (ch + cap) + 3 * pad;
  const body = tiles
    .map((t, i) => {
      const x = pad + (i % 2) * (cw + pad);
      const y = pad + Math.floor(i / 2) * (ch + cap + pad);
      return `<text x="${x}" y="${y + 14}" font-size="12" fill="#52525b">${t.caption}</text>${t.svg.replace("<svg ", `<svg x="${x}" y="${y + cap}" `)}`;
    })
    .join("");
  return renderPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Inter"><rect width="${w}" height="${h}" fill="#f4f4f5"/>${body}</svg>`,
    { scale: 2 },
  );
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
  const text = readFileSync(file, "utf8");
  writeAtomic(out, text);
  process.stdout.write(`wrote ${out} from template ${name}\n`);
  // A template's own icons go along, at the same place relative to the spec.
  for (const icon of parseSpec(text, file).model?.icons ?? []) {
    const rel = relative(examplesDir, icon.path);
    const dest = join(dirname(out), rel);
    if (rel.startsWith("..") || (existsSync(dest) && args.flags.force !== true)) continue;
    writeAtomic(dest, readFileSync(icon.path));
    process.stdout.write(`wrote ${dest}\n`);
  }
  process.stdout.write(`next: orrery render ${basename(out)}\n`);
}

function cmdImport(args: Args) {
  const [kind, file] = args._;
  if (kind !== "mermaid") usage('import supports "mermaid" (flowchart and graph diagrams)');
  if (!file) usage("import mermaid needs a file, or - for stdin");
  if (file !== "-" && !existsSync(resolve(file))) usage(`no such file: ${file}`);
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
    `wrote ${out}${guessed ? ` (${guessed} icon(s) guessed from exact names)` : ""}\nnext: add icons, then orrery validate ${basename(out)}\n`,
  );
}

/** Measures the diagram at the width readers see it and writes <out>.review.json and .review.png. */
async function cmdReview(args: Args) {
  const [specPath] = args._;
  if (!specPath) usage("review needs a spec file");
  const width = args.flags.width === undefined ? DEFAULT_REVIEW_WIDTH : Number(args.flags.width);
  if (!(width > 0)) usage("--width must be a positive number of px");
  const spec = readSpec(specPath);
  const parsed = parseSpec(spec.text, spec.path);
  if (!parsed.model) {
    printDiagnostics(parsed.diagnostics, false);
    process.exitCode = 1;
    return;
  }
  const theme = args.flags.theme ?? parsed.model.theme;
  if (theme !== "light" && theme !== "dark") usage("--theme must be light or dark");
  const fonts = typeof args.flags.font === "string" ? args.flags.font.split(",") : [];
  for (const f of fonts) if (!existsSync(f)) usage(`no such file: ${f} (from --font)`);
  const outFlag = typeof args.flags.out === "string" ? args.flags.out : undefined;
  const base = outFlag
    ? resolve(outFlag)
    : spec.path === "stdin.yaml"
      ? resolve("diagram")
      : spec.path.replace(/\.(ya?ml|json)$/i, "");
  const skin = args.flags.skin as Skin | undefined;
  let run: Awaited<ReturnType<typeof reviewModel>>;
  try {
    run = await reviewModel({
      model: skin ? { ...parsed.model, skin } : parsed.model,
      name: spec.name,
      width,
      theme,
      fonts,
      diagnostics: parsed.diagnostics,
    });
  } catch (e) {
    const failure = renderFailure(e);
    if (!failure) throw e;
    printDiagnostics([failure], false);
    process.exitCode = 1;
    return;
  }
  writeAtomic(`${base}.review.json`, `${JSON.stringify(run.report, null, 2)}\n`);
  if (run.png) writeAtomic(`${base}.review.png`, run.png);
  if (args.flags.json === true) process.stdout.write(`${JSON.stringify(run.report, null, 2)}\n`);
  else
    process.stdout.write(
      `${formatReview(run.report)}\n\nwrote ${base}.review.json${run.png ? ` and ${base}.review.png` : ""}\n`,
    );
  // The report carries the verdict; --strict turns a failing review into a failing exit code.
  process.exitCode = args.flags.strict === true && !run.report.pass ? 1 : 0;
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
  const dir = resolve(args._[0] ?? "orrery-demo");
  let failed = 0;
  let libraryFixes: string[] | undefined;
  for (const t of templates()) {
    const file = join(examplesDir, `${t}.yaml`);
    // The full path: a template's icons: files resolve against its folder.
    const parsed = parseSpec(readFileSync(file, "utf8"), file);
    if (!parsed.model) {
      failed += 1;
      process.stderr.write(`${t}: ${parsed.diagnostics.map((d) => d.message).join("; ")}\n`);
      continue;
    }
    let r: Awaited<ReturnType<typeof renderModel>>;
    try {
      r = await renderModel({
        model: parsed.model,
        formats: ["svg", "png"],
        themes: [parsed.model.theme],
        name: t,
      });
    } catch (e) {
      // Offline, a template that needs an npm icon library fails alone; the rest still render.
      const failure = renderFailure(e);
      if (!failure) throw e;
      failed += 1;
      if (e instanceof LibraryError) libraryFixes ??= e.fixes;
      process.stderr.write(`${t}: error ${failure.code} ${failure.message}\n`);
      continue;
    }
    for (const a of r.artifacts) writeAtomic(join(dir, `${t}.${a.format}`), a.data);
    const scene = r.scenes[parsed.model.theme];
    process.stdout.write(`${t}: ${scene?.width}x${scene?.height}\n`);
  }
  for (const fix of libraryFixes ?? []) process.stderr.write(`      fix: ${fix}\n`);
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
    case "review":
      return cmdReview(args);
    case "icons":
    case "icon":
      return cmdIcons(args);
    case "styles":
      return cmdStyles(args);
    case "init":
      return cmdInit(args);
    case "import":
      return cmdImport(args);
    case "watch":
      return cmdWatch(args);
    case "patch":
      return cmdPatch(args);
    case "doc":
      return cmdDoc(args);
    case "mcp":
      return cmdMcp(args);
    case "doctor":
      return cmdDoctor();
    case "demo":
      return cmdDemo(args);
    default:
      usage(`unknown command "${cmd}"`);
  }
}
