// The keys of the er, sequence and timeline kinds: entity fields and relationship cardinality
// (DG123, DG124), combined fragments over message ranges (DG125), and dates on a time axis
// (DG126). Each key is read only in its own kind; elsewhere it is an error that names the kind.
import {
  type DiagramKind,
  type ErEnd,
  type ErField,
  FRAGMENT_TYPES,
  ITEM_STATUSES,
  type ItemStatus,
  type ModelEdge,
  type ModelNode,
  type ModelTimeline,
  type SeqFragment,
  TIME_SCALES,
  type TimeScale,
} from "../types.ts";
import type { Ctx } from "./context.ts";
import { closest } from "./suggest.ts";
import { isObj, type Obj, oneOf, str, unknownKeys } from "./values.ts";

/** An error for a key written in a diagram of another kind; true when it was. */
function outOfKind(
  ctx: Ctx,
  code: string,
  kind: DiagramKind,
  key: string,
  where: string,
  subject: Obj,
): boolean {
  if (ctx.kind === kind) return false;
  ctx.err(code, `${where} ${key} only applies to kind: ${kind}`, {
    subject,
    fixes: [`add kind: ${kind} at the top, or remove ${key}`],
  });
  return true;
}

// ---------------------------------------------------------------- er: fields

const FIELD_KEYS = ["name", "type", "pk", "fk", "unique", "nullable", "note"];
const FIELD_FLAGS: Record<string, "pk" | "fk" | "unique" | "nullable"> = {
  pk: "pk",
  fk: "fk",
  unique: "unique",
  null: "nullable",
};

/** A node's `fields:` (er): "name type [pk] [fk] [unique] [null]" strings or mappings. */
export function nodeFields(ctx: Ctx, id: string, value: unknown): ErField[] | undefined {
  if (value === undefined || value === null) return undefined;
  const where = `node "${id}" fields`;
  if (outOfKind(ctx, "DG123", "er", "fields", `node "${id}"`, { where })) return undefined;
  if (!Array.isArray(value)) {
    ctx.err("DG123", `${where} must be a list of fields`, {
      subject: { where },
      fixes: ['write fields: ["id uuid pk", "email text unique", "team_id uuid fk"]'],
    });
    return undefined;
  }
  const fields: ErField[] = [];
  const seen = new Set<string>();
  for (const [i, item] of value.entries()) {
    const f = isObj(item)
      ? fieldMapping(ctx, item, `${where}[${i}]`)
      : fieldString(ctx, item, `${where}[${i}]`);
    if (!f) continue;
    const key = f.name.toLowerCase();
    if (seen.has(key)) {
      ctx.err("DG123", `${where} lists "${f.name}" twice`, {
        subject: { where, field: f.name },
        fixes: [`rename or remove the second "${f.name}"`],
      });
      continue;
    }
    seen.add(key);
    fields.push(f);
  }
  return fields.length ? fields : undefined;
}

/** "id uuid pk": the name, then the type, then flags in any order (a flag second means no type). */
function fieldString(ctx: Ctx, item: unknown, where: string): ErField | undefined {
  const text = typeof item === "string" || typeof item === "number" ? String(item).trim() : "";
  const [name, ...rest] = text.split(/\s+/).filter(Boolean);
  if (!name) {
    ctx.err("DG123", `${where} needs a name: "name type [pk] [fk] [unique] [null]"`, {
      subject: { where },
      fixes: ['write "id uuid pk", or { name: id, type: uuid, pk: true }'],
    });
    return undefined;
  }
  const field: ErField = { name };
  const first = rest[0];
  if (first !== undefined && !(first.toLowerCase() in FIELD_FLAGS)) {
    field.type = first;
    rest.shift();
  }
  for (const token of rest) {
    const flag = FIELD_FLAGS[token.toLowerCase()];
    if (flag) {
      field[flag] = true;
      continue;
    }
    const near = closest(token, Object.keys(FIELD_FLAGS));
    ctx.err("DG123", `${where} "${text}": unknown token "${token}" after the type`, {
      subject: { where, value: text },
      fixes: [
        near ? `use "${near}"` : "after the type, use only pk, fk, unique and null",
        `a type with spaces goes in the mapping form: { name: ${name}, type: "..." }`,
      ],
    });
    return undefined;
  }
  return field;
}

