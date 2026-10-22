// Edges: the arrow expression grammar ("a -> b: label") and the edges list it feeds.
import {
  ARROWS,
  type ArrowMode,
  EDGE_FLOWS,
  EDGE_LINES,
  type EdgeFlow,
  type EdgeLine,
} from "../types.ts";
import type { Ctx } from "./context.ts";
import { EDGE_KEYS, EDGE_SYNONYMS } from "./keys.ts";
import { edgeErKeys, flipErKeys } from "./kinds.ts";
import { metaOf, tagged } from "./meta.ts";
import { suggestIds } from "./suggest.ts";
import { hexColor, isObj, type Obj, oneOf, pick, str, unknownKeys } from "./values.ts";

// ---------------------------------------------------------------- edge expressions

interface Op {
  line: EdgeLine;
  arrow: ArrowMode;
  label?: string;
}

const OPS: [string, Op][] = [
  ["<-->", { line: "dashed", arrow: "both" }],
  ["<==>", { line: "thick", arrow: "both" }],
  ["<..>", { line: "dotted", arrow: "both" }],
  ["<->", { line: "solid", arrow: "both" }],
  ["-->", { line: "dashed", arrow: "end" }],
  ["<--", { line: "dashed", arrow: "start" }],
  ["==>", { line: "thick", arrow: "end" }],
  ["<==", { line: "thick", arrow: "start" }],
  ["..>", { line: "dotted", arrow: "end" }],
  ["<..", { line: "dotted", arrow: "start" }],
  ["->", { line: "solid", arrow: "end" }],
  ["<-", { line: "solid", arrow: "start" }],
  ["---", { line: "dashed", arrow: "none" }],
  ["===", { line: "thick", arrow: "none" }],
  ["...", { line: "dotted", arrow: "none" }],
  ["--", { line: "solid", arrow: "none" }],
];

/** Arrows with a label inside: -[label]-> and --[label]-->. */
const LABELED: [string, string, EdgeLine][] = [
  ["-[", "]->", "solid"],
  ["--[", "]-->", "dashed"],
];

const space = (c: string | undefined) => c !== undefined && /\s/.test(c);

/**
 * The operator starting at `i`, if any: a labeled arrow first, then the first of OPS that fits.
 * Operators without an arrowhead (--, ---, ===, ...) need whitespace on both sides, so a-b-c and
 * a...b stay names. A scanner rather than one regex: CodeQL reads any regex that matches --> as
 * an HTML comment filter.
 */
function operatorAt(s: string, i: number): { length: number; op: Op } | undefined {
  for (const [open, close, line] of LABELED) {
    if (!s.startsWith(open, i)) continue;
    const end = s.indexOf("]", i + open.length);
    if (end >= 0 && s.startsWith(close, end))
      return {
        length: end + close.length - i,
        op: { line, arrow: "end", label: s.slice(i + open.length, end).trim() },
      };
  }
  for (const [text, op] of OPS) {
    if (!s.startsWith(text, i)) continue;
    if (/[<>]/.test(text) || (space(s[i - 1]) && space(s[i + text.length])))
      return { length: text.length, op };
  }
  return undefined;
}

/** Every operator in `s`, leftmost first, never overlapping. */
function operators(s: string): { index: number; length: number; op: Op }[] {
  const found: { index: number; length: number; op: Op }[] = [];
  for (let i = 0; i < s.length; ) {
    const hit = operatorAt(s, i);
    if (!hit) {
      i += 1;
      continue;
    }
    found.push({ index: i, ...hit });
    i += hit.length;
  }
  return found;
}

const hasOperator = (s: string) => operators(` ${s} `).length > 0;

/** Index of the ":" that starts an edge label, skipping colons inside -[inline labels]->. */
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

export interface EdgeHop {
  from: string[];
  to: string[];
  op: Op;
}

