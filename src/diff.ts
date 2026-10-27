// orrery diff: what changed between two specs (nodes, groups and edges added, removed or
// changed), as text, JSON, or an SVG of the new diagram with the changes colored.
//
// Nodes and groups match by id; an id that disappears while a new one appears with the same
// label and icon (or label and type, for groups) is a rename. Edges match by their ends and
// arrow, with renamed ends mapped first. The picture is the after spec drawn by renderModel from
// a derived model: added and changed items carry the green or amber in their own color fields
// (icon nodes get an outline overlay), removed ones come back as gray, dashed ghosts where they
// were, and a key for the three colors is drawn under the diagram.
import { execFileSync } from "node:child_process";
import { basename, relative, resolve } from "node:path";
import type { Args } from "./cli/args.ts";
import { printDiagnostics, readSpec, renderFailure, usage, writeAtomic } from "./cli/io.ts";
import { mixHex } from "./color.ts";
import { SIZES } from "./layout/sizes.ts";
import { renderModel } from "./render/index.ts";
import { renderPng } from "./render/png.ts";
import { parseSpec } from "./spec/index.ts";
import type { IncludeReader } from "./spec/reuse.ts";
import { measure } from "./text.ts";
import { THEME_TOKENS } from "./themes.ts";
import type {
  ArrowMode,
  Model,
  ModelEdge,
  ModelGroup,
  ModelNode,
  Skin,
  ThemeName,
} from "./types.ts";

const ARROW_OPS: Record<ArrowMode, string> = { end: "->", start: "<-", both: "<->", none: "--" };

/** An edge as the spec writes it: `api -> db`. */
export const edgeName = (e: Pick<ModelEdge, "from" | "to" | "arrow">): string =>
  `${e.from} ${ARROW_OPS[e.arrow]} ${e.to}`;

export interface FieldChange {
  field: string;
  before: string | number | null;
  after: string | number | null;
}

export interface DiffItem {
  /** Node or group id, or the edge as `from -> to`. */
  id: string;
  label?: string;
}

export interface DiffSection {
  added: DiffItem[];
  removed: DiffItem[];
  changed: { id: string; changes: FieldChange[] }[];
  renamed: { from: string; to: string }[];
}

export interface SpecDiff {
  before: string;
  after: string;
  nodes: DiffSection;
  groups: DiffSection;
  edges: DiffSection;
  counts: { added: number; removed: number; changed: number; renamed: number };
}

// ---------------------------------------------------------------- matching

interface Matched<T> {
  pairs: [T, T][];
  added: T[];
  removed: T[];
  renamed: [T, T][];
}

/** Pairs by id, then pairs a lone removed id with the one added id that looks the same. */
function matchById<T extends { id: string }>(
  before: T[],
  after: T[],
  same: (a: T, b: T) => boolean,
): Matched<T> {
  const afterIds = new Map(after.map((x) => [x.id, x]));
  const beforeIds = new Set(before.map((x) => x.id));
  const pairs: [T, T][] = [];
  const removed: T[] = [];
  for (const b of before) {
    const a = afterIds.get(b.id);
    if (a) pairs.push([b, a]);
    else removed.push(b);
  }
  const added = after.filter((a) => !beforeIds.has(a.id));
  const renamed: [T, T][] = [];
  for (const r of [...removed]) {
    const candidates = added.filter((a) => same(r, a));
    const twins = removed.filter((x) => candidates.some((a) => same(x, a)));
    if (candidates.length !== 1 || twins.length !== 1) continue;
    const a = candidates[0] as T;
    renamed.push([r, a]);
    pairs.push([r, a]);
    removed.splice(removed.indexOf(r), 1);
    added.splice(added.indexOf(a), 1);
  }
  return { pairs, added, removed, renamed };
}

const SYMMETRIC = new Set<ArrowMode>(["both", "none"]);

/**
 * Pairs edges by ends and arrow. When one pair of ends repeats, an edge pairs first with one that
 * has its label and line too (so removing one of several messages names that one), and what is
 * left pairs in spec order.
 */