function fieldMapping(ctx: Ctx, item: Obj, where: string): ErField | undefined {
  unknownKeys(ctx, item, FIELD_KEYS, {}, where);
  const name = str(item.name)?.trim();
  if (!name) {
    ctx.err("DG123", `${where} needs a name`, {
      subject: { where },
      fixes: ["add name: id"],
    });
    return undefined;
  }
  const field: ErField = { name };
  const type = str(item.type)?.trim();
  if (type) field.type = type;
  for (const flag of ["pk", "fk", "unique", "nullable"] as const) {
    const v = item[flag];
    if (v === undefined || v === null) continue;
    if (typeof v !== "boolean") {
      ctx.err("DG123", `${where} ${flag} must be true or false`, {
        subject: { where, key: flag },
        fixes: [`write ${flag}: true`],
      });
      continue;
    }
    if (v) field[flag] = true;
  }
  const note = str(item.note);
  if (note) field.note = note;
  return field;
}

// ---------------------------------------------------------------- er: card and field ends

const CARD_ENDS: Record<string, ErEnd> = {
  "1": "one",
  "0..1": "zero-one",
  "1..n": "many",
  "1..*": "many",
  n: "many",
  "0..n": "zero-many",
  "0..*": "zero-many",
  "*": "zero-many",
};

/** An edge's `card`, `from_field` and `to_field` (er), as written left to right. */
export function edgeErKeys(
  ctx: Ctx,
  where: string,
  from: string,
  to: string,
  raw: { card: unknown; fromField: unknown; toField: unknown },
): Pick<ModelEdge, "card" | "fromField" | "toField"> {
  const out: Pick<ModelEdge, "card" | "fromField" | "toField"> = {};
  for (const [key, value] of [
    ["card", raw.card],
    ["from_field", raw.fromField],
    ["to_field", raw.toField],
  ] as const) {
    if (value === undefined || value === null) continue;
    if (outOfKind(ctx, "DG124", "er", key, where, { where: `${where} ${key}` })) return {};
  }
  if (raw.card !== undefined && raw.card !== null) {
    const card = cardOf(raw.card);
    if (card) out.card = card;
    else
      ctx.err(
        "DG124",
        `${where} card must be "A:B", each end 1, 0..1, 1..n (or n) or 0..n (or *); got "${String(raw.card)}"`,
        {
          subject: { where: `${where} card`, value: raw.card },
          fixes: ['write card: "1:n" (one to many), "1:0..1" or "0..n:1..n"'],
        },
      );
  }
  const field = (key: "from_field" | "to_field", value: unknown, end: string) => {
    if (value === undefined || value === null) return undefined;
    const name = str(value)?.trim() ?? "";
    const own = ctx.nodes.find((x) => x.id === end)?.fields ?? [];
    if (own.some((f) => f.name === name)) return name;
    const near = closest(
      name,
      own.map((f) => f.name),
    );
    ctx.err("DG124", `${where} ${key} "${name}" is not a field of "${end}"`, {
      subject: { where: `${where} ${key}`, value: name },
      fixes: near
        ? [`use ${key}: ${near}`]
        : own.length
          ? [`use one of ${own.map((f) => f.name).join(", ")}`]
          : [`add fields: to "${end}", or remove ${key}`],
    });
    return undefined;
  };
  const fromField = field("from_field", raw.fromField, from);
  const toField = field("to_field", raw.toField, to);
  if (fromField) out.fromField = fromField;
  if (toField) out.toField = toField;
  return out;
}

function cardOf(value: unknown): { from: ErEnd; to: ErEnd } | undefined {
  if (typeof value !== "string") return undefined;
  const m = /^\s*([^:\s]+)\s*:\s*([^:\s]+)\s*$/.exec(value);
  const a = m?.[1] && CARD_ENDS[m[1].toLowerCase()];
  const b = m?.[2] && CARD_ENDS[m[2].toLowerCase()];
  return a && b ? { from: a, to: b } : undefined;
}

