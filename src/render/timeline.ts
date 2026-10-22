// Drawing for the timeline grid (Scene.timeline): the date axis and its ticks, the lane bands,
// the bars and markers in their status styles, the today marker and the status key, in the
// classic and stage skins. Item labels and icons are the scene's nodes, drawn after this layer.
//
// Called from: src/render/svg.ts renderSvg (timelineClassic) and src/render/stage/index.ts
// renderStage (timelineStage), where journeyClassic and journeyStage are called: after the title,
// before groups, edges and nodes. Both return "" when the scene has no timeline.
//
// Motion (SMIL, so GitHub keeps it): time sweeps left to right and each bar grows as it passes,
// each marker pops in on its date, everything holds, then the loop starts again; the today chip
// pulses on its own clock. A still scene (animate: none, every PNG) draws the finished frame.

import { ensureContrast, mixHex } from "../color.ts";
import type {
  SceneTimeline,
  TimelineItem,
  TimelineKey,
  TimelineLane,
  TimelineToday,
} from "../layout/timeline/index.ts";
import type { StageInk, Theme } from "../themes.ts";
import type { Box, ItemStatus, Scene } from "../types.ts";
import type { Ctx as StageCtx } from "./stage/ctx.ts";
import { HEADER, KEY, mono, sizeFor } from "./stage/text.ts";
import { keyTimes, n, secs, text } from "./svg.ts";

/** Lane colors in order, after the vendor-neutral palette of the classic skin. */
export const LANE_COLORS: Record<"light" | "dark", string[]> = {
  light: ["#2563eb", "#7c3aed", "#0d9488", "#db2777", "#4f46e5", "#0891b2", "#65a30d"],
  dark: ["#60a5fa", "#a78bfa", "#2dd4bf", "#f472b6", "#818cf8", "#22d3ee", "#a3e635"],
};
const NEUTRAL = { light: "#64748b", dark: "#94a3b8" };
/** At risk is amber in every skin; today is red in classic. */
export const RISK = { light: "#b45309", dark: "#f59e0b" };
export const TODAY = { light: "#dc2626", dark: "#f87171" };

const canvasOf = (scene: Scene, t: Theme) =>
  scene.background && scene.background !== "transparent" ? scene.background : t.background;

/** The color a lane draws its items in: its own, else its palette slot, else neutral. */
export function laneColor(lane: TimelineLane | undefined, theme: "light" | "dark"): string {
  if (lane?.color) return lane.color;
  const palette = LANE_COLORS[theme];
  return lane && lane.slot >= 0
    ? (palette[lane.slot % palette.length] ?? NEUTRAL[theme])
    : NEUTRAL[theme];
}

const rect = (b: Box, rx: number, paint: string, inner = "") => {
  const head = `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}"${rx ? ` rx="${n(rx)}"` : ""} ${paint}`;
  return inner ? `${head}>${inner}</rect>` : `${head}/>`;
};

const diamond = (cx: number, cy: number, r: number) =>
  `M${n(cx)} ${n(cy - r)} L${n(cx + r)} ${n(cy)} L${n(cx)} ${n(cy + r)} L${n(cx - r)} ${n(cy)} Z`;

// ---------------------------------------------------------------- motion

/** Seconds: the sweep across the axis, the hold on the finished roadmap, the fade before the loop. */
const HOLD = 1.6;
const FADE = 0.45;
const PULSE = 1.8;

interface Clock {
  /** Off: a still frame. */
  on: boolean;
  cycle: number;
  /** Seconds into the loop at which the sweep reaches x. */
  at: (x: number) => number;
  /** When the hold ends and when the fade is over. */
  hold: number;
  gone: number;
}

