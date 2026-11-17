// Mermaid erDiagram -> an er spec: entities (aliases become labels) with their attributes as
// fields (type, name, PK, FK and UK keys, a comment as a note, a "null" comment as nullable), and
// relationships with their crow's foot cardinality at both ends as card: and their label.
//
// Called from: src/import/mermaid.ts importMermaid for a diagram that starts with erDiagram.

import {
  cleanLabel,
  type MermaidResult,
  specIds,
  statements,
  unquote,
  writeSpec,
} from "./mermaid-text.ts";

/** Each crow's foot end as orrery's card writes it; Mermaid reads either spelling on either side. */
const ENDS: Record<string, string> = {
  "||": "1",
  "|o": "0..1",
  "o|": "0..1",
  "}|": "1..n",
  "|{": "1..n",
  "}o": "0..n",
  "o{": "0..n",
  "only one": "1",
  "1": "1",
  "zero or one": "0..1",
  "one or zero": "0..1",
  "one or more": "1..n",
  "one or many": "1..n",
  "many(1)": "1..n",
  "1+": "1..n",
  "zero or more": "0..n",
  "zero or many": "0..n",
  "many(0)": "0..n",
  "0+": "0..n",
};

const NAME = `("[^"]*"|[^\\s"{}[\\]|:]+)`;
const SYMBOL = "(\\|\\||\\|o|o\\||\\}\\||\\|\\{|\\}o|o\\{)";
const WORDS =
  "(only one|zero or one|one or zero|one or more|one or many|many\\(1\\)|1\\+|zero or more|zero or many|many\\(0\\)|0\\+|1)";
const RELATION = new RegExp(`^${NAME} ?${SYMBOL}(--|\\.\\.)${SYMBOL} ?${NAME} ?: ?(.*)$`);
const RELATION_WORDS = new RegExp(
  `^${NAME} ${WORDS} (to|optionally to) ${WORDS} ${NAME} ?: ?(.*)$`,
  "i",
);
const ENTITY = new RegExp(`^${NAME}(?: ?\\[(.*)\\])?(?: ?(\\{) ?(\\})?)?$`);
const KEYS = new Set(["pk", "fk", "uk"]);
/** Words the field string form reads as flags, so a name or type that is one needs the mapping. */
const FLAGS = new Set(["pk", "fk", "unique", "null"]);

interface Field {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
  unique: boolean;
  nullable: boolean;
  note?: string;
}

const DIRECTIONS: Record<string, string> = { LR: "right", RL: "left", TB: "down", BT: "up" };

