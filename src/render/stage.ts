// The stage skin: the owner's portfolio scene language drawn over orrery's layout (classic and
// stage place every box and point the same). A near-black canvas with a hairline grid and one tint
// wash behind the story; ink tiles holding monochrome glyphs; mono caps labels; dim hairline wires
// with open chevrons; no vendor hues.
//
// The motion is one story on one clock: the groups light, then the tiles, then a packet with a
// comet tail rides the numbered edges in step order (else the longest path), lighting each wire
// behind it, and every step badge pops as its packet leaves. At most two other edges run a small
// packet of their own. Everything holds, fades out together and the loop starts again. The still
// frame (PNG, draw.io, animate: none) is the held frame: everything lit, no packets.

import { mixHex } from "../color.ts";
import { type IconTone, iconTone, renderIcon } from "../icons.ts";
import { type StageInk, type Theme, tokensFor } from "../themes.ts";
import type { Box, Point, Scene, SceneEdge, SceneGroup, SceneNode, TextBlock } from "../types.ts";
import {
  edgePath,
  esc,
  FLOW_CSS,
  keyTimes,
  length,
  n,
  type SvgOptions,
  SYMBOL_ID,
  secs,
  shapePath,
  trim,
} from "./svg.ts";

/** Hairlines are one pixel wide at this display width (a README column); wider SVGs draw them wider. */
const DISPLAY = 880;
const MONO =
  "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
/** Geist Mono advances every glyph 0.6 em (scripts/build-fonts.mjs checks it). */
const ADVANCE = 0.6;

interface Ctx {
  t: Theme;
  k: StageInk;
  prefix: string;
  scene: Scene;
  /** One display pixel in scene units. */
  h: number;
  story: Story;
  /** Scene-wide sizes for node and edge labels, so neighbors match. */
  sizes: { label: number; note: number; edge: number };
  symbols: Map<string, string>;
  filters: Map<string, string>;
  defs: string[];
}

const fill = (c: string, a = 1) => `fill="${c}"${a < 1 ? ` fill-opacity="${a}"` : ""}`;
const stroke = (c: string, a: number, w: number) =>
  `stroke="${c}"${a < 1 ? ` stroke-opacity="${a}"` : ""} stroke-width="${n(w)}"`;
const rect = (b: Box, rx: number, paint: string, extra = "") =>
  `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}"${rx ? ` rx="${n(rx)}"` : ""} ${paint}${extra}/>`;

// ---------------------------------------------------------------- text

interface Face {
  size: number;
  weight: 400 | 700;
  caps: boolean;
  /** Letter spacing in em. */
  track: number;
}

const LABEL: Face = { size: 11.5, weight: 700, caps: true, track: 0.08 };
const NOTE: Face = { size: 10, weight: 400, caps: false, track: 0 };
const EDGE: Face = { size: 9.5, weight: 700, caps: true, track: 0.06 };
const HEADER: Face = { size: 11, weight: 700, caps: true, track: 0.1 };
const TITLE: Face = { size: 18, weight: 700, caps: true, track: 0.06 };
const SUBTITLE: Face = { size: 11.5, weight: 400, caps: false, track: 0 };
const KEY: Face = { size: 9.5, weight: 700, caps: true, track: 0.06 };
const DIGIT: Face = { size: 13, weight: 700, caps: true, track: 0 };

const chars = (s: string) => [...s].length;

function monoWidth(s: string, f: Face, size = f.size): number {
  const c = chars(s);
  return c ? size * (c * (ADVANCE + f.track) - f.track) : 0;
}

/** The largest size up to the face's own (and at least `min`) at which every line fits `room`. */
function sizeFor(lines: string[], f: Face, room: number, min = 8): number {
  const widest = Math.max(1, ...lines.map(chars));
  const size = (room + f.size * f.track) / (widest * (ADVANCE + f.track));
  return Math.max(min, Math.floor(Math.min(f.size, size) * 4) / 4);
}

/** One size for a set of fits: the low end, so most labels share it and outliers shrink alone. */
function common(fits: number[], cap: number): number {
  if (!fits.length) return cap;
  const sorted = [...fits].sort((a, b) => a - b);
  return Math.min(cap, sorted[Math.floor(sorted.length * 0.2)] ?? cap);
}

/** Lines of mono text, each centered on the line slot layout measured for it. */
function mono(
  lines: string[],
  f: Face,
  size: number,
  at: { x: number; y: number; lead: number },
  color: string,
  anchor: "start" | "middle",
  extra = "",
): string {
  if (!lines.length) return "";
  const track = f.track * size;
  // text-anchor middle also centers the spacing after the last letter; shift that back.
  const x = at.x + (anchor === "middle" ? track / 2 : 0);
  // Caps sit centered on the slot (cap height 0.71 em); mixed case on its x-height.
  const drop = (f.caps ? 0.355 : 0.33) * size;
  const spans = lines
    .map(
      (line, i) =>
        `<tspan x="${n(x)}" y="${n(at.y + (i + 0.5) * at.lead + drop)}">${esc(f.caps ? line.toUpperCase() : line)}</tspan>`,
    )
    .join("");
  const spacing = track ? ` letter-spacing="${n(track)}"` : "";
  const middle = anchor === "middle" ? ` text-anchor="middle"` : "";
  return `<text font-size="${n(size)}" font-weight="${f.weight}"${spacing} fill="${color}"${middle}${extra}>${spans}</text>`;
}

