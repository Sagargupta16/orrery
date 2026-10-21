import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { importMermaid } from "../src/import/mermaid.ts";
import { layout } from "../src/layout/index.ts";
import { renderMermaid } from "../src/render/mermaid.ts";
import { model, SAMPLE } from "./helpers.ts";

async function mmd(source: string): Promise<string> {
  const m = model(source);
  return renderMermaid(m, await layout(m, { theme: "light" }));
}

const lines = (text: string) => text.split("\n");
/** The diagram's own first line, after any front matter. */
const header = (text: string) => text.replace(/^---\n[\s\S]*?\n---\n/, "").split("\n")[0];
/** Every architecture edge statement. */
const ARCH_EDGE = /^ {2}\w+(\{group\})?:[LRTB] <?-(-|\["[^"]*"\]-)>? [LRTB]:\w+(\{group\})?$/;

describe("Mermaid export: architecture-beta", () => {
  it("writes groups, services with logo icons and edges on sides", async () => {
    const out = await mmd(SAMPLE);
    expect(out.startsWith('---\ntitle: "Orders platform"\n---\narchitecture-beta\n')).toBe(true);
    expect(out).toContain("  accDescr: Sample diagram for the test suite\n");
    expect(out).toContain('  group cloud(logos:aws)["AWS Cloud"]\n');
    expect(out).toContain('  group region["us-east-1"] in cloud\n');
    expect(out).toContain('  group private["Private subnet"] in vpc\n');
    expect(out).toContain('  service api(logos:aws-ecs)["Orders API"] in private\n');
    expect(out).toContain('  service worker(logos:aws-lambda)["Worker"] in private\n');
    expect(out).toContain('  service queue(logos:aws-sqs)["Jobs"] in region\n');
    // No logo for the product: Mermaid's own icons, from the icon or the shape.
    expect(out).toContain('  service users(internet)["Users"]\n');
    expect(out).toContain('  service db(database)["Orders DB"] in private\n');
    const edges = lines(out).filter((l) => /^ {2}\w+(\{group\})?:[LRTB] /.test(l));
    expect(edges).toHaveLength(7);
    for (const e of edges) expect(e).toMatch(ARCH_EDGE);
    expect(edges.some((e) => e.includes('-["HTTPS"]->'))).toBe(true);
  });

  it("declares every group before what it holds", async () => {
    const out = await mmd(`groups:
  inner: { type: zone, in: outer }
  outer: { type: zone }
nodes:
  a: { label: A, in: inner }
`);
    const at = (s: string) => out.indexOf(s);
    expect(at("group outer")).toBeGreaterThan(0);
    expect(at("group outer")).toBeLessThan(at("group inner"));
    expect(at("group inner")).toBeLessThan(at("service a"));
  });

  it("picks the sides from where the layout put the two ends", async () => {
    expect(
      await mmd("direction: right\nnodes: { a: { label: A }, b: { label: B } }\nedges: [a -> b]\n"),
    ).toContain("  a:R --> L:b\n");
    expect(
      await mmd("direction: down\nnodes: { a: { label: A }, b: { label: B } }\nedges: [a -> b]\n"),
    ).toContain("  a:B --> T:b\n");
  });

  it("keeps one edge each way between two services and writes backwards edges the way they point", async () => {
    const out = await mmd(`direction: right
nodes: { a: { label: A }, b: { label: B } }
edges:
  - a -> b: one
  - b <- a: two
  - a <- b: three
  - a -> b: four
`);
    const edges = lines(out).filter((l) => ARCH_EDGE.test(l));
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatch(/^ {2}a:\w -\["one"\]-> \w:b$/);
    // The second a-to-b edge goes the other way round, its arrow at the start.
    expect(edges[1]).toMatch(/^ {2}b:\w <-\["two"\]- \w:a$/);
  });

  it("ends an edge drawn to a group on the group boundary beside its first service", async () => {
    const out = await mmd(`direction: right
groups:
  vpc: { type: zone }
  subnet: { type: zone, in: vpc }
  empty: { type: zone }
nodes:
  user: { label: User }
  app: { label: App, in: subnet }
edges:
  - user -> vpc
  - user -> empty
`);
    expect(out).toMatch(/ {2}user:\w --> \w:app\{group\}\n/);
    // A group with no service anywhere inside gets a junction to end on.
    expect(out).toContain("  junction empty_edge in empty\n");
    expect(out).toMatch(/ {2}user:\w --> \w:empty_edge\n/);
  });

  it("quotes and escapes titles", async () => {
    const out = await mmd(`nodes:
  a: { label: 'Say "hi" [now] #1 <b> | a\\b' }
  b: { label: B }
edges:
  - a -> b: "x & y"
`);
    expect(out).toContain('service a(server)["Say #34;hi#34; [now] #35;1 #60;b#62; #124; a#92;b"]');
    expect(out).toContain('-["x #38; y"]->');
  });
});

describe("Mermaid export: flowchart", () => {
  const FLOW = `title: Order flow
kind: flowchart
direction: right
groups:
  back: { type: zone, label: Back office }
  inner: { type: zone, label: Desk, in: back }
  ring: { type: zone, label: Ring, around: [check] }
nodes:
  end: { shape: terminator, label: Done }
  in-1: { shape: input, label: "Order \\"A\\" #7 <x>", note: Web form }
  check: { shape: decision, label: OK?, in: inner }
  sub: { shape: predefined, label: Credit, in: back }
  man: { shape: manual, label: Call }
  db: { shape: database, label: Store }
  doc: { shape: document, label: Invoice }
  wait: { shape: delay, label: Wait }
  start: { shape: initial }
edges:
  - start -> in-1
  - in-1 -> check: "a | b"
  - check --> sub: yes
  - check ..> man: no
  - man ==> db
  - db -- doc
  - doc <-> wait
  - end <- wait
  - sub -> ring
`;

  it("maps shapes, subgraphs, line styles and arrows", async () => {
    const out = await mmd(FLOW);
    expect(header(out)).toBe("flowchart LR");
    const body = lines(out);
    expect(body).toContain('  subgraph back["Back office"]');
    expect(body).toContain('    subgraph inner["Desk"]');
    expect(body).toContain('      check{"OK?"}');
    expect(body).toContain('    sub[["Credit"]]');
    // The keyword `end` and a hyphenated id become safe ids.
    expect(body).toContain('  n_end(["Done"])');
    expect(body).toContain('  in_1[/"Order #34;A#34; #35;7 #60;x#62;<br/>Web form"/]');
    expect(body).toContain('  man[\\"Call"/]');
    expect(body).toContain('  db[("Store")]');
    expect(body).toContain('  doc@{ shape: doc, label: "Invoice" }');
    expect(body).toContain('  wait@{ shape: delay, label: "Wait" }');
    expect(body).toContain('  start@{ shape: sm-circ, label: " " }');
    expect(body).toContain('  in_1 -->|"a #124; b"| check');
    expect(body).toContain('  check -.->|"yes"| sub');
    expect(body).toContain('  check -.->|"no"| man');
    expect(body).toContain("  man ==> db");
    expect(body).toContain("  db --- doc");
    expect(body).toContain("  doc <--> wait");
    // An arrow at the start is the same link written the other way round.
    expect(body).toContain("  wait --> n_end");
    // An overlay is not a subgraph; an edge to it ends on its first member.
    expect(out).not.toContain("ring");
    expect(body).toContain("  sub --> check");
  });

  it("reads back through the Mermaid import with the same topology", async () => {
    const out = await mmd(`kind: flowchart
groups:
  g: { type: zone, label: Group }
nodes:
  a: { shape: process, label: Alpha }
  b: { shape: decision, label: Beta, in: g }
  c: { shape: database, label: Gamma, in: g }
edges:
  - a -> b: go
  - b ..> c
`);
    const back = parse(importMermaid(out).yaml) as {
      groups: Record<string, { label: string }>;
      nodes: Record<string, { label: string; in?: string }>;
      edges: string[];
    };
    expect(Object.keys(back.nodes).sort()).toEqual(["a", "b", "c"]);
    expect(back.nodes.b?.in).toBe("g");
    expect(back.groups.g?.label).toBe("Group");
    expect(back.edges).toHaveLength(2);
  });

  it("draws BPMN elements and message flows in a process", async () => {
    const out = await mmd(`kind: process
direction: down
groups:
  p: { type: pool, label: Shop }
  q: { type: pool, label: Bank }
nodes:
  s: { bpmn: start, label: Start, in: p }
  g: { bpmn: parallel, in: p }
  t: { bpmn: user-task, label: Pay, in: p }
  e: { bpmn: end, label: Paid, in: p }
  r: { bpmn: receive-task, label: Book, in: q }
edges:
  - s -> g -> t -> e
  - t -> r: { flow: message, label: Money }
`);
    expect(header(out)).toBe("flowchart TB");
    expect(out).toContain('    s(("Start"))');
    expect(out).toContain('    g{"+"}');
    expect(out).toContain('    t("Pay")');
    expect(out).toContain('    e((("Paid")))');
    expect(out).toContain('  t -.->|"Money"| r');
  });

  it("writes a tree as a flowchart, and a mind map that is not a tree too", async () => {
    const tree = await mmd(
      "kind: tree\nnodes: { a: { label: A }, b: { label: B } }\nedges: [a -> b]\n",
    );
    expect(header(tree)).toBe("flowchart TB");
    const loop = await mmd(
      "kind: mindmap\nnodes: { a: { label: A }, b: { label: B }, c: { label: C } }\nedges: [a -> b, a -> c, b -> c]\n",
    );
    expect(header(loop)).toMatch(/^flowchart /);
  });
});

describe("Mermaid export: stateDiagram-v2", () => {
  it("writes states, [*] for the pseudostates, composite states and escaped transitions", async () => {
    const out = await mmd(`kind: state
direction: down
groups:
  busy: { type: zone, label: "Busy: on" }
nodes:
  start: { shape: initial }
  idle: { shape: state, label: "Idle \\"0\\"" }
  run: { shape: state, label: Running, in: busy }
  inner: { shape: initial, in: busy }
  pick: { shape: decision, label: Pick }
  stop: { shape: final }
edges:
  - start -> idle
  - idle -> pick: "go [x > 1]; now: 100%"
  - pick -> busy
  - inner -> run
  - run -> stop
  - idle -> idle: tick
`);
    expect(header(out)).toBe("stateDiagram-v2");
    const body = lines(out);
    expect(body).toContain("  direction TB");
    expect(body).toContain('  state "Idle #34;0#34;" as idle');
    expect(body).toContain("  state pick <<choice>>");
    expect(body).toContain("  busy : Busy#58; on");
    expect(body).toContain("  state busy {");
    // The initial pseudostate inside the composite is its own [*].
    expect(body).toContain("    [*] --> run");
    expect(body).toContain("  [*] --> idle");
    expect(body).toContain("  idle --> pick : go [x #62; 1]#59; now#58; 100#37;");
    expect(body).toContain("  idle --> idle : tick");
    expect(body).toContain("  run --> [*]");
    expect(body).toContain("  pick --> busy");
  });
});

describe("Mermaid export: stateDiagram-v2 scopes", () => {
  it("writes a transition between two composites at the top", async () => {
    const out = await mmd(`kind: state
groups:
  outer: { type: zone, label: Outer }
  inner: { type: zone, label: Inner, in: outer }
nodes:
  a: { shape: state, label: A, in: outer }
  b: { shape: state, label: B, in: inner }
  c: { shape: state, label: C, in: outer }
edges:
  - a -> c
  - a -> b
`);
    const body = lines(out);
    expect(body).toContain("    a --> c");
    expect(body).toContain("  a --> b");
    expect(body.indexOf("  a --> b")).toBeGreaterThan(body.indexOf("  }"));
  });
});

describe("Mermaid export: mindmap", () => {
  it("indents the tree under its root with shapes and quoted text", async () => {
    const out = await mmd(`kind: mindmap
nodes:
  root: { label: "Launch (v2)" }
  a: { shape: box, label: "Docs [beta]" }
  b: { shape: hexagon, label: Sales }
  c: { label: "end" }
edges:
  - root -> a, b
  - a -> c
`);
    expect(header(out)).toBe("mindmap");
    const body = lines(out).slice(lines(out).indexOf("mindmap") + 1);
    expect(body.slice(0, 4)).toEqual([
      '  n_root(("Launch (v2)"))',
      '    a["Docs [beta]"]',
      '      c("end")',
      '    b{{"Sales"}}',
    ]);
  });
});

describe("Mermaid export: journey", () => {
  it("writes one section per stage and one task per scored step", async () => {
    const out = await mmd(`title: "Onboarding: v1"
kind: journey
stages: [Find, "Use: daily"]
groups:
  me: { type: lane, label: "Me, the user" }
  pain: { type: lane, label: Pains }
nodes:
  a: { in: me, stage: Find, label: "Search: web", score: -2 }
  b: { in: me, stage: "Use: daily", label: "Use #1", score: 2 }
  c: { in: pain, stage: Find, label: Too many ads }
edges:
  - a -> b
`);
    expect(lines(out)).toEqual([
      "journey",
      "  title Onboarding: v1",
      "  section Find",
      "    Search#58; web: 1: Me#44; the user",
      "    %% Pains: Too many ads",
      "  section Use#58; daily",
      "    Use #35;1: 5: Me#44; the user",
      "",
    ]);
  });

  it("scores every step neutral when none is scored", async () => {
    const out = await mmd(`kind: journey
stages: [One]
nodes:
  a: { stage: One, label: Step }
`);
    expect(out).toContain("  section One\n    Step: 3\n");
  });
});
