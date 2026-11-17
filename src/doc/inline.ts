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
const LINK =
  /^!?\[((?:[^[\]\\]|\\.|\[(?:[^[\]\\]|\\.)*\])*)\]\(\s*<?([^\s<>()]*(?:\([^\s()]*\)[^\s<>()]*)*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/;
const REF = /^!?\[((?:[^[\]\\]|\\.|\[(?:[^[\]\\]|\\.)*\])*)\](?:\[((?:[^[\]\\]|\\.)*)\])?/;
const AUTOLINK = /^<((?:https?|mailto):[^\s<>]+)>/;
/** A bare web address, linked as GitHub links one: after a space, a bracket or emphasis. */
const BARE_URL = /^https?:\/\/[\p{L}\p{N}][^\s<>]*/iu;
const URL_PREV = /^$|[\s*_~(]/;
const ENTITY = /&(?:#[xX][\da-fA-F]{1,6}|#\d{1,7}|[A-Za-z][A-Za-z\d]{1,31});/y;
const ESCAPE_OR_ENTITY =
  /\\([!-/:-@[-`{-~])|&(?:#[xX][\da-fA-F]{1,6}|#\d{1,7}|[A-Za-z][A-Za-z\d]{1,31});/g;
const WORD = /[\p{L}\p{N}]/u;
const WORD_OR_UNDERSCORE = /[\p{L}\p{N}_]/u;
const SPACE = /\s/;

/** The named entities a design document is likely to use; any other name stays as written. */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  deg: "\u00b0",
  plusmn: "\u00b1",
  times: "\u00d7",
  divide: "\u00f7",
  middot: "\u00b7",
  sect: "\u00a7",
  para: "\u00b6",
  euro: "\u20ac",
  pound: "\u00a3",
  yen: "\u00a5",
  cent: "\u00a2",
  hellip: "\u2026",
  bull: "\u2022",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  laquo: "\u00ab",
  raquo: "\u00bb",
  larr: "\u2190",
  rarr: "\u2192",
  uarr: "\u2191",
  darr: "\u2193",
  harr: "\u2194",
  le: "\u2264",
  ge: "\u2265",
  ne: "\u2260",
  check: "\u2713",
};

/** Link reference definitions, by label key. */
export type Refs = ReadonlyMap<string, string>;

const NO_REFS: Refs = new Map();

/** A link label as definitions and references match it: case and inner whitespace ignored. */
export const labelKey = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase();

/** The character an entity such as `&amp;` or `&#169;` stands for, or undefined for an unknown name. */
function decode(entity: string): string | undefined {
  const body = entity.slice(1, -1);
  // Own keys only: `&constructor;` is not an entity.
  if (body[0] !== "#") return Object.hasOwn(NAMED, body) ? NAMED[body] : undefined;
  const cp = /^#[xX]/.test(body)
    ? Number.parseInt(body.slice(2), 16)
    : Number.parseInt(body.slice(1), 10);
  // NUL, surrogates and code points past Unicode become the replacement character, as in HTML.
  const bad = cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff);
  return String.fromCodePoint(bad ? 0xfffd : cp);
}

/** A link target or image path with its backslash escapes and entities resolved. */
const literal = (s: string) =>
  s.replace(ESCAPE_OR_ENTITY, (m, escaped?: string) => escaped ?? decode(m) ?? m);

/** The backticks in a row from `i`. */
function runLength(s: string, i: number): number {
  let j = i;
  while (s[j] === "`") j++;
  return j - i;
}

/** Every run of backticks in `s` by its length, as sorted start positions. */
function backtickRuns(s: string): Map<number, number[]> {
  const runs = new Map<number, number[]>();
  for (let i = s.indexOf("`"); i >= 0; ) {
    const n = runLength(s, i);
    const list = runs.get(n) ?? [];
    list.push(i);
    runs.set(n, list);
    i = s.indexOf("`", i + n);
  }
  return runs;
}

/** The first number in the sorted `list` that is at least `from`, or -1. */
function firstFrom(list: readonly number[], from: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid] ?? 0) < from) lo = mid + 1;
    else hi = mid;
  }
  return list[lo] ?? -1;
}

/**
 * The end of the code span the backticks at `i` open: a later run of exactly as many backticks
 * closes it. Found by binary search over the runs, so a line of unmatched backticks stays linear.
 */
function codeSpanEnd(s: string, i: number, runs: Map<number, number[]>): number {
  const n = runLength(s, i);
  const close = firstFrom(runs.get(n) ?? [], i + n);
  return close < 0 ? -1 : close + n;
}

/** The length of the bare web address at `i`, without the punctuation that ends a sentence. */
function bareUrlLength(s: string, i: number): number {
  const m = BARE_URL.exec(s.slice(i));
  if (!m) return 0;
  let url = m[0];
  const open = url.split("(").length - 1;
  let close = url.split(")").length - 1;
  // A closing bracket belongs to the address only when the address opened one for it.
  for (;;) {
    const last = url.at(-1) ?? "";
    if ("?!.,:*_~'\"".includes(last)) url = url.slice(0, -1);
    else if (last === ")" && close > open) {
      url = url.slice(0, -1);
      close -= 1;
    } else break;
  }
  return /^https?:\/\/./i.test(url) ? url.length : 0;
}

/** What one inline() call knows about its whole string, worked out once so matching is linear. */
interface Scan {
  s: string;
  refs: Refs;
  /** False inside link text, where no other link may start. */
  links: boolean;
  runs: Map<number, number[]>;
  /** 1 where a code span, an autolink or a bare address covers the character: nothing closes there. */
  locked: Uint8Array;
  /** Where each emphasis delimiter may close, built when an opener first asks. */
  closers: Map<string, number[]>;
}

function scanOf(s: string, refs: Refs, links: boolean): Scan {
  const runs = backtickRuns(s);
  const locked = new Uint8Array(s.length);
  for (let i = 0; i < s.length; ) {
    const ch = s[i];
    let to = i + 1;
    if (ch === "\\" && PUNCT.test(s[i + 1] ?? "")) to = i + 2;
    else if (ch === "`") {
      const end = codeSpanEnd(s, i, runs);
      to = end < 0 ? i + runLength(s, i) : end;
      if (end >= 0) locked.fill(1, i, to);
    } else if (ch === "<" && links) {
      const n = AUTOLINK.exec(s.slice(i))?.[0].length ?? 0;
      locked.fill(1, i, i + n);
      to = i + Math.max(n, 1);
    } else if ((ch === "h" || ch === "H") && links && URL_PREV.test(s[i - 1] ?? "")) {
      const n = bareUrlLength(s, i);
      locked.fill(1, i, i + n);
      to = i + Math.max(n, 1);
    }
    i = to;
  }
  return { s, refs, links, runs, locked, closers: new Map() };
}

/** Whether `delim` (`*`, `**`, `***` or the same in underscores) can close at `j`. */
function closesAt(scan: Scan, delim: string, j: number): boolean {
  const { s } = scan;
  const c = delim[0] ?? "";
  const before = s[j - 1] ?? " ";
  const after = s[j + delim.length] ?? "";
  if (scan.locked[j] || SPACE.test(before)) return false;
  if (delim.length !== 2 && before === c) return false;
  if (delim === "*") return after !== "*";
  if (delim === "_" || delim === "___") return !WORD_OR_UNDERSCORE.test(after);
  return true;
}

/** The first place from `from` where `delim` closes, or -1. */
function closerAfter(scan: Scan, delim: string, from: number): number {
  let list = scan.closers.get(delim);
  if (!list) {
    list = [];
    for (let j = scan.s.indexOf(delim, 1); j >= 0; j = scan.s.indexOf(delim, j + 1))
      if (closesAt(scan, delim, j)) list.push(j);
    scan.closers.set(delim, list);
  }
  return firstFrom(list, from);
}

/** Bold, italic or both from the delimiter at `i`, closed by the nearest matching delimiter. */
function emphasisAt(scan: Scan, i: number): { node: Inline; len: number } | undefined {
  const { s } = scan;
  const c = s[i] ?? "";
  const sub = (from: number, to: number) => inline(s.slice(from, to), scan.refs, scan.links);
  // A delimiter followed by a space opens nothing.
  const opens = (n: number) => s.startsWith(c.repeat(n), i) && !SPACE.test(s[i + n] ?? " ");
  if (opens(3)) {
    const j = closerAfter(scan, c.repeat(3), i + 4);
    if (j >= 0)
      return { node: { t: "em", c: [{ t: "strong", c: sub(i + 3, j) }] }, len: j + 3 - i };
  }
  if (opens(2)) {
    const j = closerAfter(scan, c.repeat(2), i + 3);
    // __ closing inside a word (__init__x) is not bold.
    if (j >= 0 && !(c === "_" && WORD.test(s[j + 2] ?? "")))
      return { node: { t: "strong", c: sub(i + 2, j) }, len: j + 2 - i };
  }
  if (opens(1) && s[i + 1] !== c) {
    const j = closerAfter(scan, c, i + 2);
    if (j >= 0) return { node: { t: "em", c: sub(i + 1, j) }, len: j + 1 - i };
  }
  return undefined;
}

/** The link or image text and target starting `s`, inline or by reference. */
function linkAt(s: string, refs: Refs): { text: string; href: string; len: number } | undefined {
  const m = LINK.exec(s);
  if (m) return { text: m[1] ?? "", href: literal(m[2] ?? ""), len: m[0].length };
  // [text][label], [text][] and [label] point where the label's definition does.
  const r = REF.exec(s);
  const href = r ? refs.get(labelKey(r[2] || r[1] || "")) : undefined;
  return r && href !== undefined
    ? { text: r[1] ?? "", href: literal(href), len: r[0].length }
    : undefined;
}

/** The inline element starting at `i`, if one does. */
function inlineAt(scan: Scan, i: number): { node: Inline; len: number } | undefined {
  const { s, refs } = scan;
  const ch = s[i];
  if (ch === "`") {
    const end = codeSpanEnd(s, i, scan.runs);
    if (end < 0) return undefined;
    const n = runLength(s, i);
    const code = s.slice(i + n, end - n);
    const trim = code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim();
    return { node: { t: "code", s: trim ? code.slice(1, -1) : code }, len: end - i };
  }
  if (ch === "[" || (ch === "!" && s[i + 1] === "[")) {
    const link = linkAt(s.slice(i), refs);
    if (!link || (ch === "[" && !scan.links)) return undefined;
    const { text, href } = link;
    const node: Inline =
      ch === "!"
        ? { t: "img", src: href, alt: plain(inline(text, refs, false)) }
        : { t: "link", href, c: inline(text, refs, false) };
    return { node, len: link.len };
  }
  if (ch === "<") {
    const m = scan.links ? AUTOLINK.exec(s.slice(i)) : null;
    const href = m?.[1] ?? "";
    return m
      ? { node: { t: "link", href, c: [{ t: "text", s: href }] }, len: m[0].length }
      : undefined;
  }
  if (ch === "h" || ch === "H") {
    const n = scan.links && URL_PREV.test(s[i - 1] ?? "") ? bareUrlLength(s, i) : 0;
    const href = s.slice(i, i + n);
    return n ? { node: { t: "link", href, c: [{ t: "text", s: href }] }, len: n } : undefined;
  }
  // Underscores inside a word (snake_case) are text, as in GitHub's renderer.
  if (ch === "_" && WORD.test(s[i - 1] ?? "")) return undefined;
  if (ch === "*" || ch === "_") return emphasisAt(scan, i);
  return undefined;
}

/**
 * Inline Markdown: code spans, links, images, autolinks, bold, italic, escapes, entities, hard
 * breaks. Code spans and links bind before emphasis; `links` is false inside a link's text.
 */
export function inline(s: string, refs: Refs = NO_REFS, links = true): Inline[] {
  const scan = scanOf(s, refs, links);
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
    if (ch === "&") {
      ENTITY.lastIndex = i;
      const entity = ENTITY.exec(s)?.[0];
      const decoded = entity && decode(entity);
      if (entity && decoded) {
        text += decoded;
        i += entity.length;
        continue;
      }
    }
    const found = "`[!<*_hH".includes(ch) ? inlineAt(scan, i) : undefined;
    if (found) {
      push(found.node);
      i += found.len;
    } else {
      // Backticks that close no span are text as a whole run, so a shorter span cannot start inside.
      const n = ch === "`" ? runLength(s, i) : 1;
      text += s.slice(i, i + n);
      i += n;
    }
  }
  if (text) out.push({ t: "text", s: text });
  return out;
}

/**
 * `s` cut at its code spans, found the way inline() finds them: text, code, text, ..., text.
 * The code pieces keep their backticks.
 */
export function splitCode(s: string): string[] {
  const runs = backtickRuns(s);
  const pieces: string[] = [];
  let text = "";
  for (let i = 0; i < s.length; ) {
    const end = s[i] === "`" ? codeSpanEnd(s, i, runs) : -1;
    if (end >= 0) {
      pieces.push(text, s.slice(i, end));
      text = "";
      i = end;
      continue;
    }
    // An escaped backtick opens no span, and neither does part of an unmatched run.
    let step = 1;
    if (s[i] === "\\" && PUNCT.test(s[i + 1] ?? "")) step = 2;
    else if (s[i] === "`") step = runLength(s, i);
    text += s.slice(i, i + step);
    i += step;
  }
  pieces.push(text);
  return pieces;
}

/** The source text of `s` between its code spans. */
export const outsideCode = (s: string): string[] => splitCode(s).filter((_, k) => k % 2 === 0);

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
