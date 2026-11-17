// Block Markdown for `orrery doc`: front matter, headings, lists, tables, quotes, code and markers.
import { type Inline, inline, labelKey, outsideCode, plain, type Refs } from "./inline.ts";

export type Align = "left" | "center" | "right" | undefined;

export interface ListItem {
  /** Nesting level, 0 for the outer list. */
  depth: number;
  ordered: boolean;
  /** The number shown for an ordered item. */
  num: number;
  c: Inline[];
  /** Paragraphs and code indented under the item, after its first paragraph. */
  more?: Block[];
}

export type Block =
  | { t: "heading"; level: number; c: Inline[] }
  | { t: "para"; c: Inline[] }
  | { t: "list"; items: ListItem[] }
  | { t: "code"; lang: string; s: string }
  | { t: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { t: "quote"; c: Block[] }
  | { t: "hr" }
  | { t: "figure"; n: number };

export interface Marker {
  /** Figure number, from 1 in document order. */
  n: number;
  /** Spec path as written, relative to the document's folder; an `orrery` fence's name. */
  spec: string;
  caption?: string;
  /** Index of the marker's line in the source. */
  line: number;
  /** An `orrery` fence holds its spec: the text, the info string's keys and its closing line. */
  fence?: { source: string; keys: Record<string, string>; end: number };
}

export interface ParsedDoc {
  title?: string;
  blocks: Block[];
  markers: Marker[];
  /** 1-based lines of every marker comment outside code, recognized or not. */
  markerLines: number[];
  /** Indexes of the source lines that are code (fences included), where nothing is Markdown. */
  code: number[];
}

// A backtick fence's info string has no backticks: "```npm ci``` runs" is a code span.
const FENCE = /^ {0,3}(`{3,}(?![^`]*`)|~{3,})\s*([^\s`]*)(.*)$/;
/** A fence info string's keys: name=value, name="a value" or a bare word. */
const INFO_KEY = /([^\s=]+)=(?:"([^"]*)"|'([^']*)'|(\S*))|(\S+)/g;
/** Four columns of indentation, the start of an indented code block. */
const INDENT = /^(?: {4}| {0,3}\t)/;
const FENCE_END = /^ {0,3}(`{3,}|~{3,})\s*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const MARKER = /^ {0,3}<!--\s*orrery:(.*?)-->\s*$/;
const ANY_MARKER = /<!--\s*orrery:/;
const COMMENT = /^ {0,3}<!--/;
const TABLE_SEP = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const DEF =
  /^ {0,3}\[(?!\^)((?:[^[\]\\]|\\.)+)\]:[ \t]*(?:<([^<>]*)>|([^\s<]\S*))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^()]*\)))?[ \t]*$/;
/** Lines that open a block whatever follows; a table also needs its separator line. */
const BLOCK_START = [FENCE, HEADING, HR, QUOTE, ITEM, COMMENT];

function fenceCloses(line: string, mark: string): boolean {
  const m = FENCE_END.exec(line)?.[1] ?? "";
  return m[0] === mark[0] && m.length >= mark.length;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replaceAll("\\|", "|"));
}

function tableAt(lines: string[], i: number): boolean {
  const head = lines[i] ?? "";
  const sep = lines[i + 1];
  return (
    head.includes("|") &&
    sep !== undefined &&
    TABLE_SEP.test(sep) &&
    splitRow(head).length === splitRow(sep).length
  );
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i] ?? "";
  return BLOCK_START.some((r) => r.test(line)) || tableAt(lines, i);
}

function alignOf(cell: string): Align {
  if (cell.startsWith(":") && cell.endsWith(":")) return "center";
  if (cell.endsWith(":")) return "right";
  return cell.startsWith(":") ? "left" : undefined;
}

/** The width of a line's indentation, a tab reaching the next multiple of four. */
function indentOf(line: string): number {
  let w = 0;
  for (const ch of line) {
    if (ch === " ") w += 1;
    else if (ch === "\t") w += 4 - (w % 4);
    else break;
  }
  return w;
}

/** The line without up to `n` columns of its indentation. */
function dedent(line: string, n: number): string {
  let w = 0;
  let k = 0;
  for (; k < line.length && w < n && (line[k] === " " || line[k] === "\t"); k++)
    w += line[k] === "\t" ? 4 - (w % 4) : 1;
  return line.slice(k);
}

/** A fence info string's keys, in a plain record (a key named __proto__ stays a key). */
function infoKeys(info: string): Record<string, string> {
  return Object.fromEntries(
    [...info.matchAll(INFO_KEY)].map((m) =>
      m[5] ? [m[5], ""] : [m[1] ?? "", m[2] ?? m[3] ?? m[4] ?? ""],
    ),
  );
}

/** Where parsed code lines are recorded, and the source index of the first line parsed. */
interface CodeLines {
  code?: Set<number>;
  at: number;
}

function parseList(
  lines: string[],
  from: number,
  refs: Refs,
  { code, at }: CodeLines,
): [ListItem[], number] {
  type Draft = Omit<ListItem, "c" | "more"> & {
    text: string;
    /** The column the item's text starts at: lines indented this far belong to the item. */
    col: number;
    more: ({ t: "para"; text: string } | Extract<Block, { t: "code" }>)[];
  };
  const items: Draft[] = [];
  const indents: number[] = [];
  const last: Draft[] = [];
  // A blank line came before this one, so an indented paragraph is a new one in the item.
  let gap = false;
  let i = from;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const m = HR.test(line) ? null : ITEM.exec(line);
    if (m) {
      const indent = (m[1] ?? "").replaceAll("\t", "    ").length;
      while (indents.length && (indents.at(-1) ?? 0) > indent) indents.pop();
      if (!indents.length || (indents.at(-1) ?? 0) < indent) indents.push(indent);
      const depth = indents.length - 1;
      const ordered = /\d/.test(m[2] ?? "");
      // Numbering restarts in a new list: after a shallower item or a switch to bullets.
      last.length = depth + 1;
      const prev = last[depth];
      const num = prev?.ordered ? prev.num + 1 : Number.parseInt(m[2] ?? "", 10) || 1;
      const mark = (m[1] ?? "").length + (m[2] ?? "").length;
      const space = m[3] === undefined ? 1 : line.length - mark - m[3].length;
      const col = indent + (m[2] ?? "").length + space;
      const item = { depth, ordered, num: ordered ? num : 0, text: m[3] ?? "", col, more: [] };
      items.push(item);
      last[depth] = item;
      gap = false;
      i += 1;
      continue;
    }
    if (!line.trim()) {
      let j = i + 1;
      while (j < lines.length && !(lines[j] ?? "").trim()) j++;
      const next = lines[j] ?? "";
      if (!(ITEM.test(next) && !HR.test(next)) && !/^(?: {2,}|\t)\S/.test(next)) break;
      gap = true;
      i = j;
      continue;
    }
    // The deepest open item whose text the line is indented to.
    const ind = indentOf(line);
    const owner = last.findLast((it) => it && ind >= it.col);
    const fence = owner ? FENCE.exec(dedent(line, owner.col)) : null;
    if (owner && fence) {
      // A fence indented under an item is the item's code; the list goes on after it.
      const mark = fence[1] ?? "```";
      const body: string[] = [];
      code?.add(at + i);
      for (i += 1; i < lines.length; i++) {
        const l = dedent(lines[i] ?? "", owner.col);
        code?.add(at + i);
        if (fenceCloses(l, mark)) break;
        body.push(l);
      }
      i += 1;
      owner.more.push({ t: "code", lang: fence[2] ?? "", s: body.join("\n") });
    } else if (startsBlock(lines, i)) break;
    else {
      const item = items.at(-1);
      const tail = item?.more.at(-1);
      if (gap && owner) owner.more.push({ t: "para", text: line.trim() });
      else if (tail?.t === "para") tail.text += `\n${line.trim()}`;
      else if (tail) item?.more.push({ t: "para", text: line.trim() });
      else if (item) item.text += `\n${line.trim()}`;
      i += 1;
    }
    gap = false;
  }
  const done = items.map(({ text, col: _, more, ...item }): ListItem => {
    const blocks = more.map(
      (b): Block => (b.t === "para" ? { t: "para", c: inline(b.text, refs) } : b),
    );
    return { ...item, c: inline(text, refs), ...(blocks.length ? { more: blocks } : {}) };
  });
  return [done, i];
}

