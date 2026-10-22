// kind: sequence: the lifeline layout, both skins, Mermaid's sequenceDiagram, draw.io lifelines
// and the measured conventions.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkScene } from "../src/check/index.ts";
import { layout } from "../src/layout/index.ts";
import { renderModel } from "../src/render/index.ts";
import { sequenceMermaid } from "../src/render/mermaid-sequence.ts";
import { reviewScene } from "../src/review/index.ts";
import type { Box, Scene, ThemeName } from "../src/types.ts";
import {
  attributeValues,
  contains,
  EXAMPLES_DIR,
  model,
  must,
  overlap,
  xmlProblems,
} from "./helpers.ts";

const CHECKOUT = `title: Checkout
kind: sequence
skin: classic
groups:
  backend: { type: box, label: Backend }
nodes:
  web: { icon: generic:browser, label: Web app }
  api: { label: Orders API, in: backend }
  db: { label: Orders DB, in: backend }
  pay: { label: Payments }
edges:
  - web -> api: POST /orders
  - api -> api: validate cart
  - api -> db: INSERT order
  - db --> api: order id
  - api -> pay: charge card
  - pay --> api: approved
  - pay --> api: declined
  - api --> web: 201 Created
fragments:
  - { type: alt, label: card ok, from: 5, to: 7, else: [{ at: 7, label: card declined }] }
  - { type: opt, label: first order, from: 3, to: 4 }
`;

async function laid(source: string, theme: ThemeName = "light"): Promise<Scene> {
  return layout(model(source), { theme });
}

const seq = (scene: Scene) => must(scene.sequence, "scene.sequence");
const edge = (scene: Scene, id: string) =>
  must(
    scene.edges.find((e) => e.id === id),
    `edge ${id}`,
  );

async function render(
  source: string,
  format: "svg" | "drawio" | "mmd",
  skin?: "stage" | "classic",
) {
  const r = await renderModel({
    model: model(source),
    formats: [format],
    themes: ["dark"],
    name: "seq",
    ...(skin ? { skin } : {}),
  });
  const data = must(r.artifacts[0], format).data;
  if (typeof data !== "string") throw new Error(`${format} is binary`);
  return data;
}