function clockOf(scene: Scene, tl: SceneTimeline): Clock {
  const cols = tl.axis.ticks.length;
  const sweep = Math.min(6, Math.max(3, 0.5 * cols));
  const x0 = tl.axis.box.x;
  const w = Math.max(1, tl.axis.box.w);
  const lead = 0.25;
  const at = (x: number) => lead + sweep * Math.min(1, Math.max(0, (x - x0) / w));
  const hold = lead + sweep + HOLD;
  const gone = hold + FADE;
  return { on: scene.animate !== "none", cycle: gone + 0.3, at, hold, gone };
}

const loopOf = (c: Clock) => `dur="${secs(c.cycle)}" repeatCount="indefinite"`;

/** A bar that grows from its start to its end as the sweep passes, then fades with the rest. */
function grow(c: Clock, b: Box): string {
  if (!c.on) return "";
  const t0 = c.at(b.x);
  const t1 = Math.max(t0 + 0.12, c.at(b.x + b.w));
  const kt = keyTimes([0, t0, t1, c.hold, c.gone, c.cycle], c.cycle);
  return (
    `<animate attributeName="width" values="0;0;${n(b.w)};${n(b.w)};${n(b.w)};${n(b.w)}" keyTimes="${kt}" ${loopOf(c)}/>` +
    `<animate attributeName="opacity" values="1;1;1;1;0;0" keyTimes="${kt}" ${loopOf(c)}/>`
  );
}

/** Shown from `t` (a marker on its date, a glyph when its bar is full) until the fade. */
function popAt(c: Clock, t: number): string {
  if (!c.on) return "";
  const kt = keyTimes([0, t, t + 0.12, c.hold, c.gone, c.cycle], c.cycle);
  return `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${kt}" ${loopOf(c)}/>`;
}

/** The today line, in its runs between the text it stops short of. */
const todayLine = (td: TimelineToday, paint: string) =>
  `<path d="${td.segments.map((sg) => `M${n(td.x)} ${n(sg.y0)} V${n(sg.y1)}`).join(" ")}" fill="none" ${paint}/>`;

const hidden = (c: Clock) => (c.on ? ` opacity="0"` : "");

/** A ring that swells off the today chip and fades, forever. */
function pulse(chip: Box, color: string, rx: number, width: number): string {
  const loop = `dur="${PULSE}s" repeatCount="indefinite"`;
  return (
    `<rect x="${n(chip.x)}" y="${n(chip.y)}" width="${n(chip.w)}" height="${n(chip.h)}" rx="${n(rx)}" fill="none" stroke="${color}" stroke-width="${n(width)}" opacity="0">` +
    `<animate attributeName="stroke-width" values="${n(width)};${n(width * 7)}" ${loop}/>` +
    `<animate attributeName="opacity" values="0.55;0" ${loop}/></rect>`
  );
}

// ---------------------------------------------------------------- shared shapes

/** Glyphs at the end of a full bar: a check for done, an exclamation in a triangle for at risk. */
function glyph(it: TimelineItem, color: string, w: number) {
  const { status, box: b } = it;
  if (!it.mark || (status !== "done" && status !== "at-risk")) return "";
  const cx = b.x + b.w - 13;
  const cy = b.y + b.h / 2;
  if (status === "done")
    return `<path d="M${n(cx - 4.5)} ${n(cy + 0.2)} L${n(cx - 1.4)} ${n(cy + 3.2)} L${n(cx + 4.6)} ${n(cy - 3.4)}" fill="none" stroke="${color}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return (
    `<path d="M${n(cx)} ${n(cy - 5.5)} L${n(cx + 6)} ${n(cy + 4.8)} L${n(cx - 6)} ${n(cy + 4.8)} Z" fill="none" stroke="${color}" stroke-width="${n(w)}" stroke-linejoin="round"/>` +
    `<path d="M${n(cx)} ${n(cy - 1.8)} V${n(cy + 1.2)}" stroke="${color}" stroke-width="${n(w)}" stroke-linecap="round"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy + 3.1)}" r="${n(w * 0.55)}" fill="${color}"/>`
  );
}

// ---------------------------------------------------------------- classic

interface Paint {
  fill: string;
  stroke: string;
  width: number;
  dash?: string;
  /** A soft ring around an item in progress. */
  ring?: string;
  mark: string;
}

