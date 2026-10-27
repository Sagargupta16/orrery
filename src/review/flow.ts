// The flow dimension: arrowheads, shared trunks, step order, arrow semantics, boundary labels,
// the edge budget and cross-cutting services.
import { iconAspect, iconInfo } from "../icons/index.ts";
import { endsOf, landingOf, level } from "../layout/faces.ts";
import { ENDS } from "../layout/sizes.ts";
import type { PatchOp } from "../patch/index.ts";
import {
  type Box,
  type Diagnostic,
  type ModelEdge,
  type ModelNode,
  OWN_LAYOUT,
  type Point,
  type SceneEdge,
} from "../types.ts";
import {
  along,
  badgeRect,
  EPS,
  headerChip,
  horizontalFlow,
  interArea,
  midpoint,
  r1,
  r2,
  real,
  segments,
  simplify,
} from "./geometry.ts";
import { edgeName, travel } from "./names.ts";
import type { Ctx } from "./types.ts";

/** Monitoring, logging, audit, identity and key services, by icon pack and catalog name. */
const CROSS_CUTTING: Record<string, RegExp> = {
  aws: /^(Amazon CloudWatch|AWS CloudTrail|AWS X-Ray|AWS Identity and Access Management|AWS Key Management Service|AWS Config|Amazon GuardDuty|AWS Security Hub)\b/,
  azure:
    /^(Monitor|Azure Monitor|Log Analytics Workspaces|Application Insights|(Microsoft )?Entra ID|Entra Managed Identities|Key Vaults?)$/,
  gcp: /^(Cloud Logging|Cloud Monitoring|Identity and Access Management|Key Management Service)$/,
};

export function measureFlow(c: Ctx, diagnostics: Diagnostic[]): void {
  const m = c.metrics.flow;

  const { hidden, short } = arrowEnds(c);
  const { off, gaps } = faceEnds(c);
  const trunks = sharedTrunks(c);
  const parallel = sideBySide(c, trunks);
  const { steps, inversions } = stepOrder(c);
  const { both, none } = arrowSemantics(c);
  const crossing = unlabelledCrossings(c);
  const unconnected = unconnectedNodes(c, diagnostics);
  const { nodeCount, edgeCount } = edgeBudget(c);
  const fanIn = crossCutting(c);

  Object.assign(m, {
    hiddenHeads: hidden,
    // DG222 from check.ts; overlap.ts maps it to flow.head-on-bend.
    headsOnBends: diagnostics.filter((d) => d.code === "DG222").length,
    shortEnds: short,
    endsOffFace: off,
    endGaps: gaps,
    sharedTrunks: trunks.size,
    sideBySide: parallel,
    steps,
    stepInversions: inversions,
    bidirectional: both.length,
    undirected: none.length,
    unlabelledCrossings: crossing.length,
    unconnected: unconnected.length,
    edgesPerNode: r2(edgeCount / Math.max(1, nodeCount)),
    crossCutting: fanIn.length,
  });
  c.hard.overlaps += hidden;
}

interface Head {
  at: "to" | "from";
  tip: Point;
  prev: Point;
  target: string;
}

interface EndCounts {
  hidden: number;
  short: number;
}

/** Arrowheads under something drawn later or on top (arrows lane audit). */
function arrowEnds(c: Ctx): EndCounts {
  const { scene } = c;
  const horizontal = horizontalFlow(c.dir);
  const counts: EndCounts = { hidden: 0, short: 0 };
  const chips = scene.groups.flatMap((g) => {
    const chip = headerChip(g);
    return [
      ...(chip ? [{ id: g.id, box: chip }] : []),
      ...(g.iconBox ? [{ id: g.id, box: g.iconBox }] : []),
    ];
  });
  for (const e of scene.edges) {
    const pts = simplify(e.points);
    const heads: Head[] = [];
    const last = pts.at(-1);
    const before = pts.at(-2);
    const first = pts[0];
    const second = pts[1];
    if ((e.arrow === "end" || e.arrow === "both") && last && before)
      heads.push({ at: "to", tip: last, prev: before, target: e.to });
    if ((e.arrow === "start" || e.arrow === "both") && first && second)
      heads.push({ at: "from", tip: first, prev: second, target: e.from });
    for (const h of heads) checkHead(c, e, h, chips, counts);
    // Ends that stop short of a narrow glyph: the iconBox is square, the artwork is not.
    if (horizontal) shortEnds(c, e, first, last, counts);
  }
  return counts;
}

