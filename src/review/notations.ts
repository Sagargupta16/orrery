// Conventions of the diagram kinds that carry their own notation: BPMN processes, flowcharts,
// UML state machines and customer journeys. Each returns its metrics for the conventions dimension.
import type { DiagramKind, ModelEdge } from "../types.ts";
import { edgeName, travel } from "./names.ts";
import type { Ctx } from "./types.ts";

/** The notation rubric each diagram kind is judged by (references/review/conventions-<name>.md). */
export const NOTATIONS: Partial<Record<DiagramKind, string>> = {
  process: "bpmn",
  flowchart: "flowchart",
  state: "state",
  journey: "journey",
};

/** A process as BPMN reads it: element kinds, pools, and the sequence flows between them. */
interface BpmnGraph {
  bpmn: Map<string, string>;
  pools: Set<string>;
  poolOf: (id: string) => string | undefined;
  data: (id: string) => boolean;
  seq: ModelEdge[];
  outOf: (id: string) => ModelEdge[];
}

function bpmnGraph(c: Ctx): BpmnGraph {
  const { model } = c;
  const bpmn = new Map(model.nodes.map((n) => [n.id, n.bpmn ?? ""]));
  const pools = new Set(model.groups.filter((g) => g.type === "pool").map((g) => g.id));
  const poolOf = (id: string): string | undefined => {
    for (let p: string | undefined = id; p; p = c.parentOf(p)) if (pools.has(p)) return p;
    return undefined;
  };
  const data = (id: string) => (bpmn.get(id) ?? "").startsWith("data-");
  // Sequence flows: the order of work, not messages, annotations or data.
  const seq = model.edges.filter(
    (e) => e.flow !== "message" && e.flow !== "association" && !data(e.from) && !data(e.to),
  );
  const outOf = (id: string) => seq.filter((e) => travel(e)[0] === id);
  return { bpmn, pools, poolOf, data, seq, outOf };
}

/** BPMN 2.0 (OMG) and the naming practice the rubric quotes: what the spec alone can show. */
function measureBpmn(c: Ctx): Record<string, number> {
  const g = bpmnGraph(c);
  const startEnd = bpmnStartEnd(c, g);
  const gateways = bpmnGateways(c, g);
  const joins = bpmnJoins(c, g);
  const boundary = bpmnPools(c, g);
  return { startEnd, gateways, joins, poolBoundary: boundary };
}

/**
 * BPMN-01: every drawn process starts and ends at an event (a black-box pool has neither; a
 * flow that leaves its pool is BPMN-07's finding, not a process drawn in the other pool).
 */
function bpmnStartEnd(c: Ctx, { poolOf, seq }: BpmnGraph): number {
  const { model, add } = c;
  const where = (pool: string | undefined) =>
    pool ? `the process in pool "${pool}"` : "the process";
  let startEnd = 0;
  const drawn = [
    ...new Set(seq.filter((e) => poolOf(e.from) === poolOf(e.to)).map((e) => poolOf(e.from))),
  ];
  for (const pool of drawn) {
    const kinds = model.nodes.filter((n) => poolOf(n.id) === pool).map((n) => n.bpmn ?? "");
    const start = kinds.some((k) => k.startsWith("start"));
    const end = kinds.some((k) => k.startsWith("end"));
    if (start && end) continue;
    startEnd++;
    const lacks = [...(start ? [] : ["start event"]), ...(end ? [] : ["end event"])];
    const unknown = [...(start ? [] : ["what triggers it"]), ...(end ? [] : ["how it ends"])];
    add(
      "conventions.bpmn-start-end",
      "major",
      pool ? [pool] : [],
      { pool: pool ?? "(none)", lacks: lacks.join(",") },
      `${where(pool)} has no ${lacks.join(" and no ")}, so readers cannot tell ${unknown.join(" or ")}`,
      [
        ...(start
          ? []
          : [
              "add a node with bpmn: start named for its trigger (Order received) before the first task",
            ]),
        ...(end
          ? []
          : [
              "add a node with bpmn: end named for the end state (Order shipped) after each last task",
            ]),
      ],
      8,
    );
  }
  return startEnd;
}

