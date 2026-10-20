// A plain-text account of a laid-out diagram (groups, nodes, where they sit, what connects to
// what), for text-only models, alt text and the MCP describe tool.
import type { Args } from "./cli/args.ts";
import { printDiagnostics, readSpec, renderFailure, usage } from "./cli/io.ts";
import { renderModel } from "./render/index.ts";
import { parseSpec } from "./spec/index.ts";
import type { Box, Model, ModelEdge, Scene } from "./types.ts";

/** One end of an edge as a node or group sees it: out, in, both ways, or a plain line. */
export interface DescribedLink {
  dir: "out" | "in" | "both" | "none";
  /** The node or group at the other end. */
  with: string;
  label?: string;
  /** The edge's id, for patches. */
  edge: string;
}

export interface DescribedNode {
  id: string;
  label: string;
  note?: string;
  icon?: string;
  group?: string;
  /** Reading order, 1-based: the row from the top, then the place from the left within that row. */
  row: number;
  col: number;
  links: DescribedLink[];
}

export interface DescribedGroup {
  id: string;
  label: string;
  type: string;
  parent?: string;
  /** Child groups and nodes in reading order; for an overlay, the ids it is drawn around. */
  members: string[];
  /** Drawn around its members after layout rather than holding them (`around:`). */
  overlay?: true;
  links: DescribedLink[];
}

export interface DescribedStep {
  step?: number;
  from: string;
  to: string;
  label?: string;
}

export interface Description {
  title?: string;
  subtitle?: string;
  kind: string;
  direction: string;
  size: { width: number; height: number };
  counts: { nodes: number; groups: number; edges: number };
  groups: DescribedGroup[];
  nodes: DescribedNode[];
  /** The numbered steps in order, else the spec's story path as hops. */
  story: DescribedStep[];
}

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/** Band index per value: a gap wider than `tol` starts the next band. */
function bands(values: number[], tol: number): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out: number[] = new Array(values.length);
  let band = 0;
  let last = Number.NEGATIVE_INFINITY;
  for (const [v, i] of order) {
    if (v - last > tol && last !== Number.NEGATIVE_INFINITY) band += 1;
    out[i] = band + 1;
    last = v;
  }
  return out;
}

/** Endpoints in travel order: an arrow only at the start runs to -> from. */
const ends = (e: ModelEdge): [string, string] =>
  e.arrow === "start" ? [e.to, e.from] : [e.from, e.to];