/** One arrowhead under a label, step, header, badge or another node (on the bend is DG222). */
function checkHead(
  c: Ctx,
  e: SceneEdge,
  h: Head,
  chips: { id: string; box: Box }[],
  counts: EndCounts,
): void {
  const { scene, add } = c;
  const len = e.line === "thick" ? 11 : 9;
  const half = e.line === "thick" ? 5.5 : 4.5;
  const L = Math.hypot(h.tip.x - h.prev.x, h.tip.y - h.prev.y);
  const ux = (h.tip.x - h.prev.x) / (L || 1);
  const uy = (h.tip.y - h.prev.y) / (L || 1);
  const bx = h.tip.x - ux * len;
  const by = h.tip.y - uy * len;
  const xs = [h.tip.x, bx - uy * half, bx + uy * half];
  const ys = [h.tip.y, by + ux * half, by - ux * half];
  const hb = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
  const hit = (b: Box) => {
    const ib = { x: b.x + EPS, y: b.y + EPS, w: b.w - 2 * EPS, h: b.h - 2 * EPS };
    return interArea(hb, ib) > EPS;
  };
  const covers: string[] = [];
  for (const o of scene.edges) {
    if (real(o.labelBox) && hit(o.labelBox)) covers.push(`label of ${o.id}`);
    if (real(o.stepBox) && hit(o.stepBox)) covers.push(`step of ${o.id}`);
  }
  for (const ch of chips) if (hit(ch.box)) covers.push(`header of ${ch.id}`);
  for (const n of scene.nodes) {
    const parts: [string, Box | undefined][] = [
      ["label", n.labelBox],
      ["note", n.noteBox],
      ["badge", badgeRect(n)],
    ];
    // The head may touch the node it points at, never another one.
    if (n.id !== h.target) parts.push(["node", n.iconBox ?? n.box]);
    for (const [what, b] of parts) if (real(b) && hit(b)) covers.push(`${what} of ${n.id}`);
  }
  if (covers.length) {
    counts.hidden++;
    add(
      "flow.head-hidden",
      "major",
      [e.id, h.target],
      { edge: edgeName(e), end: h.at, under: covers.join(", ") },
      `the arrowhead of ${edgeName(e)} at "${h.target}" sits under the ${covers.join(", ")}`,
      [
        `move "${h.target}" earlier or later in the nodes list`,
        "shorten the covering label or badge",
      ],
      10,
    );
  }
}

/** Both ends of a horizontal-flow edge against narrow icon glyphs. */
function shortEnds(
  c: Ctx,
  e: SceneEdge,
  first: Point | undefined,
  last: Point | undefined,
  counts: EndCounts,
): void {
  const { add } = c;
  for (const [id, p] of [
    [e.from, first],
    [e.to, last],
  ] as const) {
    const n = c.nodes.get(id);
    if (!n || !p || n.look !== "icon" || !n.icon || !n.iconBox) continue;
    const aspect = iconAspect(n.icon);
    if (!aspect || aspect >= 0.98) continue;
    const ib = n.iconBox;
    const onSide =
      (Math.abs(p.x - ib.x) < 1.5 || Math.abs(p.x - (ib.x + ib.w)) < 1.5) &&
      p.y >= ib.y - EPS &&
      p.y <= ib.y + ib.h + EPS;
    const gap = (ib.w - ib.h * aspect) / 2;
    if (onSide && gap > 1.5) {
      counts.short++;
      add(
        "flow.arrow-short",
        "minor",
        [e.id, id],
        { edge: edgeName(e), node: id, gapPx: r1(gap), aspect: r2(aspect) },
        `${edgeName(e)} stops ${r1(gap)}px short of the "${n.icon}" glyph`,
        [`use a square icon for "${id}"`, "use look: card for that node"],
        2,
      );
    }
  }
}