/** How each status draws in classic: done filled and quiet, in progress lit, planned outlined. */
function classicPaint(status: ItemStatus | undefined, c: string, t: Theme, bg: string): Paint {
  const dark = t.name === "dark";
  const risk = RISK[t.name];
  switch (status) {
    case "done": {
      const quiet = mixHex(c, t.muted, 0.45);
      return {
        fill: mixHex(quiet, bg, dark ? 0.24 : 0.17),
        stroke: mixHex(quiet, bg, dark ? 0.55 : 0.5),
        width: 1,
        mark: ensureContrast(mixHex(quiet, bg, 0.9), mixHex(quiet, bg, 0.13), 3),
      };
    }
    case "active":
      return {
        fill: mixHex(c, bg, dark ? 0.3 : 0.2),
        stroke: c,
        width: 1.5,
        ring: c,
        mark: c,
      };
    case "planned":
      return {
        fill: mixHex(c, bg, dark ? 0.08 : 0.05),
        stroke: mixHex(c, bg, dark ? 0.85 : 0.8),
        width: 1.25,
        dash: "5 3",
        mark: c,
      };
    case "at-risk":
      return {
        fill: mixHex(risk, bg, dark ? 0.24 : 0.16),
        stroke: risk,
        width: 1.5,
        mark: ensureContrast(risk, mixHex(risk, bg, 0.16), 3),
      };
    default:
      return {
        fill: mixHex(c, bg, dark ? 0.24 : 0.15),
        stroke: mixHex(c, bg, dark ? 0.65 : 0.55),
        width: 1,
        mark: c,
      };
  }
}

const stroked = (p: Paint, width = p.width) =>
  `stroke="${p.stroke}" stroke-width="${n(width)}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ""}`;

function classicItem(
  scene: Scene,
  tl: SceneTimeline,
  it: TimelineItem,
  t: Theme,
  c: Clock,
): string {
  const bg = canvasOf(scene, t);
  const color = it.color ?? laneColor(tl.lanes[it.lane], t.name);
  const p = classicPaint(it.status, color, t, bg);
  const b = it.box;
  const parts: string[] = [];
  if (it.shape === "bar") {
    if (p.ring)
      parts.push(
        rect(
          { x: b.x - 3, y: b.y - 3, w: b.w + 6, h: b.h + 6 },
          9,
          `fill="none" stroke="${p.ring}" stroke-opacity="0.22" stroke-width="3"`,
        ),
      );
    // The ghost keeps the bar's place while it grows.
    if (c.on)
      parts.push(
        rect(
          b,
          6,
          `fill="none" stroke="${p.stroke}" stroke-opacity="0.35" stroke-width="1"${p.dash ? ` stroke-dasharray="${p.dash}"` : ""}`,
        ),
      );
    parts.push(rect(b, 6, `fill="${p.fill}" ${stroked(p)}`, grow(c, b)));
    const g = glyph(it, p.mark, 1.6);
    if (g) parts.push(`<g${hidden(c)}>${g}${popAt(c, c.at(b.x + b.w))}</g>`);
  } else {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const r = b.w / 2;
    const nd = scene.nodes.find((x) => x.id === it.id);
    const solid =
      it.status === "planned"
        ? p.fill
        : it.status === "done"
          ? p.stroke
          : it.status === "at-risk"
            ? p.stroke
            : color;
    const body =
      it.shape === "milestone"
        ? `<path d="${diamond(cx, cy, r)}" fill="${solid}" ${it.status === "planned" ? stroked(p) : `stroke="${bg}" stroke-width="1.5"`}/>`
        : nd?.iconBox
          ? // An icon marks the date: a plate under it, in the item's status.
            `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r + 3)}" fill="${t.surface}" ${stroked(p, Math.max(1.25, p.width))}/>`
          : `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${solid}" ${it.status === "planned" ? stroked(p) : `stroke="${bg}" stroke-width="1.5"`}/>`;
    const ring = p.ring
      ? it.shape === "milestone"
        ? `<path d="${diamond(cx, cy, r + 4)}" fill="none" stroke="${p.ring}" stroke-opacity="0.25" stroke-width="3"/>`
        : `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r + 4)}" fill="none" stroke="${p.ring}" stroke-opacity="0.25" stroke-width="3"/>`
      : "";
    parts.push(`<g${hidden(c)}>${ring}${body}${popAt(c, c.at(cx))}</g>`);
  }
  return parts.join("");
}

