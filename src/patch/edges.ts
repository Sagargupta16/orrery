// The edge op: edge items read the way parseSpec reads them, matched by their ends, written back.
import { isSeq, type ParsedNode } from "yaml";
import { parseEdgeExpression } from "../spec.ts";
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
  const i = matchEdge(v, seq, list, match);
  if (edge === null) return [removeItem(v, seq, i)];
  const node = seq.items[i] as ParsedNode;
  return [{ start: node.range[0], end: contentEnd(node), text: edgeText(edge, ctxOf(v, seq)) }];
}
