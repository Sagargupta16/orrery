// Composition checks on a laid-out scene: what a reviewer would flag by eye, as data an agent can act on.
import type {
  Box,
  Diagnostic,
  EdgeLine,
  Model,
  ModelGroup,
  Point,
  Scene,
  SceneNode,
} from "./types.ts";

const overlaps = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/** Geometry tolerance in px: touching edges and sub-pixel rounding are not findings. */
const EPS = 0.5;
const tenth = (v: number) => Math.round(v * 10) / 10;
const boxOf = (b: Box) => ({ x: tenth(b.x), y: tenth(b.y), w: tenth(b.w), h: tenth(b.h) });
const pointOf = (p: Point) => ({ x: tenth(p.x), y: tenth(p.y) });
const same = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** A round step badge (its box is the circle's bounding square) against a rectangle. */
function circleHitsBox(c: Box, b: Box): boolean {
  const r = c.w / 2;
  const cx = c.x + r;
  const cy = c.y + c.h / 2;
  const nx = Math.min(Math.max(cx, b.x), b.x + b.w);
  const ny = Math.min(Math.max(cy, b.y), b.y + b.h);
  return Math.hypot(cx - nx, cy - ny) < r - EPS;
}

/** What the header chip of a group covers: the label, plus an overlay legend's icon on its row. */
function headerChip(g: Scene["groups"][number]): Box | undefined {
  if (!g.label.lines.length) return undefined;
  const b = g.labelBox;
  const icon = g.overlay ? g.iconBox : undefined;
  const parts = icon && icon.y < b.y + b.h && b.y < icon.y + icon.h ? [b, icon] : [b];
  const x = Math.min(...parts.map((b) => b.x));
  const y = Math.min(...parts.map((b) => b.y));
  const r = Math.max(...parts.map((b) => b.x + b.w));
  const bt = Math.max(...parts.map((b) => b.y + b.h));
  return { x: x - 4, y: y - 1, w: r - x + 8, h: bt - y + 2 };
}

/** The pill a node badge draws: the layout's box, else the renderer's own placement. */
function badgeRect(n: SceneNode): Box | undefined {
  if (!n.badge) return undefined;
  if (n.badgeBox) return n.badgeBox;
  const anchor = n.look === "icon" ? n.iconBox : n.box;
  if (!anchor) return undefined;
  const w = Math.max(18, 8 + n.badge.length * 6.4);
  return { x: anchor.x + anchor.w - w / 2 - 2, y: anchor.y - 7, w, h: 16 };
}

/** The drawn pieces of a node, most specific first, so a finding can name what was hit. */
function nodeParts(n: SceneNode): { what: string; box: Box }[] {
  const parts: { what: string; box: Box }[] = [];
  const add = (what: string, box?: Box) => {
    if (box && box.w > 0 && box.h > 0) parts.push({ what, box });
  };
  add("label", n.labelBox);
  add("note", n.noteBox);
  if (n.iconBox && !same(n.iconBox, n.box)) add("icon", n.iconBox);
  add(n.look === "icon" ? "icon" : "shape", n.box);
  return parts;
}

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

/** Shortest distance between segment pq and box b; 0 when they touch. */
function segmentBoxDistance(p: Point, q: Point, b: Box): number {
  if (segmentHitsBox(p, q, b, 0)) return 0;
  const toSegment = (x: number, y: number) => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const t = Math.max(
      0,
      Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    return Math.hypot(p.x + t * dx - x, p.y + t * dy - y);
  };
  const toBox = (x: number, y: number) =>
    Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));
  const corners: [number, number][] = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ];
  return Math.min(toBox(p.x, p.y), toBox(q.x, q.y), ...corners.map(([x, y]) => toSegment(x, y)));
}