/** A layout text block redrawn in a stage face, in the box layout gave it. */
function block(
  b: TextBlock,
  box: Box,
  f: Face,
  size: number,
  color: string,
  anchor: "start" | "middle" = "middle",
  extra = "",
): string {
  const lead = b.lines.length ? box.h / b.lines.length : b.lead;
  const x = anchor === "middle" ? box.x + box.w / 2 : box.x;
  return mono(b.lines, f, size, { x, y: box.y, lead }, color, anchor, extra);
}

// ---------------------------------------------------------------- icons

/** How much of its box each tone's artwork fills, so every glyph comes out about the same size. */
const TONE_FIT: Record<IconTone, number> = {
  glyph: 0.86,
  inverse: 0.86,
  two: 0.62,
  shape: 0.58,
  mono: 0.6,
};

// alpha = (luminance - 0.62) * 4.2: white artwork survives, AWS and Kubernetes tile colors (0.56 at
// most) do not, and so do the anti-aliased edges of thin strokes; DARK keeps near-black the same way.
const LIGHT = "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.8929 3.0038 0.3032 0 -2.604";
const DARK = "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.8504 -2.8608 -0.2888 0 2.4";

/** The filter that paints one tone in one color; one per pair, shared by every icon. */
function toneFilter(ctx: Ctx, tone: IconTone, color: string): string {
  const key = `${tone}|${color}`;
  let id = ctx.filters.get(key);
  if (id) return id;
  id = `${ctx.prefix}f${ctx.filters.size + 1}`;
  ctx.filters.set(key, id);
  const flood = `<feFlood flood-color="${color}"/>`;
  const body =
    tone === "glyph"
      ? `<feColorMatrix type="matrix" values="${LIGHT}" result="a"/>${flood}<feComposite in2="a" operator="in"/>`
      : tone === "inverse"
        ? `<feColorMatrix type="matrix" values="${DARK}" result="a"/>${flood}<feComposite in2="a" operator="in"/><feComposite in2="SourceAlpha" operator="in"/>`
        : tone === "two"
          ? `<feColorMatrix type="matrix" values="${LIGHT}" result="a"/><feFlood flood-color="${color}" flood-opacity="0.4"/><feComposite in2="SourceAlpha" operator="in" result="base"/>${flood}<feComposite in2="a" operator="in" result="hi"/><feMerge><feMergeNode in="base"/><feMergeNode in="hi"/></feMerge>`
          : `${flood}<feComposite in2="SourceAlpha" operator="in"/>`;
  ctx.defs.push(
    `<filter id="${id}" x="-0.1" y="-0.1" width="1.2" height="1.2" color-interpolation-filters="sRGB">${body}</filter>`,
  );
  return id;
}

/** An icon in one color, centered in `box`: a shared <symbol>, painted by its tone's filter. */
function glyph(ctx: Ctx, id: string, box: Box, color: string, scale = 1): string {
  const tone = iconTone(id, ctx.t.name);
  const size = Math.min(box.w, box.h) * TONE_FIT[tone] * scale;
  const r = renderIcon(id, SYMBOL_ID, {
    theme: ctx.t.name,
    background: ctx.k.tile,
    ink: color,
    ...(tone === "mono" ? { mono: color } : {}),
  });
  let body = r.body;
  // Line icons (Tabler) draw at the weight of the AWS glyphs: 1.5 display px.
  if (tone === "mono") {
    const weight = (1.5 * ctx.h * r.viewBox[2]) / size;
    body = body.replace(/stroke-width="([\d.]+)"/g, (m, w: string) =>
      Number(w) > weight ? `stroke-width="${n(weight)}"` : m,
    );
  }
  const viewBox = r.viewBox.join(" ");
  const key = `${viewBox}|${body}`;
  let ref = ctx.symbols.get(key);
  if (!ref) {
    ref = `${ctx.prefix}s${ctx.symbols.size + 1}`;
    ctx.symbols.set(key, ref);
    ctx.defs.push(
      `<symbol id="${ref}" viewBox="${viewBox}" overflow="visible">${body.replaceAll(`${SYMBOL_ID}-`, `${ref}-`)}</symbol>`,
    );
  }
  const paint = tone === "mono" ? "" : ` filter="url(#${toneFilter(ctx, tone, color)})"`;
  const x = box.x + (box.w - size) / 2;
  const y = box.y + (box.h - size) / 2;
  return `<use href="#${ref}" x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}"${paint}/>`;
}

// ---------------------------------------------------------------- story

// Seconds. Hops travel at one display speed within bounds, and pause at each node they reach.
const GROUPS_ON = 0.35;
const TILES_ON = 0.7;
const STORY_AT = 1.25;
const SPEED = 320;
const PAUSE = 0.24;
const HOLD_FOR = 0.9;
const RAMP = 0.18;
const FADE = 0.15;
/** Comet tail length in display px. */
const COMET = 26;
/** The lit frame holds until HOLD of the loop and is gone by GONE. */
const HOLD = 0.9;
const GONE = 0.94;
const SIDE_FLOWS = 2;
const EASE = "0.65 0 0.35 1";

