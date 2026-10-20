import { describe, expect, it } from "vitest";
import { animateOf } from "../src/layout/index.ts";
import { parseEdgeExpression } from "../src/spec/edges.ts";
import { parseSpec } from "../src/spec/index.ts";
import type { Diagnostic } from "../src/types.ts";
import { listDiagnostics, model, must } from "./helpers.ts";

const NODES = "nodes: { a: A, b: B, c: C, d: D }\n";

/** Edges of a spec with nodes a to d, reduced to the fields an arrow sets. */
function edgesOf(...items: string[]) {
  const m = model(`${NODES}edges:\n${items.map((i) => `  - ${i}\n`).join("")}`);
  return m.edges.map(({ from, to, line, arrow, label }) => ({ from, to, line, arrow, label }));
}

const quoted = (expr: string) => JSON.stringify(expr);

/** The first diagnostic with `code`; fails with everything that was reported otherwise. */
function finding(source: string, code: string): Diagnostic & { parsed: boolean } {
  const result = parseSpec(source, "bad.yaml");
  const d = result.diagnostics.find((x) => x.code === code);
  if (!d) throw new Error(`no ${code}; got:\n${listDiagnostics(result.diagnostics) || "(none)"}`);
  return { ...d, parsed: result.model !== undefined };
}

describe("edge arrows", () => {
  it.each([
    ["a -> b", "solid", "end"],
    ["a <-> b", "solid", "both"],
    ["a -- b", "solid", "none"],
    ["a --> b", "dashed", "end"],
    ["a <--> b", "dashed", "both"],
    ["a --- b", "dashed", "none"],
    ["a ..> b", "dotted", "end"],
    ["a <..> b", "dotted", "both"],
    ["a ... b", "dotted", "none"],
    ["a ==> b", "thick", "end"],
    ["a <==> b", "thick", "both"],
    ["a === b", "thick", "none"],
  ])("%s draws a %s line with arrow %s", (expr, line, arrow) => {
    expect(edgesOf(quoted(expr))).toEqual([{ from: "a", to: "b", line, arrow }]);
  });

  it.each([
    ["a <- b", "solid"],
    ["a <-- b", "dashed"],
    ["a <.. b", "dotted"],
    ["a <== b", "thick"],
  ])("%s is laid out from b to a with the arrow at a (%s)", (expr, line) => {
    expect(edgesOf(quoted(expr))).toEqual([{ from: "b", to: "a", line, arrow: "end" }]);
  });

  it("reads arrows that contain < or > without spaces", () => {
    expect(edgesOf("a->b", "a-->b", "a<->b", "a==>b", "a..>b")).toEqual([
      { from: "a", to: "b", line: "solid", arrow: "end" },
      { from: "a", to: "b", line: "dashed", arrow: "end" },
      { from: "a", to: "b", line: "solid", arrow: "both" },
      { from: "a", to: "b", line: "thick", arrow: "end" },
      { from: "a", to: "b", line: "dotted", arrow: "end" },
    ]);
  });

  it.each(["a--b", "a---b", "a...b", "a===b"])("requires spaces around the arrow in %s", (expr) => {
    expect(parseEdgeExpression(expr)).toMatch(/no arrow/);
    expect(parseEdgeExpression(expr.replace(/([-.=]+)/, " $1 "))).not.toBeTypeOf("string");
  });

  it("keeps hyphens and dots inside ids", () => {
    const m = model("nodes: { web-app: W, db.v2: D }\nedges:\n  - web-app -> db.v2\n");
    expect(m.edges.map((e) => [e.from, e.to])).toEqual([["web-app", "db.v2"]]);
  });
});

