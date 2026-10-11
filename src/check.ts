// Composition checks on a laid-out scene: what a reviewer would flag by eye, as data an agent can act on.
import type { Box, Diagnostic, Model, Point, Scene } from "./types.ts";

const overlaps = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

function segmentHitsBox(p: Point, q: Point, b: Box, inset = 3): boolean {
  const box = { x: b.x + inset, y: b.y + inset, w: b.w - inset * 2, h: b.h - inset * 2 };
  if (box.w <= 0 || box.h <= 0) return false;
  // Liang-Barsky clip of segment pq against the box.
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const edges: [number, number][] = [
    [-dx, p.x - box.x],
    [dx, box.x + box.w - p.x],
    [-dy, p.y - box.y],
    [dy, box.y + box.h - p.y],
  ];
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return false;
    } else {
      const r = qq / pp;
      if (pp < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 < t1;
}

export interface CheckOptions {
  /** Widest the diagram should be before a layout hint fires (px). */
  maxWidth?: number;
}

export function checkScene(scene: Scene, model: Model, opts: CheckOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = [];
  const warn = (code: string, message: string, extra: Partial<Diagnostic> = {}) =>
    out.push({ code, severity: "warning", message, ...extra });

  const nodeBoxes = scene.nodes.map((n) => {
    // The drawn footprint: attach box plus the label underneath icon nodes.
    const parts = [n.box, n.iconBox, n.labelBox, n.noteBox].filter((b): b is Box => !!b && b.w > 0);
    const x = Math.min(...parts.map((b) => b.x));
    const y = Math.min(...parts.map((b) => b.y));
    const r = Math.max(...parts.map((b) => b.x + b.w));
    const bt = Math.max(...parts.map((b) => b.y + b.h));
    return { id: n.id, box: n.box, foot: { x, y, w: r - x, h: bt - y }, label: n.labelBox };
  });

  // DG201: an edge runs through a node it does not connect.
  for (const e of scene.edges) {
    for (const nb of nodeBoxes) {
      if (nb.id === e.from || nb.id === e.to) continue;
      for (let i = 0; i + 1 < e.points.length; i++) {
        const p = e.points[i];
        const q = e.points[i + 1];
        if (p && q && segmentHitsBox(p, q, nb.box)) {
          warn("DG201", `edge ${e.from} -> ${e.to} passes through node "${nb.id}"`, {
            subject: { edge: e.id, from: e.from, to: e.to, node: nb.id },
            fixes: [
              `move "${nb.id}" earlier or later in the nodes list`,
              "try layout: { layering: simplex }",
              "change direction",
            ],
          });
          break;
        }
      }
    }
  }

  // DG202: an edge label covers a node or another edge label.
  const labels = scene.edges.filter((e) => e.labelBox).map((e) => ({ e, box: e.labelBox as Box }));
  for (const { e, box } of labels) {
    for (const nb of nodeBoxes) {
      if (overlaps(box, nb.foot, -1)) {
        warn(
          "DG202",
          `label "${e.label?.lines.join(" ")}" on ${e.from} -> ${e.to} covers node "${nb.id}"`,
          {
            subject: { edge: e.id, node: nb.id },
            fixes: ["shorten the edge label", "use layout: { spacing: loose }"],
          },
        );
      }
    }
  }
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      if (a && b && overlaps(a.box, b.box, -1)) {
        warn(
          "DG202",
          `edge labels on ${a.e.from} -> ${a.e.to} and ${b.e.from} -> ${b.e.to} overlap`,
          {
            subject: { edges: [a.e.id, b.e.id] },
            fixes: ["shorten one label or drop a redundant one", "use layout: { spacing: loose }"],
          },
        );
      }
    }
  }

  // DG203: two nodes' drawn footprints overlap (label text colliding with a neighbour).
  for (let i = 0; i < nodeBoxes.length; i++) {
    for (let j = i + 1; j < nodeBoxes.length; j++) {
      const a = nodeBoxes[i];
      const b = nodeBoxes[j];
      if (a && b && overlaps(a.foot, b.foot, -2)) {
        warn("DG203", `nodes "${a.id}" and "${b.id}" overlap (labels collide)`, {
          subject: { nodes: [a.id, b.id] },
          fixes: [`shorten the label of "${a.id}" or "${b.id}"`, "use layout: { spacing: loose }"],
        });
      }
    }
  }

  // DG204: long labels wrap to many lines.
  for (const n of scene.nodes) {
    if (n.label.lines.length > 3) {
      warn("DG204", `node "${n.id}" label wraps to ${n.label.lines.length} lines`, {
        subject: { node: n.id },
        evidence: { lines: n.label.lines },
        fixes: ["shorten the label and move detail into note"],
      });
    }
  }

  // DG205: shape of the whole picture.
  const maxWidth = opts.maxWidth ?? 2400;
  if (scene.width > maxWidth) {
    warn("DG205", `diagram is ${scene.width}px wide (over ${maxWidth}px)`, {
      evidence: { width: scene.width, height: scene.height },
      fixes: ["use direction: down", "group related nodes", "split into two diagrams"],
    });
  }
  const ratio = scene.width / Math.max(1, scene.height);
  if (ratio > 4.5 && scene.nodes.length > 6) {
    warn("DG205", `diagram is a ${ratio.toFixed(1)}:1 strip, hard to read in docs`, {
      evidence: { width: scene.width, height: scene.height },
      fixes: ["use direction: down for long chains", "group stages into zones"],
    });
  }

  // DG206: size.
  if (model.nodes.length > 40) {
    warn("DG206", `${model.nodes.length} nodes in one diagram`, {
      fixes: [
        "split into an overview and detail diagrams",
        "collapse repeated nodes and use badge: x3",
      ],
    });
  }

  // DG207: empty groups; DG208: nodes nothing connects to.
  for (const g of model.groups) {
    const used =
      !!g.around?.length ||
      model.nodes.some((x) => x.parent === g.id) ||
      model.groups.some((x) => x.parent === g.id);
    if (!used) {
      warn("DG207", `group "${g.id}" is empty`, {
        subject: { group: g.id },
        fixes: [`put nodes in it with in: ${g.id}, or remove it`],
      });
    }
  }
  const touched = new Set(model.edges.flatMap((e) => [e.from, e.to]));
  const parentOf = new Map<string, string | undefined>([
    ...model.nodes.map((x) => [x.id, x.parent] as const),
    ...model.groups.map((x) => [x.id, x.parent] as const),
  ]);
  const reached = (id: string): boolean => {
    for (let p: string | undefined = id; p; p = parentOf.get(p)) if (touched.has(p)) return true;
    return model.groups.some((g) => g.around?.includes(id) && touched.has(g.id));
  };
  for (const n of model.nodes) {
    if (!reached(n.id) && model.edges.length) {
      warn("DG208", `node "${n.id}" has no connections`, {
        subject: { node: n.id },
        fixes: [`connect "${n.id}" or remove it (fine for a legend or a standalone service)`],
      });
    }
  }
  return out;
}
