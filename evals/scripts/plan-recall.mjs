#!/usr/bin/env node
// Grader for the plan suite: compares a planner's plan JSON with a fixture's answer key.
//   node recall   required services the plan shows
//   edge recall   required flows it shows, in the direction planning.md asks for
//   invented      service nodes and boundaries with nothing behind them in the fixture
//   glue          IAM roles, permissions, routes and the like drawn as nodes (planning.md leaves them out)
//   forbidden     flows the evidence rules out, such as an edge read from depends_on
// A plan node is matched to a key node by its evidence first ("file:line" resolved to the resource
// block on that line, or a resource address), then by icon plus label, so free-form ids still match.
//
//   node evals/scripts/plan-recall.mjs <plan.json> --expected <fixture>/expected.json [--repo <dir>]
//
// --repo is the repository the plan cites (default: the repo/ folder next to expected.json).
// Prints a JSON verdict; exit 0 pass, 1 fail, 2 usage.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { finish, parseArgs, usage } from "./lib.mjs";

const { positionals, flags } = parseArgs(process.argv.slice(2));
const [planPath] = positionals;
if (!planPath || typeof flags.expected !== "string")
  usage("plan-recall.mjs <plan.json> --expected <fixture>/expected.json [--repo <dir>]");
const key = JSON.parse(readFileSync(flags.expected, "utf8"));
const repo = typeof flags.repo === "string" ? flags.repo : join(dirname(flags.expected), "repo");
const re = (source) => new RegExp(source, "i");

if (!existsSync(planPath))
  finish({ plan: planPath, pass: false, reasons: [`no plan at ${planPath}`] });
const { plan, format } = readPlan(readFileSync(planPath, "utf8"));
if (!plan) finish({ plan: planPath, format, pass: false, reasons: ["the plan is not JSON"] });

const files = blockMap(repo);
const candidates = [
  ...key.nodes.map((node) => ({ node, required: true })),
  ...(key.optional ?? []).map((node) => ({ node, required: false })),
];
const optionalIds = new Set((key.optional ?? []).map((n) => n.id));

const found = new Set();
const optional = new Set();
const actors = [];
const invented = [];
const inventedGroups = [];
const glue = [];
const edgeHits = new Set();
const reversed = [];
const forbiddenHits = [];
const unexpected = [];

const figures = Array.isArray(plan.figures) ? plan.figures : [plan];
for (const [index, figure] of figures.entries()) {
  const where = figure.name ?? `figure ${index + 1}`;
  const resolved = new Map();
  for (const group of figure.groups ?? []) {
    resolved.set(group.id, { kind: "group" });
    if (key.boundaries && group.type && !re(key.boundaries).test(group.type))
      inventedGroups.push(`${where}: ${group.id} (${group.type})`);
  }
  for (const node of figure.nodes ?? []) {
    const match = matchNode(node);
    if (match) {
      resolved.set(node.id, { kind: "node", id: match.node.id });
      (match.required ? found : optional).add(match.node.id);
    } else if (isActor(node)) {
      resolved.set(node.id, { kind: "actor" });
      actors.push(`${where}: ${node.id}`);
    } else {
      resolved.set(node.id, { kind: "other" });
      (isGlue(node) ? glue : invented).push(
        `${where}: ${node.id} (${node.label ?? node.icon ?? ""})`,
      );
    }
  }
  for (const edge of figure.edges ?? []) {
    for (const from of [edge.from].flat())
      for (const to of [edge.to].flat())
        checkEdge(where, from, to, resolved.get(from), resolved.get(to));
  }
}

const required = key.nodes.map((n) => n.id);
const requiredEdges = key.edges.filter((e) => !e.optional);
const nodeRecall = round(found.size / required.length);
const edgeRecall = round(
  requiredEdges.filter((e) => edgeHits.has(edgeKey(e))).length / requiredEdges.length,
);
const limits = key.pass;
const reasons = [];
if (nodeRecall < limits.nodeRecall)
  reasons.push(`node recall ${nodeRecall} < ${limits.nodeRecall}`);
if (edgeRecall < limits.edgeRecall)
  reasons.push(`edge recall ${edgeRecall} < ${limits.edgeRecall}`);
if (invented.length + inventedGroups.length > limits.invented)
  reasons.push(`${invented.length + inventedGroups.length} invented node(s) or boundary(ies)`);
if (glue.length > limits.glue) reasons.push(`${glue.length} glue resource(s) drawn as nodes`);
if (forbiddenHits.length > limits.forbidden)
  reasons.push(`${forbiddenHits.length} forbidden flow(s)`);

finish({
  plan: planPath,
  fixture: key.fixture,
  format,
  figures: figures.length,
  nodes: {
    required: required.length,
    found: found.size,
    recall: nodeRecall,
    missing: required.filter((id) => !found.has(id)),
  },
  edges: {
    required: requiredEdges.length,
    found: requiredEdges.filter((e) => edgeHits.has(edgeKey(e))).length,
    recall: edgeRecall,
    missing: requiredEdges.filter((e) => !edgeHits.has(edgeKey(e))).map(edgeKey),
    reversed,
    unexpected,
  },
  actors,
  optional: [...optional],
  invented,
  inventedGroups,
  glue,
  forbidden: forbiddenHits,
  pass: reasons.length === 0,
  reasons,
});

function readPlan(text) {
  const attempts = [
    ["json", text],
    ["fenced", text.match(/```(?:json)?\s*\n([\s\S]*?)```/)?.[1]],
    ["embedded", text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)],
  ];
  for (const [format, body] of attempts) {
    if (!body) continue;
    try {
      return { plan: JSON.parse(body), format };
    } catch {}
  }
  return { plan: null, format: "unreadable" };
}