/** Shapes whose outline is their box, so an end on the box touches what is drawn. */
const BOXED = new Set(["box", "rounded", "subroutine", "note"]);

/**
 * Every end on the face of what it meets (layout/faces.ts): an icon node's tile, never past it
 * or out in its label's width (major), and on the face line, its tip touching the tile, card,
 * shape or group border at the gap layout keeps (ENDS.gap, 0px), not short of it or into it.
 * Kinds that draw their own connectors as curves, BPMN symbols and outlined shapes (their ends
 * sit on the outline) are not measured.
 */
function faceEnds(c: Ctx): { off: number; gaps: number } {
  const { scene, add } = c;
  const counts = { off: 0, gaps: 0 };
  if (scene.routing === "spline" || OWN_LAYOUT.has(scene.kind) || scene.kind === "mindmap")
    return counts;
  const horizontal = horizontalFlow(c.dir);
  for (const e of scene.edges) {
    if (e.from === e.to) continue;
    for (const end of endsOf(e)) {
      const id = end.at === "from" ? e.from : e.to;
      const n = c.nodes.get(id);
      const g = n ? undefined : c.groups.get(id);
      const item = n ?? g;
      if (!item || n?.bpmn || g?.overlay || g?.lane) continue;
      if (n?.look === "shape" && !BOXED.has(n.shape)) continue;
      const landing = landingOf(item, end);
      if (!landing) continue;
      const { face, gap, along } = landing;
      const what = n?.look === "icon" ? "icon" : n ? "box" : "border";
      const side = face.side;
      const tip = end.e.points[end.i];
      if (n?.look === "icon" && (along < face.lo - EPS || along > face.hi + EPS)) {
        // A narrow logo is drawn inside its square (fitIcons): beside the glyph is the
        // short-of-the-glyph case, not an end out in the label's width.
        const square =
          horizontal && (level(side) ? [n.box.x, n.box.x + n.box.w] : [n.box.y, n.box.y + n.box.h]);
        const inSquare =
          square && along >= (square[0] ?? 0) - EPS && along <= (square[1] ?? 0) + EPS;
        if (!inSquare) {
          counts.off++;
          const by = along < face.lo ? face.lo - along : along - face.hi;
          add(
            "flow.arrow-short",
            "major",
            [e.id, id],
            {
              edge: edgeName(e),
              node: id,
              end: end.at,
              side,
              outsidePx: r1(by),
              x: r1(tip?.x ?? 0),
              y: r1(tip?.y ?? 0),
            },
            `${edgeName(e)} meets the ${side} of "${id}" ${r1(by)}px outside its icon, out where its label is`,
            [
              `move "${id}" in the nodes list so the edge meets it from another side`,
              "use layout: { merge: true } so the ends on one side share the icon",
            ],
            4,
          );
          continue;
        }
      }
      if (Math.abs(gap - ENDS.gap) <= 1) continue;
      counts.gaps++;
      add(
        "flow.arrow-short",
        "minor",
        [e.id, id],
        { edge: edgeName(e), node: id, end: end.at, side, gapPx: r1(gap), wantPx: ENDS.gap },
        gap > 0
          ? `${edgeName(e)} stops ${r1(gap)}px short of the ${what} of "${id}"`
          : `${edgeName(e)} runs ${r1(-gap)}px into the ${what} of "${id}"`,
        [
          `move "${id}" in the nodes list so the edge meets it straight on`,
          "use look: icon or look: card for that node",
        ],
        2,
      );
    }
  }
  return counts;
}

