// Layout, composition, spacing and naming rules: one spec that triggers each, one that does not.
import { describe, expect, it } from "vitest";
import { checkScene } from "../src/check/index.ts";
import { layout } from "../src/layout/index.ts";
import { formatReview, LOOK_MAX, reviewModel, reviewScene } from "../src/review/index.ts";
import type { Box, Diagnostic, Model, Scene } from "../src/types.ts";
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

describe("spacing rules", () => {
  const chain = (spacing: string) =>
    `direction: down
layout: { spacing: ${spacing} }
nodes: { a: A, b: B, c: C, d: D }
edges:
  - a -> b: reads
  - b -> c: writes
  - c -> d: emits
`;

  it("layout.sparse flags a figure whose median gap is over 300px", async () => {
    const [hit] = await findings(chain("3"), "layout.sparse");
    expect(hit?.evidence.medianGapPx).toBeGreaterThan(300);
    expect(hit?.patches).toEqual([{ op: "set", path: "layout.spacing", value: "compact" }]);
    expect(await findings(chain("normal"), "layout.sparse")).toEqual([]);
  });

  /** Three nodes in a row, centres `pitch` apart, each label `wide` px wide. */
  async function row(pitch: number, wide: number) {
    const { m, scene } = await laid(`nodes: { a: A, b: B, c: C }
edges:
  - a -> b
  - b -> c
`);
    for (const [i, id] of ["a", "b", "c"].entries()) {
      place(scene, id, { x: 100 + i * pitch, y: 100 });
      const n = node(scene, id);
      const cx = n.box.x + n.box.w / 2;
      n.labelBox = { ...n.labelBox, x: cx - wide / 2, w: wide };
    }
    scene.width = 3000;
    return review(scene, m).findings.filter((f) => f.id === "layout.wide-pitch");
  }

  it("layout.wide-pitch flags a pitch over 400px while the gaps are fine", async () => {
    const [hit] = await row(450, 350);
    expect(hit?.evidence).toMatchObject({ medianPitchPx: 450, medianGapPx: 100 });
    expect(await row(300, 200)).toEqual([]);
  });

  const PAIR_DOWN = `direction: down
nodes: { a: A, b: B }
edges:
  - a -> b
`;

  it("grid.wide-gap flags a row gap far wider than layout needs", async () => {
    const { m, scene } = await laid(PAIR_DOWN);
    expect(review(scene, m).findings.map((f) => f.id)).not.toContain("grid.wide-gap");
    const a = node(scene, "a");
    place(scene, "b", { x: a.box.x, y: a.box.y + 400 });
    scene.height += 400;
    const [hit] = review(scene, m).findings.filter((f) => f.id === "grid.wide-gap");
    expect(hit?.evidence).toMatchObject({ scope: "(root)", axis: "row", roomPx: 64 });
    expect(Number(hit?.evidence.gapPx)).toBeGreaterThan(160);
  });

  const TWO_ZONES = `direction: down
groups:
  g1: { type: box, label: Web }
  g2: { type: box, label: Data }
nodes:
  a: { label: A, in: g1 }
  b: { label: B, in: g2 }
edges:
  - a -> b
`;

  it("grid.group-gap flags sibling groups further apart than layout needs", async () => {
    const { m, scene } = await laid(TWO_ZONES);
    expect(review(scene, m).findings.map((f) => f.id)).not.toContain("grid.group-gap");
    group(scene, "g2").box.y += 150;
    const [hit] = review(scene, m).findings.filter((f) => f.id === "grid.group-gap");
    expect(hit?.subjects).toEqual(["g1", "g2"]);
    expect(hit?.evidence).toMatchObject({ axis: "row", labels: 0 });
    // One gap is one finding: grid.wide-gap leaves a gap grid.group-gap reported alone.
    expect(review(scene, m).findings.map((f) => f.id)).not.toContain("grid.wide-gap");
  });
});

