// The path ops (set, unset, add) and move, as text edits on the spec's root mapping.
import { isMap, isScalar, isSeq } from "yaml";
import { resolveIcon } from "../icons/index.ts";
import { distance } from "../spec/suggest.ts";
import {
  type Edit,
  insertPair,
  isNull,
  type PMap,
  pairOf,
  removeItem,
  reorder,
  replaceValue,
  type View,
} from "./text.ts";
import { PatchError } from "./types.ts";

type Collection = "nodes" | "groups";
// Short-form icon ids, as parseSpec reads `db: aws:rds` (ICON_ID in spec.ts).
const ICON_ID = /^(aws|azure|gcp|k8s|github|ibm|logos|si|tabler|ph|generic|local):[a-z0-9]/i;

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

export function editMap(v: View, map: PMap, keys: string[], change: Change, where: string): Edit[] {
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

export interface Step {
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

export function pathOp(
  v: View,
  root: PMap,
  op: { op: string; path: string; value?: unknown },
): Step {
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

export function moveOp(
  v: View,
  root: PMap,
  op: { path: string; after?: string; before?: string },
): Step {
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