interface Run {
  t0: number;
  t1: number;
  reverse: boolean;
  /** Seconds the packet waits where it arrives (the next hop leaves from there). */
  park: number;
}

interface Story {
  animated: boolean;
  cycle: number;
  /** Seconds into the loop. */
  hold: number;
  gone: number;
  /** Runs of each edge on the story, in order. */
  runs: Map<string, Run[]>;
  /** Side flows: a small packet, no trace. */
  side: Map<string, Run>;
  /** When each numbered edge's badge pops. */
  badges: Map<string, number>;
  focus: Point;
}

/** Endpoints in travel order: an arrow at the start runs to -> from. */
const ends = (e: SceneEdge): [string, string] =>
  e.arrow === "start" ? [e.to, e.from] : [e.from, e.to];

/** The longest chain of directed edges (spec order breaks ties); loops are cut where they close. */
function longestPath(edges: SceneEdge[]): SceneEdge[] {
  const out = new Map<string, SceneEdge[]>();
  const starts: string[] = [];
  for (const e of edges) {
    const [a, b] = ends(e);
    if (a === b) continue;
    out.set(a, [...(out.get(a) ?? []), e]);
    if (!starts.includes(a)) starts.push(a);
  }
  const memo = new Map<string, SceneEdge[]>();
  const open = new Set<string>();
  const from = (v: string): SceneEdge[] => {
    const known = memo.get(v);
    if (known) return known;
    open.add(v);
    let best: SceneEdge[] = [];
    for (const e of out.get(v) ?? []) {
      const next = ends(e)[1];
      if (open.has(next)) continue;
      const path = [e, ...from(next)];
      if (path.length > best.length) best = path;
    }
    open.delete(v);
    memo.set(v, best);
    return best;
  };
  let best: SceneEdge[] = [];
  for (const v of starts) {
    const path = from(v);
    if (path.length > best.length) best = path;
  }
  return best;
}

function storyPlan(scene: Scene, h: number): Story {
  const animated = scene.animate === "relay" || scene.animate === "packets";
  const story: Story = {
    animated,
    cycle: 0,
    hold: 0,
    gone: 0,
    runs: new Map(),
    side: new Map(),
    badges: new Map(),
    focus: { x: scene.width * 0.6, y: scene.height * 0.45 },
  };
  const directed = scene.edges.filter((e) => e.arrow !== "none" && e.points.length > 1);
  const travel = (e: SceneEdge) => Math.min(1, Math.max(0.4, length(e.points) / h / SPEED));
  const stepped = directed.filter((e) => e.step !== undefined);
  let t = STORY_AT;
  if (stepped.length) {
    const steps = [...new Set(stepped.map((e) => e.step ?? 0))].sort((a, b) => a - b);
    steps.forEach((step, i) => {
      let took = 0;
      for (const e of stepped.filter((x) => x.step === step)) {
        const tr = travel(e);
        const park = i < steps.length - 1 ? PAUSE : 0;
        // A two-way step answers once the request arrives.
        const runs: Run[] =
          e.arrow === "both"
            ? [
                { t0: t, t1: t + tr, reverse: false, park: PAUSE },
                { t0: t + tr + PAUSE, t1: t + 2 * tr + PAUSE, reverse: true, park },
              ]
            : [{ t0: t, t1: t + tr, reverse: e.arrow === "start", park }];
        story.runs.set(e.id, runs);
        story.badges.set(e.id, t);
        took = Math.max(took, (runs[runs.length - 1]?.t1 ?? t) - t);
      }
      t += took + PAUSE;
    });
  } else {
    const path = longestPath(directed);
    path.forEach((e, i) => {
      const tr = travel(e);
      const park = i < path.length - 1 ? PAUSE : 0;
      story.runs.set(e.id, [{ t0: t, t1: t + tr, reverse: e.arrow === "start", park }]);
      t += tr + PAUSE;
    });
  }
  const end = story.runs.size ? t - PAUSE : TILES_ON + RAMP;
  story.hold = end + HOLD_FOR;
  story.cycle = story.hold / HOLD;
  story.gone = story.cycle * GONE;
  // Side flows: edges off the story, those touching it first, each once per loop.
  const on = new Set(
    scene.edges.filter((e) => story.runs.has(e.id)).flatMap((e) => [e.from, e.to]),
  );
  const side = directed
    .filter((e) => !story.runs.has(e.id))
    .sort((a, b) => Number(on.has(b.from) || on.has(b.to)) - Number(on.has(a.from) || on.has(a.to)))
    .slice(0, SIDE_FLOWS);
  side.forEach((e, i) => {
    const tr = travel(e);
    const span = Math.max(0, end - STORY_AT);
    const t0 = Math.min(STORY_AT + span * (0.45 + 0.3 * i), story.hold - 0.2 - tr);
    story.side.set(e.id, {
      t0: Math.max(STORY_AT, t0),
      t1: Math.max(STORY_AT, t0) + tr,
      reverse: e.arrow === "start",
      park: 0,
    });
  });
  // The tint wash sits behind the story.
  const pts = scene.edges.filter((e) => story.runs.has(e.id)).flatMap((e) => e.points);
  if (pts.length) {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    story.focus = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }
  return story;
}