/** The axis: period cells over tick cells, minor ticks, and the grid lines down the lanes. */
function classicAxis(tl: SceneTimeline, t: Theme, bg: string): string[] {
  const dark = t.name === "dark";
  const head = mixHex(t.text, bg, dark ? 0.1 : 0.06);
  const cell = mixHex(t.text, bg, dark ? 0.05 : 0.03);
  const ink = ensureContrast(t.text, head, 4.5);
  const muted = ensureContrast(t.muted, cell, 4.5);
  const { axis, plot } = tl;
  const parts: string[] = [];
  const inset = (x: number, w: number, y: number, h: number) => ({
    x: x + 1,
    y,
    w: Math.max(0, w - 2),
    h,
  });
  if (axis.upper) {
    const u = axis.upper;
    for (const p of axis.periods) {
      parts.push(rect(inset(p.x, p.w, u.y, u.h - 2), 5, `fill="${head}"`));
      if (p.label && p.labelBox) parts.push(text(p.label, p.labelBox, ink, "start"));
    }
  }
  const lo = axis.lower;
  for (const tk of axis.ticks) {
    parts.push(rect(inset(tk.x, tk.w, lo.y, lo.h), 5, `fill="${cell}"`));
    parts.push(text(tk.label, tk.labelBox, muted, "middle"));
  }
  const tickInk = mixHex(t.text, cell, 0.3);
  for (const x of axis.minor)
    parts.push(
      `<path d="M${n(x)} ${n(lo.y + lo.h - 5)} V${n(lo.y + lo.h)}" stroke="${tickInk}" stroke-width="1"/>`,
    );
  // Grid lines: every column faintly, a period boundary (a new year, a new month) more firmly.
  const bounds = new Set(axis.periods.map((p) => Math.round(p.x * 100)));
  const y0 = plot.y;
  const y1 = plot.y + plot.h;
  for (const tk of axis.ticks.slice(1)) {
    const strong = bounds.has(Math.round(tk.x * 100));
    parts.push(
      `<path d="M${n(tk.x)} ${n(y0)} V${n(y1)}" stroke="${mixHex(t.text, bg, strong ? (dark ? 0.22 : 0.16) : dark ? 0.1 : 0.07)}" stroke-width="1"/>`,
    );
  }
  return parts;
}

function classicLanes(tl: SceneTimeline, t: Theme, bg: string): string[] {
  const dark = t.name === "dark";
  const head = mixHex(t.text, bg, dark ? 0.1 : 0.06);
  const bands = [mixHex(t.text, bg, dark ? 0.045 : 0.03), mixHex(t.text, bg, dark ? 0.022 : 0.012)];
  const ink = ensureContrast(t.text, head, 4.5);
  const parts: string[] = [];
  tl.lanes.forEach((l, i) => {
    parts.push(rect(l.box, 6, `fill="${bands[i % 2] ?? head}"`));
    if (l.header) {
      parts.push(rect(l.header, 6, `fill="${head}"`));
      parts.push(
        rect(
          { x: l.header.x, y: l.header.y + 8, w: 3, h: Math.max(0, l.header.h - 16) },
          1.5,
          `fill="${laneColor(l, t.name)}"`,
        ),
      );
      if (l.label && l.labelBox) parts.push(text(l.label, l.labelBox, ink, "start"));
    }
  });
  return parts;
}

