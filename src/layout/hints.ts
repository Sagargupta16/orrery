// The placement hints around the core: rank: <n> becomes an align on a node already in that
// layer, and an align or a cols grid whose edges cannot be drawn clear is dropped and reported.

import type { IgnoredSetting, Model, Scene } from "../types.ts";
import { hiddenOf, type LayoutOptions, withIgnored } from "./context.ts";
import { layoutCore } from "./core.ts";
import { sceneDefects } from "./defects.ts";
import { layersOf, planPlacement, selfPlaced } from "./plan.ts";

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
    // Layers are counted with the node to see whether it is there already, and without it to find
    // the layer it joins (leaving a layer of its own shifts the ones after it).
    if (layersAround(probe, n.id, true).get(n.id) === rank - 1) continue;
    const others = layersAround(probe, n.id, false);
    const count = new Set(others.values()).size;
    if (rank > count) {
      ignore(n.id, `its group has ${count} layer${count === 1 ? "" : "s"} besides it`);
      continue;
    }
    const linked = (id: string) =>
      model.edges.some((e) => (e.from === n.id && e.to === id) || (e.to === n.id && e.from === id));
    const order = new Map(model.nodes.map((x, i) => [x.id, i]));
    const pick = [...others]
      .filter(
        ([id, l]) =>
          l === rank - 1 &&
          order.has(id) &&
          !(parent.get(id) && plan.grids.has(parent.get(id) ?? "")),
      )
      .map(([id]) => id)
      .sort(
        (a, b) =>
          Number(linked(a)) - Number(linked(b)) || (order.get(a) ?? 0) - (order.get(b) ?? 0),
      )[0];
    if (!pick) {
      ignore(n.id, `layer ${rank} of its group holds only groups`);
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
 * An align whose edges cannot be drawn clear goes rather than an overlap (dropCovering). Each
 * dropped align is reported.
 */
async function layoutAligned(model: Model, opts: LayoutOptions): Promise<Scene> {
  const scene = await layoutCore(model, opts);
  const plan = sceneDefects(scene) ? planPlacement(model, hiddenOf(model)) : undefined;
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
  const kept = await dropCovering(model, scene, hinted, without, (m) => layoutCore(m, opts));
  const order = new Map(model.nodes.map((n, i) => [n.id, i]));
  return withIgnored(
    kept.scene,
    kept.dropped
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map((id) => ({ subject: id, setting: "align", reason: COVERED })),
  );
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
