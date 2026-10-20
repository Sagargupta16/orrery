// Builds a design document from Markdown whose `<!-- orrery: spec.yaml | caption -->` markers
// become numbered figures: inline SVG in HTML, image files next to Markdown, PNGs in Word.
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { type Args, printDiagnostics, renderFailure, usage, writeAtomic } from "./cli.ts";
import { pngImage, renderDocx } from "./docx.ts";
import { type Format, renderModel } from "./render/index.ts";
import { esc } from "./render/svg.ts";
import { parseSpec } from "./spec.ts";
import type { Diagnostic, Skin, ThemeName } from "./types.ts";

// ---------------------------------------------------------------- Markdown

export type Inline =
  | { t: "text"; s: string }
  | { t: "code"; s: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "img"; src: string; alt: string }
  | { t: "br" };

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
const PUNCT = /[!-/:-@[-`{-~]/;
const CODE_SPAN = /^(`+)(?!`)([\s\S]*?[^`])\1(?!`)/;
const LINK =
  /^!?\[((?:[^[\]\\]|\\.|\[(?:[^[\]\\]|\\.)*\])*)\]\(\s*<?([^\s<>()]*(?:\([^\s()]*\)[^\s<>()]*)*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/;
const AUTOLINK = /^<((?:https?|mailto):[^\s<>]+)>/;
const STRONG = /^(\*\*|__)(?!\s)([\s\S]+?)(?<!\s)\1/;
const EM_STAR = /^\*(?![\s*])([\s\S]+?)(?<![\s*])\*(?!\*)/;
const EM_UNDERSCORE = /^_(?![\s_])([\s\S]+?)(?<![\s_])_(?![\p{L}\p{N}_])/u;
const WORD = /[\p{L}\p{N}]/u;

/** The inline element starting `s`, if one does; `prev` is the character before it. */
function inlineAt(s: string, prev: string): { node: Inline; len: number } | undefined {
  const ch = s[0];
  if (ch === "`") {
    const m = CODE_SPAN.exec(s);
    if (!m) return undefined;
    const code = m[2] ?? "";
    const trim = code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim();
    return { node: { t: "code", s: trim ? code.slice(1, -1) : code }, len: m[0].length };
  }
  if (ch === "[" || (ch === "!" && s[1] === "[")) {
    const m = LINK.exec(s);
    if (!m) return undefined;
    const text = m[1] ?? "";
    const href = m[2] ?? "";
    const node: Inline =
      ch === "!" ? { t: "img", src: href, alt: text } : { t: "link", href, c: inline(text) };
    return { node, len: m[0].length };
  }
  if (ch === "<") {
    const m = AUTOLINK.exec(s);
    const href = m?.[1] ?? "";
    return m
      ? { node: { t: "link", href, c: [{ t: "text", s: href }] }, len: m[0].length }
      : undefined;
  }
  // Underscores inside a word (snake_case) are text, as in GitHub's renderer.
  if (ch === "_" && WORD.test(prev)) return undefined;
  if (ch === "*" || ch === "_") {
    const strong = STRONG.exec(s);
    if (strong && !(ch === "_" && WORD.test(s[strong[0].length] ?? "")))
      return { node: { t: "strong", c: inline(strong[2] ?? "") }, len: strong[0].length };
    const em = (ch === "*" ? EM_STAR : EM_UNDERSCORE).exec(s);
    if (em) return { node: { t: "em", c: inline(em[1] ?? "") }, len: em[0].length };
  }
  return undefined;
}

/** Inline Markdown: code spans, links, images, autolinks, bold, italic, escapes, hard breaks. */
export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const push = (node: Inline) => {
    if (text) out.push({ t: "text", s: text });
    text = "";
    out.push(node);
  };
  for (let i = 0; i < s.length; ) {
    const ch = s[i] ?? "";
    const next = s[i + 1] ?? "";
    if (ch === "\\" && PUNCT.test(next)) {
      text += next;
      i += 2;
      continue;
    }
    if (ch === "\n" || (ch === "\\" && next === "\n")) {
      // Two trailing spaces or a backslash end a line on purpose; any other newline is a space.
      if (ch === "\\" || / {2,}$/.test(text)) {
        text = text.trimEnd();
        push({ t: "br" });
      } else text += " ";
      i += ch === "\\" ? 2 : 1;
      continue;
    }
    const found = "`[!<*_".includes(ch) ? inlineAt(s.slice(i), s[i - 1] ?? "") : undefined;
    if (found) {
      push(found.node);
      i += found.len;
    } else {
      text += ch;
      i += 1;
    }
  }
  if (text) out.push({ t: "text", s: text });
  return out;
}

