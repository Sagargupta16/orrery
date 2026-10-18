import { mixHex } from "../color.ts";
import { renderIcon } from "../icons.ts";
import { FONT_STACK, type Theme, tokensFor } from "../themes.ts";
import type {
  Box,
  EdgeLine,
  Point,
  Scene,
  SceneEdge,
  SceneGroup,
  SceneLegend,
  SceneNode,
  TextBlock,
} from "../types.ts";
import { journeyClassic } from "./journey.ts";
import { laneClassic } from "./lanes.ts";
import { flowMarks, notationMarks, notationShape, shapeOutline } from "./notation.ts";
import { renderStage } from "./stage.ts";

// Inter's vertical metrics (ascender 1984, descender -494 at 2048 units per em).
const ASCENT = 0.96875;
const DESCENT = 0.2412;

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

export interface SvgOptions {
  /** Prefix for every id in the file, so several diagrams can share one page. */
  idPrefix?: string;
}

interface Ctx {
  t: Theme;
  prefix: string;
  scene: Scene;
  /** Packet timing per edge id, when the scene animates with packets. */
  motion: Map<string, Motion>;
  /** Relay timing, when the scene animates with relay. */
  relay: Relay;
  /** Symbol id per distinct icon artwork (viewBox and painted body), and the symbols in order. */
  symbols: Map<string, string>;
  defs: string[];
}

function text(
  block: TextBlock,
  box: Box,
  color: string,
  anchor: "start" | "middle" = "middle",
  extra = "",
): string {
  if (!block.lines.length) return "";
  const x = anchor === "middle" ? box.x + box.w / 2 : box.x;
  const first = box.y + (block.lead - block.size * (ASCENT + DESCENT)) / 2 + block.size * ASCENT;
  const weight = block.weight === 600 ? ` font-weight="600"` : "";
  const tspans = block.lines
    .map((line, i) => `<tspan x="${n(x)}" y="${n(first + i * block.lead)}">${esc(line)}</tspan>`)
    .join("");
  const anchorAttr = anchor === "middle" ? ` text-anchor="middle"` : "";
  return `<text font-size="${n(block.size)}"${weight} fill="${color}"${anchorAttr}${extra}>${tspans}</text>`;
}

export const SYMBOL_ID = "SDWSYM";

// Each distinct icon artwork is written once as a <symbol> and placed with <use>, so a diagram with
// six Lambdas carries one copy. The symbol's viewBox fits it into the box centered, as before.
function icon(ctx: Ctx, id: string, box: Box, color?: string, background?: string): string {
  const r = renderIcon(id, SYMBOL_ID, {
    theme: ctx.t.name,
    background: background ?? ctx.t.background,
    ink: ctx.t.text,
    color,
  });
  const viewBox = r.viewBox.join(" ");
  const key = `${viewBox}|${r.body}`;
  let ref = ctx.symbols.get(key);
  if (!ref) {
    ref = `${ctx.prefix}s${ctx.symbols.size + 1}`;
    ctx.symbols.set(key, ref);
    // overflow: artwork that bleeds past its viewBox is drawn, as it was when inlined.
    ctx.defs.push(
      `<symbol id="${ref}" viewBox="${viewBox}" overflow="visible">${r.body.replaceAll(`${SYMBOL_ID}-`, `${ref}-`)}</symbol>`,
    );
  }
  return `<use href="#${ref}" x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}"/>`;
}

// ---------------------------------------------------------------- groups

function groupFrame(g: SceneGroup): string {
  const { box } = g;
  const dash = g.dash ? ` stroke-dasharray="${g.dash}"` : "";
  const inner = g.inner
    ? `<rect x="${n(g.inner.box.x)}" y="${n(g.inner.box.y)}" width="${n(g.inner.box.w)}" height="${n(g.inner.box.h)}" rx="${Math.max(0, g.radius - 2)}" fill="${g.inner.fill}"/>`
    : "";
  return `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}"${g.radius ? ` rx="${g.radius}"` : ""} fill="${g.fill}" stroke="${g.stroke}" stroke-width="${g.strokeWidth}"${dash}/>${inner}`;
}

/** The fill a group header sits on: its own, else the nearest filled ancestor's, else the canvas. */
function surfaceBehind(ctx: Ctx, g: SceneGroup): string {
  if (g.overlay) {
    // An overlay legend sits on whatever is under its top-left corner.
    const px = g.labelBox.x;
    const py = g.box.y;
    const under = ctx.scene.groups
      .filter((x) => !x.overlay && x.fill !== "none")
      .filter(
        (x) => px >= x.box.x && px <= x.box.x + x.box.w && py >= x.box.y && py <= x.box.y + x.box.h,
      )
      .sort((a, b) => b.depth - a.depth)[0];
    if (under) return under.fill;
  }
  let cur: SceneGroup | undefined = g.overlay ? undefined : g;
  while (cur) {
    if (cur.fill !== "none") return cur.fill;
    const parent: string | undefined = cur.parent;
    cur = parent ? ctx.scene.groups.find((x) => x.id === parent) : undefined;
  }
  const bg = ctx.scene.background;
  return bg && bg !== "transparent" ? bg : ctx.t.background;
}

