// Drawing for the journey grid (Scene.journey): stage headers, lane bands and the emotion curve,
// under the cards and edges, in classic and in stage.

import { contrast, ensureContrast, mixHex } from "../color.ts";
import type { JourneyCurve } from "../layout/journey/index.ts";
import type { StageInk, Theme } from "../themes.ts";
import type { Box, Point, Scene, TextBlock } from "../types.ts";
import { esc, n } from "./svg.ts";

// Inter's vertical metrics, as svg.ts sets text.
const ASCENT = 0.96875;
const DESCENT = 0.2412;

function text(block: TextBlock, box: Box, color: string, size = block.size, weight = block.weight) {
  if (!block.lines.length) return "";
  const lead = block.lead;
  const first = box.y + (lead - size * (ASCENT + DESCENT)) / 2 + size * ASCENT;
  const tspans = block.lines
    .map((line, i) => `<tspan x="${n(box.x)}" y="${n(first + i * lead)}">${esc(line)}</tspan>`)
    .join("");
  return `<text font-size="${n(size)}"${weight === 600 ? ` font-weight="600"` : ""} fill="${color}">${tspans}</text>`;
}

const rect = (b: Box, rx: number, paint: string) =>
  `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}"${rx ? ` rx="${n(rx)}"` : ""} ${paint}/>`;

/**
 * The emotion curve through the stage dots: a monotone cubic (Fritsch and Butland slopes), so it
 * never swings past a dot and never leaves the band.
 */
export function curvePath(points: Point[]): string {
  const [p0] = points;
  if (!p0) return "";
  let d = `M${n(p0.x)} ${n(p0.y)}`;
  if (points.length < 2) return d;
  const h = points.slice(1).map((q, i) => q.x - (points[i]?.x ?? q.x));
  const slope = points.slice(1).map((q, i) => (q.y - (points[i]?.y ?? q.y)) / (h[i] || 1));
  const m = points.map((_, i) => {
    if (i === 0) return slope[0] ?? 0;
    if (i === points.length - 1) return slope[i - 1] ?? 0;
    const a = slope[i - 1] ?? 0;
    const b = slope[i] ?? 0;
    if (a * b <= 0) return 0;
    const ha = h[i - 1] ?? 1;
    const hb = h[i] ?? 1;
    return (3 * (ha + hb)) / ((2 * hb + ha) / a + (hb + 2 * ha) / b);
  });
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    if (!p || !q) continue;
    const dx = (q.x - p.x) / 3;
    d += ` C${n(p.x + dx)} ${n(p.y + (m[i - 1] ?? 0) * dx)} ${n(q.x - dx)} ${n(q.y - (m[i] ?? 0) * dx)} ${n(q.x)} ${n(q.y)}`;
  }
  return d;
}

/** A face in a dot: eyes and a mouth that smiles, stays flat or frowns with the score. */
function face(c: Point, r: number, score: number, color: string, width: number): string {
  const e = r * 0.36;
  const eye = r * 0.15;
  const my = c.y + r * 0.3;
  const curl = score > 0.5 ? r * 0.32 : score < -0.5 ? -r * 0.32 : 0;
  const mx = r * 0.42;
  const eyes = [-1, 1]
    .map(
      (s) =>
        `<circle cx="${n(c.x + s * e)}" cy="${n(c.y - r * 0.2)}" r="${n(eye)}" fill="${color}"/>`,
    )
    .join("");
  const base = curl < 0 ? my + r * 0.12 : my - (curl ? r * 0.06 : 0);
  return `${eyes}<path d="M${n(c.x - mx)} ${n(base)} Q${n(c.x)} ${n(base + curl * 2)} ${n(c.x + mx)} ${n(base)}" fill="none" stroke="${color}" stroke-width="${n(width)}" stroke-linecap="round"/>`;
}

/** The curve draws itself in once and each dot pops as it passes; a still frame shows it all. */
function drawIn(scene: Scene): {
  dash: string;
  line: string;
  dot: (i: number, count: number) => string;
} {
  if (scene.animate === "none") return { dash: "", line: "", dot: () => "" };
  const total = 1.6;
  return {
    dash: ` pathLength="1" stroke-dasharray="1 1"`,
    line: `<animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;0.2;1" dur="${total}s" fill="freeze"/>`,
    dot: (i, count) => {
      const at = 0.32 + (count > 1 ? (i / (count - 1)) * (total - 0.32) : 0);
      const end = at + 0.25;
      return `<animate attributeName="opacity" values="0;0;1" keyTimes="0;${n(at / end)};1" dur="${n(end)}s" fill="freeze"/>`;
    },
  };
}

/** Sentiment colors: green above, amber around neutral, red below; 3:1 on the band for a mark. */
export function moodColor(score: number, t: Theme, surface: string): string {
  const dark = t.name === "dark";
  const c =
    score > 0.5
      ? dark
        ? "#3fb950"
        : "#1a7f37"
      : score < -0.5
        ? dark
          ? "#f85149"
          : "#cf222e"
        : dark
          ? "#d29922"
          : "#9a6700";
  return ensureContrast(c, surface, 3);
}

