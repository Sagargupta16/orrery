// Spec patches (the review loop's ops) applied to the YAML text, and candidate sets tried in
// parallel: each candidate is reviewed on its own copy, and only the ones that improve are kept.
// Ops edit the source text in place, so comments, key order, quoting and the spacing of every
// line a patch does not touch stay byte for byte; yaml's parser only says where things are.
// Contract: skills/orrery/references/review/loop.md, "Patches".
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  isMap,
  isPair,
  isScalar,
  isSeq,
  type Pair,
  type ParsedNode,
  parseDocument,
  stringify,
  type YAMLMap,
  type YAMLSeq,
} from "yaml";
import { type Args, printDiagnostics, readSpec, renderFailure, usage, writeAtomic } from "./cli.ts";
import { resolveIcon } from "./icons.ts";
import {
  DEFAULT_REVIEW_WIDTH,
  type HardCounts,
  improves,
  type ReviewReport,
  reviewModel,
} from "./review.ts";
import { distance, parseEdgeExpression, parseSpec } from "./spec.ts";
import type { Diagnostic, Model, Skin, ThemeName } from "./types.ts";

export type PatchOp =
  | { op: "set"; path: string; value: unknown }
  | { op: "unset"; path: string }
  | { op: "add"; path: string; value: unknown }
  | { op: "move"; path: string; after?: string; before?: string }
  | { op: "edge"; match: string | null; value: string | Record<string, unknown> | null };

export class PatchError extends Error {}

// ---------------------------------------------------------------- text

type PMap = YAMLMap.Parsed;
type PSeq = YAMLSeq.Parsed;
type Item = Pair<ParsedNode, ParsedNode | null> | ParsedNode;
/** Where a value is written: a block line, inside a flow collection, or a JSON spec. */
type Ctx = "block" | "flow" | "json";

interface View {
  text: string;
  json: boolean;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface Span {
  start: number;
  end: number;
}

const OPS = ["set", "unset", "add", "move", "edge"];
type Collection = "nodes" | "groups";
// Short-form icon ids, as parseSpec reads `db: aws:rds` (ICON_ID in spec.ts).
const ICON_ID = /^(aws|azure|gcp|k8s|github|ibm|logos|si|tabler|ph|generic|local):[a-z0-9]/i;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const lineStart = (t: string, p: number) => t.lastIndexOf("\n", p - 1) + 1;
const lineEnd = (t: string, p: number) => {
  const n = t.indexOf("\n", p);
  return n < 0 ? t.length : n + 1;
};
const isNull = (n: ParsedNode | null): boolean => !n || (isScalar(n) && n.value === null);
const firstNode = (item: Item): ParsedNode =>
  isPair(item) ? (item.key ?? (item.value as ParsedNode)) : item;
const lastNode = (item: Item): ParsedNode => (isPair(item) ? (item.value ?? item.key) : item);

/** Where a node's own text ends: before trailing comments, blank lines and the next item. */
function contentEnd(n: ParsedNode): number {
  if ((isMap(n) || isSeq(n)) && !n.flow) {
    const last = n.items.at(-1);
    if (last) return contentEnd(lastNode(last));
  }
  return n.range[1];
}

/** The first of the comment lines directly above `start` (no blank line between), not before `floor`. */
function attachedStart(text: string, start: number, floor: number): number {
  let s = start;
  while (s > floor) {
    const prev = lineStart(text, s - 1);
    if (prev < floor || !text.slice(prev, s).trim().startsWith("#")) break;
    s = prev;
  }
  return s;
}

/**
 * Each item's text: flow items from their first character to their last, block items as whole
 * lines, with the comment lines directly above them when `comments` is set (a move carries them).
 */
function spansOf(text: string, coll: PMap | PSeq, comments: boolean): Span[] {
  const out: Span[] = [];
  for (const item of coll.items as Item[]) {
    const s = firstNode(item).range[0];
    const e = contentEnd(lastNode(item));
    if (coll.flow) {
      out.push({ start: s, end: e });
      continue;
    }
    const start = lineStart(text, s);
    const floor = out.at(-1)?.end ?? 0;
    out.push({
      start: comments ? attachedStart(text, start, floor) : start,
      end: lineEnd(text, e - 1),
    });
  }
  return out;
}

function applyEdits(text: string, edits: Edit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start))
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** A scalar as YAML text in its context; yaml's own stringifier decides the quoting. */
function scalarText(value: unknown, ctx: Ctx): string {
  if (ctx === "json" || (typeof value === "string" && /[\n\r\t]/.test(value)))
    return JSON.stringify(value ?? null);
  if (ctx === "block") return stringify(value, { lineWidth: 0 }).trimEnd();
  const listed = stringify([value], {
    collectionStyle: "flow",
    flowCollectionPadding: false,
    lineWidth: 0,
  }).trim();
  return listed.slice(1, -1).trim();
}

