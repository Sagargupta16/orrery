// A sequence diagram of the numbered steps: one lifeline per node the steps visit, left to right
// in the order the steps first reach them, one message per step edge in step order (the longest
// path when there are no steps), drawn in the scene's theme and skin.
import { renderIcon } from "../icons/index.ts";
import { textBlock } from "../text.ts";
import { FONT_STACK, type Theme, tokensFor } from "../themes.ts";
import type { Box, Model, Scene, SceneEdge } from "../types.ts";
import { type Ctx, fill, rect, stroke } from "./stage/ctx.ts";
import { canvas } from "./stage/draw-backdrop.ts";
import { glyph, iconInk } from "./stage/filters.ts";
import {
  DIGIT,
  EDGE,
  type Face,
  LABEL,
  MONO,
  mono,
  monoWidth,
  SUBTITLE,
  TITLE,
} from "./stage/text.ts";
import { ends, longestPath } from "./stage/walks.ts";
import { esc, n, SYMBOL_ID } from "./svg.ts";

const PAD = 28;
const ICON = 40;
/** Room between two heads, and the least room between two lifelines. */
const HEAD_GAP = 32;
const MIN_SPAN = 140;
const BADGE = 11;
const LABEL_MAX = 132;
const MESSAGE_MAX = 220;
/** How far a message to its own lifeline loops out, and how tall the loop is. */
const LOOP_W = 36;
const LOOP_H = 22;

// ---------------------------------------------------------------- what the steps say

interface Message {
  id: string;
  from: string;
  to: string;
  label: string;
  step: number;
  edge: SceneEdge;
}

/** The step edges in step order (spec order breaks ties), else the longest path numbered 1, 2, ... */
function messages(scene: Scene, model: Model): Message[] {
  const stepped = scene.edges
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.step !== undefined)
    .sort((a, b) => (a.e.step ?? 0) - (b.e.step ?? 0) || a.i - b.i)
    .map(({ e }) => e);
  const path = stepped.length ? stepped : longestPath(scene.edges);
  const labels = new Map(model.edges.map((e) => [e.id, e.label]));
  return path.map((e, i) => {
    const [from, to] = ends(e);
    const label = labels.get(e.id) ?? e.label?.lines.join(" ") ?? "";
    return { id: e.id, from, to, label, step: e.step ?? i + 1, edge: e };
  });
}

interface Who {
  id: string;
  label: string;
  icon?: string;
  color?: string;
}

/** Each node or group the messages visit, in the order they first appear. */
function participants(scene: Scene, model: Model, list: Message[]): Who[] {
  const out: Who[] = [];
  for (const id of list.flatMap((m) => [m.from, m.to])) {
    if (out.some((w) => w.id === id)) continue;
    const nd = scene.nodes.find((x) => x.id === id);
    const g = scene.groups.find((x) => x.id === id);
    const label =
      model.nodes.find((x) => x.id === id)?.label ??
      model.groups.find((x) => x.id === id)?.label ??
      id;
    out.push({ id, label: label || id, icon: nd?.icon ?? g?.icon, color: nd?.color });
  }
  return out;
}

// ---------------------------------------------------------------- text in either skin

interface Block {
  lines: string[];
  size: number;
  weight: 400 | 600;
  lead: number;
  width: number;
  height: number;
}

type Role = "title" | "subtitle" | "label" | "message";

// Classic sets Inter at the sizes layout uses; stage sets its mono faces.
const INTER: Record<Role, [number, 400 | 600, number]> = {
  title: [20, 600, 1.25],
  subtitle: [13, 400, 1.3],
  label: [13, 600, 1.3],
  message: [11.5, 400, 1.3],
};
const FACES: Record<Role, Face> = { title: TITLE, subtitle: SUBTITLE, label: LABEL, message: EDGE };

/** Greedy word wrap in a mono face; a word longer than the line keeps a line of its own. */
function monoBlock(text: string, f: Face, max: number): Block {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && monoWidth(next, f) > max) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  const lead = Math.round(f.size * 1.5 * 10) / 10;
  const width = Math.max(0, ...lines.map((l) => monoWidth(l, f)));
  return { lines, size: f.size, weight: 400, lead, width, height: lines.length * lead };
}