export function journeyClassic(scene: Scene, t: Theme): string {
  const j = scene.journey;
  if (!j) return "";
  const dark = t.name === "dark";
  const bg =
    scene.background && scene.background !== "transparent" ? scene.background : t.background;
  const head = mixHex(t.text, bg, dark ? 0.1 : 0.06);
  const bands = [mixHex(t.text, bg, dark ? 0.05 : 0.035), mixHex(t.text, bg, dark ? 0.028 : 0.016)];
  const ink = ensureContrast(t.text, head, 4.5);
  const parts: string[] = [];
  for (const st of j.stages) {
    parts.push(rect(st.box, 6, `fill="${head}"`));
    const b = st.numberBox;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    parts.push(
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(b.w / 2)}" fill="${t.stepFill}"/><text x="${n(cx)}" y="${n(cy + 4.2)}" font-size="12" font-weight="700" fill="${t.stepText}" text-anchor="middle">${esc(st.number)}</text>`,
    );
    parts.push(text(st.label, st.labelBox, ink));
  }
  j.rows.forEach((r, i) => {
    const fill = bands[i % 2] ?? head;
    for (const c of r.cells) parts.push(rect(c, 6, `fill="${fill}"`));
    parts.push(rect(r.header, 6, `fill="${head}"`));
    if (r.color)
      parts.push(
        rect(
          { x: r.header.x, y: r.header.y + 8, w: 3, h: r.header.h - 16 },
          1.5,
          `fill="${r.color}"`,
        ),
      );
    parts.push(text(r.label, r.labelBox, ink));
  });
  if (j.curve) parts.push(emotionClassic(scene, j.curve, t, head, bands[0] ?? head, ink));
  return `<g>${parts.join("")}</g>`;
}

function emotionClassic(
  scene: Scene,
  c: JourneyCurve,
  t: Theme,
  head: string,
  band: string,
  ink: string,
): string {
  const parts: string[] = [];
  parts.push(rect(c.header, 6, `fill="${head}"`));
  parts.push(rect(c.band, 6, `fill="${band}"`));
  parts.push(text(c.label, c.labelBox, ink));
  const muted = ensureContrast(t.muted, head, 4.5);
  for (const end of c.ends) parts.push(text(end.label, end.box, muted));
  // The neutral line, and faint lines at the ends of the scale.
  const x0 = c.band.x + 10;
  const x1 = c.band.x + c.band.w - 10;
  const rule = (y: number, a: number, dash: string) =>
    `<path d="M${n(x0)} ${n(y)} H${n(x1)}" stroke="${mixHex(t.text, band, a)}" stroke-width="1"${dash} fill="none"/>`;
  parts.push(rule(c.zero, 0.35, ` stroke-dasharray="4 3"`));
  for (const end of c.ends) parts.push(rule(c.zero - end.score * c.unit, 0.12, ""));
  const motion = drawIn(scene);
  if (c.points.length > 1)
    parts.push(
      `<path d="${curvePath(c.points)}" fill="none" stroke="${mixHex(t.text, band, 0.7)}" stroke-width="2" stroke-linecap="round"${motion.dash}>${motion.line}</path>`,
    );
  c.points.forEach((p, i) => {
    const score = c.scores[i] ?? 0;
    const fill = moodColor(score, t, band);
    const mark =
      contrast("#ffffff", fill) >= contrast(t.background, fill) ? "#ffffff" : t.background;
    parts.push(
      `<g><circle cx="${n(p.x)}" cy="${n(p.y)}" r="9" fill="${fill}" stroke="${band}" stroke-width="2"/>${face(p, 9, score, mark, 1.4)}${motion.dot(i, c.points.length)}</g>`,
    );
  });
  return parts.join("");
}

// ---------------------------------------------------------------- stage

/** Geist Mono advances every glyph 0.6 em; stage labels are tracked caps. */
const ADVANCE = 0.6;

interface Face {
  size: number;
  weight: 400 | 700;
  caps: boolean;
  track: number;
}
const HEAD: Face = { size: 11, weight: 700, caps: true, track: 0.1 };
const NUM: Face = { size: 11, weight: 700, caps: true, track: 0 };
const END: Face = { size: 9.5, weight: 400, caps: true, track: 0.06 };

/** The size up to the face's own at which every line fits `room`, as stage.ts sizes labels. */
function sizeFor(lines: string[], f: Face, room: number, min = 8): number {
  const widest = Math.max(1, ...lines.map((l) => [...l].length));
  const size = (room + f.size * f.track) / (widest * (ADVANCE + f.track));
  return Math.max(min, Math.floor(Math.min(f.size, size) * 4) / 4);
}

