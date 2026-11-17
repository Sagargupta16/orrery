// The placement hints around the core: rank: <n> becomes an align on a node already in that
// layer, and an align or a cols grid whose edges cannot be drawn clear is dropped and reported.

import type { Box, IgnoredSetting, Model, Scene } from "../types.ts";
import { hiddenOf, type LayoutOptions, withIgnored } from "./context.ts";
import { layoutCore } from "./core.ts";
import { sceneDefects } from "./defects.ts";
import { layersOf, planPlacement, selfPlaced } from "./plan.ts";
import { loopedEdges } from "./relations.ts";

/**
 * rank: <n> puts a node in the nth layer of its group. ELK 0.12 has no layer number constraint
 * (layerChoiceConstraint only works in its interactive editor, partitions not inside groups), so a
 * first layout finds a node already in that layer and the ranked node aligns with it.
 */
async function layoutRanked(model: Model, opts: LayoutOptions): Promise<Scene> {
  const asked = model.nodes.filter((n) => typeof n.rank === "number");
  if (!asked.length) return layoutAligned(model, opts);
  const strip = (m: Model, keep: Map<string, string>): Model => ({
    ...m,
    nodes: m.nodes.map((n) => {
      if (typeof n.rank !== "number") return n;
      const { rank: _, ...rest } = n;
      const anchor = keep.get(n.id);
      return anchor ? { ...rest, align: anchor } : rest;
    }),
  });
  const probe = await layoutAligned(strip(model, new Map()), opts);
  const ignored: IgnoredSetting[] = [];
  const ignore = (subject: string, reason: string) =>
    ignored.push({ subject, setting: "rank", reason });
  const { anchors, want } = rankAnchors(model, probe, ignore);
  if (!anchors.size) return withIgnored(probe, ignored);
  const scene = await layoutAligned(strip(model, anchors), opts);
  // A node whose links hold it elsewhere moves its anchor with it: drop that hint and say so. One
  // whose anchor layoutAligned dropped is reported already.
  const layersAround = layersAroundOf(model);
  const missed = [...anchors.keys()].filter(
    (id) =>
      layersAround(scene, id, true).get(id) !== want.get(id) &&
      !scene.ignored?.some((x) => x.subject === id && x.setting === "align"),
  );
  // The anchors' own align entries name the rank the author wrote.
  const renamed = (s: Scene): Scene => ({
    ...s,
    ...(s.ignored
      ? {
          ignored: s.ignored.map((x) =>
            anchors.has(x.subject) && x.setting === "align" ? { ...x, setting: "rank" } : x,
          ),
        }
      : {}),
  });
  if (!missed.length) return withIgnored(renamed(scene), ignored);
  for (const id of missed) {
    anchors.delete(id);
    ignore(id, `its links keep it out of layer ${(want.get(id) ?? 0) + 1}`);
  }
  if (!anchors.size) return withIgnored(probe, ignored);
  return withIgnored(renamed(await layoutAligned(strip(model, anchors), opts)), ignored);
}

/** Layers of the items that share the ELK graph of `id`, the node itself included or not. */
function layersAroundOf(model: Model) {
  const hidden = hiddenOf(model);
  const parent = new Map([...model.groups, ...model.nodes].map((x) => [x.id, x.parent]));
  const host = (id: string) => {
    let p = parent.get(id);
    while (p && hidden.has(p)) p = parent.get(p);
    return p;
  };
  return (scene: Scene, id: string, self: boolean) =>
    layersOf(
      [
        ...scene.nodes.map((n) => ({ id: n.id, box: n.box })),
        ...scene.groups
          .filter((g) => !g.overlay && !hidden.has(g.id))
          .map((g) => ({ id: g.id, box: g.box })),
      ].filter((it) => (self || it.id !== id) && host(it.id) === host(id)),
      scene.direction,
    );
}