/** Parses "a -> b, c --> d: label" into hops; returns an error string for bad syntax. */
export function parseEdgeExpression(expr: string): { hops: EdgeHop[]; label?: string } | string {
  let body = expr.trim();
  let label: string | undefined;
  const colon = labelColon(body);
  if (colon >= 0) {
    label = body.slice(colon + 1).trim() || undefined;
    body = body.slice(0, colon).trim();
  }
  const parts: (string | Op)[] = [];
  let last = 0;
  for (const m of operators(body)) {
    parts.push(body.slice(last, m.index).trim());
    parts.push({ ...m.op });
    last = m.index + m.length;
  }
  parts.push(body.slice(last).trim());
  if (parts.length < 3) return `no arrow found in "${expr}" (use ->, -->, <->, -- ...)`;
  const hops: EdgeHop[] = [];
  for (let i = 0; i + 2 < parts.length; i += 2) {
    const a = parts[i];
    const op = parts[i + 1];
    const b = parts[i + 2];
    if (typeof a !== "string" || typeof b !== "string" || typeof op === "string" || !op) {
      return `cannot read "${expr}"`;
    }
    const from = a
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const to = b
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!from.length || !to.length) return `missing endpoint in "${expr}"`;
    hops.push({ from, to, op });
  }
  return { hops, label };
}

// ---------------------------------------------------------------- the edges list

export function parseEdges(ctx: Ctx) {
  const rawEdges = ctx.raw.edges;
  const list: unknown[] = Array.isArray(rawEdges)
    ? rawEdges
    : isObj(rawEdges)
      ? Object.entries(rawEdges).map(([k, v]) => ({ [k]: v }))
      : [];
  if (rawEdges !== undefined && !Array.isArray(rawEdges) && !isObj(rawEdges)) {
    ctx.err("DG109", "edges must be a list", {
      subject: { where: "edges" },
      fixes: ["write edges as a list: - a -> b"],
    });
  }
  for (const [i, item] of list.entries()) parseEdgeItem(ctx, item, `edges[${i}]`);
}

/** One entry of the list: "a -> b", { "a -> b": label or options } or { from, to, ... }. */
function parseEdgeItem(ctx: Ctx, item: unknown, where: string) {
  if (typeof item === "string") {
    expand(ctx, item, undefined, {}, where);
    return;
  }
  if (!isObj(item)) {
    ctx.err("DG109", `${where} must be a string or a mapping`, {
      subject: { edge: where },
      fixes: ['write "a -> b", "a -> b: label" or { from: a, to: b }'],
    });
    return;
  }
  const keys = Object.keys(item);
  const exprKey = keys.length === 1 && hasOperator(keys[0] ?? "") ? keys[0] : undefined;
  if (exprKey) {
    const v = item[exprKey];
    if (typeof v === "string" || typeof v === "number") expand(ctx, exprKey, String(v), {}, where);
    else if (isObj(v)) {
      unknownKeys(
        ctx,
        v,
        EDGE_KEYS.filter((k) => k !== "from" && k !== "to"),
        EDGE_SYNONYMS,
        where,
      );
      expand(ctx, exprKey, str(pick(v, "label", EDGE_SYNONYMS)), v, where);
    } else expand(ctx, exprKey, undefined, {}, where);
    return;
  }
  unknownKeys(ctx, item, EDGE_KEYS, EDGE_SYNONYMS, where);
  const from = pick(item, "from", EDGE_SYNONYMS);
  const to = pick(item, "to", EDGE_SYNONYMS);
  if (from === undefined || to === undefined) {
    ctx.err("DG109", `${where} needs "from" and "to"`, {
      fixes: ['add from: and to:, or write "a -> b"'],
    });
    return;
  }
  const froms = (Array.isArray(from) ? from : [from]).map(String);
  const tos = (Array.isArray(to) ? to : [to]).map(String);
  const op: Op = { line: "solid", arrow: "end" };
  for (const f of froms)
    for (const t of tos) push(ctx, f, t, op, str(pick(item, "label", EDGE_SYNONYMS)), item, where);
}