function mono(
  lines: string[],
  f: Face,
  size: number,
  box: Box,
  color: string,
  anchor: "start" | "middle" = "start",
): string {
  if (!lines.length) return "";
  const lead = box.h / lines.length;
  const track = f.track * size;
  const x = anchor === "middle" ? box.x + box.w / 2 + track / 2 : box.x;
  const drop = (f.caps ? 0.355 : 0.33) * size;
  const spans = lines
    .map(
      (line, i) =>
        `<tspan x="${n(x)}" y="${n(box.y + (i + 0.5) * lead + drop)}">${esc(f.caps ? line.toUpperCase() : line)}</tspan>`,
    )
    .join("");
  return `<text font-size="${n(size)}" font-weight="${f.weight}"${track ? ` letter-spacing="${n(track)}"` : ""} fill="${color}"${anchor === "middle" ? ` text-anchor="middle"` : ""}>${spans}</text>`;
}

/** Stage: `h` is one display pixel in scene units. */
export function journeyStage(scene: Scene, k: StageInk, t: Theme, h: number): string {
  const j = scene.journey;
  if (!j) return "";
  const hair = `stroke="${k.line}" stroke-opacity="${k.hair}" stroke-width="${n(h)}"`;
  const panel = (a: number) => `fill="${k.line}" fill-opacity="${n(a)}"`;
  const parts: string[] = [];
  // Headers share one size, the smallest any of them needs, so the row reads as one line of caps.
  const stageSize = Math.min(
    ...j.stages.map((st) => sizeFor(st.label.lines, HEAD, st.box.x + st.box.w - st.labelBox.x - 8)),
  );
  const rowSize = Math.min(
    ...j.rows.map((r) => sizeFor(r.label.lines, HEAD, r.header.x + r.header.w - r.labelBox.x - 8)),
    ...(j.curve ? [sizeFor(j.curve.label.lines, HEAD, j.curve.header.w - 22)] : []),
  );
  for (const st of j.stages) {
    parts.push(rect(st.box, 2 * h, `${panel(k.panel * 2)} ${hair}`));
    const b = st.numberBox;
    parts.push(
      `<circle cx="${n(b.x + b.w / 2)}" cy="${n(b.y + b.h / 2)}" r="${n(b.w / 2 - h / 2)}" fill="${k.tile}" stroke="${k.tint}" stroke-opacity="0.7" stroke-width="${n(h)}"/>`,
    );
    parts.push(mono([st.number.padStart(2, "0")], NUM, 9.5, b, k.header, "middle"));
    parts.push(mono(st.label.lines, HEAD, stageSize, st.labelBox, t.text));
  }
  j.rows.forEach((r, i) => {
    for (const c of r.cells) parts.push(rect(c, 2 * h, `${panel(i % 2 ? 0 : k.panel)} ${hair}`));
    parts.push(rect(r.header, 2 * h, `${panel(k.panel * 2)} ${hair}`));
    if (r.color)
      parts.push(
        rect(
          { x: r.header.x, y: r.header.y + 8, w: 3 * h, h: r.header.h - 16 },
          1.5 * h,
          `fill="${r.color}"`,
        ),
      );
    parts.push(mono(r.label.lines, HEAD, rowSize, r.labelBox, k.header));
  });
  const c = j.curve;
  if (c) {
    parts.push(rect(c.header, 2 * h, `${panel(k.panel * 2)} ${hair}`));
    parts.push(rect(c.band, 2 * h, `${panel(k.panel)} ${hair}`));
    parts.push(mono(c.label.lines, HEAD, rowSize, c.labelBox, k.header));
    for (const end of c.ends)
      parts.push(
        mono(
          end.label.lines,
          END,
          sizeFor(end.label.lines, END, c.header.w - 22),
          end.box,
          t.muted,
        ),
      );
    const x0 = c.band.x + 10 * h;
    const x1 = c.band.x + c.band.w - 10 * h;
    const rule = (y: number, a: number, dash: string) =>
      `<path d="M${n(x0)} ${n(y)} H${n(x1)}" fill="none" stroke="${k.line}" stroke-opacity="${a}" stroke-width="${n(h)}"${dash}/>`;
    parts.push(rule(c.zero, k.wire, ` stroke-dasharray="${n(4 * h)} ${n(3 * h)}"`));
    for (const end of c.ends) parts.push(rule(c.zero - end.score * c.unit, k.hair, ""));
    const motion = drawIn(scene);
    if (c.points.length > 1)
      parts.push(
        `<path d="${curvePath(c.points)}" fill="none" stroke="${k.tint}" stroke-width="${n(1.6 * h)}" stroke-linecap="round"${motion.dash}>${motion.line}</path>`,
      );
    c.points.forEach((p, i) => {
      const score = c.scores[i] ?? 0;
      parts.push(
        `<g><circle cx="${n(p.x)}" cy="${n(p.y)}" r="8" fill="${k.tint}" stroke="${k.tile}" stroke-width="${n(2 * h)}"/>${face(p, 8, score, k.onTint, 1.3)}${motion.dot(i, c.points.length)}</g>`,
      );
    });
  }
  return `<g>${parts.join("")}</g>`;
}
