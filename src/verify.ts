// orrery verify: every `evidence:` on a node, group or edge must still point at a real file, a
// line inside it and, when it names one, an identifier on that line; --link turns each into a
// commit-pinned permalink on the node's url.
//
// Forms: `path:line`, `path:line-line`, `path:line#name`, `path#name`, a bare path, or a resource
// address: Terraform (`aws_lambda_function.api`, `module.vpc.aws_subnet.private[0]`,
// `module.vpc`) found as its resource, data or module block in the repo's .tf files, Kubernetes
// (`Deployment/orders`) found as a document with that kind and name in its YAML or JSON, and
// anything else found as its last segment in the repo's .tf, .yaml, .yml or .json files.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Args } from "./cli/args.ts";
import { printDiagnostics, readSpec, usage, writeAtomic } from "./cli/io.ts";
import { edgeName } from "./diff.ts";
import { applyPatches, PatchError } from "./patch/index.ts";
import { parseSpec } from "./spec/index.ts";
import type { Model } from "./types.ts";

/** What an evidence entry is about: a node or group id, or an edge as `from -> to`. */
export interface EvidenceSubject {
  kind: "node" | "group" | "edge";
  id: string;
}

/** One evidence entry, checked. */
export interface EvidenceResult {
  subject: EvidenceSubject;
  evidence: string;
  ok: boolean;
  /** The file it points at: repo-relative with forward slashes, absolute outside a repo. */
  file?: string;
  line?: number;
  end?: number;
  problem?: string;
  fix?: string;
}

/** A node url --link set (or kept, when the node already links somewhere else). */
export interface NodeLink {
  node: string;
  evidence: string;
  url: string;
  kept?: boolean;
}

export interface VerifyReport {
  ok: boolean;
  spec: string;
  checked: number;
  problems: EvidenceResult[];
  results: EvidenceResult[];
  /** --link: the commit the links pin, every node url, and whether the spec was rewritten. */
  commit?: string;
  links?: NodeLink[];
  wrote?: boolean;
}

// ---------------------------------------------------------------- evidence forms

type Ref =
  | { form: "lines"; path: string; line: number; end?: number; id?: string }
  | { form: "name"; path: string; id: string }
  | { form: "bare"; text: string };

const LINES = /^(.+):(\d+)(?:-(\d+))?(?:#(.*))?$/;
const TF_RESOURCE =
  /^(?:module\.[\w-]+(?:\[[^\]]*\])?\.)*(?:(data)\.)?([a-z][a-z0-9]*_[a-z0-9_]+)\.([\w-]+)(?:\[[^\]]*\])?$/;
const TF_MODULE = /^(?:module\.[\w-]+(?:\[[^\]]*\])?\.)*module\.([\w-]+)(?:\[[^\]]*\])?$/;
const K8S = /^(?:[a-z0-9][a-z0-9-]*\/)?([A-Z][A-Za-z0-9]*)\/([a-z0-9][a-z0-9.-]*)$/;
const ADDRESS_FILES = /\.(tf|ya?ml|json)$/i;

export function parseEvidence(raw: string): Ref {
  const m = LINES.exec(raw);
  if (m)
    return {
      form: "lines",
      path: m[1] ?? "",
      line: Number(m[2]),
      ...(m[3] ? { end: Number(m[3]) } : {}),
      ...(m[4] !== undefined ? { id: m[4] } : {}),
    };
  const hash = raw.lastIndexOf("#");
  if (hash > 0) return { form: "name", path: raw.slice(0, hash), id: raw.slice(hash + 1) };
  return { form: "bare", text: raw };
}

// ---------------------------------------------------------------- the repo

interface Repo {
  spec: string;
  specDir: string;
  /** The git work tree the spec lives in, if any. */
  root?: string;
  files?: string[];
  lines: Map<string, string[] | null>;
}

