// The rules ported from the aws-archify sample: one spec that triggers each, one that does not.
import { describe, expect, it } from "vitest";
import { checkScene } from "../src/check/index.ts";
import { layout } from "../src/layout/index.ts";
import { formatReview, LOOK_MAX, reviewModel, reviewScene } from "../src/review/index.ts";
import type { Box, Model, Scene } from "../src/types.ts";
import { model, must, pngSize } from "./helpers.ts";

async function laid(source: string): Promise<{ m: Model; scene: Scene }> {
  const m = model(source);
  return { m, scene: structuredClone(await layout(m)) };
}

const review = (scene: Scene, m: Model) =>
  reviewScene(scene, m, checkScene(scene, m), { width: 880 });

async function findings(source: string, id: string) {
  const { m, scene } = await laid(source);
  return review(scene, m).findings.filter((f) => f.id === id);
}

const node = (scene: Scene, id: string) =>
  must(
    scene.nodes.find((n) => n.id === id),
    `node ${id}`,
  );
const group = (scene: Scene, id: string) =>
  must(
    scene.groups.find((g) => g.id === id),
    `group ${id}`,
  );
const edge = (scene: Scene, from: string) =>
  must(
    scene.edges.find((e) => e.from === from),
    `edge from ${from}`,
  );

/** Moves a node and everything drawn with it, so its footprint lands at `to`. */
function place(scene: Scene, id: string, to: { x: number; y: number }) {
  const n = node(scene, id);
  const dx = to.x - n.box.x;
  const dy = to.y - n.box.y;
  const shift = (b?: Box) => b && { ...b, x: b.x + dx, y: b.y + dy };
  n.box = must(shift(n.box), "box");
  n.labelBox = must(shift(n.labelBox), "label box");
  n.iconBox = shift(n.iconBox);
  n.noteBox = shift(n.noteBox);
}

const PAIR = "nodes: { a: A, b: B }\nedges:\n  - a -> b\n";
const ZONE = `groups:
  g: { type: box, label: Zone }
nodes:
  a: { label: A, in: g }
  b: { label: B, in: g }
  out: Outside
edges:
  - out -> a
  - a -> b: next
`;

describe("check rules", () => {
  it("DG219 reports a setting layout could not honor", async () => {
    const { m, scene } = await laid(PAIR);
    expect(checkScene(scene, m).map((d) => d.code)).not.toContain("DG219");
    scene.ignored = [
      { subject: "a", setting: "rank", reason: "a -> b needs a first" },
      { subject: "layout", setting: "layout.aspect", reason: "no candidate came closer" },
    ];
    const found = checkScene(scene, m).filter((d) => d.code === "DG219");
    expect(found.map((d) => d.message)).toEqual([
      "a rank had no effect: a -> b needs a first",
      "layout.aspect had no effect: no candidate came closer",
    ]);
    expect(found[0]?.subject).toEqual({ node: "a", setting: "rank" });
    const patches = review(scene, m)
      .findings.filter((f) => f.id === "layout.ignored")
      .map((f) => f.patches);
    expect(patches).toEqual([
      [{ op: "unset", path: "nodes.a.rank" }],
      [{ op: "unset", path: "layout.aspect" }],
    ]);
  });

  it("DG220 flags an edge label on a group border", async () => {
    const { m, scene } = await laid(ZONE);
    expect(checkScene(scene, m).map((d) => d.code)).not.toContain("DG220");
    const g = group(scene, "g");
    const e = must(
      scene.edges.find((x) => x.label),
      "labelled edge",
    );
    e.labelBox = { x: g.box.x - 20, y: g.box.y + 40, w: 60, h: 20 };
    const found = checkScene(scene, m).filter((d) => d.code === "DG220");
    expect(found.map((d) => d.subject)).toEqual([{ edge: e.id, from: "a", to: "b", group: "g" }]);
    expect(found[0]?.message).toContain("left border");
    expect(review(scene, m).findings.map((f) => f.id)).toContain("overlap.label-on-border");
  });

  it("DG221 flags an edge that skims a node it does not connect", async () => {
    const source = "nodes: { a: A, b: B, c: C }\nedges:\n  - a -> b\n  - b -> c\n";
    const { m, scene } = await laid(source);
    expect(checkScene(scene, m).map((d) => d.code)).not.toContain("DG221");
    const [p, q] = [
      must(edge(scene, "a").points[0], "start"),
      must(edge(scene, "a").points[1], "next"),
    ];
    const near = structuredClone(scene);
    place(near, "c", { x: (p.x + q.x) / 2 - 10, y: p.y + 5 });
    node(near, "c").box.w = 20;
    node(near, "c").box.h = 20;
    const found = checkScene(near, m).filter((d) => d.code === "DG221");
    expect(found.map((d) => d.subject)).toContainEqual({
      edge: edge(near, "a").id,
      from: "a",
      to: "b",
      node: "c",
    });
    place(scene, "c", { x: (p.x + q.x) / 2 - 10, y: p.y + 30 });
    node(scene, "c").box.h = 20;
    expect(checkScene(scene, m).map((d) => d.code)).not.toContain("DG221");
  });
});

