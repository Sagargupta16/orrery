// styles, init and import: the catalog of group styles, starting specs and converted Mermaid,
// infrastructure, pictures and SQL DDL.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { importCloudFormation } from "../import/cloudformation.ts";
import { importCompose } from "../import/compose.ts";
import { importKubernetes } from "../import/kubernetes.ts";
import { importMermaid } from "../import/mermaid.ts";
import { importPicture } from "../import/picture.ts";
import { importSql, sqlWarnings } from "../import/sql.ts";
import { importTerraform } from "../import/terraform.ts";
import type { Imported } from "../import/types.ts";
import { examplesDir } from "../paths.ts";
import { parseSpec } from "../spec/index.ts";
import { isObj, readText } from "../spec/values.ts";
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

/** The text an importer reads: stdin for -, else the file, by its byte order mark. */
const inputText = (file: string) => readText(file === "-" ? 0 : resolve(file));

/** Each importer reads its own input (a file, a folder, - for stdin where it makes sense). */
const IMPORTERS: Record<string, (path: string) => Imported | Promise<Imported>> = {
  mermaid: (file) => importMermaid(inputText(file).replace(/^```mermaid\s*|```\s*$/gm, "")),
  terraform: importTerraform,
  cloudformation: importCloudFormation,
  cdk: importCloudFormation,
  compose: importCompose,
  kubernetes: importKubernetes,
  k8s: importKubernetes,
  picture: importPicture,
  // SQL DDL to an er spec; evidence: names the file as given, so it stays relative (none for -).
  sql: (file) => {
    const text = inputText(file);
    return { yaml: importSql(text, file), warnings: sqlWarnings(text) };
  },
};

/** The importers that read - as standard input; the others read files or folders. */
const STDIN = new Set(["mermaid", "sql"]);

/** Whether the imported spec has any node; one with none cannot validate, so none is written. */
function hasNodes(yaml: string): boolean {
  const doc: unknown = parseYaml(yaml);
  const nodes = isObj(doc) ? doc.nodes : undefined;
  return Array.isArray(nodes) ? nodes.length > 0 : isObj(nodes) && Object.keys(nodes).length > 0;
}

export async function cmdImport(args: Args) {
  const [kind, file] = args._;
  const importer = kind && Object.hasOwn(IMPORTERS, kind) ? IMPORTERS[kind] : undefined;
  if (!kind || !importer) usage(`import supports ${Object.keys(IMPORTERS).join(", ")}`);
  if (!file) usage(`import ${kind} needs a file${STDIN.has(kind) ? ", or - for stdin" : ""}`);
  if (file === "-" && !STDIN.has(kind))
    usage(`import ${kind} reads a file or folder; - (stdin) is only for mermaid and sql`);
  if (file !== "-" && !existsSync(resolve(file))) usage(`no such file: ${file}`);
  const result = await importer(file);
  for (const w of result.warnings) process.stderr.write(`warn  ${w}\n`);
  if (!hasNodes(result.yaml)) {
    process.stderr.write(`error nothing to draw: ${file} gave no nodes, so no spec was written\n`);
    process.exitCode = 1;
    return;
  }
  const out = typeof args.flags.out === "string" ? resolve(args.flags.out) : undefined;
  if (!out) return void process.stdout.write(result.yaml);
  if (existsSync(out) && args.flags.force !== true) {
    process.stderr.write(`${out} exists; pass --force to overwrite\n`);
    process.exitCode = 1;
    return;
  }
  writeAtomic(out, result.yaml);
  const guessed = Object.keys(result.guessed ?? {}).length;
  process.stdout.write(
    `wrote ${out}${guessed ? ` (${guessed} icon(s) guessed from exact names)` : ""}\nnext: ${kind === "sql" ? "group related tables" : "add icons"}, then orrery validate ${basename(out)}\n`,
  );
}
