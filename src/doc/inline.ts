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
