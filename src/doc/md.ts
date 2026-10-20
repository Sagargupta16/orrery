// Markdown out: each marker line becomes its image and caption, with the figure files beside it.
import type { DocFigure } from "./figures.ts";
import type { ParsedDoc } from "./markdown.ts";

const mdEscape = (s: string) => s.replace(/([\\`*_[\]<>])/g, "\\$1");

/** The source with each marker line replaced by its image and caption, and the figure files. */
export function renderDocMarkdown(
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
