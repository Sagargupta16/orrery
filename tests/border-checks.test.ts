import { describe, expect, it } from "vitest";
import { checkScene } from "../src/check/index.ts";
import { layout } from "../src/layout/index.ts";
import { n, renderSvg } from "../src/render/svg.ts";
import { tokensFor } from "../src/themes.ts";
import type { Box, Model, Scene, ThemeName } from "../src/types.ts";
import { model, must, SAMPLE } from "./helpers.ts";

/** An internet gateway on its VPC and a NAT gateway on a public subnet it is the only member of. */
const BORDERS = `skin: classic
direction: down
legend: { dashed: Outbound via NAT }
groups:
  vpc: { type: aws:vpc }
  private: { type: aws:private-subnet, label: Private subnet, in: vpc }
  public: { type: aws:public-subnet, label: Public subnet, in: vpc }
nodes:
  users: { icon: aws:users, label: Users }
  igw: { icon: aws:igw, label: Internet gateway, on: vpc }
  web: { icon: aws:ec2-instance, label: Web server, in: private }
  nat: { icon: aws:nat, label: NAT gateway, in: vpc, on: public }
edges:
  - users -> igw -> web
  - web --> nat
`;

/** The same model with nat's on: dropped, so it is only a node in the VPC. */
const offBorder = (m: Model): Model => ({
  ...m,
  nodes: m.nodes.map((x) => (x.id === "nat" ? { ...x, on: undefined } : x)),
});

const iconOf = (scene: Scene, id: string) =>
  must(scene.nodes.find((x) => x.id === id)?.iconBox, `${id} icon`);
const groupBox = (scene: Scene, id: string) =>
  must(
    scene.groups.find((g) => g.id === id),
    id,
  ).box;

/** Whether a box's center lies on one of a frame's four border lines. */
const centerOn = (b: Box, g: Box) => {
  const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
  const near = (v: number, line: number) => Math.abs(v - line) <= 1;
  return near(cx, g.x) || near(cx, g.x + g.w) || near(cy, g.y) || near(cy, g.y + g.h);
};

async function seated(theme?: ThemeName): Promise<{ m: Model; scene: Scene }> {
  const m = model(BORDERS);
  const scene = await layout(m, theme ? { theme } : {});
  return { m, scene };
}

describe("border nodes in the checks", () => {
  it("seats both nodes and lays out with no DG207 or DG223", async () => {
    const { m, scene } = await seated();
    expect(centerOn(iconOf(scene, "igw"), groupBox(scene, "vpc"))).toBe(true);
    expect(centerOn(iconOf(scene, "nat"), groupBox(scene, "public"))).toBe(true);
    const codes = checkScene(scene, m).map((d) => d.code);
    expect(codes).not.toContain("DG207");
    expect(codes).not.toContain("DG223");
  });

  it("DG207 counts a node with on: as a member of its group", async () => {
    const { m, scene } = await seated();
    const empty = (mm: Model) =>
      checkScene(scene, mm)
        .filter((d) => d.code === "DG207")
        .map((d) => d.subject?.group);
    expect(empty(m)).toEqual([]);
    expect(empty(offBorder(m))).toEqual(["public"]);
  });

  it("DG223 lets an edge of a node with on: cross that node's group", async () => {
    const { m, scene: laid } = await seated();
    const scene = structuredClone(laid);
    const pub = groupBox(scene, "public");
    const edge = must(
      scene.edges.find((e) => e.from === "web" && e.to === "nat"),
      "web -> nat",
    );
    // Straight down through the middle of the public subnet, top to bottom.
    const x = pub.x + pub.w / 2;
    edge.points = [
      { x, y: pub.y - 20 },
      { x, y: pub.y + pub.h + 20 },
    ];
    const cuts = (mm: Model) =>
      checkScene(scene, mm)
        .filter((d) => d.code === "DG223" && d.subject?.edge === edge.id)
        .map((d) => d.subject?.group);
    expect(cuts(m)).toEqual([]);
    expect(cuts(offBorder(m))).toEqual(["public"]);
  });
});

describe("border nodes in the classic renderer", () => {
  /** Where the SVG paints exactly this box in one color, or -1. */
  const plateAt = (svg: string, b: Box, fill: string) =>
    svg.indexOf(
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="${fill}"/>`,
    );

  for (const theme of ["light", "dark"] as const) {
    it(`puts a ${theme} canvas plate under each icon on a border, between frames and edges`, async () => {
      const { scene } = await seated(theme);
      const svg = renderSvg(scene);
      const bg = tokensFor(scene).background;
      const lastFrame = svg.lastIndexOf('<g id="g-');
      const firstEdge = svg.indexOf('<g id="e-');
      for (const id of ["igw", "nat"]) {
        const at = plateAt(svg, iconOf(scene, id), bg);
        expect(at, id).toBeGreaterThan(lastFrame);
        expect(at, id).toBeLessThan(firstEdge);
      }
      expect(plateAt(svg, iconOf(scene, "web"), bg)).toBe(-1);
    });
  }

  it("adds no plate to a diagram without border nodes", async () => {
    const scene = await layout(model(SAMPLE));
    const svg = renderSvg(scene);
    const bg = tokensFor(scene).background;
    for (const nd of scene.nodes)
      if (nd.iconBox) expect(plateAt(svg, nd.iconBox, bg), nd.id).toBe(-1);
  });

  it("leaves the stage skin alone", async () => {
    const scene = await layout(model(BORDERS.replace("skin: classic", "skin: stage")));
    const svg = renderSvg(scene);
    expect(plateAt(svg, iconOf(scene, "igw"), tokensFor(scene).background)).toBe(-1);
  });
});