/** The ends of an edge drawn the other way ("a <- b" is stored as b -> a). */
export function flipErKeys(
  k: Pick<ModelEdge, "card" | "fromField" | "toField">,
): Pick<ModelEdge, "card" | "fromField" | "toField"> {
  return {
    ...(k.card ? { card: { from: k.card.to, to: k.card.from } } : {}),
    ...(k.toField ? { fromField: k.toField } : {}),
    ...(k.fromField ? { toField: k.fromField } : {}),
  };
}

// ---------------------------------------------------------------- sequence: fragments

const FRAGMENT_KEYS = ["type", "label", "from", "to", "else"];

/** Top-level `fragments:` (sequence): loop, alt, opt, par, break and critical over messages. */
export function parseFragments(ctx: Ctx): SeqFragment[] {
  const raw = ctx.raw.fragments;
  if (raw === undefined || raw === null) return [];
  if (outOfKind(ctx, "DG125", "sequence", "fragments", "the top level", { where: "fragments" }))
    return [];
  if (!Array.isArray(raw)) {
    ctx.err("DG125", "fragments must be a list", {
      subject: { where: "fragments" },
      fixes: ["write fragments: [{ type: loop, label: every 5s, from: 2, to: 4 }]"],
    });
    return [];
  }
  const count = ctx.edges.length;
  const out: SeqFragment[] = [];
  for (const [i, item] of raw.entries()) {
    const f = fragment(ctx, item, `fragments[${i}]`, count);
    if (f) out.push(f);
  }
  // Two fragments either nest or stay apart: a box that half covers another cannot be drawn.
  for (const [i, a] of out.entries())
    for (const b of out.slice(i + 1)) {
      const overlap = a.from <= b.to && b.from <= a.to;
      const nested = (a.from <= b.from && b.to <= a.to) || (b.from <= a.from && a.to <= b.to);
      if (overlap && !nested)
        ctx.err(
          "DG125",
          `fragments ${a.type} (messages ${a.from}-${a.to}) and ${b.type} (messages ${b.from}-${b.to}) overlap without one inside the other`,
          {
            subject: { where: "fragments" },
            fixes: [`end the ${a.type} before message ${b.from}, or widen one to hold the other`],
          },
        );
    }
  return out;
}

function fragment(ctx: Ctx, item: unknown, where: string, count: number): SeqFragment | undefined {
  const bad = (message: string, fixes: string[], extra: Obj = {}) => {
    ctx.err("DG125", `${where} ${message}`, { subject: { where: "fragments", ...extra }, fixes });
    return undefined;
  };
  if (!isObj(item))
    return bad("must be a mapping", ["write { type: loop, label: retry, from: 2, to: 3 }"]);
  unknownKeys(ctx, item, FRAGMENT_KEYS, {}, where);
  const typeRaw = str(item.type)?.trim().toLowerCase();
  const type = FRAGMENT_TYPES.find((t) => t === typeRaw);
  if (!type) {
    const near = typeRaw ? closest(typeRaw, FRAGMENT_TYPES) : undefined;
    return bad(
      typeRaw
        ? `type must be one of ${FRAGMENT_TYPES.join(", ")}; got "${typeRaw}"`
        : `needs a type: ${FRAGMENT_TYPES.join(", ")}`,
      [near ? `use type: ${near}` : "use type: loop"],
      { value: typeRaw },
    );
  }
  const range = `1 to ${count}, the messages in edge order`;
  const message = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= count ? v : undefined;
  const from = message(item.from);
  const to = message(item.to);
  if (from === undefined || to === undefined)
    return bad(
      `from and to must be message numbers from ${range}; got from: ${String(item.from)}, to: ${String(item.to)}`,
      [count ? `use from: 1, to: ${count}` : "add the messages as edges first"],
    );
  if (from > to)
    return bad(`starts at message ${from}, after its end at ${to}`, [
      `swap them: from: ${to}, to: ${from}`,
    ]);
  const f: SeqFragment = { type, from, to };
  const label = str(item.label)?.trim();
  if (label) f.label = label;
  if (item.else === undefined || item.else === null) return f;
  if (type !== "alt" && type !== "par")
    return bad(`is a ${type}; only alt and par have else branches`, [
      "use type: alt for branches, or remove else",
    ]);
  if (!Array.isArray(item.else))
    return bad("else must be a list of { at, label }", [
      `write else: [{ at: ${Math.min(to, from + 1)}, label: otherwise }]`,
    ]);
  const branches: { at: number; label?: string }[] = [];
  let last = from;
  for (const b of item.else) {
    const at = isObj(b) ? b.at : undefined;
    // A branch starts after the first message and no later than the last, each after the one before.
    if (typeof at !== "number" || !Number.isInteger(at) || at <= last || at > to)
      return bad(
        `else at must be a message from ${last + 1} to ${to}, each branch after the one before; got ${String(at)}`,
        [`use at: ${Math.min(to, last + 1)}`],
      );
    if (isObj(b)) unknownKeys(ctx, b, ["at", "label"], {}, `${where} else`);
    const text = isObj(b) ? str(b.label)?.trim() : undefined;
    branches.push(text ? { at, label: text } : { at });
    last = at;
  }
  if (branches.length) f.else = branches;
  return f;
}

