import { describe, expect, it } from "vitest";
import { layout } from "../src/layout.ts";
import { segmentHits } from "../src/placement.ts";
import type { Box, Scene } from "../src/types.ts";
import { model, must } from "./helpers.ts";

const box = (s: Scene, id: string): Box => must(s.nodes.find((n) => n.id === id)?.box, id);
const cx = (b: Box) => b.x + b.w / 2;
const cy = (b: Box) => b.y + b.h / 2;

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
});