/** For each ranked node not in its layer yet: the node already there it aligns with. */
function rankAnchors(
  model: Model,
  probe: Scene,
  ignore: (subject: string, reason: string) => void,
): { anchors: Map<string, string>; want: Map<string, number> } {
  const plan = planPlacement(model, hiddenOf(model));
  const parent = new Map([...model.groups, ...model.nodes].map((x) => [x.id, x.parent]));
  const own = selfPlaced(model.kind);
  const layersAround = layersAroundOf(model);
  const anchors = new Map<string, string>();
  const want = new Map<string, number>();
  // A ranked node not in its layer yet (layers counted with it) moves in the second layout, and so
  // does every node aligned with it: none of them can anchor another.
  const moving = new Set(
    model.nodes
      .filter(
        (x) =>
          typeof x.rank === "number" && layersAround(probe, x.id, true).get(x.id) !== x.rank - 1,
      )
      .map((x) => x.id),
  );
  const moves = (id: string) =>
    (plan.blocks.get(plan.blockOf.get(id) ?? "") ?? [id]).some((m) => moving.has(m));
  for (const n of model.nodes.filter((x) => typeof x.rank === "number")) {
    const rank = typeof n.rank === "number" ? n.rank : 1;
    const p = parent.get(n.id);
    if (own) {
      ignore(n.id, own);
      continue;
    }
    if (p && plan.grids.has(p)) {
      ignore(n.id, `group "${p}" places its children in ${plan.grids.get(p)} columns`);
      continue;
    }
    // Layers are counted without the node to find the layer it joins (leaving a layer of its own
    // shifts the ones after it).
    if (!moving.has(n.id)) continue;
    const others = layersAround(probe, n.id, false);
    const count = new Set(others.values()).size;
    if (rank > count) {
      ignore(n.id, `its group has ${count} layer${count === 1 ? "" : "s"} besides it`);
      continue;
    }
    const linked = (id: string) =>
      model.edges.some((e) => (e.from === n.id && e.to === id) || (e.to === n.id && e.from === id));
    const order = new Map(model.nodes.map((x, i) => [x.id, i]));
    const there = [...others]
      .filter(
        ([id, l]) =>
          l === rank - 1 &&
          order.has(id) &&
          !(parent.get(id) && plan.grids.has(parent.get(id) ?? "")),
      )
      .map(([id]) => id);
    const pick = there
      .filter((id) => !moves(id))
      .sort(
        (a, b) =>
          Number(linked(a)) - Number(linked(b)) || (order.get(a) ?? 0) - (order.get(b) ?? 0),
      )[0];
    if (!pick) {
      ignore(
        n.id,
        there.length
          ? `the nodes in layer ${rank} of its group move for a rank too`
          : `layer ${rank} of its group holds only groups`,
      );
      continue;
    }
    anchors.set(n.id, pick);
    want.set(n.id, rank - 1);
  }
  return { anchors, want };
}

/** Why layoutAligned dropped an align (or the rank layoutRanked turned into one). */
const COVERED = "in that layer an edge or its label would cover a node or another label";

/** Why layoutGridded laid a cols group out without its grid. */
const CROWDED = "in its grid an edge or its label would cover a node or another label";

/**
 * A cols grid whose edges cannot be drawn clear goes the way an align does (dropCovering): the
 * group is laid out as if it had no cols, and each dropped grid is reported. It wraps the rank
 * and align hints, so those are decided again for the layout without the grid.
 */
export async function layoutGridded(model: Model, opts: LayoutOptions): Promise<Scene> {
  const scene = await layoutRanked(model, opts);
  const plan = sceneDefects(scene) ? planPlacement(model, hiddenOf(model)) : undefined;
  if (!plan?.grids.size) return scene;
  const without = (m: Model, ids: Set<string>): Model => ({
    ...m,
    groups: m.groups.map((g) => {
      if (!ids.has(g.id)) return g;
      const { cols: _, ...rest } = g;
      return rest;
    }),
  });
  const hinted = (m: Model) =>
    m.groups.filter((g) => g.cols !== undefined && plan.grids.has(g.id)).map((g) => g.id);
  const kept = await dropCovering(model, scene, hinted, without, (m) => layoutRanked(m, opts));
  const order = new Map(model.groups.map((g, i) => [g.id, i]));
  return withIgnored(
    kept.scene,
    kept.dropped
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map((id) => ({ subject: id, setting: "cols", reason: CROWDED })),
  );
}

/**
 * An align that turns an edge in no loop against the flow goes (dropTurning), and so does one
 * whose edges cannot be drawn clear, rather than an overlap (dropCovering). Each dropped align is
 * reported.
 */
async function layoutAligned(model: Model, opts: LayoutOptions): Promise<Scene> {
  const scene = await layoutCore(model, opts);
  // Kinds that place every node themselves have no flow for an edge to turn against.
  const turns = !selfPlaced(model.kind) && turnedBack(scene, model).length > 0;
  const plan = turns || sceneDefects(scene) ? planPlacement(model, hiddenOf(model)) : undefined;
  if (!plan?.blocks.size) return scene;
  const without = (m: Model, ids: Set<string>): Model => ({
    ...m,
    nodes: m.nodes.map((n) => {
      if (!ids.has(n.id)) return n;
      const { align: _, ...rest } = n;
      return rest;
    }),
  });
  const hinted = (m: Model) =>
    m.nodes.filter((n) => n.align !== undefined && plan.blockOf.has(n.id)).map((n) => n.id);
  const run = (m: Model) => layoutCore(m, opts);
  const turned = turns
    ? await dropTurning(model, scene, hinted, without, run)
    : { scene, model, dropped: [] };
  const kept = sceneDefects(turned.scene)
    ? await dropCovering(turned.model, turned.scene, hinted, without, run)
    : { scene: turned.scene, dropped: [] };
  const order = new Map(model.nodes.map((n, i) => [n.id, i]));
  const byOrder = (a: IgnoredSetting, b: IgnoredSetting) =>
    (order.get(a.subject) ?? 0) - (order.get(b.subject) ?? 0);
  return withIgnored(
    kept.scene,
    [
      ...turned.dropped,
      ...kept.dropped.map((id) => ({ subject: id, setting: "align", reason: COVERED })),
    ].sort(byOrder),
  );
}

