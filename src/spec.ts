import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { isHex } from "./color.ts";
import { iconInfo, resolveIcon, suggestIcons } from "./icons.ts";
import { groupStyleKeys, resolveGroupStyle } from "./styles.ts";
import {
  ANIMATE_MODES,
  ARROWS,
  type ArrowMode,
  BPMN_KINDS,
  type BpmnKind,
  DIAGRAM_KINDS,
  DIRECTIONS,
  type Diagnostic,
  type DiagramKind,
  type Direction,
  EDGE_FLOWS,
  EDGE_LINES,
  type EdgeFlow,
  type EdgeLine,
  isBpmnEvent,
  isBpmnGateway,
  type LegendEntry,
  LOOKS,
  type LocalIcon,
  type Model,
  type ModelEdge,
  type ModelGroup,
  type ModelNode,
  type NodeLook,
  ROUTINGS,
  type Routing,
  SHAPES,
  type ShapeKind,
  SKINS,
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
  "skin",
  "background",
  "legend",
  "kind",
  "icons",
  "stages",
  "story",
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
  "bpmn",
  "stage",
  "score",
  "rank",
  "align",
];
const NODE_SYNONYMS: Record<string, string> = {
  sublabel: "note",
  description: "note",
  parent: "in",
  group: "in",
  link: "url",
  href: "url",
  style: "look",
  layer: "rank",
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
  "cols",
];
const GROUP_SYNONYMS: Record<string, string> = {
  style: "type",
  kind: "type",
  parent: "in",
  children: "contains",
  nodes: "contains",
  columns: "cols",
};
const EDGE_KEYS = ["from", "to", "label", "line", "arrow", "color", "step", "constraint", "flow"];
const EDGE_SYNONYMS: Record<string, string> = {
  style: "line",
  source: "from",
  target: "to",
  text: "label",
};
const LAYOUT_KEYS = ["spacing", "routing", "layering", "merge", "aspect"];
/** Flowchart and state names for shapes, after ISO 5807 and UML. */
const SHAPE_SYNONYMS: Record<string, ShapeKind> = {
  terminator: "pill",
  terminal: "pill",
  decision: "diamond",
  process: "box",
  data: "parallelogram",
  io: "parallelogram",
  input: "parallelogram",
  output: "parallelogram",
  predefined: "subroutine",
  manual: "trapezoid",
  database: "cylinder",
  state: "rounded",
};
/** Each kind's flow direction and arrowhead when the spec leaves them out. */
const KIND_DEFAULTS: Record<DiagramKind, { direction: Direction; arrowhead: "open" | "filled" }> = {
  architecture: { direction: "right", arrowhead: "open" },
  flowchart: { direction: "down", arrowhead: "filled" },
  process: { direction: "right", arrowhead: "filled" },
  state: { direction: "right", arrowhead: "open" },
  tree: { direction: "down", arrowhead: "open" },
  mindmap: { direction: "right", arrowhead: "open" },
  journey: { direction: "right", arrowhead: "open" },
};
const ICON_NAME = /^[a-z0-9][a-z0-9-]*$/;
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

