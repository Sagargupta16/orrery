// SQL DDL to an er spec: each CREATE TABLE an entity with its columns as fields (pk, fk, unique,
// null), each foreign key a relationship, with evidence: pointing at the statement.
//
// Called from: `orrery import sql <schema.sql>` (src/cli/index.ts, through the import dispatch);
// the CLI prints the returned YAML or writes it with -o.
//
// Reads Postgres and SQLite flavored DDL (MySQL backticks too): columns with their type, inline
// PRIMARY KEY, NOT NULL, UNIQUE and REFERENCES, and the table constraints PRIMARY KEY (...),
// UNIQUE (...) and FOREIGN KEY (...) REFERENCES t (...), in CREATE TABLE or added by ALTER TABLE
// (as pg_dump writes them). Everything else (indexes, views, functions, CHECK) is skipped.
// Cardinality comes from the foreign key: NOT NULL is one parent to many children, a nullable key
// zero or one parent, a unique key (or one that is the whole primary key) at most one child.
// Deterministic: the same file gives the same text.

import { joinedRows } from "../layout/er/rows.ts";
import { type ErField, ICON_SIZE, type ModelEdge, type ModelNode } from "../types.ts";
import { at, displayPath, humanize, slug } from "./iac.ts";

interface Column {
  /** As written, without quotes; `key` is how SQL compares it (unquoted names fold to lower case). */
  name: string;
  key: string;
  type?: string;
  pk: boolean;
  notNull: boolean;
  unique: boolean;
  fk: boolean;
}

interface ForeignKey {
  /** Column keys, here and in the referenced table. */
  columns: string[];
  /** The referenced table as written, its key (schema.table) and the key of its last part. */
  ref: string;
  refKey: string;
  refLast: string;
  refColumns: string[];
  /** Line of the REFERENCES clause. */
  line: number;
}

interface Table {
  /** The last part of its name as written, and the whole name (auth.users). */
  name: string;
  qualified: string;
  /** How SQL tells tables apart: every part of the name, and the last part alone. */
  key: string;
  last: string;
  line: number;
  columns: Column[];
  fks: ForeignKey[];
  /** The primary key's column keys, inline or from a table constraint. */
  pk: string[];
}

// ---------------------------------------------------------------- scanning

/**
 * The text with comments blanked (newlines kept, so offsets keep their lines): line and block
 * comments, and a MySQL # comment that starts a line. Inside a string that takes backslash
 * escapes (Postgres E'...', any '...' once the file reads as MySQL) an escaped quote is rewritten
 * as a doubled one, the same length, so every later scan reads the string to its real end.
 */
function blankComments(src: string): string {
  const mysql = /`|\bengine\s*=/i.test(src);
  const lineStart = (i: number) => /^[ \t]*$/.test(src.slice(src.lastIndexOf("\n", i - 1) + 1, i));
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i] ?? "";
    const two = src.slice(i, i + 2);
    if (two === "--" || (c === "#" && lineStart(i))) {
      const end = src.indexOf("\n", i);
      const stop = end < 0 ? src.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else if (c === "'" || c === '"' || c === "`") {
      const escapes =
        c === "'" && (mysql || /(?:^|[^\w$])[Ee]$/.test(src.slice(Math.max(0, i - 2), i)));
      const stop = closeQuote(src, i, c, escapes);
      const text = src.slice(i, stop);
      out += escapes ? text.replace(/\\(.)/gs, (m, ch: string) => (ch === c ? c + c : m)) : text;
      i = stop;
    } else if (c === "$") {
      const tag = src.slice(i).match(/^\$[A-Za-z_]*\$/)?.[0];
      const end = tag ? src.indexOf(tag, i + tag.length) : -1;
      const stop = tag ? (end < 0 ? src.length : end + tag.length) : i + 1;
      out += src.slice(i, stop);
      i = stop;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Where a quoted run that opens at `i` ends (a doubled quote, or with `escapes` \', stays in it). */
function closeQuote(src: string, i: number, q: string, escapes = false): number {
  let j = i + 1;
  while (j < src.length) {
    if (escapes && src[j] === "\\") j += 2;
    else if (src[j] === q) {
      if (src[j + 1] === q) j += 2;
      else return j + 1;
    } else j++;
  }
  return src.length;
}

/** Splits `text` at `sep` outside quotes, dollar quotes and parentheses; each part with its offset. */
function splitTop(text: string, sep: string): { part: string; at: number }[] {
  const out: { part: string; at: number }[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i] ?? "";
    if (c === "'" || c === '"' || c === "`") {
      i = closeQuote(text, i, c);
      continue;
    }
    if (c === "$") {
      const tag = text.slice(i).match(/^\$[A-Za-z_]*\$/)?.[0];
      if (tag) {
        const end = text.indexOf(tag, i + tag.length);
        i = end < 0 ? text.length : end + tag.length;
        continue;
      }
    }
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) {
      out.push({ part: text.slice(start, i), at: start });
      start = i + 1;
    }
    i++;
  }
  out.push({ part: text.slice(start), at: start });
  return out;
}