describe("parallel edges", () => {
  const FOUR = `nodes: { a: A, b: B, c: C, d: D }
edges:
  - a -> b
  - c -> d
`;

  async function parallel(apart: number) {
    const { m, scene } = await laid(FOUR);
    edge(scene, "a").points = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ];
    edge(scene, "c").points = [
      { x: 120, y: 100 + apart },
      { x: 320, y: 100 + apart },
    ];
    return review(scene, m).findings.filter((f) => f.id === "flow.side-by-side");
  }

  it("flow.side-by-side flags unrelated runs within 12px over a shared span", async () => {
    const [hit] = await parallel(8);
    expect(hit?.evidence).toMatchObject({ apartPx: 8, sharedPx: 180 });
    expect(await parallel(20)).toEqual([]);
  });
});

describe("subtitle", () => {
  const spec = (title: string, subtitle: string) => `title: ${title}
subtitle: ${subtitle}
nodes:
  api: { icon: aws:api-gateway, label: Amazon API Gateway }
  fn: { icon: aws:lambda, label: AWS Lambda }
  db: { icon: aws:dynamodb, label: Amazon DynamoDB }
edges:
  - api -> fn -> db
`;

  it("conventions.subtitle-echo flags a subtitle that repeats the title or lists the nodes", async () => {
    const [same] = await findings(
      spec("Orders API", "The orders APIs"),
      "conventions.subtitle-echo",
    );
    expect(same?.evidence.echoes).toBe("title");
    const [list] = await findings(
      spec("Orders API", "API Gateway, Lambda and DynamoDB"),
      "conventions.subtitle-echo",
    );
    expect(list?.evidence).toMatchObject({ echoes: "labels", labels: 3 });
    expect(
      await findings(
        spec("Orders API", "API Gateway hands each order to Lambda, which stores it in DynamoDB"),
        "conventions.subtitle-echo",
      ),
    ).toEqual([]);
  });
});

describe("check codes in the review", () => {
  const LANE = `groups:
  g: { type: box, label: Zone }
nodes:
  a: { label: A, in: g }
  x: X
  y: Y
edges:
  - x -> y
  - a -> y
`;

  const diag = (code: string, subject: Record<string, unknown>): Diagnostic => ({
    code,
    severity: "warning",
    message: `${code} test`,
    subject,
    evidence: { runPx: 3 },
    fixes: ["use layout: { spacing: loose }"],
  });

  it("maps DG222, DG224 and DG225 to their findings, and nothing without them", async () => {
    const { m, scene } = await laid(LANE);
    const id = edge(scene, "x").id;
    const mapped = (d: Diagnostic[]) =>
      reviewScene(scene, m, d, { width: 880 })
        .findings.filter((f) => f.rule && ["DG222", "DG224", "DG225"].includes(f.rule))
        .map((f) => [f.id, f.dimension, f.severity]);
    expect(mapped([])).toEqual([]);
    const report = reviewScene(
      scene,
      m,
      [
        diag("DG222", { edge: id, from: "x", to: "y", end: "y" }),
        diag("DG224", { edge: id, from: "x", to: "y", group: "g" }),
        diag("DG225", { edge: id, from: "x", to: "y", group: "g" }),
      ],
      { width: 880 },
    );
    expect(
      report.findings
        .filter((f) => f.rule && ["DG222", "DG224", "DG225"].includes(f.rule))
        .map((f) => [f.id, f.dimension, f.severity]),
    ).toEqual([
      ["grid.edge-on-border", "grid", "minor"],
      ["flow.head-on-bend", "flow", "minor"],
      ["overlap.title-band", "overlap", "minor"],
    ]);
    expect(report.dimensions.flow.metrics.headsOnBends).toBe(1);
  });

  it("maps DG223 as major only when the edge truly crosses the group", async () => {
    const { m, scene } = await laid(LANE);
    const g = group(scene, "g").box;
    const e = edge(scene, "x");
    const severity = () =>
      reviewScene(scene, m, [diag("DG223", { edge: e.id, from: "x", to: "y", group: "g" })], {
        width: 880,
      }).findings.find((f) => f.id === "overlap.edge-through-group")?.severity;
    const mid = g.y + g.h / 2;
    e.points = [
      { x: g.x - 50, y: mid },
      { x: g.x + g.w + 50, y: mid },
    ];
    expect(severity()).toBe("major");
    e.points = [
      { x: g.x - 50, y: g.y + 6 },
      { x: g.x + 10, y: g.y + 6 },
      { x: g.x + 10, y: g.y - 50 },
    ];
    expect(severity()).toBe("minor");
  });
});