/** BPMN-04: a deciding gateway asks a question and each branch answers it. */
function bpmnGateways(c: Ctx, { outOf }: BpmnGraph): number {
  const { model, add } = c;
  let gateways = 0;
  for (const n of model.nodes) {
    if (n.bpmn !== "exclusive" && n.bpmn !== "inclusive") continue;
    const outs = outOf(n.id);
    if (outs.length < 2) continue;
    // The default flow is marked by its slash and taken when no condition holds.
    const bare = outs.filter((e) => !e.label && e.flow !== "default");
    if (n.label && !bare.length) continue;
    gateways++;
    const lacks = [
      ...(n.label ? [] : ["no question"]),
      ...(bare.length ? [`no condition on ${bare.length} of its ${outs.length} branches`] : []),
    ];
    add(
      "conventions.bpmn-gateway",
      bare.length ? "major" : "minor",
      [n.id, ...bare.map((e) => e.id)],
      { gateway: n.id, kind: n.bpmn, branches: outs.length, unlabelled: bare.length },
      `the ${n.bpmn} gateway "${n.id}" splits the flow with ${lacks.join(" and ")}`,
      [
        ...(n.label ? [] : [`set label: <a question, for example Order valid?> on "${n.id}"`]),
        ...bare
          .slice(0, 1)
          .map((e) => `label each branch with its answer: - ${edgeName(e)}: "Yes"`),
      ],
      bare.length ? 8 : 4,
    );
  }
  return gateways;
}

/** BPMN-06: branches a parallel gateway starts meet again at a gateway that waits for them. */
function bpmnJoins(c: Ctx, { bpmn, outOf }: BpmnGraph): number {
  const { model, add } = c;
  let joins = 0;
  const reach = (from: string) => {
    const dist = new Map([[from, 0]]);
    for (let queue = [from]; queue.length; ) {
      const v = queue.shift() ?? "";
      for (const e of outOf(v)) {
        const w = travel(e)[1];
        if (!dist.has(w)) {
          dist.set(w, (dist.get(v) ?? 0) + 1);
          queue.push(w);
        }
      }
    }
    return dist;
  };
  for (const n of model.nodes) {
    if (n.bpmn !== "parallel") continue;
    const outs = outOf(n.id);
    if (outs.length < 2) continue;
    const maps = outs.map((e) => reach(travel(e)[1]));
    // Where the branches first meet: the node every branch reaches soonest.
    let meet: { id: string; worst: number; sum: number } | undefined;
    for (const id of maps[0]?.keys() ?? []) {
      const ds = maps.map((m) => m.get(id));
      if (id === n.id || ds.some((d) => d === undefined)) continue;
      const worst = Math.max(...ds.map(Number));
      const sum = ds.reduce((s: number, d) => s + Number(d), 0);
      if (!meet || worst < meet.worst || (worst === meet.worst && sum < meet.sum))
        meet = { id, worst, sum };
    }
    const k = meet ? (bpmn.get(meet.id) ?? "") : "";
    if (!meet || k === "parallel" || k === "inclusive" || k === "complex" || k.startsWith("end"))
      continue;
    joins++;
    add(
      "conventions.bpmn-join",
      "major",
      [n.id, meet.id],
      { split: n.id, meet: meet.id, meetKind: k || "plain node", branches: outs.length },
      `the ${outs.length} parallel branches out of "${n.id}" meet at "${meet.id}"${k ? ` (${k})` : ""}, which does not wait for them, so it runs ${outs.length} times`,
      [
        `add a node with bpmn: parallel where the branches meet, and lead every branch into it, then on to "${meet.id}"`,
      ],
      8,
    );
  }
  return joins;
}

