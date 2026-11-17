// Mermaid -> orrery spec (YAML text). importMermaid reads the diagram type from the first
// keyword: a flowchart keeps its topology, labels, subgraphs, edge styles and shapes and guesses an
// official icon only when a label names a product exactly; sequenceDiagram, erDiagram,
// stateDiagram and gantt go to their own readers (mermaid-sequence.ts, mermaid-er.ts,
// mermaid-state.ts, mermaid-gantt.ts), which write the sequence, er, state and timeline kinds.
import { parse } from "yaml";
import { allIcons, iconInfo, searchIcons } from "../icons/index.ts";
import type { ShapeKind } from "../types.ts";
import { importEr } from "./mermaid-er.ts";
import { importGantt } from "./mermaid-gantt.ts";
import { importSequence } from "./mermaid-sequence.ts";
import { importState } from "./mermaid-state.ts";
import {
  cleanLabel,
  frontmatter,
  type MermaidResult,
  specIds,
  statements,
  writeSpec,
} from "./mermaid-text.ts";

export type { MermaidResult } from "./mermaid-text.ts";

interface MNode {
  id: string;
  label: string;
  shape?: ShapeKind;
  parent?: string;
}

interface MGroup {
  id: string;
  label: string;
  parent?: string;
}

interface MEdge {
  from: string;
  to: string;
  label?: string;
  line: "solid" | "dashed" | "dotted" | "thick";
  arrow: "end" | "both" | "none";
}

const DIRECTIONS: Record<string, string> = {
  LR: "right",
  RL: "left",
  TB: "down",
  TD: "down",
  BT: "up",
};

// Bracket pairs, longest first: [( )] cylinder, (( )) circle, {{ }} hexagon, [/ /] and others.
const SHAPES: [string, string, ShapeKind][] = [
  ["(((", ")))", "circle"],
  ["([", "])", "pill"],
  ["[[", "]]", "box"],
  ["[(", ")]", "cylinder"],
  ["((", "))", "circle"],
  ["{{", "}}", "hexagon"],
  ["[/", "/]", "box"],
  ["[\\", "\\]", "box"],
  ["[/", "\\]", "box"],
  ["[\\", "/]", "box"],
  ["[", "]", "box"],
  ["(", ")", "rounded"],
  ["{", "}", "diamond"],
  [">", "]", "note"],
];

// Mermaid 11's `id@{ shape: ... }` names, mapped as the bracket form of the same shape is; the
// shapes with no bracket form take the closest orrery shape.
const NAMED_SHAPES: Record<string, ShapeKind> = {};
for (const [kind, names] of [
  ["box", "rect rectangle process proc fr-rect subprocess subproc subroutine framed-rectangle"],
  ["box", "lean-r lean-right in-out lean-l lean-left out-in trap-b trapezoid-bottom priority"],
  ["box", "trap-t trapezoid-top manual notch-rect card notched-rectangle lin-rect lined-rectangle"],
  ["box", "lined-process shaded-process div-rect div-proc divided-rectangle divided-process"],
  ["box", "win-pane internal-storage window-pane sl-rect manual-input sloped-rectangle"],
  ["box", "tag-rect tag-proc tagged-rectangle tagged-process notch-pent loop-limit"],
  ["box", "notched-pentagon curv-trap curved-trapezoid display bow-rect stored-data"],
  ["box", "bow-tie-rectangle text flag paper-tape"],
  ["rounded", "rounded event"],
  ["pill", "stadium pill terminal"],
  ["cylinder", "cyl cylinder database db das h-cyl horizontal-cylinder lin-cyl disk"],
  ["cylinder", "lined-cylinder"],
  ["circle", "circle circ start sm-circ small-circle dbl-circ double-circle stop"],
  ["circle", "fr-circ framed-circle f-circ filled-circle junction cross-circ crossed-circle"],
  ["circle", "summary"],
  ["diamond", "diam diamond decision question"],
  ["hexagon", "hex hexagon prepare"],
  ["note", "odd asymmetric"],
  ["document", "doc document lin-doc lined-document tag-doc tagged-document"],
  ["stack", "docs documents st-doc stacked-document st-rect stacked-rectangle multi-process"],
  ["delay", "delay half-rounded-rectangle"],
] as const)
  for (const name of names.split(" ")) NAMED_SHAPES[name] = kind;

