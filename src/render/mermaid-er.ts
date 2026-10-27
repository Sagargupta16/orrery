// Mermaid erDiagram text for an er spec: entities with their attributes (type, name, PK, FK and
// UK keys, a comment for a column that may be null), relationships with crow's foot cardinality
// at both ends and their label. Groups have no erDiagram form and are left out.
//
// Called from: src/render/mermaid.ts renderMermaid for kind er; a missing final newline is added.

import { joinedRows } from "../layout/er/rows.ts";
import type { ErEnd, ErField, Model, ModelEdge } from "../types.ts";

/** Crow's foot ends as Mermaid writes them on the left and on the right of the line. */
const LEFT: Record<ErEnd, string> = {
  one: "||",
  "zero-one": "|o",
  many: "}|",
  "zero-many": "}o",
};
const RIGHT: Record<ErEnd, string> = {
  one: "||",
  "zero-one": "o|",
  many: "|{",
  "zero-many": "o{",
};

const flat = (s: string) => s.replace(/\s+/g, " ").trim();
/** Text inside a quoted string: Mermaid's entity codes for the characters that end it. */
const quoted = (s: string) => flat(s).replace(/["#]/g, (c) => `#${c.codePointAt(0)};`);

/** An attribute type or name: a letter first, then letters, digits, `-`, `_`, `()` and `[]`. */
function word(s: string, fallback: string): string {
  const w = s.replace(/[^A-Za-z0-9_\-()[\]]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[A-Za-z]/.test(w) ? w : w ? `${fallback}_${w}` : fallback;
}

/** Words Mermaid's erDiagram grammar reads as keywords outside a block; ids never take them. */
const RESERVED = new Set(
  "accdescr acctitle class classdef end erdiagram many one only optionally style subgraph to".split(
    " ",
  ),
);

/** Entity ids: word characters, never a keyword, never repeated. */
function ids(model: Model): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const n of model.nodes) {
    let base = word(n.id.replace(/-/g, "_"), "entity");
    if (RESERVED.has(base.toLowerCase())) base = `e_${base}`;
    let id = base;
    for (let k = 2; used.has(id.toLowerCase()); k++) id = `${base}_${k}`;
    used.add(id.toLowerCase());
    out.set(n.id, id);
  }
  return out;
}

/** An attribute word the block would read as a PK, FK or UK key goes in backticks. */
function attr(s: string, fallback: string): string {
  const w = word(s, fallback);
  return /^(?:pk|fk|uk)\b/i.test(w) ? `\`${w}\`` : w;
}

function attribute(f: ErField): string {
  const keys = [
    ...(f.pk ? ["PK"] : []),
    ...(f.fk ? ["FK"] : []),
    ...(f.unique && !f.pk ? ["UK"] : []),
  ];
  const comment = [f.nullable ? "null" : "", f.note ?? ""].filter(Boolean).join(", ");
  return [
    attr(f.type ?? "", "any"),
    attr(f.name, "field"),
    ...(keys.length ? [keys.join(", ")] : []),
    ...(comment ? [`"${quoted(comment)}"`] : []),
  ].join(" ");
}

/** The cardinality of an edge: its card, else many on the end whose foreign key it follows. */
function cardOf(model: Model, e: ModelEdge): { from: ErEnd; to: ErEnd } {
  if (e.card) return e.card;
  const rows = joinedRows(model, e);
  if (rows.from?.fk && !rows.from.pk)
    return { from: "zero-many", to: rows.from.nullable ? "zero-one" : "one" };
  if (rows.to?.fk && !rows.to.pk)
    return { from: rows.to.nullable ? "zero-one" : "one", to: "zero-many" };
  return { from: "zero-many", to: "zero-many" };
}

export function erMermaid(model: Model): string {
  const id = ids(model);
  const lines: string[] = [];
  if (model.title) lines.push("---", `title: ${JSON.stringify(flat(model.title))}`, "---");
  lines.push("erDiagram");
  if (model.subtitle)
    lines.push(
      `  accDescr: ${flat(model.subtitle).replace(/[#;%&<>\\]/g, (c) => `#${c.codePointAt(0)};`)}`,
    );
  for (const n of model.nodes) {
    const name = id.get(n.id) ?? n.id;
    const alias = n.label && n.label !== name ? `["${quoted(n.label)}"]` : "";
    lines.push(`  ${name}${alias} {`);
    for (const f of n.fields ?? []) lines.push(`    ${attribute(f)}`);
    lines.push("  }");
  }
  const nodes = new Set(model.nodes.map((n) => n.id));
  for (const e of model.edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    const card = cardOf(model, e);
    // A dashed or dotted line is a non-identifying relationship, as Mermaid draws `..`.
    const join = e.line === "dashed" || e.line === "dotted" ? ".." : "--";
    lines.push(
      `  ${id.get(e.from)} ${LEFT[card.from]}${join}${RIGHT[card.to]} ${id.get(e.to)} : "${quoted(e.label ?? "")}"`,
    );
  }
  return `${lines.join("\n")}\n`;
}
