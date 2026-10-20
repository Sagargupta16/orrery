// styles, init and import: the catalog of group styles, starting specs and converted Mermaid.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { importMermaid } from "../import/mermaid.ts";
import { examplesDir } from "../paths.ts";
import { parseSpec } from "../spec/index.ts";
import { GROUP_STYLES } from "../styles.ts";
import { SHAPES } from "../types.ts";
import type { Args } from "./args.ts";
import { usage, writeAtomic } from "./io.ts";

export function cmdStyles(args: Args) {
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

export function templates(): string[] {
  if (!existsSync(examplesDir)) return [];
  return readdirSync(examplesDir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => f.replace(/\.ya?ml$/, ""))
    .sort();
}

export function cmdInit(args: Args) {
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

export function cmdImport(args: Args) {
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