function measure(stage: boolean, text: string, role: Role, max: number): Block {
  if (stage) return monoBlock(text, FACES[role], max);
  const [size, weight, line] = INTER[role];
  const b = textBlock(text, size, max, weight, line);
  return { lines: b.lines, size, weight, lead: b.lead, width: b.width, height: b.height };
}

// Inter's vertical metrics, as the SVG renderer sets them.
const ASCENT = 0.96875;
const DESCENT = 0.2412;

function interText(b: Block, x: number, y: number, color: string, anchor: "start" | "middle") {
  if (!b.lines.length) return "";
  const first = y + (b.lead - b.size * (ASCENT + DESCENT)) / 2 + b.size * ASCENT;
  const spans = b.lines
    .map((l, i) => `<tspan x="${n(x)}" y="${n(first + i * b.lead)}">${esc(l)}</tspan>`)
    .join("");
  const weight = b.weight === 600 ? ` font-weight="600"` : "";
  const middle = anchor === "middle" ? ` text-anchor="middle"` : "";
  return `<text font-size="${n(b.size)}"${weight} fill="${color}"${middle}>${spans}</text>`;
}

// ---------------------------------------------------------------- the paint of either skin

interface Paint {
  t: Theme;
  stage: boolean;
  defs: string[];
  font: string;
  text(
    b: Block,
    role: Role,
    x: number,
    y: number,
    color: string,
    anchor?: "start" | "middle",
  ): string;
  /** An icon in its box: drawn as is (classic) or as a glyph on an ink tile (stage). */
  icon(id: string, box: Box, color?: string): string;
  /** A head with no icon: a card around the label. */
  card(box: Box, color?: string): string;
  backdrop(): string;
  /** Stroke attributes for message lines, arrowheads and lifelines. */
  wire(width: number, color?: string): string;
  tip(width: number, color?: string): string;
  /** Fill attributes for a filled arrowhead. */
  solid(color?: string): string;
  life: string;
  chip: string;
}

function paintFor(scene: Scene, W: number, H: number, prefix: string): Paint {
  const t = tokensFor(scene);
  const k = t.stage;
  const defs: string[] = [];
  const symbols = new Map<string, string>();
  const canvasColor =
    scene.background && scene.background !== "transparent" ? scene.background : t.background;
  if (scene.skin === "stage" && k) {
    const h = 1 / Math.min(1, 880 / Math.max(1, W));
    const ctx: Ctx = {
      t,
      k,
      prefix,
      scene: { ...scene, width: W, height: H },
      h,
      story: {
        animated: false,
        cycle: 0,
        hold: 0,
        gone: 0,
        runs: new Map(),
        side: new Map(),
        badges: new Map(),
        focus: { x: W / 2, y: H / 3 },
      },
      sizes: { label: LABEL.size, note: SUBTITLE.size, edge: EDGE.size },
      symbols,
      filters: new Map(),
      defs,
    };
    const tile = `${fill(k.tile)} ${stroke(k.line, k.frame, h)}`;
    return {
      t,
      stage: true,
      defs,
      font: MONO,
      text: (b, role, x, y, color, anchor = "middle") =>
        mono(b.lines, FACES[role], b.size, { x, y, lead: b.lead }, color, anchor),
      icon: (id, box) =>
        rect(box, 0.17 * Math.min(box.w, box.h), tile) + glyph(ctx, id, box, iconInk(ctx, id)),
      card: (box) => rect(box, 6, tile),
      backdrop: () => canvas(ctx),
      wire: (width) => stroke(k.line, k.wire, width * h),
      tip: (width) => stroke(k.line, k.arrow, width * h),
      solid: () => fill(k.line, k.arrow),
      life: stroke(k.line, k.frame, h),
      chip: `${fill(k.tile)} ${stroke(k.line, k.hair, h)}`,
    };
  }
  return {
    t,
    stage: false,
    defs,
    font: FONT_STACK,
    text: (b, _role, x, y, color, anchor = "middle") => interText(b, x, y, color, anchor),
    icon: (id, box, color) => {
      const r = renderIcon(id, SYMBOL_ID, {
        theme: t.name,
        background: canvasColor,
        ink: t.text,
        color,
      });
      const viewBox = r.viewBox.join(" ");
      const key = `${viewBox}|${r.body}`;
      let ref = symbols.get(key);
      if (!ref) {
        ref = `${prefix}s${symbols.size + 1}`;
        symbols.set(key, ref);
        defs.push(
          `<symbol id="${ref}" viewBox="${viewBox}" overflow="visible">${r.body.replaceAll(`${SYMBOL_ID}-`, `${ref}-`)}</symbol>`,
        );
      }
      return `<use href="#${ref}" x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}"/>`;
    },
    card: (box, color) =>
      rect(box, 8, `fill="${t.surface}" stroke="${color ?? t.border}" stroke-width="1"`),
    backdrop: () =>
      scene.background === "transparent"
        ? ""
        : `<rect width="${n(W)}" height="${n(H)}" fill="${canvasColor}"/>`,
    wire: (width, color) => `stroke="${color ?? t.edge}" stroke-width="${n(width)}"`,
    tip: (width, color) => `stroke="${color ?? t.edge}" stroke-width="${n(width)}"`,
    solid: (color) => `fill="${color ?? t.edge}"`,
    life: `stroke="${t.border}" stroke-width="1"`,
    chip: `fill="${canvasColor}" fill-opacity="0.92"`,
  };
}