const loop = (ctx: Ctx) => `dur="${secs(ctx.story.cycle)}" repeatCount="indefinite"`;
const kt = (ctx: Ctx, times: number[]) => keyTimes(times, ctx.story.cycle);

/** Opacity that fades in at `on` and is gone by `off`. */
function show(ctx: Ctx, on: number, off: number): string {
  const { cycle } = ctx.story;
  return `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${kt(ctx, [0, on, on + RAMP, off - RAMP, off, cycle])}" ${loop(ctx)}/>`;
}

/** Lit content: drawn plainly in a still frame, else shown from `on` until `off`. */
function lit(ctx: Ctx, body: string, on: number, off = ctx.story.gone): string {
  if (!body) return "";
  return ctx.story.animated ? `<g opacity="0">${body}${show(ctx, on, off)}</g>` : body;
}

/** A dot riding the edge for one run, eased per hop; it waits `park` where it arrives. */
function packet(ctx: Ctx, d: string, run: Run, color: string, r: number): string {
  const { cycle } = ctx.story;
  const [a, b] = run.reverse ? ["1", "0"] : ["0", "1"];
  const gone = run.t1 + run.park + FADE;
  return (
    `<circle r="${n(r)}" fill="${color}" opacity="0">` +
    `<animateMotion path="${d}" ${loop(ctx)} calcMode="spline" keyPoints="${a};${a};${b};${b}" keyTimes="${kt(ctx, [0, run.t0, run.t1, cycle])}" keySplines="0 0 1 1;${EASE};0 0 1 1"/>` +
    `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${kt(ctx, [0, run.t0 - FADE, run.t0, gone - FADE, gone, cycle])}" ${loop(ctx)}/></circle>`
  );
}

/** The comet: a short dash that follows the packet and slides into it on arrival. */
function comet(ctx: Ctx, d: string, run: Run, color: string, len: number): string {
  const { cycle } = ctx.story;
  const f = Math.min(0.5, COMET / Math.max(1, len / ctx.h));
  const settle = run.t1 + f * (run.t1 - run.t0);
  const offsets = run.reverse ? [-1, -1, 0, f, f] : [f, f, f - 1, -1, -1];
  const times = kt(ctx, [0, run.t0, run.t1, settle, cycle]);
  return (
    `<path d="${d}" fill="none" ${stroke(color, 0.6, 2.4 * ctx.h)} pathLength="1" stroke-dasharray="${n(f)} 2" stroke-dashoffset="${n(offsets[0] ?? 0)}" opacity="0">` +
    `<animate attributeName="stroke-dashoffset" values="${offsets.map(n).join(";")}" keyTimes="${times}" calcMode="spline" keySplines="0 0 1 1;${EASE};0 0 1 1;0 0 1 1" ${loop(ctx)}/>` +
    `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${kt(ctx, [0, run.t0, run.t0 + 0.01, settle, settle + 0.01, cycle])}" ${loop(ctx)}/></path>`
  );
}

// ---------------------------------------------------------------- canvas

function canvas(ctx: Ctx): string {
  const { k, t, scene, h } = ctx;
  if (scene.background === "transparent") return "";
  const p = ctx.prefix;
  const W = scene.width;
  const H = scene.height;
  const cell = 20 * h;
  const { x: fx, y: fy } = ctx.story.focus;
  const reach = Math.max(
    ...[
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ].map(([x = 0, y = 0]) => Math.hypot(x - fx, y - fy)),
  );
  ctx.defs.push(
    `<linearGradient id="${p}bg" x1="0" y1="0" x2="0.34" y2="0.94"><stop offset="0" stop-color="${k.top}"/><stop offset="0.6" stop-color="${t.background}"/></linearGradient>` +
      `<pattern id="${p}grid" width="${n(cell)}" height="${n(cell)}" patternUnits="userSpaceOnUse"><path d="M0 ${n(h / 2)}H${n(cell)}M${n(h / 2)} 0V${n(cell)}" fill="none" ${stroke(k.line, k.grid, h)}/></pattern>` +
      `<radialGradient id="${p}wash" gradientUnits="userSpaceOnUse" cx="${n(fx)}" cy="${n(fy)}" r="${n(reach * 0.6)}"><stop offset="0" stop-color="${k.tint}" stop-opacity="${k.wash}"/><stop offset="1" stop-color="${k.tint}" stop-opacity="0"/></radialGradient>`,
  );
  const base = scene.background ?? `url(#${p}bg)`;
  return `<rect width="${W}" height="${H}" fill="${base}"/><rect width="${W}" height="${H}" fill="url(#${p}grid)"/><rect width="${W}" height="${H}" fill="url(#${p}wash)"/>`;
}

// ---------------------------------------------------------------- groups

function groupFrame(ctx: Ctx, g: SceneGroup): string {
  const { k, h } = ctx;
  const dash = g.dash ? ` stroke-dasharray="${n(3 * h)} ${n(3 * h)}"` : "";
  const rx = g.dash ? 0 : 2 * h;
  // Fills stack where groups nest: a panel for the outer two levels, the lit tint for the top one.
  const panel = !g.dash && g.depth < 2 ? fill(k.line, k.panel) : `fill="none"`;
  const tint = g.depth === 0 ? fill(k.tint, (g.dash ? 0.04 : 0.03) * k.glow) : `fill="none"`;
  const base = rect(g.box, rx, `${panel} ${stroke(k.line, k.frame, h)}`, dash);
  const glow = rect(g.box, rx, `${tint} ${stroke(k.tint, g.dash ? 0.5 : 0.6, h)}`, dash);
  return base + lit(ctx, glow, GROUPS_ON);
}