/** A value on one line, in the specs' style: `{ icon: aws:rds, note: Primary }`, `[a, b]`. */
function inline(value: unknown, ctx: Ctx): string {
  const inner: Ctx = ctx === "json" ? "json" : "flow";
  if (Array.isArray(value)) return `[${value.map((x) => inline(x, inner)).join(", ")}]`;
  if (isRecord(value)) {
    const parts = Object.entries(value).map(
      ([k, x]) => `${scalarText(k, inner)}: ${inline(x, inner)}`,
    );
    return parts.length ? `{ ${parts.join(", ")} }` : "{}";
  }
  return scalarText(value, ctx);
}

const ctxOf = (v: View, coll: PMap | PSeq): Ctx => (v.json ? "json" : coll.flow ? "flow" : "block");

const pairOf = (map: PMap, key: string) =>
  map.items.find((p) => isScalar(p.key) && String(p.key.value) === key);

function removeItem(v: View, coll: PMap | PSeq, i: number): Edit {
  const spans = spansOf(v.text, coll, false);
  const span = spans[i] as Span;
  if (!coll.flow) return { ...span, text: "" };
  if (spans.length === 1)
    return { start: coll.range[0], end: coll.range[1], text: isMap(coll) ? "{}" : "[]" };
  const next = spans[i + 1];
  if (next) return { start: span.start, end: next.start, text: "" };
  return { start: (spans[i - 1] as Span).end, end: span.end, text: "" };
}

/** Adds an item after the last one, or before item `before` (block collections only). */
function insertItem(v: View, coll: PMap | PSeq, item: string, before?: number): Edit {
  const spans = spansOf(v.text, coll, true);
  const last = spans.at(-1);
  if (coll.flow || !last) {
    if (!last) {
      const text = isMap(coll) ? `{ ${item} }` : `[${item}]`;
      return { start: coll.range[0], end: coll.range[1], text };
    }
    return { start: last.end, end: last.end, text: `, ${item}` };
  }
  const ref = coll.items[before ?? coll.items.length - 1] as Item;
  const s = firstNode(ref).range[0];
  const prefix = v.text.slice(lineStart(v.text, s), s);
  const at = before === undefined ? last.end : (spans[before] as Span).start;
  return { start: at, end: at, text: `${prefix}${item}\n` };
}

function replaceValue(
  v: View,
  map: PMap,
  pair: Pair<ParsedNode, ParsedNode | null>,
  value: unknown,
): Edit {
  const text = inline(value, ctxOf(v, map));
  const node = pair.value;
  if (!node) return { start: pair.key.range[1], end: pair.key.range[1], text: `: ${text}` };
  if (isScalar(node) && node.range[0] === node.range[1])
    return { start: node.range[0], end: node.range[0], text: ` ${text}` };
  if ((isMap(node) || isSeq(node)) && !node.flow) {
    const colon = v.text.indexOf(":", pair.key.range[1]);
    return { start: colon, end: contentEnd(node), text: `: ${text}` };
  }
  return { start: node.range[0], end: node.range[1], text };
}

/** Sets key in map; new top-level keys go above the groups, nodes and edges sections. */
function insertPair(v: View, map: PMap, key: string, value: unknown, root = false): Edit {
  const ctx = ctxOf(v, map);
  let text = `${scalarText(key, ctx)}: ${inline(value, ctx)}`;
  if (!root || ctx !== "block") return insertItem(v, map, text);
  if ((key === "nodes" || key === "groups") && isRecord(value) && Object.keys(value).length)
    text = `${key}:\n${Object.entries(value)
      .map(([k, x]) => `  ${scalarText(k, "block")}: ${inline(x, "block")}`)
      .join("\n")}`;
  const before = map.items.findIndex(
    (p) => isScalar(p.key) && ["groups", "nodes", "edges"].includes(String(p.key.value)),
  );
  return insertItem(v, map, text, before < 0 ? undefined : before);
}

function reorder(v: View, coll: PMap, from: number, to: number, after: boolean): Edit {
  const spans = spansOf(v.text, coll, !coll.flow);
  const order = spans.map((_, i) => i).filter((i) => i !== from);
  order.splice(order.indexOf(to) + (after ? 1 : 0), 0, from);
  let text = "";
  for (const [k, i] of order.entries()) {
    const span = spans[i] as Span;
    text += v.text.slice(span.start, span.end);
    const next = spans[k + 1];
    if (next) text += v.text.slice((spans[k] as Span).end, next.start);
  }
  return { start: (spans[0] as Span).start, end: (spans.at(-1) as Span).end, text };
}

// ---------------------------------------------------------------- ops

type Change = { kind: "set" | "add"; value: unknown } | { kind: "unset" };