function parseTable(lines: string[], from: number, refs: Refs): [Block, number] {
  const head = splitRow(lines[from] ?? "");
  const align = splitRow(lines[from + 1] ?? "").map(alignOf);
  const rows: Inline[][][] = [];
  let i = from + 2;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Any other block ends the table, as in GFM: a captioned marker's pipe makes no row.
    if (!line.trim() || !line.includes("|") || BLOCK_START.some((r) => r.test(line))) break;
    const cells = splitRow(line);
    rows.push(head.map((_, k) => inline(cells[k] ?? "", refs)));
  }
  return [{ t: "table", align, head: head.map((c) => inline(c, refs)), rows }, i];
}

/** Whether a quote's line is paragraph text, which a following line without `>` continues. */
const paragraphText = (line: string) =>
  !!line.trim() && ![FENCE, HEADING, HR, COMMENT, INDENT].some((r) => r.test(line));

/**
 * Block Markdown from `from`; figure markers count only where `markers` is given (top level).
 * Link definitions go into `refs`, and inline links resolve against what it already holds.
 * Code lines go into `code.code`, numbered from `code.at` for the first line of `lines`.
 */
function parseBlocks(
  lines: string[],
  from: number,
  refs: Map<string, string>,
  markers?: Marker[],
  code: CodeLines = { at: 0 },
): Block[] {
  const blocks: Block[] = [];
  const codeLines = (start: number, end: number) => {
    for (let k = start; k < Math.min(end, lines.length); k++) code.code?.add(code.at + k);
  };
  let i = from;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const fence = FENCE.exec(line);
    const marker = MARKER.exec(line);
    const heading = HEADING.exec(line);
    const def = DEF.exec(line);
    if (!line.trim()) i += 1;
    else if (INDENT.test(line)) {
      // Four columns of indentation outside a paragraph or a list make an indented code block,
      // which runs over blank lines up to the last indented line.
      const start = i;
      let end = i;
      for (; i < lines.length && (INDENT.test(lines[i] ?? "") || !(lines[i] ?? "").trim()); i++)
        if ((lines[i] ?? "").trim()) end = i + 1;
      const body = lines.slice(start, end).map((l) => dedent(l, 4));
      codeLines(start, end);
      blocks.push({ t: "code", lang: "", s: body.join("\n") });
      i = end;
    } else if (fence) {
      const start = i;
      const mark = fence[1] ?? "```";
      const indent = new RegExp(`^ {0,${line.length - line.trimStart().length}}`);
      const body: string[] = [];
      for (i += 1; i < lines.length && !fenceCloses(lines[i] ?? "", mark); i++)
        body.push((lines[i] ?? "").replace(indent, ""));
      codeLines(start, i + 1);
      const lang = fence[2] ?? "";
      if (markers && lang === "orrery") {
        // An orrery fence is a figure whose spec is written in the document.
        const keys = infoKeys(fence[3] ?? "");
        const n = markers.length + 1;
        markers.push({
          n,
          spec: keys.name || `figure-${n}`,
          caption: keys.caption?.trim() || undefined,
          line: start,
          fence: { source: body.join("\n"), keys, end: Math.min(i, lines.length - 1) },
        });
        blocks.push({ t: "figure", n });
      } else blocks.push({ t: "code", lang, s: body.join("\n") });
      i += 1;
    } else if (marker && markers) {
      const [spec = "", ...caption] = (marker[1] ?? "").split("|");
      const n = markers.length + 1;
      markers.push({
        n,
        spec: spec.trim(),
        caption: caption.join("|").trim() || undefined,
        line: i,
      });
      blocks.push({ t: "figure", n });
      i += 1;
    } else if (COMMENT.test(line)) {
      while (i < lines.length && !(lines[i] ?? "").includes("-->")) i++;
      i += 1;
    } else if (heading) {
      const c = inline(heading[2] ?? "", refs);
      blocks.push({ t: "heading", level: (heading[1] ?? "#").length, c });
      i += 1;
    } else if (HR.test(line)) {
      blocks.push({ t: "hr" });
      i += 1;
    } else if (QUOTE.test(line)) {
      const start = i;
      const inner: string[] = [];
      let fenced = "";
      for (; i < lines.length; i++) {
        const l = lines[i] ?? "";
        const q = QUOTE.exec(l);
        // A line without > that follows paragraph text in the quote still belongs to it (a lazy
        // line), unless it starts a block of its own.
        const prev = inner.at(-1) ?? "";
        const lazy = !q && !fenced && paragraphText(prev) && l.trim() && !startsBlock(lines, i);
        if (!q && !lazy) break;
        const text = q ? (q[1] ?? "") : l;
        if (fenced) fenced = fenceCloses(text, fenced) ? "" : fenced;
        else fenced = FENCE.exec(text)?.[1] ?? "";
        inner.push(text);
      }
      const c = parseBlocks(inner, 0, refs, undefined, { code: code.code, at: code.at + start });
      blocks.push({ t: "quote", c });
    } else if (ITEM.test(line)) {
      const [items, next] = parseList(lines, i, refs, code);
      blocks.push({ t: "list", items });
      i = next;
    } else if (tableAt(lines, i)) {
      const [table, next] = parseTable(lines, i, refs);
      blocks.push(table);
      i = next;
    } else if (def?.[1]?.trim()) {
      // A link definition draws nothing; the first one for a label wins.
      const key = labelKey(def[1] ?? "");
      if (!refs.has(key)) refs.set(key, def[2] ?? def[3] ?? "");
      i += 1;
    } else {
      const text = [line.trimStart()];
      for (
        i += 1;
        i < lines.length &&
        (lines[i] ?? "").trim() &&
        !SETEXT.test(lines[i] ?? "") &&
        !startsBlock(lines, i);
        i++
      )
        text.push((lines[i] ?? "").trimStart());
      // An underline of = or - makes the lines above it a heading, not a rule or a list item.
      const setext = SETEXT.exec(lines[i] ?? "");
      const c = inline(text.join("\n").trimEnd(), refs);
      if (setext) {
        blocks.push({ t: "heading", level: setext[1]?.startsWith("=") ? 1 : 2, c });
        i += 1;
      } else blocks.push({ t: "para", c });
    }
  }
  return blocks;
}