/** Where an edge segment crosses a box (Liang-Barsky), so a header only gets a chip when needed. */
function crosses(a: Point, b: Point, box: Box): boolean {
  let lo = 0;
  let hi = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sides: [number, number][] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.w - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.h - a.y],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) lo = Math.max(lo, r);
    else hi = Math.min(hi, r);
    if (lo > hi) return false;
  }
  return true;
}

function groupHeader(ctx: Ctx, g: SceneGroup): string {
  const { k, h } = ctx;
  const parts: string[] = [];
  if (g.icon && g.iconBox) {
    const b = g.iconBox;
    if (b.w >= 28) {
      // A corner tile, as the AWS group tiles: a structure square that turns tint when lit.
      parts.push(rect(b, 0, fill(k.line, k.frame)));
      parts.push(glyph(ctx, g.icon, b, mixHex(k.line, k.tile, 0.7), 0.85));
      parts.push(
        lit(ctx, rect(b, 0, fill(k.tint)) + glyph(ctx, g.icon, b, k.onTint, 0.85), GROUPS_ON),
      );
    } else {
      parts.push(glyph(ctx, g.icon, b, k.glyph, 1.5));
      parts.push(lit(ctx, glyph(ctx, g.icon, b, k.tint, 1.5), GROUPS_ON));
    }
  }
  if (g.label.lines.length) {
    const b = g.labelBox;
    const room = Math.max(b.w, g.box.x + g.box.w - b.x - 10 * h);
    const size = sizeFor(g.label.lines, HEADER, room, 8.5);
    const w = Math.max(...g.label.lines.map((l) => monoWidth(l, HEADER, size)));
    const chip = { x: b.x - 4, y: b.y - 1, w: w + 8, h: b.h + 2 };
    const crossed = ctx.scene.edges.some((e) =>
      e.points.some((p, i) => {
        const q = e.points[i + 1];
        return q !== undefined && crosses(p, q, chip);
      }),
    );
    if (crossed) parts.push(rect(chip, 3, fill(ctx.t.background)));
    parts.push(block(g.label, b, HEADER, size, g.labelColor, "start"));
  }
  return parts.join("");
}

// ---------------------------------------------------------------- edges

const ARROW_LEN = 6;
const ARROW_HALF = 4;

function chevron(ctx: Ctx, tip: Point, from: Point, color: string, alpha: number): string {
  const len = ARROW_LEN * ctx.h;
  const half = ARROW_HALF * ctx.h;
  const d = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const ux = (tip.x - from.x) / d;
  const uy = (tip.y - from.y) / d;
  const bx = tip.x - ux * len;
  const by = tip.y - uy * len;
  return `<path d="M${n(bx - uy * half)} ${n(by + ux * half)} L${n(tip.x)} ${n(tip.y)} L${n(bx + uy * half)} ${n(by - ux * half)}" fill="none" ${stroke(color, alpha, ctx.h)} stroke-linecap="round" stroke-linejoin="round"/>`;
}

interface Wire {
  d: string;
  /** Length of the drawn line in scene units. */
  len: number;
  dash: string;
  width: number;
  heads: { end?: [Point, Point]; start?: [Point, Point] };
}

function wireOf(ctx: Ctx, e: SceneEdge): Wire | undefined {
  const h = ctx.h;
  let pts = e.points;
  if (pts.length < 2) return undefined;
  const end = e.arrow === "end" || e.arrow === "both";
  const start = e.arrow === "start" || e.arrow === "both";
  const spline = ctx.scene.routing === "spline" && (pts.length - 1) % 3 === 0 && pts.length > 2;
  if (!spline) {
    if (end) pts = trim(pts, true, h / 2);
    if (start) pts = trim(pts, false, h / 2);
  }
  const width = e.line === "thick" ? 1.8 * h : h;
  const dash =
    e.line === "dashed"
      ? ` stroke-dasharray="${n(4 * h)} ${n(3 * h)}"`
      : e.line === "dotted"
        ? ` stroke-dasharray="${n(h)} ${n(2.5 * h)}"`
        : "";
  const o = e.points;
  const last = o[o.length - 1];
  const before = o[o.length - 2];
  const first = o[0];
  const second = o[1];
  return {
    d: edgePath(pts, ctx.scene.routing),
    len: length(pts),
    dash,
    width,
    heads: {
      ...(end && last && before ? { end: [last, before] as [Point, Point] } : {}),
      ...(start && first && second ? { start: [first, second] as [Point, Point] } : {}),
    },
  };
}