// ---------------------------------------------------------------- timeline: dates

const ORDER: TimeScale[] = ["day", "week", "month", "quarter", "year"];
const pad = (v: number, w: number) => String(v).padStart(w, "0");
const iso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A written date as its first and last day, and the precision it was written in. */
interface Dated {
  first: string;
  last: string;
  precision: TimeScale;
}

/**
 * Reads YYYY-MM-DD, YYYY-MM, YYYY-Qn or YYYY. YAML reads a bare 2026 as a number, so numbers
 * count as years; a YAML 1.1 timestamp that arrives as a Date counts as its day.
 */
export function readDate(value: unknown): Dated | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = iso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    return { first: day, last: day, precision: "day" };
  }
  const text =
    typeof value === "number" && Number.isInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  let m = /^(\d{4})$/.exec(text);
  if (m) {
    const y = Number(m[1]);
    return { first: iso(y, 1, 1), last: iso(y, 12, 31), precision: "year" };
  }
  m = /^(\d{4})-[Qq]([1-4])$/.exec(text);
  if (m) {
    const y = Number(m[1]);
    const q = Number(m[2]);
    return {
      first: iso(y, 3 * q - 2, 1),
      last: iso(y, 3 * q, daysIn(y, 3 * q)),
      precision: "quarter",
    };
  }
  m = /^(\d{4})-(\d{2})$/.exec(text);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return undefined;
    return { first: iso(y, mo, 1), last: iso(y, mo, daysIn(y, mo)), precision: "month" };
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return undefined;
    return { first: text, last: text, precision: "day" };
  }
  return undefined;
}

const DATE_FIX = "write a date as 2026-11-05, 2026-11, 2026-Q4 or 2026";

/** A date key's value, or undefined after a DG126 when it cannot be read. */
function dateKey(ctx: Ctx, value: unknown, name: string, subject: Obj): Dated | undefined {
  const d = readDate(value);
  if (!d)
    ctx.err(
      "DG126",
      `${name} must be a date: YYYY-MM-DD, YYYY-MM, YYYY-Qn or YYYY; got "${String(value)}"`,
      { subject: { ...subject, value: String(value) }, fixes: [DATE_FIX] },
    );
  return d;
}

