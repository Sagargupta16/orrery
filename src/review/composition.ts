// Composition checks ported from aws-archify: zig-zags and avoidable bends, nodes beside groups,
// uneven same-kind siblings, and sparse or loosely padded frames (grid and layout findings).
import type { PatchOp } from "../patch/index.ts";
import type { Box, SceneGroup } from "../types.ts";
import {
  contentStart,
  horizontalFlow,
  interArea,
  orthogonalRuns,
  r1,
  real,
  union,
} from "./geometry.ts";
import { edgeName } from "./names.ts";
import type { Ctx } from "./types.ts";

/** Group types that stand for no boundary: their contents differ by design (aws-archify check 10). */
const TIER_GROUPS = new Set([
  "box",
  "dashed",
  "zone",
  "boundary",
  "on-prem",
  "internet",
  "pool",
  "lane",
  "aws:generic",
  "aws:generic-dashed",
  "gcp:tier",
  "gcp:optional",
  "gcp:external",
  "gcp:users",
  "azure:service-group",
  "azure:optional",
  "c4:boundary",
]);

/**
 * Composition checks ported from the aws-archify skill's check-layout.ts (checks 6, 10, 11, 14,
 * 14b; MIT-0). Its thresholds are canvas px at 1x and stay canvas px here: they say how far layout
 * put two ends out of line, or how loosely a frame fits, in the units layout works in (an orrery
 * icon is 48px, as is the sample's tile). A narrower column shrinks the defect and the room to fix
 * it alike, so the display width does not change the verdict; the ratios are unitless anyway.
 */
export function measureComposition(c: Ctx): void {
  const { scene, model } = c;
  // A journey's grid places every step, so nothing here is the author's to fix.
  if (model.kind === "journey") {
    Object.assign(c.metrics.grid, { zigZags: 0, avoidableBends: 0, unevenSiblings: 0, padding: 0 });
    Object.assign(c.metrics.layout, { sparseGroups: 0, besideGroup: 0 });
    return;
  }

  const { zigs, bends } = zigZags(c);
  const frames = scene.groups.filter((g) => !g.overlay && !g.lane);
  const beside = besideGroups(c, frames);
  const siblings = unevenSiblings(c, frames);
  const { sparse, padded } = whitespace(c, frames);

  Object.assign(c.metrics.grid, {
    zigZags: zigs,
    avoidableBends: bends,
    unevenSiblings: siblings,
    padding: padded,
  });
  Object.assign(c.metrics.layout, { sparseGroups: sparse, besideGroup: beside });
}

/**
 * Zig-zags and avoidable bends (checks 14, 14b): a one-to-one edge bends only because its ends
 * are out of line. A fan out or in cannot line up with every end, an end on a group is routed to
 * the frame, and a pool or lane fixes each end's row, so those bend by necessity.
 */
function zigZags(c: Ctx): { zigs: number; bends: number } {
  const { scene, add } = c;
  const outs = new Map<string, number>();
  const ins = new Map<string, number>();
  for (const e of scene.edges) {
    outs.set(e.from, (outs.get(e.from) ?? 0) + 1);
    ins.set(e.to, (ins.get(e.to) ?? 0) + 1);
  }
  const band = (id: string) => {
    for (let p = c.parentOf(id); p; p = c.parentOf(p)) if (c.groups.get(p)?.lane) return p;
    return undefined;
  };
  const horizontal = horizontalFlow(scene.direction);
  let zigs = 0;
  let bends = 0;
  for (const e of scene.edges) {
    if (!c.nodes.has(e.from) || !c.nodes.has(e.to)) continue;
    if (outs.get(e.from) !== 1 || ins.get(e.to) !== 1 || band(e.from) !== band(e.to)) continue;
    const runs = orthogonalRuns(e.points);
    if (!runs) continue;
    const [a, m, b] = runs;
    const zig =
      runs.length === 3 && a && m && b && a.axis === b.axis && a.sign === b.sign
        ? m.len
        : undefined;
    const leg = runs.length === 2 && a && m ? Math.min(a.len, m.len) : undefined;
    if (zig === undefined && leg === undefined) continue;
    // In a horizontal flow the ends share a row when they line up; in a vertical one, a column.
    const line = horizontal ? "row" : "column";
    const fixes = [
      `put "${e.from}" and "${e.to}" in one ${line}: give them the same look and similar label lengths`,
      `move "${e.to}" right after "${e.from}" in the nodes list`,
      ...(c.parentOf(e.from) !== c.parentOf(e.to)
        ? [`put "${e.from}" and "${e.to}" in the same group`]
        : []),
    ];
    const patches: PatchOp[] = [{ op: "move", path: `nodes.${e.to}`, after: e.from }];
    if (zig !== undefined && zig >= 12 && zig <= 180) {
      zigs++;
      add(
        "grid.zig-zag",
        "minor",
        [e.id, e.from, e.to],
        { edge: edgeName(e), stepPx: r1(zig), runs: 3 },
        `${edgeName(e)} steps ${r1(zig)}px ${m?.axis === "v" ? "up or down" : "sideways"} between two parallel runs, so its ends are out of line`,
        fixes,
        3,
        patches,
      );
    } else if (leg !== undefined && leg <= 240) {
      bends++;
      add(
        "grid.avoidable-bend",
        "minor",
        [e.id, e.from, e.to],
        { edge: edgeName(e), legPx: r1(leg), runs: 2 },
        `${edgeName(e)} turns once with a ${r1(leg)}px leg, so its ends are out of line`,
        fixes,
        3,
        patches,
      );
    }
  }
  return { zigs, bends };
}