/** Each repo file with the resource blocks it holds: Terraform blocks and compose entries. */
function blockMap(dir) {
  const map = new Map();
  const walk = (rel) => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else map.set(path, blocksOf(path, readFileSync(join(dir, path), "utf8").split("\n")));
    }
  };
  if (existsSync(dir)) walk("");
  return map;
}

function blocksOf(path, lines) {
  const blocks = [];
  if (path.endsWith(".tf")) {
    for (const [i, line] of lines.entries()) {
      const m = line.match(/^(resource|data)\s+"([\w-]+)"\s+"([\w-]+)"/);
      if (!m) continue;
      let end = i;
      while (end < lines.length - 1 && !/^}/.test(lines[end])) end++;
      blocks.push({
        start: i + 1,
        end: end + 1,
        address: `${m[1] === "data" ? "data." : ""}${m[2]}.${m[3]}`,
      });
    }
  } else if (/(^|\/)(docker-)?compose[^/]*\.ya?ml$/.test(path)) {
    let top = null;
    let current = null;
    for (const [i, line] of lines.entries()) {
      const t = line.match(/^([\w.-]+):/);
      const s = line.match(/^ {2}([\w.-]+):/);
      if (t) [top, current] = [t[1], null];
      else if (s && top)
        blocks.push((current = { start: i + 1, end: i + 1, address: `${top}.${s[1]}` }));
      else if (current && line.trim()) current.end = i + 1;
    }
  }
  return blocks;
}

/** Resource addresses and file refs an evidence string points at. */
function refs(evidence) {
  const text = [evidence].flat().filter(Boolean).join(", ");
  const out = new Set();
  for (const m of text.matchAll(
    /\b((?:data\.)?(?:aws|azurerm|google|kubernetes|random|null)_[a-z0-9_]+\.[a-z0-9_-]+)/gi,
  ))
    out.add(m[1]);
  for (const m of text.matchAll(/\b(services|networks|volumes)\.([\w-]+)/g))
    out.add(`${m[1]}.${m[2]}`);
  for (const m of text.matchAll(
    /([\w./\\-]+\.(?:tf|ya?ml|json|mjs|cjs|js|ts|py|go|conf))(?::(\d+)(?:-(\d+))?)?/g,
  )) {
    const file = repoFile(m[1]);
    if (!file) continue;
    out.add(`file:${file}`);
    if (!m[2]) continue;
    const [from, to] = [Number(m[2]), Number(m[3] ?? m[2])];
    for (const b of files.get(file)) if (b.start <= to && from <= b.end) out.add(b.address);
  }
  return out;
}

/** The repo file a cited path names: exact, or the one file it is a suffix of or ends with. */
function repoFile(cited) {
  const path = cited.replace(/\\/g, "/").replace(/^\.\//, "");
  if (files.has(path)) return path;
  const hits = [...files.keys()].filter((f) => path.endsWith(`/${f}`) || f.endsWith(`/${path}`));
  return hits.length === 1 ? hits[0] : null;
}

function matchNode(node) {
  const evidence = refs(node.evidence);
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scoreNode(node, evidence, candidate.node);
    if (score > bestScore) [best, bestScore] = [candidate, score];
  }
  return best;
}

function scoreNode(node, evidence, wanted) {
  if (wanted.resources.some((r) => evidence.has(r))) return 4;
  // A node whose evidence is an IAM role or a route is that glue, whatever its label says.
  if (isGlue(node)) return 0;
  const words = [node.id, node.label, node.note].filter(Boolean).join(" ");
  const iconOk = Boolean(wanted.icon && node.icon && re(wanted.icon).test(node.icon));
  const wordsOk = Boolean(wanted.keywords && re(wanted.keywords).test(words));
  const iconTargets = node.icon
    ? candidates.filter((c) => c.node.icon && re(c.node.icon).test(node.icon))
    : [];
  if (iconOk && wordsOk) return 3;
  if (iconOk && iconTargets.length === 1) return 2;
  if (wordsOk && !iconTargets.some((c) => c.node !== wanted)) return 1;
  return 0;
}

function isActor(node) {
  const words = [node.id, node.label, node.icon].filter(Boolean).join(" ");
  return re(`\\b(${key.actors})\\b`).test(words);
}

function isGlue(node) {
  const evidence = [...refs(node.evidence)];
  if (evidence.some((r) => key.glue.some((g) => re(g).test(r)))) return true;
  const words = [node.id, node.label, node.icon].filter(Boolean).join(" ");
  return Boolean(key.glueKeywords && re(key.glueKeywords).test(words));
}

function checkEdge(where, from, to, a, b) {
  const end = (r) => (r?.kind === "node" ? r.id : r?.kind === "actor" ? "@actor" : null);
  const [x, y] = [end(a), end(b)];
  if (!x || !y) return;
  const label = `${where}: ${from} -> ${to}`;
  let known = false;
  for (const e of key.edges) {
    if (e.from === x && e.to === y) {
      known = true;
      edgeHits.add(edgeKey(e));
    } else if (e.from === y && e.to === x) {
      known = true;
      if (e.either) edgeHits.add(edgeKey(e));
      else reversed.push(`${label} (expected ${edgeKey(e)})`);
    }
  }
  for (const f of key.forbidden ?? []) {
    if ((f.from === x && f.to === y) || (f.either && f.from === y && f.to === x)) {
      known = true;
      forbiddenHits.push(`${label}: ${f.why}`);
    }
  }
  if (!known && x !== y && !optionalIds.has(x) && !optionalIds.has(y)) unexpected.push(label);
}

function edgeKey(e) {
  return `${e.from} -> ${e.to}`;
}

function round(n) {
  return Math.round(n * 100) / 100;
}
