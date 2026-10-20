// The overlap dimension: check.ts geometry diagnostics mapped to findings, plus the overlaps
// check.ts does not cover (group icons, step badges, node text, nesting).
import type { Box, Diagnostic } from "../types.ts";
import type { FindingId, ReviewSeverity } from "./findings.ts";
import { contentStart, EPS, horizontalFlow, interArea, pathClipLen, r1, real } from "./geometry.ts";
import { edgeName } from "./names.ts";
import type { Ctx, HardCounts } from "./types.ts";

/** A check.ts overlap diagnostic as a review finding: which id, how bad, what it costs. */
interface OverlapRule {
  id: FindingId;
  severity: ReviewSeverity;
  cost: number;
  /** The hard count each such diagnostic raises; near misses raise none. */
  hard?: keyof HardCounts;
  /** Diagnostic subject keys that name spec ids. */
  ids: string[];
}

/** By diagnostic code; DG202 is two findings, told apart by `subject.edges` (label on label). */
const OVERLAP_RULES: Record<string, OverlapRule> = {
  DG201: {
    id: "overlap.edge-through-node",
    severity: "blocker",
    cost: 15,
    hard: "edgesThroughNodes",
    ids: ["edge", "node"],
  },
  DG202: {
    id: "overlap.label-over-node",
    severity: "major",
    cost: 12,
    hard: "overlaps",
    ids: ["edge", "node"],
  },
  "DG202:labels": {
    id: "overlap.labels-collide",
    severity: "major",
    cost: 12,
    hard: "overlaps",
    ids: ["edges"],
  },
  DG203: {
    id: "overlap.nodes-collide",
    severity: "blocker",
    cost: 15,
    hard: "overlaps",
    ids: ["nodes"],
  },
  DG209: {
    id: "overlap.edge-through-header",
    severity: "major",
    cost: 8,
    hard: "edgesThroughHeaders",
    ids: ["edge", "group"],
  },
  DG210: {
    id: "overlap.off-canvas",
    severity: "blocker",
    cost: 15,
    hard: "offCanvas",
    ids: ["node", "group", "edge", "legend", "title", "subtitle"],
  },
  DG211: {
    id: "overlap.badge",
    severity: "major",
    cost: 8,
    hard: "overlaps",
    ids: ["edge", "node", "over"],
  },
  DG212: {
    id: "overlap.edge-through-label",
    severity: "major",
    cost: 8,
    hard: "edgesThroughLabels",
    ids: ["edge", "labelOf"],
  },
  DG213: {
    id: "overlap.overlay-encloses",
    severity: "major",
    cost: 10,
    hard: "overlaps",
    ids: ["group", "enclosed"],
  },
  DG214: {
    id: "overlap.overlay-header",
    severity: "major",
    cost: 10,
    hard: "overlaps",
    ids: ["group", "covered"],
  },
  // The chip hides the line rather than colliding with text: the sample this comes from (aws-archify
  // check-layout 3) warns, not fails, for a label with a knockout, so minor and no hard count.
  DG220: {
    id: "overlap.label-on-border",
    severity: "minor",
    cost: 4,
    ids: ["edge", "group"],
  },
  DG221: {
    id: "overlap.edge-skims-node",
    severity: "minor",
    cost: 4,
    ids: ["edge", "node"],
  },
};

/** A diagnostic's evidence as flat number/string pairs: a nested box becomes "box.x", "box.w"... */
function flatEvidence(v: unknown, key = "", out: Record<string, number | string> = {}) {
  if (typeof v === "number" || typeof v === "string") out[key] = v;
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) flatEvidence(x, key ? `${key}.${k}` : k, out);
  return out;
}

/** The spec ids a diagnostic names under `keys`; a flag such as `legend: true` names itself. */
const subjectIds = (d: Diagnostic, keys: string[]) =>
  keys.flatMap((k) => {
    const v = d.subject?.[k];
    if (v === true) return [k];
    if (Array.isArray(v)) return v.map(String);
    return typeof v === "string" ? [v] : [];
  });

export function measureOverlap(c: Ctx, diagnostics: Diagnostic[]): void {
  const { hard } = c;
  const m = c.metrics.overlap;
  const count = (code: string) => diagnostics.filter((d) => d.code === code).length;

  mapDiagnostics(c, diagnostics);
  edgesThroughGroupIcons(c, diagnostics);
  edgesThroughStepsAndText(c);
  const nesting = nestingProblems(c);

  hard.overlaps += nesting;
  Object.assign(m, {
    edgesThroughNodes: hard.edgesThroughNodes,
    labelsOverNodesOrLabels: count("DG202"),
    nodesColliding: count("DG203"),
    edgesThroughHeaders: hard.edgesThroughHeaders,
    edgesThroughLabels: hard.edgesThroughLabels,
    offCanvas: hard.offCanvas,
    badgeOverlaps: count("DG211"),
    nestingProblems: count("DG213") + nesting,
    labelsOnBorders: count("DG220"),
    edgesSkimmingNodes: count("DG221"),
  });
}

/** The geometry rules live in check.ts; review maps each diagnostic to one finding. */
function mapDiagnostics(c: Ctx, diagnostics: Diagnostic[]): void {
  const { add, hard } = c;
  for (const d of diagnostics) {
    const rule = OVERLAP_RULES[d.code === "DG202" && d.subject?.edges ? "DG202:labels" : d.code];
    if (!rule) continue;
    if (rule.hard) hard[rule.hard]++;
    add(
      rule.id,
      rule.severity,
      subjectIds(d, rule.ids),
      flatEvidence(d.evidence),
      d.message,
      d.fixes ?? [],
      rule.cost,
    );
  }
}

