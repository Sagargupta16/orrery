import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkScene } from "../src/check.ts";
import { layout } from "../src/layout.ts";
import { renderDrawio } from "../src/render/drawio.ts";
import { renderPng } from "../src/render/png.ts";
import { renderSvg } from "../src/render/svg.ts";
import { THEME_TOKENS } from "../src/themes.ts";
import { type Box, DIRECTIONS, type Point, type Scene } from "../src/types.ts";
import {
  attributeValues,
  contains,
  distanceToBorder,
  EXAMPLES_DIR,
  model,
  must,
  overlap,
  SAMPLE,
} from "./helpers.ts";

const sample = model(SAMPLE);

/** Everything a renderer positions, without colors. */
const geometry = (s: Scene) => ({
  size: [s.width, s.height],
  title: [s.titleBox, s.subtitleBox],
  groups: s.groups.map((g) => [g.id, g.box, g.labelBox, g.iconBox]),
  nodes: s.nodes.map((n) => [n.id, n.box, n.iconBox, n.labelBox, n.noteBox]),
  edges: s.edges.map((e) => [e.id, e.points, e.labelBox, e.stepBox]),
});

const center = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

function boxesById(s: Scene): Map<string, Box> {
  return new Map([
    ...s.nodes.map((n) => [n.id, n.box] as const),
    ...s.groups.map((g) => [g.id, g.box] as const),
  ]);
}

