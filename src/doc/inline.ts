// Inline Markdown for `orrery doc`: code spans, links, images, autolinks, emphasis and breaks.

export type Inline =
  | { t: "text"; s: string }
  | { t: "code"; s: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "img"; src: string; alt: string }
  | { t: "br" };

const PUNCT = /[!-/:-@[-`{-~]/;
const CODE_SPAN = /^(`+)(?!`)([\s\S]*?[^`])\1(?!`)/;
const LINK =
  /^!?\[((?:[^[\]\\]|\\.|\[(?:[^[\]\\]|\\.)*\])*)\]\(\s*<?([^\s<>()]*(?:\([^\s()]*\)[^\s<>()]*)*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/;
const REF = /^!?\[((?:[^[\]\\]|\\.|\[(?:[^[\]\\]|\\.)*\])*)\](?:\[((?:[^[\]\\]|\\.)*)\])?/;
const AUTOLINK = /^<((?:https?|mailto):[^\s<>]+)>/;
const STRONG = /^(\*\*|__)(?!\s)([\s\S]+?)(?<!\s)\1/;
const EM_STAR = /^\*(?![\s*])([\s\S]+?)(?<![\s*])\*(?!\*)/;
const EM_UNDERSCORE = /^_(?![\s_])([\s\S]+?)(?<![\s_])_(?![\p{L}\p{N}_])/u;
const WORD = /[\p{L}\p{N}]/u;

/** Link reference definitions, by label key. */
export type Refs = ReadonlyMap<string, string>;

const NO_REFS: Refs = new Map();

/** A link label as definitions and references match it: case and inner whitespace ignored. */
export const labelKey = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase();

/** The link or image text and target starting `s`, inline or by reference. */
function linkAt(s: string, refs: Refs): { text: string; href: string; len: number } | undefined {
  const m = LINK.exec(s);
  if (m) return { text: m[1] ?? "", href: m[2] ?? "", len: m[0].length };
  // [text][label], [text][] and [label] point where the label's definition does.
  const r = REF.exec(s);
  const href = r ? refs.get(labelKey(r[2] || r[1] || "")) : undefined;
  return r && href !== undefined ? { text: r[1] ?? "", href, len: r[0].length } : undefined;
}

/** The inline element starting `s`, if one does; `prev` is the character before it. */
function inlineAt(s: string, prev: string, refs: Refs): { node: Inline; len: number } | undefined {
  const ch = s[0];
  if (ch === "`") {
    const m = CODE_SPAN.exec(s);
    if (!m) return undefined;
    const code = m[2] ?? "";
    const trim = code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim();
    return { node: { t: "code", s: trim ? code.slice(1, -1) : code }, len: m[0].length };
  }
  if (ch === "[" || (ch === "!" && s[1] === "[")) {
    const link = linkAt(s, refs);
    if (!link) return undefined;
    const { text, href } = link;
    const node: Inline =
      ch === "!" ? { t: "img", src: href, alt: text } : { t: "link", href, c: inline(text, refs) };
    return { node, len: link.len };
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
      return { node: { t: "strong", c: inline(strong[2] ?? "", refs) }, len: strong[0].length };
    const em = (ch === "*" ? EM_STAR : EM_UNDERSCORE).exec(s);
    if (em) return { node: { t: "em", c: inline(em[1] ?? "", refs) }, len: em[0].length };
  }
  return undefined;
}

/** Inline Markdown: code spans, links, images, autolinks, bold, italic, escapes, hard breaks. */
export function inline(s: string, refs: Refs = NO_REFS): Inline[] {
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
    const found = "`[!<*_".includes(ch) ? inlineAt(s.slice(i), s[i - 1] ?? "", refs) : undefined;
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

/** The source text of `s` between its code spans, found the way inline() finds them. */
export function outsideCode(s: string): string[] {
  const pieces: string[] = [];
  let text = "";
  for (let i = 0; i < s.length; ) {
    const span = s[i] === "`" ? CODE_SPAN.exec(s.slice(i)) : null;
    if (span) {
      pieces.push(text);
      text = "";
      i += span[0].length;
    } else {
      // An escaped backtick opens no span.
      const step = s[i] === "\\" && PUNCT.test(s[i + 1] ?? "") ? 2 : 1;
      text += s.slice(i, i + step);
      i += step;
    }
  }
  pieces.push(text);
  return pieces;
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