// ---------------------------------------------------------------- layout

interface Head {
  who: Who;
  label: Block;
  w: number;
  h: number;
}

interface Row {
  m: Message;
  label: Block;
  /** Where the message line runs. */
  y: number;
}

/** Widens the lifelines between `i` and `j` (and moves the ones after) to `span` apart. */
function widen(centers: number[], i: number, j: number, span: number) {
  const short = span - ((centers[j] ?? 0) - (centers[i] ?? 0));
  if (short <= 0) return;
  for (let k = i + 1; k < centers.length; k++)
    centers[k] = (centers[k] ?? 0) + (short * Math.min(k - i, j - i)) / (j - i);
}

/** Line and arrowhead of one message, a step badge at its start, and its label. */
function message(
  p: Paint,
  prefix: string,
  row: Row,
  x0: number,
  x1: number,
  back: boolean,
  open: boolean,
) {
  const { t } = p;
  const e = row.m.edge;
  // Line weights of each skin's own edges: the stage draws hairlines.
  const thick = e.line === "thick";
  const width = p.stage ? (thick ? 1.8 : 1) : thick ? 2.5 : 1.5;
  const color = p.stage ? undefined : e.color;
  const dash = back ? ` stroke-dasharray="${p.stage ? "4 3" : "6 4"}"` : "";
  const y = row.y;
  const parts: string[] = [];
  const self = row.m.from === row.m.to;
  const len = open ? 9 : 10;
  const half = open ? 4.5 : 5;
  // The arrow points from `x1` back along the line, so its tip touches the lifeline.
  const dir = self ? -1 : x1 >= x0 ? 1 : -1;
  const tipY = self ? y + LOOP_H : y;
  const base = x1 - dir * len;
  const stop = open ? x1 - dir * (width / 2) : base + dir * 1.5;
  const both = e.arrow === "both" && !self;
  const begin = both ? x0 + dir * (open ? width / 2 : len - 1.5) : x0;
  const d = self
    ? `M${n(x0)} ${n(y)} H${n(x0 + LOOP_W)} V${n(tipY)} H${n(stop)}`
    : `M${n(begin)} ${n(y)} H${n(stop)}`;
  parts.push(`<path d="${d}" fill="none" ${p.wire(width, color)} stroke-linejoin="round"${dash}/>`);
  const arrow = (tip: number, toward: number) => {
    const b = tip - toward * len;
    return open
      ? `<path d="M${n(b)} ${n(tipY - half)} L${n(tip)} ${n(tipY)} L${n(b)} ${n(tipY + half)}" fill="none" ${p.tip(width, color)} stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="M${n(tip)} ${n(tipY)} L${n(b)} ${n(tipY - half)} L${n(b + toward * 1.5)} ${n(tipY)} L${n(b)} ${n(tipY + half)} Z" ${p.solid(color)}/>`;
  };
  parts.push(arrow(x1, dir));
  if (both) parts.push(arrow(x0, -dir));
  // The badge sits on the line where the message leaves, as numbered callouts do.
  // A two-way message has an arrowhead there too, so the badge steps past it.
  const bx = self ? x0 + LOOP_W / 2 : x0 + dir * (BADGE + 4 + (both ? len : 0));
  parts.push(`<circle cx="${n(bx)}" cy="${n(y)}" r="${BADGE}" fill="${t.stepFill}"/>`);
  const digit = String(row.m.step);
  parts.push(
    p.stage
      ? mono(
          [digit],
          DIGIT,
          Math.min(DIGIT.size, BADGE),
          { x: bx, y: y - BADGE, lead: 2 * BADGE },
          t.stepText,
          "middle",
        )
      : `<text x="${n(bx)}" y="${n(y + 4.5)}" font-size="13" font-weight="700" fill="${t.stepText}" text-anchor="middle">${esc(digit)}</text>`,
  );
  if (row.label.lines.length) {
    const b = row.label;
    const cx = self ? x0 + LOOP_W + 10 + b.width / 2 : (x0 + x1) / 2;
    const top = self ? y + LOOP_H / 2 - b.height / 2 : y - BADGE - 4 - b.height;
    parts.push(
      rect({ x: cx - b.width / 2 - 4, y: top - 1, w: b.width + 8, h: b.height + 2 }, 4, p.chip),
    );
    parts.push(p.text(b, "message", cx, top, t.edgeLabel));
  }
  return `<g id="${prefix}sq-${row.m.id}">${parts.join("")}</g>`;
}

