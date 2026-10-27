// Where a diagnostic points in the spec text. Every finding names what it is about in `subject`
// (a node, group or edge id, a key, a spec path); the YAML parser's node ranges turn that into
// the exact characters, the way patch/text.ts finds what it edits.
import {
  type Document,
  isMap,
  isScalar,
  isSeq,
  type Pair,
  type ParsedNode,
  parseDocument,
} from "yaml";
import { parseEdgeExpression } from "../spec/edges.ts";
import { EDGE_SYNONYMS, GROUP_SYNONYMS, NODE_SYNONYMS } from "../spec/keys.ts";
import { isObj, pick } from "../spec/values.ts";
import type { Diagnostic } from "../types.ts";
import type { Span } from "./text.ts";

type PNode = ParsedNode;
type PPair = Pair<PNode, PNode | null>;
type Kind = "node" | "group" | "edge" | "path";

/** A key and its value as the spec wrote them: a mapping pair, or a list item. */
interface Hit {
  key?: PNode;
  value: PNode | null;
}

export interface Target extends Span {
  /** A mapping key, a scalar value, an id inside an edge line, or a whole entry. */
  kind: "key" | "value" | "token" | "entry";
  /** The scalar's quotes, which a fix keeps; undefined when the text cannot be replaced. */
  quote?: "" | "'" | '"';
}

export interface Located {
  text: string;
  doc: Document.Parsed;
  root: PNode | null;
  /** The spec as plain data, for counting the edges each list item makes. */
  data: Record<string, unknown>;
  edges: Hit[];
}

const SYNONYMS: Record<Kind, Record<string, string>> = {
  node: NODE_SYNONYMS,
  group: GROUP_SYNONYMS,
  edge: EDGE_SYNONYMS,
  path: {},
};

const nameOf = (n: PNode | null | undefined) =>
  n && isScalar(n) && n.value !== null ? String(n.value) : undefined;

function pairOf(map: PNode | null | undefined, names: string[]): PPair | undefined {
  if (!map || !isMap(map)) return undefined;
  return (map.items as PPair[]).find((p) => names.includes(nameOf(p.key) ?? "\0"));
}

const namesFor = (key: string, syn: Record<string, string>) => [
  key,
  ...Object.keys(syn).filter((s) => syn[s] === key),
];

function scalarTarget(n: PNode, kind: "key" | "value"): Target {
  const t = isScalar(n) ? n.type : undefined;
  const quote =
    t === "PLAIN" ? "" : t === "QUOTE_DOUBLE" ? '"' : t === "QUOTE_SINGLE" ? "'" : undefined;
  return { start: n.range[0], end: n.range[1], kind, quote };
}

/** The spec parsed for locating; `data` is empty when the YAML has no mapping at its root. */
export function locator(text: string): Located {
  const doc = parseDocument(text);
  const root = doc.contents as PNode | null;
  let data: unknown;
  try {
    data = doc.toJS();
  } catch {
    data = undefined;
  }
  const list = pairOf(root, ["edges"])?.value;
  const edges: Hit[] = isSeq(list)
    ? (list.items as PNode[]).map((value) => ({ value }))
    : isMap(list)
      ? (list.items as PPair[]).map((p) => ({ key: p.key, value: p.value }))
      : [];
  return { text, doc, root, data: isObj(data) ? data : {}, edges };
}

/** The nodes or groups entry with this id, in a mapping keyed by id or a list. */
export function entryOf(at: Located, coll: "nodes" | "groups", id: string): Hit | undefined {
  const value = pairOf(at.root, [coll])?.value;
  if (isMap(value)) {
    const p = pairOf(value, [id]);
    return p && { key: p.key, value: p.value };
  }
  if (!isSeq(value)) return undefined;
  for (const item of value.items as PNode[]) {
    if (!isMap(item)) continue;
    const idPair = pairOf(item, ["id"]);
    if (idPair?.value && nameOf(idPair.value) === id) return { key: idPair.value, value: item };
    const only = item.items.length === 1 ? (item.items[0] as PPair) : undefined;
    if (only && nameOf(only.key) === id) return { key: only.key, value: only.value };
  }
  return undefined;
}

