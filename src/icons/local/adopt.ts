// `orrery icons adopt`: someone's SVG rebuilt as clean paths fitted to the 24 grid.

import { type Drawing, drawingOf, partBox } from "./drawing.ts";
import { type Bad, badFor } from "./errors.ts";
import { type Box, type Mat, type Sub, transformSub, union } from "./geometry.ts";
import { normalizeColor } from "./paint.ts";
import { sanitize } from "./sanitize.ts";
import { escAttr, parseXml } from "./xml.ts";

const fmt = (x: number) => {
  const v = Math.round(x * 100) / 100;
  return Object.is(v, -0) ? "0" : String(v);
};

function pathData(subs: Sub[], m: Mat): string {
  const out: string[] = [];
  for (const raw of subs) {
    if (!raw.segs.length) continue;
    const s = transformSub(raw, m);
    out.push(`M${fmt(s.from[0])} ${fmt(s.from[1])}`);
    let p = s.from;
    s.segs.forEach((g, i) => {
      const last = i === s.segs.length - 1;
      if (g.c) out.push(`C${[...g.c[0], ...g.c[1], ...g.to].map(fmt).join(" ")}`);
      else if (
        last &&
        s.closed &&
        fmt(g.to[0]) === fmt(s.from[0]) &&
        fmt(g.to[1]) === fmt(s.from[1])
      ) {
        // Z draws the closing line.
      } else if (fmt(g.to[0]) === fmt(p[0]) && fmt(g.to[1]) === fmt(p[1]) && s.segs.length > 1) {
        // Gone after rounding; a lone zero-length segment stays, it is a round-capped dot.
      } else if (fmt(g.to[1]) === fmt(p[1])) out.push(`H${fmt(g.to[0])}`);
      else if (fmt(g.to[0]) === fmt(p[0])) out.push(`V${fmt(g.to[1])}`);
      else out.push(`L${fmt(g.to[0])} ${fmt(g.to[1])}`);
      p = g.to;
    });
    if (s.closed) out.push("Z");
  }
  return out.join("");
}

export interface Adopted {
  svg: string;
  notes: string[];
}

/** One rebuilt path: its data on the 24 grid and the paint attributes it needs. */
interface Row {
  d: string;
  a: Record<string, string>;
}