export function renderSequence(
  scene: Scene,
  model: Model,
  opts: { idPrefix?: string } = {},
): string {
  const prefix = opts.idPrefix ? `${opts.idPrefix.replace(/[^A-Za-z0-9_-]/g, "")}-` : "";
  const stage = scene.skin === "stage";
  const list = messages(scene, model);
  const heads: Head[] = participants(scene, model, list).map((who) => {
    const label = measure(stage, who.label, "label", LABEL_MAX);
    return who.icon
      ? { who, label, w: Math.max(ICON, label.width), h: ICON + 6 + label.height }
      : { who, label, w: label.width + 24, h: label.height + 16 };
  });
  const column = new Map(heads.map((hd, i) => [hd.who.id, i]));
  // Lifelines: far enough apart for their heads, then for every message label between them.
  const centers: number[] = [];
  heads.forEach((hd, i) => {
    const prev = heads[i - 1];
    const at = prev
      ? (centers[i - 1] ?? 0) + Math.max(MIN_SPAN, (prev.w + hd.w) / 2 + HEAD_GAP)
      : PAD + hd.w / 2;
    centers.push(at);
  });
  const rows: Row[] = [];
  let right = 0;
  for (const m of list) {
    const label = measure(stage, m.label, "message", MESSAGE_MAX);
    const a = column.get(m.from) ?? 0;
    const b = column.get(m.to) ?? 0;
    const room = label.width + 2 * (2 * BADGE + 8);
    if (a === b) {
      const need = LOOP_W + 10 + label.width + HEAD_GAP;
      if (a + 1 < centers.length) widen(centers, a, a + 1, need);
      else right = Math.max(right, need - HEAD_GAP + PAD);
    } else widen(centers, Math.min(a, b), Math.max(a, b), room);
    rows.push({ m, label, y: 0 });
  }
  const last = heads.length - 1;
  const lastCenter = centers[last] ?? PAD;
  const columnsRight = Math.max(lastCenter + (heads[last]?.w ?? 0) / 2 + PAD, lastCenter + right);
  // Titles wrap to the columns, and widen the canvas only as far as a readable line needs.
  const titleMax = Math.max(columnsRight - 2 * PAD, 420);
  const title = model.title ? measure(stage, model.title, "title", titleMax) : undefined;
  const subtitle = model.subtitle
    ? measure(stage, model.subtitle, "subtitle", titleMax)
    : undefined;
  const W = Math.ceil(
    Math.max(columnsRight, (title?.width ?? 0) + 2 * PAD, (subtitle?.width ?? 0) + 2 * PAD),
  );
  const shift = (W - columnsRight) / 2;
  const xs = centers.map((c) => c + shift);
  let y = PAD;
  const titleY = y;
  if (title) y += title.height + 4;
  const subtitleY = y;
  if (subtitle) y += subtitle.height;
  if (title || subtitle) y += 22;
  const headTop = y;
  const headH = Math.max(0, ...heads.map((hd) => hd.h));
  y = headTop + headH + 24;
  for (const row of rows) {
    if (row.m.from === row.m.to) {
      row.y = y + BADGE;
      y = row.y + Math.max(LOOP_H, row.label.height) + 22;
    } else {
      row.y = y + (row.label.lines.length ? row.label.height + 4 : 0) + BADGE;
      y = row.y + BADGE + 14;
    }
  }
  const bottom = y + 6;
  const H = Math.ceil(bottom + PAD);
  const p = paintFor(scene, W, H, prefix);
  const { t } = p;
  const open = scene.arrowhead === "open";
  const out: string[] = [];
  const titleId = `${prefix}sdw-title`;
  const descId = `${prefix}sdw-desc`;
  const named = (id: string) => heads[column.get(id) ?? -1]?.who.label ?? id;
  const steps = list.map(
    (m) => `${m.step}. ${named(m.from)} to ${named(m.to)}${m.label ? ` (${m.label})` : ""}`,
  );
  const desc = list.length
    ? `Sequence of ${list.some((m) => m.edge.step !== undefined) ? "the numbered steps" : "the longest path"}: ${steps.join("; ")}`
    : "No edges to put in sequence";
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${titleId} ${descId}" font-family="${esc(p.font)}">`,
  );
  out.push(
    `<title id="${titleId}">${esc(`${model.title ?? "Architecture diagram"}: sequence`)}</title>`,
  );
  out.push(`<desc id="${descId}">${esc(desc)}</desc>`);
  const defsAt = out.length;
  out.push(p.backdrop());
  const ink = stage && t.stage ? t.stage.header : t.text;
  if (title) out.push(p.text(title, "title", PAD, titleY, ink, "start"));
  if (subtitle) out.push(p.text(subtitle, "subtitle", PAD, subtitleY, t.muted, "start"));
  heads.forEach((hd, i) => {
    const x = xs[i] ?? 0;
    const parts: string[] = [];
    parts.push(
      `<path d="M${n(x)} ${n(headTop + hd.h + 6)} V${n(bottom)}" fill="none" ${p.life} stroke-dasharray="4 4"/>`,
    );
    if (hd.who.icon) {
      const box = { x: x - ICON / 2, y: headTop, w: ICON, h: ICON };
      parts.push(p.icon(hd.who.icon, box, hd.who.color));
      parts.push(p.text(hd.label, "label", x, headTop + ICON + 6, t.text));
    } else {
      parts.push(p.card({ x: x - hd.w / 2, y: headTop, w: hd.w, h: hd.h }, hd.who.color));
      parts.push(p.text(hd.label, "label", x, headTop + 8, t.text));
    }
    out.push(`<g id="${prefix}sq-l-${hd.who.id}">${parts.join("")}</g>`);
  });
  for (const row of rows) {
    const a = column.get(row.m.from) ?? 0;
    const b = column.get(row.m.to) ?? 0;
    out.push(message(p, prefix, row, xs[a] ?? 0, xs[b] ?? 0, b < a, open));
  }
  if (!list.length)
    out.push(
      p.text(
        measure(stage, "No edges to put in sequence", "message", W),
        "message",
        W / 2,
        headTop,
        t.muted,
      ),
    );
  if (p.defs.length) out.splice(defsAt, 0, `<defs>${p.defs.join("")}</defs>`);
  out.push("</svg>");
  return `${out.filter(Boolean).join("\n")}\n`;
}
