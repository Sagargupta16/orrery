// Block Markdown for `orrery doc`: front matter, headings, lists, tables, quotes, code and markers.
import { type Inline, inline, plain } from "./inline.ts";

export type Align = "left" | "center" | "right" | undefined;

export interface ListItem {
  /** Nesting level, 0 for the outer list. */
  depth: number;
  ordered: boolean;
  /** The number shown for an ordered item. */
  num: number;
  c: Inline[];
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
  /** Spec path as written, relative to the document's folder. */
  spec: string;
  caption?: string;
  /** Index of the marker's line in the source. */
  line: number;
}

export interface ParsedDoc {
  title?: string;
  blocks: Block[];
  markers: Marker[];
  /** 1-based lines of every marker comment outside code, recognized or not. */
  markerLines: number[];
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const FENCE_END = /^ {0,3}(`{3,}|~{3,})\s*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const MARKER = /^ {0,3}<!--\s*orrery:(.*?)-->\s*$/;
const ANY_MARKER = /<!--\s*orrery:/;
const COMMENT = /^ {0,3}<!--/;
const TABLE_SEP = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

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
  return [FENCE, HEADING, HR, QUOTE, ITEM, COMMENT].some((r) => r.test(line)) || tableAt(lines, i);
}

function alignOf(cell: string): Align {
  if (cell.startsWith(":") && cell.endsWith(":")) return "center";
  if (cell.endsWith(":")) return "right";
  return cell.startsWith(":") ? "left" : undefined;
}

function parseList(lines: string[], from: number): [ListItem[], number] {
  const items: (Omit<ListItem, "c"> & { text: string })[] = [];
  const indents: number[] = [];
  const last: (typeof items)[number][] = [];
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
      const item = { depth, ordered, num: ordered ? num : 0, text: m[3] ?? "" };
      items.push(item);
      last[depth] = item;
      i += 1;
    } else if (!line.trim()) {
      let j = i + 1;
      while (j < lines.length && !(lines[j] ?? "").trim()) j++;
      const next = lines[j] ?? "";
      if (!(ITEM.test(next) && !HR.test(next)) && !/^(?: {2,}|\t)\S/.test(next)) break;
      i = j;
    } else if (startsBlock(lines, i)) break;
    else {
      const item = items.at(-1);
      if (item) item.text += `\n${line.trim()}`;
      i += 1;
    }
  }
  return [items.map(({ text, ...item }) => ({ ...item, c: inline(text) })), i];
}

function parseTable(lines: string[], from: number): [Block, number] {
  const head = splitRow(lines[from] ?? "");
  const align = splitRow(lines[from + 1] ?? "").map(alignOf);
  const rows: Inline[][][] = [];
  let i = from + 2;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim() || !line.includes("|")) break;
    const cells = splitRow(line);
    rows.push(head.map((_, k) => inline(cells[k] ?? "")));
  }
  return [{ t: "table", align, head: head.map(inline), rows }, i];
}

/** Block Markdown from `from`; figure markers count only where `markers` is given (top level). */
function parseBlocks(lines: string[], from: number, markers?: Marker[]): Block[] {
  const blocks: Block[] = [];
  let i = from;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const fence = FENCE.exec(line);
    const marker = MARKER.exec(line);
    const heading = HEADING.exec(line);
    if (!line.trim()) i += 1;
    else if (fence) {
      const mark = fence[1] ?? "```";
      const indent = new RegExp(`^ {0,${line.length - line.trimStart().length}}`);
      const body: string[] = [];
      for (i += 1; i < lines.length && !fenceCloses(lines[i] ?? "", mark); i++)
        body.push((lines[i] ?? "").replace(indent, ""));
      i += 1;
      blocks.push({ t: "code", lang: fence[2] ?? "", s: body.join("\n") });
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
      blocks.push({ t: "heading", level: (heading[1] ?? "#").length, c: inline(heading[2] ?? "") });
      i += 1;
    } else if (HR.test(line)) {
      blocks.push({ t: "hr" });
      i += 1;
    } else if (QUOTE.test(line)) {
      const inner: string[] = [];
      for (let q = QUOTE.exec(line); q; q = QUOTE.exec(lines[++i] ?? "")) inner.push(q[1] ?? "");
      blocks.push({ t: "quote", c: parseBlocks(inner, 0) });
    } else if (ITEM.test(line)) {
      const [items, next] = parseList(lines, i);
      blocks.push({ t: "list", items });
      i = next;
    } else if (tableAt(lines, i)) {
      const [table, next] = parseTable(lines, i);
      blocks.push(table);
      i = next;
    } else {
      const text = [line.trimStart()];
      for (i += 1; i < lines.length && (lines[i] ?? "").trim() && !startsBlock(lines, i); i++)
        text.push((lines[i] ?? "").trimStart());
      blocks.push({ t: "para", c: inline(text.join("\n").trimEnd()) });
    }
  }
  return blocks;
}

/** The document's blocks and figure markers; front matter is skipped and its title kept. */
export function parseDoc(text: string): ParsedDoc {
  const lines = text.split(/\r?\n/);
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
  const blocks = parseBlocks(lines, from, markers);
  // Every marker-like comment outside code, so one the parser did not take (inside a list or a
  // quote, or sharing its line) shows up as a missing figure instead of vanishing.
  const markerLines: number[] = [];
  let fence = "";
  for (let k = from; k < lines.length; k++) {
    const l = lines[k] ?? "";
    if (fence) {
      if (fenceCloses(l, fence)) fence = "";
    } else if (FENCE.test(l)) fence = FENCE.exec(l)?.[1] ?? "";
    else if (ANY_MARKER.test(l)) markerLines.push(k + 1);
  }
  const h1 = blocks.find((b) => b.t === "heading" && b.level === 1);
  title ??= h1?.t === "heading" ? plain(h1.c) : undefined;
  return { title, blocks, markers, markerLines };
}
