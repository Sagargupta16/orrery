// The layout dimension: direction agreement, crossings, edge lengths, empty space, proportions,
// layout diagnostics and how well spec order is kept.
import type { Box, Diagnostic, SceneEdge } from "../types.ts";
import {
  along,
  horizontalFlow,
  interArea,
  pathLen,
  r1,
  r2,
  real,
  segments,
  union,
} from "./geometry.ts";
import { edgeName } from "./names.ts";
import type { Ctx } from "./types.ts";

export function measureLayout(c: Ctx, diagnostics: Diagnostic[]): void {
  const { scene } = c;
  const m = c.metrics.layout;
  const edges = scene.edges;

  const { forward, against } = directionAgreement(c);
  const crossings = edgeCrossings(c);
  const { lens, median, long } = edgeLengths(c);
  const holePct = emptySpace(c);
  const aspect = proportions(c);
  const ignored = layoutDiagnostics(c, diagnostics);
  const { pairs, inOrder } = specOrder(c);

  Object.assign(m, {
    forwardPct: r1((100 * forward) / Math.max(1, edges.length)),
    againstFlow: against.length,
    crossings,
    holePct: r1(holePct),
    aspect: r2(aspect),
    longEdges: long.length,
    edgeMedianPx: Math.round(median),
    edgeMaxPx: Math.round(Math.max(0, ...lens.map((l) => l.len))),
    specOrderPct: pairs ? r1((100 * inOrder) / pairs) : 100,
    fallback: scene.layoutFallback ?? "none",
    ignoredSettings: ignored.length,
  });
}

/** Direction agreement: which way the arrowheads point along the flow. */
function directionAgreement(c: Ctx): { forward: number; against: SceneEdge[] } {
  const { scene, model, add, dir } = c;
  const edges = scene.edges;
  let forward = 0;
  const against: SceneEdge[] = [];
  for (const e of edges) {
    const a = e.points[0];
    const b = e.points.at(-1);
    if (!a || !b) continue;
    const p = along(dir, b.x - a.x, b.y - a.y);
    if (p > 8) forward++;
    // arrow: start keeps layout order and flips the head on purpose (spec.md), so it is not counted.
    if (e.arrow === "end" && p < -8) against.push(e);
  }
  // A state machine returns to earlier states and a mind map grows both ways: heads point back by
  // design there, so the count stays a metric only.
  if (against.length && model.kind !== "state" && model.kind !== "mindmap") {
    const share = against.length / Math.max(1, edges.length);
    add(
      "layout.against-flow",
      share > 0.25 ? "major" : "minor",
      against.map((e) => e.id),
      {
        count: against.length,
        sharePct: r1(100 * share),
        direction: dir,
        edges: against.map(edgeName).slice(0, 6).join("; "),
      },
      `${against.length} of ${edges.length} arrowheads point against direction: ${dir}`,
      [
        "list nodes in the order data moves, so the target comes after its source",
        "write the edge the way data flows and use <- or arrow: start only for replies",
        "change direction",
      ],
      6 * against.length,
    );
  }
  return { forward, against };
}

/** Crossings (layout lane metrics). */
function edgeCrossings(c: Ctx): number {
  const { scene, add } = c;
  const edges = scene.edges;
  let crossings = 0;
  const crossingPairs: string[] = [];
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const A = edges[i];
      const B = edges[j];
      if (!A || !B) continue;
      let n = 0;
      for (const [p, q] of segments(A.points))
        for (const [s, t] of segments(B.points)) {
          const rx = q.x - p.x;
          const ry = q.y - p.y;
          const sx = t.x - s.x;
          const sy = t.y - s.y;
          const den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-9) continue;
          const tt = ((s.x - p.x) * sy - (s.y - p.y) * sx) / den;
          const uu = ((s.x - p.x) * ry - (s.y - p.y) * rx) / den;
          const e1 = 1.5 / (Math.hypot(rx, ry) || 1);
          const e2 = 1.5 / (Math.hypot(sx, sy) || 1);
          if (tt > e1 && tt < 1 - e1 && uu > e2 && uu < 1 - e2) n++;
        }
      if (n) {
        crossings += n;
        crossingPairs.push(`${A.id}x${B.id}`);
      }
    }
  if (crossings) {
    add(
      "layout.crossings",
      crossings > Math.max(3, edges.length / 4) ? "major" : "minor",
      [...new Set(crossingPairs.flatMap((p) => p.split("x")))],
      { crossings, pairs: crossingPairs.slice(0, 8).join(" ") },
      `${crossings} edge crossing(s)`,
      [
        "reorder nodes inside their group so connected nodes sit side by side",
        "try layout: { layering: simplex }",
        "split a hub with many edges into two nodes",
      ],
      3 * crossings,
    );
  }
  return crossings;
}

interface EdgeLength {
  e: SceneEdge;
  len: number;
}

