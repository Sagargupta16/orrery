import { parse as parseYaml } from "yaml";
import { isHex } from "./color.ts";
import { iconInfo, resolveIcon, suggestIcons } from "./icons.ts";
import { GROUP_STYLES, groupStyleKeys, resolveGroupStyle } from "./styles.ts";
import {
  ANIMATE_MODES,
  ARROWS,
  type ArrowMode,
  DIRECTIONS,
  type Diagnostic,
  type Direction,
  EDGE_LINES,
  type EdgeLine,
  LOOKS,
  type Model,
  type ModelEdge,
  type ModelGroup,
  type ModelNode,
  type NodeLook,
  ROUTINGS,
  type Routing,
  SHAPES,
  type ShapeKind,
  SPACINGS,
  THEMES,
  type ThemeName,
} from "./types.ts";

const TOP_KEYS = [
  "$schema",
  "version",
  "title",
  "subtitle",
  "direction",
  "theme",
  "look",
  "arrowhead",
  "layout",
  "animate",
  "background",
  "nodes",
  "groups",
  "edges",
];
const NODE_KEYS = [
  "id",
  "icon",
  "label",
  "note",
  "in",
  "look",
  "shape",
  "color",
  "badge",
  "url",
  "size",
];
const NODE_SYNONYMS: Record<string, string> = {
  sublabel: "note",
  description: "note",
  parent: "in",
  group: "in",
  link: "url",
  href: "url",
  style: "look",
};
const GROUP_KEYS = [
  "id",
  "type",
  "label",
  "in",
  "color",
  "fill",
  "icon",
  "dashed",
  "contains",
  "around",
];
const GROUP_SYNONYMS: Record<string, string> = {
  style: "type",
  kind: "type",
  parent: "in",
  children: "contains",
  nodes: "contains",
};
const EDGE_KEYS = ["from", "to", "label", "line", "arrow", "color", "step", "constraint"];
const EDGE_SYNONYMS: Record<string, string> = {
  style: "line",
  source: "from",
  target: "to",
  text: "label",
};
const LAYOUT_KEYS = ["spacing", "routing", "layering", "merge"];
const ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

export interface ParseResult {
  model?: Model;
  diagnostics: Diagnostic[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function closest(word: string, options: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const o of options) {
    const d = distance(word.toLowerCase(), o.toLowerCase());
    if (d < bestScore) {
      bestScore = d;
      best = o;
    }
  }
  return bestScore <= Math.max(2, Math.floor(word.length / 3)) ? best : undefined;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length] ?? 0;
}

// ---------------------------------------------------------------- edge expressions

interface Op {
  line: EdgeLine;
  arrow: ArrowMode;
  label?: string;
}

const OPS: [string, Op][] = [
  ["<-->", { line: "dashed", arrow: "both" }],
  ["<==>", { line: "thick", arrow: "both" }],
  ["<..>", { line: "dotted", arrow: "both" }],
  ["<->", { line: "solid", arrow: "both" }],
  ["-->", { line: "dashed", arrow: "end" }],
  ["<--", { line: "dashed", arrow: "start" }],
  ["==>", { line: "thick", arrow: "end" }],
  ["<==", { line: "thick", arrow: "start" }],
  ["..>", { line: "dotted", arrow: "end" }],
  ["<..", { line: "dotted", arrow: "start" }],
  ["->", { line: "solid", arrow: "end" }],
  ["<-", { line: "solid", arrow: "start" }],
  ["---", { line: "dashed", arrow: "none" }],
  ["===", { line: "thick", arrow: "none" }],
  ["...", { line: "dotted", arrow: "none" }],
  ["--", { line: "solid", arrow: "none" }],
];

const OP_RE = new RegExp(
  [
    "-\\[([^\\]]*)\\]->",
    "--\\[([^\\]]*)\\]-->",
    ...OPS.map(([op]) => {
      const esc = op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return /[<>]/.test(op) ? esc : `(?<=\\s)${esc}(?=\\s)`;
    }),
  ].join("|"),
  "g",
);

const hasOperator = (s: string) => new RegExp(OP_RE.source).test(` ${s} `);