const IDENT = String.raw`(?:"(?:[^"]|"")+"|\x60[^\x60]+\x60|\[[^\]]+\]|[A-Za-z_][\w$]*)`;
const CHAIN = String.raw`${IDENT}(?:\s*\.\s*${IDENT})*`;
const CONSTRAINT = String.raw`(?:constraint\s+${IDENT}\s+)?`;

/** A name without its quotes. */
const unquote = (s: string) => {
  const t = s.trim();
  if (/^".*"$/s.test(t)) return t.slice(1, -1).replace(/""/g, '"');
  if (/^`.*`$/s.test(t) || /^\[.*\]$/s.test(t)) return t.slice(1, -1);
  return t;
};
/** A name as SQL compares it: unquoted, it folds to lower case; quoted, it stays as written. */
const ident = (s: string) => {
  const t = s.trim();
  return /^["`[]/.test(t) ? unquote(t) : t.toLowerCase();
};
/** The parts of a qualified name: public.orders is public and orders. */
const partsOf = (chain: string) => chain.match(new RegExp(IDENT, "g")) ?? [chain];
/** The last part of a qualified name, as written: public.orders is orders. */
const lastPart = (chain: string) => unquote(partsOf(chain).at(-1) ?? chain);
/** A table's name as SQL compares it: every part, then the last part alone. */
const tableKeys = (chain: string) => {
  const parts = partsOf(chain).map(ident);
  return { key: parts.join("."), last: parts.at(-1) ?? "" };
};
/** Column names in a list, as SQL compares them: (a, "B" ASC) is a and B. */
const names = (list: string) =>
  splitTop(list, ",")
    .map(({ part }) => ident(part.trim().split(/\s+/)[0] ?? ""))
    .filter(Boolean);

/** A type as a field writes it: lower case, no spaces where SQL spells it in words. */
function normType(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*\)/g, ")")
    .toLowerCase()
    .replace(/^character varying/, "varchar")
    .replace(/^character\b/, "char")
    .replace(/^double precision/, "double")
    .replace(/^bit varying/, "varbit")
    .replace(/^(timestamp|time)(\(\d+\))? with time zone/, (_m, t: string, p = "") => `${t}tz${p}`)
    .replace(/^(timestamp|time)(\(\d+\))? without time zone/, "$1$2");
}

/** Where a column's constraints start: everything before is its type. */
const CLAUSE =
  /\b(constraint|not\s+null|null|primary\s+key|references|unique|default|check|collate|generated|auto_increment|autoincrement|identity|on\s+update|comment)\b/i;