/** Adds every hop of an arrow expression; a label only sticks to a single hop. */
function expand(ctx: Ctx, expr: string, label: string | undefined, extra: Obj, where: string) {
  const parsed = parseEdgeExpression(expr);
  if (typeof parsed === "string") {
    ctx.err("DG109", `${where}: ${parsed}`, {
      subject: { edge: where },
      fixes: ['write edges as "a -> b", "a -> b: label" or {from: a, to: b}'],
    });
    return;
  }
  const single = parsed.hops.length === 1;
  for (const hop of parsed.hops) {
    for (const f of hop.from)
      for (const t of hop.to)
        push(ctx, f, t, hop.op, single ? (label ?? parsed.label) : undefined, extra, where);
  }
  if (!single && (label ?? parsed.label)) {
    ctx.warn("DG110", `${where}: a label on a chain applies to no single hop and was dropped`, {
      fixes: ['label one hop inline: "a -[label]-> b -> c"'],
    });
  }
}

const endpoint = (ctx: Ctx, id: string, where: string): boolean => {
  if (ctx.ids.has(id)) return true;
  ctx.err("DG106", `${where} connects unknown id "${id}"`, {
    subject: { edge: where, id },
    fixes: suggestIds(id, ctx.ids).map((s) => `use "${s}"`),
  });
  return false;
};

function push(
  ctx: Ctx,
  from: string,
  to: string,
  op: Op,
  label: string | undefined,
  extra: Obj,
  where: string,
) {
  const { edges } = ctx;
  if (!endpoint(ctx, from, where) || !endpoint(ctx, to, where)) return;
  // "a <- b" is drawn as b -> a so layout flows the way the data does.
  const reverse = op.arrow === "start";
  const lineRaw = pick(extra, "line", EDGE_SYNONYMS);
  const arrowRaw = pick(extra, "arrow", EDGE_SYNONYMS);
  const flowRaw = pick(extra, "flow", EDGE_SYNONYMS);
  const flow =
    flowRaw === undefined
      ? undefined
      : oneOf<EdgeFlow>(ctx, flowRaw, EDGE_FLOWS, "sequence", `${where} flow`);
  // BPMN draws message flows dashed and associations dotted with no arrowhead.
  const flowLine: EdgeLine | undefined =
    flow === "message" ? "dashed" : flow === "association" ? "dotted" : undefined;
  const color = hexColor(ctx, pick(extra, "color", EDGE_SYNONYMS), "color", where, {
    edge: where,
  });
  const stepRaw = pick(extra, "step", EDGE_SYNONYMS);
  const step = stepRaw === undefined ? undefined : Number(stepRaw);
  if (step !== undefined && (!Number.isInteger(step) || step < 0 || step > 99)) {
    ctx.err("DG107", `${where} step must be a whole number from 0 to 99`, {
      subject: { edge: where },
      fixes: ["use step: 1, 2, 3..."],
    });
  }
  const meta = metaOf(ctx, extra, where, { edge: where });
  // Cardinality and field ends read left to right as written, so a reversed edge swaps them.
  const written = edgeErKeys(ctx, where, from, to, {
    card: pick(extra, "card", EDGE_SYNONYMS),
    fromField: pick(extra, "from_field", EDGE_SYNONYMS),
    toField: pick(extra, "to_field", EDGE_SYNONYMS),
  });
  const er = reverse ? flipErKeys(written) : written;
  // A tag's line replaces only the default solid one; any other arrow, a flow or line: is chosen.
  const tag = tagged(ctx, meta.tags);
  edges.push({
    id: `e${edges.length + 1}`,
    from: reverse ? to : from,
    to: reverse ? from : to,
    label: op.label ?? label,
    line:
      lineRaw !== undefined
        ? oneOf<EdgeLine>(ctx, lineRaw, EDGE_LINES, op.line, `${where} line`)
        : (flowLine ?? (op.line === "solid" ? (tag.line ?? op.line) : op.line)),
    arrow:
      arrowRaw !== undefined
        ? oneOf<ArrowMode>(ctx, arrowRaw, ARROWS, "end", `${where} arrow`)
        : flow === "association"
          ? "none"
          : reverse
            ? "end"
            : op.arrow,
    color: color ?? tag.color,
    step: step !== undefined && Number.isInteger(step) ? step : undefined,
    constraint: pick(extra, "constraint", EDGE_SYNONYMS) !== false,
    ...(flow && flow !== "sequence" ? { flow } : {}),
    ...er,
    ...meta,
  });
}