describe("edge expressions", () => {
  it("fans out to every target", () => {
    expect(edgesOf("a -> b, c, d")).toEqual([
      { from: "a", to: "b", line: "solid", arrow: "end" },
      { from: "a", to: "c", line: "solid", arrow: "end" },
      { from: "a", to: "d", line: "solid", arrow: "end" },
    ]);
  });

  it("fans in from every source", () => {
    expect(edgesOf("a, b -> c")).toEqual([
      { from: "a", to: "c", line: "solid", arrow: "end" },
      { from: "b", to: "c", line: "solid", arrow: "end" },
    ]);
  });

  it("splits a chain into hops, each with its own arrow", () => {
    expect(edgesOf("a -> b --> c <- d")).toEqual([
      { from: "a", to: "b", line: "solid", arrow: "end" },
      { from: "b", to: "c", line: "dashed", arrow: "end" },
      { from: "d", to: "c", line: "solid", arrow: "end" },
    ]);
  });

  it("labels one hop of a chain inline", () => {
    const result = parseSpec(`${NODES}edges:\n  - a -[HTTPS]-> b -> c\n`);
    expect(result.diagnostics).toEqual([]);
    expect(must(result.model, "model").edges.map((e) => [e.from, e.to, e.label])).toEqual([
      ["a", "b", "HTTPS"],
      ["b", "c", undefined],
    ]);
  });

  it("reads a dashed inline label", () => {
    expect(edgesOf("a --[async]--> b")).toEqual([
      { from: "a", to: "b", line: "dashed", arrow: "end", label: "async" },
    ]);
  });

  it("takes the label after the first colon of a string edge", () => {
    expect(edgesOf(quoted("a -> b: HTTPS"), quoted("a -> c: GET: /orders"))).toEqual([
      { from: "a", to: "b", line: "solid", arrow: "end", label: "HTTPS" },
      { from: "a", to: "c", line: "solid", arrow: "end", label: "GET: /orders" },
    ]);
  });

  it("reads the YAML list item form `- a -> b: label`", () => {
    expect(edgesOf("a -> b: HTTPS", "a -> b, c: poll", "c --> d: 443")).toEqual([
      { from: "a", to: "b", line: "solid", arrow: "end", label: "HTTPS" },
      { from: "a", to: "b", line: "solid", arrow: "end", label: "poll" },
      { from: "a", to: "c", line: "solid", arrow: "end", label: "poll" },
      { from: "c", to: "d", line: "dashed", arrow: "end", label: "443" },
    ]);
  });

  it("reads options in a mapping after the arrow", () => {
    const m = model(
      `${NODES}edges:\n  - a -> b: { label: enqueue, step: 2, color: "#ed7100", line: dashed }\n`,
    );
    expect(m.edges).toEqual([
      {
        id: "e1",
        from: "a",
        to: "b",
        label: "enqueue",
        line: "dashed",
        arrow: "end",
        color: "#ed7100",
        step: 2,
        constraint: true,
      },
    ]);
  });

  it("keeps constraint: false edges out of the layout but draws them", async () => {
    const { layout } = await import("../src/layout/index.ts");
    const m = model(
      `${NODES}edges:\n  - a -> b\n  - b --> c: { label: replica, constraint: false }\n`,
    );
    expect(m.edges[1]?.constraint).toBe(false);
    const scene = await layout(m);
    const free = scene.edges.find((e) => e.id === "e2");
    expect(free?.points.length).toBeGreaterThanOrEqual(2);
    expect(free?.label?.lines).toEqual(["replica"]);
  });

  it("leaves a stacked icon node below its label and note, not through them", async () => {
    const { layout } = await import("../src/layout/index.ts");
    const scene = await layout(
      model(
        "direction: right\ngroups: { z: { type: zone } }\nnodes:\n  a: { icon: generic:server, label: Scheduler, note: Orchestration, in: z }\n  b: { icon: generic:database, label: Models, in: z }\n  c: { icon: generic:api, label: Engine }\nedges:\n  - a --> b: { constraint: false }\n  - b -> c\n",
      ),
    );
    const a = must(
      scene.nodes.find((n) => n.id === "a"),
      "node a",
    );
    const free = must(
      scene.edges.find((e) => e.id === "e1"),
      "free edge",
    );
    const [start] = free.points;
    const textBottom = Math.max(...[a.labelBox, a.noteBox].map((b) => (b ? b.y + b.h : 0)));
    expect(start?.y).toBeGreaterThanOrEqual(textBottom);
  });

  it("reads the object form with a list of targets", () => {
    const m = model(`${NODES}edges:\n  - { from: a, to: [b, c], label: poll, line: dashed }\n`);
    expect(m.edges.map(({ from, to, label, line }) => ({ from, to, label, line }))).toEqual([
      { from: "a", to: "b", label: "poll", line: "dashed" },
      { from: "a", to: "c", label: "poll", line: "dashed" },
    ]);
  });

  it("connects every pair in the object form and honours arrow", () => {
    const m = model(`${NODES}edges:\n  - { from: [a, b], to: [c, d], arrow: both }\n`);
    expect(m.edges.map((e) => `${e.from}>${e.to}:${e.arrow}`)).toEqual([
      "a>c:both",
      "a>d:both",
      "b>c:both",
      "b>d:both",
    ]);
  });

  it("accepts edges written as a mapping", () => {
    const m = model(`${NODES}edges:\n  a -> b: first\n  b -> c:\n`);
    expect(m.edges.map((e) => [e.from, e.to, e.label])).toEqual([
      ["a", "b", "first"],
      ["b", "c", undefined],
    ]);
  });

  it("connects groups as well as nodes", () => {
    const m = model(
      "groups: { vpc: aws:vpc }\nnodes: { a: { in: vpc }, s3: aws:s3 }\nedges:\n  - vpc -> s3\n",
    );
    expect(m.edges.map((e) => [e.from, e.to])).toEqual([["vpc", "s3"]]);
  });

  it("numbers edge ids in spec order", () => {
    const m = model(`${NODES}edges:\n  - a -> b, c\n  - c -> d\n`);
    expect(m.edges.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });
});

describe("nodes, groups and nesting", () => {
  it("places nodes with in and with contains", () => {
    const m = model(`groups:
  vpc: { type: aws:vpc }
  subnet: { type: aws:private-subnet, contains: [api, db] }
  team: { type: zone, in: vpc, contains: [subnet] }
nodes:
  api: aws:lambda
  db: aws:aurora
  edge: { icon: aws:cloudfront, in: vpc }
`);
    const parent = Object.fromEntries([...m.nodes, ...m.groups].map((x) => [x.id, x.parent]));
    expect(parent).toEqual({
      api: "subnet",
      db: "subnet",
      edge: "vpc",
      vpc: undefined,
      subnet: "team",
      team: "vpc",
    });
  });

  it("accepts the documented synonyms", () => {
    const m = model(`groups:
  g: { kind: aws:vpc }
  h: { style: box, parent: g, children: [c] }
  k: { type: zone, nodes: [d] }
nodes:
  a: { icon: aws:s3, sublabel: "first note", parent: g, link: "https://example.com/a" }
  b: { icon: aws:s3, description: second note, group: g, href: "https://example.com/b" }
  c: { label: C, style: shape }
  d: D
edges:
  - { source: a, target: b, text: copy, style: dotted }
`);
    const byId = Object.fromEntries(m.nodes.map((n) => [n.id, n]));
    expect(byId.a).toMatchObject({ note: "first note", parent: "g", url: "https://example.com/a" });
    expect(byId.b).toMatchObject({
      note: "second note",
      parent: "g",
      url: "https://example.com/b",
    });
    expect(byId.c).toMatchObject({ parent: "h", look: "shape" });
    expect(byId.d).toMatchObject({ parent: "k" });
    expect(m.groups.map((g) => [g.id, g.type, g.parent])).toEqual([
      ["g", "aws:vpc", undefined],
      ["h", "box", "g"],
      ["k", "zone", undefined],
    ]);
    expect(m.edges).toMatchObject([{ from: "a", to: "b", label: "copy", line: "dotted" }]);
  });

  it("accepts nodes and groups as lists", () => {
    const m = model(`groups:
  - { id: g, type: box }
nodes:
  - { id: a, label: A, in: g }
  - b: { label: B }
  - c: aws:lambda
`);
    expect(m.nodes.map((n) => [n.id, n.label, n.parent])).toEqual([
      ["a", "A", "g"],
      ["b", "B", undefined],
      ["c", "AWS Lambda", undefined],
    ]);
  });

  it("parses JSON specs by file extension", () => {
    const m = model(
      '{"nodes": {"a": {"icon": "aws:lambda"}, "b": "B"}, "edges": ["a -> b"]}',
      "d.json",
    );
    expect(m.nodes.map((n) => n.label)).toEqual(["AWS Lambda", "B"]);
    expect(m.edges).toHaveLength(1);
  });
});

describe("icons in specs", () => {
  it.each([
    ["aws:s3", "aws:simple-storage-service", "Amazon Simple Storage Service"],
    ["k8s:deploy", "k8s:deployment", "Deployment"],
    ["generic:database", "tabler:database", "Database"],
    ["aws:sqs", "aws:simple-queue-service", "Amazon Simple Queue Service"],
    ["AWS:Lambda", "aws:lambda", "AWS Lambda"],
  ])("resolves %s to %s and defaults the label to its official name", (alias, id, name) => {
    const m = model(`nodes:\n  x: { icon: "${alias}" }\n`);
    expect(m.nodes[0]).toMatchObject({ icon: id, label: name, look: "icon" });
  });

  it("keeps an explicit label over the official name", () => {
    expect(model("nodes:\n  x: { icon: aws:s3, label: Originals }\n").nodes[0]?.label).toBe(
      "Originals",
    );
  });

  it("reads the string shorthand as an icon id when one matches, else as a label", () => {
    const m = model("nodes:\n  cache: aws:elasticache\n  legacy: Mainframe\n");
    expect(m.nodes.map(({ id, icon, label, look }) => ({ id, icon, label, look }))).toEqual([
      { id: "cache", icon: "aws:elasticache", label: "Amazon ElastiCache", look: "icon" },
      { id: "legacy", icon: undefined, label: "Mainframe", look: "shape" },
    ]);
  });

  it("reports a typo in the icon shorthand instead of drawing it as a label", () => {
    const d = finding("nodes:\n  f: aws:lamda\n", "DG101");
    expect(d.fixes?.[0]).toBe('use icon "aws:lambda"');
  });

  it("lets a group hide its header icon or replace it", () => {
    const m = model(
      "groups:\n  a: { type: aws:vpc, icon: false }\n  b: { type: box, icon: aws:s3 }\nnodes:\n  x: { in: a }\n  y: { in: b }\n",
    );
    expect(m.groups.map((g) => g.icon)).toEqual([null, "aws:simple-storage-service"]);
  });
});

describe("defaults", () => {
  it("fills every documented default", () => {
    const m = model(
      "nodes:\n  a: { icon: aws:lambda }\n  b: { label: B }\n  c:\n  d: { icon: aws:s3, look: card }\nedges:\n  - a -> b\n",
    );
    expect(m).toMatchObject({
      direction: "right",
      theme: "dark",
      routing: "orthogonal",
      spacing: 1,
      layering: "source",
      merge: true,
      arrowhead: "open",
      skin: "stage",
      title: undefined,
      background: undefined,
    });
    // Unset animate follows the skin: relay for stage, packets for classic.
    expect(m.animate).toBeUndefined();
    expect(animateOf(m)).toBe("relay");
    expect(animateOf({ ...m, skin: "classic" })).toBe("packets");
    expect(
      m.nodes.map(({ id, label, look, shape, iconSize }) => ({ id, label, look, shape, iconSize })),
    ).toEqual([
      { id: "a", label: "AWS Lambda", look: "icon", shape: "rounded", iconSize: 48 },
      { id: "b", label: "B", look: "shape", shape: "rounded", iconSize: 48 },
      { id: "c", label: "c", look: "shape", shape: "rounded", iconSize: 48 },
      {
        id: "d",
        label: "Amazon Simple Storage Service",
        look: "card",
        shape: "rounded",
        iconSize: 32,
      },
    ]);
    expect(m.edges[0]).toMatchObject({ line: "solid", arrow: "end" });
  });

  it("labels groups after their style and types untyped groups as box", () => {
    const m = model(
      "groups:\n  v: { type: aws:vpc }\n  r: aws:region\n  plain: {}\nnodes:\n  a: { in: v }\n  b: { in: r }\n  c: { in: plain }\n",
    );
    expect(m.groups.map(({ id, type, label }) => ({ id, type, label }))).toEqual([
      { id: "v", type: "aws:vpc", label: "VPC" },
      { id: "r", type: "aws:region", label: "Region" },
      { id: "plain", type: "box", label: "" },
    ]);
  });

  it("maps named spacing and sizes to numbers and clamps numeric ones", () => {
    expect(model("layout: { spacing: compact }\nnodes: { a: A }\n").spacing).toBe(0.75);
    expect(model("layout: { spacing: loose }\nnodes: { a: A }\n").spacing).toBe(1.35);
    expect(model("layout: { spacing: 9 }\nnodes: { a: A }\n").spacing).toBe(3);
    const sizes = model(
      "nodes:\n  a: { icon: aws:s3, size: sm }\n  b: { icon: aws:s3, size: xl }\n  c: { icon: aws:s3, size: 500 }\n",
    ).nodes.map((n) => n.iconSize);
    expect(sizes).toEqual([32, 80, 128]);
  });

  it("draws a shape with a small icon when an icon node sets a shape", () => {
    expect(model("nodes:\n  a: { icon: aws:s3, shape: cylinder }\n").nodes[0]).toMatchObject({
      look: "shape",
      shape: "cylinder",
      icon: "aws:simple-storage-service",
    });
  });

  it("applies a top-level look to icon nodes only", () => {
    const m = model("look: card\nnodes:\n  a: { icon: aws:lambda }\n  b: { label: B }\n");
    expect(m.nodes.map((n) => [n.id, n.look])).toEqual([
      ["a", "card"],
      ["b", "shape"],
    ]);
  });

  it("reads skin as classic or stage, and lets it pick the default motion", () => {
    const stage = model("skin: stage\nnodes: { a: A }\n");
    expect(stage.skin).toBe("stage");
    expect(animateOf(stage)).toBe("relay");
    expect(animateOf(model("skin: stage\nanimate: packets\nnodes: { a: A }\n"))).toBe("packets");
    expect(animateOf(model("animate: relay\nnodes: { a: A }\n"))).toBe("relay");
    expect(finding("skin: stag\nnodes: { a: A }\n", "DG107").fixes).toEqual(['use "stage"']);
  });

  it("reads arrowhead as open or filled", () => {
    expect(model("arrowhead: filled\nnodes: { a: A }\n").arrowhead).toBe("filled");
    expect(finding("arrowhead: fill\nnodes: { a: A }\n", "DG107").fixes).toEqual(['use "filled"']);
  });

  it("merges edges into trunks unless layout.merge is false", () => {
    expect(model("nodes: { a: A }\n").merge).toBe(true);
    expect(model("layout: { merge: false }\nnodes: { a: A }\n").merge).toBe(false);
    expect(finding("layout: { merge: maybe }\nnodes: { a: A }\n", "DG107").message).toMatch(
      /merge/,
    );
  });
});

describe("node links", () => {
  it.each([
    "https://example.com/docs",
    "http://intranet/wiki",
    "mailto:team@example.com",
    "docs/runbook.md",
  ])("accepts %s", (url) => {
    expect(model(`nodes:\n  a: { label: A, url: "${url}" }\n`).nodes[0]?.url).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "data:text/html,<b>x</b>",
    "vbscript:msgbox",
  ])("rejects %s, which would run code from the SVG or HTML", (url) => {
    const d = finding(`nodes:\n  a: { label: A, url: "${url}" }\n`, "DG107");
    expect(d.parsed).toBe(false);
    expect(d.fixes).toEqual(expect.arrayContaining([expect.stringMatching(/https:\/\//)]));
  });
});

describe("around groups", () => {
  const SPEC = `groups:
  az-a: { type: aws:az }
  az-b: { type: aws:az }
  asg: { type: aws:auto-scaling, around: [web-a, web-b] }
nodes:
  web-a: { icon: aws:ec2, in: az-a }
  web-b: { icon: aws:ec2, in: az-b }
`;

  it("outlines ids that live in other groups without becoming their parent", () => {
    const m = model(SPEC);
    expect(m.groups.find((g) => g.id === "asg")?.around).toEqual(["web-a", "web-b"]);
    expect(m.nodes.map((n) => n.parent)).toEqual(["az-a", "az-b"]);
  });

  it.each<[string, string, string]>([
    ["a missing member", SPEC.replace("web-b]", "web-c]"), "DG104"],
    ["around with contains", SPEC.replace("around:", "contains: [web-a], around:"), "DG104"],
    ["a node placed in an around group", `${SPEC}  extra: { label: X, in: asg }\n`, "DG104"],
    ["around that is not a list", SPEC.replace("[web-a, web-b]", "web-a"), "DG107"],
  ])("reports %s", (_what, source, code) => {
    expect(finding(source, code).severity).toBe("error");
  });
});

describe("diagnostics", () => {
  it.each<[string, string, string, RegExp]>([
    [
      "DG100",
      "a file that does not parse",
      "nodes: [a, b\nedges: {\n",
      /fix the YAML\/JSON syntax/,
    ],
    ["DG100", "a spec with no nodes", "title: Empty\n", /add at least one entry under nodes/],
    ["DG100", "a spec that is not a mapping", "just words\n", /orrery init/],
    ["DG101", "a misspelled icon", "nodes:\n  f: { icon: aws:lamda }\n", /^use icon "aws:lambda"$/],
    [
      "DG101",
      "a misspelled group icon",
      "groups:\n  g: { icon: k8s:deploymnet }\nnodes:\n  a: { in: g }\n",
      /^use icon "k8s:deployment"$/,
    ],
    [
      "DG102",
      "an unknown group type",
      "groups:\n  v: { type: aws:vcp }\nnodes:\n  a: { in: v }\n",
      /^use type "aws:vpc"$/,
    ],
    ["DG103", "a malformed id", 'nodes:\n  "bad id": { label: A }\n', /^rename to "bad-id"$/],
    [
      "DG103",
      "an id used twice",
      "groups:\n  a: { type: box }\nnodes:\n  a: A\n  b: B\n",
      /rename one of them/,
    ],
    [
      "DG104",
      "in: naming a group that does not exist",
      "groups:\n  vpc: aws:vpc\nnodes:\n  b: { in: vcp }\n",
      /^use in: vpc$/,
    ],
    ["DG104", "in: naming a node", "nodes:\n  a: A\n  b: { in: a }\n", /add a group/],
    [
      "DG104",
      "contains naming a missing id",
      "groups:\n  g: { contains: [apii] }\nnodes:\n  api: A\n",
      /^use "api"$/,
    ],
    [
      "DG105",
      "groups that contain each other",
      "groups:\n  g1: { in: g2 }\n  g2: { in: g1 }\nnodes:\n  a: { in: g1 }\n",
      /remove the "in"/,
    ],
    [
      "DG106",
      "an edge to an unknown id",
      "nodes:\n  api: A\n  db: B\nedges:\n  - api -> dbb\n",
      /^use "db"$/,
    ],
    ["DG107", "a misspelled direction", "direction: rihgt\nnodes:\n  a: A\n", /^use "right"$/],
    ["DG107", "a misspelled shape", "nodes:\n  a: { shape: cylindr }\n", /^use "cylinder"$/],
    [
      "DG107",
      "a misspelled line",
      "nodes: { a: A, b: B }\nedges:\n  - { from: a, to: b, line: dashd }\n",
      /^use "dashed"$/,
    ],
    [
      "DG108",
      "a misspelled node key",
      "nodes:\n  a: { lable: A }\n",
      /^rename "lable" to "label"$/,
    ],
    [
      "DG108",
      "a misspelled top-level key",
      "titel: x\nnodes:\n  a: A\n",
      /^rename "titel" to "title"$/,
    ],
    [
      "DG108",
      "a misspelled edge key",
      "nodes: { a: A, b: B }\nedges:\n  - { from: a, to: b, lable: x }\n",
      /^rename "lable" to "label"$/,
    ],
    [
      "DG108",
      "a comma inside an unquoted {...} value",
      "nodes:\n  resize: { icon: aws:lambda, note: Sharp, 512 MB }\n",
      /quote/,
    ],
    ["DG109", "an edge with no arrow", "nodes: { a: A, b: B }\nedges:\n  - a b\n", /"a -> b"/],
    [
      "DG109",
      "an edge mapping with no target",
      "nodes: { a: A, b: B }\nedges:\n  - { from: a }\n",
      /add from: and to:/,
    ],
    [
      "DG110",
      "a label on a chain",
      "nodes: { a: A, b: B, c: C }\nedges:\n  - a -> b -> c: label\n",
      /-\[label\]->/,
    ],
  ])("%s fires for %s, with a fix", (code, _what, source, fix) => {
    const d = finding(source, code);
    expect(d.severity).toBe(code === "DG110" ? "warning" : "error");
    expect(d.parsed).toBe(code === "DG110");
    expect(d.fixes).toEqual(expect.arrayContaining([expect.stringMatching(fix)]));
  });

  it("points DG101 at the node and icon", () => {
    expect(finding("nodes:\n  f: { icon: aws:lamda }\n", "DG101").subject).toEqual({
      node: "f",
      icon: "aws:lamda",
    });
  });

  it("reports the YAML line of a parse error", () => {
    expect(finding("nodes:\n  a: [\n", "DG100").message).toMatch(/line \d+/);
  });

  it("keeps the edges of a chain whose label was dropped", () => {
    const result = parseSpec("nodes: { a: A, b: B, c: C }\nedges:\n  - a -> b -> c: label\n");
    expect(must(result.model, "model").edges.map((e) => [e.from, e.to, e.label])).toEqual([
      ["a", "b", undefined],
      ["b", "c", undefined],
    ]);
  });

  it("reports every problem in one pass", () => {
    const result = parseSpec(
      "direction: sideways\nnodes:\n  a: { icon: aws:lamda, lable: x }\nedges:\n  - a -> zz\n",
    );
    expect(result.diagnostics.map((d) => d.code).sort()).toEqual([
      "DG101",
      "DG106",
      "DG107",
      "DG108",
    ]);
  });

  it.each([
    ["node note", "nodes:\n  a: { icon: aws:lambda, note: Python, Node }\n"],
    ["edge label", "nodes: { a: A, b: B }\nedges:\n  - a -> b: { label: GET, POST }\n"],
  ])("suggests quoting when a comma splits a one-word %s", (_kind, src) => {
    expect(finding(src, "DG108").fixes?.[0]).toMatch(/quote/);
  });

  it("allows a colon inside an inline label", () => {
    expect(edgesOf(quoted("a -[port: 443]-> b"))).toEqual([
      { from: "a", to: "b", line: "solid", arrow: "end", label: "port: 443" },
    ]);
  });

  it("does not silently ignore a contains that is a single id", () => {
    const result = parseSpec("groups:\n  g: { type: box, contains: api }\nnodes:\n  api: A\n");
    const placed = result.model?.nodes.find((n) => n.id === "api")?.parent === "g";
    const reported = result.diagnostics.some((d) => d.severity === "error");
    expect(placed || reported).toBe(true);
  });

  it("gives every error a fix", () => {
    const sources = [
      "nodes:\n  a: { label: A, color: red }\n",
      "background: blue\nnodes:\n  a: A\n",
      "groups:\n  g: { type: box, fill: blue }\nnodes:\n  a: { in: g }\n",
      "nodes:\n  a: { icon: aws:s3, size: huge }\n",
      "nodes: { a: A, b: B }\nedges:\n  - a -> b: { step: 1.5 }\n",
      "layout: 3\nnodes:\n  a: A\n",
      "nodes:\n  a: A\nedges: 5\n",
      "nodes:\n  a: A\nedges:\n  - 42\n",
      "nodes:\n  - [a]\n",
    ];
    const missing = sources.flatMap((s) =>
      parseSpec(s)
        .diagnostics.filter((d) => d.severity === "error" && !d.fixes?.length)
        .map((d) => `${d.code} ${d.message}`),
    );
    expect(missing).toEqual([]);
  });
});