export function describeData(scene: Scene, model: Model): Description {
  const modelNodes = new Map(model.nodes.map((n) => [n.id, n]));
  const modelGroups = new Map(model.groups.map((g) => [g.id, g]));
  const nodes = scene.nodes.filter((n) => modelNodes.has(n.id));
  const centres = nodes.map((n) => centre(n.box));
  // Rows are bands of node centres, half a node tall; columns count from the left within a row.
  const rows = bands(
    centres.map((c) => c.y),
    median(nodes.map((n) => n.box.h)) / 2,
  );
  const place = new Map<string, { row: number; col: number }>();
  const reading = nodes
    .map((n, i) => ({ id: n.id, row: rows[i] ?? 1, x: centres[i]?.x ?? 0 }))
    .sort((a, b) => a.row - b.row || a.x - b.x);
  for (const r of reading)
    place.set(r.id, {
      row: r.row,
      col: [...place.values()].filter((p) => p.row === r.row).length + 1,
    });
  const sceneGroups = new Map(scene.groups.map((g) => [g.id, g]));
  const sceneNodes = new Map(nodes.map((n) => [n.id, n]));
  const boxOf = (id: string) => sceneNodes.get(id)?.box ?? sceneGroups.get(id)?.box;
  const byReading = (a: string, b: string) => {
    const pa = place.get(a);
    const pb = place.get(b);
    if (pa && pb) return pa.row - pb.row || pa.col - pb.col;
    const ba = boxOf(a);
    const bb = boxOf(b);
    return ba && bb ? centre(ba).y - centre(bb).y || centre(ba).x - centre(bb).x : 0;
  };

  const links = new Map<string, DescribedLink[]>();
  const add = (id: string, link: DescribedLink) => links.set(id, [...(links.get(id) ?? []), link]);
  for (const e of model.edges) {
    const label = { ...(e.label ? { label: e.label } : {}), edge: e.id };
    if (e.arrow === "both" || e.arrow === "none") {
      add(e.from, { dir: e.arrow, with: e.to, ...label });
      add(e.to, { dir: e.arrow, with: e.from, ...label });
      continue;
    }
    const [a, b] = ends(e);
    add(a, { dir: "out", with: b, ...label });
    add(b, { dir: "in", with: a, ...label });
  }

  const members = (id: string) =>
    [
      ...model.groups.filter((g) => g.parent === id).map((g) => g.id),
      ...(modelGroups.get(id)?.around ?? nodes.filter((n) => n.parent === id).map((n) => n.id)),
    ].sort(byReading);
  const groups: DescribedGroup[] = [];
  const visit = (id: string) => {
    const g = modelGroups.get(id);
    if (!g) return;
    const list = members(id);
    groups.push({
      id,
      label: g.label,
      type: g.type,
      ...(g.parent ? { parent: g.parent } : {}),
      members: list,
      ...(g.around ? { overlay: true as const } : {}),
      links: links.get(id) ?? [],
    });
    if (!g.around) for (const m of list) if (modelGroups.has(m)) visit(m);
  };
  const top = model.groups
    .filter((g) => !g.parent || !modelGroups.has(g.parent))
    .map((g) => g.id)
    .sort(byReading);
  for (const id of top) visit(id);

  const described: DescribedNode[] = nodes
    .map((n) => {
      const m = modelNodes.get(n.id);
      const p = place.get(n.id) ?? { row: 1, col: 1 };
      return {
        id: n.id,
        label: m?.label ?? n.id,
        ...(m?.note ? { note: m.note } : {}),
        ...(m?.icon ? { icon: m.icon } : {}),
        ...(m?.parent ? { group: m.parent } : {}),
        row: p.row,
        col: p.col,
        links: links.get(n.id) ?? [],
      };
    })
    .sort((a, b) => a.row - b.row || a.col - b.col);

  const stepped = model.edges
    .filter((e) => e.step !== undefined)
    .sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  const story: DescribedStep[] = stepped.length
    ? stepped.map((e) => {
        const [from, to] = ends(e);
        return { step: e.step, from, to, ...(e.label ? { label: e.label } : {}) };
      })
    : (model.story ?? []).slice(1).map((to, i) => {
        const from = model.story?.[i] ?? "";
        const e = model.edges.find(
          (x) => (x.from === from && x.to === to) || (x.from === to && x.to === from),
        );
        return { from, to, ...(e?.label ? { label: e.label } : {}) };
      });

  return {
    ...(model.title ? { title: model.title } : {}),
    ...(model.subtitle ? { subtitle: model.subtitle } : {}),
    kind: model.kind,
    direction: model.direction,
    size: { width: Math.round(scene.width), height: Math.round(scene.height) },
    counts: { nodes: model.nodes.length, groups: model.groups.length, edges: model.edges.length },
    groups,
    nodes: described,
    story,
  };
}

const ARROW = { in: "<-", out: "->", both: "<->", none: "--" } as const;
/**
 * Links by direction, in first: `<- a, b; -> c (label)`. A label is told once: at the source of a
 * directed edge, where an undirected one first comes up (`told` remembers those).
 */
