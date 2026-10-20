// The paths a story can walk: the spec's story, a BPMN token, a tree level by level, the longest chain.

import type { Scene, SceneEdge } from "../../types.ts";
import { PAUSE, type Run, STORY_AT } from "./timing.ts";

/** Endpoints in travel order: an arrow at the start runs to -> from. */
export const ends = (e: SceneEdge): [string, string] =>
  e.arrow === "start" ? [e.to, e.from] : [e.from, e.to];
const src = (e: SceneEdge) => ends(e)[0];
const dst = (e: SceneEdge) => ends(e)[1];

/** The longest chain of directed edges (spec order breaks ties); loops are cut where they close. */
export function longestPath(edges: SceneEdge[]): SceneEdge[] {
  const out = new Map<string, SceneEdge[]>();
  const starts: string[] = [];
  for (const e of edges) {
    const [a, b] = ends(e);
    if (a === b) continue;
    out.set(a, [...(out.get(a) ?? []), e]);
    if (!starts.includes(a)) starts.push(a);
  }
  const memo = new Map<string, SceneEdge[]>();
  const open = new Set<string>();
  const from = (v: string): SceneEdge[] => {
    const known = memo.get(v);
    if (known) return known;
    open.add(v);
    let best: SceneEdge[] = [];
    for (const e of out.get(v) ?? []) {
      const next = ends(e)[1];
      if (open.has(next)) continue;
      const path = [e, ...from(next)];
      if (path.length > best.length) best = path;
    }
    open.delete(v);
    memo.set(v, best);
    return best;
  };
  let best: SceneEdge[] = [];
  for (const v of starts) {
    const path = from(v);
    if (path.length > best.length) best = path;
  }
  return best;
}

/** Runs of each edge a walk takes, and the edges no side packet may ride. */
export interface Walk {
  runs: Map<string, Run[]>;
  skip: Set<string>;
}

/** The spec's `story:` path, hop by hop along the edge joining each pair, backwards when it points back. */
export function storyWalk(scene: Scene, travel: (e: SceneEdge) => number): Walk | undefined {
  const ids = scene.story ?? [];
  const drawn = scene.edges.filter((e) => e.points.length > 1);
  const hops: { e: SceneEdge; reverse: boolean }[] = [];
  for (let i = 1; i < ids.length; i++) {
    const a = ids[i - 1];
    const b = ids[i];
    const e =
      drawn.find((x) => x.from === a && x.to === b) ??
      drawn.find((x) => x.from === b && x.to === a);
    // A pair no edge joins is skipped (DG113 warns about it).
    if (e) hops.push({ e, reverse: e.from !== a });
  }
  if (!hops.length) return undefined;
  const runs = new Map<string, Run[]>();
  let t = STORY_AT;
  hops.forEach(({ e, reverse }, i) => {
    const tr = travel(e);
    const run = { t0: t, t1: t + tr, reverse, park: i < hops.length - 1 ? PAUSE : 0 };
    runs.set(e.id, [...(runs.get(e.id) ?? []), run]);
    t += tr + PAUSE;
  });
  return { runs, skip: new Set() };
}

/** Gateways that send the token down one branch. */
const DECIDES = new Set(["exclusive", "inclusive", "event-based", "complex"]);
/** Gateways that wait for every branch that reaches them. */
const JOINS = new Set(["parallel", "inclusive", "complex"]);
/** Branch labels that read as the happy path, and the words that turn them around. */
const YES =
  /\b(yes|y|ok|okay|approved?|accept(ed|s)?|valid|pass(ed|es)?|success(ful)?|true|confirmed?|granted|available|in stock|paid|found)\b/i;
const NO =
  /\b(no|not|non|reject(ed|s)?|declined?|denied|fail(ed|s|ure)?|invalid|unavailable|false|error)\b|n't\b/i;

/** The branch a deciding gateway takes: a yes-like label, else spec order; a default flow only alone. */
function branch(outs: SceneEdge[]): SceneEdge | undefined {
  const conditioned = outs.filter((e) => e.flow !== "default");
  const pool = conditioned.length ? conditioned : outs;
  const text = (e: SceneEdge) => e.label?.lines.join(" ") ?? "";
  return pool.find((e) => YES.test(text(e)) && !NO.test(text(e))) ?? pool[0];
}

/** The flows a token can follow, and the edges each node sends it down. */
interface TokenGraph {
  /** Each node's BPMN kind, "" for a plain node. */
  kind: Map<string, string>;
  flows: SceneEdge[];
  messages: SceneEdge[];
  /** Nodes some sequence flow touches. */
  inFlow: Set<string>;
  leaving: (v: string) => SceneEdge[];
}