function git(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 256 * 1024 * 1024,
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * A path as the file system names it. On Windows a temp folder can read as an 8.3 short name
 * (RUNNER~1) while git names the same folder in full, and relative() between them leaves the repo.
 */
function real(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

function openRepo(specPath: string): Repo {
  const spec = real(specPath);
  const specDir = dirname(spec);
  const root = git(specDir, ["rev-parse", "--show-toplevel"]);
  return { spec, specDir, ...(root ? { root: real(resolve(root)) } : {}), lines: new Map() };
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "out", "build", "vendor"]);

/** Every file in the repo (git's view, ignored files left out), or under the spec's folder. */
function repoFiles(repo: Repo): string[] {
  if (repo.files) return repo.files;
  const root = repo.root;
  const listed = root
    ? git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    : undefined;
  if (root && listed !== undefined)
    repo.files = listed
      .split("\0")
      .filter(Boolean)
      .map((f) => join(root, f));
  else {
    const found: string[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 12 || found.length > 20000) return;
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        if (d.isDirectory() && !d.name.startsWith(".") && !SKIP_DIRS.has(d.name))
          walk(join(dir, d.name), depth + 1);
        else if (d.isFile()) found.push(join(dir, d.name));
      }
    };
    walk(repo.specDir, 0);
    repo.files = found;
  }
  return repo.files;
}

/** The file's lines, or null when it cannot be read (or is too big to search). */
function linesOf(repo: Repo, file: string, maxBytes = Number.POSITIVE_INFINITY): string[] | null {
  if (repo.lines.has(file)) return repo.lines.get(file) ?? null;
  let lines: string[] | null = null;
  try {
    const st = statSync(file);
    if (st.isFile() && st.size <= maxBytes) {
      const text = readFileSync(file, "utf8");
      lines = text.split(/\r?\n/);
      if (text.endsWith("\n")) lines.pop();
    }
  } catch {
    lines = null;
  }
  // A big file read for its line count is not cached for searches, which skip it.
  if (maxBytes === Number.POSITIVE_INFINITY || lines) repo.lines.set(file, lines);
  return lines;
}

/** Repo-relative with forward slashes when inside the repo, else absolute. */
function display(repo: Repo, file: string): string {
  const base = repo.root ?? repo.specDir;
  const rel = relative(base, file);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep).join("/") : file;
}

/** Where a written path points: the spec's folder first, then the repo root. */
function locate(repo: Repo, path: string): { file: string; dir: boolean } | undefined {
  const candidates = isAbsolute(path)
    ? [path]
    : [resolve(repo.specDir, path), ...(repo.root ? [resolve(repo.root, path)] : [])];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    return { file, dir: statSync(file).isDirectory() };
  }
  return undefined;
}

/** A pattern for `id` as a whole word when its ends are word characters. */
function wordPattern(id: string): RegExp {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pre = /^[\w$]/.test(id) ? "(?<![\\w$])" : "";
  const post = /[\w$]$/.test(id) ? "(?![\\w$])" : "";
  return new RegExp(`${pre}${escaped}${post}`);
}

/** 1-based numbers of the lines `re` matches. */
const hitsIn = (lines: string[], re: RegExp): number[] =>
  lines.flatMap((l, i) => (re.test(l) ? [i + 1] : []));

const SEARCH_LIMIT = 2 * 1024 * 1024;

/** The first other file (same extension) that has `id`, as `path:line`. */
function elsewhere(repo: Repo, id: string, ext: string, skip: string): string | undefined {
  const re = wordPattern(id);
  for (const f of repoFiles(repo)) {
    if (f === skip || extname(f).toLowerCase() !== ext) continue;
    const lines = linesOf(repo, f, SEARCH_LIMIT);
    const hit = lines ? hitsIn(lines, re)[0] : undefined;
    if (hit) return `${display(repo, f)}:${hit}`;
  }
  return undefined;
}

// ---------------------------------------------------------------- checks

type Outcome = Omit<EvidenceResult, "subject" | "evidence">;

function missingFile(repo: Repo, path: string, rest: string): Outcome {
  const name = basename(path);
  const moved = repoFiles(repo).find((f) => basename(f) === name && existsSync(f));
  return {
    ok: false,
    problem: `no such file ${path} (looked in the spec's folder${repo.root ? " and the repo root" : ""})`,
    fix: moved
      ? `it may have moved: write ${display(repo, moved)}${rest}`
      : "fix the path (read from the spec's folder, then the repo root), or remove this evidence",
  };
}

