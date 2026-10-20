// The drawing an icon makes: every shape as outlines on the viewBox, with the paint it inherits.

import type { Bad } from "./errors.ts";
import {
  type Box,
  grow,
  IDENTITY,
  type Mat,
  mul,
  numbers,
  type Pt,
  parseTransform,
  type Seg,
  type Sub,
  scaleOf,
  subBox,
  transformSub,
  union,
} from "./geometry.ts";
import { normalizeColor } from "./paint.ts";
import { pathSubs } from "./path.ts";
import { viewBoxOf } from "./sanitize.ts";
import { local, type XNode } from "./xml.ts";

const K = 0.5522847498;

function ellipseSub(cx: number, cy: number, rx: number, ry: number): Sub {
  const [kx, ky] = [K * rx, K * ry];
  return {
    from: [cx + rx, cy],
    segs: [
      {
        c: [
          [cx + rx, cy + ky],
          [cx + kx, cy + ry],
        ],
        to: [cx, cy + ry],
      },
      {
        c: [
          [cx - kx, cy + ry],
          [cx - rx, cy + ky],
        ],
        to: [cx - rx, cy],
      },
      {
        c: [
          [cx - rx, cy - ky],
          [cx - kx, cy - ry],
        ],
        to: [cx, cy - ry],
      },
      {
        c: [
          [cx + kx, cy - ry],
          [cx + rx, cy - ky],
        ],
        to: [cx + rx, cy],
      },
    ],
    closed: true,
    cmds: 1,
  };
}

/** A <rect> outline; rounded corners are quarter ellipses. */
function rectSubs(n: XNode, v: (k: string) => number): Sub[] {
  const [x, y, w, h] = [v("x"), v("y"), v("width"), v("height")];
  if (!(w > 0 && h > 0)) return [];
  const rxRaw = n.attrs.has("rx") ? v("rx") : undefined;
  const ryRaw = n.attrs.has("ry") ? v("ry") : undefined;
  const rx = Math.min(w / 2, Math.max(0, rxRaw ?? ryRaw ?? 0));
  const ry = Math.min(h / 2, Math.max(0, ryRaw ?? rxRaw ?? 0));
  if (!rx || !ry)
    return [
      {
        from: [x, y],
        segs: [{ to: [x + w, y] }, { to: [x + w, y + h] }, { to: [x, y + h] }, { to: [x, y] }],
        closed: true,
        cmds: 1,
      },
    ];
  const [kx, ky] = [K * rx, K * ry];
  return [
    {
      from: [x + rx, y],
      segs: [
        { to: [x + w - rx, y] },
        {
          c: [
            [x + w - rx + kx, y],
            [x + w, y + ry - ky],
          ],
          to: [x + w, y + ry],
        },
        { to: [x + w, y + h - ry] },
        {
          c: [
            [x + w, y + h - ry + ky],
            [x + w - rx + kx, y + h],
          ],
          to: [x + w - rx, y + h],
        },
        { to: [x + rx, y + h] },
        {
          c: [
            [x + rx - kx, y + h],
            [x, y + h - ry + ky],
          ],
          to: [x, y + h - ry],
        },
        { to: [x, y + ry] },
        {
          c: [
            [x, y + ry - ky],
            [x + rx - kx, y],
          ],
          to: [x + rx, y],
        },
      ],
      closed: true,
      cmds: 1,
    },
  ];
}

/** A shape element's outline in its own coordinates; undefined for non-shapes. */
function shapeSubs(n: XNode, bad: Bad): Sub[] | undefined {
  const tag = local(n.name);
  const v = (k: string) => numbers(n.attrs.get(k))[0] ?? 0;
  if (tag === "path") return pathSubs(n.attrs.get("d") ?? "", bad);
  if (tag === "circle") {
    const r = v("r");
    return r > 0 ? [ellipseSub(v("cx"), v("cy"), r, r)] : [];
  }
  if (tag === "ellipse") {
    const [rx, ry] = [v("rx"), v("ry")];
    return rx > 0 && ry > 0 ? [ellipseSub(v("cx"), v("cy"), rx, ry)] : [];
  }
  if (tag === "line")
    return [
      { from: [v("x1"), v("y1")], segs: [{ to: [v("x2"), v("y2")] }], closed: false, cmds: 1 },
    ];
  if (tag === "polyline" || tag === "polygon") {
    const p = numbers(n.attrs.get("points"));
    const pts: Pt[] = [];
    for (let j = 0; j + 1 < p.length; j += 2) pts.push([p[j] ?? 0, p[j + 1] ?? 0]);
    const [first, ...rest] = pts;
    if (!first) return [];
    const segs: Seg[] = rest.map((to) => ({ to }));
    if (tag === "polygon") segs.push({ to: first });
    return [{ from: first, segs, closed: tag === "polygon", cmds: pts.length }];
  }
  if (tag === "rect") return rectSubs(n, v);
  return undefined;
}

interface Style {
  fill?: string;
  stroke?: string;
  width: number;
  cap: string;
  join: string;
  miter?: string;
  rule?: string;
  opacity: number;
  fillOpacity?: string;
  strokeOpacity?: string;
  hidden: boolean;
}