/** `{ a: { b: value } }` for keys [a, b]. */
const nest = (keys: string[], value: unknown): unknown =>
  keys.reduceRight<unknown>((acc, k) => ({ [k]: acc }), value);

/** ` (did you mean "db"?)` for a near spelling, else "". */
function hint(word: string, options: string[]): string {
  let best: string | undefined;
  let bestScore = Math.max(1, Math.floor(word.length / 3)) + 1;
  for (const o of options) {
    const d = distance(word.toLowerCase(), o.toLowerCase());
    if (d < bestScore) {
      bestScore = d;
      best = o;
    }
  }
  return best ? ` (did you mean "${best}"?)` : "";
}

const keysOf = (map: PMap | undefined) =>
  (map?.items ?? []).flatMap((p) => (isScalar(p.key) ? [String(p.key.value)] : []));

function editMap(v: View, map: PMap, keys: string[], change: Change, where: string): Edit[] {
  const [key, ...rest] = keys as [string, ...string[]];
  const here = where ? `${where}.${key}` : key;
  const pair = pairOf(map, key);
  const root = !where;
  if (!rest.length) {
    if (change.kind === "unset") {
      if (!pair) throw new PatchError(`${here} is not set${hint(key, keysOf(map))}`);
      return [removeItem(v, map, map.items.indexOf(pair))];
    }
    if (!pair) return [insertPair(v, map, key, change.value, root)];
    if (change.kind === "add") throw new PatchError(`${here} is already set; use set to change it`);
    return [replaceValue(v, map, pair, change.value)];
  }
  if (!pair || isNull(pair.value)) {
    if (change.kind === "unset") throw new PatchError(`${here} is not set`);
    const value = nest(rest, change.value);
    return [pair ? replaceValue(v, map, pair, value) : insertPair(v, map, key, value, root)];
  }
  if (isMap(pair.value)) return editMap(v, pair.value, rest, change, here);
  throw new PatchError(`${here} is not a mapping, so it has no ${rest.join(".")}`);
}

/** nodes or groups as a mapping keyed by id; undefined when the spec has none. */
function collectionOf(root: PMap, name: Collection): PMap | undefined {
  const value = pairOf(root, name)?.value ?? null;
  if (isNull(value)) return undefined;
  if (isMap(value)) return value;
  throw new PatchError(`${name} is a list; write it as a mapping keyed by id to patch it`);
}

/** The entry an id path names; ids may contain dots, so the longest existing id wins. */
function findEntry(map: PMap | undefined, segs: string[]) {
  if (!map) return undefined;
  for (let k = segs.length; k >= 1; k--) {
    const id = segs.slice(0, k).join(".");
    const pair = pairOf(map, id);
    if (pair) return { pair, id, keys: segs.slice(k) };
  }
  return undefined;
}

/** The mapping a short form stands for, as parseSpec reads it. */
function expand(coll: Collection, value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (coll === "groups") return typeof value === "string" ? { type: value } : {};
  if (typeof value !== "string") return { label: String(value) };
  return resolveIcon(value) || ICON_ID.test(value.trim()) ? { icon: value } : { label: value };
}

interface Step {
  edits: Edit[];
  /** The edits expanded a short form; run the op again on the result. */
  again?: boolean;
}

function entryOp(v: View, root: PMap, coll: Collection, rest: string[], change: Change): Step {
  const map = collectionOf(root, coll);
  const what = coll === "nodes" ? "node" : "group";
  const found = findEntry(map, rest);
  if (!found) {
    if (change.kind !== "add")
      throw new PatchError(`no ${what} "${rest[0]}"${hint(rest[0] ?? "", keysOf(map))}`);
    const id = rest.join(".");
    const other = collectionOf(root, coll === "nodes" ? "groups" : "nodes");
    if (other && pairOf(other, id))
      throw new PatchError(`"${id}" is already a ${coll === "nodes" ? "group" : "node"}`);
    if (!map)
      return {
        edits: editMap(v, root, [coll], { kind: "set", value: { [id]: change.value } }, ""),
      };
    return { edits: [insertPair(v, map, id, change.value)] };
  }
  const { pair, id, keys } = found;
  const m = map as PMap;
  if (!keys.length) {
    if (change.kind === "add")
      throw new PatchError(`${what} "${id}" already exists; use set to change it`);
    if (change.kind === "unset") return { edits: [removeItem(v, m, m.items.indexOf(pair))] };
    return { edits: [replaceValue(v, m, pair, change.value)] };
  }
  if (isMap(pair.value)) return { edits: editMap(v, pair.value, keys, change, `${coll}.${id}`) };
  if (isSeq(pair.value)) throw new PatchError(`${coll}.${id} is a list, not a mapping`);
  // The short form (db: aws:rds) becomes its mapping first; the op then runs on that.
  const short = isScalar(pair.value) ? pair.value.value : null;
  return { edits: [replaceValue(v, m, pair, expand(coll, short))], again: true };
}