/** BPMN-07: messages run between pools; a process never leaves its pool. */
function bpmnPools(c: Ctx, { pools, poolOf, data }: BpmnGraph): number {
  const { model, add } = c;
  let boundary = 0;
  for (const e of model.edges) {
    if (e.flow === "association" || data(e.from) || data(e.to)) continue;
    const a = poolOf(e.from);
    const b = poolOf(e.to);
    const message = e.flow === "message";
    if (message ? a !== b : !pools.size || a === b) continue;
    boundary++;
    const named = (p: string | undefined) => (p ? `pool "${p}"` : "no pool");
    add(
      "conventions.bpmn-pools",
      "major",
      [e.id],
      { edge: edgeName(e), flow: e.flow ?? "sequence", from: a ?? "(none)", to: b ?? "(none)" },
      message
        ? `the message flow ${edgeName(e)} stays inside ${named(a)}; message flows connect two pools`
        : `the sequence flow ${edgeName(e)} crosses from ${named(a)} to ${named(b)}; a process stays in its pool`,
      message
        ? [
            "put the other participant in its own group with type: pool",
            "drop flow: message so it is a sequence flow",
          ]
        : ["set flow: message on it (pools talk by messages)", "move both ends into one pool"],
      10,
    );
  }
  return boundary;
}

/** Flowcharts (ISO 5807; the rubric quotes ANSI X3.5): terminators and decisions. */
function measureFlowchart(c: Ctx): Record<string, number> {
  const { model, add } = c;
  const nodes = new Set(model.nodes.map((n) => n.id));
  const edges = model.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));
  const ins = (id: string) => edges.filter((e) => travel(e)[1] === id);
  const outs = (id: string) => edges.filter((e) => travel(e)[0] === id);

  // FC-01: one start terminator, and every path ends at one.
  const pills = model.nodes.filter((n) => n.look === "shape" && n.shape === "pill");
  const starts = pills.filter((n) => !ins(n.id).length && outs(n.id).length);
  const ends = pills.filter((n) => !outs(n.id).length && ins(n.id).length);
  let terminals = 0;
  if (starts.length !== 1 || !ends.length) {
    terminals++;
    const lacks = [
      ...(starts.length ? [] : ["no start terminator"]),
      ...(starts.length > 1 ? [`${starts.length} start terminators`] : []),
      ...(ends.length ? [] : ["no end terminator"]),
    ];
    add(
      "conventions.flowchart-terminals",
      starts.length && ends.length ? "minor" : "major",
      starts.length > 1 ? starts.map((n) => n.id) : [],
      { starts: starts.length, ends: ends.length },
      `the flowchart has ${lacks.join(" and ")}, so its entry and exits are not marked`,
      [
        "draw where it starts as one shape: terminator with nothing leading into it",
        "end every path at a shape: terminator (Order approved, Order rejected)",
      ],
      starts.length && ends.length ? 4 : 8,
    );
  }

  // FC-03: a decision has two or more exits, each saying which answer it is.
  let decisions = 0;
  for (const n of model.nodes) {
    if (n.look !== "shape" || n.shape !== "diamond") continue;
    const exits = outs(n.id);
    const bare = exits.filter((e) => !e.label);
    if (exits.length >= 2 && !bare.length) continue;
    decisions++;
    const one = exits.length < 2;
    add(
      "conventions.flowchart-decision",
      bare.length && !one ? "major" : "minor",
      [n.id, ...bare.map((e) => e.id)],
      { decision: n.id, exits: exits.length, unlabelled: bare.length },
      one
        ? `the decision "${n.id}" has ${exits.length} exit(s), so it decides nothing`
        : `the decision "${n.id}" has ${bare.length} of ${exits.length} exits without the answer they stand for`,
      one
        ? [`give "${n.id}" an exit per answer (yes and no)`, `use shape: process for "${n.id}"`]
        : bare.slice(0, 1).map((e) => `label each exit with its answer: - ${edgeName(e)}: "yes"`),
      one ? 4 : 8,
    );
  }
  return { startTerminators: starts.length, endTerminators: ends.length, terminals, decisions };
}

