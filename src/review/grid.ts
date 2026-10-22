// The grid dimension: ragged layers and icons off their row's line, tiny jogs, off-center group
// content and edge ends, routes with bends a clear simpler route avoids, uneven layer gaps, and
// wide gaps between a frame's rows or columns and between sibling groups.
import { bendsOf, searchable, sharesEnd, simplerRoute } from "../layout/bends.ts";
import { endsOf, facesOf, landingOf, MIN_PITCH, type Side, window } from "../layout/faces.ts";
import { ENDS } from "../layout/sizes.ts";
import { type Box, OWN_LAYOUT, type SceneEdge } from "../types.ts";
import {
  EPS,
  horizontalFlow,
  orthogonalRuns,
  r1,
  r2,
  real,
  segments,
  simplify,
  union,
} from "./geometry.ts";
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
  const spread = endSpread(c);
  const rows = iconRows(c);
  const bendy = extraBends(c);

  Object.assign(m, {
    raggedLayers: ragged,
    jogs,
    offCenterGroups: offCenter,
    gapCv: r2(cv),
    gapMinPx: gaps.length ? r1(Math.min(...gaps)) : 0,
    gapMaxPx: gaps.length ? r1(Math.max(...gaps)) : 0,
    wideGaps: wide,
    groupGaps: between,
    unevenEnds: spread,
    offLineIcons: rows,
    extraBends: bendy,
  });
}

/** Kinds whose own hooks place every node and route every connector; pools and lanes too. */
const placedByHook = (c: Ctx) =>
  ["tree", "mindmap"].includes(c.scene.kind ?? "") ||
  OWN_LAYOUT.has(c.scene.kind) ||
  c.scene.groups.some((g) => g.lane);

/**
 * Ends on one face of an icon node (layout/faces.ts): one sits at the face's center, several
 * around it at one pitch of at most 20px (layout keeps ENDS.pitch, 14px, closer when they do not
 * fit), never closer than MIN_PITCH, the set at most half a pitch off center (one end held on the
 * center line). A straight line the node at its other end holds may pin the set further off
 * center; the pitch must still be even.
 */
function endSpread(c: Ctx): number {
  const { scene, add } = c;
  if (scene.routing === "spline" || placedByHook(c)) return 0;
  let count = 0;
  for (const n of scene.nodes) {
    if (n.look !== "icon" || !real(n.iconBox) || n.bpmn) continue;
    const bySide = new Map<Side, { along: number; straight: boolean }[]>();
    for (const e of scene.edges) {
      if (e.from === e.to || (e.from !== n.id && e.to !== n.id)) continue;
      for (const end of endsOf(e)) {
        if ((end.at === "from" ? e.from : e.to) !== n.id) continue;
        const landing = landingOf(n, end);
        // Ends off the face or off its line are flow.arrow-short's.
        if (!landing || Math.abs(landing.gap) > 1) continue;
        if (landing.along < landing.face.lo - EPS || landing.along > landing.face.hi + EPS)
          continue;
        const list = bySide.get(landing.face.side) ?? [];
        const same = list.find((x) => Math.abs(x.along - landing.along) < EPS);
        const straight = simplify(e.points).length === 2;
        if (same) same.straight ||= straight;
        else list.push({ along: landing.along, straight });
        bySide.set(landing.face.side, list);
      }
    }
    const faces = facesOf(n);
    for (const [side, list] of bySide) {
      const face = faces[side];
      const center = (face.lo + face.hi) / 2;
      const at = list.map((x) => x.along).sort((a, b) => a - b);
      const pitches = at.slice(1).map((v, i) => v - (at[i] ?? v));
      const pinned = list.some((x) => x.straight);
      const mid = ((at[0] ?? center) + (at.at(-1) ?? center)) / 2;
      const off = Math.abs(mid - center);
      const lone = at.length === 1;
      const wide = pitches.length ? Math.max(...pitches) : 0;
      const tight = pitches.length ? Math.min(...pitches) : 0;
      const uneven = wide - tight > 3;
      const bad =
        (lone && !pinned && off > ENDS.inset) ||
        (!lone &&
          (uneven ||
            wide > 20 ||
            tight < MIN_PITCH - EPS ||
            (!pinned && off > ENDS.pitch / 2 + EPS)));
      if (!bad) continue;
      count++;
      const [lo, hi] = window(face);
      add(
        "grid.off-center",
        "minor",
        [n.id],
        {
          node: n.id,
          side,
          ends: at.length,
          offPx: r1(off),
          ...(pitches.length ? { pitchMinPx: r1(tight), pitchMaxPx: r1(wide) } : {}),
          facePx: r1(hi - lo),
        },
        lone
          ? `the end on the ${side} of "${n.id}" sits ${r1(off)}px off the icon's center`
          : `the ${at.length} ends on the ${side} of "${n.id}" sit ${r1(tight)} to ${r1(wide)}px apart, ${r1(off)}px off the icon's center`,
        [
          `move "${n.id}" in the nodes list so its edges arrive from fewer sides`,
          "use layout: { merge: true } so the edges of one kind share an end",
        ],
        2,
      );
    }
  }
  return count;
}

/**
 * Icons joined by an edge in one row of a vertical flow (one column of a horizontal one), in one
 * group, share the icon's center line, so the edge between them is straight. Layout aligns a
 * row's icons where its graph holds only nodes (layout/graph.ts alignRows).
 */