// Any letter or digit, as Mermaid reads ids; the spec gets an ASCII slug of the ones it rejects.
const ID = "[\\p{L}\\p{N}_][\\p{L}\\p{N}_.-]*";
const NODE = new RegExp(`^(${ID})(.*)$`, "u");
const SUBGRAPH = new RegExp(`^(${ID}) ?\\[(.+)\\]$`, "u");
const BARE_ID = new RegExp(`^${ID}$`, "u");

/** Splits a line into statements on ";" that sit outside quotes, brackets and |edge text|. */
function splitStatements(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  // Inside |...| edge text; a "|" within brackets belongs to the node text, not an edge.
  let piped = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted) {
      if (piped) piped = c !== "|";
      else if (c === "|" && depth === 0) piped = true;
      else if (c === "[" || c === "(" || c === "{") depth += 1;
      else if (c === "]" || c === ")" || c === "}") depth = Math.max(0, depth - 1);
      else if (c === ";" && depth === 0) {
        out.push(line.slice(start, i));
        start = i + 1;
      }
    }
  }
  out.push(line.slice(start));
  return out;
}

/**
 * The line with node text (inside brackets and quotes) blanked to "x", same length, so an arrow
 * written inside a label ("deploy --> prod") is not read as an edge. |edge text| stays.
 */
