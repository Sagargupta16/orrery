// The state one parse shares across its steps, and the id helpers that read and fill it.
import type {
  Diagnostic,
  DiagramKind,
  LocalIcon,
  ModelEdge,
  ModelGroup,
  ModelNode,
  TagStyle,
} from "../types.ts";
import { ID_RE } from "./keys.ts";
import { isObj, type Obj, type Reporter } from "./values.ts";

/** Everything the steps of one parse read and fill, in the order parseSpec runs them. */
export interface Ctx extends Reporter {
  raw: Obj;
  filename: string;
  /** The diagram kind, set once the top-level settings are read; the kind keys check it. */
  kind: DiagramKind;
  diagnostics: Diagnostic[];
  ids: Map<string, "node" | "group">;
  localIcons: LocalIcon[];
  stages: string[];
  groups: ModelGroup[];
  nodes: ModelNode[];
  edges: ModelEdge[];
  /** Top-level `tags:` styles, read before the items that take their color and line. */
  tagStyles: Record<string, TagStyle>;
  /** Group `contains` lists, applied once every node and group exists. */
  pendingContains: [string, string[]][];
  /** Node `align` targets, checked once every node exists. */
  pendingAlign: [string, string][];
}

export function newContext(
  raw: Obj,
  filename: string,
  diagnostics: Diagnostic[],
  report: Reporter,
): Ctx {
  return {
    ...report,
    raw,
    filename,
    kind: "architecture",
    diagnostics,
    ids: new Map(),
    localIcons: [],
    stages: [],
    groups: [],
    nodes: [],
    edges: [],
    tagStyles: {},
    pendingContains: [],
    pendingAlign: [],
  };
}

/** Registers an id; false (and DG103) when another node or group already has it. */
export function claim(ctx: Ctx, id: string, kind: "node" | "group"): boolean {
  if (!ID_RE.test(id)) {
    ctx.err("DG103", `id "${id}" may only use letters, digits, "_", "-" and "."`, {
      subject: { id },
      fixes: [`rename to "${id.replace(/[^A-Za-z0-9_.-]+/g, "-")}"`],
    });
  }
  if (ctx.ids.has(id)) {
    ctx.err("DG103", `duplicate id "${id}" (used by a ${ctx.ids.get(id)} and a ${kind})`, {
      subject: { id },
      fixes: [`rename one of them, e.g. "${id}-2"`],
    });
    return false;
  }
  ctx.ids.set(id, kind);
  return true;
}

/** The [id, definition] pairs of a nodes or groups collection, as a mapping or a list. */
export function entries(ctx: Ctx, value: unknown, what: string): [string, unknown][] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.map((item, i): [string, unknown] => {
      if (isObj(item) && typeof item.id === "string") return [item.id, item];
      if (isObj(item) && Object.keys(item).length === 1) {
        const [k, v] = Object.entries(item)[0] as [string, unknown];
        return [k, v];
      }
      ctx.err("DG100", `${what}[${i}] needs an id`, {
        subject: { [what]: i },
        fixes: [`give the item an id: - { id: name, ... }, or use a mapping keyed by id`],
      });
      return [`__invalid_${i}`, undefined];
    });
  }
  if (isObj(value)) return Object.entries(value);
  ctx.err("DG100", `${what} must be a mapping of id to definition`, {
    subject: { where: what },
    fixes: [`write ${what}: { my-id: { ... } }`],
  });
  return [];
}
