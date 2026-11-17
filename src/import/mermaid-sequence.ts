// Mermaid sequenceDiagram -> a sequence spec: participants and actors in order of appearance
// (aliases become labels, boxes become groups), every message in order with orrery's line for
// its arrow, autonumber as step numbers, and loop, alt / else, opt, par / and, break and critical
// blocks as fragments. Notes have no place in the spec and are left out with a warning.
//
// Called from: src/import/mermaid.ts importMermaid for a diagram that starts with sequenceDiagram.

import {
  cleanLabel,
  type MermaidResult,
  semicolons,
  specIds,
  statements,
  writeSpec,
} from "./mermaid-text.ts";

/** Mermaid's arrows, longest first where one starts another. */
const ARROW = /<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->/;

/** orrery's edge for each arrow: calls solid, replies dashed, async signals dotted. */
const EDGE: Record<string, string> = {
  "->>": "->",
  "-->>": "-->",
  "->": "--",
  "-->": "---",
  "-x": "->",
  "--x": "-->",
  "-)": "..>",
  "--)": "..>",
  "<<->>": "<->",
  "<<-->>": "<-->",
};

const FRAGMENTS = new Set(["loop", "alt", "opt", "par", "break", "critical"]);

/** Colors a box may name before its label; anything else is the label's first word. */
const BOX_COLOR =
  /^(?:transparent|(?:rgba?|hsla?)\([^)]*\)|aqua|black|blue|brown|coral|cyan|fuchsia|gold|gray|grey|green|indigo|khaki|lavender|lightblue|lightgray|lightgreen|lightgrey|lightyellow|lime|magenta|maroon|navy|olive|orange|pink|purple|red|salmon|silver|teal|violet|white|yellow)(?: |$)/i;

/** Mermaid 11 participant types with an orrery shape. */
const TYPE_SHAPE: Record<string, string> = {
  actor: "person",
  database: "cylinder",
  queue: "queue",
  collections: "stack",
};

interface Participant {
  label?: string;
  shape?: string;
  group?: string;
}

interface Frame {
  type: string;
  label: string;
  /** The first message inside it (1-based); a box or rect frame holds no fragment. */
  from: number;
  else: { at: number; label: string }[];
}

