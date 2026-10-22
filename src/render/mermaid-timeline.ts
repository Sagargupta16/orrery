// Mermaid gantt text for a timeline spec: lanes as sections, items as tasks, milestones.
//
// Called from: src/render/mermaid.ts renderMermaid for kind timeline; a missing final newline is
// added. Dates are written as the spec normalized them, with inclusive end dates as orrery reads
// them; a dependency becomes `after`, so the task starts when its predecessors end.

import type { Model, ModelNode } from "../types.ts";

/** Mermaid's entity codes (`#58;` for `:`), so a name never reads as task syntax. */
const code = (s: string, chars: RegExp) => s.replace(chars, (c) => `#${c.codePointAt(0)};`);
const flat = (s: string) => s.replace(/\s+/g, " ").trim();
/** A task or section name runs to the colon that starts its data. */
const name = (s: string) => code(flat(s), /[#;:%&<>"\\]/g);
/** A title or description keeps its colons. */
const prose = (s: string) => code(flat(s), /[#;%&<>\\]/g);

/** Words a gantt task id could read as: its keywords and tags. */
const RESERVED = new Set(
  "after active crit done milestone section title dateformat axisformat tickinterval excludes includes todaymarker inclusiveenddates weekday".split(
    " ",
  ),
);

function ids(nodes: ModelNode[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const n of nodes) {
    let base = n.id.replace(/\W+/g, "_").replace(/^_+|_+$/g, "") || "t";
    if (/^\d/.test(base) || RESERVED.has(base.toLowerCase())) base = `t_${base}`;
    let id = base;
    for (let k = 2; used.has(id); k++) id = `${base}_${k}`;
    used.add(id);
    out.set(n.id, id);
  }
  return out;
}

const TAG: Record<string, string> = { done: "done", active: "active", "at-risk": "crit" };

/** How the axis prints: d3 formats, and the tick spacing Mermaid accepts. */
const AXIS: Record<string, { format: string; tick?: string }> = {
  day: { format: "%b %d", tick: "1day" },
  week: { format: "%b %d", tick: "1week" },
  month: { format: "%b %Y", tick: "1month" },
  quarter: { format: "%b %Y", tick: "3month" },
  year: { format: "%Y" },
};

export function timelineMermaid(model: Model): string {
  const scale = model.timeline?.scale ?? "month";
  const out = ["gantt"];
  if (model.title) out.push(`  title ${prose(model.title)}`);
  if (model.subtitle) out.push(`  accDescr: ${prose(model.subtitle)}`);
  out.push("  dateFormat YYYY-MM-DD", "  inclusiveEndDates");
  const axis = AXIS[scale] ?? { format: "%b %Y" };
  out.push(`  axisFormat ${axis.format}`);
  if (axis.tick) out.push(`  tickInterval ${axis.tick}`);

  const dated = model.nodes.filter((n) => n.when);
  const tid = ids(dated);
  const groups = new Map(model.groups.map((g) => [g.id, g]));
  const top = (n: ModelNode) => {
    let g = n.parent ? groups.get(n.parent) : undefined;
    for (let i = 0; g?.parent && i < 64; i++) g = groups.get(g.parent) ?? g;
    return g?.id ?? "";
  };
  const before = new Map<string, string[]>();
  for (const e of model.edges)
    if (tid.has(e.from) && tid.has(e.to) && e.from !== e.to)
      before.set(e.to, [...(before.get(e.to) ?? []), tid.get(e.from) ?? ""]);

  // Sections in lane order: the items in no group first, then each top-level group.
  const lanes = ["", ...model.groups.filter((g) => !g.parent).map((g) => g.id)].filter((id) =>
    dated.some((n) => top(n) === id),
  );
  const loose = dated.filter((n) => !top(n));
  for (const lane of lanes) {
    const label = lane
      ? groups.get(lane)?.label || lane
      : loose.every((n) => n.milestone)
        ? "Milestones"
        : "General";
    out.push(`  section ${name(label)}`);
    for (const n of dated.filter((x) => top(x) === lane)) {
      const w = n.when;
      if (!w) continue;
      const tag = n.status ? TAG[n.status] : undefined;
      const tags = tag ? [tag] : [];
      const deps = before.get(n.id) ?? [];
      const point = w.end === undefined || n.milestone;
      const at = n.milestone && w.end !== undefined ? w.end : w.start;
      let data: string[];
      if (point) data = [...tags, "milestone", tid.get(n.id) ?? "", at, "0d"];
      else
        data = [
          ...tags,
          tid.get(n.id) ?? "",
          deps.length ? `after ${deps.join(" ")}` : w.start,
          w.end ?? w.start,
        ];
      out.push(`    ${name(n.label) || n.id} :${data.join(", ")}`);
    }
  }
  return `${out.join("\n")}\n`;
}
