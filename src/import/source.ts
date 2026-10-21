// YAML and JSON sources with line numbers, for evidence: every importer that reads a file says
// where in it each node, group and edge came from. CloudFormation's short tags (!Ref, !GetAtt,
// !Sub ...) parse into their long forms, so templates read the same in YAML and JSON.
import { readFileSync } from "node:fs";
import {
  type Document,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  type Node,
  parseAllDocuments,
  type Tags,
} from "yaml";

export interface Source {
  doc: Document;
  lines: LineCounter;
  /** The document as plain data. */
  data: unknown;
}

const INTRINSICS = [
  "Ref",
  "Condition",
  "GetAtt",
  "Sub",
  "Join",
  "Select",
  "Split",
  "If",
  "Equals",
  "Not",
  "And",
  "Or",
  "FindInMap",
  "ImportValue",
  "GetAZs",
  "Base64",
  "Cidr",
  "Transform",
  "ToJsonString",
  "Length",
];

/** `!Ref X` is `{ Ref: X }`, `!GetAtt A.B` is `{ "Fn::GetAtt": [A, B] }`, the rest `Fn::<name>`. */
const CFN_TAGS: Tags = INTRINSICS.flatMap((name) => {
  const key = name === "Ref" || name === "Condition" ? name : `Fn::${name}`;
  return [
    {
      tag: `!${name}`,
      resolve: (s: string) => ({ [key]: name === "GetAtt" ? s.split(/\.(.*)/s, 2) : s }),
    },
    {
      tag: `!${name}`,
      collection: "seq" as const,
      resolve: (seq: { toJSON(): unknown }) => ({ [key]: seq.toJSON() }),
    },
    {
      tag: `!${name}`,
      collection: "map" as const,
      resolve: (map: { toJSON(): unknown }) => ({ [key]: map.toJSON() }),
    },
  ];
});

/** Every document in a YAML (or JSON) file, with a shared line counter. */
export function readSources(file: string, opts: { cfn?: boolean } = {}): Source[] {
  const text = readFileSync(file, "utf8");
  const lines = new LineCounter();
  const docs = parseAllDocuments(text, {
    lineCounter: lines,
    ...(opts.cfn ? { customTags: CFN_TAGS } : {}),
    // Compose files share settings through `<<: *defaults`.
    merge: true,
    uniqueKeys: false,
  });
  const list = Array.isArray(docs) ? docs : [];
  const out: Source[] = [];
  for (const doc of list) {
    const first = doc.errors[0];
    if (first) throw new Error(`${file}: ${first.message.split("\n")[0]}`);
    out.push({ doc, lines, data: doc.toJS({ maxAliasCount: -1 }) });
  }
  return out;
}

/**
 * The line a path into the document starts on: for a mapping key, the key's own line (where its
 * name is written); for a list item, the item's line.
 */
export function lineOf(src: Source, path: (string | number)[]): number | undefined {
  let node: unknown = src.doc.contents;
  let start: number | undefined;
  for (const step of path) {
    if (isAlias(node)) node = node.resolve(src.doc);
    if (isMap(node)) {
      const pair = pairIn(src, node, String(step));
      if (!pair) return start === undefined ? undefined : src.lines.linePos(start).line;
      start = (pair.key as Node).range?.[0];
      node = pair.value;
    } else if (isSeq(node) && typeof step === "number") {
      const item = node.items[step] as Node | undefined;
      if (!item) return undefined;
      start = item.range?.[0];
      node = item;
    } else return start === undefined ? undefined : src.lines.linePos(start).line;
  }
  return start === undefined ? undefined : src.lines.linePos(start).line;
}

/** A key in a mapping, or in the mappings it merges with `<<: *anchor` (where the key is written). */
function pairIn(
  src: Source,
  map: unknown,
  key: string,
  depth = 0,
): { key: unknown; value: unknown } | undefined {
  if (isAlias(map)) return pairIn(src, map.resolve(src.doc), key, depth);
  if (!isMap(map) || depth > 8) return undefined;
  const own = map.items.find((p) => isScalar(p.key) && String(p.key.value) === key);
  if (own) return own;
  for (const p of map.items) {
    // The parser marks a merge key with a symbol whose description is "<<".
    const k = isScalar(p.key) ? p.key.value : undefined;
    if (k !== "<<" && !(typeof k === "symbol" && k.description === "<<")) continue;
    for (const source of isSeq(p.value) ? p.value.items : [p.value]) {
      const found = pairIn(src, source, key, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

export type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const asList = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];

export const text = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