export function importSequence(body: string, frontTitle?: string): MermaidResult {
  const warnings = new Set<string>();
  const participants = new Map<string, Participant>();
  const groups: { id: string; label: string }[] = [];
  const messages: { from: string; to: string; op: string; label: string; step?: number }[] = [];
  const fragments: {
    type: string;
    label: string;
    from: number;
    to: number;
    else: Frame["else"];
  }[] = [];
  const stack: Frame[] = [];
  let title = frontTitle;
  let subtitle: string | undefined;
  let box: string | undefined;
  let notes = 0;
  const skipped: string[] = [];
  // Mermaid numbers every message, shown or not: the count starts at 1 and steps by 1 until an
  // autonumber line says otherwise.
  let next = 1;
  let increment = 1;
  let numbered = false;

  const participant = (id: string) => {
    let p = participants.get(id);
    if (!p) {
      p = box ? { group: box } : {};
      participants.set(id, p);
    }
    return p;
  };

  for (const line of statements(body, semicolons)) {
    const word = (line.match(/^[A-Za-z]+/)?.[0] ?? "").toLowerCase();
    const rest = line.slice(word.length).trim();
    if (/^sequenceDiagram\b/i.test(line)) continue;
    const declared = line.match(/^(?:create )?(participant|actor) (.+?)(?: as (.+))?$/i);
    if (declared) {
      // Mermaid 11 writes a participant's type after its id: `db@{ "type": "database" }`.
      const [, keyword = "", named = ""] = declared;
      const data = named.endsWith("}") ? named.indexOf("@{") : -1;
      const p = participant((data < 0 ? named : named.slice(0, data)).trim());
      const type = named.match(/"type" ?: ?"(\w+)"/)?.[1]?.toLowerCase();
      const shape = TYPE_SHAPE[keyword.toLowerCase() === "actor" ? "actor" : (type ?? "")];
      if (shape) p.shape = shape;
      if (declared[3]) p.label = cleanLabel(declared[3]);
      continue;
    }
    if (word === "box") {
      const id = uniqueId("box", groups.length + 1, participants);
      const label = cleanLabel(rest.replace(BOX_COLOR, ""));
      groups.push({ id, label });
      box = id;
      stack.push({ type: "box", label, from: 0, else: [] });
      continue;
    }
    if (FRAGMENTS.has(word) || word === "rect") {
      stack.push({ type: word, label: cleanLabel(rest), from: messages.length + 1, else: [] });
      continue;
    }
    if (word === "else" || word === "and" || word === "option") {
      const frame = stack[stack.length - 1];
      const fits =
        (word === "else" && frame?.type === "alt") || (word === "and" && frame?.type === "par");
      if (frame && fits) frame.else.push({ at: messages.length + 1, label: cleanLabel(rest) });
      else
        warnings.add(
          `"${word}" branches outside alt and par are left out (orrery has no branches there)`,
        );
      continue;
    }
    if (word === "end" && !rest) {
      const frame = stack.pop();
      if (frame?.type === "box") box = undefined;
      else if (frame && FRAGMENTS.has(frame.type))
        closeFragment(frame, messages.length, fragments, warnings);
      continue;
    }
    if (word === "note") {
      notes++;
      continue;
    }
    if (word === "autonumber") {
      const [start, step] = rest.split(" ");
      if (start?.toLowerCase() === "off") numbered = false;
      else {
        numbered = true;
        if (start && Number.isInteger(Number(start))) next = Number(start);
        if (step && Number.isInteger(Number(step))) increment = Number(step);
      }
      continue;
    }
    if (word === "title") {
      title = cleanLabel(rest.replace(/^:/, ""));
      continue;
    }
    if (word === "accdescr" && rest.startsWith(":")) {
      subtitle = cleanLabel(rest.slice(1));
      continue;
    }
    // Activations, links and the like have no place in the spec; orrery draws activations itself.
    if (/^(activate|deactivate|destroy|acctitle|accdescr|links?|properties|details)$/.test(word))
      continue;
    const colon = line.indexOf(":");
    const head = colon < 0 ? line : line.slice(0, colon);
    const arrow = head.match(ARROW);
    const from = arrow ? head.slice(0, arrow.index).trim() : "";
    const to = arrow
      ? head
          .slice((arrow.index ?? 0) + arrow[0].length)
          .replace(/^ ?[+-]/, "")
          .trim()
      : "";
    if (!arrow || !from || !to) {
      skipped.push(line);
      continue;
    }
    participant(from);
    participant(to);
    if (arrow[0].endsWith("x")) warnings.add("lost messages (-x) are drawn with a plain arrowhead");
    messages.push({
      from,
      to,
      op: EDGE[arrow[0]] ?? "->",
      label: colon < 0 ? "" : cleanLabel(line.slice(colon + 1)),
      step: numbered ? next : undefined,
    });
    next += increment;
  }
  while (stack.length) {
    const frame = stack.pop();
    if (frame && FRAGMENTS.has(frame.type))
      closeFragment(frame, messages.length, fragments, warnings);
  }
  if (notes) warnings.add(`${notes} note(s) left out: a sequence spec has no notes`);
  if (skipped.length)
    warnings.add(`${skipped.length} line(s) not read, the first: ${skipped[0]?.slice(0, 60)}`);
  if (!participants.size) warnings.add("no participants or messages found");

  const ids = specIds([...participants.keys()], "p");
  const sid = (id: string) => ids.get(id) ?? id;
  const nodes: Record<string, Record<string, unknown>> = {};
  for (const [id, p] of participants) {
    const label = p.label ?? (sid(id) !== id ? cleanLabel(id) : undefined);
    nodes[sid(id)] = {
      ...(label ? { label } : {}),
      ...(p.shape ? { shape: p.shape } : {}),
      ...(p.group ? { in: p.group } : {}),
    };
  }
  const edges = messages.map((m) => {
    const key = `${sid(m.from)} ${m.op} ${sid(m.to)}`;
    if (m.step === undefined) return m.label ? `${key}: ${m.label}` : key;
    return { [key]: { ...(m.label ? { label: m.label } : {}), step: m.step } };
  });
  const doc: Record<string, unknown> = {};
  if (title) doc.title = title;
  if (subtitle) doc.subtitle = subtitle;
  doc.kind = "sequence";
  const used = groups.filter((g) => [...participants.values()].some((p) => p.group === g.id));
  if (used.length)
    doc.groups = Object.fromEntries(used.map((g) => [g.id, g.label ? { label: g.label } : {}]));
  doc.nodes = nodes;
  doc.edges = edges;
  if (fragments.length) {
    doc.fragments = fragments
      .sort((a, b) => a.from - b.from || b.to - a.to)
      .map((f) => ({
        type: f.type,
        ...(f.label ? { label: f.label } : {}),
        from: f.from,
        to: f.to,
        ...(f.else.length
          ? { else: f.else.map((e) => ({ at: e.at, ...(e.label ? { label: e.label } : {}) })) }
          : {}),
      }));
  }
  const header = [
    "Imported from a Mermaid sequenceDiagram by orrery. Add icons to the participants",
    "(orrery icons search <words>) and run orrery validate.",
  ];
  return { yaml: writeSpec(doc, header), warnings: [...warnings], guessed: {} };
}

/**
 * A closed block as a fragment over the messages it holds; one with none is left out, and so is a
 * branch that would start before its second message or at the same message as the one before.
 */
function closeFragment(
  frame: Frame,
  last: number,
  out: { type: string; label: string; from: number; to: number; else: Frame["else"] }[],
  warnings: Set<string>,
) {
  if (last < frame.from) {
    warnings.add(`an empty ${frame.type} block is left out`);
    return;
  }
  const branches: Frame["else"] = [];
  for (const b of frame.else) {
    const before = branches[branches.length - 1]?.at ?? frame.from;
    if (b.at > before && b.at <= last) branches.push(b);
    else warnings.add(`an empty branch of ${frame.type} "${frame.label}" is left out`);
  }
  out.push({ type: frame.type, label: frame.label, from: frame.from, to: last, else: branches });
}

/** `box-1`, `box-2`: the first that is not a participant's id. */
function uniqueId(base: string, start: number, taken: Map<string, unknown>): string {
  let k = start;
  while (taken.has(`${base}-${k}`)) k++;
  return `${base}-${k}`;
}