// Headers are drawn after the edges, on a chip of the surface color, so a line that crosses the
// top border never runs through the label.
function groupHeader(ctx: Ctx, g: SceneGroup): string {
  const parts: string[] = [];
  const surface = surfaceBehind(ctx, g);
  if (g.label.lines.length) {
    const b = g.labelBox;
    // An overlay legend's chip spans its icon too, unless the icon sits above the label (tile-center).
    const iconInRow =
      g.overlay && g.iconBox && g.iconBox.y < b.y + b.h && b.y < g.iconBox.y + g.iconBox.h;
    const left = iconInRow && g.iconBox ? g.iconBox.x - 4 : b.x - 4;
    parts.push(
      `<rect x="${n(left)}" y="${n(b.y - 1)}" width="${n(b.x + b.w + 4 - left)}" height="${n(b.h + 2)}" rx="3" fill="${surface}"/>`,
    );
  }
  if (g.icon && g.iconBox) parts.push(icon(ctx, g.icon, g.iconBox, undefined, surface));
  parts.push(text(g.label, g.labelBox, g.labelColor, "start"));
  return parts.join("");
}

// ---------------------------------------------------------------- edges

export function edgePath(points: Point[], routing: Scene["routing"]): string {
  if (points.length < 2) return "";
  const [first] = points;
  if (!first) return "";
  if (routing === "spline" && (points.length - 1) % 3 === 0 && points.length > 2) {
    let d = `M${n(first.x)} ${n(first.y)}`;
    for (let i = 1; i + 2 < points.length; i += 3) {
      const [a, b, c] = [points[i], points[i + 1], points[i + 2]];
      if (a && b && c) d += ` C${n(a.x)} ${n(a.y)} ${n(b.x)} ${n(b.y)} ${n(c.x)} ${n(c.y)}`;
    }
    const last = points[points.length - 1];
    if (last) d += ` L${n(last.x)} ${n(last.y)}`;
    return d;
  }
  const R = routing === "orthogonal" ? 8 : 4;
  let d = `M${n(first.x)} ${n(first.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const a = points[i - 1];
    const b = points[i + 1];
    if (!p || !a || !b) continue;
    const inLen = Math.hypot(p.x - a.x, p.y - a.y);
    const outLen = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(R, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += ` L${n(p.x)} ${n(p.y)}`;
      continue;
    }
    const p1 = { x: p.x - ((p.x - a.x) / inLen) * r, y: p.y - ((p.y - a.y) / inLen) * r };
    const p2 = { x: p.x + ((b.x - p.x) / outLen) * r, y: p.y + ((b.y - p.y) / outLen) * r };
    d += ` L${n(p1.x)} ${n(p1.y)} Q${n(p.x)} ${n(p.y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  const last = points[points.length - 1];
  if (last) d += ` L${n(last.x)} ${n(last.y)}`;
  return d;
}

/** Shortens one end of a polyline by `by` px so the stroke stops at the arrowhead's base. */
export function trim(points: Point[], atEnd: boolean, by: number): Point[] {
  const pts = points.map((p) => ({ ...p }));
  const i = atEnd ? pts.length - 1 : 0;
  const j = atEnd ? pts.length - 2 : 1;
  const tip = pts[i];
  const prev = pts[j];
  if (!tip || !prev) return pts;
  const len = Math.hypot(tip.x - prev.x, tip.y - prev.y);
  if (len <= by) return pts;
  pts[i] = { x: tip.x - ((tip.x - prev.x) / len) * by, y: tip.y - ((tip.y - prev.y) / len) * by };
  return pts;
}

function arrowHead(
  tip: Point,
  from: Point,
  len: number,
  half: number,
  color: string,
  open = false,
  width = 1.5,
): string {
  if (open) {
    const d = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
    const ux = (tip.x - from.x) / d;
    const uy = (tip.y - from.y) / d;
    const bx = tip.x - ux * len;
    const by = tip.y - uy * len;
    return `<path d="M${n(bx - uy * half)} ${n(by + ux * half)} L${n(tip.x)} ${n(tip.y)} L${n(bx + uy * half)} ${n(by - ux * half)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const d = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const ux = (tip.x - from.x) / d;
  const uy = (tip.y - from.y) / d;
  const bx = tip.x - ux * len;
  const by = tip.y - uy * len;
  const pts = [
    [tip.x, tip.y],
    [bx - uy * half, by + ux * half],
    [bx + ux * 1.5, by + uy * 1.5],
    [bx + uy * half, by - ux * half],
  ];
  return `<path d="M${pts.map(([x, y]) => `${n(x ?? 0)} ${n(y ?? 0)}`).join(" L")} Z" fill="${color}"/>`;
}

/** Stroke width and dash attributes of a line style, shared by edges and the legend. */
function stroke(line: EdgeLine): { width: number; dash: string } {
  const width = line === "thick" ? 2.5 : 1.5;
  const dash =
    line === "dashed"
      ? ` stroke-dasharray="6 4"`
      : line === "dotted"
        ? ` stroke-dasharray="1.5 3.5" stroke-linecap="round"`
        : "";
  return { width, dash };
}

function edge(ctx: Ctx, e: SceneEdge, routing: Scene["routing"]): string {
  const color = e.color ?? ctx.t.edge;
  const { width, dash } = stroke(e.line);
  const len = e.line === "thick" ? 11 : 9;
  const half = e.line === "thick" ? 5.5 : 4.5;
  let pts = e.points;
  if (pts.length < 2) return "";
  const end = e.arrow === "end" || e.arrow === "both";
  const start = e.arrow === "start" || e.arrow === "both";
  const spline = routing === "spline" && (pts.length - 1) % 3 === 0 && pts.length > 2;
  if (!spline) {
    const cut = ctx.scene.arrowhead === "open" ? width / 2 : len - 1;
    if (end) pts = trim(pts, true, cut);
    if (start) pts = trim(pts, false, cut);
  }
  const flow =
    ctx.scene.animate === "flow"
      ? ` class="sdw-flow${e.line === "solid" || e.line === "thick" ? " sdw-solid" : ""}"`
      : "";
  const d = edgePath(pts, routing);
  const parts = [
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"${dash}${flow}/>`,
  ];
  const motion = ctx.motion.get(e.id);
  if (motion) parts.push(packets(ctx, e, d, motion));
  const beat = ctx.relay.edges.get(e.id);
  const orig = e.points;
  const last = orig[orig.length - 1];
  const beforeLast = orig[orig.length - 2];
  const firstPt = orig[0];
  const second = orig[1];
  const open = ctx.scene.arrowhead === "open";
  if (end && last && beforeLast)
    parts.push(arrowHead(last, beforeLast, len, half, color, open, width));
  if (start && firstPt && second)
    parts.push(arrowHead(firstPt, second, len, half, color, open, width));
  if (e.flow) parts.push(flowMarks(e, color, width, ctx.t.background));
  if (beat) {
    const lit = ctx.relay.color;
    const heads = [
      end && last && beforeLast ? arrowHead(last, beforeLast, len, half, lit, open, width) : "",
      start && firstPt && second ? arrowHead(firstPt, second, len, half, lit, open, width) : "",
    ].join("");
    parts.push(relayLine(ctx, e, d, heads, beat, width, dash));
  }
  return `<g id="${ctx.prefix}e-${e.id}">${parts.join("")}</g>`;
}

// Labels and step badges go in a second pass over the edges, so a later edge's line never paints
// over an earlier edge's label.
function edgeLabel(ctx: Ctx, e: SceneEdge): string {
  if (e.points.length < 2) return "";
  const parts: string[] = [];
  if (e.labelBox && e.label) {
    const b = e.labelBox;
    parts.push(
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="4" fill="${ctx.scene.background === "transparent" ? ctx.t.background : (ctx.scene.background ?? ctx.t.background)}" fill-opacity="0.92"/>`,
    );
    // Centered in the chip, so it lines up with a step badge beside it.
    const h = e.label.height;
    parts.push(text(e.label, { x: b.x, y: b.y + (b.h - h) / 2, w: b.w, h }, ctx.t.edgeLabel));
  }
  if (e.stepBox && e.step !== undefined) {
    const s = e.stepBox;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const motion = ctx.motion.get(e.id) ?? relayMotion(ctx, e.id);
    if (motion?.stepped) parts.push(ping(ctx, cx, cy, s.w / 2, motion));
    parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s.w / 2)}" fill="${ctx.t.stepFill}"/>`);
    // Bold digits, as in the AWS deck's numbered callouts.
    parts.push(
      `<text x="${n(cx)}" y="${n(cy + 5)}" font-size="14" font-weight="700" fill="${ctx.t.stepText}" text-anchor="middle">${e.step}</text>`,
    );
  }
  return parts.length ? `<g id="${ctx.prefix}el-${e.id}">${parts.join("")}</g>` : "";
}

// ---------------------------------------------------------------- motion

// Packets travel every directed edge at one speed, so a long edge takes longer than a short one.
// Numbered edges run one after another in step order and loop as a story; the rest loop on their
// own, staggered so neighbors never move in lockstep. Line styles are untouched (a dashed edge
// stays dashed), and everything is SMIL, which GitHub keeps in SVGs shown as images.
const SPEED = 150;
const REST = 0.9;
const FADE = 0.12;

interface Motion {
  /** Loop length in seconds. */
  cycle: number;
  /** When the packet leaves, and how long it travels, in seconds into the loop. */
  start: number;
  travel: number;
  /** Phase shift of the whole loop (negative: already running at load). */
  begin: number;
  stepped: boolean;
}

export function length(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function motionPlan(scene: Scene): Map<string, Motion> {
  const plan = new Map<string, Motion>();
  if (scene.animate !== "packets") return plan;
  const moving = scene.edges.filter((e) => e.arrow !== "none" && e.points.length > 1);
  const travel = (e: SceneEdge) => Math.min(2.4, Math.max(0.6, length(e.points) / SPEED));
  const stepped = moving.filter((e) => e.step !== undefined);
  const steps = [...new Set(stepped.map((e) => e.step ?? 0))].sort((a, b) => a - b);
  // A two-way edge sends its reply after the request arrives, so its step takes two travel times.
  const slot = (e: SceneEdge) => travel(e) * (e.arrow === "both" ? 2 : 1);
  const starts = new Map<number, number>();
  let t = 0;
  for (const step of steps) {
    starts.set(step, t);
    t += Math.max(...stepped.filter((e) => e.step === step).map(slot)) + 0.15;
  }
  const story = t + REST;
  for (const e of stepped) {
    const start = starts.get(e.step ?? 0) ?? 0;
    plan.set(e.id, { cycle: story, start, travel: travel(e), begin: 0, stepped: true });
  }
  moving
    .filter((e) => e.step === undefined)
    .forEach((e, i) => {
      const tr = travel(e);
      const cycle = tr + REST;
      const begin = -(((i * 0.618034) % 1) * cycle);
      plan.set(e.id, { cycle, start: 0, travel: tr, begin, stepped: false });
    });
  return plan;
}

export const secs = (v: number) => `${Math.round(v * 1000) / 1000}s`;

/** keyTimes for a list of seconds inside a loop: rounded, clamped and never decreasing. */
export function keyTimes(times: number[], cycle: number): string {
  let prev = 0;
  return times
    .map((t, i) => {
      const v = i === times.length - 1 ? 1 : Math.min(1, Math.max(prev, t / cycle));
      prev = Math.round(v * 10000) / 10000;
      return prev;
    })
    .join(";");
}

function packets(ctx: Ctx, e: SceneEdge, d: string, m: Motion): string {
  const color = e.color ?? ctx.t.flow;
  const r = e.line === "thick" ? 4.2 : 3.6;
  const { cycle, start, travel } = m;
  /** One packet leaving `from` seconds into the loop, the whole loop shifted by `shift`. */
  const one = (reverse: boolean, from: number, shift = 0) => {
    const end = from + travel;
    const fadeIn = from === 0 ? [0, FADE] : [0, from, from + FADE];
    const opacity = from === 0 ? "0;1;1;0;0" : "0;0;1;1;0;0";
    const fade = keyTimes([...fadeIn, end - FADE, end, cycle], cycle);
    const at = keyTimes([0, from, end, cycle], cycle);
    const begin = m.begin - shift;
    const loop = `dur="${secs(cycle)}" repeatCount="indefinite"${begin ? ` begin="${secs(begin)}"` : ""}`;
    return (
      `<g opacity="0"><circle r="${n(r * 2.3)}" fill="${color}" fill-opacity="0.22"/><circle r="${r}" fill="${color}"/>` +
      `<animateMotion path="${d}" ${loop} calcMode="linear" keyPoints="${reverse ? "1;1;0;0" : "0;0;1;1"}" keyTimes="${at}"/>` +
      `<animate attributeName="opacity" values="${opacity}" keyTimes="${fade}" ${loop}/></g>`
    );
  };
  // A numbered two-way edge answers inside its own step; a free-running one answers half a loop on.
  if (e.arrow === "both")
    return m.stepped
      ? one(false, start) + one(true, start + travel)
      : one(false, start) + one(true, start, cycle / 2);
  return one(e.arrow === "start", start);
}

/** A ring that ripples out of a step badge as its packet leaves. */
function ping(ctx: Ctx, cx: number, cy: number, r: number, m: Motion): string {
  const at = keyTimes([0, Math.max(0, m.start - 0.01), m.start, m.start + 0.6, m.cycle], m.cycle);
  const loop = `dur="${secs(m.cycle)}" repeatCount="indefinite"`;
  return (
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${ctx.t.flow}" stroke-width="2" opacity="0">` +
    `<animate attributeName="r" values="${n(r)};${n(r)};${n(r)};${n(r + 8)};${n(r + 8)}" keyTimes="${at}" ${loop}/>` +
    `<animate attributeName="opacity" values="0;0;0.7;0;0" keyTimes="${at}" ${loop}/></circle>`
  );
}

// ---------------------------------------------------------------- relay

// Relay: on one clock each line draws itself in turn, the node it reaches lights up, everything
// holds, then the loop resets. Beats follow the numbered steps when there are any (the other edges
// draw first, as the setting), else the distance from the entry points. The still frame is the
// whole diagram: relay only draws a lit copy on top, so a PNG or a paused SVG shows every line.
// The stage skin tells its own story for relay (stage.ts).
const FIRST = 0.3;
const BEAT = 0.55;
const DRAW = 0.45;
const HOLD = 1.2;
/** Lit until END of the loop, gone by GONE, reset at the end. */
const END = 0.92;
const GONE = 0.95;
const MAX_BEATS = 8;

interface Beat {
  t0: number;
  t1: number;
  stepped: boolean;
}

interface Relay {
  /** The tint lines and nodes light up in. */
  color: string;
  cycle: number;
  edges: Map<string, Beat>;
  /** When each node lights up, in seconds into the loop. */
  nodes: Map<string, number>;
}

function relayPlan(scene: Scene, t: Theme): Relay {
  const relay: Relay = {
    color: t.flow,
    cycle: 0,
    edges: new Map(),
    nodes: new Map(),
  };
  if (scene.animate !== "relay") return relay;
  const drawn = scene.edges.filter((e) => e.points.length > 1);
  if (!drawn.length) return relay;
  const raw = new Map<string, number>();
  const steps = [...new Set(drawn.flatMap((e) => (e.step === undefined ? [] : [e.step])))].sort(
    (a, b) => a - b,
  );
  if (steps.length) {
    for (const e of drawn) raw.set(e.id, e.step === undefined ? 0 : steps.indexOf(e.step) + 1);
  } else {
    // Breadth first from the entry points (nothing points at them); a loop with none starts at 0.
    const into = new Set(drawn.map((e) => e.to));
    const level = new Map<string, number>();
    const queue = [...new Set(drawn.map((e) => e.from))].filter((id) => !into.has(id));
    for (const id of queue) level.set(id, 0);
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i] ?? "";
      const l = level.get(id) ?? 0;
      for (const e of drawn)
        if (e.from === id && !level.has(e.to)) {
          level.set(e.to, l + 1);
          queue.push(e.to);
        }
    }
    for (const e of drawn) raw.set(e.id, level.get(e.from) ?? 0);
  }
  // At most eight beats, so a large diagram still loops in about six seconds.
  const distinct = [...new Set(raw.values())].sort((a, b) => a - b);
  const beatOf = (v: number) => {
    const i = distinct.indexOf(v);
    return distinct.length > MAX_BEATS ? Math.floor((i * MAX_BEATS) / distinct.length) : i;
  };
  let last = 0;
  for (const e of drawn) {
    const b = beatOf(raw.get(e.id) ?? 0);
    last = Math.max(last, b);
    const t0 = FIRST + b * BEAT;
    relay.edges.set(e.id, { t0, t1: t0 + DRAW, stepped: e.step !== undefined });
  }
  relay.cycle = Math.max(3, (FIRST + last * BEAT + DRAW + HOLD) / END);
  // A node lights when the first line into it arrives; an entry point when its first line leaves.
  const nodes = new Set(scene.nodes.map((nd) => nd.id));
  const leaves = new Map<string, number>();
  for (const e of drawn) {
    const b = relay.edges.get(e.id);
    if (!b) continue;
    if (nodes.has(e.to)) relay.nodes.set(e.to, Math.min(relay.nodes.get(e.to) ?? b.t1, b.t1));
    if (nodes.has(e.from)) leaves.set(e.from, Math.min(leaves.get(e.from) ?? b.t0, b.t0));
  }
  for (const [id, at] of leaves) if (!relay.nodes.has(id)) relay.nodes.set(id, at);
  return relay;
}

/** A numbered edge's beat as packet timing, so its step badge pings when its line starts. */
function relayMotion(ctx: Ctx, id: string): Motion | undefined {
  const b = ctx.relay.edges.get(id);
  return b?.stepped
    ? { cycle: ctx.relay.cycle, start: b.t0, travel: DRAW, begin: 0, stepped: true }
    : undefined;
}

/**
 * The lit copy of one line: revealed along the path by a mask (so a dashed line stays dashed while
 * it draws), a dot at the drawing end, and the lit arrowhead once it arrives.
 */
function relayLine(
  ctx: Ctx,
  e: SceneEdge,
  d: string,
  heads: string,
  b: Beat,
  width: number,
  dash: string,
): string {
  const { cycle, color } = ctx.relay;
  const loop = `dur="${secs(cycle)}" repeatCount="indefinite"`;
  const kt = (times: number[]) => keyTimes(times, cycle);
  const end = END * cycle;
  const gone = GONE * cycle;
  const id = `${ctx.prefix}rm-${e.id}`;
  const reverse = e.arrow === "start";
  const hide = reverse ? "-1" : "1";
  // User space: a straight line's bounding box has no height, which would hide it entirely.
  ctx.defs.push(
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${ctx.scene.width}" height="${ctx.scene.height}">` +
      `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${n(width + 8)}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${hide}">` +
      `<animate attributeName="stroke-dashoffset" values="${hide};${hide};0;0;${hide}" keyTimes="${kt([0, b.t0, b.t1, gone, cycle])}" ${loop}/></path></mask>`,
  );
  const show = (from: number) =>
    `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${kt([0, from, from + 0.05, end, gone, cycle])}" ${loop}/>`;
  const r = e.line === "thick" ? 3.6 : 3;
  return (
    `<g mask="url(#${id})" opacity="0"><path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"${dash}/>${show(b.t0)}</g>` +
    (heads ? `<g opacity="0">${heads}${show(b.t1)}</g>` : "") +
    `<circle r="${r}" fill="${color}" opacity="0">` +
    `<animateMotion path="${d}" ${loop} calcMode="linear" keyPoints="${reverse ? "1;1;0;0" : "0;0;1;1"}" keyTimes="${kt([0, b.t0, b.t1, cycle])}"/>` +
    `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${kt([0, b.t0, b.t0 + 0.05, b.t1 - 0.05, b.t1, cycle])}" ${loop}/></circle>`
  );
}

/** The flat tint plate a node lights up on: behind an icon, or a ring around a card or shape. */
function plate(ctx: Ctx, nd: SceneNode, at: number): string {
  const { cycle, color } = ctx.relay;
  const icon = nd.look === "icon" && nd.iconBox ? nd.iconBox : undefined;
  const b = icon ?? nd.box;
  const pad = icon ? 7 : 4;
  const loop = `dur="${secs(cycle)}" repeatCount="indefinite"`;
  const times = keyTimes([0, at, at + 0.15, END * cycle, GONE * cycle, cycle], cycle);
  return (
    `<rect x="${n(b.x - pad)}" y="${n(b.y - pad)}" width="${n(b.w + 2 * pad)}" height="${n(b.h + 2 * pad)}" rx="${icon ? 10 : 12}" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-opacity="0.6" stroke-width="1" opacity="0">` +
    `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${times}" ${loop}/></rect>`
  );
}

// ---------------------------------------------------------------- nodes

export function shapePath(shape: SceneNode["shape"], b: Box): string {
  const outline = shapeOutline(shape, b);
  if (outline) return outline;
  const { x, y, w, h } = b;
  switch (shape) {
    case "box":
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="4"/>`;
    case "pill":
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}"/>`;
    case "circle":
      return `<ellipse cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}"/>`;
    case "diamond":
      return `<path d="M${n(x + w / 2)} ${n(y)} L${n(x + w)} ${n(y + h / 2)} L${n(x + w / 2)} ${n(y + h)} L${n(x)} ${n(y + h / 2)} Z"/>`;
    case "hexagon": {
      const k = Math.min(16, w / 4);
      return `<path d="M${n(x + k)} ${n(y)} H${n(x + w - k)} L${n(x + w)} ${n(y + h / 2)} L${n(x + w - k)} ${n(y + h)} H${n(x + k)} L${n(x)} ${n(y + h / 2)} Z"/>`;
    }
    case "cylinder": {
      const ry = 8;
      return `<path d="M${n(x)} ${n(y + ry)} A${n(w / 2)} ${ry} 0 0 1 ${n(x + w)} ${n(y + ry)} V${n(y + h - ry)} A${n(w / 2)} ${ry} 0 0 1 ${n(x)} ${n(y + h - ry)} Z"/><path d="M${n(x)} ${n(y + ry)} A${n(w / 2)} ${ry} 0 0 0 ${n(x + w)} ${n(y + ry)}" fill="none"/>`;
    }
    case "queue": {
      const rx = 10;
      return `<path d="M${n(x + rx)} ${n(y)} H${n(x + w - rx)} A${rx} ${n(h / 2)} 0 0 1 ${n(x + w - rx)} ${n(y + h)} H${n(x + rx)} A${rx} ${n(h / 2)} 0 0 1 ${n(x + rx)} ${n(y)} Z"/><path d="M${n(x + w - rx)} ${n(y)} A${rx} ${n(h / 2)} 0 0 0 ${n(x + w - rx)} ${n(y + h)}" fill="none"/>`;
    }
    case "document":
      return `<path d="M${n(x)} ${n(y)} H${n(x + w)} V${n(y + h - 10)} Q${n(x + (w * 3) / 4)} ${n(y + h - 20)} ${n(x + w / 2)} ${n(y + h - 10)} T${n(x)} ${n(y + h - 10)} Z"/>`;
    case "note":
      return `<path d="M${n(x)} ${n(y)} H${n(x + w - 14)} L${n(x + w)} ${n(y + 14)} V${n(y + h)} H${n(x)} Z"/><path d="M${n(x + w - 14)} ${n(y)} V${n(y + 14)} H${n(x + w)}" fill="none"/>`;
    case "person": {
      const cx = x + w / 2;
      return `<circle cx="${n(cx)}" cy="${n(y + 14)}" r="13"/><rect x="${n(x)}" y="${n(y + 28)}" width="${n(w)}" height="${n(h - 28)}" rx="16"/>`;
    }
    case "cloud": {
      const sx = w / 100;
      const sy = h / 64;
      const P = (px: number, py: number) => `${n(x + px * sx)} ${n(y + py * sy)}`;
      return `<path d="M${P(22, 62)} C${P(8, 62)} ${P(0, 51)} ${P(2, 41)} C${P(4, 31)} ${P(13, 26)} ${P(22, 28)} C${P(24, 13)} ${P(38, 4)} ${P(52, 8)} C${P(62, 0)} ${P(81, 3)} ${P(85, 18)} C${P(97, 19)} ${P(101, 35)} ${P(95, 44)} C${P(99, 55)} ${P(90, 63)} ${P(79, 62)} Z"/>`;
    }
    case "stack":
      return `<rect x="${n(x + 8)}" y="${n(y)}" width="${n(w - 8)}" height="${n(h - 8)}" rx="6"/><rect x="${n(x + 4)}" y="${n(y + 4)}" width="${n(w - 8)}" height="${n(h - 8)}" rx="6"/><rect x="${n(x)}" y="${n(y + 8)}" width="${n(w - 8)}" height="${n(h - 8)}" rx="6"/>`;
    default:
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="12"/>`;
  }
}

/** The badge pill: layout's measured box, else an estimate on the anchor's top-right corner. */
function badge(ctx: Ctx, label: string, anchor: Box, placed?: Box): string {
  const w = placed?.w ?? Math.max(18, 8 + label.length * 6.4);
  const h = placed?.h ?? 16;
  const x = placed?.x ?? anchor.x + anchor.w - w / 2 - 2;
  const y = placed?.y ?? anchor.y - 7;
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}" fill="${ctx.t.stepFill}"/><text x="${n(x + w / 2)}" y="${n(y + h / 2 + 3.5)}" font-size="10" font-weight="600" fill="${ctx.t.stepText}" text-anchor="middle">${esc(label)}</text>`;
}

function node(ctx: Ctx, nd: SceneNode): string {
  const parts: string[] = [];
  const bg =
    ctx.scene.background && ctx.scene.background !== "transparent"
      ? ctx.scene.background
      : ctx.t.background;
  if (nd.look === "icon") {
    if (nd.icon && nd.iconBox) parts.push(icon(ctx, nd.icon, nd.iconBox, nd.color));
    parts.push(text(nd.label, nd.labelBox, nd.ink ?? ctx.t.text));
    if (nd.note && nd.noteBox) parts.push(text(nd.note, nd.noteBox, nd.inkMuted ?? ctx.t.muted));
    if (nd.badge && nd.iconBox) parts.push(badge(ctx, nd.badge, nd.iconBox, nd.badgeBox));
  } else if (nd.look === "card") {
    const b = nd.box;
    const stroke = nd.color ?? ctx.t.border;
    parts.push(
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="8" fill="${ctx.t.surface}" stroke="${stroke}" stroke-width="1"/>`,
    );
    if (nd.color) {
      parts.push(
        `<rect x="${n(b.x)}" y="${n(b.y + 8)}" width="3" height="${n(b.h - 16)}" rx="1.5" fill="${nd.color}"/>`,
      );
    }
    if (nd.icon && nd.iconBox) parts.push(icon(ctx, nd.icon, nd.iconBox, undefined, ctx.t.surface));
    parts.push(text(nd.label, nd.labelBox, ctx.t.text, "start"));
    if (nd.note && nd.noteBox) parts.push(text(nd.note, nd.noteBox, ctx.t.muted, "start"));
    if (nd.badge) parts.push(badge(ctx, nd.badge, nd.box, nd.badgeBox));
  } else {
    const stroke = nd.color ?? (ctx.t.name === "dark" ? "#6e7681" : "#8b95a1");
    const fill = nd.color
      ? mixHex(nd.color, bg, ctx.t.name === "dark" ? 0.16 : 0.1)
      : ctx.t.surface;
    const outline = (nd.bpmn ? notationShape(nd) : undefined) ?? shapePath(nd.shape, nd.box);
    parts.push(
      `<g fill="${fill}" stroke="${stroke}" stroke-width="1.25">${outline}${notationMarks(nd, stroke, 1.25)}</g>`,
    );
    if (nd.icon && nd.iconBox) parts.push(icon(ctx, nd.icon, nd.iconBox, nd.color, fill));
    parts.push(text(nd.label, nd.labelBox, nd.ink ?? ctx.t.text));
    if (nd.note && nd.noteBox) parts.push(text(nd.note, nd.noteBox, nd.inkMuted ?? ctx.t.muted));
    if (nd.badge) parts.push(badge(ctx, nd.badge, nd.box, nd.badgeBox));
  }
  const inner = parts.join("");
  const body = nd.url
    ? `<a href="${esc(nd.url)}" xlink:href="${esc(nd.url)}" target="_blank">${inner}</a>`
    : inner;
  return `<g id="${ctx.prefix}n-${nd.id}">${body}</g>`;
}

// ---------------------------------------------------------------- legend

/** The key for line styles: a sample of each line in the edge color, its meaning beside it. */
function legend(ctx: Ctx, l: SceneLegend): string {
  const b = l.box;
  const parts = [
    `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="6" fill="${ctx.t.surface}" stroke="${ctx.t.border}" stroke-width="1"/>`,
  ];
  for (const item of l.items) {
    const s = item.swatch;
    const { width, dash } = stroke(item.line);
    const y = s.y + s.h / 2;
    parts.push(
      `<path d="M${n(s.x)} ${n(y)} H${n(s.x + s.w)}" fill="none" stroke="${ctx.t.edge}" stroke-width="${width}"${dash}/>`,
    );
    parts.push(text(item.label, item.labelBox, ctx.t.text, "start"));
  }
  return `<g id="${ctx.prefix}legend">${parts.join("")}</g>`;
}

// ---------------------------------------------------------------- document

export const FLOW_CSS = `@keyframes sdw-flow{to{stroke-dashoffset:-20}}.sdw-flow{animation:sdw-flow 1.1s linear infinite}.sdw-solid{stroke-dasharray:7 3}`;

export function renderSvg(scene: Scene, opts: SvgOptions = {}): string {
  if (scene.skin === "stage") return renderStage(scene, opts);
  const t = tokensFor(scene);
  const prefix = opts.idPrefix ? `${opts.idPrefix.replace(/[^A-Za-z0-9_-]/g, "")}-` : "";
  const ctx: Ctx = {
    t,
    prefix,
    scene,
    motion: motionPlan(scene),
    relay: relayPlan(scene, t),
    symbols: new Map(),
    defs: [],
  };
  const { width: W, height: H } = scene;
  const titleId = `${prefix}sdw-title`;
  const descId = `${prefix}sdw-desc`;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${titleId} ${descId}" font-family="${esc(FONT_STACK)}">`,
  );
  out.push(
    `<title id="${titleId}">${esc(scene.title?.lines.join(" ") ?? "Architecture diagram")}</title>`,
  );
  out.push(`<desc id="${descId}">${esc(scene.description)}</desc>`);
  if (scene.animate === "flow") out.push(`<style>${FLOW_CSS}</style>`);
  const defsAt = out.length;
  if (scene.background !== "transparent") {
    out.push(`<rect width="${W}" height="${H}" fill="${scene.background ?? t.background}"/>`);
  }
  if (scene.title && scene.titleBox) out.push(text(scene.title, scene.titleBox, t.text, "start"));
  if (scene.subtitle && scene.subtitleBox)
    out.push(text(scene.subtitle, scene.subtitleBox, t.muted, "start"));
  if (scene.journey) out.push(journeyClassic(scene, t));
  // Pools and lanes are bands with a label strip; everything else is a frame and a header.
  const lanes = new Map(scene.groups.map((g) => [g.id, g.lane ? laneClassic(g, t) : undefined]));
  for (const g of scene.groups)
    out.push(`<g id="${ctx.prefix}g-${g.id}">${lanes.get(g.id)?.frame ?? groupFrame(g)}</g>`);
  for (const e of scene.edges) out.push(edge(ctx, e, scene.routing));
  for (const e of scene.edges) {
    const label = edgeLabel(ctx, e);
    if (label) out.push(label);
  }
  for (const g of scene.groups) {
    const header = lanes.get(g.id)?.header ?? groupHeader(ctx, g);
    if (header) out.push(`<g id="${ctx.prefix}gh-${g.id}">${header}</g>`);
  }
  for (const nd of scene.nodes) {
    const at = ctx.relay.nodes.get(nd.id);
    if (at !== undefined) out.push(plate(ctx, nd, at));
  }
  for (const nd of scene.nodes) out.push(node(ctx, nd));
  if (scene.legend?.items.length) out.push(legend(ctx, scene.legend));
  if (ctx.defs.length) out.splice(defsAt, 0, `<defs>${ctx.defs.join("")}</defs>`);
  out.push("</svg>");
  return `${out.join("\n")}\n`;
}