function maskNodeText(line: string): string {
  let out = "";
  let depth = 0;
  let quoted = false;
  let piped = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? "";
    if (piped) {
      piped = c !== "|";
      out += c;
      continue;
    }
    const bracket = !quoted && /[[\](){}]/.test(c);
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === "|" && depth === 0) piped = true;
    else if (bracket) depth = /[[({]/.test(c) ? depth + 1 : Math.max(0, depth - 1);
    out += c === '"' || quoted || (depth > 0 && !bracket) ? "x" : c;
  }
  return out;
}

/**
 * Splits "A[Label] & B(Other)" into node references, registering shapes and labels; `mentioned`
 * collects them for the innermost open subgraph.
 */
function readNodes(
  chunk: string,
  nodes: Map<string, MNode>,
  warnings: Set<string>,
  mentioned?: Set<string>,
): string[] {
  const ids: string[] = [];
  // "&" between nodes, found on the masked chunk so one inside a label ("R&D") stays text.
  const masked = maskNodeText(chunk);
  const parts: string[] = [];
  let start = 0;
  for (let i = masked.indexOf("&"); i >= 0; i = masked.indexOf("&", i + 1)) {
    parts.push(chunk.slice(start, i));
    start = i + 1;
  }
  parts.push(chunk.slice(start));
  for (const part of parts) {
    const text = part.trim();
    if (!text) continue;
    const m = text.match(NODE);
    if (!m) continue;
    const id = m[1] ?? "";
    const rest = (m[2] ?? "").trim().replace(/:::\w+$/, "");
    let label: string | undefined;
    let shape: ShapeKind | undefined;
    if (rest.startsWith("@{") && rest.endsWith("}")) {
      ({ label, shape } = shapeData(rest.slice(1), warnings));
    } else {
      for (const [open, close, kind] of SHAPES) {
        if (
          rest.startsWith(open) &&
          rest.endsWith(close) &&
          rest.length >= open.length + close.length
        ) {
          label = cleanLabel(rest.slice(open.length, rest.length - close.length));
          shape = kind;
          break;
        }
      }
    }
    const existing = nodes.get(id);
    if (existing) {
      if (label) existing.label = label;
      if (shape) existing.shape = shape;
    } else nodes.set(id, { id, label: label ?? id, shape });
    mentioned?.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Mermaid 11's shape data, `{ shape: cyl, label: "Database" }` (a YAML mapping, as Mermaid reads
 * it): the label and the shape, mapped like the bracket shapes. Other keys (icon, img, pos) have
 * no flowchart meaning here.
 */
function shapeData(text: string, warnings: Set<string>): { label?: string; shape?: ShapeKind } {
  let data: unknown;
  try {
    data = parse(text);
  } catch {
    warnings.add(`could not read the shape data ${text.slice(0, 40)}; the node keeps its id`);
    return {};
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const { label, shape } = data as Record<string, unknown>;
  const name = typeof shape === "string" ? shape.trim().toLowerCase() : undefined;
  const kind = name && Object.hasOwn(NAMED_SHAPES, name) ? NAMED_SHAPES[name] : undefined;
  if (name && !kind) warnings.add(`shape "${name}" has no orrery shape; drawn rounded`);
  const labelText = typeof label === "string" || typeof label === "number" ? String(label) : "";
  return { label: cleanLabel(labelText) || undefined, shape: kind };
}

// Edge operators: --> --- -.-> -.- ==> === <--> --o --x, with optional |label|, or text inside
// the link: -- text --> (or ---), == text ==> (or ===), -. text .-> (or .-), spaces around it
// optional. Read on the line with its node text blanked (maskNodeText); `d` gives each part's
// place, so the text itself comes from the line as written. Lines arrive with whitespace runs
// collapsed, and link text never runs past the next operator of its own kind (Mermaid's text
// cannot hold one either), so every match attempt stops early and a line reads in linear time.
const EDGE_RE =
  /--\s+(?<solid>[^-\s](?:[^->]|-(?!-))*?)\s+-{2,}(?<solidHead>>)?|==\s+(?<thick>[^=\s](?:[^=>]|=(?!=))*?)\s+={2,}(?<thickHead>>)?|-\.\s+(?<dotted>[^.\s](?:[^.>-]|\.(?!-)|-(?!\.))*?)\s+\.-(?<dottedHead>>)?|(?<back><)?(?<body>-{2,}|={2,}|-\.+-|-\.+)(?<head>>|o|x)?(?:\|(?<pipe>[^|]*)\|)?/dg;

/**
 * The diagram is read by its first keyword: flowchart and graph here, the sequence, er, state and
 * gantt types by their own readers. Any other type gives a spec with no nodes and a warning, so
 * `orrery import` stops with "nothing to draw".
 */
export function importMermaid(source: string): MermaidResult {
  const { title, body } = frontmatter(source);
  const first = statements(body, (l) => [l]).find((l) => l !== "---" && !/^title:/.test(l)) ?? "";
  if (/^(flowchart|graph)\b/i.test(first)) return importFlowchart(body, title);
  if (/^sequenceDiagram\b/i.test(first)) return importSequence(body, title);
  if (/^erDiagram\b/i.test(first)) return importEr(body, title);
  if (/^stateDiagram(-v2)?\b/i.test(first)) return importState(body, title);
  if (/^gantt\b/i.test(first)) return importGantt(body, title);
  const kind = first.split(" ")[0] || "empty input";
  return {
    yaml: writeSpec({ ...(title ? { title } : {}), nodes: {}, edges: [] }, []),
    warnings: [
      `only flowchart, graph, sequenceDiagram, erDiagram, stateDiagram and gantt diagrams can be imported; this is ${kind}`,
    ],
    guessed: {},
  };
}

function importFlowchart(body: string, frontTitle?: string): MermaidResult {
  const warnings = new Set<string>();
  const nodes = new Map<string, MNode>();
  const groups: MGroup[] = [];
  const edges: MEdge[] = [];
  const stack: string[] = [];
  // The nodes each open subgraph's body mentions, edge ends included.
  const mentions: Set<string>[] = [];
  /**
   * Closes the innermost subgraph: every node it mentions that no subgraph holds yet is its own,
   * as Mermaid draws it (inner subgraphs close first, an earlier subgraph keeps what it holds).
   */
  const close = () => {
    const id = stack.pop();
    for (const n of mentions.pop() ?? []) {
      const node = nodes.get(n);
      if (id && node && !node.parent) node.parent = id;
    }
  };
  let direction = "right";
  let title = frontTitle;

  for (const line of statements(body, splitStatements)) {
    const head = line.match(/^(flowchart|graph) ?(LR|RL|TB|TD|BT)?/i);
    if (head) {
      direction = DIRECTIONS[(head[2] ?? "TB").toUpperCase()] ?? "down";
      continue;
    }
    if (/^---$/.test(line)) continue;
    const titleLine = line.match(/^title: ?(.+)$/);
    if (titleLine) {
      title = cleanLabel(titleLine[1] ?? "");
      continue;
    }
    if (/^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/.test(line))
      continue;
    const sub = line.match(/^subgraph (.+)$/);
    if (sub) {
      const rest = (sub[1] ?? "").trim();
      const withLabel = rest.match(SUBGRAPH);
      const id = withLabel?.[1] ?? (BARE_ID.test(rest) ? rest : `group-${groups.length + 1}`);
      const label = cleanLabel(withLabel?.[2] ?? rest);
      groups.push({ id, label, parent: stack[stack.length - 1] });
      stack.push(id);
      mentions.push(new Set());
      continue;
    }
    if (line === "end") {
      close();
      continue;
    }
    const mentioned = mentions[mentions.length - 1];
    // Split the line into node chunks and operators.
    const parts: (string | MEdge)[] = [];
    let last = 0;
    for (const m of maskNodeText(line).matchAll(EDGE_RE)) {
      parts.push(line.slice(last, m.index));
      const at = (name: string) => {
        const range = m.indices?.groups?.[name];
        return range ? line.slice(range[0], range[1]) : undefined;
      };
      const [solid, thick, dotted] = [at("solid"), at("thick"), at("dotted")];
      const body = at("body") ?? "";
      const text = at("pipe") ?? solid ?? thick ?? dotted;
      let lineStyle: MEdge["line"] = "solid";
      if (thick !== undefined || body.startsWith("=")) lineStyle = "thick";
      else if (dotted !== undefined || body.includes(".")) lineStyle = "dotted";
      const hasHead =
        at("head") === ">" ||
        at("solidHead") !== undefined ||
        at("thickHead") !== undefined ||
        at("dottedHead") !== undefined;
      const lt = at("back");
      parts.push({
        from: "",
        to: "",
        label: text ? cleanLabel(text) : undefined,
        line: lineStyle,
        arrow: lt && hasHead ? "both" : hasHead ? "end" : "none",
      });
      last = (m.index ?? 0) + m[0].length;
    }
    parts.push(line.slice(last));
    if (parts.length === 1) {
      readNodes(line, nodes, warnings, mentioned);
      continue;
    }
    for (let i = 0; i + 2 < parts.length; i += 2) {
      const a = parts[i];
      const op = parts[i + 1];
      const b = parts[i + 2];
      if (typeof a !== "string" || typeof b !== "string" || typeof op === "string" || !op) continue;
      const froms = readNodes(a, nodes, warnings, mentioned);
      const tos = readNodes(b, nodes, warnings, mentioned);
      for (const f of froms) for (const t of tos) edges.push({ ...op, from: f, to: t });
    }
  }
  while (stack.length) close();

  // Mermaid takes any letter in an id ("é", "日本"); the spec gets an ASCII slug, the label keeps
  // the text.
  const ids = specIds([...groups.map((g) => g.id), ...nodes.keys()]);
  const sid = (id: string) => ids.get(id) ?? id;
  const groupIds = new Set(groups.map((g) => g.id));
  const guessed: Record<string, string> = {};
  const guesses = new Map<string, string | undefined>();
  const specNodes: Record<string, Record<string, unknown>> = {};
  for (const n of nodes.values()) {
    if (groupIds.has(n.id)) continue;
    const entry: Record<string, unknown> = {};
    const icon = guessIcon(n.label, guesses);
    if (icon) {
      guessed[sid(n.id)] = icon;
      entry.icon = icon;
      entry.label = n.label;
    } else {
      entry.label = n.label;
      entry.shape = n.shape ?? "rounded";
    }
    if (n.parent) entry.in = sid(n.parent);
    specNodes[sid(n.id)] = entry;
  }
  const specGroups: Record<string, Record<string, unknown>> = {};
  for (const g of groups) {
    specGroups[sid(g.id)] = {
      type: "zone",
      label: g.label,
      ...(g.parent ? { in: sid(g.parent) } : {}),
    };
  }
  const specEdges = edges.map((e) => {
    const op = { solid: "->", dashed: "-->", dotted: "..>", thick: "==>" }[e.line];
    const arrow =
      e.arrow === "both"
        ? `<${op}`
        : e.arrow === "none"
          ? { solid: "--", dashed: "---", dotted: "...", thick: "===" }[e.line]
          : op;
    return `${sid(e.from)} ${arrow} ${sid(e.to)}${e.label ? `: ${e.label}` : ""}`;
  });
  if (!nodes.size) warnings.add("no flowchart nodes found");

  const doc: Record<string, unknown> = {};
  if (title) doc.title = title;
  doc.direction = direction;
  if (groups.length) doc.groups = specGroups;
  doc.nodes = specNodes;
  doc.edges = specEdges;
  const notes = [
    "Imported from Mermaid by orrery. Replace shapes with official icons (orrery icons search <words>),",
    "turn zones into vendor groups (aws:vpc, gcp:project, azure:vnet...) and run orrery validate.",
  ];
  if (Object.keys(guessed).length) {
    notes.push(
      `Icons guessed from exact names, check them: ${Object.entries(guessed)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
  }
  return { yaml: writeSpec(doc, notes), warnings: [...warnings], guessed };
}

const collapse = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const VENDOR_PREFIX = /^(aws|amazon|azure|microsoft|google|cloud)\s+/i;

/** Every name a service or logo icon goes by, collapsed: the only labels a guess can accept. */
let productNames: Set<string> | undefined;

/**
 * An icon only when the label is exactly a product's name or alias, never a fuzzy hit. The search
 * scores the whole catalog, so it runs only for a label that some icon is named exactly (any other
 * label could never be accepted), and once per label.
 */
function guessIcon(label: string, cache: Map<string, string | undefined>): string | undefined {
  const collapsed = collapse(label);
  if (collapsed.length < 3) return undefined;
  if (!productNames) {
    productNames = new Set();
    for (const i of allIcons()) {
      if (i.type !== "service" && i.type !== "logo") continue;
      for (const n of [i.slug, i.name, i.name.replace(VENDOR_PREFIX, "")])
        productNames.add(collapse(n));
    }
  }
  const named = productNames;
  if (![collapsed, collapsed.replace(/icon$/, ""), `${collapsed}icon`].some((n) => named.has(n)))
    return undefined;
  if (!cache.has(label)) cache.set(label, searchGuess(label, collapsed));
  return cache.get(label);
}

function searchGuess(label: string, collapsed: string): string | undefined {
  const [top] = searchIcons(label, { limit: 1 });
  if (!top || (top.type !== "service" && top.type !== "logo")) return undefined;
  const names = [top.slug, top.name, top.name.replace(VENDOR_PREFIX, "")].map(collapse);
  if (!names.includes(collapsed.replace(/icon$/, "")) && !names.includes(collapsed)) {
    // "logos:kafka-icon" is named "Kafka"; its slug carries the -icon suffix.
    if (!names.some((n) => n === `${collapsed}icon`)) return undefined;
  }
  return iconInfo(top.id)?.id;
}