function linksText(links: DescribedLink[], told: Set<string>): string {
  const end = (l: DescribedLink) => {
    const say = l.label && l.dir !== "in" && !told.has(l.edge);
    if (say) told.add(l.edge);
    return `${l.with}${say ? ` (${l.label})` : ""}`;
  };
  return (Object.keys(ARROW) as DescribedLink["dir"][])
    .map((dir) => {
      const list = links.filter((l) => l.dir === dir);
      return list.length ? `${ARROW[dir]} ${list.map(end).join(", ")}` : "";
    })
    .filter(Boolean)
    .join("; ");
}
/** The label in quotes, left out when it is empty or only restates the id. */
const named = (id: string, label: string) =>
  !label.trim() || label.toLowerCase() === id.replace(/[-_]/g, " ").toLowerCase()
    ? id
    : `${id} "${label}"`;

/**
 * The same account as text, as an outline: each group (where it sits, the groups it holds, its own
 * edges) followed by its nodes, each with its place in reading order and its edges.
 */
export function describeScene(scene: Scene, model: Model): string {
  const d = describeData(scene, model);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const lines: string[] = [];
  if (d.title) lines.push(d.title);
  if (d.subtitle) lines.push(d.subtitle);
  const kind =
    d.kind === "architecture" ? "Architecture" : `${d.kind[0]?.toUpperCase()}${d.kind.slice(1)}`;
  lines.push(
    `${kind} diagram flowing ${d.direction}: ${plural(d.counts.nodes, "node")}, ${plural(d.counts.groups, "group")}, ${plural(d.counts.edges, "edge")}.`,
  );
  const grouped = new Set(d.groups.map((g) => g.id));
  const told = new Set<string>();
  const node = (n: DescribedNode) => {
    const links = linksText(n.links, told);
    lines.push(`- r${n.row}c${n.col} ${named(n.id, n.label)}${links ? `: ${links}` : ""}`);
  };
  lines.push(
    `${d.groups.length ? "Groups and their nodes" : "Nodes"} (rRcC: row R, C-th from the left):`,
  );
  const loose = d.nodes.filter((n) => !n.group || !grouped.has(n.group));
  if (loose.length && d.groups.length) lines.push("Not in a group:");
  loose.forEach(node);
  for (const g of d.groups) {
    // A child group's heading names this one, so a group's members are its nodes below it and
    // the groups that say they are in it.
    const where = g.parent ? ` in ${g.parent}` : "";
    const around = g.overlay ? `, drawn around ${g.members.join(", ")}` : "";
    const links = linksText(g.links, told);
    lines.push(`${named(g.id, g.label)}${where}${around}${links ? `; ${links}` : ""}:`);
    if (!g.overlay) d.nodes.filter((n) => n.group === g.id).forEach(node);
  }
  if (d.story.length) {
    lines.push(
      d.story.some((s) => s.step !== undefined)
        ? `Steps: ${d.story.map((s) => `${s.step} ${s.from} -> ${s.to}`).join("; ")}`
        : `Story: ${[d.story[0]?.from, ...d.story.map((s) => s.to)].join(" -> ")}`,
    );
  }
  return lines.join("\n");
}

export async function cmdDescribe(args: Args): Promise<void> {
  const [specPath] = args._;
  if (!specPath) usage("describe needs a spec file");
  const spec = readSpec(specPath);
  const parsed = parseSpec(spec.text, spec.path);
  const model = parsed.model;
  if (!model || parsed.diagnostics.some((x) => x.severity === "error")) {
    printDiagnostics(parsed.diagnostics, false);
    process.exitCode = 1;
    return;
  }
  let scene: Scene | undefined;
  try {
    const r = await renderModel({ model, formats: [], themes: [model.theme], name: spec.name });
    scene = r.scenes[model.theme];
  } catch (e) {
    const failure = renderFailure(e);
    if (!failure) throw e;
    printDiagnostics([failure], false);
    process.exitCode = 1;
    return;
  }
  if (!scene) throw new Error(`no ${model.theme} scene was laid out`);
  const out =
    args.flags.json === true
      ? JSON.stringify(describeData(scene, model), null, 2)
      : describeScene(scene, model);
  process.stdout.write(`${out}\n`);
}