function matchEdges(
  before: ModelEdge[],
  after: ModelEdge[],
  rename: (id: string) => string,
): Matched<ModelEdge> {
  const key = (e: ModelEdge, map: (id: string) => string = (id) => id) => {
    let [from, to] = [map(e.from), map(e.to)];
    if (SYMMETRIC.has(e.arrow) && from > to) [from, to] = [to, from];
    return `${from} ${ARROW_OPS[e.arrow]} ${to}`;
  };
  const open = new Map<string, ModelEdge[]>();
  for (const e of after) open.set(key(e), [...(open.get(key(e)) ?? []), e]);
  const pairs: [ModelEdge, ModelEdge][] = [];
  const removed: ModelEdge[] = [];
  const left: ModelEdge[] = [];
  for (const b of before) {
    const list = open.get(key(b, rename)) ?? [];
    const i = list.findIndex((a) => (a.label ?? "") === (b.label ?? "") && a.line === b.line);
    const [a] = i >= 0 ? list.splice(i, 1) : [];
    if (a) pairs.push([b, a]);
    else left.push(b);
  }
  for (const b of left) {
    const a = open.get(key(b, rename))?.shift();
    if (a) pairs.push([b, a]);
    else removed.push(b);
  }
  pairs.sort((x, y) => before.indexOf(x[0]) - before.indexOf(y[0]));
  const added = [...open.values()].flat();
  added.sort((x, y) => after.indexOf(x) - after.indexOf(y));
  return { pairs, added, removed, renamed: [] };
}

type Value = string | number | null | undefined;

function fieldChanges(fields: [string, Value, Value][]): FieldChange[] {
  return fields.flatMap(([field, b, a]) =>
    (b ?? null) === (a ?? null) ? [] : [{ field, before: b ?? null, after: a ?? null }],
  );
}

const groupIcon = (g: ModelGroup) => (g.icon === null ? "none" : g.icon);

interface Comparison {
  nodes: Matched<ModelNode>;
  groups: Matched<ModelGroup>;
  edges: Matched<ModelEdge>;
  /** Field changes of every paired after item that has any. */
  changes: Map<object, FieldChange[]>;
  /** Before id to after id, for renamed nodes and groups. */
  rename: Map<string, string>;
}

function compare(before: Model, after: Model): Comparison {
  const groups = matchById(
    before.groups,
    after.groups,
    (a, b) => !!a.label && a.label === b.label && a.type === b.type,
  );
  const nodes = matchById(
    before.nodes,
    after.nodes,
    (a, b) => !!a.label && a.label === b.label && a.icon === b.icon,
  );
  const rename = new Map(
    [...groups.renamed, ...nodes.renamed].map(([b, a]) => [b.id, a.id] as [string, string]),
  );
  const mapped = (id: string | undefined) => (id ? (rename.get(id) ?? id) : id);
  const changes = new Map<object, FieldChange[]>();
  const keep = (item: object, list: FieldChange[]) => list.length && changes.set(item, list);
  for (const [b, a] of nodes.pairs)
    keep(
      a,
      fieldChanges([
        ["label", b.label, a.label],
        ["icon", b.icon, a.icon],
        ["group", mapped(b.parent), a.parent],
        ["note", b.note, a.note],
      ]),
    );
  for (const [b, a] of groups.pairs)
    keep(
      a,
      fieldChanges([
        ["label", b.label, a.label],
        ["type", b.type, a.type],
        ["icon", groupIcon(b), groupIcon(a)],
        ["group", mapped(b.parent), a.parent],
      ]),
    );
  const edges = matchEdges(before.edges, after.edges, (id) => rename.get(id) ?? id);
  for (const [b, a] of edges.pairs)
    keep(
      a,
      fieldChanges([
        ["label", b.label, a.label],
        ["line", b.line, a.line],
        ["step", b.step, a.step],
      ]),
    );
  return { nodes, groups, edges, changes, rename };
}