describe("layout", () => {
  it("is deterministic: the same spec gives byte-identical SVG, PNG and draw.io", async () => {
    const a = await layout(model(SAMPLE));
    // Lay out something else in between, so leftover ELK state would show.
    await layout(model("nodes: { x: X, y: Y }\nedges:\n  - x -> y\n"));
    const b = await layout(model(SAMPLE));
    expect(renderSvg(b)).toBe(renderSvg(a));
    expect(renderDrawio(b, "Orders")).toBe(renderDrawio(a, "Orders"));
    const [pa, pb] = await Promise.all([
      renderPng(renderSvg(a), { scale: 1 }),
      renderPng(renderSvg(b), { scale: 1 }),
    ]);
    expect(Buffer.from(pb).equals(Buffer.from(pa))).toBe(true);
  });

  it.each(DIRECTIONS)("draws every group around its children (%s)", async (direction) => {
    const s = await layout({ ...sample, direction });
    const groups = new Map(s.groups.map((g) => [g.id, g.box]));
    const escapes: string[] = [];
    for (const g of s.groups) {
      if (g.parent && !contains(must(groups.get(g.parent), g.parent), g.box))
        escapes.push(`group ${g.id} leaves ${g.parent}`);
    }
    for (const n of s.nodes) {
      if (!n.parent) continue;
      const outer = must(groups.get(n.parent), n.parent);
      const parts = { box: n.box, icon: n.iconBox, label: n.labelBox, note: n.noteBox };
      for (const [part, b] of Object.entries(parts))
        if (b && !contains(outer, b)) escapes.push(`${n.id} ${part} leaves ${n.parent}`);
    }
    expect(escapes).toEqual([]);
    expect(s.groups.filter((g) => g.parent)).toHaveLength(4);
  });

  it.each(DIRECTIONS)("keeps nodes and labels apart (%s)", async (direction) => {
    const s = await layout({ ...sample, direction });
    const clashes: string[] = [];
    s.nodes.forEach((a, i) => {
      for (const b of s.nodes.slice(i + 1))
        if (overlap(a.box, b.box)) clashes.push(`${a.id}/${b.id}`);
    });
    expect(clashes).toEqual([]);
    const collisions = checkScene(s, sample).filter((d) => /^DG20[123]$/.test(d.code));
    expect(collisions).toEqual([]);
  });

  it.each(DIRECTIONS)("routes every edge from border to border (%s)", async (direction) => {
    const s = await layout({ ...sample, direction });
    expect(s.edges.map((e) => e.id)).toEqual(sample.edges.map((e) => e.id));
    const boxes = boxesById(s);
    const loose: string[] = [];
    for (const e of s.edges) {
      const first = e.points[0];
      const last = e.points[e.points.length - 1];
      if (e.points.length < 2 || !first || !last) {
        loose.push(`${e.id} has ${e.points.length} points`);
        continue;
      }
      if (distanceToBorder(first, must(boxes.get(e.from), e.from)) > 1)
        loose.push(`${e.id} does not start on ${e.from}`);
      if (distanceToBorder(last, must(boxes.get(e.to), e.to)) > 1)
        loose.push(`${e.id} does not end on ${e.to}`);
    }
    expect(loose).toEqual([]);
  });

  it("routes orthogonal edges with horizontal and vertical segments only", async () => {
    const s = await layout(sample);
    const diagonal = s.edges.flatMap((e) =>
      e.points.slice(1).flatMap((q, i) => {
        const p = e.points[i];
        return p && Math.abs(p.x - q.x) > 0.01 && Math.abs(p.y - q.y) > 0.01
          ? [`${e.id}#${i}`]
          : [];
      }),
    );
    expect(diagonal).toEqual([]);
  });

  it.each([
    ["right", (a: Point, b: Point) => b.x > a.x],
    ["left", (a: Point, b: Point) => b.x < a.x],
    ["down", (a: Point, b: Point) => b.y > a.y],
    ["up", (a: Point, b: Point) => b.y < a.y],
  ] as const)("flows %s", async (direction, ahead) => {
    const s = await layout(
      model(
        `direction: ${direction}\nnodes: { a: A, b: B, c: C, d: D }\nedges:\n  - a -> b -> c -> d\n`,
      ),
    );
    const at = (id: string) =>
      center(
        must(
          s.nodes.find((n) => n.id === id),
          id,
        ).box,
      );
    const order = ["a", "b", "c", "d"].map(at);
    expect(order.slice(1).every((p, i) => ahead(must(order[i], "previous node"), p))).toBe(true);
    const horizontal = direction === "right" || direction === "left";
    expect(horizontal ? s.width > s.height : s.height > s.width).toBe(true);
  });

  it("moves the drawing down by the title block and keeps it clear of the title", async () => {
    const titled = await layout(sample);
    const bare = await layout({ ...sample, title: undefined, subtitle: undefined });
    expect(bare.titleBox).toBeUndefined();
    const title = must(titled.titleBox, "title box");
    const subtitle = must(titled.subtitleBox, "subtitle box");
    expect(subtitle.y).toBeGreaterThanOrEqual(title.y + title.h);

    const pairs: [Box, Box][] = [
      ...titled.nodes.map((n, i) => [n.box, must(bare.nodes[i], n.id).box] as [Box, Box]),
      ...titled.groups.map((g, i) => [g.box, must(bare.groups[i], g.id).box] as [Box, Box]),
    ];
    const shifts = pairs.map(([t, b]) => t.y - b.y);
    const offset = must(shifts[0], "a shift");
    expect(offset).toBeGreaterThan(0);
    for (const [i, [t, b]] of pairs.entries()) {
      expect(shifts[i]).toBeCloseTo(offset, 1);
      expect([t.x, t.w, t.h]).toEqual([b.x, b.w, b.h]);
    }
    // Both heights are rounded up to whole pixels.
    expect(Math.abs(titled.height - bare.height - offset)).toBeLessThanOrEqual(1);

    const top = Math.min(...pairs.map(([t]) => t.y));
    expect(top).toBeGreaterThan(subtitle.y + subtitle.h);
  });

  it("widens the canvas for a title longer than the drawing", async () => {
    const long = "A title that is much wider than the two small boxes drawn below it";
    const s = await layout(model(`title: ${long}\nnodes: { a: A }\n`));
    const title = must(s.titleBox, "title box");
    expect(s.width).toBeGreaterThanOrEqual(title.x + title.w);
  });

  it("changes colors but not geometry in the dark theme", async () => {
    const light = await layout(sample, { theme: "light" });
    const dark = await layout(sample, { theme: "dark" });
    expect(dark.theme).toBe("dark");
    expect(geometry(dark)).toEqual(geometry(light));
    const [svgLight, svgDark] = [renderSvg(light), renderSvg(dark)];
    expect(svgDark).not.toBe(svgLight);
    expect(attributeValues(svgDark, "id")).toEqual(attributeValues(svgLight, "id"));
    expect(svgLight).toContain(`fill="${THEME_TOKENS.light.background}"`);
    expect(svgDark).toContain(`fill="${THEME_TOKENS.dark.background}"`);
    expect(svgDark).not.toContain(`fill="${THEME_TOKENS.light.background}"/>`);
  });

  it("follows the spec theme when no theme is passed", async () => {
    expect((await layout({ ...sample, theme: "dark" })).theme).toBe("dark");
  });

  it("scales the gaps with layout.spacing", async () => {
    const compact = await layout({ ...sample, spacing: 0.75 });
    const loose = await layout({ ...sample, spacing: 1.35 });
    expect(loose.width).toBeGreaterThan(compact.width);
    expect(loose.height).toBeGreaterThanOrEqual(compact.height);
  });

  it("lays out self loops, repeated edges, group endpoints and empty groups", async () => {
    const s = await layout(
      model(`groups:
  g: { type: box }
  empty: { type: aws:vpc }
nodes: { a: { in: g }, b: B }
edges:
  - a -> a
  - a -> b
  - a -> b: again
  - g -> b
  - b -> g
`),
    );
    expect(s.edges).toHaveLength(5);
    expect(s.edges.every((e) => e.points.length >= 2)).toBe(true);
    const empty = must(
      s.groups.find((g) => g.id === "empty"),
      "empty group",
    ).box;
    expect(empty.w).toBeGreaterThan(0);
    expect(empty.h).toBeGreaterThan(0);
  });

  it("draws an around group over its members without moving them when its header has room", async () => {
    // In aws-three-tier the Auto Scaling group spans the web subnets, below the public subnets.
    const withAround = readFileSync(join(EXAMPLES_DIR, "aws-three-tier.yaml"), "utf8");
    const base = withAround.replace(/^ {2}asg: .*\n/m, "");
    expect(base).not.toBe(withAround);
    const [plain, outlined] = [await layout(model(base)), await layout(model(withAround))];
    expect(outlined.nodes.map((n) => n.box)).toEqual(plain.nodes.map((n) => n.box));
    const ov = must(
      outlined.groups.find((g) => g.id === "asg"),
      "asg",
    );
    const members = model(withAround).groups.find((g) => g.id === "asg")?.around ?? [];
    for (const g of outlined.groups.filter((x) => members.includes(x.id)))
      expect(contains(ov.box, g.box)).toBe(true);
    expect(contains({ x: 0, y: 0, w: outlined.width, h: outlined.height }, ov.box)).toBe(true);
  });

  it("moves an around group's members down so its header clears the headers above them", async () => {
    // Left to right the zones stack, and both members are the first row of their Availability
    // Zone, so the overlay's header would land on the first zone's header without the extra room.
    const s = await layout(
      model(`groups:
  vpc: { type: aws:vpc }
  az-a: { type: aws:az, label: AZ a, in: vpc }
  az-b: { type: aws:az, label: AZ b, in: vpc }
  asg: { type: aws:auto-scaling, around: [web-a, web-b] }
nodes:
  web-a: { icon: aws:ec2, in: az-a }
  web-b: { icon: aws:ec2, in: az-b }
`),
    );
    const head = (id: string) => {
      const g = must(
        s.groups.find((x) => x.id === id),
        id,
      );
      return [g.labelBox, g.iconBox].filter((b): b is Box => !!b);
    };
    for (const own of head("asg"))
      for (const id of ["vpc", "az-a", "az-b"])
        for (const other of head(id)) expect(overlap(own, other)).toBe(false);
    const asg = must(
      s.groups.find((g) => g.id === "asg"),
      "asg",
    ).box;
    for (const n of s.nodes) expect(contains(asg, n.box)).toBe(true);
  });

  it("connects edges to and from an around group at its border, clear of its header", async () => {
    const s = await layout(
      model(`direction: down
groups:
  az-a: { type: aws:az }
  az-b: { type: aws:az }
  asg: { type: aws:auto-scaling, around: [web-a, web-b] }
nodes:
  lb: { icon: aws:alb }
  web-a: { icon: aws:ec2, in: az-a }
  web-b: { icon: aws:ec2, in: az-b }
  db: { icon: aws:rds }
edges:
  - lb -> asg
  - asg -> db
`),
    );
    const asg = must(
      s.groups.find((g) => g.id === "asg"),
      "asg",
    );
    const b = asg.box;
    const near = (v: number, w: number) => Math.abs(v - w) < 1;
    const onBorder = (p: Point) =>
      ((near(p.x, b.x) || near(p.x, b.x + b.w)) && p.y >= b.y - 1 && p.y <= b.y + b.h + 1) ||
      ((near(p.y, b.y) || near(p.y, b.y + b.h)) && p.x >= b.x - 1 && p.x <= b.x + b.w + 1);
    const header = [asg.iconBox, asg.labelBox].filter((x): x is Box => !!x);
    const underHeader = (p: Point) =>
      header.some((h) => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h);
    const into = must(
      s.edges.find((e) => e.from === "lb" && e.to === "asg"),
      "lb -> asg",
    );
    const out = must(
      s.edges.find((e) => e.from === "asg" && e.to === "db"),
      "asg -> db",
    );
    for (const p of [must(into.points.at(-1), "end"), must(out.points[0], "start")]) {
      expect(onBorder(p)).toBe(true);
      expect(underHeader(p)).toBe(false);
    }
    // ELK never sees the overlay, but hidden edges to its members keep the layer order.
    const node = (id: string) => must(s.nodes.find((n) => n.id === id)?.box, id);
    expect(node("lb").y + node("lb").h).toBeLessThan(node("web-a").y);
    expect(node("db").y).toBeGreaterThan(node("web-a").y + node("web-a").h);
  });

  it("describes the diagram in plain words for <desc> and alt text", async () => {
    const s = await layout(sample);
    expect(s.description).toMatch(/^Orders platform\. 7 components in 5 groups\. Connections: /);
    expect(s.description).toContain("Users to Load balancer (HTTPS)");
  });
});
