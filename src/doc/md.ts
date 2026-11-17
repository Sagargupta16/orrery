// Markdown out: each marker line or `orrery` fence becomes its image and caption, with the figure
// files beside it, and relative link and image targets still reach their files from the new folder.
import { relative, resolve } from "node:path";
import type { DocFigure } from "./figures.ts";
import { splitCode } from "./inline.ts";
import type { ParsedDoc } from "./markdown.ts";

const mdEscape = (s: string) => s.replace(/([\\`*_[\]<>])/g, "\\$1");
const attr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** An inline link or image target: the part after `](`. */
const INLINE_TARGET = /(\]\(\s*<?)([^\s<>()]*(?:\([^\s()]*\)[^\s<>()]*)*)/g;
/** A link reference definition's target. */
const DEF_TARGET = /^( {0,3}\[(?!\^)(?:[^[\]\\]|\\.)+\]:[ \t]*<?)([^\s<>]+)/;

/** A relative target written for the source's folder, rewritten for the output's folder. */
function moveTarget(target: string, from: string, to: string): string {
  if (!target || /^(?:[a-z][a-z\d+.-]*:|[/\\#])/i.test(target)) return target;
  const cut = target.search(/[?#]/);
  const path = cut < 0 ? target : target.slice(0, cut);
  const moved = relative(to, resolve(from, path)).replaceAll("\\", "/") || ".";
  return moved + (cut < 0 ? "" : target.slice(cut));
}

/** The line with its relative targets moved; code spans keep theirs. */
function moveTargets(line: string, from: string, to: string): string {
  const def = DEF_TARGET.exec(line);
  if (def) return `${def[1]}${moveTarget(def[2] ?? "", from, to)}${line.slice(def[0].length)}`;
  return splitCode(line)
    .map((piece, k) =>
      k % 2 ? piece : piece.replace(INLINE_TARGET, (_, open, t) => open + moveTarget(t, from, to)),
    )
    .join("");
}

/**
 * The source with each figure replaced by its image and caption, and the figure files. `from` is
 * the source's folder and `to` the output's; relative targets are rewritten when they differ.
 */
export function renderDocMarkdown(
  text: string,
  doc: ParsedDoc,
  figures: Map<number, DocFigure>,
  from = "",
  to = from,
): { text: string; files: [string, string | Uint8Array][]; figures: number } {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines: (string | undefined)[] = text.split(/\r?\n/);
  const files: [string, string | Uint8Array][] = [];
  const refs: string[] = [];
  if (resolve(from) !== resolve(to)) {
    const code = new Set(doc.code);
    for (const [k, line] of lines.entries())
      if (line !== undefined && !code.has(k)) lines[k] = moveTargets(line, from, to);
  }
  for (const m of doc.markers) {
    const f = figures.get(m.n);
    if (!f?.svg || !f.png) continue;
    const stem = `figures/${String(m.n).padStart(2, "0")}-${f.stem}`;
    const caption = mdEscape(f.caption);
    // theme=both: GitHub and most Markdown viewers pick the picture by the reader's color scheme.
    const ref = f.both
      ? `<picture><source media="(prefers-color-scheme: dark)" srcset="${stem}-dark.svg"><img src="${stem}.svg" alt="${attr(f.alt)}"></picture>`
      : `![${caption}](${stem}.svg)`;
    lines[m.line] = `${ref}${eol}${eol}*Figure ${m.n}: ${caption}*`;
    // A fence's spec lines go with it.
    for (let k = m.line + 1; k <= (m.fence?.end ?? m.line); k++) lines[k] = undefined;
    if (f.both) files.push([`${stem}.svg`, f.both.light], [`${stem}-dark.svg`, f.both.dark]);
    else files.push([`${stem}.svg`, f.svg]);
    files.push([`${stem}.png`, f.png]);
    refs.push(ref);
  }
  const out = lines.filter((l) => l !== undefined).join(eol);
  return { text: out, files, figures: refs.filter((r) => out.includes(r)).length };
}
