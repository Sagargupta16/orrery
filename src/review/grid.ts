// The grid dimension: ragged layers, tiny jogs, off-center group content, uneven layer gaps, and
// wide gaps between a frame's rows or columns and between sibling groups.
import type { Box, SceneEdge } from "../types.ts";
import { EPS, horizontalFlow, r1, r2, real, segments, simplify, union } from "./geometry.ts";
import { edgeName } from "./names.ts";
import type { Ctx } from "./types.ts";

export function measureGrid(c: Ctx): void {
  const { scene, add } = c;
  const m = c.metrics.grid;
  const horizontal = horizontalFlow(scene.direction);
  const F = horizontal ? "x" : "y";
  const FW = horizontal ? "w" : "h";
  const frames = scene.groups.filter((g) => !g.overlay);

  // Layers per parent: items whose flow-axis extents overlap (grid lane).
  let ragged = 0;
  const gaps: number[] = [];
  for (const P of new Set<string | undefined>([undefined, ...frames.map((g) => g.id)])) {
    const items = [
      ...scene.nodes
        .filter((n) => n.parent === P)
        .map((n) => ({ id: n.id, box: n.box, v: c.foot.get(n.id) ?? n.box })),
      ...frames.filter((g) => g.parent === P).map((g) => ({ id: g.id, box: g.box, v: g.box })),
    ].sort((a, b) => a.box[F] - b.box[F]);
    const layers: { items: typeof items; end: number }[] = [];
    for (const it of items) {
      const L = layers.at(-1);
      if (L && it.box[F] < L.end - 0.01) {
        L.items.push(it);
        L.end = Math.max(L.end, it.box[F] + it.box[FW]);
      } else layers.push({ items: [it], end: it.box[F] + it.box[FW] });
    }
    for (const L of layers) {
      if (L.items.length < 2) continue;
      const spread = (f: (i: (typeof items)[number]) => number) =>
        Math.max(...L.items.map(f)) - Math.min(...L.items.map(f));
      const st = spread((i) => i.v[F]);
      const ce = spread((i) => i.v[F] + i.v[FW] / 2);
      const en = spread((i) => i.v[F] + i.v[FW]);
      if (Math.min(st, ce, en) > 2) {
        ragged++;
        add(
          "grid.ragged",
          "minor",
          L.items.map((i) => i.id),
          { startPx: r1(st), centerPx: r1(ce), endPx: r1(en), parent: P ?? "(root)" },
          `${L.items.map((i) => `"${i.id}"`).join(", ")} share no start, center or end line (best ${r1(Math.min(st, ce, en))}px off)`,
          ["give the items in this layer the same look and similar label lengths"],
          4,
        );
      }
    }
    for (let i = 1; i < layers.length; i++) {
      const prev = layers[i - 1];
      const next = layers[i];
      if (!prev || !next) continue;
      const end = Math.max(...prev.items.map((it) => it.v[F] + it.v[FW]));
      const start = Math.min(...next.items.map((it) => it.v[F]));
      gaps.push(start - end);
    }
  }

  // Tiny jogs: interior runs under 6px.
  let jogs = 0;
  for (const e of scene.edges) {
    const pts = simplify(e.points);
    for (let i = 1; i < pts.length - 2; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > 0.01 && len < 6) {
        jogs++;
        add(
          "grid.jog",
          "minor",
          [e.id],
          { edge: edgeName(e), jogPx: r2(len), x: r1(a.x), y: r1(a.y) },
          `${edgeName(e)} steps ${r2(len)}px sideways where it could run straight`,
          [`give "${e.from}" and "${e.to}" the same look and size`, "use layout: { merge: false }"],
          3,
        );
      }
    }
  }

  // Content centering inside groups. A pool or lane runs the whole length of the process, so its
  // steps sit where they happen in time, not centered.
  let offCenter = 0;
  for (const g of frames) {
    if (g.lane) continue;
    const kids = [
      ...scene.nodes.filter((n) => n.parent === g.id).map((n) => c.foot.get(n.id)),
      ...frames.filter((x) => x.parent === g.id).map((x) => x.box),
    ];
    const u = union(kids);
    if (!u) continue;
    const left = u.x - g.box.x;
    const right = g.box.x + g.box.w - (u.x + u.w);
    if (Math.abs(left - right) > 6) {
      offCenter++;
      add(
        "grid.off-center",
        "minor",
        [g.id],
        { leftPx: r1(left), rightPx: r1(right) },
        `the content of "${g.id}" sits ${r1(Math.abs(left - right) / 2)}px off center (left ${r1(left)}, right ${r1(right)})`,
        [`shorten the label of "${g.id}" so it does not widen the frame`],
        3,
      );
    }
  }

  // Gap spread between layers.
  const mean = gaps.reduce((s, v) => s + v, 0) / Math.max(1, gaps.length);
  const sd = Math.sqrt(gaps.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, gaps.length));
  const cv = mean > 0 ? sd / mean : 0;
  if (gaps.length >= 3 && cv > 0.35) {
    add(
      "grid.uneven-gaps",
      "minor",
      [],
      {
        gapCv: r2(cv),
        gapMinPx: r1(Math.min(...gaps)),
        gapMaxPx: r1(Math.max(...gaps)),
        layers: gaps.length + 1,
      },
      `gaps between layers range from ${r1(Math.min(...gaps))} to ${r1(Math.max(...gaps))}px (spread ${r2(cv)})`,
      ["shorten the longest edge labels; a labelled edge widens its gap"],
      (cv - 0.35) * 40,
    );
  }

  const { wide, between } = frameGaps(c);

  Object.assign(m, {
    raggedLayers: ragged,
    jogs,
    offCenterGroups: offCenter,
    gapCv: r2(cv),
    gapMinPx: gaps.length ? r1(Math.min(...gaps)) : 0,
    gapMaxPx: gaps.length ? r1(Math.max(...gaps)) : 0,
    wideGaps: wide,
    groupGaps: between,
  });
}