function classicToday(tl: SceneTimeline, t: Theme, c: Clock): string {
  const td = tl.today;
  if (!td) return "";
  const red = TODAY[t.name];
  const chip = td.chip;
  return (
    `<g>` +
    todayLine(td, `stroke="${red}" stroke-width="1.5" stroke-opacity="0.85"`) +
    (c.on ? pulse(chip, red, chip.h / 2, 1) : "") +
    rect(chip, chip.h / 2, `fill="${red}"`) +
    text(td.label, td.labelBox, ensureContrast("#ffffff", red, 4.5), "start") +
    `</g>`
  );
}

function classicKeySwatch(k: TimelineKey, t: Theme, bg: string, color: string): string {
  const s = k.swatch;
  if (k.kind === "milestone")
    return `<path d="${diamond(s.x + s.w / 2, s.y + s.h / 2, 6)}" fill="${color}" stroke="${bg}" stroke-width="1.5"/>`;
  const p = classicPaint(k.kind, color, t, bg);
  return rect(s, 3, `fill="${p.fill}" ${stroked(p)}`);
}

export function timelineClassic(scene: Scene, t: Theme): string {
  const tl = scene.timeline;
  if (!tl) return "";
  const bg = canvasOf(scene, t);
  const c = clockOf(scene, tl);
  const parts: string[] = [...classicLanes(tl, t, bg), ...classicAxis(tl, t, bg)];
  for (const it of tl.items) parts.push(classicItem(scene, tl, it, t, c));
  parts.push(classicToday(tl, t, c));
  if (tl.key) {
    const color = laneColor(
      tl.lanes.find((l) => l.slot >= 0),
      t.name,
    );
    for (const k of tl.key.items) {
      parts.push(classicKeySwatch(k, t, bg, color));
      parts.push(text(k.label, k.labelBox, t.text, "start"));
    }
  }
  return `<g>${parts.join("")}</g>`;
}

// ---------------------------------------------------------------- stage

/** How each status draws in stage: tinted plates on the opaque tile, the tint lit for progress. */
function stagePaint(
  status: ItemStatus | undefined,
  tint: string,
  k: StageInk,
  t: Theme,
  h: number,
): { plate: string; ring?: string; mark: string; solid: string } {
  const risk = RISK[t.name];
  const line = (c: string, a: number, w: number, dash = "") =>
    `stroke="${c}" stroke-opacity="${n(a)}" stroke-width="${n(w * h)}"${dash}`;
  const fill = (c: string, a: number) => `fill="${c}" fill-opacity="${n(a)}"`;
  const dash = ` stroke-dasharray="${n(4 * h)} ${n(3 * h)}"`;
  switch (status) {
    case "done":
      return {
        plate: `${fill(k.line, 0.07)} ${line(k.line, k.frame + 0.06, 1)}`,
        mark: k.glyph,
        solid: k.glyph,
      };
    case "active":
      return {
        plate: `${fill(tint, 0.24)} ${line(tint, 0.95, 1.4)}`,
        ring: tint,
        mark: tint,
        solid: tint,
      };
    case "planned":
      return { plate: `fill="none" ${line(tint, 0.7, 1, dash)}`, mark: tint, solid: k.tile };
    case "at-risk":
      return { plate: `${fill(risk, 0.18)} ${line(risk, 0.85, 1.2)}`, mark: risk, solid: risk };
    default:
      return { plate: `${fill(tint, 0.13)} ${line(tint, 0.55, 1)}`, mark: tint, solid: tint };
  }
}