/** Edge lengths against the median edge (layout lane metrics). */
function edgeLengths(c: Ctx): { lens: EdgeLength[]; median: number; long: EdgeLength[] } {
  const { scene, add } = c;
  const lens = scene.edges.map((e) => ({ e, len: pathLen(e.points) }));
  const sorted = lens.map((l) => l.len).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length
    ? sorted.length % 2
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : 0;
  const long = lens.filter((l) => l.len > 2.5 * median && l.len > 300);
  for (const l of long)
    add(
      "layout.long-edge",
      "minor",
      [l.e.id],
      { edge: edgeName(l.e), lengthPx: Math.round(l.len), medianPx: Math.round(median) },
      `${edgeName(l.e)} is ${Math.round(l.len)}px, ${r1(l.len / (median || 1))}x the median edge`,
      [`move "${l.e.from}" or "${l.e.to}" next to the other in the nodes list`],
      3,
    );
  return { lens, median, long };
}

/** Largest empty rectangle inside the content, on an 8px grid. */
function largestHole(c: Ctx): { area: number; x: number; y: number; w: number; h: number } {
  const { scene } = c;
  const W = scene.width;
  const H = scene.height;
  const edges = scene.edges;
  const ink = [
    ...scene.nodes.map((n) => c.foot.get(n.id)),
    ...edges.flatMap((e) => [e.labelBox, e.stepBox]),
    ...scene.groups.flatMap((g) => [g.labelBox, g.iconBox]),
    scene.titleBox,
    scene.subtitleBox,
    scene.legend?.box,
  ].filter(real);
  const edgeBoxes = edges.map((e) => {
    const xs = e.points.map((p) => p.x);
    const ys = e.points.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs) || 1,
      h: Math.max(...ys) - Math.min(...ys) || 1,
    };
  });
  const content = union([...ink, ...scene.groups.map((g) => g.box), ...edgeBoxes]) ?? {
    x: 0,
    y: 0,
    w: W,
    h: H,
  };
  const C = 8;
  const cols = Math.ceil(W / C);
  const rows = Math.ceil(H / C);
  const grid = new Uint8Array(cols * rows);
  const paint = (b: Box) => {
    for (
      let r = Math.max(0, Math.floor(b.y / C));
      r < Math.min(rows, Math.ceil((b.y + b.h) / C));
      r++
    )
      for (
        let k = Math.max(0, Math.floor(b.x / C));
        k < Math.min(cols, Math.ceil((b.x + b.w) / C));
        k++
      )
        grid[r * cols + k] = 1;
  };
  for (const b of ink) paint(b);
  for (const e of edges)
    for (const [s, t] of segments(e.points))
      paint({
        x: Math.min(s.x, t.x) - 2,
        y: Math.min(s.y, t.y) - 2,
        w: Math.abs(t.x - s.x) + 4,
        h: Math.abs(t.y - s.y) + 4,
      });
  const c0 = Math.max(0, Math.floor(content.x / C));
  const c1 = Math.min(cols, Math.ceil((content.x + content.w) / C));
  const row0 = Math.max(0, Math.floor(content.y / C));
  const row1 = Math.min(rows, Math.ceil((content.y + content.h) / C));
  const hist = new Array<number>(cols + 1).fill(0);
  let hole = { area: 0, x: 0, y: 0, w: 0, h: 0 };
  for (let r = row0; r < row1; r++) {
    for (let k = c0; k < c1; k++) hist[k] = grid[r * cols + k] ? 0 : (hist[k] ?? 0) + 1;
    const stack: [number, number][] = [];
    for (let k = c0; k <= c1; k++) {
      const h = k < c1 ? (hist[k] ?? 0) : 0;
      let start = k;
      while (stack.length && (stack.at(-1)?.[1] ?? 0) >= h) {
        const [sc, sh] = stack.pop() as [number, number];
        const area = sh * (k - sc);
        if (area > hole.area)
          hole = { area, x: sc * C, y: (r - sh + 1) * C, w: (k - sc) * C, h: sh * C };
        start = sc;
      }
      stack.push([start, h]);
    }
  }
  return hole;
}

/** The largest empty rectangle as a share of the canvas, and its finding. */
function emptySpace(c: Ctx): number {
  const { scene, add } = c;
  const W = scene.width;
  const H = scene.height;
  const hole = largestHole(c);
  const holePct = (100 * hole.w * hole.h) / Math.max(1, W * H);
  // A thin band between rows is spacing, not a hole a reader notices.
  if (holePct > 22 && Math.min(hole.w, hole.h) >= 80) {
    const inside = scene.groups
      .filter((g) => !g.overlay && interArea(g.box, hole) > 0.9 * hole.w * hole.h)
      .sort((a, b) => b.depth - a.depth)[0];
    add(
      "layout.empty-space",
      holePct > 32 ? "major" : "minor",
      inside ? [inside.id] : [],
      { holePct: r1(holePct), x: hole.x, y: hole.y, w: hole.w, h: hole.h },
      `an empty ${hole.w}x${hole.h}px rectangle covers ${r1(holePct)}% of the canvas`,
      [
        "change direction so the long chain wraps",
        "move a side branch next to the empty area in the nodes list",
        "split the diagram",
      ],
      Math.max(0, holePct - 18) * 1.5,
    );
  }
  return holePct;
}

