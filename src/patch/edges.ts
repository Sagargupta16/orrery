// The edge op: edge items read the way parseSpec reads them, matched by their ends, written back.
import { isSeq, type ParsedNode } from "yaml";
import { type EdgeHop, parseEdgeExpression } from "../spec/edges.ts";
import type { ArrowMode, EdgeLine } from "../types.ts";
import { editMap } from "./ops.ts";
import {
  type Ctx,
  contentEnd,
  ctxOf,
  type Edit,
  inline,
  insertItem,
  isNull,
  isRecord,
  lineStart,
  type PMap,
  type PSeq,
  pairOf,
  removeItem,
  scalarText,
  type View,
} from "./text.ts";
import { PatchError } from "./types.ts";

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

/** The operator that reads back as `op`: the OPS and LABELED tables in spec/edges.ts, reversed. */
const OPERATORS: Record<EdgeLine, Record<ArrowMode, string>> = {
  solid: { end: "->", start: "<-", both: "<->", none: "--" },
  dashed: { end: "-->", start: "<--", both: "<-->", none: "---" },
  thick: { end: "==>", start: "<==", both: "<==>", none: "===" },
  dotted: { end: "..>", start: "<..", both: "<..>", none: "..." },
};

function opText(op: EdgeHop["op"]): string {
  if (op.label === undefined) return OPERATORS[op.line][op.arrow];
  return op.line === "dashed" ? `--[${op.label}]-->` : `-[${op.label}]->`;
}

/** A run of hops, each one's to list the next one's from list, as one line: "a, b -> c --> d". */
const chainText = (run: EdgeHop[]) =>
  run.reduce((s, h) => `${s} ${opText(h.op)} ${h.to.join(", ")}`, run[0]?.from.join(", ") ?? "");

interface ItemHops {
  hops: EdgeHop[];
  /** A run of the hops as an item of the same form, with the item's label and options. */
  write: (run: EdgeHop[]) => string | Record<string, unknown>;
}

/** An edge item's hops, read the way edgeShape reads the item. */
function hopsOf(item: unknown): ItemHops | undefined {
  let expr: string | undefined;
  let value: unknown = null;
  if (typeof item === "string") expr = item;
  else if (isRecord(item)) {
    const keys = Object.keys(item);
    const only = keys.length === 1 ? (keys[0] as string) : undefined;
    if (only !== undefined && typeof parseEdgeExpression(only) !== "string") {
      expr = only;
      value = item[only];
    }
  } else return undefined;
  if (expr !== undefined) {
    const parsed = parseEdgeExpression(expr);
    if (typeof parsed === "string") return undefined;
    const tail = parsed.label === undefined ? "" : `: ${parsed.label}`;
    const line = (run: EdgeHop[]) => `${chainText(run)}${tail}`;
    return {
      hops: parsed.hops,
      write: (run) => (value === null ? line(run) : { [line(run)]: value }),
    };
  }
  const map = item as Record<string, unknown>;
  const fromKey = map.from !== undefined ? "from" : "source";
  const toKey = map.to !== undefined ? "to" : "target";
  if (map[fromKey] === undefined || map[toKey] === undefined) return undefined;
  const ids = (x: unknown) => (Array.isArray(x) ? x : [x]).map(String);
  const one = (x: string[] = []) => (x.length === 1 ? x[0] : x);
  return {
    hops: [{ from: ids(map[fromKey]), to: ids(map[toKey]), op: { line: "solid", arrow: "end" } }],
    write: (run) => ({ ...map, [fromKey]: one(run[0]?.from), [toKey]: one(run[0]?.to) }),
  };
}

/** Where a pair sits in its item: [hop, index in the hop's from list, index in its to list]. */
type PairAt = [number, number, number];

/** The item a match names, and the pair of it when the match is one hop of a fan or chain. */
interface Hit {
  item: number;
  pair?: PairAt;
}