/** Closer than this (canvas px) an edge reads as touching a node it passes (DG221). */
const SKIM_PX = 10;

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
  // Tall diagrams are not scaled down in a page column, so only flag ones taller than two screens.
  const tall = scene.height / Math.max(1, scene.width);
  if (tall > 4.5 && scene.height > 1800 && scene.nodes.length > 6) {
    warn("DG205", `diagram is a ${tall.toFixed(1)}:1 tall strip, hard to read in docs`, {
      evidence: { width: scene.width, height: scene.height },
      fixes: [
        "use direction: right for long chains",
        "arrange stages in side-by-side zones",
        "split into two diagrams",
      ],
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
    // An empty pool that exchanges messages is a black-box participant (BPMN), not a leftover.
    const used =
      !!g.around?.length ||
      model.nodes.some((x) => x.parent === g.id) ||
      model.groups.some((x) => x.parent === g.id) ||
      (g.type === "pool" && model.edges.some((e) => e.from === g.id || e.to === g.id));
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
  // A journey's grid places its steps, so links between them are optional.
  for (const n of model.kind === "journey" ? [] : model.nodes) {
    if (!reached(n.id) && model.edges.length) {
      warn("DG208", `node "${n.id}" has no connections`, {
        subject: { node: n.id },
        fixes: [`connect "${n.id}" or remove it (fine for a legend or a standalone service)`],
      });
    }
  }

  // DG209: an edge runs through a group's header label (the chip hides the line, so it looks broken).
  // A pool or lane names itself in a strip across the flow (a black box in its whole band): edges
  // cross the band's borders by design, but never the strip.
  for (const g of scene.groups) {
    const chip = g.lane ? g.lane.header : headerChip(g);
    if (!chip) continue;
    const what = g.lane ? "the name strip of" : "the header label of group";
    for (const e of scene.edges) {
      for (let i = 0; i + 1 < e.points.length; i++) {
        const p = e.points[i];
        const q = e.points[i + 1];
        if (p && q && segmentHitsBox(p, q, chip, EPS)) {
          warn("DG209", `edge ${e.from} -> ${e.to} runs through ${what} "${g.id}"`, {
            subject: { edge: e.id, from: e.from, to: e.to, group: g.id },
            evidence: { header: boxOf(chip), segment: [pointOf(p), pointOf(q)] },
            fixes: g.lane
              ? [
                  `move "${e.from}" or "${e.to}" into the band it reaches, or next to it in the spec`,
                  "use layout: { spacing: loose }",
                ]
              : [
                  `shorten the label of group "${g.id}" so the edge clears it`,
                  `move "${e.from}" or "${e.to}" in the nodes list so the edge enters the group elsewhere`,
                  "use layout: { spacing: loose }",
                ],
          });
          break;
        }
      }
    }
  }

  // DG210: something is drawn outside the canvas and gets cut off.
  const off = (
    what: string,
    subject: Record<string, unknown>,
    box: Box | undefined,
    fixes: string[],
  ) => {
    if (!box) return;
    const past = {
      left: -box.x,
      top: -box.y,
      right: box.x + box.w - scene.width,
      bottom: box.y + box.h - scene.height,
    };
    const sides = Object.entries(past).filter(([, v]) => v > EPS);
    if (!sides.length) return;
    warn(
      "DG210",
      `${what} sticks out of the ${scene.width}x${scene.height} canvas (${sides.map(([k, v]) => `${tenth(v)}px past the ${k}`).join(", ")})`,
      {
        subject,
        evidence: {
          box: boxOf(box),
          canvas: { width: scene.width, height: scene.height },
          past: Object.fromEntries(sides.map(([k, v]) => [k, tenth(v)])),
        },
        fixes,
      },
    );
  };
  const hull = (boxes: (Box | undefined)[]): Box | undefined => {
    const bs = boxes.filter((b): b is Box => !!b && (b.w > 0 || b.h > 0));
    if (!bs.length) return undefined;
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    return {
      x,
      y,
      w: Math.max(...bs.map((b) => b.x + b.w)) - x,
      h: Math.max(...bs.map((b) => b.y + b.h)) - y,
    };
  };
  const pathBox = (pts: Point[]): Box | undefined => {
    if (!pts.length) return undefined;
    const x = Math.min(...pts.map((p) => p.x));
    const y = Math.min(...pts.map((p) => p.y));
    return {
      x,
      y,
      w: Math.max(...pts.map((p) => p.x)) - x,
      h: Math.max(...pts.map((p) => p.y)) - y,
    };
  };
  const spread = ["use layout: { spacing: loose }", "move it elsewhere in the nodes list"];
  off("the title", { title: true }, scene.titleBox, spread);
  off("the subtitle", { subtitle: true }, scene.subtitleBox, spread);
  for (const n of scene.nodes) {
    const parts = [n.box, n.iconBox, n.labelBox, n.noteBox, badgeRect(n)];
    off(`node "${n.id}"`, { node: n.id }, hull(parts), [
      `move "${n.id}" in the nodes list`,
      ...spread,
    ]);
  }
  for (const g of scene.groups) {
    const parts = [g.box, g.label.lines.length ? g.labelBox : undefined, g.iconBox];
    off(`group "${g.id}"`, { group: g.id }, hull(parts), spread);
  }
  for (const e of scene.edges) {
    const free = model.edges.some((x) => x.id === e.id && !x.constraint);
    const fixes = free
      ? [
          "remove constraint: false from this edge so layout reserves room for its label and step",
          "shorten the label",
        ]
      : ["shorten the label", "use layout: { spacing: loose }"];
    const who = `${e.from} -> ${e.to}`;
    off(`the path of edge ${who}`, { edge: e.id, part: "path" }, pathBox(e.points), fixes);
    off(`the label of edge ${who}`, { edge: e.id, part: "label" }, e.labelBox, fixes);
    off(`step ${e.step} of edge ${who}`, { edge: e.id, part: "step" }, e.stepBox, fixes);
  }
  off("the legend", { legend: true }, scene.legend?.box, spread);

  // DG211: a step badge or a node badge sits on a node, a label or another badge.
  interface Pill {
    round: boolean;
    box: Box;
    what: string;
    subject: Record<string, unknown>;
    node?: string;
  }
  const pills: Pill[] = [];
  for (const e of scene.edges) {
    if (e.stepBox && e.step !== undefined) {
      const subject = { edge: e.id, from: e.from, to: e.to, step: e.step };
      pills.push({
        round: true,
        box: e.stepBox,
        what: `step ${e.step} on ${e.from} -> ${e.to}`,
        subject,
      });
    }
  }
  for (const n of scene.nodes) {
    const box = badgeRect(n);
    if (n.badge && box) {
      const what = `badge "${n.badge}" on node "${n.id}"`;
      pills.push({ round: false, box, what, subject: { node: n.id }, node: n.id });
    }
  }
  const hits = (p: Pill, b: Box) => (p.round ? circleHitsBox(p.box, b) : overlaps(p.box, b, -EPS));
  const pillFixes = (p: Pill) =>
    p.round
      ? ["shorten the edge label next to it", "use layout: { spacing: loose }"]
      : ["shorten the badge text", "use layout: { spacing: loose }"];
  const pillWarn = (p: Pill, over: string, subject: Record<string, unknown>, box: Box) =>
    warn("DG211", `${p.what} covers ${over}`, {
      subject: { ...p.subject, ...subject },
      evidence: { badge: boxOf(p.box), over: boxOf(box) },
      fixes: pillFixes(p),
    });
  for (const p of pills) {
    for (const n of scene.nodes) {
      const own = p.node === n.id;
      const hit = nodeParts(n)
        .filter((x) => !own || x.what === "label" || x.what === "note")
        .find((x) => hits(p, x.box));
      if (hit) pillWarn(p, `the ${hit.what} of node "${n.id}"`, { over: n.id }, hit.box);
    }
    for (const e of scene.edges) {
      if (e.labelBox && hits(p, e.labelBox)) {
        pillWarn(p, `the label of edge ${e.from} -> ${e.to}`, { over: e.id }, e.labelBox);
      }
    }
  }
  for (let i = 0; i < pills.length; i++) {
    for (let j = i + 1; j < pills.length; j++) {
      const a = pills[i];
      const b = pills[j];
      if (!a || !b) continue;
      const [ra, rb] = [a.box.w / 2, b.box.w / 2];
      const hit =
        a.round && b.round
          ? Math.hypot(a.box.x + ra - (b.box.x + rb), a.box.y + ra - (b.box.y + rb)) < ra + rb - EPS
          : a.round
            ? circleHitsBox(a.box, b.box)
            : hits(b, a.box);
      if (hit) pillWarn(a, `${b.what}`, { over: b.node ?? (b.subject.edge as string) }, b.box);
    }
  }

  // DG212: an edge runs through another edge's label.
  for (const a of scene.edges) {
    if (!a.labelBox) continue;
    for (const b of scene.edges) {
      if (b === a) continue;
      for (let i = 0; i + 1 < b.points.length; i++) {
        const p = b.points[i];
        const q = b.points[i + 1];
        if (p && q && segmentHitsBox(p, q, a.labelBox, EPS)) {
          warn(
            "DG212",
            `edge ${b.from} -> ${b.to} runs through the label "${a.label?.lines.join(" ")}" of ${a.from} -> ${a.to}`,
            {
              subject: { edge: b.id, from: b.from, to: b.to, labelOf: a.id },
              evidence: { label: boxOf(a.labelBox), segment: [pointOf(p), pointOf(q)] },
              fixes: [
                "shorten the label or drop a redundant one",
                `move "${b.from}" or "${b.to}" in the nodes list so the two edges separate`,
                "use layout: { spacing: loose }",
              ],
            },
          );
          break;
        }
      }
    }
  }

  // DG213: an overlay (around:) group encloses something that is not one of its members.
  const member = (id: string, g: ModelGroup) => {
    for (let p: string | undefined = id; p; p = parentOf.get(p)) {
      if (p === g.id || g.around?.includes(p)) return true;
    }
    return false;
  };
  for (const mg of model.groups) {
    const ov = mg.around?.length ? scene.groups.find((x) => x.id === mg.id) : undefined;
    if (!ov) continue;
    const enclosed: { id: string; kind: string; box: Box }[] = [];
    for (const n of scene.nodes) {
      if (!member(n.id, mg) && overlaps(n.box, ov.box, -EPS))
        enclosed.push({ id: n.id, kind: "node", box: n.box });
    }
    for (const g of scene.groups) {
      const b = g.box;
      const inside =
        b.x >= ov.box.x - EPS &&
        b.y >= ov.box.y - EPS &&
        b.x + b.w <= ov.box.x + ov.box.w + EPS &&
        b.y + b.h <= ov.box.y + ov.box.h + EPS;
      if (!g.overlay && inside && !member(g.id, mg))
        enclosed.push({ id: g.id, kind: "group", box: b });
    }
    for (const x of enclosed) {
      warn(
        "DG213",
        `overlay group "${mg.id}" encloses ${x.kind} "${x.id}", which it does not list in around:`,
        {
          subject: { group: mg.id, enclosed: x.id, kind: x.kind },
          evidence: { overlay: boxOf(ov.box), enclosed: boxOf(x.box) },
          fixes: [
            `add "${x.id}" to around: of "${mg.id}" if it belongs to it`,
            `move "${x.id}" in the nodes list so it sits outside the overlay`,
            "put the members of the overlay next to each other (same parent group, adjacent in the nodes list)",
          ],
        },
      );
    }
  }

  // DG214: an overlay's header (its tile and label) covers another group's header or a node.
  // Overlays cross other groups by design, so the group checks skip them; their headers still
  // must not hide anything.
  const headerParts = (g: Scene["groups"][number]): Box[] =>
    [g.label.lines.length ? g.labelBox : undefined, g.iconBox].filter(
      (b): b is Box => !!b && b.w > 0 && b.h > 0,
    );
  for (const ov of scene.groups) {
    if (!ov.overlay) continue;
    const own = headerParts(ov);
    const hits = (b: Box) => own.find((o) => overlaps(o, b, -EPS));
    const covered: { what: string; id: string; kind: "group" | "node"; box: Box; by: Box }[] = [];
    for (const g of scene.groups) {
      if (g.id === ov.id) continue;
      for (const b of headerParts(g)) {
        const by = hits(b);
        if (by) {
          covered.push({
            what: `the header of group "${g.id}"`,
            id: g.id,
            kind: "group",
            box: b,
            by,
          });
          break;
        }
      }
    }
    for (const n of scene.nodes) {
      for (const part of nodeParts(n)) {
        const by = hits(part.box);
        if (by) {
          covered.push({ what: `node "${n.id}"`, id: n.id, kind: "node", box: part.box, by });
          break;
        }
      }
    }
    // Layout already pads the groups of the overlay's members until the header clears the group
    // headers above them, so what is left needs the spec to change.
    const members = model.groups.find((g) => g.id === ov.id)?.around ?? [];
    const loose = members.filter((m) => !parentOf.get(m)).map((m) => `"${m}"`);
    for (const x of covered) {
      warn("DG214", `the header of overlay group "${ov.id}" covers ${x.what}`, {
        subject: { group: ov.id, covered: x.id, kind: x.kind },
        evidence: { header: boxOf(x.by), covered: boxOf(x.box) },
        fixes: [
          ...(loose.length
            ? [`put ${loose.join(", ")} in a group (in:), so layout can make room for the header`]
            : []),
          x.kind === "node"
            ? `move "${x.id}" in the nodes list so it sits clear of the header of "${ov.id}"`
            : `move the members of "${ov.id}" in the nodes list so its header sits clear of "${x.id}"`,
          `shorten the label of "${ov.id}"`,
        ],
      });
    }
  }

  // DG217: a line style is drawn that the legend does not explain. BPMN's own notation explains a
  // dashed message flow and a dotted association.
  const explained = new Set<EdgeLine>((model.legend ?? []).map((l) => l.line));
  const notation = (e: Model["edges"][number]) =>
    (e.flow === "message" && e.line === "dashed") ||
    (e.flow === "association" && e.line === "dotted");
  const styles = new Map<EdgeLine, number>();
  for (const e of model.edges) {
    if (e.line !== "solid" && !explained.has(e.line) && !notation(e))
      styles.set(e.line, (styles.get(e.line) ?? 0) + 1);
  }
  if (styles.size) {
    const counts = [...styles].map(([line, k]) => `${line} (${k} edge${k === 1 ? "" : "s"})`);
    warn("DG217", `line styles without a legend entry: ${counts.join(", ")}`, {
      subject: { lines: [...styles.keys()] },
      evidence: Object.fromEntries(styles),
      fixes: [
        `add legend: { ${[...styles.keys()].map((l) => `${l}: <what ${l} means>`).join(", ")} }`,
        "or draw these edges solid",
      ],
    });
  }

  // DG218: ELK needed a fallback strategy, so the picture may not follow the spec order.
  if (scene.layoutFallback) {
    warn(
      "DG218",
      `layout used the "${scene.layoutFallback}" fallback; spec order may not be kept`,
      {
        evidence: { fallback: scene.layoutFallback },
        fixes: [
          "check that the node order in the picture still tells the story",
          "simplify nested groups or links between groups",
          "try layout: { layering: simplex }",
        ],
      },
    );
  }

  // DG219: a setting layout could not honor (Scene.ignored), so the spec says more than the picture.
  const kindOf = (id: string) =>
    model.nodes.some((n) => n.id === id)
      ? "node"
      : model.groups.some((g) => g.id === id)
        ? "group"
        : model.edges.some((e) => e.id === id)
          ? "edge"
          : "layout";
  for (const ig of scene.ignored ?? []) {
    const kind = kindOf(ig.subject);
    const what = ig.setting.startsWith(`${ig.subject}.`)
      ? ig.setting
      : `${ig.subject} ${ig.setting}`;
    warn("DG219", `${what} had no effect: ${ig.reason}`, {
      subject: { [kind]: ig.subject, setting: ig.setting },
      evidence: { reason: ig.reason },
      fixes: [
        kind === "layout"
          ? `remove ${ig.setting}, or change it so layout can honor it`
          : `remove ${ig.setting} from "${ig.subject}", or change it so layout can honor it`,
        "check the picture: the setting is not what placed it",
      ],
    });
  }

  // DG220: an edge label sits on a group's border line. Its chip paints over the line, so the frame
  // looks broken there and the label belongs to neither side. A line along the chip's edge does not
  // count; one more than 1px inside it does.
  for (const e of scene.edges) {
    const b = e.labelBox;
    if (!b || !e.label) continue;
    const inside = (v: number, lo: number, len: number) => v > lo + 1 && v < lo + len - 1;
    const spans = (lo: number, len: number, a: number, alen: number) =>
      lo < a + alen - EPS && a < lo + len - EPS;
    for (const g of scene.groups) {
      const r = g.box;
      const sides = [
        ["top", inside(r.y, b.y, b.h) && spans(r.x, r.w, b.x, b.w)],
        ["bottom", inside(r.y + r.h, b.y, b.h) && spans(r.x, r.w, b.x, b.w)],
        ["left", inside(r.x, b.x, b.w) && spans(r.y, r.h, b.y, b.h)],
        ["right", inside(r.x + r.w, b.x, b.w) && spans(r.y, r.h, b.y, b.h)],
      ] as const;
      const on = sides.filter(([, hit]) => hit).map(([side]) => side);
      if (!on.length) continue;
      warn(
        "DG220",
        `label "${e.label.lines.join(" ")}" on ${e.from} -> ${e.to} sits on the ${on.join(" and ")} border of group "${g.id}"`,
        {
          subject: { edge: e.id, from: e.from, to: e.to, group: g.id },
          evidence: { label: boxOf(b), group: boxOf(r), sides: on.join(",") },
          fixes: [
            "shorten the label so it fits between the borders",
            `move "${e.from}" or "${e.to}" in the nodes list so the edge's middle sits inside or outside "${g.id}"`,
            "use layout: { spacing: loose }",
          ],
        },
      );
    }
  }

  // DG221: an edge runs within SKIM_PX of a node it does not connect, so it reads as touching it
  // (aws-archify check-layout 14c). A run into the node's box itself is DG201. Canvas px: ELK keeps
  // edges 18px off nodes at normal spacing, so a skim is a routing accident at any display width.
  for (const e of scene.edges) {
    for (const nb of nodeBoxes) {
      if (nb.id === e.from || nb.id === e.to) continue;
      let gap = Number.POSITIVE_INFINITY;
      let through = false;
      for (let i = 0; i + 1 < e.points.length; i++) {
        const p = e.points[i];
        const q = e.points[i + 1];
        if (!p || !q) continue;
        if (segmentHitsBox(p, q, nb.box)) through = true;
        gap = Math.min(gap, segmentBoxDistance(p, q, nb.box));
      }
      if (through || gap >= SKIM_PX) continue;
      warn(
        "DG221",
        `edge ${e.from} -> ${e.to} passes ${tenth(gap)}px from node "${nb.id}", so it reads as touching it`,
        {
          subject: { edge: e.id, from: e.from, to: e.to, node: nb.id },
          evidence: { gapPx: tenth(gap), minPx: SKIM_PX, node: boxOf(nb.box) },
          fixes: [
            `move "${nb.id}" earlier or later in the nodes list`,
            "use layout: { spacing: loose }",
          ],
        },
      );
    }
  }
  return out;
}
