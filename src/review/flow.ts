// The flow dimension: arrowheads, shared trunks, step order, arrow semantics, boundary labels,
// the edge budget and cross-cutting services.
import { iconAspect, iconInfo } from "../icons.ts";
import type { PatchOp } from "../patch.ts";
import type { Box, Diagnostic, ModelEdge, ModelNode, Point, SceneEdge } from "../types.ts";
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

  const { hidden, onBend, short } = arrowEnds(c);
  const trunks = sharedTrunks(c);
  const { steps, inversions } = stepOrder(c);
  const { both, none } = arrowSemantics(c);
  const crossing = unlabelledCrossings(c);
  const unconnected = unconnectedNodes(c, diagnostics);
  const { nodeCount, edgeCount } = edgeBudget(c);
  const fanIn = crossCutting(c);

  Object.assign(m, {
    hiddenHeads: hidden,
    headsOnBends: onBend,
    shortEnds: short,
    sharedTrunks: trunks,
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
  onBend: number;
  short: number;
}

/** Arrowheads under something drawn later or on top (arrows lane audit). */
function arrowEnds(c: Ctx): EndCounts {
  const { scene } = c;
  const horizontal = horizontalFlow(c.dir);
  const counts: EndCounts = { hidden: 0, onBend: 0, short: 0 };
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

/** One arrowhead: under a label, step, header, badge or another node, or on the bend. */
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
  if (L < len - EPS) {
    counts.onBend++;
    add(
      "flow.head-on-bend",
      "minor",
      [e.id],
      { edge: edgeName(e), lastRunPx: r1(L), headPx: len },
      `the last straight run of ${edgeName(e)} is ${r1(L)}px, shorter than its ${len}px arrowhead`,
      ["use layout: { spacing: loose }", `reorder so "${h.target}" lines up with its source`],
      3,
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

/** Unrelated edges on one line (layout lane: collinear overlap, no shared endpoint). */
function sharedTrunks(c: Ctx): number {
  const { scene, add } = c;
  let trunks = 0;
  const E = scene.edges;
  for (let i = 0; i < E.length; i++)
    for (let j = i + 1; j < E.length; j++) {
      const a = E[i];
      const b = E[j];
      if (!a || !b) continue;
      if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;
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
        trunks++;
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
  // BPMN association, or when the notation draws no heads (tree and mind map connectors).
  const keyed = new Set((model.legend ?? []).map((l) => l.line));
  const plain = (e: SceneEdge) =>
    model.kind === "tree" ||
    model.kind === "mindmap" ||
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
 * journey row what kind of step it is: neither is a boundary crossed by some mechanism.
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
    if (e.label || model.kind === "journey") return false;
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
 * Edge budget (aws-archify SKILL.md: "Budget arrows at or below the node count"): more edges than
 * nodes means the picture is trying to show a call sequence. Architecture only: a state machine or
 * a process has more transitions than steps by nature.
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
 * Cross-cutting services (aws-archify SKILL.md): an arrow from every node to the logs or the key
 * service says nothing and crosses everything; a shared services group with no arrows says it once.
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