/** Pairs of fan and chain items that a one-pair match names: as written or drawn, else by ends. */
function pairHits(list: unknown[], want: EdgeShape, plain: boolean): Hit[] {
  const exact: Hit[] = [];
  const loose: Hit[] = [];
  for (const [i, item] of list.entries()) {
    const read = hopsOf(item);
    if (!read) continue;
    const pairs = read.hops.flatMap((hop, k) =>
      hop.from.flatMap((from, f) =>
        hop.to.map((to, t) => ({
          at: [k, f, t] as PairAt,
          have: edgeShape(read.write([{ from: [from], to: [to], op: hop.op }])),
        })),
      ),
    );
    // An item of one pair was matched whole.
    if (pairs.length < 2) continue;
    for (const { at, have } of pairs) {
      if (typeof have === "string" || (want.label !== undefined && want.label !== have.label))
        continue;
      if (want.written === have.written || want.written === have.drawn)
        exact.push({ item: i, pair: at });
      else if (plain && have.ends[0] === want.ends[0]) loose.push({ item: i, pair: at });
    }
  }
  return exact.length ? exact : loose;
}

/**
 * The item without one pair, as the items left. A hop's from list is also the hop before's to
 * list and its to list the next hop's from list, so the run ends on the side that lost an id.
 */
function withoutPair(
  item: unknown,
  [k, f, t]: PairAt,
  match: string,
  source: string,
): ReturnType<ItemHops["write"]>[] {
  const read = hopsOf(item) as ItemHops;
  const hop = read.hops[k] as EdgeHop;
  const shape = edgeShape(item);
  if (read.hops.length > 1 && typeof shape !== "string" && shape.label !== undefined)
    throw new PatchError(
      `"${match}" is one hop of "${source}", whose label no hop draws; write its hops as their own lines first`,
    );
  const before = read.hops.slice(0, k);
  const after = read.hops.slice(k + 1);
  const drop = (ids: string[], at: number) => ids.filter((_, j) => j !== at);
  let runs: EdgeHop[][];
  if (hop.from.length === 1 && hop.to.length === 1) runs = [before, after];
  else if (hop.to.length === 1) runs = [before, [{ ...hop, from: drop(hop.from, f) }, ...after]];
  else if (hop.from.length === 1) runs = [[...before, { ...hop, to: drop(hop.to, t) }], after];
  else
    throw new PatchError(
      `"${match}" is one pair of "${source}", which has lists at both ends; write one line per source first`,
    );
  return runs.filter((run) => run.length).map((run) => read.write(run));
}

function matchEdge(v: View, seq: PSeq, list: unknown[], match: string): Hit {
  const want = edgeShape(match);
  if (typeof want === "string") throw new PatchError(`cannot read match "${match}": ${want}`);
  const source = (i: number) => {
    const node = seq.items[i] as ParsedNode;
    return v.text.slice(node.range[0], contentEnd(node, v.text));
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
    if (loose.length === 1) return { item: loose[0] as number };
  }
  if (hits.length === 1) return { item: hits[0] as number };
  // The same goes for one hop of a fan or chain: "api -> logs" in "api, fn -> logs".
  const pairs: Hit[] = hits.length || want.ends.length !== 1 ? [] : pairHits(list, want, plain);
  if (pairs.length === 1) return pairs[0] as Hit;
  const quote = (ids: number[]) =>
    [...new Set(ids)]
      .slice(0, 3)
      .map((i) => `"${source(i)}"`)
      .join(", ");
  const many = hits.length > 1 ? hits : pairs.map((p) => p.item);
  if (many.length > 1)
    throw new PatchError(
      `"${match}" matches ${many.length} edges (${quote(many)}); add the label to pick one`,
    );
  throw new PatchError(
    `no edge matches "${match}"${near.length ? `; edges between the same nodes: ${quote(near)}` : ""}`,
  );
}

export function edgeOp(
  v: View,
  root: PMap,
  list: unknown,
  op: { match: string | null; value: unknown },
): Edit[] {
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
  const hit = matchEdge(v, seq, list, match);
  const node = seq.items[hit.item] as ParsedNode;
  const ctx = ctxOf(v, seq);
  const start = node.range[0];
  const end = contentEnd(node, v.text);
  if (hit.pair) {
    // The rest of the fan or chain keeps its place, and a new edge goes right after it.
    const items = withoutPair(list[hit.item], hit.pair, match, v.text.slice(start, end));
    if (edge !== null) items.push(edge);
    const sep = ctx === "block" ? `\n${v.text.slice(lineStart(v.text, start), start)}` : ", ";
    return [{ start, end, text: items.map((x) => edgeText(x, ctx)).join(sep) }];
  }
  if (edge === null) return [removeItem(v, seq, hit.item)];
  return [{ start, end, text: edgeText(edge, ctx) }];
}