function iconRows(c: Ctx): number {
  const { scene, add } = c;
  if (placedByHook(c)) return 0;
  const horizontal = horizontalFlow(scene.direction);
  const seen = new Set<string>();
  let count = 0;
  for (const e of scene.edges) {
    const a = c.nodes.get(e.from);
    const b = c.nodes.get(e.to);
    if (!a || !b || a === b || a.look !== "icon" || b.look !== "icon") continue;
    if (!real(a.iconBox) || !real(b.iconBox) || a.parent !== b.parent) continue;
    const key = [a.id, b.id].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const [p, q] = [a.iconBox, b.iconBox];
    const share = horizontal
      ? p.x < q.x + q.w && q.x < p.x + p.w && (p.y >= q.y + q.h || q.y >= p.y + p.h)
      : p.y < q.y + q.h && q.y < p.y + p.h && (p.x >= q.x + q.w || q.x >= p.x + p.w);
    if (!share) continue;
    const d = horizontal ? p.x + p.w / 2 - (q.x + q.w / 2) : p.y + p.h / 2 - (q.y + q.h / 2);
    if (Math.abs(d) <= 1) continue;
    count++;
    const line = horizontal ? "column" : "row";
    add(
      "grid.ragged",
      "minor",
      [a.id, b.id],
      { a: a.id, b: b.id, offPx: r1(Math.abs(d)), line },
      `"${a.id}" and "${b.id}" share a ${line} but their icons sit ${r1(Math.abs(d))}px off one center line, so ${edgeName(e)} cannot run straight`,
      [
        `give "${a.id}" and "${b.id}" notes of the same number of lines`,
        `put "${a.id}" and "${b.id}" in a group of their own`,
      ],
      2,
    );
  }
  return count;
}

/**
 * Routes with more bends than a clear simpler one between the same two faces (layout/bends.ts,
 * the search layout itself runs, so a route layout left alone passes). A one-to-one L or Z is
 * grid.avoidable-bend's and grid.zig-zag's already (review/composition.ts), so it is not counted
 * twice.
 */
function extraBends(c: Ctx): number {
  const { scene, model, add } = c;
  if (scene.routing !== "orthogonal" || placedByHook(c)) return 0;
  const seated = new Set(
    model.nodes
      .filter((n) => n.on && !scene.ignored?.some((x) => x.subject === n.id && x.setting === "on"))
      .map((n) => n.id),
  );
  const outs = new Map<string, number>();
  const ins = new Map<string, number>();
  for (const e of scene.edges) {
    outs.set(e.from, (outs.get(e.from) ?? 0) + 1);
    ins.set(e.to, (ins.get(e.to) ?? 0) + 1);
  }
  let count = 0;
  for (const e of scene.edges) {
    if (!searchable(scene, e, seated) || sharesEnd(scene, e)) continue;
    const now = bendsOf(e.points);
    if (!now) continue;
    const runs = orthogonalRuns(e.points) ?? [];
    const oneToOne =
      c.nodes.has(e.from) && c.nodes.has(e.to) && outs.get(e.from) === 1 && ins.get(e.to) === 1;
    const [first, mid, last] = runs;
    const zig =
      runs.length === 3 &&
      !!first &&
      !!last &&
      first.axis === last.axis &&
      first.sign === last.sign;
    const composed =
      oneToOne &&
      ((zig && (mid?.len ?? 0) >= 12 && (mid?.len ?? 0) <= 180) ||
        (runs.length === 2 && Math.min(first?.len ?? 0, mid?.len ?? 0) <= 240));
    if (composed) continue;
    const tag = union([e.labelBox, e.stepBox]);
    const better = simplerRoute(scene, e, tag ? { w: tag.w, h: tag.h } : undefined);
    if (!better) continue;
    count++;
    add(
      "grid.avoidable-bend",
      "minor",
      [e.id, e.from, e.to],
      { edge: edgeName(e), bends: now, clearBends: better.bends },
      `${edgeName(e)} bends ${now} times where a clear route with ${better.bends} would do`,
      [
        `move "${e.to}" right after "${e.from}" in the nodes list`,
        "use layout: { spacing: loose }",
      ],
      3,
    );
  }
  return count;
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
 * Row and column gaps per frame. A frame's rows (and columns) are its own node footprints and
 * child groups merged into bands across it; the canvas is a frame too. A fixed limit (over 160px,
 * or over 2.5x the smallest and over 64px, is an empty band; between two sibling groups, more than
 * the labels in it need, 48px at least, plus 32px) would flag every labelled gap in the gallery
 * (about 165px at normal spacing) as a hole that no spec edit closes. So each gap is measured
 * against the room layout itself gives it: one layer gap (64px times layout.spacing), or, when
 * edge labels sit in it, two layer gaps and the labels, because ELK gives centered labels a layer
 * of their own; and never less than the routing tracks of the edge runs across it. An empty band
 * is over 96px more than its room (an unlabelled gap at normal spacing: 160px) or over 2.5x its
 * room and over 64px, and a gap between sibling groups is over its room (48px at least) plus 32px.
 * grid.uneven-gaps judges the spread of every layer gap at once, so one evenly wide gap passes it.
 * Canvas px at 1x, like every length in this file: they say how far apart layout put two rows,
 * and a narrower column shrinks the gap and its room alike. A pool or lane places steps where they
 * happen in time and a kind with its own layout (a journey's grid, a sequence, a timeline) places
 * every node, so neither is measured.
 */
function frameGaps(c: Ctx): { wide: number; between: number } {
  const { scene, model, add } = c;
  let wide = 0;
  let between = 0;
  if (OWN_LAYOUT.has(model.kind)) return { wide, between };
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