/** UML state machines (OMG UML 2.5.1): initial pseudostates and final states. */
function measureStateMachine(c: Ctx): Record<string, number> {
  const { model, add } = c;
  const outs = (id: string) => model.edges.filter((e) => travel(e)[0] === id);
  let initial = 0;
  let final = 0;
  // SM-01: at most one initial pseudostate per region (the top level or a composite state), one
  // transition out of it, and one at the top level so the reader sees where it starts.
  const regions = new Map<string | undefined, string[]>();
  for (const n of model.nodes)
    if (n.shape === "initial") regions.set(n.parent, [...(regions.get(n.parent) ?? []), n.id]);
  for (const [region, ids] of regions) {
    if (ids.length < 2) continue;
    initial++;
    add(
      "conventions.state-initial",
      "major",
      ids,
      { region: region ?? "(top level)", initials: ids.length },
      `${region ? `state "${region}"` : "the top level"} has ${ids.length} initial pseudostates; a region has at most one`,
      ["keep one shape: initial per region and point it at the first state"],
      8,
    );
  }
  if (!regions.has(undefined) && model.nodes.some((n) => !n.parent)) {
    initial++;
    add(
      "conventions.state-initial",
      "minor",
      [],
      { region: "(top level)", initials: 0 },
      "the state machine has no initial pseudostate, so the reader cannot tell where it starts",
      ["add a node with shape: initial and an edge from it to the first state"],
      4,
    );
  }
  for (const id of [...regions.values()].flat()) {
    const n = outs(id).length;
    if (n < 2) continue;
    initial++;
    add(
      "conventions.state-initial",
      "major",
      [id],
      { initial: id, transitions: n },
      `the initial pseudostate "${id}" has ${n} transitions out; it may have one`,
      ["keep one edge out of it; branch later with a decision state"],
      8,
    );
  }
  // SM-03: a final state ends its region.
  for (const n of model.nodes) {
    const leaving = n.shape === "final" ? outs(n.id) : [];
    if (!leaving.length) continue;
    final++;
    add(
      "conventions.state-final",
      "major",
      [n.id, ...leaving.map((e) => e.id)],
      { final: n.id, transitions: leaving.length },
      `the final state "${n.id}" has ${leaving.length} transition(s) out; a final state has none`,
      [`use shape: rounded for "${n.id}" if the machine goes on from it`],
      8,
    );
  }
  return { initialProblems: initial, finalProblems: final };
}

/** Customer journey maps (Nielsen Norman Group): every stage has steps, steps carry emotion. */
function measureJourney(c: Ctx): Record<string, number> {
  const { model, add } = c;
  const empty = (model.stages ?? []).filter((s) => !model.nodes.some((n) => n.stage === s));
  const scored = model.nodes.filter((n) => n.score !== undefined).length;
  const lacks = [
    ...empty.map((s) => `no step in stage "${s}"`),
    ...(scored ? [] : ["no emotion score on any step"]),
  ];
  if (lacks.length)
    add(
      "conventions.journey-incomplete",
      "minor",
      [],
      { emptyStages: empty.join(",") || "none", scoredSteps: scored },
      `the journey has ${lacks.join(" and ")}`,
      [
        ...(empty.length ? [`add the actor's step in stage "${empty[0]}", or drop the stage`] : []),
        ...(scored ? [] : ["set score: -2 to 2 on the actor's steps so the emotion curve shows"]),
      ],
      3 * lacks.length,
    );
  return { emptyStages: empty.length, scoredSteps: scored };
}

export const NOTATION_CHECKS: Partial<Record<DiagramKind, (c: Ctx) => Record<string, number>>> = {
  process: measureBpmn,
  flowchart: measureFlowchart,
  state: measureStateMachine,
  journey: measureJourney,
};
