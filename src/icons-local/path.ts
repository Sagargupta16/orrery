// Path data as absolute lines and cubics: the parser behind every <path> outline the rules measure.

import type { Bad } from "./errors.ts";
import type { Pt, Seg, Sub } from "./geometry.ts";

/** An SVG arc as cubic Beziers (SVG 1.1 implementation notes, F.6.5 and F.6.6). */
function arcSegs(
  p0: Pt,
  rxIn: number,
  ryIn: number,
  deg: number,
  large: number,
  sweep: number,
  p1: Pt,
): Seg[] {
  if (p0[0] === p1[0] && p0[1] === p1[1]) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (!rx || !ry) return [{ to: p1 }];
  const phi = (deg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2;
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): Pt => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ];
  const tangent = (t: number): Pt => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ];
  const segs: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step;
    const b = a + step;
    const [pa, pb, ta, tb] = [at(a), i === n - 1 ? p1 : at(b), tangent(a), tangent(b)];
    segs.push({
      c: [
        [pa[0] + k * ta[0], pa[1] + k * ta[1]],
        [pb[0] - k * tb[0], pb[1] - k * tb[1]],
      ],
      to: pb,
    });
  }
  return segs;
}

/** Where the parser is in the path data, and what the previous command left for S, T and Z. */
interface PathState {
  d: string;
  bad: Bad;
  /** Read position in `d`. */
  i: number;
  subs: Sub[];
  /** The subpath draw commands extend; undefined after Z until the next one opens a subpath. */
  sub: Sub | undefined;
  cur: Pt;
  /** Where the subpath started; Z returns here. */
  start: Pt;
  /** The previous command letter, and the control points S and T reflect. */
  prev: string;
  lastCtrl: Pt | undefined;
  lastQuad: Pt | undefined;
}

/** The control points a command leaves for the next S or T to reflect. */
type Reflect = { ctrl?: Pt; quad?: Pt };

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;

function skip(st: PathState): void {
  while (st.i < st.d.length && /[\s,]/.test(st.d[st.i] ?? "")) st.i++;
}

function num(st: PathState): number {
  skip(st);
  NUM.lastIndex = st.i;
  const m = NUM.exec(st.d);
  if (!m)
    throw st.bad(
      `has broken path data near "${st.d.slice(st.i, st.i + 16)}"`,
      "re-export the path",
    );
  st.i = NUM.lastIndex;
  return Number(m[0]);
}

function flag(st: PathState): number {
  skip(st);
  const ch = st.d[st.i];
  if (ch !== "0" && ch !== "1")
    throw st.bad(
      `has a broken arc flag near "${st.d.slice(st.i, st.i + 16)}"`,
      "re-export the path",
    );
  st.i++;
  return Number(ch);
}

/** The next x,y pair, made absolute. */
function point(st: PathState, rel: boolean): Pt {
  const x = num(st);
  const y = num(st);
  return rel ? [st.cur[0] + x, st.cur[1] + y] : [x, y];
}

/** The subpath a draw command extends; one after Z opens a new subpath at the current point. */
function openSub(st: PathState): Sub {
  if (!st.sub) {
    st.sub = { from: st.cur, segs: [], closed: false, cmds: 0 };
    st.subs.push(st.sub);
  }
  return st.sub;
}

/** The letter for the next command: a new one, or the last repeated (after a moveto, a lineto). */
function nextCommand(st: PathState, cmd: string): string {
  const ch = st.d[st.i] ?? "";
  if (/[A-Za-z]/.test(ch)) {
    st.i++;
    return ch;
  }
  if (!cmd) throw st.bad("has path data that does not start with M", "re-export the path");
  if (cmd === "M") return "L";
  if (cmd === "m") return "l";
  if (cmd === "Z" || cmd === "z")
    throw st.bad("has numbers after Z in path data", "re-export the path");
  return cmd;
}

function cubicTo(st: PathState, s: Sub, smooth: boolean, rel: boolean): Reflect {
  const { cur, lastCtrl, prev } = st;
  const c1: Pt = smooth
    ? lastCtrl && /[CcSs]/.test(prev)
      ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]]
      : cur
    : point(st, rel);
  const c2 = point(st, rel);
  const to = point(st, rel);
  s.segs.push({ c: [c1, c2], to });
  st.cur = to;
  return { ctrl: c2 };
}

function quadTo(st: PathState, s: Sub, smooth: boolean, rel: boolean): Reflect {
  const { cur, lastQuad, prev } = st;
  const q: Pt = smooth
    ? lastQuad && /[QqTt]/.test(prev)
      ? [2 * cur[0] - lastQuad[0], 2 * cur[1] - lastQuad[1]]
      : cur
    : point(st, rel);
  const to = point(st, rel);
  s.segs.push({
    c: [
      [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])],
      [to[0] + (2 / 3) * (q[0] - to[0]), to[1] + (2 / 3) * (q[1] - to[1])],
    ],
    to,
  });
  st.cur = to;
  return { quad: q };
}

function arcTo(st: PathState, s: Sub, rel: boolean): void {
  const rx = num(st);
  const ry = num(st);
  const rot = num(st);
  const large = flag(st);
  const sweep = flag(st);
  const to = point(st, rel);
  s.segs.push(...arcSegs(st.cur, rx, ry, rot, large, sweep, to));
  st.cur = to;
}

/** One command: a moveto opens a subpath, Z closes it, anything else draws into it. */
function command(st: PathState, cmd: string): Reflect {
  const rel = cmd === cmd.toLowerCase();
  const up = cmd.toUpperCase();
  if (up === "M") {
    st.cur = point(st, rel);
    st.start = st.cur;
    st.sub = { from: st.cur, segs: [], closed: false, cmds: 0 };
    st.subs.push(st.sub);
    return {};
  }
  const s = openSub(st);
  s.cmds += 1;
  if (up === "Z") {
    s.closed = true;
    if (st.cur[0] !== st.start[0] || st.cur[1] !== st.start[1]) s.segs.push({ to: st.start });
    st.cur = st.start;
    st.sub = undefined;
  } else if (up === "L") {
    st.cur = point(st, rel);
    s.segs.push({ to: st.cur });
  } else if (up === "H") {
    const x = num(st);
    st.cur = [rel ? st.cur[0] + x : x, st.cur[1]];
    s.segs.push({ to: st.cur });
  } else if (up === "V") {
    const y = num(st);
    st.cur = [st.cur[0], rel ? st.cur[1] + y : y];
    s.segs.push({ to: st.cur });
  } else if (up === "C" || up === "S") return cubicTo(st, s, up === "S", rel);
  else if (up === "Q" || up === "T") return quadTo(st, s, up === "T", rel);
  else if (up === "A") arcTo(st, s, rel);
  else throw st.bad(`has an unknown path command "${cmd}"`, "re-export the path");
  return {};
}

/** Path data as absolute lines and cubics; arcs and quadratics become cubics. */
export function pathSubs(d: string, bad: Bad): Sub[] {
  const st: PathState = {
    d,
    bad,
    i: 0,
    subs: [],
    sub: undefined,
    cur: [0, 0],
    start: [0, 0],
    prev: "",
    lastCtrl: undefined,
    lastQuad: undefined,
  };
  let cmd = "";
  for (;;) {
    skip(st);
    if (st.i >= d.length) break;
    cmd = nextCommand(st, cmd);
    const { ctrl, quad } = command(st, cmd);
    st.lastCtrl = ctrl;
    st.lastQuad = quad;
    st.prev = cmd;
  }
  return st.subs;
}