/** The text of inline content without its markup. */
export function plain(list: Inline[]): string {
  return list
    .map((n) => {
      if (n.t === "text" || n.t === "code") return n.s;
      if (n.t === "img") return n.alt;
      if (n.t === "br") return " ";
      return plain(n.c);
    })
    .join("");
}

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

// ---------------------------------------------------------------- figures

export interface DocFigure {
  n: number;
  caption: string;
  /** File-safe spec name: figures/01-<stem>.svg. */
  stem: string;
  svg?: string;
  /** PNG at 2x. */
  png?: Uint8Array;
  /** Scene size in CSS px. */
  width: number;
  height: number;
}

const isError = (d: Diagnostic) => d.severity === "error";

async function renderFigure(
  m: Marker,
  dir: string,
  opts: { formats: Format[]; theme: ThemeName; skin?: Skin },
  diagnostics: Diagnostic[],
): Promise<DocFigure | undefined> {
  const tag = (d: Diagnostic): Diagnostic => ({
    ...d,
    message: `figure ${m.n} (${m.spec}): ${d.message}`,
    subject: { ...d.subject, figure: m.n, line: m.line + 1 },
  });
  const path = resolve(dir, m.spec);
  if (!m.spec || !existsSync(path) || !statSync(path).isFile()) {
    diagnostics.push({
      severity: "error",
      code: "DG401",
      message: m.spec
        ? `figure ${m.n}: no such spec file ${m.spec}`
        : `figure ${m.n}: the marker names no spec file`,
      subject: { figure: m.n, line: m.line + 1, spec: m.spec },
      fixes: [
        "write the path relative to the document's folder: <!-- orrery: diagrams/system.yaml | Caption -->",
      ],
    });
    return undefined;
  }
  const parsed = parseSpec(readFileSync(path, "utf8"), path);
  diagnostics.push(...parsed.diagnostics.map(tag));
  if (!parsed.model || parsed.diagnostics.some(isError)) return undefined;
  const name = basename(path).replace(/\.(ya?ml|json)$/i, "");
  let result: Awaited<ReturnType<typeof renderModel>>;
  try {
    // The figure number in the name keeps SVG ids apart when one page holds every figure.
    result = await renderModel({
      model: parsed.model,
      formats: opts.formats,
      themes: [opts.theme],
      name: `fig${m.n}-${name}`,
      scale: 2,
      skin: opts.skin,
    });
  } catch (e) {
    const failure = renderFailure(e);
    if (!failure) throw e;
    diagnostics.push(tag(failure));
    return undefined;
  }
  diagnostics.push(...result.diagnostics.map(tag));
  if (result.diagnostics.some(isError)) return undefined;
  const scene = result.scenes[opts.theme];
  const svg = result.artifacts.find((a) => a.format === "svg")?.data;
  const png = result.artifacts.find((a) => a.format === "png")?.data;
  return {
    n: m.n,
    caption: m.caption ?? parsed.model.title ?? name,
    stem: name.replace(/[^A-Za-z0-9._-]+/g, "-"),
    svg: typeof svg === "string" ? svg : undefined,
    png: png instanceof Uint8Array ? png : undefined,
    width: scene?.width ?? 1,
    height: scene?.height ?? 1,
  };
}

// ---------------------------------------------------------------- HTML

const DOC_CSS = `:root{color-scheme:light;--bg:#ffffff;--ink:#1f2328;--muted:#59636e;--line:#d1d9e0;--soft:#f6f8fa;--accent:#0969da}
html[data-theme=dark]{color-scheme:dark;--bg:#0d1117;--ink:#e6edf3;--muted:#9198a1;--line:#3d444d;--soft:#151b23;--accent:#4493f8}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;overflow-wrap:break-word}
main{max-width:46rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
h1,h2,h3,h4,h5,h6{line-height:1.25;font-weight:600;margin:2rem 0 .75rem}
h1{font-size:2rem;margin-top:0}
h2{font-size:1.5rem;padding-bottom:.3rem;border-bottom:1px solid var(--line)}
h3{font-size:1.25rem}
h4{font-size:1rem}
h5,h6{font-size:.9rem;color:var(--muted)}
p,ul,ol,blockquote,pre,.table{margin:0 0 1rem}
ul,ol{padding-left:1.5rem}
li+li,li>ul,li>ol{margin-top:.25rem}
a{color:var(--accent)}
code{font:.875em/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;background:var(--soft);padding:.15em .35em;border-radius:4px}
pre{background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:.9rem 1rem;overflow-x:auto}
pre code{background:none;padding:0;font-size:.85rem}
blockquote{margin-left:0;padding:0 1rem;border-left:4px solid var(--line);color:var(--muted)}
.table{overflow-x:auto}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid var(--line);padding:.4rem .75rem;text-align:left;vertical-align:top}
th{background:var(--soft);font-weight:600}
hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
img{max-width:100%;height:auto}
figure{margin:1.75rem 0}
figure svg{display:block;width:100%;height:auto}
figcaption{margin-top:.6rem;font-size:.875rem;color:var(--muted);text-align:center}
@media print{
body{background:#fff;color:#000;font-size:11pt}
main{max-width:none;padding:0}
a{color:inherit}
h1,h2,h3,h4{break-after:avoid}
figure,pre,table,blockquote{break-inside:avoid}
pre,code,th{background:none}
}`;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/** A Markdown image path as a file in the document's folder, when it is one. */
function localFile(src: string, dir: string): string | undefined {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(src)) return undefined;
  const path = resolve(dir, src);
  return existsSync(path) && statSync(path).isFile() ? path : undefined;
}

