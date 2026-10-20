// Where lane edges leave and arrive: each end's box, the ports on its sides and their costs.

import { symbolBox } from "../notation.ts";
import { type Box, isBpmnEvent, isBpmnGateway, type ModelEdge, type Point } from "../types.ts";
import { type Dir, flip, type Port, STEPS } from "./lane-grid.ts";
import { type Band, cuts, type Routing, union } from "./lane-shared.ts";

/** An edge end: a node's attach box, a group's box, or a band's border. */
export interface End {
  id: string;
  box: Box;
  /** Pieces the line must stay out of: the attach box, the label and note under it. */
  parts: Box[];
  band?: Band;
  /** The node's whole box when lines attach to a part of it (a symbol over its label). */
  frame?: Box;
  /** A circle or a diamond: lines meet it only in the middle of a side. */
  curved?: boolean;
}

interface Costs {
  flow: number;
  back: number;
  c0: number;
  c1: number;
}

/** The ports of one routing pass, and the points edges already took. */
export interface Ports {
  /** The kind of the edge being routed (see kindOf). */
  kind: string;
  /** Middle of a box along the flow, and across it. */
  mMid(b: Box): number;
  cMid(b: Box): number;
  sides(e: End, out: boolean, costs: Costs, msg: boolean): Port[];
  bandPort(e: End, other: End, out: boolean): Port[];
  /** Records where a routed edge ends, so later edges share or avoid those points. */
  claim(me: ModelEdge, p0: Point | undefined, p1: Point | undefined, msg: boolean): void;
}

const INF = Number.POSITIVE_INFINITY;

export function endOf(r: Routing, id: string): End | undefined {
  const horizontal = r.ctx.horizontal;
  const n = r.sceneNode.get(id);
  if (n) {
    // An event or a gateway is its symbol; in a vertical flow its label sits under it in the box.
    const box = symbolBox(n) ?? (n.look === "icon" && horizontal && n.iconBox ? n.iconBox : n.box);
    const parts = [n.box, n.iconBox, n.labelBox, n.noteBox].filter(
      (b): b is Box => !!b && b.w > 0 && b.h > 0,
    );
    const curved =
      n.shape === "diamond" ||
      n.shape === "circle" ||
      n.shape === "initial" ||
      n.shape === "final" ||
      isBpmnEvent(n.bpmn) ||
      isBpmnGateway(n.bpmn);
    return { id, box, parts, curved, ...(box !== n.box ? { frame: n.box } : {}) };
  }
  const g = r.sceneGroup.get(id);
  if (!g) return undefined;
  const band = r.bands.get(id);
  return { id, box: g.box, parts: [], band };
}