/**
 * Edges between two nodes, in no loop of the model's edges, whose target lies before its source
 * along the flow: only a block's summed links (the align it stands for) can turn one around, since
 * ELK reverses only edges it needs to break a cycle.
 */
function turnedBack(scene: Scene, model: Model): Model["edges"] {
  const looped = loopedEdges(model);
  const at = new Map(scene.nodes.map((n) => [n.id, n.box]));
  // Where a box starts and ends along the flow: a target that ends before its source starts lies
  // wholly behind it, while two nodes in one layer (an align beside its anchor) overlap.
  const span = (b: Box): [number, number] => {
    const d = scene.direction;
    const [lo, hi] = d === "right" || d === "left" ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
    return d === "right" || d === "down" ? [lo, hi] : [-hi, -lo];
  };
  return model.edges.filter((e) => {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (!a || !b || !e.constraint || looped.has(e.id)) return false;
    return span(b)[1] < span(a)[0];
  });
}

/**
 * While the layout turns an edge in no loop against the flow, it is laid out again without each
 * align in turn and the one whose loss turns the fewest goes (the later in spec order on a tie);
 * when no single one helps, all of them go if that turns fewer.
 */
async function dropTurning(
  model: Model,
  first: Scene,
  hinted: (m: Model) => string[],
  without: (m: Model, ids: Set<string>) => Model,
  run: (m: Model) => Promise<Scene>,
): Promise<{ scene: Scene; model: Model; dropped: IgnoredSetting[] }> {
  const why = (s: Scene, m: Model) => {
    const [e] = turnedBack(s, m);
    return e ? `it turns ${e.from} -> ${e.to}, which is in no loop, against the flow` : "";
  };
  let scene = first;
  let current = model;
  let turned = turnedBack(scene, current).length;
  const dropped: IgnoredSetting[] = [];
  while (turned) {
    let pick: { id: string; scene: Scene; turned: number; model: Model } | undefined;
    for (const id of hinted(current)) {
      const m = without(current, new Set([id]));
      const s = await run(m);
      const t = turnedBack(s, m).length;
      if (t <= (pick ? pick.turned : turned - 1)) pick = { id, scene: s, turned: t, model: m };
    }
    if (!pick) break;
    dropped.push({ subject: pick.id, setting: "align", reason: why(scene, current) });
    ({ scene, turned, model: current } = pick);
  }
  const rest = hinted(current);
  if (turned && rest.length) {
    const m = without(current, new Set(rest));
    const s = await run(m);
    if (turnedBack(s, m).length < turned) {
      const reason = why(scene, current);
      dropped.push(...rest.map((id) => ({ subject: id, setting: "align", reason })));
      scene = s;
      current = m;
    }
  }
  return { scene, model: current, dropped };
}

/**
 * While the layout covers a node, a label or an arrowhead, it is laid out again without each hint
 * in turn and the one whose loss clears the most goes (the later in spec order on a tie); when no
 * single one helps, all of them go if that clears more. Returns the scene kept and the hints
 * dropped, in the order they went.
 */
async function dropCovering(
  model: Model,
  first: Scene,
  hinted: (m: Model) => string[],
  without: (m: Model, ids: Set<string>) => Model,
  run: (m: Model) => Promise<Scene>,
): Promise<{ scene: Scene; dropped: string[] }> {
  let scene = first;
  let defects = sceneDefects(scene);
  const dropped: string[] = [];
  let current = model;
  while (defects) {
    let pick: { id: string; scene: Scene; defects: number; model: Model } | undefined;
    for (const id of hinted(current)) {
      const m = without(current, new Set([id]));
      const s = await run(m);
      const d = sceneDefects(s);
      if (d <= (pick ? pick.defects : defects - 1)) pick = { id, scene: s, defects: d, model: m };
    }
    if (!pick) break;
    ({ scene, defects, model: current } = pick);
    dropped.push(pick.id);
  }
  const rest = hinted(current);
  if (defects && rest.length) {
    const s = await run(without(current, new Set(rest)));
    const d = sceneDefects(s);
    if (d < defects) {
      scene = s;
      dropped.push(...rest);
    }
  }
  return { scene, dropped };
}