const safeHref = (href: string) => (/^\s*(?:javascript|vbscript|data):/i.test(href) ? "#" : href);

function slug(text: string, seen: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "section";
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n ? `${base}-${n}` : base;
}

interface HtmlCtx {
  figures: Map<number, DocFigure>;
  ids: Map<string, number>;
  /** An image's src: local files become data URIs, so the page stands alone. */
  src: (src: string) => string;
}

function inlineHtml(list: Inline[], ctx: HtmlCtx): string {
  return list
    .map((n) => {
      switch (n.t) {
        case "text":
          return esc(n.s);
        case "code":
          return `<code>${esc(n.s)}</code>`;
        case "strong":
          return `<strong>${inlineHtml(n.c, ctx)}</strong>`;
        case "em":
          return `<em>${inlineHtml(n.c, ctx)}</em>`;
        case "link":
          return `<a href="${esc(safeHref(n.href))}">${inlineHtml(n.c, ctx)}</a>`;
        case "img":
          return `<img src="${esc(ctx.src(n.src))}" alt="${esc(n.alt)}">`;
        default:
          return "<br>";
      }
    })
    .join("");
}

/** Nested <ul>/<ol> from the flat item list; every open list keeps one open <li>. */
function listHtml(items: ListItem[], ctx: HtmlCtx): string {
  let out = "";
  const open: string[] = [];
  for (const it of items) {
    const tag = it.ordered ? "ol" : "ul";
    while (open.length > it.depth + 1) out += `</li></${open.pop()}>`;
    if (open.length === it.depth + 1) {
      if (open.at(-1) === tag) out += "</li>";
      else out += `</li></${open.pop()}>`;
    }
    while (open.length < it.depth + 1) {
      open.push(tag);
      out += it.ordered && it.num !== 1 ? `<ol start="${it.num}">` : `<${tag}>`;
    }
    out += `<li>${inlineHtml(it.c, ctx)}`;
  }
  while (open.length) out += `</li></${open.pop()}>`;
  return out;
}

function blockHtml(b: Block, ctx: HtmlCtx): string {
  switch (b.t) {
    case "heading":
      return `<h${b.level} id="${esc(slug(plain(b.c), ctx.ids))}">${inlineHtml(b.c, ctx)}</h${b.level}>`;
    case "para":
      return `<p>${inlineHtml(b.c, ctx)}</p>`;
    case "list":
      return listHtml(b.items, ctx);
    case "code":
      return `<pre><code${b.lang ? ` class="language-${esc(b.lang)}"` : ""}>${esc(b.s)}</code></pre>`;
    case "table": {
      const cell = (tag: string, c: Inline[], k: number) =>
        `<${tag}${b.align[k] ? ` style="text-align:${b.align[k]}"` : ""}>${inlineHtml(c, ctx)}</${tag}>`;
      const head = b.head.map((c, k) => cell("th", c, k)).join("");
      const rows = b.rows.map((r) => `<tr>${r.map((c, k) => cell("td", c, k)).join("")}</tr>`);
      return `<div class="table"><table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${rows.join("\n")}\n</tbody>\n</table></div>`;
    }
    case "quote":
      return `<blockquote>\n${b.c.map((c) => blockHtml(c, ctx)).join("\n")}\n</blockquote>`;
    case "hr":
      return "<hr>";
    case "figure": {
      const f = ctx.figures.get(b.n);
      if (!f?.svg) return "";
      return `<figure class="orrery" id="figure-${b.n}">\n${f.svg.trim()}\n<figcaption>Figure ${b.n}: ${esc(f.caption)}</figcaption>\n</figure>`;
    }
  }
}