/** Proportions, canvas width and the ELK fallback. */
function proportions(c: Ctx): number {
  const { scene, add } = c;
  const W = scene.width;
  const H = scene.height;
  const aspect = W / Math.max(1, H);
  const tall = H / Math.max(1, W);
  if (aspect > 3 || tall > 2.5) {
    const wide = aspect > 3;
    const ratio = wide ? aspect : tall;
    const strip = ratio > 4.5 && scene.nodes.length > 6;
    add(
      "layout.aspect",
      strip ? "major" : "minor",
      [],
      { aspect: r2(aspect), width: W, height: H },
      `the canvas is ${r1(ratio)}:1 ${wide ? "wide" : "tall"} (${W}x${H}px)`,
      wide
        ? ["use direction: down for long chains", "group stages into zones"]
        : ["use direction: right", "put independent tiers side by side"],
      (ratio - (wide ? 3 : 2.5)) * 10,
    );
  }
  if (W > 2400)
    add(
      "layout.too-wide",
      "major",
      [],
      { width: W },
      `the canvas is ${W}px wide (over 2400px)`,
      ["use direction: down", "group related nodes", "split into two diagrams"],
      15,
    );
  if (scene.layoutFallback)
    add(
      "layout.fallback",
      "minor",
      [],
      { strategy: scene.layoutFallback },
      `ELK needed the fallback strategy "${scene.layoutFallback}", so spec order may not be kept`,
      ["reorder or regroup nodes and render again", "try layout: { layering: simplex }"],
      5,
    );
  return aspect;
}

/** Empty groups (DG207) and placement settings layout could not honor (DG219). */
function layoutDiagnostics(c: Ctx, diagnostics: Diagnostic[]): Diagnostic[] {
  const { add } = c;
  for (const d of diagnostics.filter((x) => x.code === "DG207")) {
    const group = String(d.subject?.group ?? "");
    add(
      "layout.empty-group",
      "minor",
      group ? [group] : [],
      { group },
      d.message,
      d.fixes ?? [],
      5,
    );
  }
  const ignored = diagnostics.filter((x) => x.code === "DG219");
  for (const d of ignored) {
    const setting = String(d.subject?.setting ?? "");
    const [kind, id] = (["node", "group", "edge", "layout"] as const)
      .map((k) => [k, d.subject?.[k]] as const)
      .find(([, v]) => typeof v === "string") ?? ["layout", ""];
    const path =
      kind === "node"
        ? `nodes.${id}.${setting}`
        : kind === "group"
          ? `groups.${id}.${setting}`
          : kind === "layout"
            ? setting
            : undefined;
    add(
      "layout.ignored",
      "minor",
      kind === "layout" ? [] : [String(id)],
      { setting, reason: String(d.evidence?.reason ?? "") },
      d.message,
      d.fixes ?? [],
      3,
      path ? [{ op: "unset", path }] : undefined,
    );
  }
  return ignored;
}

/** Spec order kept (metric only: readers never see the spec). */
function specOrder(c: Ctx): { pairs: number; inOrder: number } {
  const { model, dir } = c;
  const cross = horizontalFlow(dir) ? "y" : "x";
  let pairs = 0;
  let inOrder = 0;
  const parents = [undefined, ...model.groups.filter((g) => !g.around).map((g) => g.id)];
  for (const P of parents) {
    const kids = [
      ...model.groups
        .filter((g) => !g.around && g.parent === P)
        .map((g) => ({ kind: "g", box: c.groups.get(g.id)?.box })),
      ...model.nodes
        .filter((n) => n.parent === P)
        .map((n) => ({ kind: "n", box: c.nodes.get(n.id)?.box })),
    ].filter((k): k is { kind: string; box: Box } => !!k.box);
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i];
        const b = kids[j];
        if (!a || !b || a.kind !== b.kind) continue;
        const ca = cross === "y" ? a.box.y + a.box.h / 2 : a.box.x + a.box.w / 2;
        const cb = cross === "y" ? b.box.y + b.box.h / 2 : b.box.x + b.box.w / 2;
        if (Math.abs(ca - cb) < 1) continue;
        const pa = cross === "y" ? [a.box.x, a.box.x + a.box.w] : [a.box.y, a.box.y + a.box.h];
        const pb = cross === "y" ? [b.box.x, b.box.x + b.box.w] : [b.box.y, b.box.y + b.box.h];
        const ov = Math.min(pa[1] ?? 0, pb[1] ?? 0) - Math.max(pa[0] ?? 0, pb[0] ?? 0);
        const span = Math.min((pa[1] ?? 0) - (pa[0] ?? 0), (pb[1] ?? 0) - (pb[0] ?? 0));
        if (ov < 0.5 * span) continue;
        pairs++;
        if (ca < cb) inOrder++;
      }
  }
  return { pairs, inOrder };
}
