// Named subsets of one spec (`views:`): each becomes its own model, so an overview and its detail
// figures come from one source and cannot drift apart.
import { usage } from "./cli/io.ts";
import { resolveGroupStyle } from "./styles.ts";
import type { Model, ModelEdge, ModelGroup, ModelNode, ModelView } from "./types.ts";

export interface ViewModel {
  /** The view's name; undefined for the whole diagram. */
  name?: string;
  model: Model;
}

/** The models to draw for --view: the whole diagram by default, one view, or `all` of them. */
export function viewsOf(model: Model, flag?: string | boolean): ViewModel[] {
  if (flag === undefined || flag === false) return [{ model }];
  const views = model.views ?? [];
  const drawn = (v: ModelView): ViewModel => ({ name: v.name, model: viewModel(model, v) });
  if (flag === "all") return [{ model }, ...views.map(drawn)];
  const view = views.find((v) => v.name === flag);
  if (view) return [drawn(view)];
  const names = [...views.map((v) => v.name), "all"].join(", ");
  return usage(
    !views.length
      ? "--view: the spec has no views; add views: { name: { include: [id, group:<id>, tag:<name>] } }"
      : flag === true
        ? `--view needs a view name: ${names}`
        : `--view "${flag}" is not a view of this spec; use ${names}`,
  );
}

/** The diagram cut down to what one view shows. */
export function viewModel(model: Model, view: ModelView): Model {
  const t = new Tree(model);
  const kept = t.select(view);
  const fold = view.depth === undefined ? new Map<string, string>() : t.fold(kept, view.depth);
  // Every id as the view draws it: itself, or the folded group that stands for it.
  const at = (id: string) => fold.get(id) ?? id;
  const groups = model.groups.flatMap((g): ModelGroup[] => {
    if (!kept.has(g.id) || fold.has(g.id)) return [];
    if (!g.around) return [g];
    // An overlay outlines what is still drawn as itself; folded detail is out of sight.
    const around = g.around.filter((id) => kept.has(id) && at(id) === id);
    return around.length ? [{ ...g, around }] : [];
  });
  const groupIds = new Set(groups.map((g) => g.id));
  const nodeOf = (n: ModelNode): ModelNode => {
    const out = { ...n };
    if (n.on && !groupIds.has(n.on)) delete out.on;
    if (n.align && !(kept.has(n.align) && !fold.has(n.align))) delete out.align;
    return out;
  };
  const nodes = model.nodes.flatMap((n) => (kept.has(n.id) && !fold.has(n.id) ? [nodeOf(n)] : []));
  nodes.push(...model.groups.filter((g) => fold.get(g.id) === g.id).map(groupNode));
  const drawn = new Set([...nodes.map((n) => n.id), ...groupIds]);
  const edges = edgesOf(t, kept, view, at, drawn);
  const story = (model.story ?? [])
    .filter((id) => kept.has(id))
    .map(at)
    .filter((id, i, all) => id !== all[i - 1]);
  const tags = new Set([...nodes, ...groups, ...edges].flatMap((x) => x.tags ?? []));
  const lines = new Set(edges.map((e) => e.line));
  const legend = (model.legend ?? []).filter((l) => (l.tag ? tags.has(l.tag) : lines.has(l.line)));
  const { views: _, story: __, legend: ___, ...rest } = model;
  return {
    ...rest,
    title: view.title ?? (model.title ? `${model.title}: ${view.name}` : view.name),
    subtitle: view.subtitle ?? model.subtitle,
    ...(legend.length ? { legend } : {}),
    nodes,
    groups,
    edges,
    ...(story.length >= 2 ? { story } : {}),
  };
}

/** The edges whose ends both stay, re-pointed at folded groups, one per pair of ends. */
function edgesOf(
  t: Tree,
  kept: Set<string>,
  view: ModelView,
  at: (id: string) => string,
  drawn: Set<string>,
): ModelEdge[] {
  const dropped = new Set(t.tagged(view.exclude ?? []));
  const byEnds = new Map<string, { edge: ModelEdge; labels: Set<string | undefined> }>();
  for (const e of t.model.edges) {
    if (!kept.has(e.from) || !kept.has(e.to) || dropped.has(e.id)) continue;
    const from = at(e.from);
    const to = at(e.to);
    // A line inside a folded group is inside the node that now stands for it; one to an
    // overlay that outlined only folded detail has nothing left to end on.
    if (from === to || !drawn.has(from) || !drawn.has(to)) continue;
    const key = `${from}\n${to}`;
    const seen = byEnds.get(key);
    if (seen) seen.labels.add(e.label);
    else byEnds.set(key, { edge: { ...e, from, to }, labels: new Set([e.label]) });
  }
  // Merged lines keep a label only when every one of them said the same.
  return [...byEnds.values()].map(({ edge, labels }) =>
    labels.size > 1 ? { ...edge, label: undefined } : edge,
  );
}

