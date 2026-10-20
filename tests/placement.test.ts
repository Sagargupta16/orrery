import { describe, expect, it } from "vitest";
import { sceneDefects } from "../src/layout/defects.ts";
import { segmentHits } from "../src/layout/geometry.ts";
import { layout } from "../src/layout/index.ts";
import type { Box, Point, Scene } from "../src/types.ts";
import { model, must } from "./helpers.ts";

const box = (s: Scene, id: string): Box => must(s.nodes.find((n) => n.id === id)?.box, id);
const cx = (b: Box) => b.x + b.w / 2;
const cy = (b: Box) => b.y + b.h / 2;
/**
 * The straight runs of a path that lie on a group's border line: parallel to a side, within 4px
 * of it, over more than 24px of it (the frame's stroke would hide them).
 */
const onBorder = (s: Scene, pts: Point[]) =>
  pts.slice(1).flatMap((q, i) => {
    const p = must(pts[i], "point");
    const upright = Math.abs(p.x - q.x) < 0.5;
    if (!upright && Math.abs(p.y - q.y) >= 0.5) return [];
    return s.groups.flatMap((g) => {
      const [at, lo, hi] = upright ? [p.x, p.y, q.y] : [p.y, p.x, q.x];
      const [s0, s1, from, to] = upright
        ? [g.box.x, g.box.x + g.box.w, g.box.y, g.box.y + g.box.h]
        : [g.box.y, g.box.y + g.box.h, g.box.x, g.box.x + g.box.w];
      const along = Math.min(Math.max(lo, hi), to) - Math.max(Math.min(lo, hi), from);
      const near = [s0, s1].some((v) => Math.abs(v - at) <= 4);
      return near && along > 24 ? [`${g.id} at ${at}`] : [];
    });
  });
/** Where a box sits along the flow of the scene: two nodes in one layer share it. */
const flow = (s: Scene, id: string) =>
  s.direction === "right" || s.direction === "left" ? cx(box(s, id)) : cy(box(s, id));

// Two align blocks joined by labelled edges, inside groups (it once drew "whole request" over
// both of its nodes and an arrowhead under it).
const TWO_BLOCKS = `groups:
  laptop: { type: generic, label: Your machine }
  cloud: { type: aws:cloud }
  region: { type: aws:region, label: us-east-1, in: cloud }
nodes:
  client: { icon: aws:client, label: MCP client, note: "Claude Code, Codex, Kiro", in: laptop }
  local: { icon: aws:folders, label: MCP server, note: "stdio, absolute paths", in: laptop }
  gateway: { icon: aws:bedrock-agentcore, label: AgentCore Gateway, note: "SigV4, Cedar", in: region }
  tools: { icon: aws:bedrock-agentcore, label: Tools runtime, note: over HTTP, in: region, align: gateway }
  harness: { icon: aws:bedrock-agentcore, label: AgentCore harness, note: ask_architect, in: region, align: s3 }
  s3: { icon: aws:simple-storage-service, label: Amazon S3, note: "figures, links", in: region }
edges:
  - client -> local: file paths
  - client -> gateway: file contents
  - gateway -> tools: MCP
  - tools --> harness: whole request
  - tools -> s3: save
`;

