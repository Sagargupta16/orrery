// Mermaid flowchart -> orrery spec (YAML text). Keeps the topology, labels, subgraphs, edge
// styles and shapes; guesses an official icon only when a label names a product exactly.
import { stringify } from "yaml";
import { iconInfo, searchIcons } from "../icons/index.ts";
import type { ShapeKind } from "../types.ts";

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

export interface MermaidResult {
  yaml: string;
  warnings: string[];
  guessed: Record<string, string>;
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

const ID = "[A-Za-z0-9_][A-Za-z0-9_.-]*";

// A leading "---" ... "---" block: Mermaid frontmatter (title, config:, nested YAML).
const FRONTMATTER = /^\s*---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

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

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
    return t.slice(1, -1);
  return t;
}

function cleanLabel(s: string): string {
  // Strip tags until none are left ("<scr<b>ipt>" must not collapse into "<script>"), then any
  // stray angle bracket.
  let text = unquote(s).replace(/<br\s*\/?>/gi, " ");
  for (let prev = ""; prev !== text; ) {
    prev = text;
    text = text.replace(/<[^<>]*>/g, "");
  }
  return text
    .replace(/[<>]/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits "A[Label] & B(Other)" into node references, registering shapes and labels. */
function readNodes(chunk: string, nodes: Map<string, MNode>, parent: string | undefined): string[] {
  const ids: string[] = [];
  for (const part of chunk.split(/\s+&\s+/)) {
    const text = part.trim();
    if (!text) continue;
    const m = text.match(new RegExp(`^(${ID})(.*)$`));
    if (!m) continue;
    const id = m[1] ?? "";
    const rest = (m[2] ?? "").trim().replace(/:::\w+$/, "");
    let label: string | undefined;
    let shape: ShapeKind | undefined;
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
    const existing = nodes.get(id);
    if (existing) {
      if (label) existing.label = label;
      if (shape) existing.shape = shape;
    } else nodes.set(id, { id, label: label ?? id, shape, parent });
    ids.push(id);
  }
  return ids;
}

// Edge operators: --> --- -.-> -.- ==> === <--> --o --x, with optional |label| or -- label -->.
const EDGE_RE =
  /\s+--\s+([^-][^>]*?)\s+-->\s+|\s+==\s+([^=][^>]*?)\s+==>\s+|\s+-\.\s+([^.][^>]*?)\s+\.->\s+|\s*(<)?(-{2,}|={2,}|-\.+-|-\.+)(>|o|x)?(?:\|([^|]*)\|)?\s*/g;

export function importMermaid(source: string): MermaidResult {
  const warnings: string[] = [];
  const nodes = new Map<string, MNode>();
  const groups: MGroup[] = [];
  const edges: MEdge[] = [];
  const stack: string[] = [];
  let direction = "right";
  let title: string | undefined;

  const front = source.match(FRONTMATTER);
  if (front) {
    const frontTitle = (front[1] ?? "").match(/^title:[ \t]*(.+)$/m);
    if (frontTitle) title = cleanLabel(frontTitle[1] ?? "");
  }

  const lines = (front ? source.slice(front[0].length) : source)
    .replace(/%%.*$/gm, "")
    .split(/\r?\n/)
    .flatMap(splitStatements)
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines.find((l) => l !== "---" && !/^title:/.test(l)) ?? "";
  if (!/^(flowchart|graph)\b/i.test(first)) {
    const kind = first.split(/\s/)[0] || "empty input";
    warnings.push(`only flowchart and graph diagrams can be imported; this is ${kind}`);
    lines.length = 0;
  }
  for (const line of lines) {
    const head = line.match(/^(flowchart|graph)\s*(LR|RL|TB|TD|BT)?/i);
    if (head) {
      direction = DIRECTIONS[(head[2] ?? "TB").toUpperCase()] ?? "down";
      continue;
    }
    if (/^---$/.test(line)) continue;
    const titleLine = line.match(/^title:\s*(.+)$/);
    if (titleLine) {
      title = cleanLabel(titleLine[1] ?? "");
      continue;
    }
    if (/^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/.test(line))
      continue;
    const sub = line.match(/^subgraph\s+(.+)$/);
    if (sub) {
      const rest = (sub[1] ?? "").trim();
      const withLabel = rest.match(new RegExp(`^(${ID})\\s*\\[(.+)\\]$`));
      const bareId = new RegExp(`^${ID}$`).test(rest);
      const id = withLabel?.[1] ?? (bareId ? rest : `group-${groups.length + 1}`);
      const label = cleanLabel(withLabel?.[2] ?? rest);
      groups.push({ id, label, parent: stack[stack.length - 1] });
      stack.push(id);
      continue;
    }
    if (line === "end") {
      stack.pop();
      continue;
    }
    const parent = stack[stack.length - 1];
    // Split the line into node chunks and operators.
    const parts: (string | MEdge)[] = [];
    let last = 0;
    for (const m of line.matchAll(EDGE_RE)) {
      parts.push(line.slice(last, m.index));
      const [, l1, l2, l3, lt, body = "", head2, pipeLabel] = m;
      const text = pipeLabel ?? l1 ?? l2 ?? l3;
      let lineStyle: MEdge["line"] = "solid";
      if (l2 !== undefined || body.startsWith("=")) lineStyle = "thick";
      else if (l3 !== undefined || body.includes(".")) lineStyle = "dotted";
      const hasHead = head2 === ">" || l1 !== undefined || l2 !== undefined || l3 !== undefined;
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
      readNodes(line, nodes, parent);
      continue;
    }
    for (let i = 0; i + 2 < parts.length; i += 2) {
      const a = parts[i];
      const op = parts[i + 1];
      const b = parts[i + 2];
      if (typeof a !== "string" || typeof b !== "string" || typeof op === "string" || !op) continue;
      const froms = readNodes(a, nodes, parent);
      const tos = readNodes(b, nodes, parent);
      for (const f of froms) for (const t of tos) edges.push({ ...op, from: f, to: t });
    }
  }

  // Nodes first mentioned inside a subgraph belong to it.
  const groupIds = new Set(groups.map((g) => g.id));
  const guessed: Record<string, string> = {};
  const specNodes: Record<string, Record<string, unknown>> = {};
  for (const n of nodes.values()) {
    if (groupIds.has(n.id)) continue;
    const entry: Record<string, unknown> = {};
    const icon = guessIcon(n.label);
    if (icon) {
      guessed[n.id] = icon;
      entry.icon = icon;
      entry.label = n.label;
    } else {
      entry.label = n.label;
      entry.shape = n.shape ?? "rounded";
    }
    if (n.parent) entry.in = n.parent;
    specNodes[n.id] = entry;
  }
  const specGroups: Record<string, Record<string, unknown>> = {};
  for (const g of groups) {
    specGroups[g.id] = { type: "zone", label: g.label, ...(g.parent ? { in: g.parent } : {}) };
  }
  const specEdges = edges.map((e) => {
    const op = { solid: "->", dashed: "-->", dotted: "..>", thick: "==>" }[e.line];
    const arrow =
      e.arrow === "both"
        ? `<${op}`
        : e.arrow === "none"
          ? { solid: "--", dashed: "---", dotted: "...", thick: "===" }[e.line]
          : op;
    return `${e.from} ${arrow} ${e.to}${e.label ? `: ${e.label}` : ""}`;
  });
  if (!nodes.size)
    warnings.push("no flowchart nodes found; only flowchart/graph diagrams are supported");

  const doc: Record<string, unknown> = {};
  if (title) doc.title = title;
  doc.direction = direction;
  if (groups.length) doc.groups = specGroups;
  doc.nodes = specNodes;
  doc.edges = specEdges;
  const header = [
    "# yaml-language-server: $schema=https://raw.githubusercontent.com/Sagargupta16/orrery/main/skills/orrery/references/diagram.schema.json",
    "# Imported from Mermaid by orrery. Replace shapes with official icons (orrery icons search <words>),",
    "# turn zones into vendor groups (aws:vpc, gcp:project, azure:vnet...) and run orrery validate.",
  ];
  if (Object.keys(guessed).length) {
    header.push(
      `# Icons guessed from exact names, check them: ${Object.entries(guessed)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
  }
  return { yaml: `${header.join("\n")}\n${stringify(doc, { lineWidth: 0 })}`, warnings, guessed };
}

/** An icon only when the label is exactly a product's name or alias, never a fuzzy hit. */
function guessIcon(label: string): string | undefined {
  const collapsed = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (collapsed.length < 3) return undefined;
  const [top] = searchIcons(label, { limit: 1 });
  if (!top || (top.type !== "service" && top.type !== "logo")) return undefined;
  const names = [
    top.slug,
    top.name,
    top.name.replace(/^(aws|amazon|azure|microsoft|google|cloud)\s+/i, ""),
  ].map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (!names.includes(collapsed.replace(/icon$/, "")) && !names.includes(collapsed)) {
    // "logos:kafka-icon" is named "Kafka"; its slug carries the -icon suffix.
    if (!names.some((n) => n === `${collapsed}icon`)) return undefined;
  }
  return iconInfo(top.id)?.id;
}
