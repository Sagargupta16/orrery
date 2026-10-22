// Edges: dim hairline wires with open chevrons, the story's lit trace, and the packets that ride them.

import { mixHex } from "../../color.ts";
import type { Point, SceneEdge } from "../../types.ts";
import { erEndsStage } from "../er.ts";
import { flowMarks } from "../notation.ts";
import { edgePath, length, n, trim } from "../svg.ts";
import { type Ctx, stroke } from "./ctx.ts";
import { COMET, EASE, FADE, kt, lit, loop, RAMP, type Run, show } from "./timing.ts";

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

export interface Wire {
  d: string;
  /** Length of the drawn line in scene units. */
  len: number;
  dash: string;
  width: number;
  heads: { end?: [Point, Point]; start?: [Point, Point] };
}

export function wireOf(ctx: Ctx, e: SceneEdge): Wire | undefined {
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

export function edgeBase(ctx: Ctx, e: SceneEdge, w: Wire): string {
  const { k } = ctx;
  const flow =
    ctx.scene.animate === "flow"
      ? ` class="sdw-flow${e.line === "solid" || e.line === "thick" ? " sdw-solid" : ""}"`
      : "";
  const heads = [w.heads.end, w.heads.start]
    .map((hd) => (hd ? chevron(ctx, hd[0], hd[1], k.line, k.arrow) : ""))
    .join("");
  const marks = e.flow
    ? flowMarks(e, mixHex(k.line, ctx.t.background, k.arrow), w.width, k.tile)
    : "";
  const ends = e.card ? erEndsStage(ctx, e) : "";
  return `<path d="${w.d}" fill="none" ${stroke(k.line, k.wire, w.width)} stroke-linecap="round" stroke-linejoin="round"${w.dash}${flow}/>${heads}${marks}${ends}`;
}

/** The story's lit trace over one edge: it grows behind the packet and holds until the fade. */
export function edgeLit(ctx: Ctx, e: SceneEdge, w: Wire, runs: Run[]): string {
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
  // A flow's own markers (a message flow's hollow head) go back on top of the lit trace.
  if (e.flow)
    parts.push(
      flowMarks(e, mixHex(ctx.k.line, ctx.t.background, ctx.k.arrow), w.width, ctx.k.tile),
    );
  return parts.join("");
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

/** The moving layer: a comet and a packet for each story run, a small packet for each side flow. */
export function motion(ctx: Ctx, wires: Map<string, Wire | undefined>): string {
  const { k, h } = ctx;
  const moving: string[] = [];
  for (const e of ctx.scene.edges) {
    const w = wires.get(e.id);
    if (!w) continue;
    const color = e.color ?? k.tint;
    for (const run of ctx.story.runs.get(e.id) ?? [])
      moving.push(comet(ctx, w.d, run, color, w.len), packet(ctx, w.d, run, color, 2.5 * h));
    const side = ctx.story.side.get(e.id);
    if (side) moving.push(packet(ctx, w.d, side, color, 2 * h));
  }
  return moving.length ? `<g id="${ctx.prefix}story">${moving.join("")}</g>` : "";
}
