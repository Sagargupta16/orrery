// Applies ops to the spec text in order: each op checked, the YAML re-parsed after every edit.
import { isMap, parseDocument } from "yaml";
import { edgeOp } from "./edges.ts";
import { moveOp, pathOp, type Step } from "./ops.ts";
import { applyEdits, isRecord, type View } from "./text.ts";
import { PatchError, type PatchOp } from "./types.ts";

const OPS = ["set", "unset", "add", "move", "edge"];

function checkOp(op: unknown): asserts op is PatchOp {
  if (!isRecord(op))
    throw new PatchError("an op must be a mapping such as { op: set, path, value }");
  if (!OPS.includes(String(op.op)))
    throw new PatchError(`unknown op "${String(op.op)}"; use ${OPS.join(", ")}`);
  if (op.op !== "edge" && (typeof op.path !== "string" || !op.path))
    throw new PatchError(`${op.op} needs a path such as nodes.db.note`);
  if ((op.op === "set" || op.op === "add") && op.value === undefined)
    throw new PatchError(`${op.op} needs a value`);
  if (op.op === "move" && (op.after === undefined) === (op.before === undefined))
    throw new PatchError("move needs one of after or before");
  if (op.op === "edge") {
    if (!("match" in op) || (op.match !== null && typeof op.match !== "string"))
      throw new PatchError("edge needs match: an edge line such as api -> db, or null to add one");
    if (!("value" in op))
      throw new PatchError("edge needs value: the new edge, or null to remove it");
  }
}

const short = (v: unknown) => {
  // JSON.stringify(undefined) is undefined: an op missing its value still gets described.
  const s = typeof v === "string" ? v : (JSON.stringify(v) ?? String(v));
  return s.length > 48 ? `${s.slice(0, 45)}...` : s;
};

/** One line per op, as the ledger writes it: `set direction down`, `move nodes.db after api`. */
export function describeOp(op: PatchOp): string {
  if (!isRecord(op)) return short(op);
  switch (op.op) {
    case "set":
    case "add":
      return `${op.op} ${op.path} ${short(op.value)}`;
    case "unset":
      return `unset ${op.path}`;
    case "move":
      if (op.after !== undefined) return `move ${op.path} after ${op.after}`;
      return op.before !== undefined ? `move ${op.path} before ${op.before}` : `move ${op.path}`;
    case "edge":
      if (op.match === null) return `edge add ${short(op.value)}`;
      if (op.value === null) return `edge remove ${op.match}`;
      return `edge ${op.match} => ${short(op.value)}`;
    default:
      return short(op);
  }
}

function applyOne(text: string, op: PatchOp, depth = 0): string {
  const doc = parseDocument(text);
  const bad = doc.errors[0];
  if (bad) throw new PatchError(`the spec is not valid YAML: ${bad.message.split("\n")[0]}`);
  const root = doc.contents;
  if (!isMap(root)) throw new PatchError("the spec must be a mapping");
  const v: View = { text, json: /^\s*\{/.test(text) };
  let step: Step;
  if (op.op === "move") step = moveOp(v, root, op);
  else if (op.op === "edge") {
    const js: unknown = doc.toJS();
    step = { edits: edgeOp(v, root, isRecord(js) ? js.edges : undefined, op) };
  } else step = pathOp(v, root, op);
  const out = applyEdits(text, step.edits);
  const check = parseDocument(out).errors[0];
  if (check) throw new PatchError(`the edit made invalid YAML: ${check.message.split("\n")[0]}`);
  return step.again && depth === 0 ? applyOne(out, op, 1) : out;
}

/** The spec text with the ops applied in order, comments and key order kept. Throws PatchError. */
export function applyPatches(source: string, ops: PatchOp[]): string {
  if (!ops.length) return source;
  // Edits work on "\n" lines; a CRLF spec (a Windows checkout) gets its CRLF back at the end.
  const crlf = source.includes("\r\n");
  let text = crlf ? source.replace(/\r\n/g, "\n") : source;
  // Moves and appends work on whole lines, so the last line needs its newline.
  if (!text.endsWith("\n")) text += "\n";
  for (const [i, op] of ops.entries()) {
    try {
      checkOp(op);
      text = applyOne(text, op);
    } catch (e) {
      if (e instanceof PatchError)
        throw new PatchError(`op ${i + 1} (${describeOp(op)}): ${e.message}`);
      throw e;
    }
  }
  return crlf ? text.replace(/\n/g, "\r\n") : text;
}