function pathOp(v: View, root: PMap, op: { op: string; path: string; value?: unknown }): Step {
  const segs = op.path.split(".");
  if (segs.some((s) => !s.trim())) throw new PatchError(`path "${op.path}" has an empty part`);
  const change: Change =
    op.op === "unset" ? { kind: "unset" } : { kind: op.op as "set" | "add", value: op.value };
  const [head, ...rest] = segs as [string, ...string[]];
  if (head === "edges") throw new PatchError("edges are list items; use the edge op");
  if (head === "nodes" || head === "groups") {
    if (!rest.length) throw new PatchError(`name one: ${head}.<id>`);
    return entryOp(v, root, head, rest, change);
  }
  return { edits: editMap(v, root, segs, change, "") };
}

function moveOp(v: View, root: PMap, op: { path: string; after?: string; before?: string }): Step {
  const [head, ...rest] = op.path.split(".") as [string, ...string[]];
  if ((head !== "nodes" && head !== "groups") || !rest.length)
    throw new PatchError("move takes a node or group path such as nodes.db");
  const what = head === "nodes" ? "node" : "group";
  const map = collectionOf(root, head);
  const found = findEntry(map, rest);
  if (!map || !found)
    throw new PatchError(`no ${what} "${rest.join(".")}"${hint(rest.join("."), keysOf(map))}`);
  if (found.keys.length) throw new PatchError("move takes a node or group path such as nodes.db");
  const after = op.after !== undefined;
  const raw = String(op.after ?? op.before);
  const target = raw.startsWith(`${head}.`) ? raw.slice(head.length + 1) : raw;
  const to = pairOf(map, target);
  if (!to)
    throw new PatchError(
      `no ${what} "${target}" to move ${after ? "after" : "before"}${hint(target, keysOf(map))}`,
    );
  if (to === found.pair) throw new PatchError(`cannot move "${target}" next to itself`);
  return {
    edits: [reorder(v, map, map.items.indexOf(found.pair), map.items.indexOf(to), after)],
  };
}

// ---------------------------------------------------------------- edges

/** Index of the ":" that starts an edge label, skipping -[inline: labels]-> (labelColon in spec.ts). */
function labelColon(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "[") depth += 1;
    else if (c === "]") depth = Math.max(0, depth - 1);
    else if (c === ":" && depth === 0 && (i + 1 === s.length || /\s/.test(s[i + 1] ?? "")))
      return i;
  }
  return -1;
}

interface Hop {
  from: string;
  to: string;
  line: string;
  arrow: string;
}

/** "from line-arrow to" with the head at the end; a line with two heads or none sorts its ends. */
function hopKey(h: Hop): string {
  const [a, b, head] = h.arrow === "start" ? [h.to, h.from, "end"] : [h.from, h.to, h.arrow];
  const ends = head === "both" || head === "none" ? [a, b].sort() : [a, b];
  return `${ends[0]} ${h.line}-${head} ${ends[1]}`;
}

const signature = (hops: Hop[]) => [...new Set(hops.map(hopKey))].sort().join(" | ");

interface EdgeShape {
  /** The hops as the line is written ("a <- b" is "b -> a"), sorted so order does not matter. */
  written: string;
  /** The hops as drawn, after the line, arrow and flow keys of a mapping. */
  drawn: string;
  /** The endpoint pairs alone, for a hint when only the arrow differs. */
  ends: string[];
  label?: string;
}

const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));