/**
 * Unrelated edges on one line (layout lane: collinear overlap, no shared endpoint). Edges that
 * share an end fan out or in together by design, but two edges between the same two ends the
 * other way round never do: on one line they read as one line with a head at each end.
 */
function sharedTrunks(c: Ctx): Set<string> {
  const { scene, add } = c;
  const trunks = new Set<string>();
  const E = scene.edges;
  for (let i = 0; i < E.length; i++)
    for (let j = i + 1; j < E.length; j++) {
      const a = E[i];
      const b = E[j];
      if (!a || !b) continue;
      const swapped = a.from !== a.to && a.from === b.to && a.to === b.from;
      if (!swapped && (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to))
        continue;
      let olap = 0;
      for (const [p, q] of segments(a.points))
        for (const [u, v] of segments(b.points)) {
          const ah = Math.abs(p.y - q.y) < EPS;
          const av = Math.abs(p.x - q.x) < EPS;
          const bh = Math.abs(u.y - v.y) < EPS;
          const bv = Math.abs(u.x - v.x) < EPS;
          if (ah && bh && Math.abs(p.y - u.y) < 1.5)
            olap += Math.max(
              0,
              Math.min(Math.max(p.x, q.x), Math.max(u.x, v.x)) -
                Math.max(Math.min(p.x, q.x), Math.min(u.x, v.x)),
            );
          else if (av && bv && Math.abs(p.x - u.x) < 1.5)
            olap += Math.max(
              0,
              Math.min(Math.max(p.y, q.y), Math.max(u.y, v.y)) -
                Math.max(Math.min(p.y, q.y), Math.min(u.y, v.y)),
            );
        }
      if (olap > 10) {
        trunks.add(`${a.id}|${b.id}`);
        add(
          "flow.shared-trunk",
          olap > 40 ? "major" : "minor",
          [a.id, b.id],
          { a: edgeName(a), b: edgeName(b), sharedPx: r1(olap) },
          `${edgeName(a)} and ${edgeName(b)} share ${r1(olap)}px of line, so readers cannot tell them apart`,
          [
            "reorder nodes so the two edges take different channels",
            "use layout: { merge: false }",
            "use layout: { spacing: loose }",
          ],
          8,
        );
      }
    }
  return trunks;
}

/**
 * Unrelated edges side by side: two arrows within about 12px of each other read as one double
 * line. Parallel runs 1.5 to 12px apart that share more than an icon's length (48px) of span: ELK
 * keeps unrelated edges in one channel 10px apart, and a shorter stretch beside a bend (the
 * gallery has six of 27 to 37px) reads as part of the bend. Closer runs are flow.shared-trunk's,
 * and a pair it reported is not counted again. Edges that share an endpoint fan out or in
 * together by design. Canvas px, like flow.shared-trunk's: the limits are drawing units, and a
 * narrower column brings the lines closer still.
 */
function sideBySide(c: Ctx, trunks: Set<string>): number {
  const { scene, add } = c;
  let pairs = 0;
  const E = scene.edges;
  for (let i = 0; i < E.length; i++)
    for (let j = i + 1; j < E.length; j++) {
      const a = E[i];
      const b = E[j];
      if (!a || !b || trunks.has(`${a.id}|${b.id}`)) continue;
      if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;
      let span = 0;
      let apart = 0;
      for (const [p, q] of segments(simplify(a.points)))
        for (const [u, v] of segments(simplify(b.points))) {
          const h = Math.abs(p.y - q.y) < EPS && Math.abs(u.y - v.y) < EPS;
          const vert = Math.abs(p.x - q.x) < EPS && Math.abs(u.x - v.x) < EPS;
          if (!h && !vert) continue;
          const d = h ? Math.abs(p.y - u.y) : Math.abs(p.x - u.x);
          if (d < 1.5 || d > 12) continue;
          const [p0, p1, u0, u1] = h ? [p.x, q.x, u.x, v.x] : [p.y, q.y, u.y, v.y];
          const shared =
            Math.min(Math.max(p0, p1), Math.max(u0, u1)) -
            Math.max(Math.min(p0, p1), Math.min(u0, u1));
          if (shared > span) {
            span = shared;
            apart = d;
          }
        }
      if (span <= 48) continue;
      pairs++;
      add(
        "flow.side-by-side",
        "minor",
        [a.id, b.id],
        { a: edgeName(a), b: edgeName(b), apartPx: r1(apart), sharedPx: r1(span) },
        `${edgeName(a)} and ${edgeName(b)} run ${r1(apart)}px apart for ${r1(span)}px, so they read as one double line`,
        [
          "reorder nodes so the two edges take different channels",
          "use layout: { spacing: loose }",
        ],
        3,
      );
    }
  return pairs;
}

