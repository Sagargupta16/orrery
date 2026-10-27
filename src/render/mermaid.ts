// Mermaid text for the same diagram, in the syntax Mermaid draws natively: architecture-beta for
// architectures (groups, services named after the logos icon pack, edges on the sides the layout
// drew them), stateDiagram-v2, mindmap and journey for those kinds, erDiagram, sequenceDiagram
// and gantt from their own modules, and a flowchart for the rest.
import { iconInfo, resolveIcon } from "../icons/index.ts";
import type {
  ArrowMode,
  Box,
  Direction,
  EdgeLine,
  Model,
  ModelEdge,
  ModelGroup,
  ModelNode,
  Scene,
  ShapeKind,
} from "../types.ts";
import { isBpmnEvent, isBpmnGateway } from "../types.ts";
import { erMermaid } from "./mermaid-er.ts";
import { sequenceMermaid } from "./mermaid-sequence.ts";
import { timelineMermaid } from "./mermaid-timeline.ts";

export function renderMermaid(model: Model, scene: Scene): string {
  // The kinds whose Mermaid text comes from their own module (looked up here, not in a table at
  // load time, so a module that imports this one back never meets an uninitialized binding).
  const own =
    model.kind === "er"
      ? erMermaid
      : model.kind === "sequence"
        ? sequenceMermaid
        : model.kind === "timeline"
          ? timelineMermaid
          : undefined;
  if (own) {
    const text = own(model);
    return text.endsWith("\n") ? text : `${text}\n`;
  }
  const lines =
    model.kind === "architecture"
      ? architecture(model, scene)
      : model.kind === "state"
        ? stateDiagram(model)
        : model.kind === "journey"
          ? journey(model)
          : ((model.kind === "mindmap" ? mindmap(model) : undefined) ?? flowchart(model));
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------- text

/** Characters a quoted label would read as syntax or markup. */
const QUOTED = /[#"&<>`|\\]/g;
/** Characters unquoted text that runs to the end of the line would read as syntax. */
const LINE_END = /[#;:%&<>"\\]/g;
/** Characters a title or description line would read as syntax; colons are its own text there. */
const PROSE = /[#;%&<>\\]/g;

/** Mermaid's entity codes (`#35;` for `#`), which every diagram type but architecture decodes. */
const code = (s: string, chars: RegExp) => s.replace(chars, (c) => `#${c.codePointAt(0)};`);
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** A label for a quoted string: each written line break becomes `<br/>`. */
const label = (s: string) =>
  s
    .split(/\r?\n/)
    .map((line) => code(flat(line), QUOTED))
    .filter(Boolean)
    .join("<br/>") || " ";

/**
 * A title in an architecture `[...]`: quoted, on one line, and written as it reads (architecture
 * shows entity codes as typed), with its quotes escaped. Mermaid reads it as Markdown, so a
 * backtick (a pair would be code) is a lookalike, and a backslash before punctuation (an escape)
 * or the closing quote gets a zero-width space after it.
 */
const title = (s: string) => {
  const text = flat(s)
    .replace(/`/g, "\u02cb")
    .replace(/\\(?=[!-/:-@[-`{-~]|$)/g, "\\\u200b")
    .replace(/"/g, '\\"');
  return `["${text || " "}"]`;
};

const lineEnd = (s: string) => code(flat(s), LINE_END);

function heading(model: Model): string[] {
  return model.title ? ["---", `title: ${JSON.stringify(flat(model.title))}`, "---"] : [];
}

const description = (model: Model) =>
  model.subtitle ? [`  accDescr: ${code(flat(model.subtitle), PROSE)}`] : [];

// ---------------------------------------------------------------- ids

/** Words a statement could start with or read as a keyword in one of the diagram types. */
const RESERVED = new Set(
  "accdescr acctitle align as call class classdef click default direction end flowchart graph group in junction linkstyle note root section service state style subgraph title".split(
    " ",
  ),
);

/** Mermaid ids for orrery ids: word characters only, never a keyword, never repeated. */
function idMap(ids: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const id of ids) {
    let base = id.replace(/\W+/g, "_").replace(/^_+|_+$/g, "") || "n";
    if (/^\d/.test(base) || RESERVED.has(base.toLowerCase())) base = `n_${base}`;
    let unique = base;
    for (let i = 2; used.has(unique); i++) unique = `${base}_${i}`;
    used.add(unique);
    out.set(id, unique);
  }
  return out;
}

/** Groups that hold their members (overlays only draw around them), each after its parent. */
function framingGroups(model: Model): ModelGroup[] {
  const groups = model.groups.filter((g) => !g.around);
  const byId = new Map(groups.map((g) => [g.id, g]));
  const depth = (g: ModelGroup) => {
    let d = 0;
    for (let p = g.parent; p && byId.has(p) && d < groups.length; p = byId.get(p)?.parent) d++;
    return d;
  };
  return groups
    .map((g) => ({ g, d: depth(g) }))
    .sort((a, b) => a.d - b.d)
    .map(({ g }) => g);
}

/**
 * Where an edge end lands in a diagram without overlay groups: an overlay stands for the first
 * of the ids it is drawn around.
 */
function landing(model: Model, id: string): string {
  let at = id;
  for (let hops = 0; hops < 8; hops++) {
    const overlay = model.groups.find((g) => g.id === at && g.around?.length);
    if (!overlay?.around?.[0]) return at;
    at = overlay.around[0];
  }
  return at;
}

const DIRECTIONS: Record<Direction, string> = { right: "LR", down: "TB", left: "RL", up: "BT" };

// ---------------------------------------------------------------- architecture-beta

/** Icons Mermaid draws without an icon pack. */
type Builtin = "cloud" | "database" | "disk" | "internet" | "server";

// The logos pack names for the same products' marks: AWS slugs it names `aws-<slug>`, the rest.
const AWS_SAME =
  "amplify api-gateway app-mesh appflow appsync athena aurora backup batch certificate-manager cloudformation cloudfront cloudsearch cloudtrail cloudwatch codebuild codecommit codedeploy codepipeline cognito config documentdb dynamodb ec2 elastic-beanstalk elasticache eventbridge fargate glue keyspaces kinesis lake-formation lambda lightsail mq neptune rds redshift secrets-manager shield step-functions systems-manager timestream waf";
const LOGOS: Record<string, string> = {
  ...Object.fromEntries(AWS_SAME.split(" ").map((s) => [`aws:${s}`, `aws-${s}`])),
  "aws:chime": "amazon-chime",
  "aws:connect": "amazon-connect",
  "aws:elastic-container-service": "aws-ecs",
  "aws:elastic-kubernetes-service": "aws-eks",
  "aws:elastic-load-balancing": "aws-elb",
  "aws:group-aws-cloud": "aws",
  "aws:identity-and-access-management": "aws-iam",
  "aws:key-management-service": "aws-kms",
  "aws:managed-streaming-for-apache-kafka": "aws-msk",
  "aws:opensearch-service": "aws-open-search",
  "aws:quick": "aws-quicksight",
  "aws:route-53": "aws-route53",
  "aws:simple-email-service": "aws-ses",
  "aws:simple-notification-service": "aws-sns",
  "aws:simple-queue-service": "aws-sqs",
  "aws:simple-storage-service": "aws-s3",
  "aws:simple-storage-service-glacier": "aws-glacier",
  "aws:virtual-private-cloud": "aws-vpc",
  "aws:x-ray": "aws-xray",
  "gcp:cloud-functions": "google-cloud-functions",
  "gcp:cloud-run": "google-cloud-run",
  "github:mark-github": "github-icon",
  "ibm:logo-openshift": "openshift",
};

/** The id itself when it names a logos icon orrery knows. */
const logosIcon = (id: string) => (resolveIcon(id) === id ? id : undefined);

/**
 * The logos pack's name for an icon when that pack has the same product's mark: logos icons
 * themselves, Simple Icons by slug, Kubernetes resources as the Kubernetes mark, and vendor
 * services (or a resource of one, by its longest named prefix) from the table above.
 */
function mermaidLogo(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const canonical = resolveIcon(id) ?? id;
  const [pack = "", slug = ""] = canonical.split(":");
  if (pack === "logos") return canonical;
  if (pack === "si") return logosIcon(`logos:${slug}-icon`) ?? logosIcon(`logos:${slug}`);
  if (pack === "k8s") return "logos:kubernetes";
  for (let s = slug; s; s = s.slice(0, Math.max(0, s.lastIndexOf("-")))) {
    const name = LOGOS[`${pack}:${s}`];
    if (name) return `logos:${name}`;
  }
  return undefined;
}

const SHAPE_ICONS: Partial<Record<ShapeKind, Builtin>> = {
  cylinder: "database",
  queue: "database",
  stack: "disk",
  document: "disk",
  person: "internet",
  cloud: "cloud",
};

/** The closest of Mermaid's own icons, from the icon's name and category or the node's shape. */
function builtin(nd: ModelNode): Builtin {
  const info = nd.icon ? iconInfo(nd.icon) : undefined;
  if (!info) return SHAPE_ICONS[nd.shape] ?? "server";
  const words = `${info.slug} ${info.name} ${info.category}`.toLowerCase();
  if (
    /database|\bdb\b|sql|dynamo|aurora|\brds\b|redis|cache|table|warehouse|vector|cosmos|spanner|bigtable|firestore/.test(
      words,
    )
  )
    return "database";
  if (/storage|bucket|\bs3\b|disk|volume|\bfiles?\b|blob|backup|archive|glacier/.test(words))
    return "disk";
  if (/internet|\busers?\b|client|browser|world|globe|mobile|people|person|\bweb\b/.test(words))
    return "internet";
  return "server";
}

interface End {
  /** The service or junction the edge attaches to. */
  ref: string;
  /** Attach at the boundary of the service's group (`{group}`): the edge was drawn to the group. */
  group: boolean;
  /** The group the service or junction sits in. */
  parent?: string;
  /** Where the layout drew it, which picks the sides. */
  box?: Box;
}

type Sides = [string, string];

/**
 * The sides an edge can leave and enter by: along the axis between the two centers first, the
 * other axis second when the ends are off line, and how far off line they are (0: in line).
 * Only straight pairs: Mermaid places a service met by a bent pair on the wrong side.
 */
function sideChoices(a?: Box, b?: Box): { choices: Sides[]; skew: number } {
  if (!a || !b) return { choices: [["R", "L"]], skew: 0 };
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  const across: Sides = dx >= 0 ? ["R", "L"] : ["L", "R"];
  const down: Sides = dy >= 0 ? ["B", "T"] : ["T", "B"];
  const wide = Math.abs(dx) >= Math.abs(dy);
  const [major, minor] = wide ? [Math.abs(dx), Math.abs(dy)] : [Math.abs(dy), Math.abs(dx)];
  const choices = wide ? [across, down] : [down, across];
  return { choices: minor > 1 ? choices : choices.slice(0, 1), skew: major ? minor / major : 0 };
}

interface Link {
  a: string;
  b: string;
  sides: Sides;
}

const STEP: Record<string, [number, number]> = { L: [-1, 0], R: [1, 0], T: [0, 1], B: [0, -1] };

/**
 * The grid Mermaid lays an architecture out on, worked out the way it does: breadth first from the
 * first service, each edge putting its far end one cell beyond the side it leaves by, one grid per
 * connected part. A service has one neighbor per pair of sides, and an edge between two same
 * sides places nothing.
 */
function grids(order: string[], links: Link[]): Map<string, [number, number]>[] {
  const next = new Map(order.map((x) => [x, new Map<string, string>()]));
  for (const x of order)
    for (const { a, b, sides } of links) {
      if (sides[0] === sides[1]) continue;
      if (a === x) next.get(x)?.set(sides.join(""), b);
      else if (b === x) next.get(x)?.set(`${sides[1]}${sides[0]}`, a);
    }
  const visited = new Set<string>();
  const maps: Map<string, [number, number]>[] = [];
  for (const first of order) {
    if (visited.has(first)) continue;
    const cells = new Map<string, [number, number]>([[first, [0, 0]]]);
    const queue = [first];
    for (let i = 0; i < queue.length; i++) {
      const x = queue[i] ?? "";
      visited.add(x);
      const [cx, cy] = cells.get(x) ?? [0, 0];
      for (const [pair, to] of next.get(x) ?? []) {
        if (visited.has(to)) continue;
        const [dx, dy] = STEP[pair[0] ?? ""] ?? [0, 0];
        cells.set(to, [cx + dx, cy + dy]);
        queue.push(to);
      }
    }
    maps.push(cells);
  }
  return maps;
}

/**
 * What makes Mermaid's layout fight itself, counted: two cell ranges that overlap although neither
 * holds the other, where a range is a service's cell or the cells a group's services span (two
 * services in one cell, a service inside a group it is not in, two groups across each other).
 */
function clashes(maps: Map<string, [number, number]>[], groupsOf: (x: string) => string[]): number {
  let count = 0;
  for (const cells of maps) {
    /** Each range with the ids of what holds it, itself first. */
    const spans = new Map<string, { box: [number, number, number, number]; within: string[] }>();
    for (const [x, [cx, cy]] of cells) {
      const up = groupsOf(x);
      spans.set(`=${x}`, { box: [cx, cy, cx, cy], within: [`=${x}`, ...up] });
      up.forEach((g, i) => {
        const [x0, y0, x1, y1] = spans.get(g)?.box ?? [cx, cy, cx, cy];
        const box: [number, number, number, number] = [
          Math.min(x0, cx),
          Math.min(y0, cy),
          Math.max(x1, cx),
          Math.max(y1, cy),
        ];
        spans.set(g, { box, within: up.slice(i) });
      });
    }
    const list = [...spans];
    list.forEach(([a, sa], i) => {
      for (const [b, sb] of list.slice(i + 1)) {
        if (sa.within.includes(b) || sb.within.includes(a)) continue;
        const [ax0, ay0, ax1, ay1] = sa.box;
        const [bx0, by0, bx1, by1] = sb.box;
        if (ax0 <= bx1 && bx0 <= ax1 && ay0 <= by1 && by0 <= ay1) count++;
      }
    });
  }
  return count;
}

interface Planned {
  a: End;
  b: End;
  choices: Sides[];
  skew: number;
  sides: Sides;
}

/**
 * Sides for each edge, most in-line edges first: the pair along the main axis, else the other
 * axis, as long as neither end already has a neighbor by that pair and Mermaid's grid (`order`
 * is its service order) stays free of clashes; else the same side at both ends, which Mermaid
 * draws but leaves out of its grid.
 */
function chooseSides(planned: Planned[], order: string[], groupsOf: (x: string) => string[]) {
  const links = new Map<number, Link>();
  const used = new Set<string>();
  const key = (x: End, mine: string, theirs: string) => `${x.ref}|${mine}${theirs}`;
  let base = 0;
  const byLine = planned.map((p, i) => ({ p, i })).sort((x, y) => x.p.skew - y.p.skew);
  for (const { p, i } of byLine) {
    const free = ([sa, sb]: Sides) => !used.has(key(p.a, sa, sb)) && !used.has(key(p.b, sb, sa));
    const target = p.choices[0]?.[1] ?? "L";
    for (const sides of [...p.choices.filter(free), [target, target] as Sides]) {
      links.set(i, { a: p.a.ref, b: p.b.ref, sides });
      const placed = [...links].sort(([x], [y]) => x - y).map(([, l]) => l);
      const count = clashes(grids(order, placed), groupsOf);
      if (count > base && sides[0] !== sides[1]) continue;
      base = count;
      p.sides = sides;
      break;
    }
    used.add(key(p.a, p.sides[0], p.sides[1]));
    used.add(key(p.b, p.sides[1], p.sides[0]));
  }
}

function architecture(model: Model, scene: Scene): string[] {
  const groups = framingGroups(model);
  const groupIds = new Set(groups.map((g) => g.id));
  const ids = idMap([...groups.map((g) => g.id), ...model.nodes.map((nd) => nd.id)]);
  const id = (x: string) => ids.get(x) ?? x;
  const inside = (parent?: string) => (parent && groupIds.has(parent) ? ` in ${id(parent)}` : "");
  const boxes = new Map<string, Box>([
    ...scene.groups.map((g) => [g.id, g.box] as const),
    ...scene.nodes.map((nd) => [nd.id, nd.box] as const),
  ]);
  const icons = new Map(scene.groups.map((g) => [g.id, g.icon]));
  const out = [...heading(model), "architecture-beta", ...description(model)];
  for (const g of groups) {
    const icon = mermaidLogo(icons.get(g.id) ?? g.icon ?? undefined);
    out.push(`  group ${id(g.id)}${icon ? `(${icon})` : ""}${title(g.label)}${inside(g.parent)}`);
  }
  for (const nd of model.nodes)
    out.push(
      `  service ${id(nd.id)}(${mermaidLogo(nd.icon) ?? builtin(nd)})${title(nd.label)}${inside(nd.parent)}`,
    );
  // Mermaid edges end on services and junctions only: an edge drawn to a group leaves from the
  // boundary of the group around its first service (its own, or the innermost one below it),
  // and from a junction inside it only when it holds no service at all. Junctions inside a
  // group of groups throw Mermaid's layout far apart.
  const parentGroup = new Map(groups.map((g) => [g.id, g.parent]));
  const holds = (g: string, nd: ModelNode) => {
    for (let p = nd.parent, hops = 0; p && hops <= groups.length; p = parentGroup.get(p), hops++)
      if (p === g) return true;
    return false;
  };
  const taken = new Set(ids.values());
  const junctions = new Map<string, string>();
  const end = (raw: string): End | undefined => {
    const at = landing(model, raw);
    const nd = model.nodes.find((x) => x.id === at);
    if (nd) return { ref: id(at), group: false, parent: nd.parent, box: boxes.get(at) };
    if (!groupIds.has(at)) return undefined;
    const member =
      model.nodes.find((x) => x.parent === at) ?? model.nodes.find((x) => holds(at, x));
    if (member)
      return { ref: id(member.id), group: true, parent: member.parent, box: boxes.get(member.id) };
    let junction = junctions.get(at);
    if (!junction) {
      junction = `${id(at)}_edge`;
      for (let i = 2; taken.has(junction); i++) junction = `${id(at)}_edge_${i}`;
      taken.add(junction);
      junctions.set(at, junction);
      out.push(`  junction ${junction} in ${id(at)}`);
    }
    return { ref: junction, group: false, parent: at, box: boxes.get(at) };
  };
  // Mermaid names an edge's element after its two ends, so a pair of services carries one edge
  // each way: an edge drawn backwards is written the way it points, a second one the other way.
  const written = new Set<string>();
  const planned = model.edges.flatMap((e) => {
    const from = end(e.from);
    const to = end(e.to);
    if (!from || !to || from.ref === to.ref) return [];
    let [a, b] = e.arrow === "start" ? [to, from] : [from, to];
    let arrow: ArrowMode = e.arrow === "start" ? "end" : e.arrow;
    if (written.has(`${a.ref}-${b.ref}`)) {
      [a, b] = [b, a];
      arrow = arrow === "end" ? "start" : arrow;
    }
    if (written.has(`${a.ref}-${b.ref}`)) return [];
    written.add(`${a.ref}-${b.ref}`);
    return [{ e, a, b, arrow, sides: ["R", "L"] as Sides, ...sideChoices(a.box, b.box) }];
  });
  const parents = new Map<string, string | undefined>([
    ...model.nodes.map((nd) => [id(nd.id), nd.parent] as const),
    ...[...junctions].map(([g, j]) => [j, g] as const),
  ]);
  const groupsOf = (x: string) => {
    const up: string[] = [];
    let g = parents.get(x);
    while (g && groupIds.has(g) && up.length <= groups.length) {
      up.push(g);
      g = parentGroup.get(g);
    }
    return up;
  };
  chooseSides(planned, [...model.nodes.map((nd) => id(nd.id)), ...junctions.values()], groupsOf);
  for (const { e, a, b, arrow, sides } of planned) {
    // `{group}` must cross from one group into another.
    const crosses = a.parent !== b.parent;
    const into = (side: "start" | "end") => arrow === side || arrow === "both";
    const line = e.label ? `-${title(e.label)}-` : "--";
    const left = `${a.ref}${a.group && crosses ? "{group}" : ""}`;
    const right = `${b.ref}${b.group && crosses ? "{group}" : ""}`;
    out.push(
      `  ${left}:${sides[0]} ${into("start") ? "<" : ""}${line}${into("end") ? ">" : ""} ${sides[1]}:${right}`,
    );
  }
  return out;
}

// ---------------------------------------------------------------- flowchart

const BRACKETS: Partial<Record<ShapeKind, [string, string]>> = {
  box: ["[", "]"],
  rounded: ["(", ")"],
  pill: ["([", "])"],
  circle: ["((", "))"],
  diamond: ["{", "}"],
  hexagon: ["{{", "}}"],
  cylinder: ["[(", ")]"],
  parallelogram: ["[/", "/]"],
  subroutine: ["[[", "]]"],
  // Manual operation: the wide side on top.
  trapezoid: ["[\\", "/]"],
  person: ["([", "])"],
};

/** Shapes with no bracket form, by their names in Mermaid's `@{ shape: ... }` syntax. */
const NAMED: Partial<Record<ShapeKind, string>> = {
  queue: "h-cyl",
  document: "doc",
  note: "notch-rect",
  cloud: "cloud",
  stack: "st-rect",
  delay: "delay",
  initial: "sm-circ",
  final: "fr-circ",
};

/** The symbol a gateway with no label of its own shows. */
const GATEWAY_MARK: Record<string, string> = {
  exclusive: "X",
  parallel: "+",
  inclusive: "O",
  "event-based": "E",
  complex: "*",
};

function nodeText(nd: ModelNode): string {
  const text = nd.note && !nd.bpmn ? `${nd.label}\n${nd.note}` : nd.label;
  return label(text || (nd.bpmn ? (GATEWAY_MARK[nd.bpmn] ?? "") : ""));
}

/** A node's shape and text: the BPMN element when it has one, else its orrery shape. */
function flowNode(nd: ModelNode): string {
  const text = nodeText(nd);
  const bracket = ([open, close]: [string, string]) => `${open}"${text}"${close}`;
  const named = (shape: string) => `@{ shape: ${shape}, label: "${text}" }`;
  const k = nd.bpmn;
  if (k) {
    if (isBpmnEvent(k)) return bracket(k.startsWith("end") ? ["(((", ")))"] : ["((", "))"]);
    if (isBpmnGateway(k)) return bracket(["{", "}"]);
    if (k === "subprocess" || k === "call-activity") return bracket(["[[", "]]"]);
    if (k === "data-object") return named("doc");
    if (k === "data-store") return bracket(["[(", ")]"]);
    return bracket(["(", ")"]);
  }
  if (nd.look === "card") return bracket(["[", "]"]);
  const shape = NAMED[nd.shape];
  return shape ? named(shape) : bracket(BRACKETS[nd.shape] ?? ["(", ")"]);
}

const LINKS: Record<"solid" | "dotted" | "thick", Record<"end" | "none" | "both", string>> = {
  solid: { end: "-->", none: "---", both: "<-->" },
  dotted: { end: "-.->", none: "-.-", both: "<-.->" },
  thick: { end: "==>", none: "===", both: "<==>" },
};

/** The link for an edge's line style and arrows; Mermaid has one broken line for dashed and dotted. */
function link(e: ModelEdge): string {
  const line: EdgeLine =
    e.flow === "association" ? "dotted" : e.flow === "message" ? "dashed" : e.line;
  const style = line === "thick" ? "thick" : line === "solid" ? "solid" : "dotted";
  const arrow = e.arrow === "start" ? "end" : e.arrow;
  return LINKS[style][arrow];
}

function flowchart(model: Model): string[] {
  const groups = framingGroups(model);
  const groupIds = new Set(groups.map((g) => g.id));
  const ids = idMap([...groups.map((g) => g.id), ...model.nodes.map((nd) => nd.id)]);
  const id = (x: string) => ids.get(x) ?? x;
  const parentOf = (p?: string) => (p && groupIds.has(p) ? p : undefined);
  const out = [
    ...heading(model),
    `flowchart ${DIRECTIONS[model.direction]}`,
    ...description(model),
  ];
  const write = (parent: string | undefined, depth: number) => {
    const pad = "  ".repeat(depth);
    for (const g of groups.filter((x) => parentOf(x.parent) === parent)) {
      out.push(`${pad}subgraph ${id(g.id)}["${label(g.label)}"]`);
      write(g.id, depth + 1);
      out.push(`${pad}end`);
    }
    for (const nd of model.nodes.filter((x) => parentOf(x.parent) === parent))
      out.push(`${pad}${id(nd.id)}${flowNode(nd)}`);
  };
  write(undefined, 1);
  const known = new Set([...groupIds, ...model.nodes.map((nd) => nd.id)]);
  for (const e of model.edges) {
    const a = landing(model, e.from);
    const b = landing(model, e.to);
    if (!known.has(a) || !known.has(b)) continue;
    // An arrow at the start is the same link written the other way round.
    const [from, to] = e.arrow === "start" ? [b, a] : [a, b];
    const text = e.label ? `|"${label(e.label)}"|` : "";
    out.push(`  ${id(from)} ${link(e)}${text} ${id(to)}`);
  }
  return out;
}

// ---------------------------------------------------------------- stateDiagram-v2

function stateDiagram(model: Model): string[] {
  const groups = framingGroups(model);
  const groupIds = new Set(groups.map((g) => g.id));
  const ids = idMap([...groups.map((g) => g.id), ...model.nodes.map((nd) => nd.id)]);
  const id = (x: string) => ids.get(x) ?? x;
  const nodes = new Map(model.nodes.map((nd) => [nd.id, nd]));
  const parentOf = (x: string) => {
    const p = nodes.get(x)?.parent ?? groups.find((g) => g.id === x)?.parent;
    return p && groupIds.has(p) ? p : undefined;
  };
  const pseudo = (x: string) => {
    const shape = nodes.get(x)?.shape;
    return shape === "initial" || shape === "final";
  };
  // An initial or final pseudostate is the [*] of the composite it sits in, so its transitions
  // go there; a transition between two states of one composite goes inside it, and one between
  // composites at the top (Mermaid 11 fails on one written inside an outer composite).
  const scope = (a: string, b: string) => {
    if (pseudo(a)) return parentOf(a);
    if (pseudo(b)) return parentOf(b);
    return parentOf(a) === parentOf(b) ? parentOf(a) : undefined;
  };
  const ref = (x: string) => (pseudo(x) ? "[*]" : id(x));
  const transitions = model.edges
    .map((e) => {
      const a = landing(model, e.from);
      const b = landing(model, e.to);
      const [from, to] = e.arrow === "start" ? [b, a] : [a, b];
      return { from, to, label: e.label, scope: scope(from, to) };
    })
    .filter(
      (t) => (nodes.has(t.from) || groupIds.has(t.from)) && (nodes.has(t.to) || groupIds.has(t.to)),
    );
  const out = [
    ...heading(model),
    "stateDiagram-v2",
    ...description(model),
    `  direction ${DIRECTIONS[model.direction]}`,
  ];
  const write = (parent: string | undefined, depth: number) => {
    const pad = "  ".repeat(depth);
    for (const g of groups.filter((x) => parentOf(x.id) === parent)) {
      out.push(`${pad}${id(g.id)} : ${lineEnd(g.label) || id(g.id)}`);
      const held =
        groups.some((x) => parentOf(x.id) === g.id) ||
        model.nodes.some((nd) => parentOf(nd.id) === g.id) ||
        transitions.some((t) => t.scope === g.id);
      if (!held) continue;
      out.push(`${pad}state ${id(g.id)} {`);
      write(g.id, depth + 1);
      out.push(`${pad}}`);
    }
    for (const nd of model.nodes.filter((x) => parentOf(x.id) === parent && !pseudo(x.id))) {
      if (nd.shape === "diamond") out.push(`${pad}state ${id(nd.id)} <<choice>>`);
      else out.push(`${pad}state "${label(nd.label || nd.id)}" as ${id(nd.id)}`);
    }
    for (const t of transitions.filter((x) => x.scope === parent))
      out.push(`${pad}${ref(t.from)} --> ${ref(t.to)}${t.label ? ` : ${lineEnd(t.label)}` : ""}`);
  };
  write(undefined, 1);
  return out;
}

// ---------------------------------------------------------------- mindmap

const MIND_SHAPES: Partial<Record<ShapeKind, [string, string]>> = {
  box: ["[", "]"],
  circle: ["((", "))"],
  hexagon: ["{{", "}}"],
  cloud: [")", "("],
};

/** A mind map when the edges form one tree from one root; undefined otherwise. */
function mindmap(model: Model): string[] | undefined {
  const nodes = new Map(model.nodes.map((nd) => [nd.id, nd]));
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  for (const e of model.edges) {
    const [a, b] = e.arrow === "start" ? [e.to, e.from] : [e.from, e.to];
    if (!nodes.has(a) || !nodes.has(b) || a === b || parent.has(b)) return undefined;
    parent.set(b, a);
    children.set(a, [...(children.get(a) ?? []), b]);
  }
  const roots = model.nodes.filter((nd) => !parent.has(nd.id));
  const root = roots[0];
  if (roots.length !== 1 || !root) return undefined;
  const ids = idMap(model.nodes.map((nd) => nd.id));
  const out = [...heading(model), "mindmap"];
  const seen = new Set<string>();
  const visit = (x: string, depth: number) => {
    const nd = nodes.get(x);
    if (!nd || seen.has(x)) return;
    seen.add(x);
    const [open, close] = depth === 1 ? ["((", "))"] : (MIND_SHAPES[nd.shape] ?? ["(", ")"]);
    out.push(`${"  ".repeat(depth)}${ids.get(x)}${open}"${label(nd.label || x)}"${close}`);
    for (const c of children.get(x) ?? []) visit(c, depth + 1);
  };
  visit(root.id, 1);
  // A loop below the root leaves its nodes unreached.
  return seen.size === model.nodes.length ? out : undefined;
}

// ---------------------------------------------------------------- journey

/** The first character of a step that would start a journey statement: a keyword. */
const STATEMENT = /^(?=(?:accdescr|acctitle|journey|section|title)\b)./i;

/**
 * One section per stage and one task per scored step (orrery's -2..2 is Mermaid's 1..5), done by
 * its lane; the unscored rows (touchpoints, pains, ideas) stay in the text as comments. Without
 * any scores every step is a task at a neutral 3.
 */
function journey(model: Model): string[] {
  const lanes = new Map(model.groups.map((g) => [g.id, g.label]));
  const scored = model.nodes.some((nd) => nd.score !== undefined);
  const out = ["journey"];
  if (model.title) out.push(`  title ${code(flat(model.title), PROSE)}`);
  out.push(...description(model));
  const stages = model.stages ?? [
    ...new Set(model.nodes.flatMap((nd) => (nd.stage ? [nd.stage] : []))),
  ];
  for (const stage of stages) {
    const steps = model.nodes.filter((nd) => nd.stage === stage);
    if (!steps.length) continue;
    out.push(`  section ${lineEnd(stage)}`);
    for (const nd of steps) {
      const lane = nd.parent ? lanes.get(nd.parent) : undefined;
      if (scored && nd.score === undefined) {
        out.push(`    %% ${flat(lane ? `${lane}: ${nd.label}` : nd.label)}`);
        continue;
      }
      const score = Math.min(5, Math.max(1, Math.round((nd.score ?? 0) + 3)));
      const who = lane ? `: ${code(lineEnd(lane), /,/g)}` : "";
      out.push(`    ${code(lineEnd(nd.label) || nd.id, STATEMENT)}: ${score}${who}`);
    }
  }
  return out;
}
