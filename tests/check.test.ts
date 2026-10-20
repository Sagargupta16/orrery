import { describe, expect, it } from "vitest";
import { type CheckOptions, checkScene } from "../src/check/index.ts";
import { layout } from "../src/layout/index.ts";
import type { Scene } from "../src/types.ts";
import { model, must, SAMPLE } from "./helpers.ts";

async function findings(source: string, opts?: CheckOptions) {
  const m = model(source);
  return checkScene(await layout(m), m, opts);
}

const codes = async (source: string, opts?: CheckOptions) =>
  (await findings(source, opts)).map((d) => d.code);

const chain = (n: number, direction = "right") =>
  `direction: ${direction}\nnodes:\n${Array.from({ length: n }, (_, i) => `  n${i}: N${i}\n`).join("")}` +
  `edges:\n${Array.from({ length: n - 1 }, (_, i) => `  - n${i} -> n${i + 1}\n`).join("")}`;

/** A laid-out a -> b with a spare node c, for moving boxes onto each other by hand. */
async function triple(): Promise<{ scene: Scene; source: string }> {
  const source = "nodes: { a: A, b: B, c: C }\nedges:\n  - a -> b: label\n  - b -> c\n";
  return { scene: structuredClone(await layout(model(source))), source };
}

describe("composition checks", () => {
  it("finds nothing to flag in the sample diagram", async () => {
    expect(await findings(SAMPLE)).toEqual([]);
  });

  it("DG201 flags an edge that runs through a node it does not connect", async () => {
    const { scene, source } = await triple();
    const edge = must(
      scene.edges.find((e) => e.from === "a"),
      "a -> b",
    );
    const [p, q] = [must(edge.points[0], "start"), must(edge.points[1], "next point")];
    const c = must(
      scene.nodes.find((n) => n.id === "c"),
      "c",
    );
    c.box = { x: (p.x + q.x) / 2 - 10, y: (p.y + q.y) / 2 - 10, w: 20, h: 20 };
    const found = checkScene(scene, model(source)).filter((d) => d.code === "DG201");
    expect(found).toHaveLength(1);
    expect(found[0]?.subject).toMatchObject({ from: "a", to: "b", node: "c" });
    expect(found[0]?.fixes?.length).toBeGreaterThan(0);
  });

  it("DG202 flags an edge label that covers a node", async () => {
    const { scene, source } = await triple();
    const edge = must(
      scene.edges.find((e) => e.label),
      "labelled edge",
    );
    const c = must(
      scene.nodes.find((n) => n.id === "c"),
      "c",
    );
    edge.labelBox = { ...c.box };
    expect(checkScene(scene, model(source)).map((d) => d.code)).toContain("DG202");
  });

  it("DG203 flags two nodes drawn on top of each other", async () => {
    const { scene, source } = await triple();
    const [a, c] = [must(scene.nodes[0], "a"), must(scene.nodes[2], "c")];
    c.box = { ...a.box };
    c.labelBox = { ...a.labelBox };
    c.iconBox = a.iconBox && { ...a.iconBox };
    const found = checkScene(scene, model(source)).filter((d) => d.code === "DG203");
    expect(found.map((d) => d.subject)).toContainEqual({ nodes: ["a", "c"] });
  });

  it("DG214 flags an overlay header that covers another group's header", async () => {
    const source = `groups:
  vpc: { type: aws:vpc }
  asg: { type: aws:auto-scaling, around: [web] }
nodes:
  web: { icon: aws:ec2, in: vpc }
  db: { icon: aws:rds }
edges:
  - web -> db
`;
    const m = model(source);
    const scene = structuredClone(await layout(m));
    // Layout keeps the header clear on its own.
    expect(checkScene(scene, m).map((d) => d.code)).not.toContain("DG214");
    const asg = must(
      scene.groups.find((g) => g.id === "asg"),
      "asg",
    );
    const vpc = must(
      scene.groups.find((g) => g.id === "vpc"),
      "vpc",
    );
    asg.labelBox = { ...vpc.labelBox };
    const found = checkScene(scene, m).filter((d) => d.code === "DG214");
    expect(found.map((d) => d.subject)).toContainEqual({
      group: "asg",
      covered: "vpc",
      kind: "group",
    });
    expect(found[0]?.fixes?.length).toBeGreaterThan(0);
  });

  it("DG204 flags a label that wraps to more than three lines", async () => {
    const long = "A label long enough to wrap onto more than three lines inside one shape node";
    expect(await codes(`nodes:\n  a: { label: "${long}" }\n  b: B\nedges:\n  - a -> b\n`)).toEqual([
      "DG204",
    ]);
  });

  it("DG205 flags a long thin strip and a diagram wider than maxWidth", async () => {
    expect(await codes(chain(8))).toEqual(["DG205"]);
    expect(await codes(chain(8, "down"))).toEqual([]);
    expect(await codes(chain(3), { maxWidth: 200 })).toEqual(["DG205"]);
  });

  it("DG206 flags more than 40 nodes", async () => {
    expect(await codes(chain(41, "down"))).toContain("DG206");
    expect(await codes(chain(40, "down"))).not.toContain("DG206");
  });

  it("DG207 flags an empty group", async () => {
    const found = await findings("groups:\n  vpc: { type: aws:vpc }\nnodes: { a: A }\n");
    expect(found.map((d) => [d.code, d.subject])).toEqual([["DG207", { group: "vpc" }]]);
  });

  it("DG208 flags a node nothing connects to, once the diagram has edges", async () => {
    const found = await findings("nodes: { a: A, b: B, c: C }\nedges:\n  - a -> b\n");
    expect(found.map((d) => [d.code, d.subject])).toEqual([["DG208", { node: "c" }]]);
    expect(await codes("nodes: { a: A, b: B }\n")).toEqual([]);
  });

  it("only ever warns", async () => {
    const all = await findings(chain(41));
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((d) => d.severity === "warning")).toBe(true);
  });
});