describe("composition rules", () => {
  it("grid.zig-zag flags a one-to-one Z and offers a move patch", async () => {
    const { m, scene } = await laid(PAIR);
    expect(review(scene, m).findings.map((f) => f.id)).not.toContain("grid.zig-zag");
    const e = edge(scene, "a");
    const [s, t] = [must(e.points[0], "start"), must(e.points.at(-1), "end")];
    const mid = (s.x + t.x) / 2;
    e.points = [s, { x: mid, y: s.y }, { x: mid, y: s.y + 40 }, { x: t.x, y: s.y + 40 }];
    const zig = review(scene, m).findings.filter((f) => f.id === "grid.zig-zag");
    expect(zig.map((f) => f.evidence.stepPx)).toEqual([40]);
    expect(zig[0]?.patches).toEqual([{ op: "move", path: "nodes.b", after: "a" }]);
  });

  it("grid.zig-zag leaves a fan out alone", async () => {
    const { m, scene } = await laid("nodes: { a: A, b: B, c: C }\nedges:\n  - a -> b, c\n");
    const e = edge(scene, "a");
    const [s, t] = [must(e.points[0], "start"), must(e.points.at(-1), "end")];
    e.points = [s, { x: s.x + 20, y: s.y }, { x: s.x + 20, y: s.y + 40 }, { x: t.x, y: s.y + 40 }];
    expect(review(scene, m).findings.map((f) => f.id)).not.toContain("grid.zig-zag");
  });

  it("grid.avoidable-bend flags a one-to-one L with a short leg", async () => {
    const { m, scene } = await laid(PAIR);
    expect(review(scene, m).findings.map((f) => f.id)).not.toContain("grid.avoidable-bend");
    const e = edge(scene, "a");
    const [s, t] = [must(e.points[0], "start"), must(e.points.at(-1), "end")];
    e.points = [s, { x: t.x, y: s.y }, { x: t.x, y: s.y + 60 }];
    const bend = review(scene, m).findings.filter((f) => f.id === "grid.avoidable-bend");
    expect(bend.map((f) => f.evidence.legPx)).toEqual([60]);
  });

  it("layout.beside-group flags a node partly level with a group it is outside", async () => {
    const { m, scene } = await laid(ZONE);
    scene.width = 3000;
    const g = group(scene, "g");
    const out = node(scene, "out");
    const top = (frac: number) => out.box.y + out.box.h * (1 - frac);
    g.box = { x: out.box.x + out.box.w + 60, y: top(0.5), w: 400, h: 300 };
    const hit = review(scene, m).findings.filter((f) => f.id === "layout.beside-group");
    expect(hit.map((f) => f.subjects)).toEqual([["out", "g"]]);
    g.box = { ...g.box, y: out.box.y - 100 };
    expect(review(scene, m).findings.map((f) => f.id)).not.toContain("layout.beside-group");
  });

  it("grid.uneven-siblings flags same-kind boxes in a row 10 to 40% apart", async () => {
    const source = `groups:
  r: { type: aws:region }
  v1: { type: aws:vpc, label: VPC one, in: r }
  v2: { type: aws:vpc, label: VPC two, in: r }
nodes:
  a: { label: A, in: v1 }
  b: { label: B, in: v2 }
edges:
  - a -> b
`;
    const { m, scene } = await laid(source);
    group(scene, "v1").box = { x: 100, y: 100, w: 300, h: 200 };
    group(scene, "v2").box = { x: 450, y: 100, w: 300, h: 250 };
    const hit = review(scene, m).findings.filter((f) => f.id === "grid.uneven-siblings");
    expect(hit.map((f) => f.evidence.apart)).toEqual(["height 20%"]);
    group(scene, "v2").box.h = 205;
    expect(review(scene, m).findings.map((f) => f.id)).not.toContain("grid.uneven-siblings");
  });

  it("layout.sparse-group and grid.padding flag a frame far bigger than its content", async () => {
    const { m, scene } = await laid(ZONE);
    const before = review(scene, m).findings.map((f) => f.id);
    expect(before).not.toContain("layout.sparse-group");
    expect(before).not.toContain("grid.padding");
    const g = group(scene, "g");
    g.box = { ...g.box, h: g.box.h + 600 };
    const after = review(scene, m).findings;
    expect(after.find((f) => f.id === "layout.sparse-group")?.subjects).toEqual(["g"]);
    expect(after.find((f) => f.id === "grid.padding")?.evidence).toMatchObject({
      bottomPx: expect.any(Number),
    });
  });
});

