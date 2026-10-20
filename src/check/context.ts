// What every composition rule reads: the scene, the model, the options and one finding list.
import type { Box, Diagnostic, Model, Scene } from "../types.ts";

export interface CheckOptions {
  /** Widest the diagram should be before a layout hint fires (px). */
  maxWidth?: number;
}

/** A node's attach box, its drawn footprint and its label box. */
export interface NodeBox {
  id: string;
  box: Box;
  foot: Box;
  label: Box;
}

export interface CheckContext {
  scene: Scene;
  model: Model;
  opts: CheckOptions;
  /** The findings so far, in the order the rules push them. */
  out: Diagnostic[];
  warn: (code: string, message: string, extra?: Partial<Diagnostic>) => void;
  /** One per scene node, in scene order. */
  nodeBoxes: NodeBox[];
  /** The parent of every model node and group (undefined at the top level). */
  parentOf: Map<string, string | undefined>;
}

/** One rule (or a small family): reads the context and pushes its findings through `warn`. */
export type Rule = (ctx: CheckContext) => void;

export function checkContext(scene: Scene, model: Model, opts: CheckOptions): CheckContext {
  const out: Diagnostic[] = [];
  const warn = (code: string, message: string, extra: Partial<Diagnostic> = {}) => {
    out.push({ code, severity: "warning", message, ...extra });
  };
  const nodeBoxes = scene.nodes.map((n) => {
    // The drawn footprint: attach box plus the label underneath icon nodes.
    const parts = [n.box, n.iconBox, n.labelBox, n.noteBox].filter((b): b is Box => !!b && b.w > 0);
    const x = Math.min(...parts.map((b) => b.x));
    const y = Math.min(...parts.map((b) => b.y));
    const r = Math.max(...parts.map((b) => b.x + b.w));
    const bt = Math.max(...parts.map((b) => b.y + b.h));
    return { id: n.id, box: n.box, foot: { x, y, w: r - x, h: bt - y }, label: n.labelBox };
  });
  const parentOf = new Map<string, string | undefined>([
    ...model.nodes.map((x) => [x.id, x.parent] as const),
    ...model.groups.map((x) => [x.id, x.parent] as const),
  ]);
  return { scene, model, opts, out, warn, nodeBoxes, parentOf };
}
