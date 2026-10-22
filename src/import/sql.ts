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
import type { ErField, ModelEdge, ModelNode } from "../types.ts";
import { at, displayPath, humanize, slug } from "./iac.ts";

interface Column {
  name: string;
  type?: string;
  pk: boolean;
  notNull: boolean;
  unique: boolean;
  fk: boolean;
}

interface ForeignKey {
  columns: string[];
  /** The referenced table as written (last part of a qualified name) and its columns. */
  ref: string;
  refColumns: string[];
  /** Line of the REFERENCES clause. */
  line: number;
}

interface Table {
  name: string;
  line: number;
  columns: Column[];
  fks: ForeignKey[];
  /** The primary key's columns, inline or from a table constraint. */
  pk: string[];
}

// ---------------------------------------------------------------- scanning

/** The text with comments blanked (newlines kept, so offsets keep their lines). */
function blankComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i] ?? "";
    const two = src.slice(i, i + 2);
    if (two === "--") {
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
      const stop = closeQuote(src, i, c);
      out += src.slice(i, stop);
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

/** Where a quoted run that opens at `i` ends (a doubled quote stays inside it). */
function closeQuote(src: string, i: number, q: string): number {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === q) {
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
/** The last part of a qualified name: public.orders is orders. */
const lastPart = (chain: string) => unquote(chain.match(new RegExp(`${IDENT}\\s*$`))?.[0] ?? chain);
/** Column names in a list: (a, "b" ASC) is a and b. */
const names = (list: string) =>
  splitTop(list, ",")
    .map(({ part }) => unquote(part.trim().split(/\s+/)[0] ?? ""))
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

// ---------------------------------------------------------------- statements

function readTable(
  body: string,
  offset: number,
  lineAt: (i: number) => number,
): Omit<Table, "name" | "line"> {
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
    if (/^(check|exclude|key|index|fulltext|spatial|like|period)\b/i.test(item)) continue;
    const col = item.match(new RegExp(`^(${IDENT})\\s*(.*)$`, "s"));
    if (!col?.[1]) continue;
    const name = unquote(col[1]);
    const rest = col[2] ?? "";
    const clause = rest.search(CLAUSE);
    const type = normType(clause < 0 ? rest : rest.slice(0, clause));
    const flags = clause < 0 ? "" : rest.slice(clause);
    const c: Column = {
      name,
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
        columns: [name],
        ref: lastPart(ref[1]),
        refColumns: ref[2] ? names(ref[2]) : [],
        line: lineAt(refAt),
      });
    }
    columns.push(c);
  }
  for (const c of columns) {
    if (pk.includes(c.name)) c.pk = true;
    if (uniques.some((u) => u.length === 1 && u[0] === c.name)) c.unique = true;
    if (fks.some((f) => f.columns.includes(c.name))) c.fk = true;
  }
  return { columns, fks, pk: columns.filter((c) => c.pk).map((c) => c.name) };
}

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
        ref: lastPart(fk[2]),
        refColumns: fk[3] ? names(fk[3]) : [],
        line: lineAt(refAt),
      },
    };
  }
  if (new RegExp(`^${CONSTRAINT}(check|exclude)\\b`, "i").test(item)) return {};
  return undefined;
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
      tables.push({ name: lastPart(create[1]), line: lineAt(nameAt), ...read });
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
          table: lastPart(alter[1]),
          item: a.trim().slice(add[0].length),
          at: actionsAt + aOff + aLead + add[0].length,
        });
      }
    }
  }
  // Constraints added after their table (pg_dump puts every key in an ALTER TABLE).
  for (const { table, item, at: start } of later) {
    const t = tables.find((x) => x.name === table);
    const m = t && constraintOf(item, start, lineAt);
    if (!t || !m) continue;
    for (const c of t.columns) {
      if (m.pk?.includes(c.name)) c.pk = true;
      if (m.unique?.length === 1 && m.unique[0] === c.name) c.unique = true;
      if (m.fk?.columns.includes(c.name)) c.fk = true;
    }
    if (m.fk) t.fks.push(m.fk);
    t.pk = t.columns.filter((c) => c.pk).map((c) => c.name);
  }
  return tables;
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
  const ids = new Map<string, string>();
  const taken = new Set<string>();
  for (const t of tables) {
    const base = ID.test(t.name) ? t.name : slug(t.name);
    let id = base;
    for (let k = 2; taken.has(id.toLowerCase()); k++) id = `${base}-${k}`;
    taken.add(id.toLowerCase());
    ids.set(t.name, id);
  }
  const byName = new Map(tables.map((t) => [t.name, t]));
  const nodes: ModelNode[] = tables.map((t) => ({
    id: ids.get(t.name) ?? t.name,
    label: t.name,
    look: "card",
    shape: "box",
    iconSize: 48,
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
      const parent = byName.get(fk.ref);
      const column = fk.columns[0] ?? "";
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
      const child = t.columns.find((c) => c.name === column);
      const nullable = fk.columns.some((name) => {
        const c = t.columns.find((x) => x.name === name);
        return !!c && !c.notNull && !c.pk;
      });
      // One child at most: the key is unique, or it is the child's whole primary key.
      const single =
        (fk.columns.length === 1 && !!child?.unique) ||
        (t.pk.length > 0 &&
          t.pk.length === fk.columns.length &&
          t.pk.every((p) => fk.columns.includes(p)));
      const card = `${nullable ? "0..1" : "1"}:${single ? "0..1" : "0..n"}`;
      const refColumn = fk.refColumns[0] ?? parent.pk[0] ?? "id";
      const from = ids.get(parent.name) ?? parent.name;
      const to = ids.get(t.name) ?? t.name;
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
      out.push(`  ${ids.get(t.name) ?? t.name}:`);
      if ((ids.get(t.name) ?? t.name) !== t.name) out.push(`    label: ${q(t.name)}`);
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