describe("sequence layout", () => {
  it("puts participants left to right in spec order, a group's members side by side", async () => {
    const scene = await laid(`kind: sequence
groups:
  g: { type: box, label: Inside }
nodes:
  a: { label: A, in: g }
  b: { label: B }
  c: { label: C, in: g }
edges:
  - a -> b: one
  - b -> c: two
`);
    const xs = seq(scene).lifelines.map((l) => [l.id, l.x] as const);
    expect(xs.map(([id]) => id)).toEqual(["a", "c", "b"]);
    expect(xs.map(([, x]) => x)).toEqual([...xs.map(([, x]) => x)].sort((p, q) => p - q));
    // The heads are scene nodes in one row, each over its lifeline.
    for (const l of seq(scene).lifelines) {
      const head = must(
        scene.nodes.find((n) => n.id === l.id),
        l.id,
      );
      expect(head.box.x + head.box.w / 2).toBeCloseTo(l.x, 1);
      expect(head.box.y + head.box.h).toBeLessThanOrEqual(l.top);
    }
    const g = must(scene.groups[0], "group");
    for (const id of ["a", "c"]) {
      const head = must(
        scene.nodes.find((n) => n.id === id),
        id,
      );
      expect(contains(g.box, head.box)).toBe(true);
    }
  });

  it("runs messages top to bottom in spec order, labels above their line, none overlapping", async () => {
    const scene = await laid(CHECKOUT);
    const rows = seq(scene).messages;
    expect(rows.map((m) => m.id)).toEqual(scene.edges.map((e) => e.id));
    for (let i = 1; i < rows.length; i++)
      expect(must(rows[i], "row").y).toBeGreaterThan(must(rows[i - 1], "row").y);
    const labels = scene.edges.map((e) => must(e.labelBox, `label of ${e.id}`));
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++)
        expect(overlap(must(labels[i], "a"), must(labels[j], "b")), `${i} ${j}`).toBe(false);
    for (const e of scene.edges) {
      if (e.from === e.to) continue;
      const box = must(e.labelBox, e.id);
      const y = must(e.points[0], "point").y;
      expect(box.y + box.h).toBeLessThanOrEqual(y);
      // Each label sits between the two lifelines it joins.
      const [p, q] = e.points.map((pt) => pt.x);
      expect(box.x).toBeGreaterThanOrEqual(Math.min(p ?? 0, q ?? 0));
      expect(box.x + box.w).toBeLessThanOrEqual(Math.max(p ?? 0, q ?? 0));
    }
  });

  it("loops a self message out to the right and back to its own lifeline", async () => {
    const scene = await laid(CHECKOUT);
    const self = edge(scene, "e2");
    expect(self.points).toHaveLength(4);
    const [p0, p1, p2, p3] = self.points.map((p) => must(p, "point"));
    expect(p1?.x).toBeGreaterThan(must(p0, "p0").x + 20);
    expect(p1?.y).toBe(p0?.y);
    expect(p2?.y).toBeGreaterThan(must(p1, "p1").y);
    expect(p3?.x).toBe(p0?.x);
    const label = must(self.labelBox, "self label");
    expect(label.x).toBeGreaterThan(must(p1, "p1").x);
  });

  it("encloses each fragment's rows, labels and nested fragments", async () => {
    const scene = await laid(CHECKOUT);
    const s = seq(scene);
    expect(s.fragments.map((f) => [f.type, f.from, f.to])).toEqual([
      ["opt", 3, 4],
      ["alt", 5, 7],
    ]);
    for (const f of s.fragments) {
      const inside = s.messages.filter((m) => m.index >= f.from && m.index <= f.to);
      expect(inside.length).toBeGreaterThan(0);
      for (const m of inside) {
        expect(m.y).toBeGreaterThan(f.box.y + f.tag.box.h);
        expect(m.y).toBeLessThan(f.box.y + f.box.h);
        for (const x of [m.x0, m.x1]) {
          expect(x).toBeGreaterThan(f.box.x);
          expect(x).toBeLessThan(f.box.x + f.box.w);
        }
        const label = must(edge(scene, m.id).labelBox, m.id);
        expect(contains(f.box, label), m.id).toBe(true);
      }
      const outside = s.messages.filter((m) => m.index < f.from || m.index > f.to);
      for (const m of outside) expect(m.y < f.box.y || m.y > f.box.y + f.box.h, m.id).toBe(true);
      expect(contains(f.box, f.tag.box)).toBe(true);
    }
    // The alt's second branch: a dashed divider between its two answers, its guard under it.
    const alt = must(
      s.fragments.find((f) => f.type === "alt"),
      "alt",
    );
    const divider = must(alt.dividers[0], "divider");
    const y = (id: string) => must(edge(scene, id).points[0], id).y;
    expect(divider.y).toBeGreaterThan(y("e6"));
    expect(divider.y).toBeLessThan(y("e7"));
    expect(divider.label?.lines).toEqual(["[card declined]"]);
    expect(alt.label?.lines).toEqual(["[card ok]"]);
  });

  it("nests fragments inside each other with room around the inner one", async () => {
    const scene = await laid(`kind: sequence
nodes: { a: { label: A }, b: { label: B } }
edges:
  - a -> b: ask
  - b --> a: answer
  - a -> b: again
fragments:
  - { type: loop, label: every page, from: 1, to: 3 }
  - { type: break, label: no more, from: 2, to: 2 }
`);
    const [outer, inner] = seq(scene).fragments;
    expect(outer?.depth).toBe(0);
    expect(inner?.depth).toBe(1);
    const grown = (b: Box, by: number) => ({
      x: b.x - by,
      y: b.y - by,
      w: b.w + 2 * by,
      h: b.h + 2 * by,
    });
    expect(contains(must(outer, "outer").box, grown(must(inner, "inner").box, 4))).toBe(true);
  });

  it("draws an activation bar from a call to its reply, nested for a call back in", async () => {
    const scene = await laid(CHECKOUT);
    const bars = seq(scene).activations;
    const api = must(
      bars.find((b) => b.id === "api"),
      "api bar",
    );
    expect([api.call, api.reply]).toEqual(["e1", "e8"]);
    expect(api.box.y).toBe(must(edge(scene, "e1").points[0], "e1").y);
    expect(api.box.y + api.box.h).toBe(must(edge(scene, "e8").points[0], "e8").y);
    // A second answer in the other branch stretches the bar to it.
    const pay = must(
      bars.find((b) => b.id === "pay"),
      "pay bar",
    );
    expect([pay.call, pay.reply]).toEqual(["e5", "e7"]);
    // Messages leave and land on the bar's side, not the lifeline.
    const line = must(
      seq(scene).lifelines.find((l) => l.id === "api"),
      "api line",
    );
    const insert = edge(scene, "e3");
    expect(must(insert.points[0], "start").x).toBeGreaterThan(line.x);

    const nested = await laid(`kind: sequence
nodes: { a: { label: A }, b: { label: B } }
edges:
  - a -> b: start job
  - b -> a: need input
  - a -> b: input
  - b --> a: thanks
  - b --> a: done
`);
    const levels = seq(nested)
      .activations.filter((b) => b.id === "b")
      .map((b) => b.level);
    expect(levels.sort()).toEqual([0, 1]);
    expect(seq(nested).messages.map((m) => m.kind)).toEqual([
      "call",
      "call",
      "call",
      "reply",
      "reply",
    ]);
  });

  it("repeats the names at the foot of a tall diagram only", async () => {
    const short = await laid(`kind: sequence
nodes: { a: { label: A }, b: { label: B } }
edges:
  - a -> b: ask
  - b --> a: answer
`);
    expect(seq(short).lifelines.every((l) => !l.foot)).toBe(true);
    const many = Array.from(
      { length: 14 },
      (_, i) => `  - ${i % 2 ? "b --> a" : "a -> b"}: step ${i + 1}`,
    );
    const tall = await laid(
      `kind: sequence\nnodes: { a: { label: A }, b: { label: B } }\nedges:\n${many.join("\n")}\n`,
    );
    for (const l of seq(tall).lifelines) {
      const foot = must(l.foot, `foot of ${l.id}`);
      expect(foot.box.y).toBeGreaterThanOrEqual(l.bottom - 0.5);
      expect(foot.label.lines.join(" ")).toBe(l.id.toUpperCase());
      expect(tall.height).toBeGreaterThan(foot.box.y + foot.box.h);
    }
  });

  it("lays every example out at a README width with no check warnings", async () => {
    for (const file of ["sequence-oauth-pkce.yaml", "sequence-api-cache.yaml"]) {
      const path = join(EXAMPLES_DIR, file);
      const m = model(readFileSync(path, "utf8"), path);
      const scene = await layout(m);
      expect(scene.width, file).toBeLessThanOrEqual(960);
      expect(checkScene(scene, m), file).toEqual([]);
    }
  });
});

