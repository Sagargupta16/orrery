// The ELK side of layout: the JSON graph types, the vendored engine, runElk with its cache and
// fallback strategies, and helpers that find, count and move parts of a laid-out graph.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { vendorDir } from "../paths.ts";
import type { Point } from "../types.ts";
import { round } from "./geometry.ts";

export interface ElkLabel {
  id?: string;
  text?: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
}
export interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
  labels?: ElkLabel[];
  ports?: {
    id: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
  }[];
  layoutOptions?: Record<string, string>;
}
export interface ElkSection {
  startPoint: Point;
  endPoint: Point;
  bendPoints?: Point[];
}
export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  labels?: ElkLabel[];
  sections?: ElkSection[];
}
interface Elk {
  layout(graph: ElkNode): Promise<ElkNode>;
}

let elkInstance: Elk | undefined;
function elk(): Elk {
  if (elkInstance) return elkInstance;
  const require = createRequire(import.meta.url);
  const vendored = join(vendorDir, "elk.bundled.cjs");
  const ELK = require(
    existsSync(vendored) ? vendored : "elkjs/lib/elk.bundled.js",
  ) as new () => Elk;
  elkInstance = new ELK();
  return elkInstance;
}

export const ELK_DIRECTION = {
  right: "RIGHT",
  down: "DOWN",
  left: "LEFT",
  up: "UP",
} as const;
export const ELK_ROUTING = {
  orthogonal: "ORTHOGONAL",
  polyline: "POLYLINE",
  spline: "SPLINES",
} as const;

/** rank: first and last (elkjs 0.12 honors it inside groups too). */
export const LAYER_CONSTRAINT = "elk.layered.layering.layerConstraint";

export function findNode(n: ElkNode, id: string): ElkNode | undefined {
  if (n.id === id) return n;
  for (const c of n.children ?? []) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return undefined;
}

/** Moves a laid-out ELK node with everything in it: children, labels, ports and edges. */
export function moveElk(n: ElkNode, dx: number, dy: number): ElkNode {
  const at = <T extends { x?: number; y?: number }>(p: T): T => ({
    ...p,
    x: round((p.x ?? 0) + dx),
    y: round((p.y ?? 0) + dy),
  });
  const pt = (p: Point): Point => ({ x: round(p.x + dx), y: round(p.y + dy) });
  return {
    ...at(n),
    labels: n.labels?.map(at),
    ports: n.ports?.map(at),
    children: n.children?.map((c) => moveElk(c, dx, dy)),
    edges: n.edges?.map((e) => ({
      ...e,
      labels: e.labels?.map(at),
      sections: e.sections?.map((s) => ({
        startPoint: pt(s.startPoint),
        endPoint: pt(s.endPoint),
        bendPoints: s.bendPoints?.map(pt),
      })),
    })),
  };
}

export function findEdge(n: ElkNode, id: string): ElkEdge | undefined {
  for (const e of n.edges ?? []) if (e.id === id) return e;
  for (const c of n.children ?? []) {
    const f = findEdge(c, id);
    if (f) return f;
  }
  return undefined;
}

/**
 * ELK occasionally throws on unusual graphs; retry with simpler placement strategies before
 * giving up. `fallback` names the strategy that worked when it was not the first.
 */
// Every theme (and review's extra one) lays out the same graph, so ELK runs once per graph. An
// aspect search lays out six candidates, each with its own passes, so the cache keeps 64 runs.
const elkRuns = new Map<string, Promise<{ graph: ElkNode; fallback?: string }>>();

export async function runElk(root: ElkNode): Promise<{ graph: ElkNode; fallback?: string }> {
  const key = JSON.stringify(root);
  let run = elkRuns.get(key);
  if (!run) {
    run = runElkUncached(root);
    elkRuns.set(key, run);
    run.catch(() => elkRuns.delete(key));
    if (elkRuns.size > 64) {
      const oldest = elkRuns.keys().next().value;
      if (oldest !== undefined) elkRuns.delete(oldest);
    }
  }
  const { graph, fallback } = await run;
  // Callers adjust boxes in place, so each gets its own copy.
  return { graph: structuredClone(graph), fallback };
}

/** Edge segments of an ELK result that cross, between edges that share no node, and those nodes. */
export function crossings(graph: ElkNode): { count: number; nodes: Set<string> } {
  const nodeOf = (ref: string | undefined) => (ref ?? "").split("::")[0];
  const lines = (graph.edges ?? []).flatMap((e) => {
    const s = e.sections?.[0];
    if (!s) return [];
    const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint];
    const ends = [nodeOf(e.sources[0]), nodeOf(e.targets[0])];
    return [{ ends, segs: pts.slice(1).map((q, i) => [pts[i] ?? q, q] as const) }];
  });
  const cross = (a: Point, b: Point, c: Point, d: Point) => {
    const o = (p: Point, q: Point, r: Point) =>
      (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  let count = 0;
  const nodes = new Set<string>();
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (!a || !b || a.ends.some((x) => b.ends.includes(x))) continue;
      for (const [p, q] of a.segs)
        for (const [r, t] of b.segs)
          if (cross(p, q, r, t)) {
            count++;
            for (const x of [...a.ends, ...b.ends]) if (x) nodes.add(x);
          }
    }
  return { count, nodes };
}

async function runElkUncached(root: ElkNode): Promise<{ graph: ElkNode; fallback?: string }> {
  const fallbacks: [string | undefined, Record<string, string>][] = [
    [undefined, {}],
    [
      "brandes-koepf placement",
      {
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      },
    ],
    [
      "network-simplex layering, simple placement",
      {
        "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
        "elk.layered.nodePlacement.strategy": "SIMPLE",
      },
    ],
  ];
  let lastError: unknown;
  for (const [fallback, extra] of fallbacks) {
    const graph = applyOptions(structuredClone(root), extra);
    try {
      return { graph: await elk().layout(graph), fallback };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`layout failed: ${(lastError as Error)?.message ?? lastError}`);
}

function applyOptions(n: ElkNode, extra: Record<string, string>): ElkNode {
  if (n.layoutOptions && "elk.algorithm" in n.layoutOptions) Object.assign(n.layoutOptions, extra);
  for (const c of n.children ?? []) applyOptions(c, extra);
  return n;
}