function checkLines(repo: Repo, ref: Extract<Ref, { form: "lines" }>, raw: string): Outcome {
  const { path, line } = ref;
  const rest = raw.slice(path.length);
  const at = locate(repo, path);
  if (!at) return missingFile(repo, path, rest);
  if (at.dir)
    return { ok: false, problem: `${path} is a folder`, fix: `point at a file inside ${path}` };
  const lines = linesOf(repo, at.file) ?? [];
  const n = lines.length;
  const end = ref.end ?? line;
  const id = ref.id;
  const found = id ? hitsIn(lines, wordPattern(id)) : [];
  const moveTo = (hit: number) => `it is on line ${hit}: write ${path}:${hit}#${id}`;
  if (line < 1) return { ok: false, problem: "line numbers start at 1", fix: `write ${path}:1` };
  if (end < line)
    return {
      ok: false,
      problem: `the range ${line}-${end} runs backwards`,
      fix: `write ${path}:${end}-${line}${id !== undefined ? `#${id}` : ""}`,
    };
  if (end > n)
    return {
      ok: false,
      problem: `line ${end} is past the end of ${path} (${n} line${n === 1 ? "" : "s"})`,
      fix: found[0] ? moveTo(found[0]) : `point at a line from 1 to ${n}`,
    };
  const ok = { ok: true, file: display(repo, at.file), line, ...(ref.end ? { end } : {}) };
  if (id === undefined) return ok;
  if (!id)
    return { ok: false, problem: "nothing follows the #", fix: `write ${path}:${line}#<name>` };
  if (found.some((h) => h >= line && h <= end)) return ok;
  const where = ref.end ? `in lines ${line}-${end}` : `on line ${line}`;
  if (found[0])
    return { ok: false, problem: `"${id}" is not ${where} of ${path}`, fix: moveTo(found[0]) };
  const other = elsewhere(repo, id, extname(at.file).toLowerCase(), at.file);
  return {
    ok: false,
    problem: `"${id}" is not in ${path} at all`,
    fix: other
      ? `it is in ${other}: write ${other}#${id}`
      : "point at the code that replaced it, or remove this evidence",
  };
}

function checkName(repo: Repo, ref: Extract<Ref, { form: "name" }>): Outcome {
  const { path, id } = ref;
  const at = locate(repo, path);
  if (!at) return missingFile(repo, path, `#${id}`);
  if (at.dir)
    return { ok: false, problem: `${path} is a folder`, fix: `point at a file inside ${path}` };
  if (!id) return { ok: false, problem: "nothing follows the #", fix: `write ${path}#<name>` };
  const hit = hitsIn(linesOf(repo, at.file) ?? [], wordPattern(id))[0];
  if (hit) return { ok: true, file: display(repo, at.file), line: hit };
  const other = elsewhere(repo, id, extname(at.file).toLowerCase(), at.file);
  return {
    ok: false,
    problem: `"${id}" does not appear in ${path}`,
    fix: other
      ? `it is in ${other}: write ${other.replace(/:\d+$/, "")}#${id}`
      : "point at the code that replaced it, or remove this evidence",
  };
}

/** Every repo file an address can live in, with its lines; diagram specs are not infrastructure. */
function* addressFiles(repo: Repo, test: (file: string) => boolean) {
  for (const f of repoFiles(repo)) {
    if (!ADDRESS_FILES.test(f) || !test(f) || resolve(f) === resolve(repo.spec)) continue;
    const lines = linesOf(repo, f, SEARCH_LIMIT);
    if (lines && !(/\.ya?ml$/i.test(f) && lines.some((l) => /^nodes\s*:/.test(l))))
      yield { file: f, lines };
  }
}

