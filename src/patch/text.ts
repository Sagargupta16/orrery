// YAML text splicing for patch ops: item spans, values written in the spec's style, and the edits.
import {
  isMap,
  isPair,
  isScalar,
  isSeq,
  type Pair,
  type ParsedNode,
  stringify,
  type YAMLMap,
  type YAMLSeq,
} from "yaml";

export type PMap = YAMLMap.Parsed;
export type PSeq = YAMLSeq.Parsed;
type Item = Pair<ParsedNode, ParsedNode | null> | ParsedNode;
/** Where a value is written: a block line, inside a flow collection, or a JSON spec. */
export type Ctx = "block" | "flow" | "json";

export interface View {
  text: string;
  json: boolean;
}

export interface Edit {
  start: number;
  end: number;
  text: string;
}

interface Span {
  start: number;
  end: number;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export const lineStart = (t: string, p: number) => t.lastIndexOf("\n", p - 1) + 1;
const lineEnd = (t: string, p: number) => {
  const n = t.indexOf("\n", p);
  return n < 0 ? t.length : n + 1;
};
export const isNull = (n: ParsedNode | null): boolean => !n || (isScalar(n) && n.value === null);
const firstNode = (item: Item): ParsedNode =>
  isPair(item) ? (item.key ?? (item.value as ParsedNode)) : item;
const lastNode = (item: Item): ParsedNode => (isPair(item) ? (item.value ?? item.key) : item);

/** Where a node's own text ends: before trailing comments, blank lines and the next item. */
export function contentEnd(n: ParsedNode, text?: string): number {
  if ((isMap(n) || isSeq(n)) && !n.flow) {
    const last = n.items.at(-1);
    if (last) return contentEnd(lastNode(last), text);
  }
  let end = n.range[1];
  // A block scalar (| or >) owns the line breaks after it, which whole-line spans keep; a
  // splice passes the text to stop before them, so the next line stays on its own.
  if (
    text !== undefined &&
    isScalar(n) &&
    (n.type === "BLOCK_LITERAL" || n.type === "BLOCK_FOLDED")
  )
    while (end > n.range[0] && /\s/.test(text[end - 1] ?? "")) end -= 1;
  return end;
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

export function applyEdits(text: string, edits: Edit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start))
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** A scalar as YAML text in its context; yaml's own stringifier decides the quoting. */
export function scalarText(value: unknown, ctx: Ctx): string {
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
export function inline(value: unknown, ctx: Ctx): string {
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

export const ctxOf = (v: View, coll: PMap | PSeq): Ctx =>
  v.json ? "json" : coll.flow ? "flow" : "block";

export const pairOf = (map: PMap, key: string) =>
  map.items.find((p) => isScalar(p.key) && String(p.key.value) === key);

export function removeItem(v: View, coll: PMap | PSeq, i: number): Edit {
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
export function insertItem(v: View, coll: PMap | PSeq, item: string, before?: number): Edit {
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

export function replaceValue(
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
    return { start: colon, end: contentEnd(node, v.text), text: `: ${text}` };
  }
  return { start: node.range[0], end: contentEnd(node, v.text), text };
}

/** Sets key in map; new top-level keys go above the groups, nodes and edges sections. */
export function insertPair(v: View, map: PMap, key: string, value: unknown, root = false): Edit {
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

export function reorder(v: View, coll: PMap, from: number, to: number, after: boolean): Edit {
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