/** Steps: numbering, and order along the picture (AWS deck slide 18). */
function stepOrder(c: Ctx): { steps: number; inversions: number } {
  const { scene, model, add, dir } = c;
  const horizontal = horizontalFlow(dir);
  const stepped = scene.edges
    .filter((e) => e.step !== undefined)
    .map((e) => {
      const at = real(e.stepBox)
        ? { x: e.stepBox.x + e.stepBox.w / 2, y: e.stepBox.y + e.stepBox.h / 2 }
        : midpoint(e.points);
      return { e, step: e.step as number, at };
    })
    .sort((a, b) => a.step - b.step);
  let inversions = 0;
  if (stepped.length >= 2) {
    const nums = [...new Set(stepped.map((x) => x.step))];
    const gaps = nums.filter((n, i) => n !== i + 1);
    if (gaps.length) {
      add(
        "flow.step-numbering",
        "minor",
        stepped.map((x) => x.e.id),
        { steps: nums.join(",") },
        `step numbers ${nums.join(", ")} do not run 1 to ${nums.length}`,
        ["renumber the steps from 1 without gaps"],
        4,
      );
    }
    // Same-numbered steps are parallel; compare one representative per number.
    const reps = nums.map((n) => {
      const same = stepped.filter((x) => x.step === n);
      return {
        step: n,
        ids: same.map((x) => x.e.id),
        x: same.reduce((s, x) => s + x.at.x, 0) / same.length,
        y: same.reduce((s, x) => s + x.at.y, 0) / same.length,
      };
    });
    const tol = 24;
    const linearBad: string[] = [];
    for (let i = 1; i < reps.length; i++) {
      const p = reps[i - 1];
      const q = reps[i];
      if (!p || !q) continue;
      const d = along(dir, q.x - p.x, q.y - p.y);
      const cross = horizontal ? q.y - p.y : q.x - p.x;
      // Back along the flow is fine when it starts a new row below (reading order wraps).
      if (d < -tol && !(cross > tol && Math.abs(cross) > Math.abs(d) / 2))
        linearBad.push(`${p.step}->${q.step}`);
    }
    let clockBad = linearBad;
    // AWS-14 is a walkthrough over an architecture; a flow's own lines already give its order.
    if (model.kind !== "architecture") clockBad = [];
    else if (reps.length >= 3) {
      const cx = reps.reduce((s, r) => s + r.x, 0) / reps.length;
      const cy = reps.reduce((s, r) => s + r.y, 0) / reps.length;
      const angle = (r: { x: number; y: number }) => Math.atan2(r.y - cy, r.x - cx);
      const bad: string[] = [];
      for (let i = 1; i < reps.length; i++) {
        const p = reps[i - 1];
        const q = reps[i];
        if (!p || !q) continue;
        let d = angle(q) - angle(p);
        while (d <= -Math.PI) d += 2 * Math.PI;
        while (d > Math.PI) d -= 2 * Math.PI;
        if (d < -0.05) bad.push(`${p.step}->${q.step}`);
      }
      if (bad.length < clockBad.length) clockBad = bad;
    }
    inversions = clockBad.length;
    if (inversions) {
      add(
        "flow.step-order",
        inversions > 1 ? "major" : "minor",
        reps.flatMap((r) => r.ids),
        { inversions, jumps: clockBad.join(" "), direction: dir },
        `step numbers jump against reading order at ${clockBad.join(", ")}`,
        [
          "renumber the steps in the order they appear left to right, top to bottom or clockwise",
          "reorder the nodes so the walkthrough runs with the direction",
        ],
        8,
      );
    }
  }
  return { steps: stepped.length, inversions };
}

