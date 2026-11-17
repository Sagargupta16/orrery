// Mermaid stateDiagram-v2 (and stateDiagram) -> a state spec: states with their descriptions as
// labels, [*] as the initial and final pseudostates of the composite it is written in, composite
// states as groups, <<choice>> as a decision diamond, and every transition with its label.
//
// Called from: src/import/mermaid.ts importMermaid for a diagram that starts with stateDiagram.

import { cleanLabel, type MermaidResult, specIds, statements, writeSpec } from "./mermaid-text.ts";

const DIRECTIONS: Record<string, string> = { LR: "right", RL: "left", TB: "down", BT: "up" };

interface State {
  label?: string;
  kind: "state" | "initial" | "final" | "choice" | "bar";
  parent?: string;
}

/** The shape each kind of state draws as; a fork or join bar has none of its own. */
const SHAPE: Record<State["kind"], string> = {
  state: "state",
  initial: "initial",
  final: "final",
  choice: "diamond",
  bar: "state",
};

const TRANSITION = /^([^\s:]+) ?--> ?([^\s:]+)(?: ?: ?(.*))?$/;
const STATE = /^state (?:"([^"]*)" as )?([^\s{:"]+)(?: (<<\w+>>))?(?: ?(\{))?$/;
const DESCRIPTION = /^([^\s:"]+) ?: ?(.*)$/;

export function importState(body: string, frontTitle?: string): MermaidResult {
  const warnings = new Set<string>();
  const states = new Map<string, State>();
  const groups = new Map<string, { label?: string; parent?: string }>();
  const transitions: { from: string; to: string; label: string }[] = [];
  const scope: string[] = [];
  let direction = "down";
  let subtitle: string | undefined;
  let inNote = false;
  let notes = 0;
  const skipped: string[] = [];

  const here = () => scope[scope.length - 1];
  /** A state is its own where it is first named, as Mermaid places it. */
  const state = (id: string) => {
    let s = states.get(id);
    if (!s && !groups.has(id)) {
      s = { kind: "state", parent: here() };
      states.set(id, s);
    }
    return s;
  };
  /** [*]: the initial pseudostate of this composite as a source, its final one as a target. */
  const end = (ref: string, as: "initial" | "final") => {
    if (ref !== "[*]") {
      state(ref);
      return ref;
    }
    const id = `${here() ? `${here()} ` : ""}[*]${as === "initial" ? "start" : "end"}`;
    if (!states.has(id)) states.set(id, { kind: as, parent: here() });
    return id;
  };

  for (const raw of statements(body, (l) => [l])) {
    // Class names (`a:::hot`) only style a state.
    const line = raw.replace(/:::[\w-]+/g, "");
    if (inNote) {
      inNote = !/^end note$/i.test(line);
      continue;
    }
    if (/^stateDiagram(-v2)?\b/i.test(line)) continue;
    if (/^note /i.test(line)) {
      notes++;
      inNote = !line.includes(":");
      continue;
    }
    const dir = line.match(/^direction (TB|BT|LR|RL)$/i);
    if (dir) {
      if (!scope.length) direction = DIRECTIONS[(dir[1] ?? "").toUpperCase()] ?? direction;
      continue;
    }
    const descr = line.match(/^accDescr ?: ?(.*)$/);
    if (descr) {
      subtitle = cleanLabel(descr[1] ?? "");
      continue;
    }
    if (/^(accTitle|classDef|class|style)\b/.test(line)) continue;
    if (line === "}") {
      scope.pop();
      continue;
    }
    if (line === "--") {
      warnings.add("concurrent regions (--) are drawn as one region");
      continue;
    }
    const t = line.match(TRANSITION);
    if (t) {
      const from = end(t[1] ?? "", "initial");
      const to = end(t[2] ?? "", "final");
      transitions.push({ from, to, label: cleanLabel(t[3] ?? "") });
      continue;
    }
    const s = line.match(STATE);
    if (s) {
      const [, label, id = "", stereo, open] = s;
      if (open) {
        // A composite: a group from here on, even when a transition named it first.
        const known = states.get(id);
        states.delete(id);
        const g = groups.get(id) ?? { label: known?.label, parent: known?.parent ?? here() };
        if (label) g.label = cleanLabel(label);
        groups.set(id, g);
        scope.push(id);
        continue;
      }
      const st = state(id);
      if (st && label) st.label = cleanLabel(label);
      if (st && stereo === "<<choice>>") st.kind = "choice";
      else if (st && (stereo === "<<fork>>" || stereo === "<<join>>")) {
        st.kind = "bar";
        warnings.add("fork and join bars are drawn as states");
      }
      continue;
    }
    const d = line.match(DESCRIPTION);
    if (d) {
      const id = d[1] ?? "";
      const text = cleanLabel(d[2] ?? "");
      const g = groups.get(id);
      const target = g ?? state(id);
      // Mermaid stacks each description line under the name; a label joins them.
      if (target) target.label = target.label ? `${target.label} ${text}` : text;
      continue;
    }
    if (/^[^\s:"{}]+$/.test(line)) {
      state(line);
      continue;
    }
    skipped.push(line);
  }
  if (notes) warnings.add(`${notes} note(s) left out: a state spec has no notes`);
  if (skipped.length)
    warnings.add(`${skipped.length} line(s) not read, the first: ${skipped[0]?.slice(0, 60)}`);
  if (!states.size) warnings.add("no states found");

  const ids = specIds([...groups.keys(), ...states.keys()], "state");
  const sid = (id: string) => ids.get(id) ?? id;
  const doc: Record<string, unknown> = {};
  if (frontTitle) doc.title = frontTitle;
  if (subtitle) doc.subtitle = subtitle;
  doc.kind = "state";
  doc.direction = direction;
  if (groups.size) {
    doc.groups = Object.fromEntries(
      [...groups].map(([id, g]) => [
        sid(id),
        {
          type: "zone",
          label: g.label || id,
          ...(g.parent ? { in: sid(g.parent) } : {}),
        },
      ]),
    );
  }
  doc.nodes = Object.fromEntries(
    [...states].map(([id, s]) => {
      const pseudo = s.kind === "initial" || s.kind === "final";
      const label = s.label || (pseudo || sid(id) === id ? undefined : id);
      return [
        sid(id),
        {
          shape: SHAPE[s.kind],
          ...(label ? { label } : {}),
          ...(s.parent ? { in: sid(s.parent) } : {}),
        },
      ];
    }),
  );
  doc.edges = transitions.map(
    (t) => `${sid(t.from)} -> ${sid(t.to)}${t.label ? `: ${t.label}` : ""}`,
  );
  const header = [
    "Imported from a Mermaid stateDiagram by orrery. Write transitions as event [guard] / action",
    "and run orrery validate.",
  ];
  return { yaml: writeSpec(doc, header), warnings: [...warnings], guessed: {} };
}