describe("sequence drawing", () => {
  it("draws lifelines, bars, fragments and tags in classic, under the messages", async () => {
    const svg = await render(CHECKOUT, "svg");
    expect(xmlProblems(svg)).toEqual([]);
    // Dashed lifelines, the alt and opt tags, guards in brackets.
    expect(svg.match(/stroke-dasharray="5 4"/g)?.length).toBe(4);
    expect(svg).toContain(">alt</tspan>");
    expect(svg).toContain(">opt</tspan>");
    expect(svg).toContain("[card ok]");
    expect(svg).toContain("[card declined]");
    // The layer sits after the group frames and before the first message.
    const layer = svg.indexOf('stroke-dasharray="5 4"');
    expect(layer).toBeGreaterThan(svg.indexOf('id="seq-dark-g-backend"'));
    expect(layer).toBeLessThan(svg.indexOf('id="seq-dark-e-e1"'));
    // A packet plays the messages one after another: each starts later than the one before.
    const starts = [...svg.matchAll(/<g id="seq-dark-e-(e\d+)">.*?keyTimes="0;([\d.]+);/gs)].map(
      (m) => Number(m[2]),
    );
    expect(starts.length).toBe(8);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i]).toBeGreaterThan(must(starts[i - 1], "start"));
  });

  it("draws the same parts from the stage kit, with ids behind the prefix", async () => {
    const svg = await render(CHECKOUT, "svg", "stage");
    expect(xmlProblems(svg)).toEqual([]);
    expect(svg).toMatch(/font-family="&#39;Geist Mono&#39;/);
    for (const id of attributeValues(svg, "id")) expect(id.startsWith("seq-dark-")).toBe(true);
    expect(svg).toContain("[card ok]");
    // The relay story rides every message in order.
    expect(svg).toContain('id="seq-dark-story"');
  });

  it("keeps the PNG's still frame free of motion", async () => {
    const r = await renderModel({
      model: model(CHECKOUT),
      formats: ["svg"],
      themes: ["light"],
      name: "still",
      animate: "none",
    });
    const svg = must(r.artifacts[0], "svg").data as string;
    expect(svg).not.toContain("<animate");
  });

  it("writes Mermaid's sequenceDiagram", () => {
    const text = sequenceMermaid(model(CHECKOUT));
    expect(text).toBe(`---
title: "Checkout"
---
sequenceDiagram
    participant web as Web app
    box transparent Backend
        participant api as Orders API
        participant db as Orders DB
    end
    participant pay as Payments
    web->>api: POST /orders
    api->>api: validate cart
    opt first order
        api->>db: INSERT order
        db-->>api: order id
    end
    alt card ok
        api->>pay: charge card
        pay-->>api: approved
    else card declined
        pay-->>api: declined
    end
    api-->>web: 201 Created
`);
  });

  it("writes par branches, dotted signals, actors and escaped text for Mermaid", () => {
    const text = sequenceMermaid(
      model(`kind: sequence
nodes:
  user: { icon: generic:user, label: User }
  end: { label: "End; #1" }
edges:
  - user -> end: one
  - user ..> end: two
  - end --> user: three
fragments:
  - { type: par, label: fan out, from: 1, to: 2, else: [{ at: 2, label: second }] }
`),
    );
    expect(text).toContain("    actor user as User");
    expect(text).toContain("    participant p_end as End#59; #35;1");
    expect(text).toContain(
      "    par fan out\n        user->>p_end: one\n    and second\n        user--)p_end: two\n    end",
    );
    expect(text).toContain("    p_end-->>user: three");
  });

  it("opens in draw.io as lifelines, frames, bars and messages between lifelines", async () => {
    const xml = await render(CHECKOUT, "drawio");
    expect(xmlProblems(xml)).toEqual([]);
    expect(xml.match(/shape=umlLifeline/g)?.length).toBe(4);
    expect(xml.match(/shape=umlFrame/g)?.length).toBe(2);
    // api from the order to its answer, db for the insert, pay for the charge.
    expect(xml.match(/id="seq:bar:\d+"/g)?.length).toBe(3);
    // Every message once, from lifeline to lifeline, anchored at its row.
    for (let i = 1; i <= 8; i++) {
      const cell = must(xml.match(new RegExp(`<mxCell id="seq:msg:e${i}"[^>]*>`)), `e${i}`)[0];
      expect(cell).toMatch(/source="seq:life:[a-z]+" target="seq:life:[a-z]+"/);
      expect(xml).not.toContain(`<mxCell id="e${i}"`);
    }
    expect(xml).toContain('<mxCell id="seq:msg:e4" value="order id" style="edgeStyle=none;');
    expect(xml).toMatch(/<mxCell id="seq:msg:e4"[^>]*dashed=1/);
  });
});