function renderDocHtml(
  doc: ParsedDoc,
  figures: Map<number, DocFigure>,
  theme: ThemeName,
  dir: string,
): string {
  const ctx: HtmlCtx = {
    figures,
    ids: new Map(),
    src: (src) => {
      const file = localFile(src, dir);
      const mime = file && MIME[extname(file).toLowerCase()];
      return file && mime ? `data:${mime};base64,${readFileSync(file).toString("base64")}` : src;
    },
  };
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="orrery">
<title>${esc(doc.title ?? "Design document")}</title>
<style>
${DOC_CSS}
</style>
</head>
<body>
<main>
${doc.blocks.map((b) => blockHtml(b, ctx)).join("\n")}
</main>
</body>
</html>
`;
}

// ---------------------------------------------------------------- Markdown out

const mdEscape = (s: string) => s.replace(/([\\`*_[\]<>])/g, "\\$1");

/** The source with each marker line replaced by its image and caption, and the figure files. */
function renderDocMarkdown(
  text: string,
  doc: ParsedDoc,
  figures: Map<number, DocFigure>,
): { text: string; files: [string, string | Uint8Array][]; figures: number } {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const files: [string, string | Uint8Array][] = [];
  const refs: string[] = [];
  for (const m of doc.markers) {
    const f = figures.get(m.n);
    if (!f?.svg || !f.png) continue;
    const stem = `figures/${String(m.n).padStart(2, "0")}-${f.stem}`;
    const caption = mdEscape(f.caption);
    const ref = `![${caption}](${stem}.svg)`;
    lines[m.line] = `${ref}${eol}${eol}*Figure ${m.n}: ${caption}*`;
    files.push([`${stem}.svg`, f.svg], [`${stem}.png`, f.png]);
    refs.push(ref);
  }
  const out = lines.join(eol);
  return { text: out, files, figures: refs.filter((r) => out.includes(r)).length };
}

// ---------------------------------------------------------------- build

export const DOC_FORMATS = ["html", "md", "docx"] as const;
export type DocFormat = (typeof DOC_FORMATS)[number];

export interface DocRequest {
  /** The Markdown file. */
  file: string;
  /** Output path without extension; each format adds its own. */
  base: string;
  formats: DocFormat[];
  /** Light unless asked: documents are mostly read on white pages or printed. */
  theme?: ThemeName;
  /** Overrides each spec's own skin. */
  skin?: Skin;
}

export interface DocOutput {
  path: string;
  format: DocFormat;
  bytes: number;
  figures: number;
}

export interface DocResult {
  outputs: DocOutput[];
  /** Figure files written next to the Markdown output. */
  files: string[];
  diagnostics: Diagnostic[];
  /** Marker comments found outside code. */
  markers: number;
}