export function importEr(body: string, frontTitle?: string): MermaidResult {
  const warnings = new Set<string>();
  const entities = new Map<string, { label?: string; fields: Field[] }>();
  const relations: { from: string; to: string; card: string; dashed: boolean; label: string }[] =
    [];
  let subtitle: string | undefined;
  let direction: string | undefined;
  let open: { fields: Field[] } | undefined;
  const skipped: string[] = [];

  const entity = (raw: string) => {
    const name = unquote(raw);
    let e = entities.get(name);
    if (!e) {
      e = { fields: [] };
      entities.set(name, e);
    }
    return e;
  };

  for (const line of statements(body, (l) => [l])) {
    if (open) {
      if (line === "}") open = undefined;
      else {
        const field = attribute(line);
        if (field) open.fields.push(field);
        else skipped.push(line);
      }
      continue;
    }
    if (/^erDiagram\b/i.test(line)) continue;
    const dir = line.match(/^direction (TB|BT|LR|RL)$/i);
    if (dir) {
      direction = DIRECTIONS[(dir[1] ?? "").toUpperCase()];
      continue;
    }
    const descr = line.match(/^accDescr ?: ?(.*)$/);
    if (descr) {
      subtitle = cleanLabel(descr[1] ?? "");
      continue;
    }
    if (/^(accTitle|style|classDef|class)\b/.test(line)) continue;
    const rel = line.match(RELATION);
    const words = rel ? undefined : line.match(RELATION_WORDS);
    if (rel || words) {
      const [, a = "", left = "", join = "", right = "", b = "", label = ""] = rel ?? [
        words?.[0],
        words?.[1],
        words?.[2]?.toLowerCase(),
        words?.[3]?.toLowerCase() === "to" ? "--" : "..",
        words?.[4]?.toLowerCase(),
        words?.[5],
        words?.[6],
      ];
      entity(a);
      entity(b);
      relations.push({
        from: unquote(a),
        to: unquote(b),
        card: `${ENDS[left] ?? "0..n"}:${ENDS[right] ?? "0..n"}`,
        dashed: join === "..",
        label: cleanLabel(label),
      });
      continue;
    }
    const ent = line.match(ENTITY);
    if (ent) {
      const e = entity(ent[1] ?? "");
      const alias = ent[2] === undefined ? undefined : cleanLabel(ent[2]);
      if (alias) e.label = alias;
      if (ent[3] && !ent[4]) open = e;
      continue;
    }
    skipped.push(line);
  }
  if (skipped.length)
    warnings.add(`${skipped.length} line(s) not read, the first: ${skipped[0]?.slice(0, 60)}`);
  if (!entities.size) warnings.add("no entities found");

  const ids = specIds(entities.keys(), "entity");
  const sid = (name: string) => ids.get(name) ?? name;
  const nodes: Record<string, Record<string, unknown>> = {};
  for (const [name, e] of entities) {
    const label = e.label ?? (sid(name) !== name ? cleanLabel(name) : undefined);
    nodes[sid(name)] = {
      ...(label ? { label } : {}),
      ...(e.fields.length ? { fields: e.fields.map(fieldEntry) } : {}),
    };
  }
  const edges = relations.map((r) => ({
    [`${sid(r.from)} ${r.dashed ? "---" : "--"} ${sid(r.to)}`]: {
      card: r.card,
      ...(r.label ? { label: r.label } : {}),
    },
  }));
  const doc: Record<string, unknown> = {};
  if (frontTitle) doc.title = frontTitle;
  if (subtitle) doc.subtitle = subtitle;
  doc.kind = "er";
  if (direction) doc.direction = direction;
  doc.nodes = nodes;
  doc.edges = edges;
  // Mermaid draws `..` dashed for a non-identifying relationship; the legend says so.
  if (relations.some((r) => r.dashed)) doc.legend = { dashed: "Non-identifying relationship" };
  const header = [
    "Imported from a Mermaid erDiagram by orrery. Group related tables, mark foreign keys the",
    "relationships join (from_field, to_field) and run orrery validate.",
  ];
  return { yaml: writeSpec(doc, header), warnings: [...warnings], guessed: {} };
}

/** One attribute line: `type name`, then PK, FK and UK keys (comma separated), then "comment". */
function attribute(line: string): Field | undefined {
  const quote = line.indexOf('"');
  const comment = quote < 0 ? "" : cleanLabel(line.slice(quote));
  const words = (quote < 0 ? line : line.slice(0, quote))
    .replace(/,/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.replace(/^`(.*)`$/, "$1"));
  const [type, name, ...keys] = words;
  if (!type || !name) return undefined;
  const has = (k: string) => keys.some((w) => w.toLowerCase() === k);
  if (keys.some((w) => !KEYS.has(w.toLowerCase()))) return undefined;
  const nullable = /^null\b/i.test(comment);
  const note = (nullable ? comment.replace(/^null\b,? ?/i, "") : comment) || undefined;
  return { name, type, pk: has("pk"), fk: has("fk"), unique: has("uk"), nullable, note };
}

/** A field in the string form when it reads back the same, else in the mapping form. */
function fieldEntry(f: Field): string | Record<string, unknown> {
  const plain =
    !f.note && ![f.name, f.type].some((w) => FLAGS.has(w.toLowerCase()) || /[\s"]/.test(w));
  if (plain) {
    const flags = [f.pk && "pk", f.fk && "fk", f.unique && "unique", f.nullable && "null"];
    return [f.name, f.type, ...flags.filter(Boolean)].join(" ");
  }
  return {
    name: f.name,
    type: f.type,
    ...(f.pk ? { pk: true } : {}),
    ...(f.fk ? { fk: true } : {}),
    ...(f.unique ? { unique: true } : {}),
    ...(f.nullable ? { nullable: true } : {}),
    ...(f.note ? { note: f.note } : {}),
  };
}