/**
 * A node beside a group (check 6): partly level with a frame it is outside, so the eye reads the
 * two as one row of peers. A node whose whole height sits in the frame's band is aligned with it on
 * purpose; a node inside another frame is that frame's peer, not this one's.
 */
function besideGroups(c: Ctx, frames: SceneGroup[]): number {
  const { scene, add } = c;
  const W = scene.width;
  let beside = 0;
  for (const n of scene.nodes) {
    const f = c.foot.get(n.id) ?? n.box;
    const hits: { g: SceneGroup; share: number; frac: number }[] = [];
    for (const g of frames) {
      const b = g.box;
      if (c.isDescendant(n.id, g.id) || b.w >= 0.85 * W || b.w <= 160 || b.h <= 80) continue;
      if (n.parent && !c.isDescendant(g.id, n.parent)) continue;
      if (f.x + f.w > b.x && f.x < b.x + b.w) continue;
      const share = Math.min(f.y + f.h, b.y + b.h) - Math.max(f.y, b.y);
      const frac = share / Math.max(1, f.h);
      if (frac > 0.2 && frac < 0.8) hits.push({ g, share, frac });
    }
    // Report the outermost frame: the ones inside it repeat the same misalignment.
    const hit = hits.sort((x, y) => x.g.depth - y.g.depth)[0];
    if (!hit) continue;
    beside++;
    add(
      "layout.beside-group",
      "minor",
      [n.id, hit.g.id],
      { node: n.id, group: hit.g.id, sharedPx: r1(hit.share), sharePct: r1(100 * hit.frac) },
      `"${n.id}" sits beside group "${hit.g.id}" sharing ${r1(100 * hit.frac)}% of its height, so they read as one row of peers but "${n.id}" is outside it`,
      [
        `put "${n.id}" in "${hit.g.id}" (in: ${hit.g.id}) if it belongs there`,
        `move "${n.id}" in the nodes list so it sits level with the whole of "${hit.g.id}" or clear of it`,
      ],
      3,
    );
  }
  return beside;
}

/**
 * Same-kind siblings, one size (check 10): boxes of one boundary type under one parent share a
 * height in a row and a width in a column. Nearly equal reads as a mistake, clearly different as
 * intended; two with the same role (Zone A and Zone B) must match either way.
 */