/** Renders every figure, builds each format in memory, and writes nothing unless all are whole. */
export async function buildDoc(req: DocRequest): Promise<DocResult> {
  const text = readFileSync(req.file, "utf8");
  const doc = parseDoc(text);
  const dir = dirname(req.file);
  const theme = req.theme ?? "light";
  const want = new Set(req.formats);
  const diagnostics: Diagnostic[] = [];
  const result: DocResult = {
    outputs: [],
    files: [],
    diagnostics,
    markers: doc.markerLines.length,
  };
  const formats: Format[] = [];
  if (want.has("html") || want.has("md")) formats.push("svg");
  if (want.has("md") || want.has("docx")) formats.push("png");
  const figures = new Map<number, DocFigure>();
  for (const m of doc.markers) {
    const f = await renderFigure(m, dir, { formats, theme, skin: req.skin }, diagnostics);
    if (f) figures.set(m.n, f);
  }
  if (diagnostics.some(isError)) return result;

  const title = doc.title ?? basename(req.file).replace(/\.(md|markdown)$/i, "");
  const pending: {
    path: string;
    data: string | Uint8Array;
    format?: DocFormat;
    figures: number;
  }[] = [];
  if (want.has("html")) {
    const html = renderDocHtml({ ...doc, title }, figures, theme, dir);
    const count = html.match(/<figure class="orrery"/g)?.length ?? 0;
    pending.push({ path: `${req.base}.html`, data: html, format: "html", figures: count });
  }
  if (want.has("md")) {
    const md = renderDocMarkdown(text, doc, figures);
    const out = dirname(`${req.base}.md`);
    for (const [rel, data] of md.files) pending.push({ path: join(out, rel), data, figures: 0 });
    pending.push({ path: `${req.base}.md`, data: md.text, format: "md", figures: md.figures });
  }
  if (want.has("docx")) {
    const docx = renderDocx({
      title,
      blocks: doc.blocks,
      figures,
      image: (src) => {
        const file = localFile(src, dir);
        const img = file ? pngImage(readFileSync(file)) : undefined;
        if (file && !img)
          diagnostics.push({
            severity: "warning",
            code: "DG403",
            message: `image ${src} is not a PNG; the Word file shows its alt text instead`,
            subject: { image: src },
            fixes: ["save the image as PNG, or link it instead of embedding it"],
          });
        return img;
      },
    });
    pending.push({
      path: `${req.base}.docx`,
      data: docx.data,
      format: "docx",
      figures: docx.figures,
    });
  }
  const taken = new Set(doc.markers.map((m) => m.line + 1));
  const stray = doc.markerLines.filter((l) => !taken.has(l));
  for (const p of pending) {
    if (!p.format || p.figures === doc.markerLines.length) continue;
    diagnostics.push({
      severity: "error",
      code: "DG402",
      message: `the ${p.format} output has ${p.figures} figure(s) for ${doc.markerLines.length} marker(s)${stray.length ? `; the marker on line ${stray.join(", ")} is not on a line of its own at the top level` : ""}`,
      subject: { format: p.format },
      evidence: { figures: p.figures, markers: doc.markerLines.length, lines: stray },
      fixes: [
        "put each <!-- orrery: spec.yaml | Caption --> marker on a line of its own, outside lists, quotes and code",
      ],
    });
  }
  if (diagnostics.some(isError)) return result;
  for (const p of pending) {
    writeAtomic(p.path, p.data);
    const bytes = typeof p.data === "string" ? Buffer.byteLength(p.data) : p.data.length;
    if (p.format)
      result.outputs.push({ path: p.path, format: p.format, bytes, figures: p.figures });
    else result.files.push(p.path);
  }
  return result;
}

const samePath = (a: string, b: string) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

export async function cmdDoc(args: Args): Promise<void> {
  const [docPath] = args._;
  if (!docPath) usage("doc needs a Markdown file");
  const file = resolve(docPath);
  if (!existsSync(file) || !statSync(file).isFile()) usage(`no such file: ${docPath}`);
  const theme = String(args.flags.theme ?? "light");
  if (theme !== "light" && theme !== "dark") usage("--theme must be light or dark");
  const outFlag = typeof args.flags.out === "string" ? args.flags.out : undefined;
  const fmtFlag = typeof args.flags.format === "string" ? args.flags.format : undefined;
  const outExt = outFlag ? extname(outFlag).slice(1).toLowerCase() : "";
  const known = (f: string): f is DocFormat => (DOC_FORMATS as readonly string[]).includes(f);
  let formats: DocFormat[];
  if (fmtFlag) {
    const list = fmtFlag === "all" ? [...DOC_FORMATS] : fmtFlag.split(",").map((f) => f.trim());
    for (const f of list)
      if (!known(f)) usage(`unknown format "${f}" (use ${DOC_FORMATS.join(", ")} or all)`);
    formats = list as DocFormat[];
  } else formats = known(outExt) ? [outExt] : ["html"];
  const name = basename(file).replace(/\.(md|markdown)$/i, "");
  let base: string;
  if (!outFlag) base = join(dirname(file), name);
  else if (
    outFlag.endsWith("/") ||
    outFlag.endsWith("\\") ||
    (existsSync(outFlag) && statSync(outFlag).isDirectory())
  )
    base = join(resolve(outFlag), name);
  else base = resolve(known(outExt) ? outFlag.slice(0, -(outExt.length + 1)) : outFlag);
  if (formats.includes("md") && samePath(resolve(`${base}.md`), file))
    usage(`the md output would overwrite ${docPath}; pass -o, e.g. -o dist/${name}.md`);

  const result = await buildDoc({
    file,
    base,
    formats,
    theme,
    skin: args.flags.skin as Skin | undefined,
  });
  printDiagnostics(result.diagnostics, false);
  for (const o of result.outputs)
    process.stdout.write(`wrote ${o.path} (${o.bytes} bytes, ${o.figures} figure(s))\n`);
  if (result.files.length)
    process.stdout.write(
      `wrote ${result.files.length} figure file(s) to ${dirname(result.files[0] ?? "")}\n`,
    );
  const errors = result.diagnostics.filter(isError).length;
  const warnings = result.diagnostics.length - errors;
  process.stdout.write(
    `${errors ? "failed" : "ok"}: ${result.markers} marker(s), ${errors} error(s), ${warnings} warning(s)\n`,
  );
  process.exitCode = errors ? 1 : 0;
}