function pathHit(at: Located, keys: string[]): Hit | undefined {
  let hit: Hit | undefined;
  let map = at.root;
  for (const k of keys) {
    const p = pairOf(map, [k]);
    // A deeper key that is missing leaves the deepest one found.
    if (!p) return hit;
    hit = { key: p.key, value: p.value };
    map = p.value;
  }
  return hit;
}

function fieldHit(container: PNode | null, key: string, kind: Kind): Hit | undefined {
  const p = pairOf(container, namesFor(key, SYNONYMS[kind]));
  return p && { key: p.key, value: p.value };
}

/** The mapping that holds an edge's options: { from, to, ... }, or the value of { "a -> b": ... }. */
function edgeFields(hit: Hit): PNode | null {
  if (hit.key) return hit.value;
  const v = hit.value;
  if (isMap(v) && v.items.length === 1) {
    const only = v.items[0] as PPair;
    if (typeof parseEdgeExpression(nameOf(only.key) ?? "") !== "string") return only.value;
  }
  return v;
}

/** How many model edges one list item makes, as parseEdges expands it. */
function edgeCount(item: unknown): number {
  const hops = (expr: string) => {
    const parsed = parseEdgeExpression(expr);
    return typeof parsed === "string"
      ? -1
      : parsed.hops.reduce((n, h) => n + h.from.length * h.to.length, 0);
  };
  if (typeof item === "string") return Math.max(0, hops(item));
  if (!isObj(item)) return 0;
  const keys = Object.keys(item);
  const expr = keys.length === 1 ? hops(keys[0] ?? "") : -1;
  if (expr >= 0) return expr;
  const from = pick(item, "from", EDGE_SYNONYMS);
  const to = pick(item, "to", EDGE_SYNONYMS);
  if (from === undefined || to === undefined) return 0;
  return (Array.isArray(from) ? from.length : 1) * (Array.isArray(to) ? to.length : 1);
}

/** The parser's name for an edge an include brought: `include <file> edges[i]`. */
const INCLUDED = /^include .+ edges\[\d+\](?: \S+)?$/;

/**
 * An edge by `edges[i]` (the parser's name, numbered in this file), `include <file> edges[i]`
 * (the include: that brought it) or `e<n>` (the model's id: this file's edges as parsed, then
 * those its includes brought, which point at the include:).
 */
function edgeHit(at: Located, name: string): Hit | undefined {
  if (INCLUDED.test(name)) return pathHit(at, ["include"]);
  const index = /^edges\[(\d+)\]$/.exec(name)?.[1];
  if (index !== undefined) return at.edges[Number(index)];
  const n = /^e(\d+)$/.exec(name)?.[1];
  if (n === undefined) return undefined;
  const raw = at.data.edges;
  const items = Array.isArray(raw)
    ? raw
    : isObj(raw)
      ? Object.entries(raw).map(([k, v]) => ({ [k]: v }))
      : [];
  let seen = 0;
  for (const [i, item] of items.entries()) {
    seen += edgeCount(item);
    if (seen >= Number(n)) return at.edges[i];
  }
  return at.data.include !== undefined ? pathHit(at, ["include"]) : undefined;
}

/** A field by name, or one item of a list field: `fields[0]` is the first of `fields:`. */
function itemHit(container: PNode | null, name: string, kind: Kind): Hit | undefined {
  const m = /^(.+)\[(\d+)\]$/.exec(name);
  const field = fieldHit(container, m?.[1] ?? name, kind);
  if (!m || !field) return field;
  const item = isSeq(field.value)
    ? (field.value.items[Number(m[2])] as PNode | undefined)
    : undefined;
  return item ? { value: item } : field;
}