describe("connection rules", () => {
  it("flow.edge-budget flags more edges than nodes", async () => {
    const many =
      "nodes: { a: A, b: B, c: C }\nedges:\n  - a -> b\n  - b -> c\n  - a -> c\n  - c -> a\n";
    expect((await findings(many, "flow.edge-budget")).map((f) => f.evidence)).toEqual([
      { edges: 4, nodes: 3 },
    ]);
    expect(
      await findings(
        "nodes: { a: A, b: B, c: C }\nedges:\n  - a -> b\n  - b -> c\n",
        "flow.edge-budget",
      ),
    ).toEqual([]);
  });

  const feeds = (n: number) => `nodes:
  fn: { icon: aws:lambda, label: AWS Lambda }
  api: { icon: aws:api-gateway, label: Amazon API Gateway }
  ecs: { icon: aws:ecs, label: Amazon ECS }
  sqs: { icon: aws:sqs, label: Amazon SQS }
  logs: { icon: aws:cloudwatch, label: Amazon CloudWatch }
edges:
${["fn", "api", "ecs", "sqs"]
  .slice(0, n)
  .map((id) => `  - ${id} -> logs\n`)
  .join("")}  - api -> fn
`;

  it("flow.cross-cutting suggests a shared services group for four feeds into the logs", async () => {
    const [hit] = await findings(feeds(4), "flow.cross-cutting");
    expect(hit?.subjects).toContain("logs");
    expect(hit?.patches?.slice(0, 2)).toEqual([
      {
        op: "add",
        path: "groups.shared-services",
        value: { type: "aws:generic", label: "Shared services" },
      },
      { op: "set", path: "nodes.logs.in", value: "shared-services" },
    ]);
    expect(hit?.patches?.filter((p) => p.op === "edge")).toHaveLength(4);
    expect(await findings(feeds(3), "flow.cross-cutting")).toEqual([]);
  });
});

