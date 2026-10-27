import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fontsDir } from "./paths.ts";
import type { TextBlock } from "./types.ts";

interface Metrics {
  unitsPerEm: number;
  weights: Record<string, string>;
}

type WidthTable = { widths: Map<number, number>; fallback: number };

let tables: Record<number, WidthTable> | undefined;
let unitsPerEm = 2048;

function load(): Record<number, WidthTable> {
  if (tables) return tables;
  const metrics = JSON.parse(readFileSync(join(fontsDir, "metrics.json"), "utf8")) as Metrics;
  unitsPerEm = metrics.unitsPerEm;
  tables = {};
  for (const [weight, packed] of Object.entries(metrics.weights)) {
    const widths = new Map<number, number>();
    let cp = -1;
    for (const part of packed.split(",")) {
      const colon = part.indexOf(":");
      if (colon >= 0) {
        cp = Number(part.slice(0, colon));
        widths.set(cp, Number(part.slice(colon + 1)));
      } else {
        cp += 1;
        widths.set(cp, Number(part));
      }
    }
    // Glyphs the font lacks (CJK, emoji) are roughly square; measure them at 1em.
    tables[Number(weight)] = { widths, fallback: unitsPerEm };
  }
  return tables;
}

/** Width in px of one line of text set in Inter at `size` px. */
export function measure(text: string, size: number, weight: 400 | 600 = 400): number {
  const table = load()[weight] ?? load()[400];
  if (!table) return text.length * size * 0.6;
  let units = 0;
  for (const ch of text) units += table.widths.get(ch.codePointAt(0) ?? 32) ?? table.fallback;
  return (units / unitsPerEm) * size;
}

/** Greedy word wrap; words longer than the line are broken at character boundaries. */
export function wrap(
  text: string,
  size: number,
  maxWidth: number,
  weight: 400 | 600 = 400,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    // Split at breaking whitespace only: a no-break space (U+00A0, U+2007, U+202F) joins its words.
    const words = paragraph.split(/[^\S\u00a0\u2007\u202f]+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size, weight) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word, size, weight) <= maxWidth) {
        line = word;
        continue;
      }
      // "HorizontalPodAutoscaler" -> "HorizontalPod" + "Autoscaler"; "cross-region" at the hyphen.
      const pieces = word.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=-)/);
      if (pieces.length > 1 && pieces.every((x) => measure(x, size, weight) <= maxWidth)) {
        let part = "";
        for (const piece of pieces) {
          if (part && measure(part + piece, size, weight) > maxWidth) {
            lines.push(part);
            part = piece;
          } else part += piece;
        }
        line = part;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        if (measure(chunk + ch, size, weight) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    if (line || !words.length) lines.push(line);
  }
  return lines;
}

export function textBlock(
  text: string,
  size: number,
  maxWidth: number,
  weight: 400 | 600 = 400,
  lineHeight = 1.3,
): TextBlock {
  const lines = text ? wrap(text, size, maxWidth, weight) : [];
  const lead = Math.round(size * lineHeight * 10) / 10;
  const width = Math.max(0, ...lines.map((l) => measure(l, size, weight)));
  return { lines, size, weight, lead, width, height: lines.length ? lines.length * lead : 0 };
}