/** The parser's `where`: "the top level", node "x" look, edges[2] line, layout.routing. */
function whereHit(at: Located, where: string): { hit?: Hit; kind: Kind } {
  if (where === "the top level") return { hit: { value: at.root }, kind: "path" };
  const entry = /^(node|group) "(.*)"(?: (\S+))?$/.exec(where);
  if (entry) {
    const kind = entry[1] as "node" | "group";
    const hit = entryOf(at, kind === "node" ? "nodes" : "groups", entry[2] ?? "");
    const field = entry[3] && hit ? itemHit(hit.value, entry[3], kind) : undefined;
    return { hit: field ?? hit, kind };
  }
  if (INCLUDED.test(where)) return { hit: pathHit(at, ["include"]), kind: "path" };
  const edge = /^(edges\[\d+\])(?: (\S+))?$/.exec(where);
  if (edge) {
    const hit = edgeHit(at, edge[1] ?? "");
    const field = edge[2] && hit ? itemHit(edgeFields(hit), edge[2], "edge") : undefined;
    return { hit: field ?? hit, kind: "edge" };
  }
  const tag = /^tag "(.*)"$/.exec(where);
  return { hit: pathHit(at, tag ? ["tags", tag[1] ?? ""] : where.split(".")), kind: "path" };
}

/** A whole entry: an edge line, else the id (or key) that starts a node, group or setting. */
function entryTarget(hit: Hit, kind: Kind): Target {
  const first = hit.key ?? hit.value;
  if (!first) return { start: 0, end: 0, kind: "entry" };
  const last = kind === "edge" ? (hit.value ?? first) : first;
  return { start: first.range[0], end: last.range[1], kind: "entry" };
}

/** A field's value when it has text, else its key (an empty `color:` points at the key). */
function fieldTarget(hit: Hit): Target | undefined {
  const v = hit.value;
  if (v && v.range[1] > v.range[0] && (isScalar(v) || !hit.key)) return scalarTarget(v, "value");
  if (v && v.range[1] > v.range[0]) return { start: v.range[0], end: v.range[1], kind: "entry" };
  return hit.key ? scalarTarget(hit.key, "key") : undefined;
}

