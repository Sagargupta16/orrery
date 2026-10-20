// The story plan: which edges the packet rides and when, the side flows, the badges and the wash's focus.

import type { Point, Scene, SceneEdge } from "../../types.ts";
import { length } from "../svg.ts";
import {
  GONE,
  HOLD,
  HOLD_FOR,
  PAUSE,
  RAMP,
  type Run,
  SIDE_FLOWS,
  SPEED,
  STORY_AT,
  TILES_ON,
} from "./timing.ts";
import { longestPath, storyWalk, tokenWalk, treeWalk } from "./walks.ts";

export interface Story {
  animated: boolean;
  cycle: number;
  /** Seconds into the loop. */
  hold: number;
  gone: number;
  /** Runs of each edge on the story, in order. */
  runs: Map<string, Run[]>;
  /** Side flows: a small packet, no trace. */
  side: Map<string, Run>;
  /** When each numbered edge's badge pops. */
  badges: Map<string, number>;
  focus: Point;
}

type Travel = (e: SceneEdge) => number;

/** The numbered edges in step order, one step at a time; returns the clock after the last step. */
function stepRuns(story: Story, stepped: SceneEdge[], travel: Travel): number {
  let t = STORY_AT;
  const steps = [...new Set(stepped.map((e) => e.step ?? 0))].sort((a, b) => a - b);
  steps.forEach((step, i) => {
    let took = 0;
    for (const e of stepped.filter((x) => x.step === step)) {
      const tr = travel(e);
      const park = i < steps.length - 1 ? PAUSE : 0;
      // A two-way step answers once the request arrives.
      const runs: Run[] =
        e.arrow === "both"
          ? [
              { t0: t, t1: t + tr, reverse: false, park: PAUSE },
              { t0: t + tr + PAUSE, t1: t + 2 * tr + PAUSE, reverse: true, park },
            ]
          : [{ t0: t, t1: t + tr, reverse: e.arrow === "start", park }];
      story.runs.set(e.id, runs);
      story.badges.set(e.id, t);
      took = Math.max(took, (runs[runs.length - 1]?.t1 ?? t) - t);
    }
    t += took + PAUSE;
  });
  return t;
}

/** The longest path, hop by hop; returns the clock after the last hop. */
function pathRuns(story: Story, directed: SceneEdge[], travel: Travel): number {
  let t = STORY_AT;
  const path = longestPath(directed);
  path.forEach((e, i) => {
    const tr = travel(e);
    const park = i < path.length - 1 ? PAUSE : 0;
    story.runs.set(e.id, [{ t0: t, t1: t + tr, reverse: e.arrow === "start", park }]);
    t += tr + PAUSE;
  });
  return t;
}

export function storyPlan(scene: Scene, h: number): Story {
  const animated = scene.animate === "relay" || scene.animate === "packets";
  const story: Story = {
    animated,
    cycle: 0,
    hold: 0,
    gone: 0,
    runs: new Map(),
    side: new Map(),
    badges: new Map(),
    focus: { x: scene.width * 0.6, y: scene.height * 0.45 },
  };
  const directed = scene.edges.filter((e) => e.arrow !== "none" && e.points.length > 1);
  const travel = (e: SceneEdge) => Math.min(1, Math.max(0.4, length(e.points) / h / SPEED));
  const stepped = directed.filter((e) => e.step !== undefined);
  let t = STORY_AT;
  // The spec's story path, else a process token or a tree growing out of its root, else the steps,
  // else the longest path.
  const walk =
    storyWalk(scene, travel) ??
    (scene.kind === "process"
      ? tokenWalk(scene, travel)
      : scene.kind === "tree" || scene.kind === "mindmap"
        ? treeWalk(scene, travel)
        : undefined);
  if (walk) {
    for (const [id, runs] of walk.runs) story.runs.set(id, runs);
    for (const e of scene.edges) {
      const first = e.step !== undefined ? walk.runs.get(e.id)?.[0] : undefined;
      if (first) story.badges.set(e.id, first.t0);
    }
  } else if (stepped.length) t = stepRuns(story, stepped, travel);
  else t = pathRuns(story, directed, travel);
  // A walk's branches end at different times; the story ends with the last arrival.
  const end = walk
    ? Math.max(...[...walk.runs.values()].flat().map((r) => r.t1))
    : story.runs.size
      ? t - PAUSE
      : TILES_ON + RAMP;
  story.hold = end + HOLD_FOR;
  story.cycle = story.hold / HOLD;
  story.gone = story.cycle * GONE;
  // Side flows: edges off the story, those touching it first, each once per loop.
  const on = new Set(
    scene.edges.filter((e) => story.runs.has(e.id)).flatMap((e) => [e.from, e.to]),
  );
  const side = directed
    .filter((e) => !story.runs.has(e.id) && !walk?.skip.has(e.id))
    .sort((a, b) => Number(on.has(b.from) || on.has(b.to)) - Number(on.has(a.from) || on.has(a.to)))
    .slice(0, SIDE_FLOWS);
  side.forEach((e, i) => {
    const tr = travel(e);
    const span = Math.max(0, end - STORY_AT);
    const t0 = Math.min(STORY_AT + span * (0.45 + 0.3 * i), story.hold - 0.2 - tr);
    story.side.set(e.id, {
      t0: Math.max(STORY_AT, t0),
      t1: Math.max(STORY_AT, t0) + tr,
      reverse: e.arrow === "start",
      park: 0,
    });
  });
  // The tint wash sits behind the story.
  const pts = scene.edges.filter((e) => story.runs.has(e.id)).flatMap((e) => e.points);
  if (pts.length) {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    story.focus = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }
  return story;
}