/** Levenshtein edit distance, for "did you mean" suggestions. */
export function distance(a: string, b: string): number {
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

/** Arrows with a label inside: -[label]-> and --[label]-->. */
const LABELED: [string, string, EdgeLine][] = [
  ["-[", "]->", "solid"],
  ["--[", "]-->", "dashed"],
];

const space = (c: string | undefined) => c !== undefined && /\s/.test(c);

/**
 * The operator starting at `i`, if any: a labeled arrow first, then the first of OPS that fits.
 * Operators without an arrowhead (--, ---, ===, ...) need whitespace on both sides, so a-b-c and
 * a...b stay names. A scanner rather than one regex: CodeQL reads any regex that matches --> as
 * an HTML comment filter.
 */
function operatorAt(s: string, i: number): { length: number; op: Op } | undefined {
  for (const [open, close, line] of LABELED) {
    if (!s.startsWith(open, i)) continue;
    const end = s.indexOf("]", i + open.length);
    if (end >= 0 && s.startsWith(close, end))
      return {
        length: end + close.length - i,
        op: { line, arrow: "end", label: s.slice(i + open.length, end).trim() },
      };
  }
  for (const [text, op] of OPS) {
    if (!s.startsWith(text, i)) continue;
    if (/[<>]/.test(text) || (space(s[i - 1]) && space(s[i + text.length])))
      return { length: text.length, op };
  }
  return undefined;
}

/** Every operator in `s`, leftmost first, never overlapping. */
function operators(s: string): { index: number; length: number; op: Op }[] {
  const found: { index: number; length: number; op: Op }[] = [];
  for (let i = 0; i < s.length; ) {
    const hit = operatorAt(s, i);
    if (!hit) {
      i += 1;
      continue;
    }
    found.push({ index: i, ...hit });
    i += hit.length;
  }
  return found;
}

const hasOperator = (s: string) => operators(` ${s} `).length > 0;

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

const ICON_ID = /^(aws|azure|gcp|k8s|github|ibm|logos|si|tabler|ph|generic|local):[a-z0-9]/i;

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
  for (const m of operators(body)) {
    parts.push(body.slice(last, m.index).trim());
    parts.push({ ...m.op });
    last = m.index + m.length;
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

const hasControlChar = (s: string) =>
  [...s].some((ch) => {
    const c = ch.charCodeAt(0);
    return c <= 0x1f || c === 0x7f;
  });

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
      fixes: ["start from `orrery init`"],
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
  /**
   * Reads a color value: it needs a leading "#", and an unquoted `#fff` is a YAML comment, so
   * the key arrives as null (warned about, then dropped). `extra` lists the words accepted besides
   * a hex color.
   */
  const hexColor = (
    value: unknown,
    key: string,
    where: string,
    subject: Obj,
    extra: readonly string[] = [],
  ): string | undefined => {
    const name = where ? `${where} ${key}` : key;
    // A warning, not an error: the color is dropped and the diagram still renders in its theme.
    if (value === null) {
      warn("DG107", `${name} is empty; an unquoted # starts a YAML comment`, {
        subject: { ...subject, [key]: null },
        fixes: [`write ${key}: "#2563eb" (the quotes keep the # from starting a comment)`],
      });
      return undefined;
    }
    const c = str(value);
    if (c === undefined || extra.includes(c) || isHex(c)) return c;
    const or = extra.map((w) => ` or "${w}"`).join("");
    err("DG107", `${name} must be a hex color with a leading #${or}; got "${c}"`, {
      subject: { ...subject, [key]: c },
      fixes: [`use a quoted hex color such as "#2563eb"${or}`],
    });
    return c;
  };

  unknownKeys(raw, TOP_KEYS, {}, "the top level");

  const kind = oneOf<DiagramKind>(raw.kind, DIAGRAM_KINDS, "architecture", "kind");
  const kindDefaults = KIND_DEFAULTS[kind];
  const direction = oneOf<Direction>(
    raw.direction,
    DIRECTIONS,
    kindDefaults.direction,
    "direction",
  );
  // Dark and stage are the defaults; `theme: light` and `skin: classic` are one line away.
  const theme = oneOf<ThemeName>(raw.theme, THEMES, "dark", "theme");
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
  const aspect = aspectOf(layout.aspect);
  if (aspect === null)
    err("DG116", "layout.aspect must be a width:height ratio such as 4:3, 16:9 or 1.5", {
      subject: { where: "layout.aspect", value: layout.aspect },
      fixes: ["use layout: { aspect: 4:3 } for a compact figure, 16:9 for a slide"],
    });
  const arrowhead = oneOf(
    raw.arrowhead,
    ["open", "filled"] as const,
    kindDefaults.arrowhead,
    "arrowhead",
  );
  // Unset: the skin picks (relay for stage, packets for classic).
  const animate =
    raw.animate === undefined
      ? undefined
      : raw.animate === true
        ? "packets"
        : raw.animate === false
          ? "none"
          : oneOf(raw.animate, ANIMATE_MODES, "packets", "animate");
  const skin = oneOf(raw.skin, SKINS, "stage", "skin");
  const background = hexColor(raw.background, "background", "", { where: "background" }, [
    "transparent",
  ]);

  // Which line style means what, drawn as a key under the diagram.
  const legend: LegendEntry[] = [];
  if (raw.legend !== undefined && raw.legend !== null && !isObj(raw.legend)) {
    err("DG107", "legend must be a mapping of line style to meaning", {
      subject: { where: "legend" },
      fixes: ["write legend: { dashed: Asynchronous events, dotted: Replication }"],
    });
  } else if (isObj(raw.legend)) {
    for (const [key, value] of Object.entries(raw.legend)) {
      const line = key.trim().toLowerCase() as EdgeLine;
      const label = str(value)?.trim();
      if (!EDGE_LINES.includes(line)) {
        const near = closest(key, EDGE_LINES);
        const fixes = [near ? `use "${near}"` : `use one of ${EDGE_LINES.join(", ")}`];
        // In a YAML flow mapping {...}, a comma inside an unquoted meaning starts a new key.
        if (value === null) fixes.push("a comma split an unquoted meaning; quote the whole text");
        err("DG107", `legend line style must be one of ${EDGE_LINES.join(", ")}; got "${key}"`, {
          subject: { where: "legend", key },
          fixes,
        });
      } else if (!label) {
        err("DG107", `legend ${line} needs a meaning`, {
          subject: { where: "legend", key },
          fixes: [`write ${line}: Asynchronous events`],
        });
      } else legend.push({ line, label });
    }
  }

  // SVG files the spec registers as local:<name> icons, read relative to the spec's folder.
  const localIcons: LocalIcon[] = [];
  if (raw.icons !== undefined && raw.icons !== null && !isObj(raw.icons)) {
    err("DG111", "icons must be a mapping of a name to an .svg file", {
      subject: { where: "icons" },
      fixes: ["write icons: { brand: ./icons/brand.svg }, then use icon: local:brand"],
    });
  } else if (isObj(raw.icons)) {
    const base = dirname(resolve(filename));
    for (const [name, value] of Object.entries(raw.icons)) {
      const file = str(value)?.trim();
      if (!ICON_NAME.test(name)) {
        err("DG111", `icon name "${name}" may only use lowercase letters, digits and "-"`, {
          subject: { where: "icons", name },
          fixes: [`rename to "${name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}"`],
        });
      } else if (!file || !/\.svg$/i.test(file)) {
        err("DG111", `icon "${name}" must point to an .svg file`, {
          subject: { where: "icons", name },
          fixes: [`write ${name}: ./icons/${name}.svg`],
        });
      } else {
        const path = isAbsolute(file) ? file : resolve(base, file);
        if (!existsSync(path))
          err("DG111", `icon "${name}": ${file} not found`, {
            subject: { where: "icons", name, file },
            fixes: [
              "check the path; it is read relative to the spec's folder",
              `make one with \`orrery icons new ${name}\``,
            ],
          });
        else localIcons.push({ name, path });
      }
    }
  }
  /** A declared local:<name> icon id, or undefined. */
  const localIcon = (value: string): string | undefined => {
    const m = value.trim().match(/^local:([a-z0-9][a-z0-9-]*)$/i);
    const name = m?.[1]?.toLowerCase();
    return name && localIcons.some((i) => i.name === name) ? `local:${name}` : undefined;
  };
  const localFix = (value: string): string[] =>
    /^local:/i.test(value.trim())
      ? [`declare it: icons: { ${value.trim().slice(6)}: ./${value.trim().slice(6)}.svg }`]
      : [];

  // Journey columns, in order.
  const stages: string[] = [];
  if (raw.stages !== undefined && raw.stages !== null) {
    if (!Array.isArray(raw.stages) || raw.stages.some((x) => typeof x !== "string" || !x.trim()))
      err("DG112", "stages must be a list of stage names", {
        subject: { where: "stages" },
        fixes: ["write stages: [Discover, Sign up, Onboard, Use]"],
      });
    else stages.push(...raw.stages.map((x: string) => x.trim()));
  }
  if (kind === "journey" && !stages.length)
    err("DG112", "a journey needs stages: the columns its steps sit in", {
      subject: { where: "stages" },
      fixes: ["add stages: [Discover, Sign up, Onboard, Use]"],
    });

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
  const pendingAlign: [string, string][] = [];

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
          "run `orrery styles` for every group type",
        ],
      });
    }
    const iconValue = pick(g, "icon", GROUP_SYNONYMS);
    let icon: string | null | undefined;
    if (iconValue === false || iconValue === null || iconValue === "none") icon = null;
    else if (typeof iconValue === "string") {
      icon = localIcon(iconValue) ?? resolveIcon(iconValue);
      if (!icon) {
        err("DG101", `group "${id}" uses unknown icon "${iconValue}"`, {
          subject: { group: id, icon: iconValue },
          fixes: [...localFix(iconValue), ...suggestIcons(iconValue).map((s) => `use icon "${s}"`)],
        });
      }
    }
    const color = hexColor(pick(g, "color", GROUP_SYNONYMS), "color", `group "${id}"`, {
      group: id,
    });
    const fill = hexColor(pick(g, "fill", GROUP_SYNONYMS), "fill", `group "${id}"`, { group: id }, [
      "none",
    ]);
    const dashed = pick(g, "dashed", GROUP_SYNONYMS);
    const colsRaw = pick(g, "cols", GROUP_SYNONYMS);
    const cols =
      typeof colsRaw === "number" && Number.isInteger(colsRaw) && colsRaw >= 1 && colsRaw <= 12
        ? colsRaw
        : undefined;
    if (colsRaw !== undefined && cols === undefined)
      err("DG115", `group "${id}" cols must be a whole number from 1 to 12`, {
        subject: { group: id, cols: colsRaw },
        fixes: ["use cols: 2 for a 2 x 2 grid of four children"],
      });
    groups.push({
      id,
      type: style?.key ?? "box",
      label: str(pick(g, "label", GROUP_SYNONYMS)) ?? style?.label ?? (style ? "" : id),
      parent: str(pick(g, "in", GROUP_SYNONYMS)),
      color,
      fill,
      icon,
      dashed: typeof dashed === "boolean" ? dashed : undefined,
      ...(cols ? { cols } : {}),
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
      icon = localIcon(iconRaw) ?? resolveIcon(iconRaw);
      if (!icon) {
        err("DG101", `node "${id}" uses unknown icon "${iconRaw}"`, {
          subject: { node: id, icon: iconRaw },
          fixes: [
            ...localFix(iconRaw),
            ...suggestIcons(iconRaw).map((s) => `use icon "${s}"`),
            `run \`orrery icons search ${iconRaw.split(":").pop()?.replace(/-/g, " ")}\``,
          ],
        });
      }
    }
    const lookRaw = pick(n, "look", NODE_SYNONYMS);
    let look: NodeLook = icon || iconRaw ? defaultLook : "shape";
    if (lookRaw !== undefined) look = oneOf<NodeLook>(lookRaw, LOOKS, look, `node "${id}" look`);
    if ((look === "icon" || look === "card") && !icon && !iconRaw) look = "shape";
    const shapeRaw = pick(n, "shape", NODE_SYNONYMS);
    const shape = oneOf<ShapeKind>(
      typeof shapeRaw === "string"
        ? (SHAPE_SYNONYMS[shapeRaw.toLowerCase()] ?? shapeRaw)
        : shapeRaw,
      SHAPES,
      "rounded",
      `node "${id}" shape`,
    );
    const bpmnRaw = pick(n, "bpmn", NODE_SYNONYMS);
    const bpmn =
      bpmnRaw === undefined
        ? undefined
        : oneOf<BpmnKind>(bpmnRaw, BPMN_KINDS, "task", `node "${id}" bpmn`);
    // A BPMN element is drawn in notation, with any icon small inside it.
    if (bpmn) look = "shape";
    const stage = str(pick(n, "stage", NODE_SYNONYMS))?.trim();
    if (stage !== undefined && !stages.includes(stage)) {
      const near = closest(stage, stages);
      err("DG112", `node "${id}" is in stage "${stage}", which stages does not list`, {
        subject: { node: id, stage },
        fixes: near
          ? [`use stage: ${near}`]
          : stages.length
            ? [`use one of ${stages.join(", ")}`]
            : [`add stages: [${stage}]`],
      });
    }
    if (kind === "journey" && stage === undefined && stages.length)
      err("DG112", `node "${id}" needs a stage: the journey column it sits in`, {
        subject: { node: id },
        fixes: [`add stage: ${stages[0]}`],
      });
    const scoreRaw = pick(n, "score", NODE_SYNONYMS);
    let score: number | undefined;
    if (scoreRaw !== undefined) {
      const v = Number(scoreRaw);
      if (typeof scoreRaw === "boolean" || !Number.isFinite(v) || v < -2 || v > 2)
        err("DG112", `node "${id}" score must be a number from -2 (very negative) to 2`, {
          subject: { node: id },
          fixes: ["use score: 1 for a good step, -2 for a painful one"],
        });
      else score = v;
    }
    if (pick(n, "shape", NODE_SYNONYMS) !== undefined && icon && lookRaw === undefined)
      look = "shape";
    const url = str(pick(n, "url", NODE_SYNONYMS));
    // Links end up in SVG and HTML; only schemes that cannot run code are allowed. Browsers drop
    // tabs and newlines inside a URL ("java<TAB>script:" runs), so control characters are
    // rejected outright and the scheme is read with all whitespace removed.
    if (url && hasControlChar(url)) {
      err("DG107", `node "${id}" url must not contain control characters (tab, newline ...)`, {
        subject: { node: id, url },
        fixes: ["use an https:// link on one line, without tabs or line breaks"],
      });
    } else if (url) {
      const bare = url.replace(/\s/g, "");
      if (/^[a-z][a-z0-9+.-]*:/i.test(bare) && !/^(https?|mailto):/i.test(bare)) {
        err("DG107", `node "${id}" url must be http(s), mailto or a relative path`, {
          subject: { node: id, url },
          fixes: ["use an https:// link"],
        });
      }
    }
    const color = hexColor(pick(n, "color", NODE_SYNONYMS), "color", `node "${id}"`, { node: id });
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
    // Events, gateways and the UML initial and final states are often unnamed; everything else
    // falls back to its id.
    const label =
      str(pick(n, "label", NODE_SYNONYMS)) ??
      ((bpmn && (isBpmnEvent(bpmn) || isBpmnGateway(bpmn))) ||
      (!bpmn && (shape === "initial" || shape === "final"))
        ? ""
        : undefined) ??
      (icon ? iconInfo(icon)?.name : undefined) ??
      id;
    const rankRaw = pick(n, "rank", NODE_SYNONYMS);
    const rank =
      rankRaw === "first" || rankRaw === "last"
        ? rankRaw
        : typeof rankRaw === "number" && Number.isInteger(rankRaw) && rankRaw >= 1
          ? rankRaw
          : undefined;
    if (rankRaw !== undefined && rank === undefined)
      err("DG114", `node "${id}" rank must be first, last or a layer number from 1`, {
        subject: { node: id, rank: rankRaw },
        fixes: ["use rank: first to start the flow here, rank: last to end it"],
      });
    const align = str(pick(n, "align", NODE_SYNONYMS));
    if (align !== undefined) pendingAlign.push([id, align]);
    if (align !== undefined && rank !== undefined)
      err("DG114", `node "${id}" uses both rank and align`, {
        subject: { node: id },
        fixes: [`keep align: ${align} to share that node's layer, or rank: ${rank}, not both`],
      });
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
      ...(bpmn ? { bpmn } : {}),
      ...(stage !== undefined ? { stage } : {}),
      ...(score !== undefined ? { score } : {}),
      ...(rank !== undefined ? { rank } : {}),
      ...(align !== undefined ? { align } : {}),
    });
  }

  // `align` names another node: the two share one layer of the flow.
  for (const [id, target] of pendingAlign) {
    if (target === id)
      err("DG114", `node "${id}" aligns with itself`, {
        subject: { node: id },
        fixes: ["name another node: align: <id>"],
      });
    else if (ids.get(target) !== "node")
      err("DG114", `node "${id}" aligns with "${target}", which is not a node`, {
        subject: { node: id, align: target },
        fixes: suggestIds(target, ids, "node").map((x) => `use align: ${x}`),
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
    const flowRaw = pick(extra, "flow", EDGE_SYNONYMS);
    const flow =
      flowRaw === undefined
        ? undefined
        : oneOf<EdgeFlow>(flowRaw, EDGE_FLOWS, "sequence", `${where} flow`);
    // BPMN draws message flows dashed and associations dotted with no arrowhead.
    const flowLine: EdgeLine | undefined =
      flow === "message" ? "dashed" : flow === "association" ? "dotted" : undefined;
    const color = hexColor(pick(extra, "color", EDGE_SYNONYMS), "color", where, { edge: where });
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
          : (flowLine ?? op.line),
      arrow:
        arrowRaw !== undefined
          ? oneOf<ArrowMode>(arrowRaw, ARROWS, "end", `${where} arrow`)
          : flow === "association"
            ? "none"
            : reverse
              ? "end"
              : op.arrow,
      color,
      step: step !== undefined && Number.isInteger(step) ? step : undefined,
      constraint: pick(extra, "constraint", EDGE_SYNONYMS) !== false,
      ...(flow && flow !== "sequence" ? { flow } : {}),
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

  // The path the stage story takes: node ids in order, each hop along an edge.
  const story: string[] = [];
  if (raw.story !== undefined && raw.story !== null) {
    if (!Array.isArray(raw.story) || raw.story.length < 2) {
      err(
        "DG113",
        "story must be a list of at least two node ids, in the order the story visits them",
        {
          subject: { where: "story" },
          fixes: ["write story: [customer, order, payment, shipping]"],
        },
      );
    } else {
      for (const item of raw.story.map(String)) {
        if (ids.get(item) !== "node")
          err("DG113", `story visits "${item}", which is not a node`, {
            subject: { where: "story", id: item },
            fixes: suggestIds(item, ids, "node").map((x) => `use "${x}"`),
          });
        else story.push(item);
      }
      for (let i = 1; i < story.length; i++) {
        const a = story[i - 1];
        const b = story[i];
        if (!edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)))
          warn("DG113", `story goes from "${a}" to "${b}", which no edge connects`, {
            subject: { where: "story", from: a, to: b },
            fixes: [`add an edge ${a} -> ${b}, or drop one of them from story`],
          });
      }
    }
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
    ...(aspect ? { aspect } : {}),
    arrowhead,
    ...(animate ? { animate } : {}),
    skin,
    background: background === "transparent" ? "transparent" : background,
    ...(legend.length ? { legend } : {}),
    nodes,
    groups,
    edges,
    kind,
    ...(stages.length ? { stages } : {}),
    ...(story.length ? { story } : {}),
    ...(localIcons.length ? { icons: localIcons } : {}),
  };
  return { model, diagnostics };
}

/** layout.aspect as width / height: undefined when unset, null when it cannot be read. */
function aspectOf(value: unknown): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  let ratio = Number.NaN;
  if (typeof value === "number") ratio = value;
  else if (typeof value === "string") {
    const m = /^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
    ratio = m ? Number(m[1]) / Number(m[2]) : Number(value);
  }
  return Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4 ? ratio : null;
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