/** A node's `date` or `start` + `end`, `milestone` and `status` (timeline). */
export function nodeTimeKeys(
  ctx: Ctx,
  id: string,
  n: Obj,
): Pick<ModelNode, "when" | "milestone" | "status"> {
  const out: Pick<ModelNode, "when" | "milestone" | "status"> = {};
  const has = (k: string) => n[k] !== undefined && n[k] !== null;
  const keys = ["date", "start", "end", "milestone", "status"].filter(has);
  for (const key of keys)
    if (outOfKind(ctx, "DG126", "timeline", key, `node "${id}"`, { where: `node "${id}" ${key}` }))
      return {};
  if (ctx.kind !== "timeline") return out;
  const at = (key: string) => ({ where: `node "${id}" ${key}` });
  if (has("date") && (has("start") || has("end"))) {
    ctx.err("DG126", `node "${id}" has both date and start/end`, {
      subject: at("date"),
      fixes: ["keep date: for a point in time, or start: and end: for a span, not both"],
    });
  } else if (has("date")) {
    const d = dateKey(ctx, n.date, `node "${id}" date`, at("date"));
    if (d) out.when = { start: d.first, precision: d.precision };
  } else if (has("start") !== has("end")) {
    const [given, missing] = has("start") ? ["start", "end"] : ["end", "start"];
    ctx.err("DG126", `node "${id}" has ${given} but no ${missing}`, {
      subject: at(given),
      fixes: [`add ${missing}:, or use date: for a point in time`],
    });
  } else if (has("start")) {
    const s = dateKey(ctx, n.start, `node "${id}" start`, at("start"));
    const e = dateKey(ctx, n.end, `node "${id}" end`, at("end"));
    if (s && e && e.last < s.first)
      ctx.err("DG126", `node "${id}" ends (${e.last}) before it starts (${s.first})`, {
        subject: at("end"),
        fixes: [`swap them: start: ${String(n.end)}, end: ${String(n.start)}`],
      });
    else if (s && e) {
      // The finer of the two: a span written to the day is read to the day.
      const precision = ORDER[Math.min(ORDER.indexOf(s.precision), ORDER.indexOf(e.precision))];
      out.when = { start: s.first, end: e.last, precision: precision ?? "day" };
    }
  } else {
    // Placed nowhere on the axis; the review counts it (conventions.timeline-undated).
    ctx.warn("DG126", `node "${id}" has no date; a timeline item needs date: or start: and end:`, {
      subject: { node: id },
      fixes: ["add date: 2026-11 for a point, or start: 2026-Q3 and end: 2026-Q4 for a span"],
    });
  }
  if (has("milestone")) {
    if (typeof n.milestone !== "boolean")
      ctx.err("DG107", `node "${id}" milestone must be true or false`, {
        subject: at("milestone"),
        fixes: ["write milestone: true"],
      });
    else if (n.milestone) out.milestone = true;
  }
  if (has("status"))
    out.status = oneOf<ItemStatus>(ctx, n.status, ITEM_STATUSES, "planned", `node "${id}" status`);
  return out;
}

const TIMELINE_KEYS = ["scale", "start", "end", "today"];

/** Top-level `timeline:` (timeline): scale, axis bounds and today; every timeline gets one. */
export function parseTimeline(ctx: Ctx): ModelTimeline | undefined {
  const raw = ctx.raw.timeline;
  const given = raw !== undefined && raw !== null;
  if (
    given &&
    outOfKind(ctx, "DG126", "timeline", "timeline", "the top level", { where: "timeline" })
  )
    return undefined;
  if (ctx.kind !== "timeline") return undefined;
  const out: ModelTimeline = { scale: "month" };
  if (!given) return out;
  if (!isObj(raw)) {
    ctx.err("DG126", "timeline must be a mapping: { scale, start, end, today }", {
      subject: { where: "timeline" },
      fixes: ["write timeline: { scale: quarter, start: 2026-Q1, end: 2026-Q4 }"],
    });
    return out;
  }
  unknownKeys(ctx, raw, TIMELINE_KEYS, {}, "timeline");
  if (raw.scale !== undefined && raw.scale !== null) {
    const v = String(raw.scale).trim().toLowerCase();
    const scale = TIME_SCALES.find((s) => s === v);
    if (scale) out.scale = scale;
    else {
      const near = closest(v, TIME_SCALES);
      ctx.err(
        "DG126",
        `timeline.scale must be one of ${TIME_SCALES.join(", ")}; got "${String(raw.scale)}"`,
        {
          subject: { where: "timeline.scale", value: String(raw.scale) },
          fixes: [near ? `use scale: ${near}` : "use scale: month"],
        },
      );
    }
  }
  const bound = (key: "start" | "end" | "today") =>
    raw[key] === undefined || raw[key] === null
      ? undefined
      : dateKey(ctx, raw[key], `timeline.${key}`, { where: `timeline.${key}` });
  const start = bound("start");
  const end = bound("end");
  const today = bound("today");
  if (start && end && end.last < start.first)
    ctx.err("DG126", `timeline ends (${end.last}) before it starts (${start.first})`, {
      subject: { where: "timeline.end" },
      fixes: [`swap them: start: ${String(raw.end)}, end: ${String(raw.start)}`],
    });
  else {
    if (start) out.start = start.first;
    if (end) out.end = end.last;
  }
  if (today) out.today = today.first;
  return out;
}