function edgeBase(ctx: Ctx, e: SceneEdge, w: Wire): string {
  const { k } = ctx;
  const flow =
    ctx.scene.animate === "flow"
      ? ` class="sdw-flow${e.line === "solid" || e.line === "thick" ? " sdw-solid" : ""}"`
      : "";
  const heads = [w.heads.end, w.heads.start]
    .map((hd) => (hd ? chevron(ctx, hd[0], hd[1], k.line, k.arrow) : ""))
    .join("");
  return `<path d="${w.d}" fill="none" ${stroke(k.line, k.wire, w.width)} stroke-linecap="round" stroke-linejoin="round"${w.dash}${flow}/>${heads}`;
}

/** The story's lit trace over one edge: it grows behind the packet and holds until the fade. */
function edgeLit(ctx: Ctx, e: SceneEdge, w: Wire, runs: Run[]): string {
  const { story, h } = ctx;
  const color = e.color ?? ctx.k.tint;
  const width = (e.line === "thick" ? 1.8 : 1.2) * h;
  const first = runs[0];
  if (!first) return "";
  const parts: string[] = [];
  const line = `<path d="${w.d}" fill="none" ${stroke(color, 0.5, width)} stroke-linecap="round" stroke-linejoin="round"${w.dash}/>`;
  if (!story.animated) parts.push(line);
  else {
    const hide = first.reverse ? "-1" : "1";
    const reveal = `<animate attributeName="stroke-dashoffset" values="${hide};${hide};0;0" keyTimes="${kt(ctx, [0, first.t0, first.t1, story.cycle])}" calcMode="spline" keySplines="0 0 1 1;${EASE};0 0 1 1" ${loop(ctx)}/>`;
    const off = story.hold + RAMP;
    if (w.dash) {
      // Reveal a dashed line through a mask, so it stays dashed while it draws.
      const id = `${ctx.prefix}m-${e.id}`;
      ctx.defs.push(
        `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${ctx.scene.width}" height="${ctx.scene.height}"><path d="${w.d}" fill="none" stroke="#ffffff" stroke-width="${n(width + 6 * h)}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${hide}">${reveal}</path></mask>`,
      );
      parts.push(`<g mask="url(#${id})" opacity="0">${line}${show(ctx, first.t0, off)}</g>`);
    } else {
      parts.push(
        `<path d="${w.d}" fill="none" ${stroke(color, 0.5, width)} stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${hide}" opacity="0">${reveal}${show(ctx, first.t0, off)}</path>`,
      );
    }
  }
  // Each chevron lights as a packet arrives at it.
  for (const run of runs) {
    const hd = run.reverse ? w.heads.start : w.heads.end;
    if (hd) parts.push(lit(ctx, chevron(ctx, hd[0], hd[1], color, 0.7), run.t1, story.hold + RAMP));
  }
  return parts.join("");
}

