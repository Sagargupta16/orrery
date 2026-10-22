// Mermaid sequenceDiagram text for a sequence spec: participants in order (actors as `actor`, the
// groups as boxes), every message with Mermaid's arrow for its line, self messages, and the
// fragments as loop, alt / else, opt, par / and, break and critical blocks.
//
// Called from src/render/mermaid.ts renderMermaid for kind sequence; a missing final newline is
// added there.

import type { Model, ModelEdge, ModelNode } from "../types.ts";

/** Words Mermaid's sequence grammar reads as keywords; ids never take them. */
const RESERVED = new Set(
  "actor activate alt and as autonumber box break create critical deactivate destroy else end link links loop note opt option over par participant rect right left of title".split(
    " ",
  ),
);

/** Mermaid ids for orrery ids: word characters only, never a keyword, never repeated. */
function idMap(ids: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const id of ids) {
    let base = id.replace(/\W+/g, "_").replace(/^_+|_+$/g, "") || "p";
    if (/^\d/.test(base) || RESERVED.has(base.toLowerCase())) base = `p_${base}`;
    let unique = base;
    for (let i = 2; used.has(unique.toLowerCase()); i++) unique = `${base}_${i}`;
    used.add(unique.toLowerCase());
    out.set(id, unique);
  }
  return out;
}

/** Text to the end of a line: Mermaid's entity codes for what it would read as syntax. */
const words = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[#;%<>"\\]/g, (c) => `#${c.codePointAt(0)};`),
    )
    .filter(Boolean)
    .join("<br/>");

/** People take Mermaid's stick figure. */
const isActor = (n: ModelNode) =>
  n.shape === "person" ||
  /(^|[:\-_/])(user|users|person|people|actor|customer)s?$/i.test(n.icon ?? "");

/** Mermaid's arrow for a message: solid calls, dotted replies and async, an open head for signals. */
function arrow(e: ModelEdge): string {
  const dotted = e.line === "dashed" || e.line === "dotted";
  if (e.arrow === "none") return dotted ? "-->" : "->";
  if (e.arrow === "both") return dotted ? "<<-->>" : "<<->>";
  if (e.line === "dotted") return "--)";
  return dotted ? "-->>" : "->>";
}

export function sequenceMermaid(model: Model): string {
  const out: string[] = [];
  if (model.title)
    out.push("---", `title: ${JSON.stringify(model.title.replace(/\s+/g, " ").trim())}`, "---");
  out.push("sequenceDiagram");
  if (model.subtitle) out.push(`    accDescr: ${words(model.subtitle).replace(/<br\/>/g, " ")}`);
  const ids = idMap(model.nodes.map((n) => n.id));
  const id = (x: string) => ids.get(x) ?? x;
  // Numbered messages keep their numbers.
  if (model.edges.some((e) => e.step !== undefined)) out.push("    autonumber");
  // Participants in spec order; members of a top-level group sit in its box.
  const top = (n: ModelNode) => {
    let g = n.parent;
    let last: string | undefined;
    while (g) {
      last = g;
      g = model.groups.find((x) => x.id === g)?.parent;
    }
    return last;
  };
  let open: string | undefined;
  for (const n of model.nodes) {
    const box = top(n);
    if (box !== open) {
      if (open) out.push("    end");
      if (box) {
        const label = model.groups.find((g) => g.id === box)?.label || box;
        out.push(`    box transparent ${words(label)}`);
      }
      open = box;
    }
    const pad = open ? "        " : "    ";
    const alias = words(n.label || n.id);
    out.push(
      `${pad}${isActor(n) ? "actor" : "participant"} ${id(n.id)}${alias && alias !== id(n.id) ? ` as ${alias}` : ""}`,
    );
  }
  if (open) out.push("    end");
  // Messages in order, each fragment opened before its first and closed after its last.
  const nodes = new Set(model.nodes.map((n) => n.id));
  const drawn = (k: number) => {
    const e = model.edges[k - 1];
    return !!e && nodes.has(e.from) && nodes.has(e.to);
  };
  // A block with no message in it would not parse; neither would a range past the messages.
  const frags = (model.fragments ?? [])
    .filter((f) => f.from >= 1 && f.to <= model.edges.length && f.from <= f.to)
    .filter((f) => Array.from({ length: f.to - f.from + 1 }, (_, i) => f.from + i).some(drawn))
    .map((f, i) => ({ f, i }))
    .sort((p, q) => p.f.from - q.f.from || q.f.to - p.f.to || p.i - q.i)
    .map(({ f }) => f);
  let depth = 1;
  const pad = () => "    ".repeat(depth);
  const stack: typeof frags = [];
  model.edges.forEach((e, i) => {
    const k = i + 1;
    // A further branch of the innermost open fragment ends the one before it.
    const inner = stack[stack.length - 1];
    for (const branch of inner?.else ?? []) {
      if (branch.at !== k || branch.at <= (inner?.from ?? 0)) continue;
      depth--;
      const word = inner?.type === "par" ? "and" : "else";
      out.push(`${pad()}${word}${branch.label ? ` ${words(branch.label)}` : ""}`);
      depth++;
    }
    for (const f of frags) {
      if (f.from !== k) continue;
      // A fragment that crosses an open one without nesting is left out (DG125 reports it).
      if (stack.some((o) => f.to > o.to)) continue;
      out.push(`${pad()}${f.type}${f.label ? ` ${words(f.label)}` : ""}`);
      stack.push(f);
      depth++;
    }
    if (nodes.has(e.from) && nodes.has(e.to)) {
      const [a, b] = e.arrow === "start" ? [e.to, e.from] : [e.from, e.to];
      const text = e.label ? words(e.label) : "";
      out.push(`${pad()}${id(a)}${arrow(e)}${id(b)}: ${text || " "}`.trimEnd());
    }
    while (stack.length && (stack[stack.length - 1]?.to ?? 0) <= k) {
      stack.pop();
      depth--;
      out.push(`${pad()}end`);
    }
  });
  return `${out.join("\n")}\n`;
}