/** Arrow semantics (Azure Well-Architected: always use arrows, avoid bidirectional ones). */
function arrowSemantics(c: Ctx): { both: SceneEdge[]; none: SceneEdge[] } {
  const { scene, model, add } = c;
  const both = scene.edges.filter((e) => e.arrow === "both");
  // A plain line is meant when the legend explains its style (the rule's own fix), when it is a
  // BPMN association, or when the notation draws no heads (tree and mind map connectors, and
  // data model relationships, whose ends carry cardinality marks instead). A tag's color chip
  // explains a color, not a line.
  const keyed = new Set((model.legend ?? []).filter((l) => !l.chip).map((l) => l.line));
  const plain = (e: SceneEdge) =>
    model.kind === "tree" ||
    model.kind === "mindmap" ||
    model.kind === "er" ||
    e.flow === "association" ||
    keyed.has(e.line);
  const none = scene.edges.filter((e) => e.arrow === "none" && !plain(e));
  for (const e of both)
    add(
      "flow.bidirectional",
      "minor",
      [e.id],
      { edge: edgeName(e) },
      `${edgeName(e)} has two heads, so it does not say who initiates`,
      [
        `split it into ${edgeName(e)} and ${e.to} -> ${e.from} with their own labels`,
        `keep one direction (${edgeName(e)}) from the caller to the dependency`,
      ],
      3,
    );
  for (const e of none)
    add(
      "flow.undirected",
      "minor",
      [e.id],
      { edge: edgeName(e) },
      `${edgeName(e)} has no arrowhead`,
      [`give it a direction (${edgeName(e)}) or explain the plain line in the legend`],
      3,
    );
  return { both, none };
}

/**
 * Unlabelled edges that cross a group boundary. A pool or lane says who does the work, and a
 * journey row what kind of step it is: neither is a boundary crossed by some mechanism. Nor is a
 * group in another kind with its own layout (a sequence's box of participants, a timeline lane).
 */
function unlabelledCrossings(c: Ctx): ModelEdge[] {
  const { model, add } = c;
  const bands = new Set(
    model.groups.filter((g) => g.type === "lane" || g.type === "pool").map((g) => g.id),
  );
  const chain = (id: string) => {
    const out = new Set<string>();
    for (let p = c.parentOf(id); p; p = c.parentOf(p)) if (!bands.has(p)) out.add(p);
    return out;
  };
  const crossing = model.edges.filter((e) => {
    if (e.label || OWN_LAYOUT.has(model.kind)) return false;
    const a = chain(e.from);
    const b = chain(e.to);
    if (a.has(e.to) || b.has(e.from)) return false;
    return [...a].some((g) => !b.has(g)) || [...b].some((g) => !a.has(g));
  });
  if (crossing.length) {
    add(
      "flow.unlabelled-boundary",
      "minor",
      crossing.map((e) => e.id),
      { count: crossing.length, edges: crossing.map(edgeName).slice(0, 6).join("; ") },
      `${crossing.length} unlabelled edge(s) cross a group boundary; the mechanism is left to guess`,
      ["label the edge with the protocol or action (HTTPS, VPC peering, PrivateLink)"],
      Math.min(10, 2 * crossing.length),
    );
  }
  return crossing;
}

/** DG208 comes from check.ts. */
function unconnectedNodes(c: Ctx, diagnostics: Diagnostic[]): Diagnostic[] {
  const unconnected = diagnostics.filter((d) => d.code === "DG208");
  for (const d of unconnected) {
    const node = String(d.subject?.node ?? "");
    c.add("flow.unconnected", "minor", node ? [node] : [], { node }, d.message, d.fixes ?? [], 3);
  }
  return unconnected;
}

