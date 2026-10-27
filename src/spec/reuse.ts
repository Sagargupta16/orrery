// Reuse across and within specs, applied to the raw mapping before any item is read: `include:`
// merges shared specs' groups, nodes, edges, classes and tags into this one, and `classes:` are
// key sets a node, group or edge takes with `class:` before its own keys. Every existing check
// then runs on the merged items.
import { existsSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { EDGE_SYNONYMS, GROUP_SYNONYMS, NODE_SYNONYMS, TOP_KEYS } from "./keys.ts";
import { closest } from "./suggest.ts";
import { isObj, type Obj, parseText, type Reporter, readText, unknownKeys } from "./values.ts";

const NAME = /^[a-z0-9][a-z0-9_-]*$/i;

// ---------------------------------------------------------------- include

/**
 * How included files are read: the text of a path, undefined when there is no such file. False
 * refuses every include before any file is opened (MCP over HTTP, where the caller may not share
 * this machine's files).
 */
export type IncludeReader = false | ((path: string) => string | undefined);

const fromDisk = (path: string): string | undefined =>
  existsSync(path) && statSync(path).isFile() ? readText(path) : undefined;

/** The merged spec, and the parser's name for each of its edge items. */
export interface Included {
  raw: Obj;
  /**
   * `edges[i]` for this spec's own items, numbered as written here, so a finding lands on the
   * line it names; `include <file> edges[i]` for the items an include brought.
   */
  edgeNames: string[];
}

/** The spec with every `include:` merged in; the spec itself when it includes nothing. */
export function applyIncludes(
  raw: Obj,
  filename: string,
  r: Reporter,
  read: IncludeReader = fromDisk,
): Included {
  const own = edgeItems(raw.edges).map((_, i) => `edges[${i}]`);
  if (raw.include === undefined || raw.include === null) return { raw, edgeNames: own };
  if (read === false) {
    r.err("DG122", "include is refused here: no file may be read", {
      subject: { where: "include" },
      fixes: ["paste the shared groups, nodes and edges into this spec"],
    });
    return { raw, edgeNames: own };
  }
  const file = resolve(filename);
  const show = (p: string) => relative(dirname(file), p).replaceAll("\\", "/") || p;
  // A file reached twice (two includes share a frame) is merged once.
  const merged = new Set<string>();
  const out = withIncludes(raw, file, [file], { r, show, read, merged }, own);
  return { raw: out.raw, edgeNames: out.names };
}

interface Walk {
  r: Reporter;
  show: (p: string) => string;
  read: (path: string) => string | undefined;
  merged: Set<string>;
}

function withIncludes(
  raw: Obj,
  file: string,
  chain: string[],
  w: Walk,
  ownNames: string[],
): { raw: Obj; names: string[] } {
  const { r, show } = w;
  const list = includeList(raw.include, show(file), r);
  let merged: Obj = {};
  let names: string[] = [];
  // Which include each merged id came from, for the clash warning.
  const origin = new Map<string, string>();
  for (const entry of list) {
    const path = resolve(dirname(file), entry);
    const subject = { where: "include", file: show(path) };
    if (chain.includes(path)) {
      r.err("DG122", `include cycle: ${[...chain, path].map(show).join(" -> ")}`, {
        subject,
        fixes: [`remove the include of ${show(path)} from ${show(file)}`],
      });
      continue;
    }
    if (w.merged.has(path)) continue;
    w.merged.add(path);
    const sub = readIncluded(path, show(path), w);
    if (!sub) continue;
    const subNames = edgeItems(sub.edges).map((_, i) => `include ${show(path)} edges[${i}]`);
    const full = withIncludes(sub, path, [...chain, path], w, subNames);
    merged = layer(merged, full.raw, show(path), origin, r);
    names = [...names, ...full.names];
  }
  const out = { ...raw, ...layer(merged, raw, "this spec", origin, r) };
  return { raw: out, names: [...names, ...ownNames] };
}

/** `include: file` or a list of files; anything else is DG122 and includes nothing. */
function includeList(value: unknown, where: string, r: Reporter): string[] {
  if (value === undefined || value === null) return [];
  const list = typeof value === "string" ? [value] : value;
  if (Array.isArray(list) && list.every((x) => typeof x === "string" && x.trim()))
    return list.map((x: string) => x.trim());
  r.err("DG122", `include in ${where} must be a spec file or a list of them`, {
    subject: { where: "include" },
    fixes: ["write include: [shared/aws-frame.yaml], relative to this spec's folder"],
  });
  return [];
}

function readIncluded(path: string, name: string, w: Walk): Obj | undefined {
  const { r } = w;
  const subject = { where: "include", file: name };
  const text = w.read(path);
  if (text === undefined) {
    r.err("DG122", `include ${name} not found`, {
      subject,
      fixes: ["check the path; it is read relative to the including spec's folder"],
    });
    return undefined;
  }
  let raw: unknown;
  try {
    raw = parseText(text, path);
  } catch (e) {
    r.err("DG122", `cannot read include ${name}: ${(e as Error).message.split("\n")[0]}`, {
      subject,
      fixes: [`fix the YAML/JSON syntax of ${name}`],
    });
    return undefined;
  }
  if (isObj(raw)) {
    // Only groups, nodes, edges, classes and tags are merged, but a misspelled key would
    // silently drop what it holds.
    unknownKeys(r, raw, TOP_KEYS, {}, `include ${name}`);
    return raw;
  }
  r.err("DG122", `include ${name} must be a spec: a mapping with groups, nodes or edges`, {
    subject,
    fixes: [`start ${name} with groups: or nodes:`],
  });
  return undefined;
}

/**
 * `top` laid over `base`: groups and nodes by id (top's entry wins, with a DG122 warning, and
 * replaces a node or a group alike, since they share ids), edges appended, classes and tags by
 * name. Base entries come first, so a shared frame keeps its place in the spec order.
 */
function layer(base: Obj, top: Obj, name: string, origin: Map<string, string>, r: Reporter): Obj {
  const own = [...idEntries(top.groups), ...idEntries(top.nodes)];
  const ids = new Set(own.flatMap(([id]) => (id === undefined ? [] : [id])));
  const out: Obj = {};
  // A collection that is neither a list nor a mapping stays as written, for the parser to report.
  const odd = (v: unknown) => v !== undefined && v !== null && !Array.isArray(v) && !isObj(v);
  for (const key of ["groups", "nodes", "edges"] as const) if (odd(top[key])) out[key] = top[key];
  for (const key of ["groups", "nodes"] as const) {
    if (key in out) continue;
    const kept = idEntries(base[key]).filter(([id]) => {
      if (id === undefined || !ids.has(id)) return true;
      r.warn("DG122", `"${id}" in ${name} replaces the one in ${origin.get(id) ?? "an include"}`, {
        subject: { where: "include", id },
        fixes: [`rename "${id}" if both are meant to be drawn`],
      });
      return false;
    });
    const items = [...kept, ...idEntries(top[key])].map(([, item]) => item);
    if (items.length) out[key] = items;
    else if (top[key] !== undefined) out[key] = top[key];
  }
  for (const id of ids) origin.set(id, name);
  const edges = [...edgeItems(base.edges), ...edgeItems(top.edges)];
  if (!("edges" in out) && (edges.length || top.edges !== undefined))
    out.edges = edges.length ? edges : top.edges;
  for (const key of ["classes", "tags"] as const) {
    if (isObj(base[key]) && isObj(top[key])) out[key] = { ...base[key], ...top[key] };
    else if (top[key] !== undefined) out[key] = top[key];
    else if (base[key] !== undefined) out[key] = base[key];
  }
  return out;
}

/**
 * The items of a nodes or groups collection as list items the parser reads (`{ id: value }`),
 * each with its id; an item without one keeps its place and is reported by the parser.
 */
function idEntries(value: unknown): [string | undefined, unknown][] {
  if (Array.isArray(value))
    return value.map((item): [string | undefined, unknown] => {
      if (isObj(item) && typeof item.id === "string") return [item.id, item];
      if (isObj(item) && Object.keys(item).length === 1) return [Object.keys(item)[0], item];
      return [undefined, item];
    });
  if (isObj(value)) return Object.entries(value).map(([id, v]) => [id, { [id]: v }]);
  return [];
}

const edgeItems = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value
    : isObj(value)
      ? Object.entries(value).map(([k, v]) => ({ [k]: v }))
      : [];

// ---------------------------------------------------------------- classes

/** Every node, group and edge with its `class:` keys merged under its own. */
export function applyClasses(raw: Obj, r: Reporter, edgeNames: string[] = []): Obj {
  const used = (v: unknown) => JSON.stringify(v ?? null).includes('"class"');
  if (raw.classes === undefined && !used(raw.nodes) && !used(raw.groups) && !used(raw.edges))
    return raw;
  const classes = readClasses(raw.classes, r);
  const out: Obj = { ...raw };
  const nodes = mapItems(raw.nodes, (item, id) =>
    withClass(item, `node "${id}"`, { node: id }, NODE_SYNONYMS, classes, r),
  );
  const groups = mapItems(raw.groups, (item, id) =>
    withClass(item, `group "${id}"`, { group: id }, GROUP_SYNONYMS, classes, r),
  );
  if (nodes) out.nodes = nodes;
  if (groups) out.groups = groups;
  const edges = edgeItems(raw.edges);
  if (edges.length)
    out.edges = edges.map((item, i) => {
      if (!isObj(item)) return item;
      const where = edgeNames[i] ?? `edges[${i}]`;
      const at = (o: Obj) => withClass(o, where, { edge: where }, EDGE_SYNONYMS, classes, r);
      if ("class" in item) return at(item);
      const [key] = Object.keys(item);
      const inner = key === undefined ? undefined : item[key];
      return key !== undefined && Object.keys(item).length === 1 && isObj(inner)
        ? { [key]: at(inner) }
        : item;
    });
  return out;
}

/** Top-level `classes:` as a name to key-set table; a bad entry is DG121 and left out. */
function readClasses(value: unknown, r: Reporter): Record<string, Obj> {
  if (value === undefined || value === null) return {};
  if (!isObj(value)) {
    r.err("DG121", "classes must be a mapping of a class name to node, group or edge keys", {
      subject: { where: "classes" },
      fixes: ['write classes: { service: { look: card, color: "#2563eb" } }'],
    });
    return {};
  }
  const out: Record<string, Obj> = {};
  for (const [name, def] of Object.entries(value)) {
    if (NAME.test(name) && isObj(def)) out[name] = def;
    else
      r.err("DG121", `class "${name}" needs a mapping of node, group or edge keys`, {
        subject: { where: "classes", class: name },
        fixes: [`write ${NAME.test(name) ? name : "service"}: { look: card }`],
      });
  }
  return out;
}

/** A nodes or groups collection with `fn` applied to every item that is a mapping. */
function mapItems(value: unknown, fn: (item: Obj, id: string) => Obj): unknown {
  if (isObj(value))
    return Object.fromEntries(
      Object.entries(value).map(([id, v]) => [id, isObj(v) ? fn(v, id) : v]),
    );
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => {
    if (!isObj(item)) return item;
    if (typeof item.id === "string") return fn(item, item.id);
    const keys = Object.keys(item);
    const [id] = keys;
    const v = id === undefined ? undefined : item[id];
    return id !== undefined && keys.length === 1 && isObj(v) ? { [id]: fn(v, id) } : item;
  });
}

