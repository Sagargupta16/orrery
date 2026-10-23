import { describe, expect, it } from "vitest";
import { checkScene } from "../src/check/index.ts";
import { sceneDefects } from "../src/layout/defects.ts";
import { segmentHits } from "../src/layout/geometry.ts";
import { layout } from "../src/layout/index.ts";
import type { Box, Point, Scene } from "../src/types.ts";
import { listDiagnostics, model, must } from "./helpers.ts";

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
    // Flowing down, the grid's labelled routes from the load balancer to Orders and Payments leave
    // a label over a node or another label, whichever way they run.
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
  - alb -> a: orders
  - alb -> b: payments
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

  it("draws back edges between two align blocks without loops around them", async () => {
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
    // No route loops around the blocks: each stays between the four nodes, with two bends at most.
    const [a, d] = [box(s, "a"), box(s, "d")];
    for (const e of s.edges) {
      expect(e.points.length).toBeLessThanOrEqual(4);
      for (const p of e.points) {
        expect(p.x).toBeGreaterThanOrEqual(a.x - 0.5);
        expect(p.x).toBeLessThanOrEqual(d.x + d.w + 0.5);
        expect(p.y).toBeGreaterThanOrEqual(Math.min(a.y, box(s, "c").y) - 0.5);
        expect(p.y).toBeLessThanOrEqual(Math.max(box(s, "b").y + box(s, "b").h, d.y + d.h) + 0.5);
      }
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

// ---------------------------------------------------------------- border nodes (on:)

const nodeOf = (s: Scene, id: string) =>
  must(
    s.nodes.find((n) => n.id === id),
    id,
  );
const groupOf = (s: Scene, id: string) =>
  must(
    s.groups.find((g) => g.id === id),
    id,
  ).box;
const iconOf = (s: Scene, id: string) => must(nodeOf(s, id).iconBox, `${id} icon`);
const meets = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const footprintOf = (s: Scene, id: string): Box => {
  const n = nodeOf(s, id);
  const parts = [n.box, n.iconBox, n.labelBox, n.noteBox].filter((b): b is Box => !!b && b.w > 0);
  const x = Math.min(...parts.map((b) => b.x));
  const y = Math.min(...parts.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...parts.map((b) => b.x + b.w)) - x,
    h: Math.max(...parts.map((b) => b.y + b.h)) - y,
  };
};
const edgeOf = (s: Scene, from: string, to: string) =>
  must(
    s.edges.find((e) => e.from === from && e.to === to),
    `${from} -> ${to}`,
  );

// An internet gateway on its VPC, as the AWS deck draws it: users above, the app inside.
const GATEWAY = `direction: down
groups:
  vpc: { type: aws:vpc, label: VPC }
  sub: { type: aws:private-subnet, label: Private subnet, in: vpc }
nodes:
  users: { icon: aws:users, label: Users }
  igw: { icon: aws:igw, label: Internet gateway, on: vpc }
  app: { icon: aws:ec2, label: App, in: sub }
edges:
  - users -> igw -> app
`;
// A VPC endpoint between a function inside and a bucket outside, in a flow to the right.
const ENDPOINT = `groups:
  vpc: { type: aws:vpc, label: VPC }
nodes:
  fn: { icon: aws:lambda, label: Handler, in: vpc }
  vpce: { icon: aws:vpc-endpoints, label: S3 endpoint, on: vpc }
  s3: { icon: aws:s3, label: Bucket }
edges:
  - fn -> vpce -> s3
`;
const TWO_GATEWAYS = `groups:
  vpc: { type: aws:vpc, label: VPC }
nodes:
  users: { icon: aws:users, label: Users }
  dc: { icon: aws:office-building, label: Data center }
  igw: { icon: aws:igw, label: Internet gateway, on: vpc }
  vgw: { icon: aws:vpc-vpn-gateway, label: VPN gateway, on: vpc }
  app: { icon: aws:ec2, label: App, in: vpc }
edges:
  - users -> igw -> app
  - dc -> vgw -> app
`;

describe("border nodes (on:)", () => {
  it("sits on the side facing the far end of its first edge out of the group", async () => {
    const down = await layout(model(GATEWAY));
    const vpc = groupOf(down, "vpc");
    const igw = iconOf(down, "igw");
    // Users are above the VPC: the top border, the icon centered on the line.
    expect(cy(igw)).toBe(vpc.y);
    expect(cx(igw)).toBeGreaterThan(vpc.x);
    expect(cx(igw)).toBeLessThan(vpc.x + vpc.w);
    // The bucket is past the VPC along a flow to the right: the right border.
    const right = await layout(model(ENDPOINT));
    const box = groupOf(right, "vpc");
    const vpce = iconOf(right, "vpce");
    expect(cx(vpce)).toBe(box.x + box.w);
    expect(cy(vpce)).toBeGreaterThan(box.y);
    expect(cy(vpce)).toBeLessThan(box.y + box.h);
    expect(down.ignored).toBeUndefined();
    expect(right.ignored).toBeUndefined();
  });

  it("faces where the flow enters when no edge leads out of the group", async () => {
    const s = await layout(
      model(`groups:
  vpc: { type: aws:vpc, label: VPC }
nodes:
  app: { icon: aws:ec2, label: App, in: vpc }
  gw: { icon: aws:igw, label: Gateway, on: vpc }
edges:
  - gw -> app
`),
    );
    expect(cx(iconOf(s, "gw"))).toBe(groupOf(s, "vpc").x);
  });

  it("keeps its label outside the group and clear of the header", async () => {
    for (const [spec, id] of [
      [GATEWAY, "igw"],
      [ENDPOINT, "vpce"],
    ] as const) {
      const s = await layout(model(spec));
      const vpc = must(
        s.groups.find((g) => g.id === "vpc"),
        "vpc",
      );
      const n = nodeOf(s, id);
      expect(meets(n.labelBox, vpc.box)).toBe(false);
      expect(meets(n.labelBox, vpc.labelBox)).toBe(false);
      expect(meets(iconOf(s, id), must(vpc.iconBox, "tile"))).toBe(false);
      // The icon straddles the border: half in, half out.
      expect(meets(iconOf(s, id), vpc.box)).toBe(true);
    }
  });

  it("spreads several nodes on one side evenly", async () => {
    const s = await layout(model(TWO_GATEWAYS));
    const vpc = groupOf(s, "vpc");
    const [igw, vgw] = [iconOf(s, "igw"), iconOf(s, "vgw")];
    expect([cx(igw), cx(vgw)]).toEqual([vpc.x, vpc.x]);
    // In ELK's order, at a third and two thirds of the side; a tile and its label taller than that
    // third push the second just past it, so the two footprints stay apart.
    expect(cy(igw) - vpc.y).toBeCloseTo(vpc.h / 3, 0);
    expect(cy(vgw) - vpc.y).toBeGreaterThanOrEqual((2 * vpc.h) / 3 - 0.5);
    expect(meets(footprintOf(s, "igw"), footprintOf(s, "vgw"))).toBe(false);
    expect(s.ignored).toBeUndefined();
  });

  it("makes a side that is too short long enough for its nodes (second pass)", async () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const s = await layout(
      model(`groups:
  vpc: { type: aws:vpc, label: VPC }
nodes:
  app: { icon: aws:ec2, label: App, in: vpc }
${ids.map((id) => `  ${id}: { icon: aws:igw, label: Gateway ${id}, on: vpc }`).join("\n")}
edges:
${ids.map((id) => `  - ${id} -> app`).join("\n")}
`),
    );
    const vpc = groupOf(s, "vpc");
    expect(s.ignored).toBeUndefined();
    for (const id of ids) expect(cx(iconOf(s, id))).toBe(vpc.x);
    for (const [i, id] of ids.entries())
      for (const other of ids.slice(i + 1))
        expect(meets(footprintOf(s, id), footprintOf(s, other))).toBe(false);
  });

  it("routes its edges from the icon's faces, clear of everything", async () => {
    const m = model(GATEWAY);
    const s = await layout(m);
    const igw = iconOf(s, "igw");
    // In from above through the top face, on into the group through the bottom one.
    const into = must(edgeOf(s, "users", "igw").points.at(-1), "end");
    expect(into.y).toBe(igw.y);
    expect(into.x).toBeGreaterThan(igw.x);
    expect(into.x).toBeLessThan(igw.x + igw.w);
    const out = must(edgeOf(s, "igw", "app").points[0], "start");
    expect(out.y).toBe(igw.y + igw.h);
    for (const e of s.edges)
      for (const [i, q] of e.points.slice(1).entries()) {
        const p = must(e.points[i], "point");
        expect(Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01).toBe(true);
        expect(segmentHits(p, q, nodeOf(s, "igw").labelBox)).toBe(false);
      }
    expect(listDiagnostics(checkScene(s, m))).toBe("");
  });

  it("reports an on: it cannot honor as unused, and lays out the rest", async () => {
    const cases: [string, string][] = [
      [
        `groups:
  vpc: { type: aws:vpc, label: VPC }
nodes:
  gw: { icon: aws:igw, label: Gateway, in: vpc, on: vpc }
  app: { icon: aws:ec2, label: App, in: vpc }
edges:
  - gw -> app
`,
        'it is inside "vpc"',
      ],
      [
        `groups:
  region: { type: aws:region, label: us-east-1 }
  vpc: { type: aws:vpc, label: VPC, in: region }
nodes:
  gw: { icon: aws:igw, label: Gateway, on: vpc }
  app: { icon: aws:ec2, label: App, in: vpc }
edges:
  - gw -> app
`,
        'it must be in "region"',
      ],
      [
        `groups:
  zone: { label: Zone }
  ring: { label: Ring, around: [app] }
nodes:
  gw: { icon: aws:igw, label: Gateway, on: ring }
  app: { icon: aws:ec2, label: App, in: zone }
edges:
  - gw -> app
`,
        "drawn around its members",
      ],
      [
        `kind: tree
groups:
  team: { label: Team }
nodes:
  lead: { label: Lead }
  dev: { label: Developer, on: team }
  qa: { label: QA, in: team }
edges:
  - lead -> dev
  - lead -> qa
`,
        "a tree places every node itself",
      ],
    ];
    for (const [spec, why] of cases) {
      const m = model(spec);
      const s = await layout(m);
      const ignored = (s.ignored ?? []).filter((x) => x.setting === "on");
      expect(ignored.map((x) => x.subject)).toEqual([m.nodes.find((n) => n.on)?.id]);
      expect(ignored[0]?.reason).toContain(why);
      expect(checkScene(s, m).some((d) => d.code === "DG219")).toBe(true);
    }
  });
});