export function portsOf(r: Routing): Ports {
  const { ctx, A, sign } = r;
  const { horizontal } = ctx;
  // Along-the-flow and across-the-flow sides of a box, as ports.
  const mAt = (b: Box, end: boolean) => (end === sign > 0 ? b[A.m] + b[A.mw] : b[A.m]);
  const pt = (m: number, c: number): Point => (horizontal ? { x: m, y: c } : { x: c, y: m });
  const fwd = (s: number): Dir => (horizontal ? (s > 0 ? 0 : 1) : s > 0 ? 2 : 3);
  const across = (s: number): Dir => (horizontal ? (s > 0 ? 2 : 3) : s > 0 ? 0 : 1);
  const cMid = (b: Box) => b[A.c] + b[A.cw] / 2;
  const mMid = (b: Box) => b[A.m] + b[A.mw] / 2;
  // Points where an edge already ends, per node: a split leaves from one point and a join enters
  // at one, but a message never shares its point with another edge.
  const used = new Map<string, { p: Point; out: boolean; msg: boolean; kind: string }[]>();
  let shareAll = false;
  const taken = (id: string, p: Point, out: boolean, msg: boolean, kind: string) =>
    !shareAll &&
    (used.get(id) ?? []).some(
      (u) =>
        Math.abs(u.p.x - p.x) < 1 &&
        Math.abs(u.p.y - p.y) < 1 &&
        (u.out !== out || u.msg || msg || u.kind !== kind),
    );
  /**
   * Ports on a node's sides, leaving (out) or arriving (in), each with a cost. A box side also
   * offers two points a quarter in from its middle: messages across the flow take them when the
   * middle is taken, or when a line already runs there.
   */
  const sides = (e: End, out: boolean, costs: Costs, msg: boolean): Port[] => {
    const b = e.box;
    const ports: Port[] = [];
    const add = (p: Point, d: Dir, cost: number, along: boolean) => {
      if (!Number.isFinite(cost)) return;
      const len = along ? b[A.cw] : b[A.mw];
      const offsets = e.curved || !(msg || !along) ? [0] : [0, -len / 4, len / 4];
      for (const o of offsets) {
        let q = o ? (along ? { ...p, [A.c]: p[A.c] + o } : { ...p, [A.m]: p[A.m] + o }) : p;
        if (taken(e.id, q, out, msg, api.kind)) continue;
        // A label right under an event or a gateway (a vertical flow): the line starts below it.
        const step = STEPS[out ? d : flip(d)];
        const ahead = { x: q.x + step.x * 24, y: q.y + step.y * 24 };
        const through = e.parts.filter(
          (part) => part !== e.box && part !== e.frame && cuts(q, ahead, part),
        );
        if (through.length) {
          const far = union([...through, e.frame && cuts(q, ahead, e.frame) ? e.frame : undefined]);
          q = step.x
            ? { ...q, x: step.x > 0 ? far.x + far.w : far.x }
            : { ...q, y: step.y > 0 ? far.y + far.h : far.y };
        }
        // Past its own label costs a little, so a clean side wins a tie.
        const extra = (o ? 6 + Math.abs(o) : 0) + (through.length ? 20 : 0);
        ports.push({ p: q, d, cost: cost + extra, ...(through.length ? { through } : {}) });
      }
    };
    // Leaving along the flow from its far side; arriving along the flow into its near side.
    add(pt(mAt(b, out), cMid(b)), fwd(sign), costs.flow, true);
    add(pt(mAt(b, !out), cMid(b)), fwd(-sign), costs.back, true);
    add(pt(mMid(b), b[A.c]), across(out ? -1 : 1), costs.c0, false);
    add(pt(mMid(b), b[A.c] + b[A.cw]), across(out ? 1 : -1), costs.c1, false);
    if (!ports.length && !shareAll) {
      shareAll = true;
      const again = sides(e, out, costs, msg);
      shareAll = false;
      return again;
    }
    return ports;
  };
  /** A band end: its border facing the other end, level with it along the flow. */
  const bandPort = (e: End, other: End, out: boolean): Port[] => {
    const b = e.box;
    const lo = Math.max(r.contentM + 10, b[A.m] + 10);
    const hi = b[A.m] + b[A.mw] - 10;
    const m = Math.min(hi, Math.max(lo, mMid(other.box)));
    const below = cMid(other.box) > cMid(b);
    const c = below ? b[A.c] + b[A.cw] : b[A.c];
    const d = across(out ? (below ? 1 : -1) : below ? -1 : 1);
    return [{ p: pt(m, c), d, cost: 0 }];
  };
  const api: Ports = {
    kind: "",
    mMid,
    cMid,
    sides,
    bandPort,
    claim(me, p0, p1, msg) {
      const kind = api.kind;
      if (p0) used.set(me.from, [...(used.get(me.from) ?? []), { p: p0, out: true, msg, kind }]);
      if (p1) used.set(me.to, [...(used.get(me.to) ?? []), { p: p1, out: false, msg, kind }]);
    },
  };
  return api;
}

// A forward edge leaves along the flow; a decision may branch out of a side vertex instead.
const aside = (e: End) => (e.curved ? 70 : 150);

/** The ports an edge from `a` to `b` may leave and arrive by. */
export function portsFor(
  r: Routing,
  P: Ports,
  me: ModelEdge,
  a: End,
  b: End,
  msg: boolean,
): { starts: Port[]; ends: Port[] } {
  const { A, sign } = r;
  const { sides, bandPort, mMid, cMid } = P;
  const ahead = (mMid(b.box) - mMid(a.box)) * sign;
  const [as0, as1] = [a.box[A.m], a.box[A.m] + a.box[A.mw]];
  const [bs0, bs1] = [b.box[A.m], b.box[A.m] + b.box[A.mw]];
  const level = Math.min(as1, bs1) - Math.max(as0, bs0) > 0.5;
  const below = cMid(b.box) > cMid(a.box);
  let starts: Port[];
  let ends: Port[];
  if (me.from === me.to) {
    starts = sides(a, true, { flow: 0, back: INF, c0: INF, c1: INF }, msg);
    ends = sides(b, false, { flow: INF, back: INF, c0: 0, c1: 10 }, msg);
  } else if (msg || level) {
    // Message flows (and nodes in one layer) cross the flow: out of the facing side.
    const near = { c0: below ? 40 : 0, c1: below ? 0 : 40 };
    const far = { c0: below ? 0 : 40, c1: below ? 40 : 0 };
    starts = a.band ? bandPort(a, b, true) : sides(a, true, { flow: 80, back: 120, ...near }, msg);
    ends = b.band ? bandPort(b, a, false) : sides(b, false, { flow: 80, back: 120, ...far }, msg);
  } else if (ahead > 0) {
    starts = a.band
      ? bandPort(a, b, true)
      : sides(a, true, { flow: 0, back: INF, c0: aside(a), c1: aside(a) }, msg);
    ends = b.band
      ? bandPort(b, a, false)
      : sides(b, false, { flow: 0, back: INF, c0: aside(b), c1: aside(b) }, msg);
  } else {
    // Back edges loop around the outside: out of a side across the flow, back, and in again.
    starts = a.band
      ? bandPort(a, b, true)
      : sides(a, true, { flow: 25, back: INF, c0: 0, c1: 0 }, msg);
    ends = b.band
      ? bandPort(b, a, false)
      : sides(b, false, { flow: 25, back: INF, c0: 0, c1: 0 }, msg);
  }
  return { starts, ends };
}