function section<T extends { id: string; label?: string }>(
  m: Matched<T>,
  changes: Map<object, FieldChange[]>,
  name: (x: T) => string = (x) => x.id,
): DiffSection {
  const item = (x: T): DiffItem => ({ id: name(x), ...(x.label ? { label: x.label } : {}) });
  return {
    added: m.added.map(item),
    removed: m.removed.map(item),
    changed: m.pairs.flatMap(([, a]) => {
      const list = changes.get(a);
      return list ? [{ id: name(a), changes: list }] : [];
    }),
    renamed: m.renamed.map(([b, a]) => ({ from: b.id, to: a.id })),
  };
}

/** What changed from `before` to `after`, by nodes, groups and edges. */
export function diffModels(
  before: Model,
  after: Model,
  names = { before: "before", after: "after" },
): SpecDiff {
  const c = compare(before, after);
  const nodes = section(c.nodes, c.changes);
  const groups = section(c.groups, c.changes);
  const edges = section(c.edges, c.changes, edgeName);
  const all = [nodes, groups, edges];
  const sum = (k: keyof DiffSection) => all.reduce((n, s) => n + s[k].length, 0);
  return {
    ...names,
    nodes,
    groups,
    edges,
    counts: {
      added: sum("added"),
      removed: sum("removed"),
      changed: sum("changed"),
      renamed: sum("renamed"),
    },
  };
}

// ---------------------------------------------------------------- text

const QUOTED = new Set(["label", "note"]);

function show(field: string, v: string | number | null): string {
  if (v === null) return "(none)";
  return QUOTED.has(field) ? JSON.stringify(v) : String(v);
}