interface Band {
  lo: number;
  hi: number;
}

interface Gap {
  d: number;
  a0: number;
  b0: number;
  /** What layout itself puts there: one layer gap, or two and the labels between them. */
  room: number;
  /** Edge runs across the gap, each on its own routing track. */
  tracks: number;
  /** Edges whose labels or step badges sit in the gap. */
  labelled: SceneEdge[];
}

/**
 * Row and column gaps per frame (aws-archify check 11, MIT-0). A frame's rows (and columns) are
 * its own node footprints and child groups merged into bands across it; the canvas is a frame too.
 * The sample measures a gap against fixed numbers (over 160px, or over 2.5x the smallest and over
 * 64px, is an empty band; between two sibling groups, more than the labels in it need, 48px at
 * least, plus 32px). Here each gap is measured against the room layout itself gives it: one layer
 * gap (64px times layout.spacing), or, when edge labels sit in it, two layer gaps and the labels,
 * because ELK gives centered labels a layer of their own; and never less than the routing tracks of
 * the edge runs across it. At the sample's numbers every labelled
 * gap in the gallery (about 165px at normal spacing) reads as a hole, and no spec edit closes it.
 * So an empty band is over 96px more than its room (an unlabelled gap at normal spacing: the
 * sample's 160px) or over 2.5x its room and over 64px, and a gap between sibling groups is over its
 * room (48px at least) plus 32px. grid.uneven-gaps judges the spread of every layer gap at once,
 * so one evenly wide gap passes it. Canvas px at 1x, like every length in this file and the
 * sample's own: they say how far apart layout put two rows, and a narrower column shrinks the gap
 * and its room alike. A pool or lane places steps where they happen in time and a journey's grid
 * places every step, so neither is measured.
 */