/**
 * Table elements that are not columns, in their own syntax: an index (KEY, INDEX, FULLTEXT,
 * SPATIAL) and its column list, CHECK (...), EXCLUDE USING, LIKE t, PERIOD FOR. A column may be
 * named key, period or exclude; `key varchar(20)` has a size in its parentheses, not columns.
 */
const ELEMENT = new RegExp(
  String.raw`^(?:(?:(?:fulltext|spatial)\b\s*(?:(?:key|index)\b\s*)?|(?:key|index)\b\s*)(?:${IDENT}\s*)?\(\s*[A-Za-z_"\x60]|check\s*\(|exclude\s+(?:using\b|\()|like\s+${IDENT}|period\s+for\b)`,
  "i",
);

/** String literals blanked, the same length, so a keyword inside one ('null', 'unique') is text. */
const blankStrings = (s: string) => s.replace(/'(?:[^']|'')*'/g, (m) => " ".repeat(m.length));

// ---------------------------------------------------------------- statements

function readTable(
  body: string,
  offset: number,
  lineAt: (i: number) => number,
): Pick<Table, "columns" | "fks" | "pk"> {
  const columns: Column[] = [];
  const fks: ForeignKey[] = [];
  const pk: string[] = [];
  const uniques: string[][] = [];
  for (const { part, at: off } of splitTop(body, ",")) {
    const item = part.trim();
    if (!item) continue;
    const lead = part.length - part.trimStart().length;
    const start = offset + off + lead;
    const m = constraintOf(item, start, lineAt);
    if (m) {
      if (m.pk) pk.push(...m.pk);
      if (m.unique) uniques.push(m.unique);
      if (m.fk) fks.push(m.fk);
      continue;
    }
    if (ELEMENT.test(item)) continue;
    const col = item.match(new RegExp(`^(${IDENT})\\s*(.*)$`, "s"));
    if (!col?.[1]) continue;
    const name = unquote(col[1]);
    const rest = col[2] ?? "";
    const clause = blankStrings(rest).search(CLAUSE);
    const type = normType(clause < 0 ? rest : rest.slice(0, clause));
    const flags = clause < 0 ? "" : blankStrings(rest).slice(clause);
    const c: Column = {
      name,
      key: ident(col[1]),
      ...(type ? { type } : {}),
      pk: /\bprimary\s+key\b/i.test(flags),
      notNull: /\bnot\s+null\b/i.test(flags),
      unique: /\bunique\b/i.test(flags),
      fk: false,
    };
    const ref = flags.match(new RegExp(`\\breferences\\s+(${CHAIN})\\s*(?:\\(([^)]*)\\))?`, "i"));
    if (ref?.[1]) {
      c.fk = true;
      const refAt = start + item.length - rest.length + clause + (ref.index ?? 0);
      fks.push({
        columns: [c.key],
        ...refOf(ref[1]),
        refColumns: ref[2] ? names(ref[2]) : [],
        line: lineAt(refAt),
      });
    }
    columns.push(c);
  }
  for (const c of columns) {
    if (pk.includes(c.key)) c.pk = true;
    if (uniques.some((u) => u.length === 1 && u[0] === c.key)) c.unique = true;
    if (fks.some((f) => f.columns.includes(c.key))) c.fk = true;
  }
  return { columns, fks, pk: columns.filter((c) => c.pk).map((c) => c.key) };
}

/** A REFERENCES target: as written, and its keys. */
const refOf = (chain: string) => {
  const { key, last } = tableKeys(chain);
  return { ref: lastPart(chain), refKey: key, refLast: last };
};

interface Constraint {
  pk?: string[];
  unique?: string[];
  fk?: ForeignKey;
}