/** A folded group drawn as one node: its label, its icon (or the group type's), its tags. */
function groupNode(g: ModelGroup): ModelNode {
  const icon = g.icon === null ? undefined : (g.icon ?? resolveGroupStyle(g.type)?.icon);
  return {
    id: g.id,
    label: g.label || g.id,
    icon,
    look: icon ? "icon" : "shape",
    shape: "rounded",
    parent: g.parent,
    color: g.color,
    iconSize: 48,
    ...(g.tags ? { tags: g.tags } : {}),
    ...(g.evidence ? { evidence: g.evidence } : {}),
  };
}

/** The nesting of a model's nodes and groups, and the view rules read against it. */
class Tree {
  readonly children = new Map<string, string[]>();
  readonly parent = new Map<string, string>();
  readonly groups: Map<string, ModelGroup>;
  readonly model: Model;

  constructor(model: Model) {
    this.model = model;
    this.groups = new Map(model.groups.map((g) => [g.id, g]));
    for (const x of [...model.groups, ...model.nodes]) {
      if (!x.parent) continue;
      this.parent.set(x.id, x.parent);
      this.children.set(x.parent, [...(this.children.get(x.parent) ?? []), x.id]);
    }
  }

  /** The group and everything nested in it; for an overlay, the ids it is drawn around. */
  within(id: string, seen = new Set<string>()): string[] {
    if (seen.has(id)) return [];
    const around = seen.size ? undefined : this.groups.get(id)?.around;
    seen.add(id);
    return [id, ...(around ?? this.children.get(id) ?? []).flatMap((c) => this.within(c, seen))];
  }

  /** The node and group ids an include or exclude list names, groups with their contents. */
  named(entries: string[]): string[] {
    return entries.flatMap((entry) => {
      const [kind, rest = ""] = entry.includes(":") ? entry.split(/:(.*)/s) : ["", entry];
      if (kind === "tag") {
        const items = [...this.model.nodes, ...this.model.groups].filter((x) =>
          x.tags?.includes(rest),
        );
        return items.flatMap((x) => this.within(x.id));
      }
      const id = kind === "group" ? rest : entry;
      return this.groups.has(id) || this.model.nodes.some((n) => n.id === id)
        ? this.within(id)
        : [];
    });
  }

  /** The edge ids carrying one of the `tag:` entries. */
  tagged(entries: string[]): string[] {
    const tags = entries.filter((e) => e.startsWith("tag:")).map((e) => e.slice(4));
    return this.model.edges.filter((e) => e.tags?.some((t) => tags.includes(t))).map((e) => e.id);
  }

  /**
   * What the view keeps: its includes (everything when it has none, plus both ends of a tagged
   * edge), less its excludes, plus the groups around what is left (its parents, the group a node
   * sits on the border of, overlays drawn around it). A group the view empties goes too.
   */
  select(view: ModelView): Set<string> {
    const all = [...this.model.groups, ...this.model.nodes].map((x) => x.id);
    const include = view.include;
    const tagged = new Set(this.tagged(include ?? []));
    const ends = this.model.edges
      .filter((e) => tagged.has(e.id))
      .flatMap((e) => [...this.within(e.from), ...this.within(e.to)]);
    const picked = new Set(include ? [...this.named(include), ...ends] : all);
    const out = new Set(this.named(view.exclude ?? []));
    for (const id of out) picked.delete(id);
    const keep = new Set<string>();
    const up = (id: string | undefined) => {
      for (let p = id; p && !keep.has(p); p = this.parent.get(p)) keep.add(p);
    };
    for (const id of picked) {
      if (this.groups.get(id)?.around) continue;
      up(id);
      const on = this.model.nodes.find((n) => n.id === id)?.on;
      if (on && !out.has(on)) up(on);
    }
    // A group the view empties would be drawn as an empty box; one that was empty stays. The
    // innermost go first, so their parents see them gone; a border node counts as inside.
    const byLevel = this.model.groups.filter((g) => !g.around);
    byLevel.sort((a, b) => this.level(b.id) - this.level(a.id));
    for (const g of byLevel) {
      const inside = [
        ...(this.children.get(g.id) ?? []),
        ...this.model.nodes.filter((n) => n.on === g.id).map((n) => n.id),
      ];
      if (keep.has(g.id) && inside.length && !inside.some((c) => keep.has(c))) keep.delete(g.id);
    }
    for (const g of this.model.groups)
      if (g.around && !out.has(g.id) && g.around.some((m) => keep.has(m))) keep.add(g.id);
    return keep;
  }

  /** How deep a group sits: 1 at the top level. */
  level(id: string): number {
    let n = 0;
    for (let p: string | undefined = id; p; p = this.parent.get(p)) n += 1;
    return n;
  }

  /**
   * `depth`: groups below that level fold. A kept group one level deeper becomes the node that
   * stands for it (it maps to itself), everything in it maps to that node, and overlays below
   * the depth are dropped.
   */
  fold(kept: Set<string>, depth: number): Map<string, string> {
    const map = new Map<string, string>();
    for (const g of this.model.groups) {
      if (!kept.has(g.id) || this.level(g.id) <= depth) continue;
      if (g.around) kept.delete(g.id);
      else if (this.level(g.id) === depth + 1)
        for (const id of this.within(g.id)) map.set(id, g.id);
    }
    return map;
  }
}
