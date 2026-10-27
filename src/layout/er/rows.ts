// Which field rows a relationship joins: the ones the spec names (from_field, to_field), else the
// foreign key on one end that names the other entity (customer_id, customerId on orders for
// customers) and the primary key on the other. Layout seats the line on these rows; the review
// reads them to find a foreign key no relationship uses.

import type { ErField, Model, ModelEdge, ModelNode } from "../../types.ts";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** customers -> customer, categories -> category, addresses -> address, status stays. */
export function singular(word: string): string {
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(sses|xes|ches|shes|zes)$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}

/** The reading singular() leaves out so houses stays house: statuses -> status, quizzes -> quiz. */
const otherSingular = (word: string) => word.replace(/([so])es$/, "$1").replace(/zzes$/, "z");

/** The names an entity goes by in a column name: its id and label, plural and singular. */
function namesOf(n: ModelNode): Set<string> {
  const out = new Set<string>();
  for (const raw of [n.id, n.label]) {
    const base = norm(raw);
    if (!base) continue;
    out.add(base);
    out.add(singular(base));
    out.add(otherSingular(base));
    // order_items reads as order_item; the last word carries the plural.
    const words = raw
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (words.length > 1)
      out.add(norm([...words.slice(0, -1), singular(words.at(-1) ?? "")].join("")));
  }
  return out;
}

/** The first primary key field of an entity. */
export const primaryKey = (n: ModelNode | undefined): ErField | undefined =>
  n?.fields?.find((f) => f.pk);

/**
 * The field of `n` that refers to `other` by name: `<other>_id`, `<other>Id`, or `<other>_<its
 * key>`. A field marked fk wins over one that only has the name.
 */
export function fieldNaming(
  n: ModelNode | undefined,
  other: ModelNode | undefined,
): ErField | undefined {
  if (!n?.fields || !other) return undefined;
  const key = norm(primaryKey(other)?.name ?? "id");
  const wanted = new Set<string>();
  for (const name of namesOf(other)) {
    wanted.add(`${name}id`);
    if (key && key !== "id") wanted.add(`${name}${key}`);
  }
  const named = n.fields.filter((f) => wanted.has(norm(f.name)));
  return named.find((f) => f.fk) ?? named[0];
}

/** The rows a relationship joins on each end, when the ends are entities with fields. */
export interface Joined {
  from?: ErField;
  to?: ErField;
}

const byName = (n: ModelNode | undefined, name: string | undefined) =>
  name ? n?.fields?.find((f) => f.name === name) : undefined;

/**
 * The rows `e` joins. A named row holds; an end left open takes the foreign key naming the other
 * end, else its primary key when the other end is a foreign key (or a plain column), else nothing
 * (the line meets the header).
 */
export function joinedRows(model: Pick<Model, "nodes">, e: ModelEdge): Joined {
  const a = model.nodes.find((n) => n.id === e.from);
  const b = model.nodes.find((n) => n.id === e.to);
  let from = byName(a, e.fromField);
  let to = byName(b, e.toField);
  if (!from && !to) {
    const fa = fieldNaming(a, b);
    const fb = fa ? undefined : fieldNaming(b, a);
    from = fa ?? primaryKey(a);
    to = fb ?? primaryKey(b);
    // Neither names the other: only the keys, which say nothing about this line.
    if (!fa && !fb) return {};
  } else if (from && !to) to = otherEnd(from, b, a);
  else if (to && !from) from = otherEnd(to, a, b);
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

/** The row on `n` opposite `known` (a row of `other`): its foreign key to `other`, or its key. */
function otherEnd(known: ErField, n: ModelNode | undefined, other: ModelNode | undefined) {
  if (known.pk && !known.fk) return fieldNaming(n, other) ?? primaryKey(n);
  return primaryKey(n);
}
