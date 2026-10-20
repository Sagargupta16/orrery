// Completion while typing, read from the line up to the cursor so it works while the YAML is
// half written: icon ids after icon: (ranked by searchIcons), group types after type:, ids after
// in:, align:, on: and in edge lines, and the top-level keys.
import { allIcons, type IconInfo, PACK_ORDER, packInfo, searchIcons } from "../icons/index.ts";
import { GROUP_KEYS, NODE_KEYS, TOP_KEYS } from "../spec/keys.ts";
import { GROUP_STYLES, groupStyleKeys } from "../styles.ts";
import type { Position } from "./text.ts";

/** LSP CompletionItemKind values. */
const KIND = { module: 9, property: 10, value: 12, reference: 18, enumMember: 20 };
const LIMIT = 50;

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  sortText: string;
  filterText: string;
  textEdit: { range: { start: Position; end: Position }; newText: string };
  command?: { title: string; command: string };
}

export interface Ids {
  nodes: string[];
  groups: string[];
}

interface Option {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insert?: string;
  /** Opens the list again after inserting, for a pack prefix such as `aws:`. */
  again?: boolean;
}

/**
 * The top-level key whose section holds this line: the nearest line at or above it that starts
 * in column 0, skipping comments and list items (a block list may sit at its key's indent).
 */
function sectionOf(lines: string[], line: number, before: string): string | undefined {
  for (let i = line; i >= 0; i--) {
    const text = i === line ? before : (lines[i] ?? "");
    if (!text.trim() || /^[\s#-]/.test(text)) continue;
    return /^["']?([A-Za-z_$][\w$-]*)["']?\s*:/.exec(text)?.[1];
  }
  return undefined;
}

function iconOptions(prefix: string): Option[] {
  if (!prefix)
    return PACK_ORDER.map((p) => ({
      label: `${p}:`,
      kind: KIND.module,
      detail: packInfo()[p]?.title,
      again: true,
    }));
  const [pack, rest] = prefix.includes(":") ? prefix.split(":", 2) : [undefined, prefix];
  const found: IconInfo[] =
    pack && !rest
      ? allIcons()
          .filter((i) => i.pack === pack.toLowerCase())
          .slice(0, LIMIT)
      : searchIcons(prefix, { limit: LIMIT });
  return found.map((i) => ({
    label: i.id,
    kind: KIND.value,
    detail: i.name,
    documentation: `${packInfo()[i.pack]?.title ?? i.pack}, ${i.category}`,
  }));
}

/** Words that start with the prefix first, then the ones that contain it, each in their order. */
function matching(words: string[], prefix: string): string[] {
  const p = prefix.toLowerCase();
  const starts = words.filter((w) => w.toLowerCase().startsWith(p));
  return [...starts, ...words.filter((w) => !starts.includes(w) && w.toLowerCase().includes(p))];
}

function typeOptions(prefix: string): Option[] {
  return matching(groupStyleKeys(), prefix).map((k) => ({
    label: k,
    kind: KIND.enumMember,
    detail: GROUP_STYLES[k]?.label || undefined,
  }));
}

const idOptions = (ids: string[], prefix: string, what: string): Option[] =>
  matching(ids, prefix).map((id) => ({ label: id, kind: KIND.reference, detail: what }));

/** What the cursor is typing, and the options for it. */
function optionsAt(
  lines: string[],
  pos: Position,
  ids: Ids,
  present: string[],
): { prefix: string; options: Option[] } | undefined {
  const before = (lines[pos.line] ?? "").replace(/\r$/, "").slice(0, pos.character);
  const section = sectionOf(lines, pos.line, before);
  const icon = /(?:^|[\s{,])icon:\s+["']?([\w:.-]*)$/.exec(before)?.[1];
  if (icon !== undefined) return { prefix: icon, options: iconOptions(icon) };
  // The short forms: `db: aws:rds` (a node's icon) and `vpc: aws:vpc` (a group's type).
  const short = /^\s+["']?([\w.-]+)["']?:\s+["']?([a-z0-9]+:[\w.-]*)$/i.exec(before);
  if (short && section === "nodes" && !NODE_KEYS.includes(short[1] ?? ""))
    return { prefix: short[2] ?? "", options: iconOptions(short[2] ?? "") };
  if (short && section === "groups" && !GROUP_KEYS.includes(short[1] ?? ""))
    return { prefix: short[2] ?? "", options: typeOptions(short[2] ?? "") };
  const type = /(?:^|[\s{,])(?:type|style|kind):\s+["']?([\w:.-]*)$/.exec(before)?.[1];
  if (type !== undefined && section === "groups")
    return { prefix: type, options: typeOptions(type) };
  const ref =
    /(?:^|[\s{,])(in|parent|group|on|align|from|to|source|target):\s+["']?([\w.-]*)$/.exec(before);
  if (ref && section !== undefined && ["nodes", "groups", "edges"].includes(section)) {
    const [, key = "", prefix = ""] = ref;
    if (key === "align") return { prefix, options: idOptions(ids.nodes, prefix, "node") };
    if (["from", "to", "source", "target"].includes(key))
      return {
        prefix,
        options: [
          ...idOptions(ids.nodes, prefix, "node"),
          ...idOptions(ids.groups, prefix, "group"),
        ],
      };
    return { prefix, options: idOptions(ids.groups, prefix, "group") };
  }
  // An edge line: the id being typed, unless the cursor is in the label after ": ".
  const edge = /^\s*-\s+["']?(.*)$/.exec(before)?.[1];
  if (edge !== undefined && section === "edges" && !/:\s|[{]/.test(edge)) {
    const prefix = /[A-Za-z0-9_][\w.-]*$/.exec(edge)?.[0] ?? "";
    if (prefix || /(^|[\s,>])$/.test(edge))
      return {
        prefix,
        options: [
          ...idOptions(ids.nodes, prefix, "node"),
          ...idOptions(ids.groups, prefix, "group"),
        ],
      };
  }
  if (/^[A-Za-z$]*$/.test(before)) {
    const keys = TOP_KEYS.filter((k) => !present.includes(k) || k === before);
    return {
      prefix: before,
      options: matching(keys, before).map((k) => ({
        label: k,
        kind: KIND.property,
        insert: `${k}: `,
      })),
    };
  }
  return undefined;
}

/**
 * The completion list at a position. It is always incomplete: the editor asks again on the next
 * keystroke, so icon ranking follows the whole id typed so far.
 */
export function complete(
  text: string,
  pos: Position,
  ids: Ids,
  present: string[],
): { isIncomplete: boolean; items: CompletionItem[] } {
  const found = optionsAt(text.split("\n"), pos, ids, present);
  if (!found) return { isIncomplete: false, items: [] };
  const { prefix } = found;
  const range = { start: { line: pos.line, character: pos.character - prefix.length }, end: pos };
  const items = found.options.map((o, i): CompletionItem => {
    const insert = o.insert ?? o.label;
    return {
      label: o.label,
      kind: o.kind,
      ...(o.detail ? { detail: o.detail } : {}),
      ...(o.documentation ? { documentation: o.documentation } : {}),
      sortText: String(i).padStart(4, "0"),
      // A match the editor's own filter would drop (search found "aws:lambda" for "lamb") keeps
      // the typed text in front, so the ranked list survives.
      filterText: o.label.toLowerCase().startsWith(prefix.toLowerCase())
        ? o.label
        : `${prefix} ${o.label}`,
      textEdit: { range, newText: insert },
      ...(o.again ? { command: { title: "icons", command: "editor.action.triggerSuggest" } } : {}),
    };
  });
  return { isIncomplete: true, items };
}
