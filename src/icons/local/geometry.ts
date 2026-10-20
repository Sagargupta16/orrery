// Outline geometry the rules measure: points, subpaths, transform matrices and bounding boxes.

export type Pt = [number, number];
/** A line when `c` is missing, else a cubic Bezier. */
export interface Seg {
  c?: [Pt, Pt];
  to: Pt;
}
export interface Sub {
  from: Pt;
  segs: Seg[];
  closed: boolean;
  /** Commands as written (an arc counts once), for the traced-artwork rule. */
  cmds: number;
}
export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export const mul = (p: Mat, q: Mat): Mat => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
];
const apply = (m: Mat, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** How much a matrix scales a stroke width (uniform part). */
export const scaleOf = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
export const numbers = (s: string | undefined) => (s?.match(NUMBER) ?? []).map(Number);

export function parseTransform(s: string | undefined): Mat {
  let m = IDENTITY;
  for (const [, fn, args] of (s ?? "").matchAll(
    /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g,
  )) {
    const a = numbers(args);
    const [a0 = 0, a1, a2 = 0, a3 = 0, a4 = 0, a5 = 0] = a;
    let t: Mat = IDENTITY;
    if (fn === "matrix") t = [a0, a1 ?? 0, a2, a3, a4, a5];
    else if (fn === "translate") t = [1, 0, 0, 1, a0, a1 ?? 0];
    else if (fn === "scale") t = [a0, 0, 0, a1 ?? a0, 0, 0];
    else if (fn === "rotate") {
      const r = (a0 * Math.PI) / 180;
      const [cos, sin] = [Math.cos(r), Math.sin(r)];
      const cx = a1 ?? 0;
      const cy = a2;
      t = mul(mul([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (fn === "skewX") t = [1, 0, Math.tan((a0 * Math.PI) / 180), 1, 0, 0];
    else if (fn === "skewY") t = [1, Math.tan((a0 * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, t);
  }
  return m;
}

export const transformSub = (s: Sub, m: Mat): Sub => ({
  from: apply(m, s.from),
  segs: s.segs.map((g) => ({
    ...(g.c ? { c: [apply(m, g.c[0]), apply(m, g.c[1])] as [Pt, Pt] } : {}),
    to: apply(m, g.to),
  })),
  closed: s.closed,
  cmds: s.cmds,
});

export type Box = [number, number, number, number];

/** Extremes of one axis of a cubic: roots of its derivative in (0, 1). */
function cubicExtremes(a: number, b: number, c: number, d: number): number[] {
  const [p, q, r] = [b - a, c - b, d - c];
  const qa = p - 2 * q + r;
  const qb = 2 * (q - p);
  const ts: number[] = [];
  if (Math.abs(qa) < 1e-12) {
    if (Math.abs(qb) > 1e-12) ts.push(-p / qb);
  } else {
    const disc = qb * qb - 4 * qa * p;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      ts.push((-qb + s) / (2 * qa), (-qb - s) / (2 * qa));
    }
  }
  return ts
    .filter((t) => t > 0 && t < 1)
    .map((t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d);
}

export function subBox(s: Sub): Box {
  const box: Box = [s.from[0], s.from[1], s.from[0], s.from[1]];
  const add = (x: number, y: number) => {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  };
  let p = s.from;
  for (const g of s.segs) {
    add(...g.to);
    if (g.c) {
      for (const x of cubicExtremes(p[0], g.c[0][0], g.c[1][0], g.to[0])) add(x, p[1]);
      for (const y of cubicExtremes(p[1], g.c[0][1], g.c[1][1], g.to[1])) add(p[0], y);
    }
    p = g.to;
  }
  return box;
}

export const union = (a: Box | undefined, b: Box): Box =>
  a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b;
export const grow = (b: Box, by: number): Box => [b[0] - by, b[1] - by, b[2] + by, b[3] + by];