/** The document's blocks and figure markers; front matter is skipped and its title kept. */
export function parseDoc(text: string): ParsedDoc {
  // A byte order mark (Notepad, PowerShell) is not part of line 1.
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let from = 0;
  let title: string | undefined;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, k) => k > 0 && /^(?:---|\.\.\.)\s*$/.test(l));
    if (end > 0) {
      for (const l of lines.slice(1, end)) {
        const m = /^title:\s*(.+?)\s*$/.exec(l);
        if (m) title = (m[1] ?? "").replace(/^(["'])(.*)\1$/, "$2");
      }
      from = end + 1;
    }
  }
  const markers: Marker[] = [];
  // A link may come before its definition, so a first pass collects the definitions.
  const refs = new Map<string, string>();
  parseBlocks(lines, from, refs);
  const code = new Set<number>();
  const blocks = parseBlocks(lines, from, refs, markers, { code, at: 0 });
  // Every marker-like comment outside code, so one the parser did not take (inside a list or a
  // quote, or sharing its line) shows up as a missing figure instead of vanishing.
  const markerLines: number[] = [];
  for (let k = from; k < lines.length; k++)
    if (!code.has(k) && outsideCode(lines[k] ?? "").some((t) => ANY_MARKER.test(t)))
      markerLines.push(k + 1);
  const h1 = blocks.find((b) => b.t === "heading" && b.level === 1);
  title ??= h1?.t === "heading" ? plain(h1.c) : undefined;
  return { title, blocks, markers, markerLines, code: [...code].sort((a, b) => a - b) };
}