/** Not in check.ts: DG209 covers the label chip (and an overlay's icon), not a plain group's icon. */
function edgesThroughGroupIcons(c: Ctx, diagnostics: Diagnostic[]): void {
  const { scene, add, hard } = c;
  for (const g of scene.groups) {
    if (!g.iconBox) continue;
    for (const e of scene.edges) {
      const len = pathClipLen(e.points, g.iconBox, EPS);
      const reported = diagnostics.some(
        (d) => d.code === "DG209" && d.subject?.edge === e.id && d.subject?.group === g.id,
      );
      if (len <= 1 || reported) continue;
      hard.edgesThroughHeaders++;
      add(
        "overlap.edge-through-header",
        "major",
        [e.id, g.id],
        { edge: edgeName(e), group: g.id, lengthPx: r1(len) },
        `edge ${edgeName(e)} runs ${r1(len)}px through the icon of group "${g.id}", so it looks broken`,
        [
          `reorder the nodes inside "${g.id}" so the edge enters away from the header`,
          `shorten the label of "${g.id}"`,
          "change direction",
        ],
        8,
      );
    }
  }
}

/** Not in check.ts: DG212 covers another edge's label, not its step badge or a node's label text. */
function edgesThroughStepsAndText(c: Ctx): void {
  const { scene, add, hard } = c;
  const horizontal = horizontalFlow(scene.direction);
  for (const e of scene.edges) {
    for (const o of scene.edges) {
      const len = o.id !== e.id && real(o.stepBox) ? pathClipLen(e.points, o.stepBox, 1) : 0;
      if (len > 1) {
        hard.edgesThroughLabels++;
        add(
          "overlap.edge-through-label",
          "major",
          [e.id, o.id],
          { edge: edgeName(e), other: edgeName(o), part: "step", lengthPx: r1(len) },
          `edge ${edgeName(e)} runs ${r1(len)}px through the step of ${edgeName(o)}`,
          [
            "move one endpoint earlier or later in the nodes list",
            `shorten or drop the label on ${edgeName(o)}`,
            "use layout: { spacing: loose }",
          ],
          8,
        );
      }
    }
    for (const n of scene.nodes) {
      const own = n.id === e.from || n.id === e.to;
      // A vertical flow leaves an icon through the label under it by design.
      if (own && !horizontal && n.look === "icon") continue;
      for (const [part, b] of [
        ["label", n.labelBox],
        ["note", n.noteBox],
      ] as const) {
        if (!real(b) || (n.look !== "icon" && own)) continue;
        const len = pathClipLen(e.points, b, 1);
        if (len > 1) {
          hard.edgesThroughLabels++;
          add(
            "overlap.edge-through-label",
            "major",
            [e.id, n.id],
            { edge: edgeName(e), node: n.id, part, lengthPx: r1(len) },
            `edge ${edgeName(e)} runs ${r1(len)}px through the ${part} text of "${n.id}"`,
            [`move "${n.id}" earlier or later in the nodes list`, "change direction"],
            8,
          );
        }
      }
    }
  }
}

/** Not in check.ts: nodes and groups against their parent frame, and sibling groups. */
function nestingProblems(c: Ctx): number {
  const { scene, add } = c;
  let nesting = 0;
  const check = (id: string, box: Box | undefined, parentId: string | undefined) => {
    const p = parentId ? c.groups.get(parentId) : undefined;
    if (!p || !box || p.overlay) return;
    const start = contentStart(p);
    const clear = {
      left: box.x - start.x,
      right: p.box.x + p.box.w - (box.x + box.w),
      top: box.y - start.y,
      bottom: p.box.y + p.box.h - (box.y + box.h),
    };
    const min = Math.min(clear.left, clear.right, clear.top, clear.bottom);
    if (min < -EPS) {
      nesting++;
      add(
        "overlap.outside-group",
        "major",
        [id, p.id],
        {
          parent: p.id,
          left: r1(clear.left),
          right: r1(clear.right),
          top: r1(clear.top),
          bottom: r1(clear.bottom),
        },
        `"${id}" sticks ${r1(-min)}px out of "${p.id}" or into its header`,
        [`shorten the label of "${id}"`, `shorten the label of "${p.id}"`],
        8,
      );
    }
  };
  for (const n of scene.nodes) check(n.id, c.foot.get(n.id), n.parent);
  for (const g of scene.groups) if (!g.overlay) check(g.id, g.box, g.parent);
  const frames = scene.groups.filter((g) => !g.overlay);
  for (let i = 0; i < frames.length; i++)
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i];
      const b = frames[j];
      if (!a || !b || c.isDescendant(a.id, b.id) || c.isDescendant(b.id, a.id)) continue;
      const area = interArea(a.box, b.box);
      if (area > 1) {
        nesting++;
        add(
          "overlap.groups-collide",
          "major",
          [a.id, b.id],
          { areaPx: r1(area) },
          `groups "${a.id}" and "${b.id}" overlap but do not nest`,
          ["nest one inside the other with in:", "use around: for a group that spans others"],
          10,
        );
      }
    }
  return nesting;
}