describe("placement", () => {
  it("rank: first puts a node in the first layer", async () => {
    const s = await layout(
      model(`nodes:
  a: { label: A }
  b: { label: B }
  c: { label: C }
  x: { label: X, rank: first }
edges:
  - a -> b -> c
  - b -> x
`),
    );
    expect(cx(box(s, "x"))).toBe(cx(box(s, "a")));
    expect(s.ignored).toBeUndefined();
  });

  it("rank: last puts a node in the last layer", async () => {
    const s = await layout(
      model(`nodes:
  a: { label: A }
  b: { label: B }
  c: { label: C }
  d: { label: D }
  y: { label: Y, rank: last }
edges:
  - a -> b -> c -> d
  - a -> y
`),
    );
    expect(cx(box(s, "y"))).toBe(cx(box(s, "d")));
  });

  it("rank: 3 puts a node in the third layer", async () => {
    const s = await layout(
      model(`nodes:
  a: { label: A }
  b: { label: B }
  c: { label: C }
  d: { label: D }
  s: { label: Side, rank: 3 }
edges:
  - a -> b -> c -> d
  - s -> d
`),
    );
    expect(cx(box(s, "s"))).toBe(cx(box(s, "c")));
    expect(s.ignored).toBeUndefined();
  });

  it("align puts a node in the layer of another", async () => {
    const s = await layout(
      model(`nodes:
  a: { label: A }
  b: { label: B }
  c: { label: C }
  d: { label: D, align: c }
edges:
  - a -> b -> c
  - a -> d
`),
    );
    expect(cx(box(s, "d"))).toBe(cx(box(s, "c")));
    expect(Math.abs(cy(box(s, "d")) - cy(box(s, "c")))).toBeGreaterThan(40);
  });

  it("cols lays a group's children out row by row in spec order", async () => {
    const s = await layout(
      model(`groups:
  g: { label: Services, cols: 2 }
nodes:
  in: { label: In }
  a: { label: A, in: g }
  b: { label: B, in: g }
  c: { label: C, in: g }
  d: { label: D, in: g }
edges:
  - in -> a
`),
    );
    const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => box(s, id));
    if (!a || !b || !c || !d) throw new Error("missing cells");
    expect([cy(a), cy(c)]).toEqual([cy(b), cy(d)]);
    expect([cx(a), cx(b)]).toEqual([cx(c), cx(d)]);
    expect(cx(b)).toBeGreaterThan(cx(a) + a.w);
    expect(cy(c)).toBeGreaterThan(cy(a) + a.h);
  });

  it("lays a cols group out without its grid when the grid leaves an edge over a label", async () => {
    // Flowing down, the grid's route from the load balancer to Shipping ran through "write".
    const spec = (dir: string) => `direction: ${dir}
groups:
  vpc: { type: aws:vpc, label: Services, cols: 2 }
  sub: { type: aws:private-subnet, label: Data, in: vpc }
nodes:
  user: { icon: aws:user, label: User }
  alb: { icon: aws:elastic-load-balancing, label: Load balancer }
  a: { icon: aws:lambda, label: Orders, in: vpc }
  b: { icon: aws:lambda, label: Payments, in: vpc }
  c: { icon: aws:lambda, label: Shipping service, in: vpc }
  db: { icon: aws:dynamodb, label: Table, in: sub }
  q: { icon: aws:simple-queue-service, label: Queue, in: sub }
  out: { icon: aws:simple-notification-service, label: Notify }
edges:
  - user -> alb: HTTPS
  - alb -> a
  - alb -> b
  - alb -> c
  - a -> db: write
  - db -> q
  - c -> out
`;
    const down = await layout(model(spec("down")));
    expect(sceneDefects(down)).toBe(0);
    expect(down.ignored).toEqual([
      { subject: "vpc", setting: "cols", reason: expect.stringContaining("grid") },
    ]);
    // Flowing right the same grid draws clear, so it stays: Data and Orders in the first row,
    // Payments and Shipping under them.
    const right = await layout(model(spec("right")));
    expect(right.ignored).toBeUndefined();
    expect(cy(box(right, "b"))).toBe(cy(box(right, "c")));
    expect(cx(box(right, "c"))).toBe(cx(box(right, "a")));
    expect(cy(box(right, "c"))).toBeGreaterThan(cy(box(right, "a")));
  });

  it("layout.aspect lands a long chain within a quarter of the target", async () => {
    const steps = "abcdefghi".split("");
    const s = await layout(
      model(`layout: { aspect: "4:3" }
nodes:
${steps.map((id) => `  ${id}: { label: Step ${id} }`).join("\n")}
edges:
  - ${steps.join(" -> ")}
`),
    );
    const ratio = s.width / s.height / (4 / 3);
    expect(ratio).toBeGreaterThan(1 / 1.25);
    expect(ratio).toBeLessThan(1.25);
    expect(s.ignored).toBeUndefined();
  });

  it("records a hint it cannot honor instead of failing", async () => {
    const s = await layout(
      model(`nodes:
  a: { label: A }
  b: { label: B }
  far: { label: Far, rank: 9 }
edges:
  - a -> b
  - b -> far
`),
    );
    expect(s.ignored).toEqual([
      { subject: "far", setting: "rank", reason: expect.stringContaining("layer") },
    ]);
    expect(s.nodes.map((n) => n.id)).toContain("far");
  });

  it.each([
    ["right", ""],
    ["down", ""],
    ["right", `layout: { aspect: "4:3" }\n`],
  ])(
    "two align blocks with labelled edges between them cover nothing (%s %s)",
    async (dir, extra) => {
      const s = await layout(model(`direction: ${dir}\n${extra}${TWO_BLOCKS}`));
      expect(sceneDefects(s)).toBe(0);
      expect(s.ignored?.filter((x) => x.setting === "align") ?? []).toEqual([]);
      expect(flow(s, "tools")).toBe(flow(s, "gateway"));
      expect(flow(s, "harness")).toBe(flow(s, "s3"));
    },
  );

  it("draws back edges between two align blocks between their layers", async () => {
    const s = await layout(
      model(`nodes:
  a: { label: Alpha }
  b: { label: Bravo, align: a }
  c: { label: Charlie }
  d: { label: Delta, align: c }
edges:
  - a -> c: forward
  - c -> b: comes back
  - b -> d: lower run
  - d -> a: all the way back
`),
    );
    expect(sceneDefects(s)).toBe(0);
    expect(s.ignored).toBeUndefined();
    expect(cx(box(s, "b"))).toBe(cx(box(s, "a")));
    expect(cx(box(s, "d"))).toBe(cx(box(s, "c")));
    const [a, c] = [box(s, "a"), box(s, "c")];
    for (const e of s.edges)
      for (const p of e.points) {
        expect(p.x).toBeGreaterThanOrEqual(a.x + a.w);
        expect(p.x).toBeLessThanOrEqual(c.x);
      }
  });

  it("drops an align whose edge has no clear route and reports it", async () => {
    // The lanes squeeze a decision and its neighbor together, leaving no room for the label.
    const s = await layout(
      model(`kind: flowchart
direction: down
groups:
  ops: { type: lane, label: On call }
  lead: { type: lane, label: Lead }
nodes:
  alert: { shape: terminator, label: Alert fires, in: ops }
  impact: { shape: decision, label: Customers affected?, in: ops }
  fix: { shape: process, label: Fix and monitor, in: ops, align: impact }
  declare: { shape: process, label: Declare an incident, in: lead }
edges:
  - alert -> impact
  - impact -> fix: "No"
  - impact -> declare: "Yes"
`),
    );
    expect(sceneDefects(s)).toBe(0);
    const held = flow(s, "fix") === flow(s, "impact");
    const dropped = s.ignored?.some((x) => x.subject === "fix" && x.setting === "align");
    expect(held !== !!dropped).toBe(true);
  });

  it("routes a free edge around a node it would cross", async () => {
    const s = await layout(
      model(`nodes:
  a: { label: A }
  m: { label: Middle }
  b: { label: B }
edges:
  - a -> m -> b
  - a -> b: { constraint: false }
`),
    );
    const e = must(
      s.edges.find((x) => x.from === "a" && x.to === "b"),
      "free edge",
    );
    const m = box(s, "m");
    expect(e.points.length).toBeGreaterThan(2);
    expect(e.points.slice(1).some((q, i) => segmentHits(must(e.points[i], "point"), q, m))).toBe(
      false,
    );
  });

  it("keeps a free edge off a group border its riser would run along", async () => {
    // The riser of n3 -> n4 fell on the right border of g0, where the frame hid it.
    const s = await layout(
      model(`direction: down
groups:
  g0: { type: zone, label: Group 0 }
  g1: { type: zone, label: Group 1 }
nodes:
  n0: { label: Node 0, in: g1 }
  n1: { label: Node 1, in: g0 }
  n2: { label: Node 2, in: g1 }
  n3: { label: Node 3, in: g1 }
  n4: { label: Node 4, in: g0 }
edges:
  - n0 -> n1
  - n0 -> n2
  - n0 -> n3
  - n2 -> n4
  - { from: n3, to: n4, constraint: false }
  - { from: n3, to: n2, constraint: false }
`),
    );
    const e = must(
      s.edges.find((x) => x.from === "n3" && x.to === "n4"),
      "free edge",
    );
    expect(onBorder(s, e.points)).toEqual([]);
    expect(sceneDefects(s)).toBe(0);
  });

  it("moves a run ELK lays on a group border off it, with its label", async () => {
    // ELK took n0 -> n4 out of g0 along its bottom border, 2px inside the frame.
    const s = await layout(
      model(`direction: right
groups:
  g0: { type: zone, label: Group 0 }
nodes:
  n0: { label: Node 0, in: g0 }
  n1: { label: Node 1, in: g0 }
  n2: { label: Node 2, in: g0 }
  n3: { label: Node 3, in: g0 }
  n4: { label: Node 4 }
edges:
  - n0 -> n1
  - n1 -> n2: lbl
  - n0 -> n3
  - n0 -> n4: lbl
`),
    );
    for (const e of s.edges) expect(onBorder(s, e.points)).toEqual([]);
    expect(sceneDefects(s)).toBe(0);
    const e = must(
      s.edges.find((x) => x.from === "n0" && x.to === "n4"),
      "edge",
    );
    const label = must(e.labelBox, "label");
    // The label still sits just above the long run it names.
    const run = must(e.points.at(-1), "end").y;
    expect(run - (label.y + label.h)).toBeGreaterThanOrEqual(0);
    expect(run - (label.y + label.h)).toBeLessThanOrEqual(12);
  });
});