function stageItem(
  scene: Scene,
  it: TimelineItem,
  k: StageInk,
  t: Theme,
  h: number,
  c: Clock,
): string {
  const tint = it.color ?? k.tint;
  const p = stagePaint(it.status, tint, k, t, h);
  const b = it.box;
  const parts: string[] = [];
  if (it.shape === "bar") {
    if (p.ring)
      parts.push(
        rect(
          { x: b.x - 3 * h, y: b.y - 3 * h, w: b.w + 6 * h, h: b.h + 6 * h },
          5 * h,
          `fill="none" stroke="${p.ring}" stroke-opacity="0.2" stroke-width="${n(3 * h)}"`,
        ),
      );
    // The opaque tile stops the canvas grid at the bar; the ghost holds its place while it grows.
    parts.push(
      rect(
        b,
        3 * h,
        `fill="${k.tile}" stroke="${k.line}" stroke-opacity="${n(k.hair)}" stroke-width="${n(h)}"`,
      ),
    );
    parts.push(rect(b, 3 * h, p.plate, grow(c, b)));
    const g = glyph(it, p.mark, 1.4 * h);
    if (g) parts.push(`<g${hidden(c)}>${g}${popAt(c, c.at(b.x + b.w))}</g>`);
  } else {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const r = b.w / 2;
    const nd = scene.nodes.find((x) => x.id === it.id);
    const edge =
      it.status === "planned"
        ? `stroke="${tint}" stroke-opacity="0.8" stroke-width="${n(h)}" stroke-dasharray="${n(3 * h)} ${n(2 * h)}"`
        : `stroke="${k.tile}" stroke-width="${n(1.5 * h)}"`;
    const body =
      it.shape === "milestone"
        ? `<path d="${diamond(cx, cy, r)}" fill="${p.solid}" ${edge}/>`
        : nd?.iconBox
          ? ""
          : `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${p.solid}" ${edge}/>`;
    const ring = p.ring
      ? it.shape === "milestone"
        ? `<path d="${diamond(cx, cy, r + 4 * h)}" fill="none" stroke="${p.ring}" stroke-opacity="0.3" stroke-width="${n(2 * h)}"/>`
        : `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r + 4 * h)}" fill="none" stroke="${p.ring}" stroke-opacity="0.3" stroke-width="${n(2 * h)}"/>`
      : "";
    if (ring || body) parts.push(`<g${hidden(c)}>${ring}${body}${popAt(c, c.at(cx))}</g>`);
  }
  return parts.join("");
}

