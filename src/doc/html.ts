// The standalone HTML page: GitHub-like CSS, figures as inline SVG, local images as data URIs.
import { esc } from "../render/svg.ts";
import type { ThemeName } from "../types.ts";
import type { DocFigure } from "./figures.ts";
import { dataUri } from "./images.ts";
import { type Inline, plain } from "./inline.ts";
import type { Block, ListItem, ParsedDoc } from "./markdown.ts";

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

export function renderDocHtml(
  doc: ParsedDoc,
  figures: Map<number, DocFigure>,
  theme: ThemeName,
  dir: string,
): string {
  const ctx: HtmlCtx = { figures, ids: new Map(), src: (src) => dataUri(src, dir) };
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