/** The first scalar under `n` (keys and values, a few levels down) whose text is `value`. */
function findScalar(n: PNode | null | undefined, value: string, depth = 0): PNode | undefined {
  if (!n || depth > 3) return undefined;
  if (isScalar(n)) return nameOf(n) === value ? n : undefined;
  if (isSeq(n)) {
    for (const item of n.items as PNode[]) {
      const hit = findScalar(item, value, depth + 1);
      if (hit) return hit;
    }
  }
  if (isMap(n)) {
    for (const p of n.items as PPair[]) {
      const hit = findScalar(p.key, value, depth + 1) ?? findScalar(p.value, value, depth + 1);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** An id as a whole word inside an edge line ("api" in "web -> api", not in "my-api"). */
function tokenIn(text: string, within: Target, id: string): Target | undefined {
  const idChar = (c: string | undefined) => !!c && /[A-Za-z0-9_.]/.test(c);
  for (let i = text.indexOf(id, within.start); i >= 0; i = text.indexOf(id, i + 1)) {
    const end = i + id.length;
    if (end > within.end) return undefined;
    const before = text[i - 1];
    const after = text[end];
    if (idChar(before) || idChar(after)) continue;
    if ((before === "-" && idChar(text[i - 2])) || (after === "-" && idChar(text[end + 1])))
      continue;
    return { start: i, end, kind: "token", quote: "" };
  }
  return undefined;
}

/** `text` with the labels in [start, end) blanked: -[inline]-> labels and the `: label` tail. */
function withoutLabels(text: string, start: number, end: number): string {
  // Code units, not characters, so every offset after a blanked label stays where it was.
  const chars = text.slice(start, end).split("");
  let depth = 0;
  for (const [i, c] of chars.entries()) {
    if (c === "[") depth += 1;
    else if (c === "]") {
      depth = Math.max(0, depth - 1);
      chars[i] = " ";
      continue;
    } else if (c === ":" && !depth && (i + 1 === chars.length || /\s/.test(chars[i + 1] ?? ""))) {
      chars.fill(" ", i);
      break;
    }
    if (depth) chars[i] = " ";
  }
  return text.slice(0, start) + chars.join("") + text.slice(end);
}

/** An edge's end as written: in from: or to:, else in the arrow expression outside its labels. */
function endToken(at: Located, hit: Hit, id: string): Target | undefined {
  const fields = edgeFields(hit);
  for (const end of ["from", "to"]) {
    const found = findScalar(fieldHit(fields, end, "edge")?.value, id);
    if (found) return scalarTarget(found, "value");
  }
  // The expression: a list item's text, the key of { "a -> b": ... }, or a keyed edge's key.
  const v = hit.value;
  const expr = hit.key ?? (isMap(v) && v.items.length === 1 ? (v.items[0] as PPair).key : v);
  if (!expr || !isScalar(expr)) return undefined;
  const [start, end] = expr.range;
  return tokenIn(withoutLabels(at.text, start, end), { start, end, kind: "entry" }, id);
}

/** A detail of the subject: the key a DG108 names, the field a value came from, an id in a list. */
function detail(
  at: Located,
  hit: Hit,
  kind: Kind,
  key: string,
  value: unknown,
): Target | undefined {
  const container = kind === "edge" ? edgeFields(hit) : hit.value;
  if (key === "key") {
    const p = pairOf(container, [String(value)]);
    return p ? scalarTarget(p.key, "key") : undefined;
  }
  if (key === "value") return hit.value ? fieldTarget({ value: hit.value }) : undefined;
  // One word of a scalar (an er field's flag), so a fix replaces only that word.
  if (key === "token" && hit.value && typeof value === "string") {
    const scalar = fieldTarget({ value: hit.value });
    return scalar && tokenIn(at.text, scalar, value);
  }
  if (key === "id" && kind === "edge") return endToken(at, hit, String(value));
  if (key === "setting") {
    const field = fieldHit(container, String(value).split(".").at(-1) ?? "", kind);
    return field && fieldTarget(field);
  }
  // The short forms: `db: aws:rds` is a node's icon, `vpc: aws:vpc` a group's type.
  const short = (kind === "node" && key === "icon") || (kind === "group" && key === "type");
  if (short && hit.value && isScalar(hit.value)) return scalarTarget(hit.value, "value");
  const field = fieldHit(container, key, kind);
  if (field) return fieldTarget(field);
  if (typeof value !== "string") return undefined;
  const found = findScalar(container, value);
  return found && scalarTarget(found, "value");
}

/** What the finding is about, from the first subject key that names something in the spec. */
function subjectHit(at: Located, s: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const id = str(s.id);
  if (str(s.where)) return { primary: "where", ...whereHit(at, s.where as string) };
  if (str(s.edge))
    return { primary: "edge", hit: edgeHit(at, s.edge as string), kind: "edge" as const };
  if (str(s.node))
    return { primary: "node", hit: entryOf(at, "nodes", s.node as string), kind: "node" as const };
  if (str(s.group))
    return {
      primary: "group",
      hit: entryOf(at, "groups", s.group as string),
      kind: "group" as const,
    };
  if (str(s.tag))
    return { primary: "tag", hit: pathHit(at, ["tags", s.tag as string]), kind: "path" as const };
  if (id) {
    // Groups are read first, so the node is the second of two that share an id.
    const node = entryOf(at, "nodes", id);
    const hit = node ?? entryOf(at, "groups", id);
    return { primary: "id", hit, kind: node ? ("node" as const) : ("group" as const) };
  }
  for (const coll of ["nodes", "groups"] as const) {
    const v = s[coll];
    const first = Array.isArray(v) ? str(v[0]) : undefined;
    if (first)
      return {
        primary: coll,
        hit: entryOf(at, coll, first),
        kind: coll === "nodes" ? ("node" as const) : ("group" as const),
      };
    const list = pairOf(at.root, [coll])?.value;
    if (typeof v === "number" && isSeq(list)) {
      const item = list.items[v] as PNode | undefined;
      return { primary: coll, hit: item ? { value: item } : undefined, kind: "path" as const };
    }
  }
  if (Array.isArray(s.edges) && str(s.edges[0]))
    return { primary: "edges", hit: edgeHit(at, s.edges[0] as string), kind: "edge" as const };
  if (s.lines !== undefined)
    return { primary: "lines", hit: pathHit(at, ["edges"]), kind: "path" as const };
  if (str(s.layout)) {
    const setting = str(s.setting) ?? "layout";
    return { primary: "setting", hit: pathHit(at, setting.split(".")), kind: "path" as const };
  }
  for (const key of ["title", "subtitle"])
    if (s[key] === true) return { primary: key, hit: pathHit(at, [key]), kind: "path" as const };
  return undefined;
}

/** A YAML syntax error (DG100 "cannot parse") at the parser's own position. */
function syntaxTarget(at: Located, d: Diagnostic): Target | undefined {
  const bad = at.doc.errors[0];
  if (d.code !== "DG100" || !d.message.startsWith("cannot parse") || !bad) return undefined;
  const start = Math.min(bad.pos[0], at.text.length);
  return { start, end: Math.max(start, Math.min(bad.pos[1], at.text.length)), kind: "entry" };
}

/** A finding with no subject that names its edge, node or group in the message. */
function messageTarget(at: Located, d: Diagnostic): Target | undefined {
  const edge = /^(edges\[\d+\])/.exec(d.message)?.[1];
  const hit = edge ? edgeHit(at, edge) : undefined;
  if (hit) return entryTarget(hit, "edge");
  const named = /\b(node|group) "([^"]+)"/.exec(d.message);
  const entry = named && entryOf(at, named[1] === "node" ? "nodes" : "groups", named[2] ?? "");
  return entry ? entryTarget(entry, "node") : undefined;
}

/** A finding that names its line and column (from 1): the word written there. */
function positionTarget(at: Located, d: Diagnostic): Target | undefined {
  const line = d.subject?.line;
  const column = d.subject?.column;
  if (typeof line !== "number" || typeof column !== "number") return undefined;
  let start = 0;
  for (let l = 1; l < line; l++) {
    const next = at.text.indexOf("\n", start);
    if (next < 0) return undefined;
    start = next + 1;
  }
  start = Math.min(start + column - 1, at.text.length);
  let end = start;
  while (end < at.text.length && !/[\s,}\]]/.test(at.text[end] ?? "")) end++;
  return { start, end, kind: "entry" };
}

/** The characters a diagnostic is about; the first line when nothing more precise is found. */
export function locate(at: Located, d: Diagnostic): Target {
  const syntax = syntaxTarget(at, d) ?? positionTarget(at, d);
  if (syntax) return syntax;
  const found = d.subject ? subjectHit(at, d.subject) : undefined;
  if (found?.hit) {
    // Layout findings are about the whole node, group or edge; parse findings about one field.
    const layoutRule = d.code.startsWith("DG2");
    for (const [key, value] of Object.entries(d.subject ?? {})) {
      if (key === found.primary || (layoutRule && key !== "setting")) continue;
      const t = detail(at, found.hit, found.kind, key, value);
      if (t) return t;
    }
    return entryTarget(found.hit, found.kind);
  }
  const fromMessage = messageTarget(at, d);
  if (fromMessage) return fromMessage;
  const nodes = pairOf(at.root, ["nodes"]);
  if (nodes) return scalarTarget(nodes.key, "key");
  const eol = at.text.indexOf("\n");
  return { start: 0, end: eol < 0 ? at.text.length : eol, kind: "entry" };
}
