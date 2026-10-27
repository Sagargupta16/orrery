// The outline: the groups and nodes sections, with one symbol per group and node in them.
import { isMap, isScalar, isSeq, type Pair, type ParsedNode } from "yaml";
import { contentEnd } from "../patch/text.ts";
import type { Located } from "./locate.ts";
import { type Range, rangeOf } from "./text.ts";

/** LSP SymbolKind values. */
const KIND = { module: 2, namespace: 3, object: 19 };

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

type PNode = ParsedNode;
type PPair = Pair<PNode, PNode | null>;

const text = (n: PNode | null | undefined) =>
  n && isScalar(n) && n.value !== null ? String(n.value) : undefined;

/** What a definition shows next to its id: the label, else the icon or group type. */
function detailOf(value: PNode | null, coll: "nodes" | "groups"): string | undefined {
  if (!value || isScalar(value)) return text(value);
  if (!isMap(value)) return undefined;
  const field = (k: string) => text((value.items as PPair[]).find((p) => text(p.key) === k)?.value);
  return field("label") ?? field(coll === "nodes" ? "icon" : "type");
}

/** Each entry of a nodes or groups section, as a mapping keyed by id or a list. */
function entries(
  section: PNode | null,
): { id: PNode; value: PNode | null; start: number; end: number }[] {
  if (isMap(section))
    return (section.items as PPair[]).map((p) => ({
      id: p.key,
      value: p.value,
      start: p.key.range[0],
      end: p.value ? contentEnd(p.value) : p.key.range[1],
    }));
  if (!isSeq(section)) return [];
  return (section.items as PNode[]).flatMap((item) => {
    if (!isMap(item)) return [];
    const pairs = item.items as PPair[];
    const idPair = pairs.find((p) => text(p.key) === "id");
    const span = { start: item.range[0], end: contentEnd(item) };
    if (idPair?.value) return [{ id: idPair.value, value: item, ...span }];
    const only = pairs.length === 1 ? pairs[0] : undefined;
    return only ? [{ id: only.key, value: only.value, ...span }] : [];
  });
}

export function documentSymbols(at: Located, starts: number[]): DocumentSymbol[] {
  const root = at.root;
  if (!isMap(root)) return [];
  const out: DocumentSymbol[] = [];
  for (const coll of ["groups", "nodes"] as const) {
    const pair = (root.items as PPair[]).find((p) => text(p.key) === coll);
    if (!pair) continue;
    const children = entries(pair.value).map(
      ({ id, value, start, end }): DocumentSymbol => ({
        name: text(id) || "?",
        ...(detailOf(value, coll) ? { detail: detailOf(value, coll) } : {}),
        kind: coll === "groups" ? KIND.namespace : KIND.object,
        range: rangeOf(starts, { start, end: Math.max(end, id.range[1]) }),
        selectionRange: rangeOf(starts, { start: id.range[0], end: id.range[1] }),
      }),
    );
    const end = pair.value ? contentEnd(pair.value) : pair.key.range[1];
    out.push({
      name: coll,
      detail: `${children.length} ${coll}`,
      kind: KIND.module,
      range: rangeOf(starts, { start: pair.key.range[0], end: Math.max(end, pair.key.range[1]) }),
      selectionRange: rangeOf(starts, { start: pair.key.range[0], end: pair.key.range[1] }),
      children,
    });
  }
  return out;
}