/** Index of the ":" that starts an edge label, skipping colons inside -[inline labels]->. */
function labelColon(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "[") depth += 1;
    else if (c === "]") depth = Math.max(0, depth - 1);
    else if (c === ":" && depth === 0 && (i + 1 === s.length || /\s/.test(s[i + 1] ?? "")))
      return i;
  }
  return -1;
}

const ICON_ID = /^(aws|azure|gcp|k8s|github|logos|si|tabler|generic):[a-z0-9]/i;

export interface EdgeHop {
  from: string[];
  to: string[];
  op: Op;
}

/** Parses "a -> b, c --> d: label" into hops; returns an error string for bad syntax. */
export function parseEdgeExpression(expr: string): { hops: EdgeHop[]; label?: string } | string {
  let body = expr.trim();
  let label: string | undefined;
  const colon = labelColon(body);
  if (colon >= 0) {
    label = body.slice(colon + 1).trim() || undefined;
    body = body.slice(0, colon).trim();
  }
  const parts: (string | Op)[] = [];
  let last = 0;
  for (const m of body.matchAll(OP_RE)) {
    parts.push(body.slice(last, m.index).trim());
    if (m[1] !== undefined) parts.push({ line: "solid", arrow: "end", label: m[1].trim() });
    else if (m[2] !== undefined) parts.push({ line: "dashed", arrow: "end", label: m[2].trim() });
    else {
      const op = OPS.find(([o]) => o === m[0])?.[1];
      if (op) parts.push({ ...op });
    }
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(body.slice(last).trim());
  if (parts.length < 3) return `no arrow found in "${expr}" (use ->, -->, <->, -- ...)`;
  const hops: EdgeHop[] = [];
  for (let i = 0; i + 2 < parts.length; i += 2) {
    const a = parts[i];
    const op = parts[i + 1];
    const b = parts[i + 2];
    if (typeof a !== "string" || typeof b !== "string" || typeof op === "string" || !op) {
      return `cannot read "${expr}"`;
    }
    const from = a
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const to = b
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!from.length || !to.length) return `missing endpoint in "${expr}"`;
    hops.push({ from, to, op });
  }
  return { hops, label };
}

// ---------------------------------------------------------------- parse