function edgeLabel(ctx: Ctx, e: SceneEdge): string {
  const { k, h, story } = ctx;
  const parts: string[] = [];
  const runs = story.runs.get(e.id);
  const on = runs?.[0]?.t0 ?? 0;
  if (e.labelBox && e.label?.lines.length) {
    const b = e.labelBox;
    const size = Math.min(ctx.sizes.edge, sizeFor(e.label.lines, EDGE, b.w - 8, 7));
    const w = Math.max(b.w, ...e.label.lines.map((l) => monoWidth(l, EDGE, size) + 8));
    const chip = { x: b.x + b.w / 2 - w / 2, y: b.y, w, h: b.h };
    parts.push(rect(chip, 3, `${fill(k.tile)} ${stroke(k.line, k.hair, h)}`));
    parts.push(block(e.label, b, EDGE, size, ctx.t.edgeLabel));
    if (runs) {
      const color = e.color ?? k.tint;
      parts.push(
        lit(
          ctx,
          rect(chip, 3, `${fill(k.tile)} ${stroke(color, 0.5, h)}`) +
            block(e.label, b, EDGE, size, color),
          on,
          story.hold + RAMP,
        ),
      );
    }
  }
  if (e.stepBox && e.step !== undefined) {
    const s = e.stepBox;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const r = s.w / 2;
    const digit = (color: string, x: number, y: number) =>
      mono(
        [String(e.step)],
        DIGIT,
        Math.min(DIGIT.size, r),
        { x, y: y - r, lead: 2 * r },
        color,
        "middle",
      );
    parts.push(
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${fill(k.tile)} ${stroke(k.line, k.frame, h)}/>`,
    );
    parts.push(digit(ctx.t.text, cx, cy));
    const pop = `<circle r="${n(r)}" ${fill(e.color ?? k.tint)}/>${digit(k.onTint, 0, 0)}`;
    const at = story.badges.get(e.id);
    if (!story.animated) parts.push(`<g transform="translate(${n(cx)} ${n(cy)})">${pop}</g>`);
    else if (at !== undefined) {
      const times = kt(ctx, [0, at, at + RAMP, at + 2 * RAMP, story.hold, story.gone, story.cycle]);
      parts.push(
        `<g transform="translate(${n(cx)} ${n(cy)})"><g opacity="0">${pop}` +
          `<animate attributeName="opacity" values="0;0;1;1;1;0;0" keyTimes="${times}" ${loop(ctx)}/>` +
          `<animateTransform attributeName="transform" type="scale" values="0.4;0.4;1.3;1;1;1;0.4" keyTimes="${times}" ${loop(ctx)}/></g></g>`,
      );
    }
  }
  return parts.length ? `<g id="${ctx.prefix}el-${e.id}">${parts.join("")}</g>` : "";
}

// ---------------------------------------------------------------- nodes

/** An ink tile with its glyph, lit with the node's tint. */
function tile(ctx: Ctx, nd: SceneNode, b: Box): string {
  const { k, h } = ctx;
  const rx = 0.17 * Math.min(b.w, b.h);
  const tint = nd.color ?? k.tint;
  return (
    rect(b, rx, `${fill(k.tile)} ${stroke(k.line, k.frame, h)}`) +
    lit(ctx, rect(b, rx, `${fill(tint, 0.15)} ${stroke(tint, 0.65, h)}`), TILES_ON) +
    (nd.icon ? glyph(ctx, nd.icon, b, k.glyph) : "")
  );
}

function badge(ctx: Ctx, label: string, anchor: Box, placed?: Box): string {
  const { k, h } = ctx;
  const size = 8.5;
  const w = placed?.w ?? Math.max(18, monoWidth(label, KEY, size) + 10);
  const bh = placed?.h ?? 16;
  const b = {
    x: placed?.x ?? anchor.x + anchor.w - w / 2 - 2,
    y: placed?.y ?? anchor.y - 7,
    w: Math.max(w, monoWidth(label, KEY, size) + 10),
    h: bh,
  };
  return (
    rect(b, bh / 2, `${fill(k.tile)} ${stroke(k.line, k.frame, h)}`) +
    mono([label], KEY, size, { x: b.x + b.w / 2, y: b.y, lead: bh }, ctx.t.edgeLabel, "middle")
  );
}

function labels(ctx: Ctx, nd: SceneNode, anchor: "start" | "middle", room: number): string {
  const own = sizeFor(nd.label.lines, LABEL, room, 8);
  const parts = [
    block(
      nd.label,
      nd.labelBox,
      LABEL,
      Math.min(ctx.sizes.label, own),
      nd.ink ?? ctx.t.text,
      anchor,
    ),
  ];
  if (nd.note && nd.noteBox)
    parts.push(
      block(
        nd.note,
        nd.noteBox,
        NOTE,
        Math.min(ctx.sizes.note, sizeFor(nd.note.lines, NOTE, room, 8)),
        nd.inkMuted ?? ctx.t.muted,
        anchor,
      ),
    );
  return parts.join("");
}

/** Width a node's label may take: its measured box plus the gap around it. */
function labelRoom(nd: SceneNode): number {
  if (nd.look === "card") return nd.box.x + nd.box.w - nd.labelBox.x - 10;
  return Math.max(nd.labelBox.w, nd.look === "icon" ? nd.box.w : 0) + 14;
}

function node(ctx: Ctx, nd: SceneNode): string {
  const { k, h } = ctx;
  const parts: string[] = [];
  const room = labelRoom(nd);
  if (nd.look === "icon") {
    if (nd.iconBox) parts.push(tile(ctx, nd, nd.iconBox));
    parts.push(labels(ctx, nd, "middle", room));
    if (nd.badge && nd.iconBox) parts.push(badge(ctx, nd.badge, nd.iconBox, nd.badgeBox));
  } else if (nd.look === "card") {
    const tint = nd.color ?? k.tint;
    parts.push(rect(nd.box, 6, `${fill(k.tile)} ${stroke(k.line, k.frame, h)}`));
    parts.push(lit(ctx, rect(nd.box, 6, `${fill(tint, 0.15)} ${stroke(tint, 0.65, h)}`), TILES_ON));
    if (nd.icon && nd.iconBox) parts.push(tile(ctx, { ...nd, color: tint }, nd.iconBox));
    parts.push(labels(ctx, nd, "start", room));
    if (nd.badge) parts.push(badge(ctx, nd.badge, nd.box, nd.badgeBox));
  } else {
    const tint = nd.color ?? k.tint;
    parts.push(
      `<g ${fill(k.tile)} ${stroke(k.line, k.frame, h)}>${shapePath(nd.shape, nd.box)}</g>`,
    );
    parts.push(
      lit(
        ctx,
        `<g ${fill(tint, 0.15)} ${stroke(tint, 0.65, h)}>${shapePath(nd.shape, nd.box)}</g>`,
        TILES_ON,
      ),
    );
    if (nd.icon && nd.iconBox) parts.push(glyph(ctx, nd.icon, nd.iconBox, k.glyph, 1.5));
    parts.push(labels(ctx, nd, "middle", room));
    if (nd.badge) parts.push(badge(ctx, nd.badge, nd.box, nd.badgeBox));
  }
  const inner = parts.join("");
  const body = nd.url
    ? `<a href="${esc(nd.url)}" xlink:href="${esc(nd.url)}" target="_blank">${inner}</a>`
    : inner;
  return `<g id="${ctx.prefix}n-${nd.id}">${body}</g>`;
}

// ---------------------------------------------------------------- legend

function legend(ctx: Ctx): string {
  const l = ctx.scene.legend;
  if (!l?.items.length) return "";
  const { k, h } = ctx;
  const parts = [rect(l.box, 6, `${fill(k.tile)} ${stroke(k.line, k.hair, h)}`)];
  for (const item of l.items) {
    const s = item.swatch;
    const y = s.y + s.h / 2;
    const dash =
      item.line === "dashed"
        ? ` stroke-dasharray="${n(4 * h)} ${n(3 * h)}"`
        : item.line === "dotted"
          ? ` stroke-dasharray="${n(h)} ${n(2.5 * h)}"`
          : "";
    parts.push(
      `<path d="M${n(s.x)} ${n(y)} H${n(s.x + s.w)}" fill="none" ${stroke(k.line, k.arrow, item.line === "thick" ? 1.8 * h : h)} stroke-linecap="round"${dash}/>`,
    );
    const b = item.labelBox;
    parts.push(
      block(
        item.label,
        b,
        KEY,
        sizeFor(item.label.lines, KEY, l.box.x + l.box.w - b.x - 10, 7),
        ctx.t.text,
        "start",
      ),
    );
  }
  return `<g id="${ctx.prefix}legend">${parts.join("")}</g>`;
}

// ---------------------------------------------------------------- document

export function renderStage(scene: Scene, opts: SvgOptions = {}): string {
  const t = tokensFor(scene);
  const k = t.stage;
  if (!k) throw new Error("renderStage needs the stage skin");
  const prefix = opts.idPrefix ? `${opts.idPrefix.replace(/[^A-Za-z0-9_-]/g, "")}-` : "";
  const h = 1 / Math.min(1, DISPLAY / Math.max(1, scene.width));
  const ctx: Ctx = {
    t,
    k,
    prefix,
    scene,
    h,
    story: storyPlan(scene, h),
    sizes: {
      label: common(
        scene.nodes.map((nd) => sizeFor(nd.label.lines, LABEL, labelRoom(nd))),
        LABEL.size,
      ),
      note: common(
        scene.nodes.flatMap((nd) => (nd.note ? [sizeFor(nd.note.lines, NOTE, labelRoom(nd))] : [])),
        NOTE.size,
      ),
      edge: common(
        scene.edges.flatMap((e) =>
          e.label && e.labelBox ? [sizeFor(e.label.lines, EDGE, e.labelBox.w - 8, 7)] : [],
        ),
        EDGE.size,
      ),
    },
    symbols: new Map(),
    filters: new Map(),
    defs: [],
  };
  const { width: W, height: H } = scene;
  const titleId = `${prefix}sdw-title`;
  const descId = `${prefix}sdw-desc`;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${titleId} ${descId}" font-family="${esc(MONO)}">`,
  );
  out.push(
    `<title id="${titleId}">${esc(scene.title?.lines.join(" ") ?? "Architecture diagram")}</title>`,
  );
  out.push(`<desc id="${descId}">${esc(scene.description)}</desc>`);
  if (scene.animate === "flow") out.push(`<style>${FLOW_CSS}</style>`);
  const defsAt = out.length;
  out.push(canvas(ctx));
  if (scene.title && scene.titleBox) {
    const b = scene.titleBox;
    const size = sizeFor(scene.title.lines, TITLE, W - b.x - 24, 11);
    out.push(block(scene.title, b, TITLE, size, mixHex(k.line, t.background, 0.85), "start"));
  }
  if (scene.subtitle && scene.subtitleBox) {
    const b = scene.subtitleBox;
    const size = sizeFor(scene.subtitle.lines, SUBTITLE, W - b.x - 24, 9);
    out.push(block(scene.subtitle, b, SUBTITLE, size, t.text, "start"));
  }
  for (const g of scene.groups) out.push(`<g id="${prefix}g-${g.id}">${groupFrame(ctx, g)}</g>`);
  const wires = new Map(scene.edges.map((e) => [e.id, wireOf(ctx, e)]));
  for (const e of scene.edges) {
    const w = wires.get(e.id);
    if (!w) continue;
    const runs = ctx.story.runs.get(e.id);
    out.push(
      `<g id="${prefix}e-${e.id}">${edgeBase(ctx, e, w)}${runs ? edgeLit(ctx, e, w, runs) : ""}</g>`,
    );
  }
  for (const e of scene.edges) {
    const label = edgeLabel(ctx, e);
    if (label) out.push(label);
  }
  for (const g of scene.groups) {
    const header = groupHeader(ctx, g);
    if (header) out.push(`<g id="${prefix}gh-${g.id}">${header}</g>`);
  }
  for (const nd of scene.nodes) out.push(node(ctx, nd));
  if (ctx.story.animated) {
    const moving: string[] = [];
    for (const e of scene.edges) {
      const w = wires.get(e.id);
      if (!w) continue;
      const color = e.color ?? k.tint;
      for (const run of ctx.story.runs.get(e.id) ?? [])
        moving.push(comet(ctx, w.d, run, color, w.len), packet(ctx, w.d, run, color, 2.5 * h));
      const side = ctx.story.side.get(e.id);
      if (side) moving.push(packet(ctx, w.d, side, color, 2 * h));
    }
    if (moving.length) out.push(`<g id="${prefix}story">${moving.join("")}</g>`);
  }
  out.push(legend(ctx));
  if (ctx.defs.length) out.splice(defsAt, 0, `<defs>${ctx.defs.join("")}</defs>`);
  out.push("</svg>");
  return `${out.filter(Boolean).join("\n")}\n`;
}