function checkTerraform(repo: Repo, address: string): Outcome {
  const mod = TF_MODULE.exec(address);
  const res = mod ? undefined : TF_RESOURCE.exec(address);
  const [kw, type, name] = mod
    ? ["module", undefined, mod[1] ?? ""]
    : [res?.[1] ? "data" : "resource", res?.[2] ?? "", res?.[3] ?? ""];
  const head = type
    ? new RegExp(`^\\s*${kw}\\s+"${type}"\\s+"${name}"`)
    : new RegExp(`^\\s*module\\s+"${name}"`);
  const sameType = new Set<string>();
  const any = type
    ? new RegExp(`^\\s*${kw}\\s+"${type}"\\s+"([\\w-]+)"`)
    : /^\s*module\s+"([\w-]+)"/;
  for (const { file, lines } of addressFiles(repo, (f) => /\.tf$/i.test(f))) {
    const hit = hitsIn(lines, head)[0];
    if (hit) return { ok: true, file: display(repo, file), line: hit };
    for (const l of lines) {
      const m = any.exec(l);
      if (m?.[1]) sameType.add(m[1]);
    }
  }
  const prefix = type ? `${kw === "data" ? "data." : ""}${type}.` : "module.";
  const near = [...sameType].slice(0, 3).map((n) => `${prefix}${n}`);
  return {
    ok: false,
    problem: `no ${type ? `${kw} "${type}" "${name}"` : `module "${name}"`} block in the repo's .tf files`,
    fix: near.length
      ? `did you mean ${near.join(" or ")}?`
      : "fix the address, or remove this evidence",
  };
}

/** Text that matches itself inside a RegExp: every metacharacter, backslash included, escaped. */
const escapeRe = (s: string) => s.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");