/** A table constraint (or an ALTER TABLE ... ADD of one): primary key, unique, foreign key. */
function constraintOf(
  item: string,
  start: number,
  lineAt: (i: number) => number,
): Constraint | undefined {
  const pk = item.match(new RegExp(`^${CONSTRAINT}primary\\s+key\\s*\\(([^)]*)\\)`, "i"));
  if (pk?.[1] !== undefined) return { pk: names(pk[1]) };
  const unique = item.match(
    new RegExp(`^${CONSTRAINT}unique(?:\\s+(?:key|index))?(?:\\s+${IDENT})?\\s*\\(([^)]*)\\)`, "i"),
  );
  if (unique?.[1] !== undefined) return { unique: names(unique[1]) };
  const fk = item.match(
    new RegExp(
      `^${CONSTRAINT}foreign\\s+key\\s*\\(([^)]*)\\)\\s*references\\s+(${CHAIN})\\s*(?:\\(([^)]*)\\))?`,
      "i",
    ),
  );
  if (fk?.[1] !== undefined && fk[2]) {
    const refAt = start + item.search(/\breferences\b/i);
    return {
      fk: {
        columns: names(fk[1]),
        ...refOf(fk[2]),
        refColumns: fk[3] ? names(fk[3]) : [],
        line: lineAt(refAt),
      },
    };
  }
  if (new RegExp(`^${CONSTRAINT}(?:check\\s*\\(|exclude\\s+(?:using\\b|\\())`, "i").test(item))
    return {};
  return undefined;
}

/**
 * The table a name means: the one with every part the same, else the only one whose last part
 * is (public.users for users), else the one in the default schema public. The last one created
 * when several share the name.
 */
function tableNamed(tables: Table[], key: string, last: string): Table | undefined {
  const exact = tables.filter((t) => t.key === key);
  if (exact.length) return exact.at(-1);
  const same = tables.filter((t) => t.last === last);
  if (new Set(same.map((t) => t.key)).size === 1) return same.at(-1);
  return same.filter((t) => t.key === `public.${last}`).at(-1);
}

function readTables(src: string): Table[] {
  const text = blankComments(src);
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  const lineAt = (i: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] ?? 0) <= i) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const tables: Table[] = [];
  const later: { table: string; item: string; at: number }[] = [];
  for (const { part, at: off } of splitTop(text, ";")) {
    const lead = part.length - part.trimStart().length;
    const stmt = part.trim();
    const create = stmt.match(
      new RegExp(
        `^create\\s+(?:or\\s+replace\\s+)?(?:(?:global|local)\\s+)?(?:temp(?:orary)?\\s+)?(?:unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?(${CHAIN})\\s*\\(`,
        "i",
      ),
    );
    if (create?.[1]) {
      const open = (create[0]?.length ?? 1) - 1;
      const body = inside(stmt, open);
      if (body === undefined) continue;
      // The line the table's name is on, which its evidence names.
      const nameAt = off + lead + (create[0]?.lastIndexOf(create[1]) ?? 0);
      const read = readTable(body, off + lead + open + 1, lineAt);
      tables.push({
        name: lastPart(create[1]),
        qualified: partsOf(create[1]).map(unquote).join("."),
        ...tableKeys(create[1]),
        line: lineAt(nameAt),
        ...read,
      });
      continue;
    }
    const alter = stmt.match(
      new RegExp(`^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(${CHAIN})\\s+(.*)$`, "is"),
    );
    if (alter?.[1] && alter[2] !== undefined) {
      const actionsAt = off + lead + stmt.length - alter[2].length;
      for (const { part: a, at: aOff } of splitTop(alter[2], ",")) {
        const add = a.trim().match(/^add\s+(?!column\b)/i);
        if (!add) continue;
        const aLead = a.length - a.trimStart().length;
        later.push({
          table: alter[1],
          item: a.trim().slice(add[0].length),
          at: actionsAt + aOff + aLead + add[0].length,
        });
      }
    }
  }
  // Constraints added after their table (pg_dump puts every key in an ALTER TABLE).
  for (const { table, item, at: start } of later) {
    const { key, last } = tableKeys(table);
    const t = tableNamed(tables, key, last);
    const m = t && constraintOf(item, start, lineAt);
    if (!t || !m) continue;
    for (const c of t.columns) {
      if (m.pk?.includes(c.key)) c.pk = true;
      if (m.unique?.length === 1 && m.unique[0] === c.key) c.unique = true;
      if (m.fk?.columns.includes(c.key)) c.fk = true;
    }
    if (m.fk) t.fks.push(m.fk);
    t.pk = t.columns.filter((c) => c.pk).map((c) => c.key);
  }
  return tables;
}