/** What an edge item connects, the way parseSpec reads it. */
function edgeShape(item: unknown): EdgeShape | string {
  let expr: string | undefined;
  let extra: Record<string, unknown> = {};
  let label: string | undefined;
  if (typeof item === "string") expr = item;
  else if (isRecord(item)) {
    const keys = Object.keys(item);
    const only = keys.length === 1 ? (keys[0] as string) : undefined;
    if (only !== undefined && typeof parseEdgeExpression(only) !== "string") {
      expr = only;
      const v = item[only];
      if (typeof v === "string" || typeof v === "number") label = String(v);
      else if (isRecord(v)) {
        extra = v;
        label = str(v.label ?? v.text);
      }
    } else {
      extra = item;
      label = str(item.label ?? item.text);
    }
  } else return "an edge is a line such as api -> db or a mapping";
  const flow = str(extra.flow)?.toLowerCase();
  const line = str(extra.line ?? extra.style)?.toLowerCase();
  const arrow = str(extra.arrow)?.toLowerCase();
  const flowLine = flow === "message" ? "dashed" : flow === "association" ? "dotted" : undefined;
  const written: Hop[] = [];
  const drawn: Hop[] = [];
  const add = (from: string, to: string, opLine: string, opArrow: string) => {
    written.push({ from, to, line: opLine, arrow: opArrow });
    drawn.push({
      from,
      to,
      line: line ?? flowLine ?? opLine,
      arrow: arrow ?? (flow === "association" ? "none" : opArrow),
    });
  };
  if (expr !== undefined) {
    const parsed = parseEdgeExpression(expr);
    if (typeof parsed === "string") return parsed;
    const single = parsed.hops.length === 1;
    label ??= single ? (parsed.hops[0]?.op.label ?? parsed.label) : parsed.label;
    for (const hop of parsed.hops)
      for (const f of hop.from)
        for (const t of hop.to) {
          // "a <- b" is drawn as b -> a, as parseSpec does.
          const reverse = hop.op.arrow === "start";
          add(reverse ? t : f, reverse ? f : t, hop.op.line, reverse ? "end" : hop.op.arrow);
        }
  } else {
    const from = extra.from ?? extra.source;
    const to = extra.to ?? extra.target;
    if (from === undefined || to === undefined) return 'an edge mapping needs "from" and "to"';
    for (const f of (Array.isArray(from) ? from : [from]).map(String))
      for (const t of (Array.isArray(to) ? to : [to]).map(String)) add(f, t, "solid", "end");
  }
  return {
    written: signature(written),
    drawn: signature(drawn),
    ends: written.map((h) => [h.from, h.to].sort().join(" ~ ")),
    ...(label !== undefined ? { label: label.trim() } : {}),
  };
}

/** The edge item as YAML text: `api -> db: SQL` on a block line, one scalar or `{...}` in flow. */
function edgeText(value: string | Record<string, unknown>, ctx: Ctx): string {
  if (typeof value === "string") {
    const s = value.trim();
    const colon = labelColon(s);
    const label = colon >= 0 ? s.slice(colon + 1).trim() : "";
    if (ctx !== "block" || !label) return scalarText(s, ctx);
    return `${scalarText(s.slice(0, colon).trim(), ctx)}: ${scalarText(label, ctx)}`;
  }
  const keys = Object.keys(value);
  const only = keys.length === 1 ? (keys[0] as string) : undefined;
  if (ctx === "block" && only !== undefined && typeof parseEdgeExpression(only) !== "string")
    return `${scalarText(only, ctx)}: ${inline(value[only], ctx)}`;
  return inline(value, ctx);
}

function matchEdge(v: View, seq: PSeq, list: unknown[], match: string): number {
  const want = edgeShape(match);
  if (typeof want === "string") throw new PatchError(`cannot read match "${match}": ${want}`);
  const source = (i: number) => {
    const node = seq.items[i] as ParsedNode;
    return v.text.slice(node.range[0], contentEnd(node));
  };
  const hits: number[] = [];
  const near: number[] = [];
  for (const [i, item] of list.entries()) {
    const have = edgeShape(item);
    if (typeof have === "string") continue;
    // The match is a written line; it names an item as written or as drawn.
    const same = want.written === have.written || want.written === have.drawn;
    if (same && (want.label === undefined || want.label === have.label)) hits.push(i);
    else if (have.ends.some((e) => want.ends.includes(e))) near.push(i);
  }
  const parsed = parseEdgeExpression(match);
  const plain =
    typeof parsed !== "string" &&
    parsed.hops.every((h) => h.op.line === "solid" && h.op.arrow === "end");
  if (!hits.length && plain) {
    // Measured findings name an edge by its ends ("a -> b") whatever arrow or line the spec
    // wrote; the one edge between exactly those nodes is that edge. A match that spells out
    // another style ("a --> b") still names only that style.
    const ends = new Set(want.ends);
    const loose = near.filter((i) => {
      const have = edgeShape(list[i]);
      return (
        typeof have !== "string" &&
        have.ends.length === ends.size &&
        have.ends.every((e) => ends.has(e)) &&
        (want.label === undefined || want.label === have.label)
      );
    });
    if (loose.length === 1) return loose[0] as number;
  }
  if (hits.length === 1) return hits[0] as number;
  const quote = (ids: number[]) =>
    ids
      .slice(0, 3)
      .map((i) => `"${source(i)}"`)
      .join(", ");
  if (hits.length > 1)
    throw new PatchError(
      `"${match}" matches ${hits.length} edges (${quote(hits)}); add the label to pick one`,
    );
  throw new PatchError(
    `no edge matches "${match}"${near.length ? `; edges between the same nodes: ${quote(near)}` : ""}`,
  );
}