function checkKubernetes(repo: Repo, kind: string, name: string): Outcome {
  const q = (v: string) => `["']?${escapeRe(v)}["']?`;
  const kindRe = new RegExp(`^\\s*-?\\s*kind:\\s*${q(kind)}\\s*(#.*)?$`);
  const nameRe = new RegExp(`^\\s+name:\\s*${q(name)}\\s*(#.*)?$`);
  const jsonKind = new RegExp(`"kind"\\s*:\\s*"${escapeRe(kind)}"`);
  const jsonName = new RegExp(`"name"\\s*:\\s*"${escapeRe(name)}"`);
  const others = new Set<string>();
  for (const { file, lines } of addressFiles(repo, (f) => !/\.tf$/i.test(f))) {
    if (/\.json$/i.test(file)) {
      if (!lines.some((l) => jsonKind.test(l))) continue;
      const hit = hitsIn(lines, jsonName)[0];
      if (hit) return { ok: true, file: display(repo, file), line: hit };
      continue;
    }
    // One YAML file can hold many documents; kind and name must meet in the same one.
    let start = 0;
    for (let i = 0; i <= lines.length; i++) {
      if (i < lines.length && !/^---/.test(lines[i] ?? "")) continue;
      const doc = lines.slice(start, i);
      if (doc.some((l) => kindRe.test(l))) {
        const at = doc.findIndex((l) => nameRe.test(l));
        if (at >= 0) return { ok: true, file: display(repo, file), line: start + at + 1 };
        const named = doc.map((l) => /^\s{2}name:\s*["']?([\w.-]+)/.exec(l)?.[1]).find(Boolean);
        if (named) others.add(named);
      }
      start = i + 1;
    }
  }
  const near = [...others].slice(0, 3).map((n) => `${kind}/${n}`);
  return {
    ok: false,
    problem: `no ${kind} named "${name}" in the repo's YAML or JSON manifests`,
    fix: near.length
      ? `did you mean ${near.join(" or ")}?`
      : "fix the name, or remove this evidence",
  };
}

function checkBare(repo: Repo, text: string): Outcome {
  const at = locate(repo, text);
  if (at) return { ok: true, file: display(repo, at.file) };
  if (TF_MODULE.test(text) || TF_RESOURCE.test(text)) return checkTerraform(repo, text);
  const k8s = K8S.exec(text);
  if (k8s) return checkKubernetes(repo, k8s[1] ?? "", k8s[2] ?? "");
  if (/[\\/]/.test(text) || /\.[A-Za-z0-9]{1,6}$/.test(text)) return missingFile(repo, text, "");
  // Any other address: its last segment, anywhere in the repo's infrastructure files.
  const id =
    text
      .replace(/\[[^\]]*\]/g, "")
      .split(/[./]/)
      .pop() ?? text;
  const re = wordPattern(id);
  for (const { file, lines } of addressFiles(repo, () => true)) {
    const hit = hitsIn(lines, re)[0];
    if (hit) return { ok: true, file: display(repo, file), line: hit };
  }
  return {
    ok: false,
    problem: `"${id}" is not in the repo's .tf, .yaml, .yml or .json files`,
    fix: "write a file and line (infra/main.tf:40) or fix the address",
  };
}

export function checkEvidence(repo: Repo, raw: string): Outcome {
  const ref = parseEvidence(raw);
  if (ref.form === "lines") return checkLines(repo, ref, raw);
  if (ref.form === "name") return checkName(repo, ref);
  return checkBare(repo, ref.text);
}

/** Every evidence entry in the model, with what it is about. */
function evidenceOf(model: Model): { subject: EvidenceSubject; evidence: string }[] {
  return [
    ...model.nodes.flatMap((n) =>
      (n.evidence ?? []).map((evidence) => ({
        subject: { kind: "node" as const, id: n.id },
        evidence,
      })),
    ),
    ...model.groups.flatMap((g) =>
      (g.evidence ?? []).map((evidence) => ({
        subject: { kind: "group" as const, id: g.id },
        evidence,
      })),
    ),
    ...model.edges.flatMap((e) =>
      (e.evidence ?? []).map((evidence) => ({
        subject: { kind: "edge" as const, id: edgeName(e) },
        evidence,
      })),
    ),
  ];
}

// ---------------------------------------------------------------- links

interface Remote {
  host: string;
  owner: string;
  repo: string;
}

/** owner/repo on its host from an origin url (https, ssh or scp-style). */
export function parseRemote(url: string): Remote | undefined {
  const m =
    /^[\w.-]+@([^:/]+):([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url) ??
    /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url);
  return m?.[1] && m[2] && m[3] ? { host: m[1], owner: m[2], repo: m[3] } : undefined;
}

export function permalink(remote: Remote, commit: string, result: EvidenceResult): string {
  const path = (result.file ?? "").split("/").map(encodeURIComponent).join("/");
  const lines = result.line
    ? `#L${result.line}${result.end && result.end !== result.line ? `-L${result.end}` : ""}`
    : "";
  return `https://${remote.host}/${remote.owner}/${remote.repo}/blob/${commit}/${path}${lines}`;
}

/** The commit links pin: --commit (resolved when this clone has it) or HEAD. */
function commitOf(root: string, flag: string | boolean | undefined): string {
  if (typeof flag === "string") {
    const full = git(root, ["rev-parse", "--verify", "--quiet", `${flag}^{commit}`]);
    if (full) return full;
    if (/^[0-9a-f]{7,64}$/i.test(flag)) return flag;
    usage(`--commit ${flag} is not a commit in this repository`);
  }
  const head = git(root, ["rev-parse", "HEAD"]);
  if (!head) usage("--link needs a commit: commit first, or pass --commit <sha>");
  return head;
}

/** Nodes in a list (`- { id: api, ... }` or `- api: {...}`) get their url through yaml's Document. */
function setUrlsInDocument(text: string, links: NodeLink[]): string {
  const doc = parseDocument(text);
  const nodes = doc.get("nodes", true);
  if (!isSeq(nodes)) throw new PatchError("nodes must be a mapping or a list");
  for (const link of links) {
    for (const item of nodes.items) {
      if (!isMap(item)) continue;
      if (item.get("id") === link.node) item.set("url", link.url);
      else if (item.items.length === 1 && isScalar(item.items[0]?.key)) {
        const value = item.get(link.node, true);
        if (isMap(value)) value.set("url", link.url);
        else if (value !== undefined)
          throw new PatchError(`node "${link.node}" is a short form; write it as a mapping`);
      }
    }
  }
  return doc.toString();
}

/** The spec text with each linked node's url set, comments and formatting kept. */
export function linkText(text: string, links: NodeLink[]): string {
  const changed = links.filter((l) => !l.kept);
  const ops = changed.map((l) => ({
    op: "set" as const,
    path: `nodes.${l.node}.url`,
    value: l.url,
  }));
  try {
    return applyPatches(text, ops);
  } catch (e) {
    if (!(e instanceof PatchError) || !/is a list/.test(e.message)) throw e;
    return setUrlsInDocument(text, changed);
  }
}

// ---------------------------------------------------------------- the command

export interface VerifyOptions {
  link?: boolean;
  commit?: string;
}

/** Checks every evidence entry of a parsed spec; with link, works out each node's permalink. */
export function verifyModel(
  model: Model,
  specPath: string,
  opts: VerifyOptions = {},
): VerifyReport {
  const repo = openRepo(specPath);
  const results: EvidenceResult[] = evidenceOf(model).map(({ subject, evidence }) => ({
    subject,
    evidence,
    ...checkEvidence(repo, evidence),
  }));
  const problems = results.filter((r) => !r.ok);
  const report: VerifyReport = {
    ok: !problems.length,
    spec: specPath,
    checked: results.length,
    problems,
    results,
  };
  if (!opts.link) return report;
  const root = repo.root;
  const origin = root ? git(root, ["remote", "get-url", "origin"]) : undefined;
  const remote = origin ? parseRemote(origin) : undefined;
  if (!root || !remote) usage("--link needs a git repository whose origin is a GitHub remote");
  const commit = commitOf(root, opts.commit);
  const base = `https://${remote.host}/${remote.owner}/${remote.repo}/blob/`;
  report.commit = commit;
  report.links = [];
  for (const n of model.nodes) {
    const first = results.find(
      (r) =>
        r.subject.kind === "node" && r.subject.id === n.id && r.ok && r.file && !isAbsolute(r.file),
    );
    if (!first) continue;
    const url = permalink(remote, commit, first);
    // A url of the node's own (docs, a dashboard) stays; an older permalink is replaced.
    const kept = !!n.url && !n.url.startsWith(base);
    report.links.push({
      node: n.id,
      evidence: first.evidence,
      url: kept ? (n.url ?? url) : url,
      ...(kept ? { kept } : {}),
    });
  }
  return report;
}

const subjectText = (s: EvidenceSubject) => `${s.kind} ${s.id}`;

function formatReport(report: VerifyReport, name: string): string {
  const n = report.checked;
  const lines = [
    n
      ? `verify ${name}: ${n} evidence entr${n === 1 ? "y" : "ies"}, ${report.problems.length ? `${report.problems.length} problem(s)` : "all found"}`
      : `verify ${name}: no evidence entries (add evidence: path:line to nodes, groups or edges)`,
  ];
  for (const p of report.problems) {
    lines.push(`${subjectText(p.subject)}: ${p.evidence}: ${p.problem}`);
    if (p.fix) lines.push(`      fix: ${p.fix}`);
  }
  if (report.links) {
    const set = report.links.filter((l) => !l.kept);
    const kept = report.links.filter((l) => l.kept);
    lines.push(
      `linked ${set.length} node(s) at ${report.commit?.slice(0, 12)}${report.wrote ? `; wrote ${name}` : set.length ? "" : "; nothing to write"}`,
    );
    for (const l of set) lines.push(`  ${l.node}: ${l.url}`);
    for (const l of kept) lines.push(`  ${l.node}: kept its own url ${l.url}`);
  }
  return lines.join("\n");
}

/** `orrery verify <spec> [--link] [--commit <sha>] [--json]`. */
export async function cmdVerify(args: Args): Promise<void> {
  const [specPath] = args._;
  if (!specPath) usage("verify needs a spec file");
  if (specPath === "-") usage("verify reads paths relative to the spec, so it needs a spec file");
  if (args.flags.commit !== undefined && args.flags.link !== true)
    usage("--commit goes with --link");
  const spec = readSpec(specPath);
  const parsed = parseSpec(spec.text, spec.path);
  const json = args.flags.json === true;
  if (!parsed.model) {
    printDiagnostics(parsed.diagnostics, false);
    process.exitCode = 1;
    return;
  }
  const link = args.flags.link === true;
  const report = verifyModel(parsed.model, spec.path, {
    link,
    ...(typeof args.flags.commit === "string" ? { commit: args.flags.commit } : {}),
  });
  if (report.links?.some((l) => !l.kept)) {
    const next = linkText(spec.text, report.links);
    if (next !== spec.text) {
      writeAtomic(spec.path, next);
      report.wrote = true;
    }
  }
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${formatReport(report, specPath)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}