/** Text, gradients, patterns, masks and filters have no flat path form, so adopt refuses them. */
function refuseUnadoptable(d: Drawing, bad: Bad): void {
  if (d.texts)
    throw bad(
      `has ${d.texts} text element(s), which cannot be adopted`,
      "draw the identity as geometry (IC05), delete the <text> and run adopt again",
    );
  for (const p of d.parts) {
    for (const v of [p.filled ? p.fill : undefined, p.stroked ? p.stroke : undefined])
      if (v && /^\s*url\(/i.test(v))
        throw bad(
          "paints with a gradient or pattern",
          "repaint it in one flat color (IC04), then adopt it",
        );
    if (p.effects.some((e) => e !== "clip-path"))
      throw bad(
        `uses ${p.effects.join(" and ")}`,
        "flatten the effect in the editor or rebuild the shape (IC09)",
      );
  }
}

/** The scale `k` and the matrix that fit the painted bounds into the 20 unit live area. */
function fitToSafeArea(d: Drawing, bad: Bad): { k: number; fit: Mat } {
  let box: Box | undefined;
  for (const p of d.parts) {
    const b = partBox(p);
    if (b) box = union(box, b);
  }
  if (!box) throw bad("draws nothing visible", "draw two to six shapes on a 24 grid (IC06)");
  const side = Math.max(box[2] - box[0], box[3] - box[1]);
  if (!(side > 0)) throw bad("draws nothing visible", "draw two to six shapes on a 24 grid (IC06)");
  // The painted bounds fill the 20 unit live area, centered.
  const k = 20 / side;
  return {
    k,
    fit: [k, 0, 0, k, 12 - (k * (box[0] + box[2])) / 2, 12 - (k * (box[1] + box[3])) / 2],
  };
}

/** The colors the drawing paints with, currentColor one of them. */
function colorsOf(d: Drawing): Set<string> {
  const colors = new Set<string>();
  for (const p of d.parts) {
    if (p.filled) colors.add(normalizeColor(p.fill ?? "#000000") ?? "");
    if (p.stroked) colors.add(normalizeColor(p.stroke ?? "") ?? "");
  }
  return colors;
}

function pathRows(d: Drawing, k: number, fit: Mat, mono: boolean): Row[] {
  const paint = (v: string | undefined) =>
    mono ? "currentColor" : (normalizeColor(v ?? "#000000") ?? "none");
  return d.parts.map((p) => {
    const a: Record<string, string> = {
      fill: p.filled ? paint(p.fill) : "none",
      stroke: p.stroked ? paint(p.stroke) : "none",
    };
    if (p.stroked) {
      a["stroke-width"] = fmt(p.width * k);
      a["stroke-linecap"] = p.cap;
      a["stroke-linejoin"] = p.join;
      if (p.miter && p.join === "miter") a["stroke-miterlimit"] = p.miter;
      if (p.strokeOpacity) a["stroke-opacity"] = p.strokeOpacity;
      // Dashes scale with the drawing.
      if (p.dash) a["stroke-dasharray"] = p.dash.map((v) => fmt(v * k)).join(" ");
      if (p.dash && p.dashOffset) a["stroke-dashoffset"] = fmt(p.dashOffset * k);
    }
    if (p.filled && p.rule === "evenodd") a["fill-rule"] = "evenodd";
    if (p.filled && p.fillOpacity) a["fill-opacity"] = p.fillOpacity;
    if (p.opacity < 1) a.opacity = fmt(p.opacity);
    return { d: pathData(p.subs, fit), a };
  });
}

/**
 * Attributes every path shares move to the root; stroke details count as shared when only
 * stroked paths carry them.
 */
function sharedAttrs(rows: Row[]): Record<string, string> {
  const shared: Record<string, string> = {};
  const keys = new Set(rows.flatMap((r) => Object.keys(r.a)));
  for (const key of keys) {
    const strokeOnly = key.startsWith("stroke-");
    const carriers = rows.filter((r) => !strokeOnly || r.a.stroke !== "none");
    const values = new Set(carriers.map((r) => r.a[key]));
    if (carriers.length && values.size === 1 && !values.has(undefined))
      shared[key] = [...values][0] ?? "";
  }
  // stroke="none" is the default; neither the root nor a path needs to say it.
  if (shared.stroke === "none") delete shared.stroke;
  return shared;
}

function svgOf(rows: Row[], shared: Record<string, string>): string {
  const attrs = (a: Record<string, string>) =>
    Object.entries(a)
      .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
      .join("");
  const rootAttrs = attrs(shared);
  const body = rows
    .filter((r) => r.d)
    .map((r) => {
      const own = Object.fromEntries(
        Object.entries(r.a).filter(
          ([k, v]) =>
            shared[k] !== v &&
            !(k === "stroke" && v === "none" && shared.stroke === undefined) &&
            !(k.startsWith("stroke-") && r.a.stroke === "none"),
        ),
      );
      return `  <path d="${r.d}"${attrs(own)}/>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${rootAttrs}>\n${body}\n</svg>\n`;
}

/**
 * Someone's SVG as a clean local icon: metadata, comments, editor attributes and styles gone,
 * every shape a path on the 24 grid, the drawing fitted into the 2 px safe area, one-color art
 * painted with currentColor. It does not redraw anything: check says what still needs rebuilding.
 */
export function adoptIcon(text: string, file: string): Adopted {
  const bad = badFor(file);
  const root = sanitize(parseXml(text, bad), bad, true);
  const d = drawingOf(root, bad);
  const notes: string[] = [];
  refuseUnadoptable(d, bad);
  if (d.parts.some((p) => p.effects.includes("clip-path")))
    notes.push("dropped clip paths (editors frame drawings with one); look at the sheet");
  const { k, fit } = fitToSafeArea(d, bad);
  if (Math.abs(k - 1) > 0.005)
    notes.push(`scaled by ${fmt(k)} so the drawing fills the 2 to 22 safe area`);
  const colors = colorsOf(d);
  const mono = colors.size <= 1;
  if (mono) notes.push("one color: painted with currentColor");
  else notes.push(`${colors.size} colors kept; IC04 asks for one, so rebuild it in currentColor`);
  const rows = pathRows(d, k, fit, mono);
  const svg = svgOf(rows, sharedAttrs(rows));
  notes.unshift(`${d.parts.length} shape(s) rebuilt as paths on the 24 grid`);
  return { svg, notes };
}