function frameGaps(c: Ctx): { wide: number; between: number } {
  const { scene, model, add } = c;
  let wide = 0;
  let between = 0;
  if (model.kind === "journey") return { wide, between };
  const layer = 64 * model.spacing;
  const frames = scene.groups.filter((g) => !g.overlay);
  const runs = scene.edges.flatMap((e) => segments(simplify(e.points)));
  const marks = scene.edges.flatMap((e) =>
    [e.labelBox, e.stepBox].filter(real).map((box) => ({ e, box })),
  );
  for (const g of [undefined, ...frames.filter((x) => !x.lane)]) {
    const P = g?.id;
    const kids = frames.filter((x) => x.parent === P);
    const items: Box[] = [
      ...scene.nodes.filter((n) => n.parent === P).map((n) => c.foot.get(n.id) ?? n.box),
      ...kids.map((x) => x.box),
    ];
    if (items.length < 2) continue;
    const area = g?.box ?? { x: 0, y: 0, w: scene.width, h: scene.height };
    const where = g ? `group "${g.id}"` : "the canvas";
    for (const [axis, at, size, across, acrossSize] of [
      ["row", "y", "h", "x", "w"],
      ["column", "x", "w", "y", "h"],
    ] as const) {
      const bands: Band[] = [];
      for (const b of [...items].sort((p, q) => p[at] - q[at])) {
        const lo = b[at];
        const hi = b[at] + b[size];
        const band = bands.find((x) => lo < x.hi && x.lo < hi);
        if (band) {
          band.lo = Math.min(band.lo, lo);
          band.hi = Math.max(band.hi, hi);
        } else bands.push({ lo, hi });
      }
      const gaps: Gap[] = [];
      for (let i = 1; i < bands.length; i++) {
        const a0 = bands[i - 1]?.hi ?? 0;
        const b0 = bands[i]?.lo ?? 0;
        if (b0 <= a0) continue;
        const inside = marks.filter(
          ({ box: t }) =>
            t[at] < b0 &&
            t[at] + t[size] > a0 &&
            t[across] < area[across] + area[acrossSize] &&
            t[across] + t[acrossSize] > area[across],
        );
        const lo = Math.max(a0, Math.min(...inside.map(({ box: t }) => t[at])));
        const hi = Math.min(b0, Math.max(...inside.map(({ box: t }) => t[at] + t[size])));
        // Edge runs across the gap each take a routing track: ELK keeps them 10px apart and 20px
        // off the nodes on either side (both times layout.spacing).
        const tracks = new Set(
          runs
            .filter(
              ([p, q]) =>
                Math.abs(p[at] - q[at]) < EPS &&
                p[at] > a0 &&
                p[at] < b0 &&
                Math.min(p[across], q[across]) < area[across] + area[acrossSize] &&
                Math.max(p[across], q[across]) > area[across],
            )
            .map(([p]) => Math.round(p[at])),
        ).size;
        const channel = tracks ? (40 + 10 * (tracks - 1)) * model.spacing : 0;
        const labels = inside.length ? 2 * layer + Math.max(0, hi - lo) : layer;
        gaps.push({
          d: b0 - a0,
          a0,
          b0,
          room: Math.max(labels, channel),
          tracks,
          labelled: [...new Set(inside.map((x) => x.e))],
        });
      }
      const reported = new Set<Gap>();
      for (const gap of gaps) {
        const { d, a0, b0, room } = gap;
        const need = Math.max(48, room);
        if (d <= 48 || d <= need + 32) continue;
        const before = kids.filter((k) => Math.abs(k.box[at] + k.box[size] - a0) <= 1);
        const after = kids.filter((k) => Math.abs(k.box[at] - b0) <= 1);
        if (!before.length || !after.length) continue;
        between++;
        reported.add(gap);
        const ids = [...before, ...after].map((k) => k.id);
        add(
          "grid.group-gap",
          "minor",
          [...ids, ...gap.labelled.map((e) => e.id)],
          {
            scope: P ?? "(root)",
            axis,
            gapPx: r1(d),
            roomPx: r1(need),
            labels: gap.labelled.length,
            tracks: gap.tracks,
          },
          `the ${axis} gap between groups ${ids.map((id) => `"${id}"`).join(", ")} in ${where} is ${Math.round(d)}px; layout needs ${Math.round(need)}px there`,
          [
            ...(model.spacing > 1 ? ["use layout: { spacing: normal }"] : []),
            "move the groups' connected nodes next to each other in the nodes list",
          ],
          3,
        );
      }
      const empty = gaps.filter(
        (x) => !reported.has(x) && (x.d > x.room + 96 || (x.d > 2.5 * x.room && x.d > 64)),
      );
      const worst = empty.sort((p, q) => q.d - q.room - (p.d - p.room))[0];
      if (!worst) continue;
      wide++;
      add(
        "grid.wide-gap",
        "minor",
        [...(g ? [g.id] : []), ...worst.labelled.map((e) => e.id)],
        {
          scope: P ?? "(root)",
          axis,
          gapPx: r1(worst.d),
          roomPx: r1(worst.room),
          labels: worst.labelled.length,
          tracks: worst.tracks,
          gaps: gaps.map((x) => Math.round(x.d)).join(","),
        },
        `a ${axis} gap in ${where} is ${Math.round(worst.d)}px where layout needs ${Math.round(worst.room)}px, so it reads as an empty band`,
        [
          "move the nodes on either side of the gap next to each other in the nodes list",
          ...(model.spacing > 1 ? ["use layout: { spacing: normal }"] : []),
        ],
        3,
      );
    }
  }
  return { wide, between };
}
