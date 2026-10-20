// icons: search, show, list, packs and fetch the catalogs; new, check and adopt local icon files.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  allIcons,
  iconInfo,
  loadIconLibraries,
  PACK_ORDER,
  packInfo,
  renderIcon,
  searchIcons,
} from "../icons/index.ts";
import { cachePath, librarySource, loadLibrary } from "../icons/libraries.ts";
import {
  adoptIcon,
  checkIcon,
  ICON_RULES,
  LocalIconError,
  shownPath,
  starterIcon,
} from "../icons/local/index.ts";
import { renderModel } from "../render/index.ts";
import { renderPng } from "../render/png.ts";
import { parseSpec } from "../spec/index.ts";
import { THEME_TOKENS } from "../themes.ts";
import { SKINS, type ThemeName } from "../types.ts";
import { type Args, closest } from "./args.ts";
import { usage, writeAtomic } from "./io.ts";

export async function cmdIcons(args: Args) {
  const [sub, ...rest] = args._;
  const json = args.flags.json === true;
  switch (sub) {
    case "packs":
      return iconPacks(json);
    case "fetch":
      return iconFetch(rest);
    case "search":
      return iconSearch(args, rest, json);
    case "list":
      return iconList(args, json);
    case "show":
      return iconShow(args, rest);
    case "new":
      return iconNew(args, rest);
    case "check":
      return iconCheck(args, rest);
    case "adopt":
      return iconAdopt(args, rest);
    default:
      usage(
        `unknown icons command "${sub ?? ""}" (use search, show, list, packs, fetch, new, check or adopt)`,
      );
  }
}

const ICON_NAME = /^[a-z0-9][a-z0-9-]*$/;
const OWNED_MARK =
  "reminder: a mark owned by someone else is theirs to publish; adopting it does not license it.";

function iconPacks(json: boolean) {
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
}

async function iconFetch(rest: string[]) {
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
}

function iconSearch(args: Args, rest: string[], json: boolean) {
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
}

function iconList(args: Args, json: boolean) {
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
}

async function iconShow(args: Args, rest: string[]) {
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
}

/** The <dir>/<name>.svg a command writes, or undefined (exit code 1) when it exists without --force. */
function iconTarget(args: Args, name: string): string | undefined {
  const file = join(
    resolve(typeof args.flags.dir === "string" ? args.flags.dir : "icons"),
    `${name}.svg`,
  );
  if (existsSync(file) && args.flags.force !== true) {
    process.stderr.write(`${shownPath(file)} exists; pass --force to overwrite\n`);
    process.exitCode = 1;
    return undefined;
  }
  return file;
}

function iconNew(args: Args, rest: string[]) {
  const [name] = rest;
  if (!name || !ICON_NAME.test(name))
    usage("icons new needs a name of lowercase letters, digits and -, e.g. icons new invoice");
  const file = iconTarget(args, name);
  if (!file) return;
  writeAtomic(file, starterIcon(name));
  const shown = shownPath(file);
  process.stdout.write(
    `wrote ${shown}: a 24 grid starter (stroke 1.5, round caps and joins, currentColor)\n\nDrawing rules (references/icons.md in the skill folder has each one in full):\n`,
  );
  for (const r of ICON_RULES) process.stdout.write(`  ${r.id}  ${r.title}\n`);
  process.stdout.write(
    `\nnext:\n  1. replace the placeholder parts with the drawing: two to six parts, silhouette first\n  2. orrery icons check ${shown}   (writes ${name}.sheet.png next to it; look at it)\n  3. in the spec: icons: { ${name}: ./${shown} }, then icon: local:${name}\n`,
  );
}

async function iconCheck(args: Args, rest: string[]) {
  const [file] = rest;
  if (!file) usage("icons check needs an .svg file");
  if (!existsSync(file)) usage(`no such file: ${file}`);
  const out = typeof args.flags.out === "string" ? resolve(args.flags.out) : undefined;
  process.exitCode = (await checkIconFile(resolve(file), out)) ? 0 : 1;
}

async function iconAdopt(args: Args, rest: string[]) {
  const [src] = rest;
  const name = args.flags.name;
  if (!src) usage("icons adopt needs an .svg file");
  if (typeof name !== "string" || !ICON_NAME.test(name))
    usage("icons adopt needs --name <name> of lowercase letters, digits and -");
  if (!existsSync(src)) usage(`no such file: ${src}`);
  const file = iconTarget(args, name);
  if (!file) return;
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
}

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
  // The sheet loads the file the way a diagram does, so the loader's own limits (file size) apply.
  let png: Uint8Array;
  try {
    png = await iconSheet(path);
  } catch (e) {
    if (!(e instanceof LocalIconError)) throw e;
    process.stderr.write(
      `error ${shown} ${e.problem}; no contact sheet written\n      fix: ${e.fix}\n`,
    );
    return false;
  }
  writeAtomic(sheet, png);
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
