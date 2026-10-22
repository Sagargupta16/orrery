// Conventions of entity-relationship diagrams (kind: er): keys, cardinality, foreign keys that
// some relationship uses, no orphan entities, many-to-many through a join entity. The rubric is
// references/review/conventions-er.md (ER-01 ..); these are the rules the spec alone can show.
//
// Called from: src/review/notations.ts NOTATION_CHECKS.er. Findings go through c.add() with the
// ids registered in src/review/findings.ts.

import { joinedRows, singular } from "../layout/er/rows.ts";
import { edgeName } from "./names.ts";
import type { Ctx } from "./types.ts";

const many = (end: string) => end === "many" || end === "zero-many";

export function measureEr(c: Ctx): Record<string, number> {
  const { model, add } = c;
  const entities = new Map(model.nodes.map((n) => [n.id, n]));
  const links = model.edges.filter(
    (e) => e.from !== e.to && entities.has(e.from) && entities.has(e.to),
  );

  // ER-03: every table says what identifies a row.
  let keys = 0;
  for (const n of model.nodes) {
    if (!n.fields?.length || n.fields.some((f) => f.pk)) continue;
    keys++;
    const id = n.fields.find((f) => /^(id|uuid|.*_id)$/i.test(f.name) && !f.fk);
    add(
      "conventions.er-primary-key",
      "major",
      [n.id],
      { entity: n.id, fields: n.fields.length },
      `the entity "${n.id}" has ${n.fields.length} fields and no primary key, so nothing says which one identifies a row`,
      [
        id
          ? `mark "${id.name}" as the key: "${id.name}${id.type ? ` ${id.type}` : ""} pk"`
          : `add a key field first: "id uuid pk", or mark the columns that identify a row with pk`,
      ],
      8,
    );
  }

  // ER-05: both ends of every relationship say how many.
  let cardinality = 0;
  for (const e of links) {
    if (e.card) continue;
    cardinality++;
    const rows = joinedRows(model, e);
    const guess = rows.from?.fk
      ? `n:${rows.from.nullable ? "0..1" : "1"}`
      : rows.to?.fk
        ? `${rows.to.nullable ? "0..1" : "1"}:n`
        : "1:n";
    add(
      "conventions.er-cardinality",
      "major",
      [e.id],
      { edge: edgeName(e), suggested: guess },
      `the relationship ${edgeName(e)} has no cardinality, so neither end says how many rows take part`,
      [`set card: "${guess}" on ${edgeName(e)} (from end : to end; 1, 0..1, n, 0..n)`],
      8,
    );
  }

  // ER-06: a foreign key is drawn as the relationship it stands for.
  const used = new Set<string>();
  for (const e of links) {
    const rows = joinedRows(model, e);
    if (rows.from) used.add(`${e.from}\u0000${rows.from.name}`);
    if (rows.to) used.add(`${e.to}\u0000${rows.to.name}`);
  }
  let dangling = 0;
  for (const n of model.nodes)
    for (const f of n.fields ?? []) {
      if (!f.fk || used.has(`${n.id}\u0000${f.name}`)) continue;
      dangling++;
      // order_id names orders: say which table it should point at, when one is drawn.
      const stem = f.name.replace(/_?id$/i, "").toLowerCase();
      const target = model.nodes.find(
        (o) =>
          o.id !== n.id &&
          [o.id, o.label].some(
            (s) =>
              singular(s.toLowerCase().replace(/[^a-z0-9]/g, "")) ===
              stem.replace(/[^a-z0-9]/g, ""),
          ),
      );
      add(
        "conventions.er-dangling-fk",
        "minor",
        [n.id],
        { entity: n.id, field: f.name, ...(target ? { references: target.id } : {}) },
        `"${n.id}.${f.name}" is a foreign key but no relationship uses it, so the reader cannot tell what it references`,
        [
          target
            ? `add - ${n.id} -- ${target.id}: { card: "n:1", from_field: ${f.name} }`
            : `draw the table it references with a relationship from_field: ${f.name}, or drop fk from "${f.name}"`,
        ],
        4,
      );
    }

  // ER-07: every entity on the figure takes part in it.
  let orphans = 0;
  if (model.nodes.length > 1)
    for (const n of model.nodes) {
      if (links.some((e) => e.from === n.id || e.to === n.id)) continue;
      orphans++;
      add(
        "conventions.er-orphan",
        "minor",
        [n.id],
        { entity: n.id },
        `the entity "${n.id}" has no relationship to any other on the figure`,
        [
          `connect "${n.id}" to the entity its foreign key references`,
          `move "${n.id}" to the figure of its own subject area`,
        ],
        4,
      );
    }

  // ER-08: many to many resolves through a join entity, one row per pair.
  let manyToMany = 0;
  for (const e of links) {
    if (!e.card || !many(e.card.from) || !many(e.card.to)) continue;
    manyToMany++;
    const join = `${e.from}_${e.to}`;
    add(
      "conventions.er-many-to-many",
      "minor",
      [e.id],
      { edge: edgeName(e), card: `${e.card.from}:${e.card.to}` },
      `${edgeName(e)} is many to many drawn as one line; a table cannot hold it without a join entity`,
      [
        `add a node "${join}" with "${singular(e.from)}_id ... pk fk" and "${singular(e.to)}_id ... pk fk", then - ${e.from} -- ${join}: { card: "1:0..n" } and - ${e.to} -- ${join}: { card: "1:0..n" }`,
      ],
      6,
    );
  }

  return {
    entities: model.nodes.filter((n) => n.fields?.length).length,
    relationships: links.length,
    missingKeys: keys,
    missingCardinality: cardinality,
    danglingKeys: dangling,
    orphans,
    manyToMany,
  };
}