function unevenSiblings(c: Ctx, frames: SceneGroup[]): number {
  const { add } = c;
  const role = (g: SceneGroup) =>
    g.label.lines
      .join(" ")
      .replace(/\b[A-Za-z0-9]\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  let siblings = 0;
  const typed = frames.filter((g) => g.type.includes(":") && !TIER_GROUPS.has(g.type));
  for (let i = 0; i < typed.length; i++)
    for (let j = i + 1; j < typed.length; j++) {
      const p = typed[i];
      const q = typed[j];
      if (!p || !q || p.type !== q.type || p.parent !== q.parent) continue;
      const same = role(p) === role(q);
      const row = p.box.y < q.box.y + q.box.h && q.box.y < p.box.y + p.box.h;
      const col = p.box.x < q.box.x + q.box.w && q.box.x < p.box.x + p.box.w;
      const dw = Math.abs(p.box.w - q.box.w) / Math.max(p.box.w, q.box.w);
      const dh = Math.abs(p.box.h - q.box.h) / Math.max(p.box.h, q.box.h);
      const near = (d: number) => d > 0.1 && (same || d <= 0.4);
      const off = [
        ...((same || col) && near(dw) ? [`width ${Math.round(100 * dw)}%`] : []),
        ...((same || row) && near(dh) ? [`height ${Math.round(100 * dh)}%`] : []),
      ];
      if (!off.length) continue;
      siblings++;
      add(
        "grid.uneven-siblings",
        "minor",
        [p.id, q.id],
        {
          a: `${Math.round(p.box.w)}x${Math.round(p.box.h)}`,
          b: `${Math.round(q.box.w)}x${Math.round(q.box.h)}`,
          apart: off.join(", "),
        },
        `"${p.id}" (${Math.round(p.box.w)}x${Math.round(p.box.h)}) and "${q.id}" (${Math.round(q.box.w)}x${Math.round(q.box.h)}) are ${off.join(" and ")} apart`,
        [
          `give "${p.id}" and "${q.id}" matching contents (the same nodes and label lengths) so they come out one size`,
          `put them side by side in one parent with cols: so they share a grid`,
        ],
        3,
      );
    }
  return siblings;
}

/**
 * Whitespace and padding (check 11), per frame on an 8px raster: own nodes with a margin, child
 * frames and edge labels cover; the rest below the header is empty. The sample's 16px margin is
 * two thirds of its 24px gap; orrery leaves 64px between layers, so the margin is half of that
 * (scaled by layout.spacing) and the layout's own rhythm never counts as empty.
 */
function whitespace(c: Ctx, frames: SceneGroup[]): { sparse: number; padded: number } {
  const { scene, model } = c;
  const margin = 32 * model.spacing;
  let sparse = 0;
  let padded = 0;
  for (const g of frames) {
    const own = scene.nodes.filter((n) => n.parent === g.id).map((n) => c.foot.get(n.id) ?? n.box);
    const kids = frames.filter((x) => x.parent === g.id).map((x) => x.box);
    if (!own.length && !kids.length) continue;
    const start = contentStart(g);
    const inner = {
      x: start.x,
      y: start.y,
      w: g.box.x + g.box.w - start.x,
      h: g.box.y + g.box.h - start.y,
    };
    if (inner.w <= 0 || inner.h <= 0) continue;
    const labels = scene.edges
      .map((e) => e.labelBox)
      .filter((b): b is Box => real(b) && interArea(b, inner) > 0);
    const cover = [
      ...own.map((b) => ({
        x: b.x - margin,
        y: b.y - margin,
        w: b.w + 2 * margin,
        h: b.h + 2 * margin,
      })),
      ...kids,
      ...labels,
    ];
    if (sparseFrame(c, g, inner, cover)) sparse++;
    if (framePadding(c, g, frames, inner, [...own, ...kids], labels)) padded++;
  }
  return { sparse, padded };
}

/** One frame's empty share below its header: over 65% is a sparse group. */
function sparseFrame(c: Ctx, g: SceneGroup, inner: Box, cover: Box[]): boolean {
  let total = 0;
  let empty = 0;
  for (let y = inner.y; y < inner.y + inner.h; y += 8)
    for (let x = inner.x; x < inner.x + inner.w; x += 8) {
      total++;
      const cell = { x, y, w: 8, h: 8 };
      if (!cover.some((b) => interArea(b, cell) > 0)) empty++;
    }
  const emptyPct = total ? (100 * empty) / total : 0;
  if (emptyPct > 65) {
    c.add(
      "layout.sparse-group",
      "minor",
      [g.id],
      { group: g.id, emptyPct: r1(emptyPct) },
      `group "${g.id}" is ${Math.round(emptyPct)}% empty`,
      [
        `shorten the label of "${g.id}": a long header widens the frame past its content`,
        `move a related node into "${g.id}", or drop the group if one node does not need a frame`,
      ],
      4,
    );
    return true;
  }
  return false;
}

/** One frame's padding per side against its tightest side. `boxes` are its own nodes, then kids. */
function framePadding(
  c: Ctx,
  g: SceneGroup,
  frames: SceneGroup[],
  inner: Box,
  boxes: Box[],
  labels: Box[],
): boolean {
  const content = union([...boxes, ...labels.filter((b) => interArea(b, inner) >= b.w * b.h - 1)]);
  if (!content) return false;
  const pads = {
    top: content.y - inner.y,
    bottom: g.box.y + g.box.h - (content.y + content.h),
    left: content.x - g.box.x,
    right: g.box.x + g.box.w - (content.x + content.w),
  };
  const lo = Math.max(8, Math.min(...Object.values(pads)));
  // A frame layout sized to match a same-kind sibling pads out on purpose (the sample asks for the
  // reason; here layout gave it), and one side much wider than the other is grid.off-center's.
  const twin = (k: "w" | "h") =>
    frames.some(
      (o) =>
        o !== g && o.type === g.type && o.parent === g.parent && Math.abs(o.box[k] - g.box[k]) < 1,
    );
  const u = union(boxes);
  const lopsided = !!u && Math.abs(u.x - g.box.x - (g.box.x + g.box.w - u.x - u.w)) > 6;
  const skip = new Set([
    ...(twin("w") || lopsided ? ["left", "right"] : []),
    ...(twin("h") ? ["top", "bottom"] : []),
  ]);
  const worst = Object.entries(pads).filter(([k, v]) => !skip.has(k) && v > 80 && v > 3 * lo);
  if (worst.length) {
    c.add(
      "grid.padding",
      "minor",
      [g.id],
      {
        group: g.id,
        ...Object.fromEntries(worst.map(([k, v]) => [`${k}Px`, r1(v)])),
        tightestPx: r1(lo),
      },
      `group "${g.id}" pads ${worst.map(([k, v]) => `${k} ${Math.round(v)}px`).join(", ")} against ${Math.round(lo)}px elsewhere, so it does not hug its content`,
      [
        `shorten the label of "${g.id}" so the frame can hug its content`,
        `move the nodes of "${g.id}" next to each other in the nodes list`,
      ],
      3,
    );
    return true;
  }
  return false;
}