describe("AWS rubric rules", () => {
  const subnet = (label: string) => `groups:
  vpc: { type: aws:vpc }
  web: { type: aws:private-subnet, label: "${label}", in: vpc }
nodes:
  a: { icon: aws:ec2, label: Amazon EC2, in: web }
`;

  it("AWS-17 asks a boundary group to name its boundary", async () => {
    const [hit] = await findings(subnet("Web tier"), "conventions.boundary-label");
    expect(hit?.rule).toBe("AWS-17");
    expect(hit?.patches).toEqual([
      { op: "set", path: "groups.web.label", value: "Private subnet (Web tier)" },
    ]);
    expect(
      await findings(subnet("Private subnet (Web tier)"), "conventions.boundary-label"),
    ).toEqual([]);
  });

  const bucketGroup = (extra: string) => `groups:
  s3: { type: aws:generic, label: Amazon S3, icon: aws:s3 }
nodes:
  bucket: { icon: aws:simple-storage-service-bucket, label: Uploads, in: s3 }
${extra}`;

  it("AWS-18 flags a service group that holds another service", async () => {
    const [hit] = await findings(
      bucketGroup("  fn: { icon: aws:lambda, label: AWS Lambda, in: s3 }\n"),
      "conventions.service-group",
    );
    expect(hit?.subjects).toEqual(["s3", "fn"]);
    expect(hit?.patches).toEqual([{ op: "unset", path: "groups.s3.icon" }]);
    expect(await findings(bucketGroup(""), "conventions.service-group")).toEqual([]);
  });

  it("AWS-19 puts the official name in the label and the role in the note", async () => {
    const [hit] = await findings(
      "nodes:\n  fn: { icon: aws:lambda, label: Order handler, note: Node.js 22 }\n",
      "conventions.service-label",
    );
    expect(hit?.patches).toEqual([
      { op: "set", path: "nodes.fn.label", value: "AWS Lambda" },
      { op: "set", path: "nodes.fn.note", value: "Order handler, Node.js 22" },
    ]);
    expect(
      await findings(
        "nodes:\n  fn: { icon: aws:lambda, label: AWS Lambda, note: Order handler }\n",
        "conventions.service-label",
      ),
    ).toEqual([]);
  });
});

describe("review output", () => {
  it("prints identical finding lines once with a count", async () => {
    const { m, scene } = await laid(PAIR);
    const report = review(scene, m);
    const f = {
      id: "grid.jog",
      dimension: "grid" as const,
      severity: "minor" as const,
      subjects: ["a->b"],
      evidence: {},
      claim: "a -> b steps 2px sideways where it could run straight",
      fixes: ["use layout: { merge: false }"],
    };
    const text = formatReview({ ...report, findings: [f, f, f] });
    expect(text.match(/steps 2px sideways/g)).toHaveLength(1);
    expect(text).toContain("could run straight (x3)");
    expect(text.match(/fix: use layout/g)).toHaveLength(1);
  });

  it("adds a look PNG inside 1568 x 1568 only when the display PNG is bigger", async () => {
    const chain = (n: number) =>
      `direction: down\nnodes:\n${Array.from({ length: n }, (_, i) => `  n${i}: N${i}\n`).join("")}` +
      `edges:\n${Array.from({ length: n - 1 }, (_, i) => `  - n${i} -> n${i + 1}\n`).join("")}`;
    const tall = await reviewModel({ model: model(chain(16)), name: "tall" });
    expect(must(tall.png, "png") && pngSize(must(tall.png, "png")).height).toBeGreaterThan(
      LOOK_MAX,
    );
    const look = pngSize(must(tall.look, "look png"));
    expect(Math.max(look.width, look.height)).toBeLessThanOrEqual(LOOK_MAX);
    expect(look.height).toBeGreaterThan(LOOK_MAX - 4);
    const short = await reviewModel({ model: model(chain(3)), name: "short" });
    expect(short.look).toBeUndefined();
  });
});