describe("vendor naming rules", () => {
  const subnets = (a: string, b: string) => `groups:
  vnet: { type: azure:vnet, label: vnet-shop }
  s1: { type: azure:subnet, label: "${a}", in: vnet }
  s2: { type: azure:subnet, label: "${b}", in: vnet }
nodes:
  web: { icon: azure:app-services, label: App Service, in: s1 }
  pe: { icon: azure:private-endpoints, label: Private endpoint, in: s2 }
edges:
  - web -> pe
`;

  it("boundary-label asks several Azure subnets to say what each is for (AZ-12)", async () => {
    const hits = await findings(subnets("Subnet", "Subnet"), "conventions.boundary-label");
    expect(hits.map((f) => [f.subjects, f.rule, f.evidence.rule])).toEqual([
      [["s1"], "AZ-12", "AZ-12"],
      [["s2"], "AZ-12", "AZ-12"],
    ]);
    expect(await findings(subnets("snet-web", "snet-pe"), "conventions.boundary-label")).toEqual(
      [],
    );
  });

  const namespaces = (b: string) => `groups:
  project: { type: gcp:project, label: Project shop-prod }
  cluster: { type: k8s:cluster, label: GKE cluster, in: project }
  ns1: { type: k8s:namespace, label: Namespace web, in: cluster }
  ns2: { type: k8s:namespace, label: "${b}", in: cluster }
nodes:
  a: { icon: k8s:pod, label: Pods, in: ns1 }
  b: { icon: k8s:pod, label: Pods, in: ns2 }
`;

  it("boundary-label flags two sibling namespaces with one label (FLOW-12)", async () => {
    const [hit] = await findings(namespaces("Namespace web"), "conventions.boundary-label");
    expect(hit?.subjects).toEqual(["ns1", "ns2"]);
    expect(hit?.rule).toBe("FLOW-12");
    expect(await findings(namespaces("Namespace api"), "conventions.boundary-label")).toEqual([]);
  });

  const appFrame = (extra: string) => `groups:
  app: { type: azure:service-group, label: Orders app, icon: azure:app-services }
nodes:
  site: { icon: azure:app-services, label: App Service, in: app }
${extra}`;

  it("service-group flags an Azure service frame that holds another service", async () => {
    const [hit] = await findings(
      appFrame("  kv: { icon: azure:key-vaults, label: Key Vault, in: app }\n"),
      "conventions.service-group",
    );
    expect(hit?.subjects).toEqual(["app", "kv"]);
    expect(hit?.rule).toBe("FLOW-12");
    expect(hit?.patches).toEqual([{ op: "unset", path: "groups.app.icon" }]);
    expect(await findings(appFrame(""), "conventions.service-group")).toEqual([]);
  });

  it("service-label wants the Azure product in the label or the note (AZ-07)", async () => {
    const [hit] = await findings(
      "nodes:\n  api: { icon: azure:app-services, label: Orders API, note: Node.js 22 }\n",
      "conventions.service-label",
    );
    expect(hit?.rule).toBe("AZ-07");
    expect(hit?.patches).toEqual([
      { op: "set", path: "nodes.api.note", value: "App Service, Node.js 22" },
    ]);
    expect(
      await findings(
        "nodes:\n  api: { icon: azure:app-services, label: Orders API, note: App Service }\n",
        "conventions.service-label",
      ),
    ).toEqual([]);
    expect(
      await findings(
        "nodes:\n  gw: { icon: azure:virtual-network-gateways, label: ExpressRoute gateway }\n",
        "conventions.service-label",
      ),
    ).toEqual([]);
  });

  it("service-label wants the Google Cloud product named, unless the title names it (GCP-04)", async () => {
    const run = (title: string) =>
      `title: ${title}\nnodes:\n  web: { icon: gcp:vertex-ai, label: Model Registry }\n`;
    const [hit] = await findings(run("Orders platform"), "conventions.service-label");
    expect(hit?.rule).toBe("GCP-04");
    expect(hit?.evidence.rule).toBe("GCP-04");
    expect(await findings(run("MLOps on Vertex AI"), "conventions.service-label")).toEqual([]);
    expect(
      await findings(
        "nodes:\n  web: { icon: gcp:cloud-run, label: Cloud Run, note: Orders API }\n",
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