/**
 * What the import could not read, for the CLI to print: CREATE TABLE statements that gave no
 * table (a string or parenthesis that never closes swallows everything after it).
 */
export function sqlWarnings(text: string): string[] {
  const written = (
    blankComments(text).match(
      /(?:^|;)\s*create\s+(?:or\s+replace\s+)?(?:(?:global|local)\s+)?(?:temp(?:orary)?\s+)?(?:unlogged\s+)?table\b/gi,
    ) ?? []
  ).length;
  const read = readTables(text).length;
  return read < written
    ? [
        `read ${read} of ${written} CREATE TABLE statements; look for a quote or parenthesis that does not close before the first table missing from the output`,
      ]
    : [];
}

/** The text between the parenthesis at `open` and the one that closes it. */
function inside(stmt: string, open: number): string | undefined {
  let depth = 0;
  for (let i = open; i < stmt.length; i++) {
    const c = stmt[i];
    if (c === "'" || c === '"' || c === "`") {
      i = closeQuote(stmt, i, c) - 1;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return stmt.slice(open + 1, i);
  }
  return undefined;
}

// ---------------------------------------------------------------- spec

const ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const PLAIN = /^[A-Za-z_][\w .()/-]*$/;
const RESERVED = /^(true|false|null|yes|no|on|off|y|n|~)$/i;
/** A YAML scalar: plain when it reads back as the same string, else double-quoted. */
const q = (s: string) =>
  PLAIN.test(s) && !RESERVED.test(s) && !/\s$/.test(s) ? s : JSON.stringify(s);

/** A column as a field: "name type pk fk unique null", or the mapping when the type has spaces. */
function fieldText(c: Column): string {
  const flags = [
    ...(c.pk ? ["pk"] : []),
    ...(c.fk ? ["fk"] : []),
    ...(c.unique && !c.pk ? ["unique"] : []),
    ...(!c.notNull && !c.pk ? ["null"] : []),
  ];
  if (c.type && /\s/.test(c.type))
    return `{ name: ${q(c.name)}, type: ${q(c.type)}${flags.map((f) => `, ${f === "null" ? "nullable" : f}: true`).join("")} }`;
  return q([c.name, ...(c.type ? [c.type] : []), ...flags].join(" "));
}

export function importSql(text: string, path: string): string {
  // Read from stdin (-) there is no file for evidence to point at, so none is written.
  const stdin = path === "-";
  const shown = stdin ? "standard input" : displayPath(path);
  const tables = readTables(text);
  // Two schemas with a table of one name (auth.users, public.users): each is labelled in full.
  const labelOf = (t: Table) =>
    new Set(tables.filter((x) => x.last === t.last).map((x) => x.key)).size > 1
      ? t.qualified
      : t.name;
  // An id per table, so a name created twice or in two schemas still gives two entries.
  const ids = new Map<Table, string>();
  const taken = new Set<string>();
  for (const t of tables) {
    const label = labelOf(t);
    const base = ID.test(label) ? label : slug(label);
    let id = base;
    for (let k = 2; taken.has(id.toLowerCase()); k++) id = `${base}-${k}`;
    taken.add(id.toLowerCase());
    ids.set(t, id);
  }
  const idOf = (t: Table) => ids.get(t) ?? t.name;
  const columnName = (t: Table, key: string) => t.columns.find((c) => c.key === key)?.name ?? key;
  const nodes: ModelNode[] = tables.map((t) => ({
    id: idOf(t),
    label: labelOf(t),
    look: "card",
    shape: "box",
    iconSize: ICON_SIZE,
    fields: t.columns.map(
      (c): ErField => ({
        name: c.name,
        ...(c.type ? { type: c.type } : {}),
        ...(c.pk ? { pk: true } : {}),
        ...(c.fk ? { fk: true } : {}),
        ...(c.unique && !c.pk ? { unique: true } : {}),
        ...(!c.notNull && !c.pk ? { nullable: true } : {}),
      }),
    ),
  }));
  const left: string[] = [];
  const lines: string[] = [];
  for (const t of tables) {
    for (const fk of t.fks) {
      const parent = tableNamed(tables, fk.refKey, fk.refLast);
      const column = columnName(t, fk.columns[0] ?? "");
      if (!parent) {
        left.push(`# left out: ${t.name}.${column} references ${fk.ref} (not in ${shown})`);
        continue;
      }
      if (parent === t) {
        left.push(
          `# left out: ${t.name}.${column} references its own table (a line from a table to itself)`,
        );
        continue;
      }
      const child = t.columns.find((c) => c.key === fk.columns[0]);
      const nullable = fk.columns.some((key) => {
        const c = t.columns.find((x) => x.key === key);
        return !!c && !c.notNull && !c.pk;
      });
      // One child at most: the key is unique, or it is the child's whole primary key.
      const single =
        (fk.columns.length === 1 && !!child?.unique) ||
        (t.pk.length > 0 &&
          t.pk.length === fk.columns.length &&
          t.pk.every((p) => fk.columns.includes(p)));
      const card = `${nullable ? "0..1" : "1"}:${single ? "0..1" : "0..n"}`;
      const refKey = fk.refColumns[0] ?? parent.pk[0];
      const refColumn = refKey === undefined ? "id" : columnName(parent, refKey);
      const from = idOf(parent);
      const to = idOf(t);
      // The rows layout would infer; name them only where it would pick others.
      const edge: ModelEdge = { id: "e", from, to, line: "solid", arrow: "none", constraint: true };
      const inferred = joinedRows({ nodes }, edge);
      const keys = [
        `card: ${q(card)}`,
        ...(inferred.from?.name === refColumn && inferred.to?.name === column
          ? []
          : [`from_field: ${q(refColumn)}`, `to_field: ${q(column)}`]),
        ...(stdin ? [] : [`evidence: ${q(at(shown, fk.line, fk.ref))}`]),
      ];
      lines.push(`  - ${from} -- ${to}: { ${keys.join(", ")} }`);
    }
  }
  const out = [
    `# Drawn by \`orrery import sql ${stdin ? "-" : shown}\`; run it again to redraw from the source.`,
    ...(stdin ? [] : ["# Every node and edge carries the evidence it was read from."]),
    `title: ${q(stdin ? "Data model" : `${humanize(shown.replace(/^.*\//, "").replace(/\.[^.]+$/, ""))} data model`)}`,
    `subtitle: ${q(`${tables.length} table${tables.length === 1 ? "" : "s"} from ${shown}`)}`,
    "kind: er",
  ];
  if (!tables.length) out.push("nodes: {}");
  else {
    out.push("nodes:");
    for (const t of tables) {
      out.push(`  ${idOf(t)}:`);
      if (idOf(t) !== labelOf(t)) out.push(`    label: ${q(labelOf(t))}`);
      if (t.columns.length) {
        out.push("    fields:");
        for (const c of t.columns) out.push(`      - ${fieldText(c)}`);
      }
      if (!stdin) out.push(`    evidence: ${q(at(shown, t.line, t.name))}`);
    }
  }
  if (lines.length) out.push("edges:", ...lines);
  if (left.length) out.push("", ...left);
  return `${out.join("\n")}\n`;
}