function tokenGraph(scene: Scene): TokenGraph {
  const kind = new Map(scene.nodes.map((nd) => [nd.id, nd.bpmn ?? ""]));
  const data = (id: string) => (kind.get(id) ?? "").startsWith("data-");
  const usable = scene.edges.filter(
    (e) =>
      e.points.length > 1 &&
      e.arrow !== "none" &&
      e.flow !== "association" &&
      !data(e.from) &&
      !data(e.to),
  );
  const messages = usable.filter((e) => e.flow === "message");
  const flows = usable.filter((e) => e.flow !== "message");
  const leaves = new Map<string, SceneEdge[]>();
  const leaving = (v: string): SceneEdge[] => {
    let out = leaves.get(v);
    if (out) return out;
    const k = kind.get(v) ?? "";
    const outs = flows.filter((e) => src(e) === v);
    const plain = outs.filter((e) => e.flow !== "default");
    const taken = DECIDES.has(k) ? [branch(outs)] : plain.length ? plain : outs;
    out = [
      ...(k.startsWith("end") ? [] : taken.filter((e): e is SceneEdge => !!e)),
      ...messages.filter((e) => src(e) === v),
    ];
    leaves.set(v, out);
    return out;
  };
  const inFlow = new Set(flows.flatMap((e) => [e.from, e.to]));
  return { kind, flows, messages, inFlow, leaving };
}

/** Where tokens leave: the start events, else the flow sources nothing enters. */
function tokenStarts(scene: Scene, g: TokenGraph): string[] {
  const { flows, messages, inFlow } = g;
  let starts = scene.nodes.filter((nd) => nd.bpmn?.startsWith("start")).map((nd) => nd.id);
  if (!starts.length)
    starts = [...new Set(flows.map(src))].filter((v) => !flows.some((e) => dst(e) === v));
  // A participant drawn without its process (a black-box pool) sends its messages at the start.
  for (const e of messages)
    if (!inFlow.has(src(e)) && !starts.includes(src(e))) starts.push(src(e));
  return starts;
}

/** The flows a node waits for before it fires. */
interface Needs {
  join: SceneEdge[];
  seq: SceneEdge[];
  msg: SceneEdge[];
}

/**
 * What the token can reach, so a join never waits for an untaken branch, and the edges that
 * close a cycle (a loop back, a reply), which nothing may wait for. The walk leaves plain start
 * events first and message start events last: their message starts them, it is no reply.
 */
function reach(
  g: TokenGraph,
  starts: string[],
): { live: Map<string, boolean>; needs: Map<string, Needs> } {
  const { kind, inFlow, leaving } = g;
  const rank = (v: string) => (kind.get(v) === "start-message" ? 2 : inFlow.has(v) ? 0 : 1);
  const live = new Map<string, boolean>();
  const liveEdges = new Set<SceneEdge>();
  const back = new Set<SceneEdge>();
  const visit = (v: string) => {
    live.set(v, true);
    for (const e of leaving(v)) {
      liveEdges.add(e);
      const on = live.get(dst(e));
      if (on) back.add(e);
      else if (on === undefined) visit(dst(e));
    }
    live.set(v, false);
  };
  for (const v of [...starts].sort((a, b) => rank(a) - rank(b))) if (!live.has(v)) visit(v);
  const needs = new Map<string, Needs>();
  for (const v of live.keys()) {
    const into = [...liveEdges].filter((e) => dst(e) === v && !back.has(e));
    const seq = into.filter((e) => e.flow !== "message");
    const k = kind.get(v) ?? "";
    // A message drawn into a node is what it waits for (an invoice before paying it).
    needs.set(v, {
      join: JOINS.has(k) && seq.length > 1 ? seq : [],
      seq,
      msg: into.filter((e) => e.flow === "message"),
    });
  }
  return { live, needs };
}