function edgeOp(v: View, root: PMap, list: unknown, op: { match: string | null; value: unknown }) {
  const { match, value } = op;
  if (value !== null) {
    const shape =
      typeof value === "string" || isRecord(value)
        ? edgeShape(value)
        : "it is not a line or mapping";
    if (typeof shape === "string")
      throw new PatchError(`value must be an edge such as "api -> db: SQL" (${shape})`);
  }
  const edge = value as string | Record<string, unknown> | null;
  const pair = pairOf(root, "edges");
  const seq = pair?.value ?? null;
  if (match === null) {
    if (edge === null) throw new PatchError("give a match to change or remove, or a value to add");
    if (isSeq(seq)) return [insertItem(v, seq, edgeText(edge, ctxOf(v, seq)))];
    if (!isNull(seq)) throw new PatchError("edges must be a list to be patched");
    if (ctxOf(v, root) !== "block")
      return editMap(v, root, ["edges"], { kind: "set", value: [edge] }, "");
    const item = `\n  - ${edgeText(edge, "block")}`;
    // `edges:` with nothing after it gets its first item; no edges key gets one at the end.
    if (seq) return [{ start: seq.range[0], end: seq.range[1], text: item }];
    const end = v.text.length;
    return [{ start: end, end, text: `edges:${item}\n` }];
  }
  if (!isSeq(seq) || !Array.isArray(list)) throw new PatchError(`no edge matches "${match}"`);
  const i = matchEdge(v, seq, list, match);
  if (edge === null) return [removeItem(v, seq, i)];
  const node = seq.items[i] as ParsedNode;
  return [{ start: node.range[0], end: contentEnd(node), text: edgeText(edge, ctxOf(v, seq)) }];
}

// ---------------------------------------------------------------- apply

function checkOp(op: unknown): asserts op is PatchOp {
  if (!isRecord(op))
    throw new PatchError("an op must be a mapping such as { op: set, path, value }");
  if (!OPS.includes(String(op.op)))
    throw new PatchError(`unknown op "${String(op.op)}"; use ${OPS.join(", ")}`);
  if (op.op !== "edge" && (typeof op.path !== "string" || !op.path))
    throw new PatchError(`${op.op} needs a path such as nodes.db.note`);
  if ((op.op === "set" || op.op === "add") && op.value === undefined)
    throw new PatchError(`${op.op} needs a value`);
  if (op.op === "move" && (op.after === undefined) === (op.before === undefined))
    throw new PatchError("move needs one of after or before");
  if (op.op === "edge") {
    if (!("match" in op) || (op.match !== null && typeof op.match !== "string"))
      throw new PatchError("edge needs match: an edge line such as api -> db, or null to add one");
    if (!("value" in op))
      throw new PatchError("edge needs value: the new edge, or null to remove it");
  }
}

const short = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 48 ? `${s.slice(0, 45)}...` : s;
};

/** One line per op, as the ledger writes it: `set direction down`, `move nodes.db after api`. */
export function describeOp(op: PatchOp): string {
  if (!isRecord(op)) return short(op);
  switch (op.op) {
    case "set":
    case "add":
      return `${op.op} ${op.path} ${short(op.value)}`;
    case "unset":
      return `unset ${op.path}`;
    case "move":
      if (op.after !== undefined) return `move ${op.path} after ${op.after}`;
      return op.before !== undefined ? `move ${op.path} before ${op.before}` : `move ${op.path}`;
    case "edge":
      if (op.match === null) return `edge add ${short(op.value)}`;
      if (op.value === null) return `edge remove ${op.match}`;
      return `edge ${op.match} => ${short(op.value)}`;
    default:
      return short(op);
  }
}