export function parseSpec(source: string, filename = "diagram.yaml"): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const err = (code: string, message: string, extra: Partial<Diagnostic> = {}) =>
    diagnostics.push({ code, severity: "error", message, ...extra });
  const warn = (code: string, message: string, extra: Partial<Diagnostic> = {}) =>
    diagnostics.push({ code, severity: "warning", message, ...extra });

  let raw: unknown;
  try {
    raw = /\.json$/i.test(filename) ? JSON.parse(source) : parseYaml(source);
  } catch (e) {
    err("DG100", `cannot parse ${filename}: ${(e as Error).message.split("\n")[0]}`, {
      fixes: ["fix the YAML/JSON syntax at the reported line"],
    });
    return { diagnostics };
  }
  if (!isObj(raw)) {
    err("DG100", "the spec must be a mapping with nodes, groups and edges", {
      fixes: ["start from `stackdraw init`"],
    });
    return { diagnostics };
  }

  const unknownKeys = (
    obj: Obj,
    allowed: string[],
    synonyms: Record<string, string>,
    where: string,
  ) => {
    for (const key of Object.keys(obj)) {
      if (allowed.includes(key) || key in synonyms) continue;
      const near = closest(key, allowed);
      let fixes = near
        ? [`rename "${key}" to "${near}"`]
        : [`remove "${key}"; allowed: ${allowed.join(", ")}`];
      // In a YAML flow mapping {...}, a comma inside an unquoted value starts a new key whose
      // value is null ("note: Python, Node" gives the key "Node").
      if (obj[key] === null) {
        fixes = [
          `a comma inside an unquoted value split it; quote that value, e.g. note: "..., ${key.trim()}"`,
        ];
      }
      err("DG108", `unknown key "${key}" in ${where}`, { subject: { where, key }, fixes });
    }
  };
  const pick = (obj: Obj, key: string, synonyms: Record<string, string>): unknown => {
    if (key in obj) return obj[key];
    for (const [syn, target] of Object.entries(synonyms))
      if (target === key && syn in obj) return obj[syn];
    return undefined;
  };
  const oneOf = <T extends string>(
    value: unknown,
    options: readonly T[],
    fallback: T,
    where: string,
  ): T => {
    if (value === undefined || value === null || value === "") return fallback;
    const v = String(value).toLowerCase() as T;
    if (options.includes(v)) return v;
    const near = closest(String(value), options);
    err("DG107", `${where} must be one of ${options.join(", ")}; got "${String(value)}"`, {
      subject: { where, value },
      fixes: near ? [`use "${near}"`] : [`use one of ${options.join(", ")}`],
    });
    return fallback;
  };
  const str = (v: unknown): string | undefined =>
    v === undefined || v === null ? undefined : typeof v === "string" ? v : String(v);

  unknownKeys(raw, TOP_KEYS, {}, "the top level");

  const direction = oneOf<Direction>(raw.direction, DIRECTIONS, "right", "direction");
  const theme = oneOf<ThemeName>(raw.theme, THEMES, "light", "theme");
  const defaultLook = oneOf<NodeLook>(raw.look, ["icon", "card"] as const, "icon", "look");
  const layout = isObj(raw.layout) ? raw.layout : {};
  if (raw.layout !== undefined && !isObj(raw.layout))
    err("DG107", "layout must be a mapping", {
      subject: { where: "layout" },
      fixes: ["write layout: { spacing: normal, routing: orthogonal }"],
    });
  unknownKeys(layout, LAYOUT_KEYS, {}, "layout");
  const routing = oneOf<Routing>(layout.routing, ROUTINGS, "orthogonal", "layout.routing");
  let spacing = 1;
  if (typeof layout.spacing === "number") spacing = Math.max(0.5, Math.min(3, layout.spacing));
  else {
    const s = oneOf(layout.spacing, SPACINGS, "normal", "layout.spacing");
    spacing = { compact: 0.75, normal: 1, loose: 1.35 }[s];
  }
  const layering = oneOf(
    layout.layering,
    ["source", "simplex"] as const,
    "source",
    "layout.layering",
  );
  if (layout.merge !== undefined && typeof layout.merge !== "boolean") {
    err("DG107", "layout.merge must be true or false", {
      subject: { where: "layout.merge" },
      fixes: ["use layout: { merge: false } to give every edge its own port"],
    });
  }
  const merge = layout.merge !== false;
  const arrowhead = oneOf(raw.arrowhead, ["open", "filled"] as const, "open", "arrowhead");
  const animate =
    raw.animate === true
      ? "packets"
      : raw.animate === false
        ? "none"
        : oneOf(raw.animate, ANIMATE_MODES, "packets", "animate");
  const background = str(raw.background);
  if (background && background !== "transparent" && !isHex(background)) {
    err("DG107", `background must be a hex color or "transparent"; got "${background}"`, {
      subject: { where: "background", value: background },
      fixes: ["use a hex color such as #ffffff, or transparent"],
    });
  }

  // ------------------------------------------------------------- collections
  const entries = (value: unknown, what: string): [string, unknown][] => {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) {
      return value.map((item, i): [string, unknown] => {
        if (isObj(item) && typeof item.id === "string") return [item.id, item];
        if (isObj(item) && Object.keys(item).length === 1) {
          const [k, v] = Object.entries(item)[0] as [string, unknown];
          return [k, v];
        }
        err("DG100", `${what}[${i}] needs an id`, {
          subject: { [what]: i },
          fixes: [`give the item an id: - { id: name, ... }, or use a mapping keyed by id`],
        });
        return [`__invalid_${i}`, undefined];
      });
    }
    if (isObj(value)) return Object.entries(value);
    err("DG100", `${what} must be a mapping of id to definition`, {
      subject: { where: what },
      fixes: [`write ${what}: { my-id: { ... } }`],
    });
    return [];
  };

  const nodes: ModelNode[] = [];
  const groups: ModelGroup[] = [];
  const ids = new Map<string, "node" | "group">();
  const pendingContains: [string, string[]][] = [];

  const claim = (id: string, kind: "node" | "group") => {
    if (!ID_RE.test(id)) {
      err("DG103", `id "${id}" may only use letters, digits, "_", "-" and "."`, {
        subject: { id },
        fixes: [`rename to "${id.replace(/[^A-Za-z0-9_.-]+/g, "-")}"`],
      });
    }
    if (ids.has(id)) {
      err("DG103", `duplicate id "${id}" (used by a ${ids.get(id)} and a ${kind})`, {
        subject: { id },
        fixes: [`rename one of them, e.g. "${id}-2"`],
      });
      return false;
    }
    ids.set(id, kind);
    return true;
  };

  for (const [id, value] of entries(raw.groups, "groups")) {
    if (id.startsWith("__invalid_")) continue;
    if (!claim(id, "group")) continue;
    const g: Obj = isObj(value) ? value : typeof value === "string" ? { type: value } : {};
    unknownKeys(g, GROUP_KEYS, GROUP_SYNONYMS, `group "${id}"`);
    const type = str(pick(g, "type", GROUP_SYNONYMS)) ?? "box";
    const style = resolveGroupStyle(type);
    if (!style) {
      const near = closest(type, groupStyleKeys());
      err("DG102", `group "${id}" has unknown type "${type}"`, {
        subject: { group: id, type },
        fixes: [
          ...(near ? [`use type "${near}"`] : []),
          "run `stackdraw styles` for every group type",
        ],
      });
    }
    const iconValue = pick(g, "icon", GROUP_SYNONYMS);
    let icon: string | null | undefined;
    if (iconValue === false || iconValue === null || iconValue === "none") icon = null;
    else if (typeof iconValue === "string") {
      icon = resolveIcon(iconValue);
      if (!icon) {
        err("DG101", `group "${id}" uses unknown icon "${iconValue}"`, {
          subject: { group: id, icon: iconValue },
          fixes: suggestIcons(iconValue).map((s) => `use icon "${s}"`),
        });
      }
    }
    const color = str(pick(g, "color", GROUP_SYNONYMS));
    const fill = str(pick(g, "fill", GROUP_SYNONYMS));
    for (const [k, c] of [
      ["color", color],
      ["fill", fill],
    ] as const) {
      if (c && c !== "none" && !isHex(c))
        err("DG107", `group "${id}" ${k} must be a hex color; got "${c}"`, {
          subject: { group: id, [k]: c },
          fixes: ["use a hex color such as #2563eb"],
        });
    }
    const dashed = pick(g, "dashed", GROUP_SYNONYMS);
    groups.push({
      id,
      type: style?.key ?? "box",
      label: str(pick(g, "label", GROUP_SYNONYMS)) ?? style?.label ?? (style ? "" : id),
      parent: str(pick(g, "in", GROUP_SYNONYMS)),
      color,
      fill,
      icon,
      dashed: typeof dashed === "boolean" ? dashed : undefined,
    });
    const containsRaw = pick(g, "contains", GROUP_SYNONYMS);
    const contains = typeof containsRaw === "string" ? [containsRaw] : containsRaw;
    if (Array.isArray(contains)) {
      pendingContains.push([id, contains.map(String)]);
    } else if (contains !== undefined) {
      err("DG107", `group "${id}" contains must be a list of ids`, {
        subject: { group: id },
        fixes: [`write contains: [a, b]`],
      });
    }
    const around = pick(g, "around", GROUP_SYNONYMS);
    if (around !== undefined) {
      const group = groups[groups.length - 1];
      if (!Array.isArray(around) || !around.length) {
        err("DG107", `group "${id}" around must be a list of node or group ids`, {
          subject: { group: id },
          fixes: ["write around: [web-a, web-b]"],
        });
      } else if (group) {
        group.around = around.map(String);
        if (Array.isArray(contains)) {
          err("DG104", `group "${id}" uses both around and contains`, {
            subject: { group: id },
            fixes: ["use contains (or in:) to nest, around to outline nodes that live elsewhere"],
          });
        }
      }
    }
  }

  for (const [id, value] of entries(raw.nodes, "nodes")) {
    if (id.startsWith("__invalid_")) continue;
    if (!claim(id, "node")) continue;
    let n: Obj;
    if (isObj(value)) n = value;
    else if (typeof value === "string")
      n = resolveIcon(value) || ICON_ID.test(value.trim()) ? { icon: value } : { label: value };
    else if (value === null || value === undefined) n = {};
    else n = { label: String(value) };
    unknownKeys(n, NODE_KEYS, NODE_SYNONYMS, `node "${id}"`);
    const iconRaw = str(pick(n, "icon", NODE_SYNONYMS));
    let icon: string | undefined;
    if (iconRaw) {
      icon = resolveIcon(iconRaw);
      if (!icon) {
        err("DG101", `node "${id}" uses unknown icon "${iconRaw}"`, {
          subject: { node: id, icon: iconRaw },
          fixes: [
            ...suggestIcons(iconRaw).map((s) => `use icon "${s}"`),
            `run \`stackdraw icons search ${iconRaw.split(":").pop()?.replace(/-/g, " ")}\``,
          ],
        });
      }
    }
    const lookRaw = pick(n, "look", NODE_SYNONYMS);
    let look: NodeLook = icon || iconRaw ? defaultLook : "shape";
    if (lookRaw !== undefined) look = oneOf<NodeLook>(lookRaw, LOOKS, look, `node "${id}" look`);
    if ((look === "icon" || look === "card") && !icon && !iconRaw) look = "shape";
    const shape = oneOf<ShapeKind>(
      pick(n, "shape", NODE_SYNONYMS),
      SHAPES,
      "rounded",
      `node "${id}" shape`,
    );
    if (pick(n, "shape", NODE_SYNONYMS) !== undefined && icon && lookRaw === undefined)
      look = "shape";
    const url = str(pick(n, "url", NODE_SYNONYMS));
    // Links end up in SVG and HTML; only schemes that cannot run code are allowed.
    if (url && /^\s*[a-z][a-z0-9+.-]*:/i.test(url) && !/^\s*(https?|mailto):/i.test(url)) {
      err("DG107", `node "${id}" url must be http(s), mailto or a relative path`, {
        subject: { node: id, url },
        fixes: ["use an https:// link"],
      });
    }
    const color = str(pick(n, "color", NODE_SYNONYMS));
    if (color && !isHex(color))
      err("DG107", `node "${id}" color must be a hex color; got "${color}"`, {
        subject: { node: id, color },
        fixes: ["use a hex color such as #2563eb"],
      });
    const sizeRaw = pick(n, "size", NODE_SYNONYMS);
    let iconSize = look === "card" ? 32 : 48;
    if (typeof sizeRaw === "number") iconSize = Math.max(16, Math.min(128, sizeRaw));
    else if (sizeRaw !== undefined) {
      const named = { sm: 32, md: 48, lg: 64, xl: 80 } as Record<string, number>;
      const v = named[String(sizeRaw)];
      if (v) iconSize = v;
      else
        err("DG107", `node "${id}" size must be sm, md, lg, xl or a number of px`, {
          subject: { node: id },
          fixes: ["use size: lg, or a number such as 64"],
        });
    }
    const label =
      str(pick(n, "label", NODE_SYNONYMS)) ?? (icon ? iconInfo(icon)?.name : undefined) ?? id;
    nodes.push({
      id,
      label,
      note: str(pick(n, "note", NODE_SYNONYMS)),
      icon,
      look,
      shape,
      parent: str(pick(n, "in", NODE_SYNONYMS)),
      color,
      badge: str(pick(n, "badge", NODE_SYNONYMS)),
      url,
      iconSize,
    });
  }

  // `contains` on a group is the same as `in` on each child.
  for (const [groupId, children] of pendingContains) {
    for (const child of children) {
      const target = nodes.find((x) => x.id === child) ?? groups.find((x) => x.id === child);
      if (!target) {
        err("DG104", `group "${groupId}" contains unknown id "${child}"`, {
          subject: { group: groupId, child },
          fixes: suggestIds(child, ids).map((s) => `use "${s}"`),
        });
        continue;
      }
      if (target.parent && target.parent !== groupId) {
        err("DG104", `"${child}" is placed in both "${target.parent}" and "${groupId}"`, {
          subject: { id: child },
          fixes: [`keep one parent for "${child}"`],
        });
        continue;
      }
      target.parent = groupId;
    }
  }

  for (const g of groups) {
    for (const member of g.around ?? []) {
      if (ids.has(member)) continue;
      err("DG104", `group "${g.id}" is drawn around unknown id "${member}"`, {
        subject: { group: g.id, member },
        fixes: suggestIds(member, ids).map((x) => `use "${x}"`),
      });
    }
  }
  for (const item of [...nodes, ...groups]) {
    if (!item.parent) continue;
    const kind = ids.get(item.parent);
    if (kind === "group" && groups.find((x) => x.id === item.parent)?.around) {
      err(
        "DG104",
        `"${item.id}" is in "${item.parent}", an around group, which only outlines other ids`,
        {
          subject: { id: item.id, in: item.parent },
          fixes: [`list "${item.id}" under around: of "${item.parent}" instead`],
        },
      );
      item.parent = undefined;
      continue;
    }
    if (kind === "group") continue;
    err(
      "DG104",
      `"${item.id}" is in "${item.parent}", which ${kind ? "is a node, not a group" : "does not exist"}`,
      {
        subject: { id: item.id, in: item.parent },
        fixes: kind
          ? [`add a group and put both inside it`]
          : suggestIds(item.parent, ids, "group").map((s) => `use in: ${s}`),
      },
    );
    item.parent = undefined;
  }
  // Group nesting must be a tree.
  for (const g of groups) {
    const seen = new Set([g.id]);
    let p = g.parent;
    while (p) {
      if (seen.has(p)) {
        err("DG105", `groups "${[...seen].join('", "')}" contain each other`, {
          subject: { group: g.id },
          fixes: [`remove the "in" of one of them`],
        });
        g.parent = undefined;
        break;
      }
      seen.add(p);
      p = groups.find((x) => x.id === p)?.parent;
    }
  }

  // ------------------------------------------------------------- edges
  const edges: ModelEdge[] = [];
  const rawEdges = raw.edges;
  const list: unknown[] = Array.isArray(rawEdges)
    ? rawEdges
    : isObj(rawEdges)
      ? Object.entries(rawEdges).map(([k, v]) => ({ [k]: v }))
      : [];
  if (rawEdges !== undefined && !Array.isArray(rawEdges) && !isObj(rawEdges)) {
    err("DG109", "edges must be a list", {
      subject: { where: "edges" },
      fixes: ["write edges as a list: - a -> b"],
    });
  }
  const endpoint = (id: string, where: string): boolean => {
    if (ids.has(id)) return true;
    err("DG106", `${where} connects unknown id "${id}"`, {
      subject: { edge: where, id },
      fixes: suggestIds(id, ids).map((s) => `use "${s}"`),
    });
    return false;
  };
  const push = (
    from: string,
    to: string,
    op: Op,
    label: string | undefined,
    extra: Obj,
    where: string,
  ) => {
    if (!endpoint(from, where) || !endpoint(to, where)) return;
    // "a <- b" is drawn as b -> a so layout flows the way the data does.
    const reverse = op.arrow === "start";
    const lineRaw = pick(extra, "line", EDGE_SYNONYMS);
    const arrowRaw = pick(extra, "arrow", EDGE_SYNONYMS);
    const color = str(pick(extra, "color", EDGE_SYNONYMS));
    if (color && !isHex(color))
      err("DG107", `${where} color must be a hex color; got "${color}"`, {
        subject: { edge: where, color },
        fixes: ["use a hex color such as #ed7100"],
      });
    const stepRaw = pick(extra, "step", EDGE_SYNONYMS);
    const step = stepRaw === undefined ? undefined : Number(stepRaw);
    if (step !== undefined && (!Number.isInteger(step) || step < 0 || step > 99)) {
      err("DG107", `${where} step must be a whole number from 0 to 99`, {
        subject: { edge: where },
        fixes: ["use step: 1, 2, 3..."],
      });
    }
    edges.push({
      id: `e${edges.length + 1}`,
      from: reverse ? to : from,
      to: reverse ? from : to,
      label: op.label ?? label,
      line:
        lineRaw !== undefined
          ? oneOf<EdgeLine>(lineRaw, EDGE_LINES, op.line, `${where} line`)
          : op.line,
      arrow:
        arrowRaw !== undefined
          ? oneOf<ArrowMode>(arrowRaw, ARROWS, "end", `${where} arrow`)
          : reverse
            ? "end"
            : op.arrow,
      color,
      step: step !== undefined && Number.isInteger(step) ? step : undefined,
      constraint: pick(extra, "constraint", EDGE_SYNONYMS) !== false,
    });
  };
  const expand = (expr: string, label: string | undefined, extra: Obj, where: string) => {
    const parsed = parseEdgeExpression(expr);
    if (typeof parsed === "string") {
      err("DG109", `${where}: ${parsed}`, {
        subject: { edge: where },
        fixes: ['write edges as "a -> b", "a -> b: label" or {from: a, to: b}'],
      });
      return;
    }
    const single = parsed.hops.length === 1;
    for (const hop of parsed.hops) {
      for (const f of hop.from)
        for (const t of hop.to)
          push(f, t, hop.op, single ? (label ?? parsed.label) : undefined, extra, where);
    }
    if (!single && (label ?? parsed.label)) {
      warn("DG110", `${where}: a label on a chain applies to no single hop and was dropped`, {
        fixes: ['label one hop inline: "a -[label]-> b -> c"'],
      });
    }
  };

  for (const [i, item] of list.entries()) {
    const where = `edges[${i}]`;
    if (typeof item === "string") {
      expand(item, undefined, {}, where);
      continue;
    }
    if (!isObj(item)) {
      err("DG109", `${where} must be a string or a mapping`, {
        subject: { edge: where },
        fixes: ['write "a -> b", "a -> b: label" or { from: a, to: b }'],
      });
      continue;
    }
    const keys = Object.keys(item);
    const exprKey = keys.length === 1 && hasOperator(keys[0] ?? "") ? keys[0] : undefined;
    if (exprKey) {
      const v = item[exprKey];
      if (typeof v === "string" || typeof v === "number") expand(exprKey, String(v), {}, where);
      else if (isObj(v)) {
        unknownKeys(
          v,
          EDGE_KEYS.filter((k) => k !== "from" && k !== "to"),
          EDGE_SYNONYMS,
          where,
        );
        expand(exprKey, str(pick(v, "label", EDGE_SYNONYMS)), v, where);
      } else expand(exprKey, undefined, {}, where);
      continue;
    }
    unknownKeys(item, EDGE_KEYS, EDGE_SYNONYMS, where);
    const from = pick(item, "from", EDGE_SYNONYMS);
    const to = pick(item, "to", EDGE_SYNONYMS);
    if (from === undefined || to === undefined) {
      err("DG109", `${where} needs "from" and "to"`, {
        fixes: ['add from: and to:, or write "a -> b"'],
      });
      continue;
    }
    const froms = (Array.isArray(from) ? from : [from]).map(String);
    const tos = (Array.isArray(to) ? to : [to]).map(String);
    const op: Op = { line: "solid", arrow: "end" };
    for (const f of froms)
      for (const t of tos) push(f, t, op, str(pick(item, "label", EDGE_SYNONYMS)), item, where);
  }

  if (!nodes.length) {
    err("DG100", "the diagram has no nodes", { fixes: ["add at least one entry under nodes"] });
  }
  if (diagnostics.some((d) => d.severity === "error")) return { diagnostics };

  const model: Model = {
    title: str(raw.title),
    subtitle: str(raw.subtitle),
    direction,
    theme,
    routing,
    spacing,
    layering,
    merge,
    arrowhead,
    animate,
    background: background === "transparent" ? "transparent" : background,
    nodes,
    groups,
    edges,
  };
  return { model, diagnostics };
}

function suggestIds(id: string, ids: Map<string, string>, kind?: string): string[] {
  return [...ids.entries()]
    .filter(([, k]) => !kind || k === kind)
    .map(([candidate]) => [distance(id.toLowerCase(), candidate.toLowerCase()), candidate] as const)
    .filter(([d]) => d <= Math.max(2, Math.floor(id.length / 3)))
    .sort((a, b) => a[0] - b[0])
    .slice(0, 3)
    .map(([, c]) => c);
}

export const SPEC_KEYS = {
  top: TOP_KEYS,
  node: NODE_KEYS,
  group: GROUP_KEYS,
  edge: EDGE_KEYS,
  layout: LAYOUT_KEYS,
};
export { GROUP_STYLES };