/** One drawn shape, in viewBox units, with the paint it inherits. */
export interface Part {
  tag: string;
  subs: Sub[];
  /** undefined: no fill set anywhere above it, so it fills black. */
  fill?: string;
  stroke?: string;
  width: number;
  cap: string;
  join: string;
  miter?: string;
  rule?: string;
  opacity: number;
  fillOpacity?: string;
  strokeOpacity?: string;
  filled: boolean;
  stroked: boolean;
  /** Uses a clip path, mask or filter (adopt cannot keep those). */
  effects: string[];
}

export interface Drawing {
  viewBox: Box;
  parts: Part[];
  texts: number;
}

const SKIP = new Set([
  "defs",
  "clippath",
  "mask",
  "marker",
  "pattern",
  "symbol",
  "lineargradient",
  "radialgradient",
  "filter",
]);

export function drawingOf(root: XNode, bad: Bad): Drawing {
  const viewBox = viewBoxOf(root, bad);
  const byId = new Map<string, XNode>();
  const index = (n: XNode) => {
    const id = n.attrs.get("id");
    if (id) byId.set(id, n);
    n.children.forEach(index);
  };
  index(root);
  const parts: Part[] = [];
  let texts = 0;
  const walk = (n: XNode, ctm: Mat, inherited: Style, depth: number) => {
    const tag = local(n.name);
    if (n.name === "#text" || SKIP.has(tag) || n.attrs.get("display") === "none" || depth > 12)
      return;
    const m = mul(ctm, parseTransform(n.attrs.get("transform")));
    const a = (k: string) => {
      const v = n.attrs.get(k);
      return v === undefined || v === "inherit" ? undefined : v.trim();
    };
    const s: Style = {
      ...inherited,
      fill: a("fill") ?? inherited.fill,
      stroke: a("stroke") ?? inherited.stroke,
      width:
        a("stroke-width") !== undefined ? (numbers(a("stroke-width"))[0] ?? 1) : inherited.width,
      cap: a("stroke-linecap") ?? inherited.cap,
      join: a("stroke-linejoin") ?? inherited.join,
      miter: a("stroke-miterlimit") ?? inherited.miter,
      rule: a("fill-rule") ?? inherited.rule,
      fillOpacity: a("fill-opacity") ?? inherited.fillOpacity,
      strokeOpacity: a("stroke-opacity") ?? inherited.strokeOpacity,
      opacity: inherited.opacity * (numbers(a("opacity"))[0] ?? 1),
      hidden: a("visibility") ? a("visibility") === "hidden" : inherited.hidden,
    };
    const effects = ["clip-path", "mask", "filter"].filter((k) => a(k) && a(k) !== "none");
    if (tag === "use") {
      const ref = byId.get((n.attrs.get("href") ?? "").slice(1));
      if (!ref) return;
      const placed = mul(m, [1, 0, 0, 1, numbers(a("x"))[0] ?? 0, numbers(a("y"))[0] ?? 0]);
      if (local(ref.name) === "symbol") for (const c of ref.children) walk(c, placed, s, depth + 1);
      else walk(ref, placed, s, depth + 1);
      return;
    }
    if (tag === "text" || tag === "textpath") {
      texts += 1;
      return;
    }
    const subs = shapeSubs(n, bad);
    if (subs) {
      const filled = tag !== "line" && normalizeColor(s.fill ?? "#000000") !== undefined;
      const stroked =
        s.stroke !== undefined && normalizeColor(s.stroke) !== undefined && s.width > 0;
      if (!s.hidden && s.opacity > 0 && (filled || stroked))
        parts.push({
          tag,
          subs: subs.map((sub) => transformSub(sub, m)),
          fill: s.fill,
          stroke: s.stroke,
          width: s.width * scaleOf(m),
          cap: s.cap,
          join: s.join,
          miter: s.miter,
          rule: s.rule,
          opacity: s.opacity,
          fillOpacity: s.fillOpacity,
          strokeOpacity: s.strokeOpacity,
          filled,
          stroked,
          effects,
        });
      return;
    }
    const before = parts.length;
    for (const c of n.children) walk(c, m, s, depth);
    if (effects.length) for (const p of parts.slice(before)) p.effects.push(...effects);
  };
  // The root's own transform is not part of the viewBox space (and editors never set one).
  const start: Style = { width: 1, cap: "butt", join: "miter", opacity: 1, hidden: false };
  for (const c of root.children) walk(c, IDENTITY, { ...start, ...rootStyle(root, start) }, 0);
  return { viewBox, parts, texts };
}

function rootStyle(root: XNode, base: Style): Partial<Style> {
  const a = (k: string) => root.attrs.get(k)?.trim();
  return {
    fill: a("fill"),
    stroke: a("stroke"),
    width: a("stroke-width") !== undefined ? (numbers(a("stroke-width"))[0] ?? 1) : base.width,
    cap: a("stroke-linecap") ?? base.cap,
    join: a("stroke-linejoin") ?? base.join,
    miter: a("stroke-miterlimit"),
    rule: a("fill-rule"),
    fillOpacity: a("fill-opacity"),
    strokeOpacity: a("stroke-opacity"),
    opacity: numbers(a("opacity"))[0] ?? 1,
  };
}

/** The painted bounds of a part: geometry, plus half the stroke. */
export const partBox = (p: Part): Box | undefined => {
  let box: Box | undefined;
  for (const s of p.subs) if (s.segs.length) box = union(box, subBox(s));
  return box && p.stroked ? grow(box, p.width / 2) : box;
};