function applyOne(text: string, op: PatchOp, depth = 0): string {
  const doc = parseDocument(text);
  const bad = doc.errors[0];
  if (bad) throw new PatchError(`the spec is not valid YAML: ${bad.message.split("\n")[0]}`);
  const root = doc.contents;
  if (!isMap(root)) throw new PatchError("the spec must be a mapping");
  const v: View = { text, json: /^\s*\{/.test(text) };
  let step: Step;
  if (op.op === "move") step = moveOp(v, root, op);
  else if (op.op === "edge") {
    const js: unknown = doc.toJS();
    step = { edits: edgeOp(v, root, isRecord(js) ? js.edges : undefined, op) };
  } else step = pathOp(v, root, op);
  const out = applyEdits(text, step.edits);
  const check = parseDocument(out).errors[0];
  if (check) throw new PatchError(`the edit made invalid YAML: ${check.message.split("\n")[0]}`);
  return step.again && depth === 0 ? applyOne(out, op, 1) : out;
}

/** The spec text with the ops applied in order, comments and key order kept. Throws PatchError. */
export function applyPatches(source: string, ops: PatchOp[]): string {
  if (!ops.length) return source;
  // Edits work on "\n" lines; a CRLF spec (a Windows checkout) gets its CRLF back at the end.
  const crlf = source.includes("\r\n");
  let text = crlf ? source.replace(/\r\n/g, "\n") : source;
  // Moves and appends work on whole lines, so the last line needs its newline.
  if (!text.endsWith("\n")) text += "\n";
  for (const [i, op] of ops.entries()) {
    try {
      checkOp(op);
      text = applyOne(text, op);
    } catch (e) {
      if (e instanceof PatchError)
        throw new PatchError(`op ${i + 1} (${describeOp(op)}): ${e.message}`);
      throw e;
    }
  }
  return crlf ? text.replace(/\n/g, "\r\n") : text;
}

// ---------------------------------------------------------------- candidates

export interface CandidateResult {
  /** Position in the candidates list, from 0. */
  index: number;
  ops: PatchOp[];
  /** The patched spec text, when every op applied and it parsed. */
  source?: string;
  report?: ReviewReport;
  /** improves(before, report) from review.ts. */
  kept: boolean;
  /** Why it was kept or dropped, in one line. */
  reason: string;
}

export interface CandidateRun {
  before: ReviewReport;
  results: CandidateResult[];
  /** The kept candidate with the highest score. */
  best?: CandidateResult;
}

export interface CandidateRequest {
  source: string;
  filename: string;
  candidates: PatchOp[][];
  width?: number;
  theme?: ThemeName;
  skin?: Skin;
  /** Extra font files, as `orrery review --font`. */
  fonts?: string[];
}

const HARD: Record<keyof HardCounts, string> = {
  overlaps: "overlaps",
  edgesThroughNodes: "through nodes",
  edgesThroughHeaders: "through headers",
  edgesThroughLabels: "through labels",
  offCanvas: "off canvas",
  contrastFailures: "contrast",
};
const HARD_KEYS = Object.keys(HARD) as (keyof HardCounts)[];
const serious = (r: ReviewReport) => r.findings.filter((f) => f.severity !== "minor").length;
const nodeCount = (r: ReviewReport) => r.elements.filter((e) => e.kind === "node").length;

/** The first guard of improves() that `after` fails, in words. */
function whyNot(before: ReviewReport, after: ReviewReport): string {
  const worse = HARD_KEYS.filter((k) => after.hard[k] > before.hard[k]);
  if (worse.length)
    return `hard count went up: ${worse.map((k) => `${HARD[k]} ${before.hard[k]} -> ${after.hard[k]}`).join(", ")}`;
  if (serious(after) > serious(before))
    return `blockers plus majors went up: ${serious(before)} -> ${serious(after)}`;
  if (nodeCount(after) < nodeCount(before))
    return `a node was removed: ${nodeCount(before)} -> ${nodeCount(after)} nodes`;
  if (after.score <= before.score) return `score did not go up: ${before.score} -> ${after.score}`;
  return "reviewed at another width or theme";
}

const errorsOf = (list: Diagnostic[]) =>
  list
    .filter((d) => d.severity === "error")
    .slice(0, 3)
    .map((d) => `${d.code} ${d.message}`)
    .join("; ");

/**
 * Reviews the spec once and every candidate on its own copy, all at once, at the same width and
 * theme; a candidate is kept only when improves() says so, and the best is the top kept score.
 */
export async function tryCandidates(req: CandidateRequest): Promise<CandidateRun> {
  const name = basename(req.filename).replace(/\.(ya?ml|json)$/i, "");
  const base = parseSpec(req.source, req.filename);
  if (!base.model) throw new PatchError(`${name} has errors: ${errorsOf(base.diagnostics)}`);
  const theme = req.theme ?? base.model.theme;
  const review = async (model: Model, diagnostics: Diagnostic[]) =>
    (
      await reviewModel({
        model: req.skin ? { ...model, skin: req.skin } : model,
        name,
        width: req.width ?? DEFAULT_REVIEW_WIDTH,
        theme,
        fonts: req.fonts,
        diagnostics,
        png: false,
      })
    ).report;
  const attempt = async (ops: PatchOp[]) => {
    let source: string;
    try {
      source = applyPatches(req.source, ops);
    } catch (e) {
      if (e instanceof PatchError) return { reason: e.message };
      throw e;
    }
    const parsed = parseSpec(source, req.filename);
    if (!parsed.model)
      return { reason: `the patched spec has errors: ${errorsOf(parsed.diagnostics)}` };
    try {
      return { source, report: await review(parsed.model, parsed.diagnostics) };
    } catch (e) {
      return { source, reason: `review failed: ${(e as Error).message}` };
    }
  };
  const [before, ...tries] = await Promise.all([
    review(base.model, base.diagnostics),
    ...req.candidates.map(attempt),
  ]);
  const results = tries.map((t, index): CandidateResult => {
    const ops = req.candidates[index] ?? [];
    const out = { index, ops, ...(t.source !== undefined ? { source: t.source } : {}) };
    if (!t.report) return { ...out, kept: false, reason: t.reason ?? "not reviewed" };
    const kept = improves(before, t.report);
    return {
      ...out,
      report: t.report,
      kept,
      reason: kept ? `score ${before.score} -> ${t.report.score}` : whyNot(before, t.report),
    };
  });
  const best = results
    .filter((r) => r.kept)
    .sort(
      (a, b) =>
        (b.report?.score ?? 0) - (a.report?.score ?? 0) ||
        a.ops.length - b.ops.length ||
        a.index - b.index,
    )[0];
  return { before, results, ...(best ? { best } : {}) };
}

// ---------------------------------------------------------------- command

function readCandidates(path: string): PatchOp[][] {
  if (path !== "-" && !existsSync(path)) usage(`no such candidates file: ${path}`);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path === "-" ? 0 : path, "utf8"));
  } catch (e) {
    usage(`cannot read ${path === "-" ? "stdin" : path} as JSON: ${(e as Error).message}`);
  }
  const shape =
    "candidates must be a JSON array of ops, or an array of candidate sets (arrays of ops)";
  if (!Array.isArray(data) || !data.length) usage(shape);
  if (data.every(Array.isArray)) return data as PatchOp[][];
  if (data.every((x) => !Array.isArray(x))) return [data as PatchOp[]];
  usage(`${shape}; this one mixes both`);
}