export function formatDiff(d: SpecDiff): string {
  const c = d.counts;
  const total = c.added + c.removed + c.changed + c.renamed;
  const lines = [
    `diff ${d.before} -> ${d.after}: ${
      total
        ? `${c.added} added, ${c.removed} removed, ${c.changed} changed, ${c.renamed} renamed`
        : "no changes"
    }`,
  ];
  const kinds: [string, DiffSection][] = [
    ["group", d.groups],
    ["node", d.nodes],
    ["edge", d.edges],
  ];
  const named = (x: DiffItem) => `${x.id}${x.label ? ` ${JSON.stringify(x.label)}` : ""}`;
  for (const [kind, s] of kinds) {
    for (const r of s.renamed) lines.push(`> ${kind} ${r.from} renamed to ${r.to}`);
    for (const x of s.added) lines.push(`+ ${kind} ${named(x)}`);
    for (const x of s.removed) lines.push(`- ${kind} ${named(x)}`);
    for (const x of s.changed)
      lines.push(
        `~ ${kind} ${x.id}: ${x.changes
          .map((f) => `${f.field} ${show(f.field, f.before)} -> ${show(f.field, f.after)}`)
          .join(", ")}`,
      );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- the picture

export interface DiffInk {
  added: string;
  changed: string;
  removed: string;
}

/** GitHub's success, attention and muted colors, per theme. */
export const DIFF_INK: Record<ThemeName, DiffInk> = {
  light: { added: "#1a7f37", changed: "#9a6700", removed: "#8c959f" },
  dark: { added: "#3fb950", changed: "#d29922", removed: "#6e7681" },
};

/** `base`, or `base-2`, `base-3` ... whichever no id in `taken` has; the result is then taken. */
function freshId(base: string, taken: Set<string>): string {
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  taken.add(id);
  return id;
}

/**
 * The after model with the changes in it: tinted added and changed items, gray dashed ghosts of
 * removed ones (with their old group and edges, beside the nodes they followed in the spec).
 */
export function diffPicture(before: Model, after: Model, theme: ThemeName): Model {
  const c = compare(before, after);
  const ink = DIFF_INK[theme];
  const bg =
    after.background && after.background !== "transparent"
      ? after.background
      : THEME_TOKENS[theme].background;
  const status = new Map<object, "added" | "changed">();
  for (const m of [c.nodes, c.groups, c.edges] as Matched<object>[]) {
    for (const a of m.added) status.set(a, "added");
    for (const [, a] of m.renamed) status.set(a, "changed");
  }
  for (const a of c.changes.keys()) status.set(a, "changed");
  const taken = new Set([...after.nodes, ...after.groups, ...after.edges].map((x) => x.id));
  const overlays: ModelGroup[] = [];
  const outline = (id: string, color: string, dashed: boolean) =>
    overlays.push({
      id: freshId(`diff-${id}`, taken),
      label: "",
      type: "box",
      color,
      fill: dashed ? "none" : mixHex(color, bg, 0.14),
      icon: null,
      dashed,
      around: [id],
    });

  const nodes: ModelNode[] = after.nodes.map((n) => {
    const s = status.get(n);
    if (!s) return n;
    // A vendor icon keeps its own colors, so an icon node gets a tinted outline around it.
    if (n.look === "icon") outline(n.id, ink[s], false);
    return { ...n, color: ink[s] };
  });
  const groups: ModelGroup[] = after.groups.map((g) => {
    const s = status.get(g);
    return s ? { ...g, color: ink[s], dashed: false } : g;
  });
  const edges: ModelEdge[] = after.edges.map((e) => {
    const s = status.get(e);
    return s ? { ...e, color: ink[s] } : e;
  });

  // Ghosts keep their old id unless the after spec reuses it for something else.
  const ghost = new Map<string, string>();
  for (const g of c.groups.removed) ghost.set(g.id, freshId(g.id, taken));
  for (const n of c.nodes.removed) ghost.set(n.id, freshId(n.id, taken));
  const present = (id: string | undefined) => {
    if (!id) return undefined;
    const now = ghost.get(id) ?? c.rename.get(id) ?? id;
    return taken.has(now) ? now : undefined;
  };
  for (const g of c.groups.removed) {
    const around = g.around?.map(present).filter((x): x is string => !!x);
    if (g.around && !around?.length) continue;
    groups.push({
      id: ghost.get(g.id) ?? g.id,
      label: g.label,
      type: g.type,
      parent: around ? undefined : present(g.parent),
      color: ink.removed,
      fill: "none",
      icon: null,
      dashed: true,
      ...(around ? { around } : {}),
    });
  }
  for (const n of c.nodes.removed) {
    const id = ghost.get(n.id) ?? n.id;
    const ghostNode: ModelNode = {
      id,
      label: n.label,
      note: n.note,
      look: "shape",
      shape: n.look === "shape" && !n.bpmn ? n.shape : "rounded",
      parent: present(n.parent),
      color: ink.removed,
      iconSize: n.iconSize,
      ...(n.stage && after.stages?.includes(n.stage) ? { stage: n.stage } : {}),
    };
    // Beside the node it followed in the before spec, so spec order keeps it near its place.
    const prior = before.nodes.slice(0, before.nodes.indexOf(n)).reverse();
    const anchor = prior.map((p) => present(p.id)).find((x) => x !== undefined);
    const at = anchor ? nodes.findIndex((x) => x.id === anchor) + 1 : 0;
    nodes.splice(at, 0, ghostNode);
    outline(id, ink.removed, true);
  }
  // A sequence's edges are its messages in order, so a removed one's ghost goes where it was:
  // after the nearest earlier message still drawn. Elsewhere ghosts go last.
  const sequence = after.kind === "sequence";
  const drawn = new Map<ModelEdge, ModelEdge>();
  for (const [b, a] of c.edges.pairs) {
    const at = after.edges.indexOf(a);
    const e = edges[at];
    if (e) drawn.set(b, e);
  }
  const kept = [...edges];
  for (const e of c.edges.removed) {
    const from = present(e.from);
    const to = present(e.to);
    if (!from || !to) continue;
    const ghostEdge: ModelEdge = {
      id: freshId(`removed-${e.id}`, taken),
      from,
      to,
      label: e.label,
      line: "dashed",
      arrow: e.arrow,
      color: ink.removed,
      constraint: e.constraint,
      ...(e.flow ? { flow: e.flow } : {}),
    };
    if (!sequence) {
      edges.push(ghostEdge);
      continue;
    }
    const prior = before.edges.slice(0, before.edges.indexOf(e)).reverse();
    const anchor = prior.map((p) => drawn.get(p)).find((x) => x !== undefined);
    edges.splice(anchor ? edges.indexOf(anchor) + 1 : 0, 0, ghostEdge);
    drawn.set(e, ghostEdge);
  }
  // Fragments count messages, which the ghosts moved: message n is where after's n now sits.
  const moved = (n: number) => {
    const e = kept[n - 1];
    return e ? edges.indexOf(e) + 1 : n;
  };
  const fragments = after.fragments?.map((f) => ({
    ...f,
    from: moved(f.from),
    to: moved(f.to),
    ...(f.else ? { else: f.else.map((b) => ({ ...b, at: moved(b.at) })) } : {}),
  }));
  return {
    ...after,
    nodes,
    groups: [...groups, ...overlays],
    edges,
    ...(sequence && fragments ? { fragments } : {}),
    animate: "none",
    views: undefined,
    story: undefined,
  };
}

/** The SVG with a key for the three colors under the diagram, the canvas grown to hold it. */
export function withKey(svg: string, theme: ThemeName, counts: SpecDiff["counts"]): string {
  const head =
    /<svg\b[^>]*?\swidth="([\d.]+)" height="([\d.]+)" viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!head) return svg;
  const W = Number(head[1]);
  const H = Number(head[2]);
  const t = THEME_TOKENS[theme];
  const ink = DIFF_INK[theme];
  const rows: [string, string, boolean][] = [
    [`Added (${counts.added})`, ink.added, false],
    [`Changed (${counts.changed + counts.renamed})`, ink.changed, false],
    [`Removed (${counts.removed})`, ink.removed, true],
  ];
  const P = 10;
  const size = SIZES.edgeLabel;
  const widths = rows.map(([label]) => 28 + 8 + Math.ceil(measure(label, size)));
  const w = P * 2 + widths.reduce((a, b) => a + b, 0) + 20 * (rows.length - 1);
  const h = P * 2 + 14;
  const x0 = SIZES.pad;
  const y0 = Math.round(H - SIZES.pad + 12);
  const newW = Math.ceil(Math.max(W, x0 + w + SIZES.pad));
  const newH = Math.ceil(y0 + h + SIZES.pad);
  const parts = [
    `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="6" fill="${t.surface}" stroke="${t.border}" stroke-width="1"/>`,
  ];
  let x = x0 + P;
  for (const [i, [label, color, dashed]] of rows.entries()) {
    const fill = dashed ? "none" : mixHex(color, t.background, 0.14);
    parts.push(
      `<rect x="${x}" y="${y0 + P + 1}" width="28" height="12" rx="3" fill="${fill}" stroke="${color}" stroke-width="1.5"${dashed ? ' stroke-dasharray="4 3"' : ""}/>`,
      `<text x="${x + 36}" y="${y0 + P + 11}" font-size="${size}" fill="${t.text}">${label}</text>`,
    );
    x += (widths[i] ?? 0) + 20;
  }
  const grown = svg
    .replace(
      head[0],
      head[0].replace(
        /width="[\d.]+" height="[\d.]+" viewBox="0 0 [\d.]+ [\d.]+"/,
        `width="${newW}" height="${newH}" viewBox="0 0 ${newW} ${newH}"`,
      ),
    )
    .replace(
      `<rect width="${head[1]}" height="${head[2]}" `,
      `<rect width="${newW}" height="${newH}" `,
    );
  const end = grown.lastIndexOf("</svg>");
  return `${grown.slice(0, end)}<g id="diff-key">${parts.join("")}</g>\n${grown.slice(end)}`;
}

// ---------------------------------------------------------------- the command

/**
 * A spec from a file, stdin, or `git:<ref>:<path>` (read with git show, path from the repo root).
 * A git side also reads its `include:` files at that ref, so the before picture is the spec as it
 * was then, shared frame and all.
 */
export function readSide(
  arg: string,
  cwd = process.cwd(),
): { text: string; path: string; name: string; include?: IncludeReader } {
  const m = /^git:([^:]+):(.+)$/.exec(arg);
  if (!m) return readSpec(arg);
  const [, ref = "", path = ""] = m;
  const git = (...gitArgs: string[]) =>
    execFileSync("git", gitArgs, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  try {
    const text = git("show", `${ref}:${path}`);
    const root = git("rev-parse", "--show-toplevel").trim();
    const include = (file: string): string | undefined => {
      const at = relative(root, file).replaceAll("\\", "/");
      try {
        return at.startsWith("../") ? undefined : git("show", `${ref}:${at}`);
      } catch {
        return undefined;
      }
    };
    return {
      text,
      path: resolve(root, path),
      name: basename(path).replace(/\.(ya?ml|json)$/i, ""),
      include,
    };
  } catch (e) {
    const why = String((e as { stderr?: string }).stderr ?? (e as Error).message).split("\n")[0];
    usage(`cannot read ${arg}: ${why}`);
  }
}

/** `orrery diff <before> <after> [-o changes.svg|.png] [--json]`. */
export async function cmdDiff(args: Args): Promise<void> {
  const [beforeArg, afterArg] = args._;
  if (!beforeArg || !afterArg) usage("diff needs two specs: before and after");
  const json = args.flags.json === true;
  const sides = [readSide(beforeArg), readSide(afterArg)] as const;
  const [before, after] = sides.map((s) =>
    parseSpec(s.text, s.path, s.include ? { include: s.include } : {}),
  );
  let failed = false;
  for (const [i, p] of [before, after].entries()) {
    if (p?.model) continue;
    process.stderr.write(`orrery: ${i ? afterArg : beforeArg} has errors\n`);
    printDiagnostics(p?.diagnostics ?? [], false);
    failed = true;
  }
  if (failed || !before?.model || !after?.model) {
    process.exitCode = 1;
    return;
  }
  const d = diffModels(before.model, after.model, { before: beforeArg, after: afterArg });
  const out = typeof args.flags.out === "string" ? resolve(args.flags.out) : undefined;
  if (out) {
    const themeFlag = args.flags.theme ?? after.model.theme;
    if (themeFlag !== "light" && themeFlag !== "dark") usage("--theme must be light or dark");
    const theme: ThemeName = themeFlag;
    const png = /\.png$/i.test(out);
    if (!png && !/\.svg$/i.test(out)) usage("-o must name an .svg or .png file");
    const model = diffPicture(before.model, after.model, theme);
    try {
      const result = await renderModel({
        model,
        formats: ["svg"],
        themes: [theme],
        name: `${sides[1].name}-diff`,
        // The tints are classic colors; stage recolors the scene in its own kit.
        skin: (args.flags.skin as Skin | undefined) ?? "classic",
        animate: "none",
      });
      const svg = result.artifacts.find((a) => a.format === "svg")?.data;
      if (typeof svg !== "string") throw new Error("the diff picture did not render");
      const keyed = withKey(svg, theme, d.counts);
      const scale = args.flags.scale !== undefined ? Number(args.flags.scale) : 2;
      writeAtomic(out, png ? await renderPng(keyed, { scale }) : keyed);
    } catch (e) {
      const failure = renderFailure(e);
      if (!failure) throw e;
      printDiagnostics([failure], false);
      process.exitCode = 1;
      return;
    }
  }
  if (json) process.stdout.write(`${JSON.stringify(out ? { ...d, output: out } : d, null, 2)}\n`);
  else process.stdout.write(`${formatDiff(d)}${out ? `\nwrote ${out}` : ""}\n`);
  process.exitCode = 0;
}