/** Stage: `h` is one display pixel in scene units; `ctx` is the stage context (unused clocks). */
export function timelineStage(
  scene: Scene,
  k: StageInk,
  t: Theme,
  h: number,
  _ctx?: StageCtx,
): string {
  const tl = scene.timeline;
  if (!tl) return "";
  const c = clockOf(scene, tl);
  const hair = `stroke="${k.line}" stroke-opacity="${n(k.hair)}" stroke-width="${n(h)}"`;
  const panel = (a: number) => `fill="${k.line}" fill-opacity="${n(a)}"`;
  const parts: string[] = [];
  const { axis, plot } = tl;
  // Lane bands and headers, one header size for all so the column reads as one set of caps.
  const named = tl.lanes.filter((l) => l.header && l.label && l.labelBox);
  const laneSize = Math.min(
    HEADER.size,
    ...named.map((l) =>
      sizeFor(
        l.label?.lines ?? [],
        HEADER,
        (l.header?.x ?? 0) + (l.header?.w ?? 0) - (l.labelBox?.x ?? 0) - 8,
      ),
    ),
  );
  tl.lanes.forEach((l, i) => {
    parts.push(rect(l.box, 2 * h, `${panel(i % 2 ? 0 : k.panel)} ${hair}`));
    if (l.header && l.label && l.labelBox) {
      parts.push(rect(l.header, 2 * h, `${panel(k.panel * 2)} ${hair}`));
      parts.push(
        mono(
          l.label.lines,
          HEADER,
          laneSize,
          {
            x: l.labelBox.x,
            y: l.labelBox.y,
            lead: l.labelBox.h / Math.max(1, l.label.lines.length),
          },
          k.header,
          "start",
        ),
      );
    }
  });
  // The axis: period panels in the header color, tick panels with their labels, minor ticks.
  if (axis.upper) {
    const u = axis.upper;
    const size = Math.min(
      HEADER.size,
      ...axis.periods.flatMap((p) => (p.label ? [sizeFor(p.label.lines, HEADER, p.w - 14)] : [])),
    );
    for (const p of axis.periods) {
      parts.push(
        rect(
          { x: p.x + h, y: u.y, w: Math.max(0, p.w - 2 * h), h: u.h - 2 },
          2 * h,
          `${panel(k.panel * 2)} ${hair}`,
        ),
      );
      if (p.label && p.labelBox)
        parts.push(
          mono(
            p.label.lines,
            HEADER,
            size,
            { x: p.labelBox.x, y: u.y, lead: u.h - 2 },
            k.header,
            "start",
          ),
        );
    }
  }
  const lo = axis.lower;
  const tickSize = Math.min(
    KEY.size,
    ...axis.ticks.map((tk) => sizeFor(tk.label.lines, KEY, tk.w - 10)),
  );
  for (const tk of axis.ticks) {
    parts.push(
      rect(
        { x: tk.x + h, y: lo.y, w: Math.max(0, tk.w - 2 * h), h: lo.h },
        2 * h,
        `${panel(k.panel)} ${hair}`,
      ),
    );
    parts.push(
      mono(
        tk.label.lines,
        KEY,
        tickSize,
        { x: tk.x + tk.w / 2, y: lo.y, lead: lo.h },
        t.text,
        "middle",
      ),
    );
  }
  for (const x of axis.minor)
    parts.push(
      `<path d="M${n(x)} ${n(lo.y + lo.h - 5 * h)} V${n(lo.y + lo.h)}" fill="none" stroke="${k.line}" stroke-opacity="${n(k.wire)}" stroke-width="${n(h)}"/>`,
    );
  const bounds = new Set(axis.periods.map((p) => Math.round(p.x * 100)));
  for (const tk of axis.ticks.slice(1)) {
    const strong = bounds.has(Math.round(tk.x * 100));
    parts.push(
      `<path d="M${n(tk.x)} ${n(plot.y)} V${n(plot.y + plot.h)}" fill="none" stroke="${k.line}" stroke-opacity="${n(strong ? k.frame : k.hair)}" stroke-width="${n(h)}"/>`,
    );
  }
  for (const it of tl.items) parts.push(stageItem(scene, it, k, t, h, c));
  const td = tl.today;
  if (td) {
    const chip = td.chip;
    const size = sizeFor(["TODAY"], KEY, chip.w - 8);
    parts.push(
      todayLine(td, `stroke="${k.tint}" stroke-opacity="0.9" stroke-width="${n(1.2 * h)}"`) +
        (c.on ? pulse(chip, k.tint, chip.h / 2, h) : "") +
        rect(chip, chip.h / 2, `fill="${k.tint}"`) +
        mono(
          ["Today"],
          KEY,
          size,
          { x: chip.x + chip.w / 2, y: chip.y, lead: chip.h },
          k.onTint,
          "middle",
        ),
    );
  }
  if (tl.key) {
    const size = Math.min(
      KEY.size,
      ...tl.key.items.map((it) => sizeFor(it.label.lines, KEY, it.label.width + 6)),
    );
    for (const it of tl.key.items) {
      const s = it.swatch;
      if (it.kind === "milestone")
        parts.push(
          `<path d="${diamond(s.x + s.w / 2, s.y + s.h / 2, 6)}" fill="${k.tint}" stroke="${k.tile}" stroke-width="${n(1.5 * h)}"/>`,
        );
      else {
        parts.push(rect(s, 2 * h, `fill="${k.tile}"`));
        parts.push(rect(s, 2 * h, stagePaint(it.kind, k.tint, k, t, h).plate));
      }
      parts.push(
        mono(
          it.label.lines,
          KEY,
          size,
          {
            x: it.labelBox.x,
            y: it.labelBox.y,
            lead: it.labelBox.h / Math.max(1, it.label.lines.length),
          },
          t.text,
          "start",
        ),
      );
    }
  }
  return `<g>${parts.join("")}</g>`;
}
