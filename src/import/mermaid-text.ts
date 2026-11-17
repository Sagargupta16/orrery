// Text helpers every Mermaid reader shares: frontmatter, statements, labels, entity codes, spec
// ids and the comment block on top of the written spec.
//
// Called from: src/import/mermaid.ts (flowchart and the dispatch) and the per-type readers
// src/import/mermaid-sequence.ts, mermaid-er.ts, mermaid-state.ts and mermaid-gantt.ts.

import { stringify } from "yaml";

/** What every reader returns: the spec as YAML text, warnings, and the icons it guessed. */
export interface MermaidResult {
  yaml: string;
  warnings: string[];
  guessed: Record<string, string>;
}

// A leading "---" ... "---" block: Mermaid frontmatter (title, config:, nested YAML).
const FRONTMATTER = /^\s*---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** The frontmatter title and the text after the frontmatter. */
export function frontmatter(source: string): { title?: string; body: string } {
  const front = source.match(FRONTMATTER);
  if (!front) return { body: source };
  const title = (front[1] ?? "").match(/^title:[ \t]*(.+)$/m);
  return {
    title: title ? cleanLabel(title[1] ?? "") : undefined,
    body: source.slice(front[0].length),
  };
}

/**
 * The statements of a diagram body: comments dropped, one per line (and per `split` result),
 * every whitespace run collapsed to one space. Labels collapse their whitespace anyway, and a
 * line with no long runs keeps every pattern the readers match against linear.
 */
export function statements(body: string, split: (line: string) => string[]): string[] {
  return body
    .replace(/%%.*$/gm, "")
    .split(/\r?\n/)
    .flatMap(split)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Splits a line on ";" outside quotes, the plain splitter for the non-flowchart readers. The ";"
 * that ends an entity code (`#59;`) is text: Mermaid reads the codes before the statements.
 */
export function semicolons(line: string): string[] {
  const out: string[] = [];
  let quoted = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ";" && !quoted && !/#\w{1,8}$/.test(line.slice(Math.max(start, i - 9), i))) {
      out.push(line.slice(start, i));
      start = i + 1;
    }
  }
  out.push(line.slice(start));
  return out;
}

export function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
    return t.slice(1, -1);
  return t;
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Mermaid's entity codes (`#35;`, `#59;`, `#quot;`), which orrery's own Mermaid export writes. */
function entities(s: string): string {
  return s.replace(/#(\d{1,7}|[a-z]{2,8});/gi, (m, code: string) => {
    if (/^\d/.test(code)) {
      const n = Number(code);
      return n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

/**
 * Removes every tag in one pass. Each ">" closes the nearest open "<" and drops everything
 * between them, inner tags included, so "<scr<b>ipt>" never collapses into "<script>"; an
 * unclosed "<" and a stray ">" are dropped on their own and the text around them stays.
 */
function stripTags(s: string): string {
  const out: string[] = [];
  const open: number[] = [];
  for (const c of s) {
    if (c === "<") {
      open.push(out.length);
      out.push(c);
    } else if (c === ">") {
      const at = open.pop();
      if (at !== undefined) out.length = at;
    } else out.push(c);
  }
  return out.filter((c) => c !== "<").join("");
}

/** Label text: unquoted, entity codes read, line breaks as spaces, tags and markup removed. */
export function cleanLabel(s: string): string {
  // Entity codes first, so an encoded "<" is stripped like a typed one.
  const text = stripTags(entities(unquote(s)).replace(/<br\s*\/?>/gi, " "));
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const SPEC_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/**
 * Spec ids for Mermaid ids, in order: an id the spec accepts stays as it is, any other (non-ASCII
 * letters, spaces) becomes an ASCII slug, and a clash takes the next free `-2`, `-3`. The ids
 * that stay are claimed first, so a slug never takes an id the diagram already uses; `taken` holds
 * ids given out before (the items, when these are the lanes).
 */
export function specIds(
  raw: Iterable<string>,
  fallback = "node",
  taken: Iterable<string> = [],
): Map<string, string> {
  const all = [...new Set(raw)];
  const out = new Map<string, string>();
  const used = new Set(taken);
  for (const id of all) {
    if (SPEC_ID.test(id) && !used.has(id)) {
      out.set(id, id);
      used.add(id);
    }
  }
  for (const id of all) {
    if (out.has(id)) continue;
    const slug = id
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .replace(/[^A-Za-z0-9_.-]+/g, "-");
    // Trimmed by hand: /-+$/ would rescan every run of dashes inside a long id.
    let a = 0;
    let b = slug.length;
    while (a < b && (slug[a] === "-" || slug[a] === ".")) a++;
    while (b > a && slug[b - 1] === "-") b--;
    const base = slug.slice(a, b) || fallback;
    let unique = base;
    for (let k = 2; used.has(unique); k++) unique = `${base}-${k}`;
    used.add(unique);
    out.set(id, unique);
  }
  return out;
}

/** The written spec: the schema line, what to do next, then the document. */
export function writeSpec(doc: Record<string, unknown>, notes: string[]): string {
  const header = [
    "# yaml-language-server: $schema=https://raw.githubusercontent.com/Sagargupta16/orrery/main/skills/orrery/references/diagram.schema.json",
    ...notes.map((n) => `# ${n}`),
  ];
  return `${header.join("\n")}\n${stringify(doc, { lineWidth: 0 })}`;
}