/** Plays the token: a node fires once what it needs has arrived, sending a run down each exit. */
function fireTokens(
  g: TokenGraph,
  starts: string[],
  live: Map<string, boolean>,
  needs: Map<string, Needs>,
  travel: (e: SceneEdge) => number,
) {
  const { leaving } = g;
  const runs = new Map<string, Run[]>();
  const fired = new Map<string, number>();
  const got = new Map<SceneEdge, number>();
  const pending: { e: SceneEdge; at: number }[] = [];
  const fire = (v: string, at: number) => {
    fired.set(v, at);
    for (const e of leaving(v)) {
      const t1 = at + travel(e);
      runs.set(e.id, [{ t0: at, t1, reverse: e.arrow === "start", park: 0 }]);
      pending.push({ e, at: t1 });
    }
  };
  const ready = (v: string): boolean => {
    const need = needs.get(v);
    if (!need) return false;
    const seqOk = need.join.length
      ? need.join.every((e) => got.has(e))
      : !need.seq.length || need.seq.some((e) => got.has(e));
    const msgOk = need.msg.every((e) => got.has(e));
    const any = [...got.keys()].some((e) => dst(e) === v);
    return seqOk && msgOk && any;
  };
  for (const v of starts) {
    const need = needs.get(v);
    if (!need?.seq.length && !need?.msg.length) fire(v, STORY_AT);
  }
  for (;;) {
    while (pending.length) {
      pending.sort((a, b) => a.at - b.at);
      const next = pending.shift();
      if (!next) break;
      got.set(next.e, next.at);
      const v = dst(next.e);
      if (!fired.has(v) && ready(v)) fire(v, next.at + PAUSE);
    }
    // Nothing moves: release whatever waits on a branch that never comes, earliest first.
    const stuck = [...live.keys()]
      .filter((v) => !fired.has(v))
      .map((v) => {
        const at = [...got].filter(([e]) => dst(e) === v).map(([, t]) => t);
        return { v, at: at.length ? Math.max(...at) + PAUSE : starts.includes(v) ? STORY_AT : -1 };
      })
      .filter((s) => s.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    if (!stuck) break;
    fire(stuck.v, stuck.at);
  }
  return { runs, fired, got };
}

/**
 * A BPMN token: it leaves every start event, follows sequence flows, splits at a parallel gateway
 * and waits at the joining one until every live branch has arrived, takes one branch at a
 * deciding gateway, sends each message flow as its own hop (a node waits for the messages drawn
 * into it) and stops at end events. Each node fires once (a later arrival ends there), which also
 * cuts loops where they close.
 */
export function tokenWalk(scene: Scene, travel: (e: SceneEdge) => number): Walk | undefined {
  const g = tokenGraph(scene);
  const starts = tokenStarts(scene, g);
  if (!starts.length) return undefined;
  const { live, needs } = reach(g, starts);
  const { runs, fired, got } = fireTokens(g, starts, live, needs, travel);
  if (!runs.size) return undefined;
  // A packet waits where it arrives until that node fires: the join holds early branches.
  for (const [e, at] of got) {
    const run = runs.get(e.id)?.[0];
    const v = dst(e);
    const left = fired.get(v);
    if (run && left !== undefined && left >= at && g.leaving(v).length) run.park = left - at;
  }
  return { runs, skip: new Set(g.flows.filter((e) => !runs.has(e.id)).map((e) => e.id)) };
}

/**
 * A tree or a mind map grows out of its roots: every edge of one level runs at once, from parent to
 * child whichever way it was written (mind map edges may point either way), then the next level.
 */
export function treeWalk(scene: Scene, travel: (e: SceneEdge) => number): Walk | undefined {
  const drawn = scene.edges.filter((e) => e.points.length > 1 && e.from !== e.to);
  if (!drawn.length) return undefined;
  const into = new Set(drawn.map((e) => e.to));
  const roots = scene.nodes.filter((nd) => !into.has(nd.id)).map((nd) => nd.id);
  const seen = new Set(roots.length ? roots : scene.nodes.slice(0, 1).map((nd) => nd.id));
  const runs = new Map<string, Run[]>();
  let level = [...seen];
  let last: Run[] = [];
  let t = STORY_AT;
  while (level.length) {
    const next: string[] = [];
    const ran: Run[] = [];
    let took = 0;
    for (const e of drawn) {
      const reverse = !level.includes(e.from);
      const child = reverse ? e.from : e.to;
      if (runs.has(e.id) || !level.includes(reverse ? e.to : e.from) || seen.has(child)) continue;
      seen.add(child);
      next.push(child);
      const tr = travel(e);
      const run = { t0: t, t1: t + tr, reverse, park: PAUSE };
      runs.set(e.id, [run]);
      ran.push(run);
      took = Math.max(took, tr);
    }
    if (!ran.length) break;
    last = ran;
    t += took + PAUSE;
    level = next;
  }
  // The last level's packets end where they arrive.
  for (const run of last) run.park = 0;
  return runs.size ? { runs, skip: new Set() } : undefined;
}