function formatRun(run: CandidateRun, name: string): string {
  const b = run.before;
  const rows = run.results.map((r) => {
    const a = r.report;
    const hard = a
      ? HARD_KEYS.filter((k) => a.hard[k] !== b.hard[k])
          .map((k) => `${HARD[k]} ${b.hard[k]} -> ${a.hard[k]}`)
          .join(", ") || "none"
      : "-";
    return {
      r,
      cells: [
        String(r.index + 1),
        r.kept ? "kept" : "dropped",
        a ? `${b.score} -> ${a.score}` : "-",
        a ? `${serious(b)} -> ${serious(a)}` : "-",
        hard,
        r.ops.map(describeOp).join("; ") || "(no ops)",
      ],
    };
  });
  const head = ["#", "result", "score", "blk+maj", "hard changed", "ops"];
  const widths = head.map((h, i) =>
    Math.max(h.length, ...rows.map((x) => x.cells[i]?.length ?? 0)),
  );
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i] ?? 0)))
      .join("  ")
      .trimEnd();
  const lines = [
    `patch ${name}: ${run.results.length} candidate(s) at ${b.width}px (${b.theme}); before: score ${b.score}, ${serious(b)} blocker(s) plus major(s)`,
    "",
    line(head),
  ];
  for (const { r, cells } of rows) {
    lines.push(line(cells));
    if (!r.kept) lines.push(`${" ".repeat((widths[0] ?? 1) + 2)}${r.reason}`);
  }
  lines.push("");
  const best = run.best;
  lines.push(
    best
      ? `best: candidate ${best.index + 1}, ${best.reason} (${best.ops.map(describeOp).join("; ")})`
      : "best: none; no candidate improved the diagram",
  );
  return lines.join("\n");
}

/** `orrery patch <spec> <candidates.json|->`: tries every candidate and keeps the best. */
export async function cmdPatch(args: Args): Promise<void> {
  const [specPath, candidatesPath] = args._;
  if (!specPath || !candidatesPath)
    usage("patch needs a spec file and a candidates file (JSON, or - for stdin)");
  if (specPath === "-" && candidatesPath === "-")
    usage("only one of the spec and the candidates can come from stdin");
  const width = args.flags.width === undefined ? DEFAULT_REVIEW_WIDTH : Number(args.flags.width);
  if (!(width > 0)) usage("--width must be a positive number of px");
  const spec = readSpec(specPath);
  const candidates = readCandidates(candidatesPath);
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
  const out = typeof args.flags.out === "string" ? resolve(args.flags.out) : undefined;
  let run: CandidateRun;
  try {
    run = await tryCandidates({
      source: spec.text,
      filename: spec.path,
      candidates,
      width,
      theme,
      skin: args.flags.skin as Skin | undefined,
      fonts,
    });
  } catch (e) {
    const failure = renderFailure(e);
    if (!failure) throw e;
    printDiagnostics([failure], false);
    process.exitCode = 1;
    return;
  }
  const best = run.best;
  if (out && best?.source !== undefined) writeAtomic(out, best.source);
  if (args.flags.json === true) process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
  else {
    const wrote = out
      ? best
        ? `\nwrote ${out}`
        : `\nnothing written to ${out}`
      : best
        ? "\nadd -o <file> to write the best patched spec"
        : "";
    process.stdout.write(`${formatRun(run, spec.name)}\n${wrote}\n`);
  }
  process.exitCode = best ? 0 : 1;
}