/**
 * Edge budget (arrows at or below the node count): more edges than nodes means the picture is
 * trying to show a call sequence. Architecture only: a state machine or a process has more
 * transitions than steps by nature.
 */
function edgeBudget(c: Ctx): { nodeCount: number; edgeCount: number } {
  const { model, add } = c;
  const nodeCount = model.nodes.length;
  const edgeCount = model.edges.length;
  if (model.kind === "architecture" && edgeCount > nodeCount)
    add(
      "flow.edge-budget",
      "minor",
      [],
      { edges: edgeCount, nodes: nodeCount },
      `${edgeCount} edges for ${nodeCount} nodes: more arrows than nodes reads as a call sequence`,
      [
        "draw one edge to a group instead of parallel edges to its members",
        "drop reply, echo and cross-cutting edges: the layout already says them",
        "split into an overview and a detail diagram",
      ],
      3,
    );
  return { nodeCount, edgeCount };
}

/**
 * Cross-cutting services: an arrow from every node to the logs or the key service says nothing
 * and crosses everything; a shared services group with no arrows says it once.
 * Three feeds or fewer may stay as named edges, so the finding starts at four. Feeds from the
 * service's own family (GuardDuty into Security Hub) are the diagram's subject, not a cross-cut.
 */
function crossCutting(c: Ctx): { n: ModelNode; into: ModelEdge[] }[] {
  const { model, add } = c;
  const familyOf = (id: string) => {
    const n = model.nodes.find((x) => x.id === id);
    return n?.icon ? iconInfo(n.icon)?.category : undefined;
  };
  const fanIn = model.nodes.flatMap((n) => {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    if (!info || !CROSS_CUTTING[info.pack]?.test(info.name)) return [];
    const into = model.edges.filter(
      (e) => travel(e)[1] === n.id && familyOf(travel(e)[0]) !== info.category,
    );
    return into.length >= 4 ? [{ n, into }] : [];
  });
  const [hub] = fanIn;
  if (hub) {
    const taken = new Set([...model.groups.map((g) => g.id), ...model.nodes.map((n) => n.id)]);
    let gid = "shared-services";
    for (let k = 2; taken.has(gid); k++) gid = `shared-services-${k}`;
    const aws = iconInfo(hub.n.icon ?? "")?.pack === "aws";
    const patches: PatchOp[] = [
      {
        op: "add",
        path: `groups.${gid}`,
        value: {
          type: aws ? "aws:generic" : "box",
          label: "Shared services",
          ...(hub.n.parent ? { in: hub.n.parent } : {}),
        },
      },
      ...fanIn.map(({ n }): PatchOp => ({ op: "set", path: `nodes.${n.id}.in`, value: gid })),
      ...fanIn.flatMap(({ into }) =>
        into.map((e): PatchOp => ({ op: "edge", match: edgeName(e), value: null })),
      ),
    ];
    const names = fanIn.map(({ n, into }) => `"${n.id}" (${into.length} edges in)`).join(", ");
    add(
      "flow.cross-cutting",
      "minor",
      [...fanIn.map(({ n }) => n.id), ...fanIn.flatMap(({ into }) => into.map((e) => e.id))],
      {
        services: fanIn.map(({ n }) => n.id).join(","),
        edgesIn: fanIn.reduce((s, { into }) => s + into.length, 0),
      },
      `${names}: edges from every node into a cross-cutting service say nothing and cross the picture`,
      [
        `put ${fanIn.map(({ n }) => `"${n.id}"`).join(", ")} in a group labelled Shared services with no edges to it`,
        "keep at most three edges, dashed and labelled (logs, metrics), when the brief names the relation",
      ],
      4 * fanIn.length,
      patches,
    );
  }
  return fanIn;
}