describe("sequence conventions", () => {
  async function review(source: string, edit?: (scene: Scene) => void) {
    const m = model(source);
    const scene = structuredClone(await layout(m));
    edit?.(scene);
    return reviewScene(scene, m, checkScene(scene, m), { width: 880 });
  }
  const ids = (r: Awaited<ReturnType<typeof review>>) =>
    r.findings.filter((f) => f.id.startsWith("conventions.sequence")).map((f) => f.id);

  it("passes a clean sequence", async () => {
    const r = await review(CHECKOUT);
    expect(ids(r)).toEqual([]);
    expect(r.rubrics).toContain("conventions-sequence.md");
    expect(r.dimensions.conventions.metrics.messages).toBe(8);
  });

  it("finds unlabelled messages, idle participants and solid replies", async () => {
    const r = await review(`kind: sequence
nodes: { a: { label: A }, b: { label: B }, c: { label: C }, idle: { label: Idle } }
edges:
  - a -> b
  - b -> a: answer
  - a -> c
  - c --> a
`);
    const unlabelled = must(
      r.findings.find((f) => f.id === "conventions.sequence-unlabelled"),
      "unlabelled",
    );
    // The unlabelled reply answers its call; the two calls say nothing.
    expect(unlabelled.subjects).toEqual(["e1", "e3"]);
    expect(unlabelled.rule).toBe("SEQ-04");
    const unused = must(
      r.findings.find((f) => f.id === "conventions.sequence-unused"),
      "unused",
    );
    expect(unused.subjects).toEqual(["idle"]);
    const reply = must(
      r.findings.find((f) => f.id === "conventions.sequence-reply"),
      "reply",
    );
    expect(reply.subjects).toEqual(["e2"]);
    expect(reply.severity).toBe("minor");
  });

  it("finds a fragment the layout could not draw, and a long figure", async () => {
    const lost = await review(CHECKOUT, (scene) => {
      const s = must(scene.sequence, "sequence");
      s.fragments = s.fragments.filter((f) => f.type !== "opt");
    });
    const f = must(
      lost.findings.find((x) => x.id === "conventions.sequence-fragment"),
      "fragment",
    );
    expect(f.evidence.ranges).toBe("opt 3-4");

    const lines = Array.from(
      { length: 18 },
      (_, i) => `  - ${i % 2 ? "b --> a" : "a -> b"}: step ${i + 1}`,
    );
    const long = await review(
      `kind: sequence\nnodes: { a: { label: A }, b: { label: B } }\nedges:\n${lines.join("\n")}\n`,
    );
    const length = must(
      long.findings.find((x) => x.id === "conventions.sequence-length"),
      "length",
    );
    expect(length.severity).toBe("minor");
    expect(length.evidence.messages).toBe(18);
  });
});