/** The item's classes in order, then its own keys; a later key replaces any synonym of it. */
function withClass(
  item: Obj,
  where: string,
  subject: Obj,
  synonyms: Record<string, string>,
  classes: Record<string, Obj>,
  r: Reporter,
): Obj {
  const raw = item.class;
  if (raw === undefined || raw === null) return item;
  const names = typeof raw === "string" ? [raw] : raw;
  if (!Array.isArray(names) || names.some((x) => typeof x !== "string")) {
    r.err("DG121", `${where} class must be a class name or a list of them`, {
      subject,
      fixes: ["write class: service, or class: [service, critical]"],
    });
    return item;
  }
  const out: Obj = {};
  const canon = (k: string) => synonyms[k] ?? k;
  const assign = (src: Obj) => {
    for (const [k, v] of Object.entries(src)) {
      for (const t of Object.keys(out)) if (canon(t) === canon(k)) delete out[t];
      out[k] = v;
    }
  };
  for (const name of names as string[]) {
    // Own keys only: class: toString names no class.
    const def = Object.hasOwn(classes, name) ? classes[name] : undefined;
    if (def) {
      assign(def);
      continue;
    }
    const near = closest(name, Object.keys(classes));
    r.err("DG121", `${where} uses unknown class "${name}"`, {
      subject: { ...subject, class: name },
      fixes: near
        ? [`did you mean "${near}"? use class: ${near}`]
        : [`define it: classes: { ${name}: { ... } }`],
    });
  }
  assign(item);
  return out;
}

/** Every file a spec includes, directly or through other includes, for watchers to follow. */
export function includedFiles(raw: Obj, filename: string): string[] {
  const seen = new Set<string>();
  const walk = (item: Obj, file: string) => {
    const list = typeof item.include === "string" ? [item.include] : item.include;
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      if (typeof entry !== "string") continue;
      const path = resolve(dirname(file), entry.trim());
      if (seen.has(path) || !existsSync(path)) continue;
      seen.add(path);
      try {
        const sub = parseText(readText(path), path);
        if (isObj(sub)) walk(sub, path);
      } catch {
        // An unreadable include is the parser's to report; the watcher still follows the file.
      }
    }
  };
  walk(raw, resolve(filename));
  return [...seen];
}
