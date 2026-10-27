// One spec, many figures: views (include, exclude, depth), classes, include files and tag styles.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { layout } from "../src/layout/index.ts";
import { renderDrawio } from "../src/render/drawio.ts";
import { renderSvg } from "../src/render/svg.ts";
import { parseSpec } from "../src/spec/index.ts";
import type { Model, Scene } from "../src/types.ts";
import { viewModel, viewsOf } from "../src/views.ts";
import { listDiagnostics, model, must, ROOT } from "./helpers.ts";

const SHOP = `title: Shop
subtitle: Every figure from one spec
legend: { dotted: Private endpoint }
tags:
  pci: { color: "#c7243a", label: Card data }
  async: { line: dashed, color: "#7c3aed", label: Asynchronous }
groups:
  cloud: { type: aws:cloud }
  region: { type: aws:region, in: cloud }
  vpc: { type: aws:vpc, in: region }
  private: { type: aws:private-subnet, in: vpc }
  zone: { type: aws:az, around: [api, worker] }
nodes:
  users: { icon: aws:users }
  api: { icon: aws:ecs, label: API, in: private, tags: [pci] }
  worker: { icon: aws:lambda, label: Worker, in: private }
  db: { shape: cylinder, label: DB, in: private, tags: [pci] }
  queue: { icon: aws:sqs, label: Jobs, in: region }
  bucket: { icon: aws:s3, label: Receipts, in: region }
edges:
  - users -> api: HTTPS
  - api -> db: { label: SQL }
  - api -> queue: { label: enqueue, tags: [async] }
  - queue -> worker: { tags: [async] }
  - worker -> bucket: put
  - vpc ..> bucket: put
views:
  request: { include: [users, api, db], title: Request path, subtitle: The synchronous hop }
  payments: { include: [tag:pci] }
  jobs: { include: [tag:async] }
  subnet: { include: [group:private] }
  bare: { include: [private] }
  quiet: { exclude: [tag:async, group:private] }
  regional: { depth: 2 }
  overview: { depth: 1 }
`;

const shop = () => model(SHOP);
const view = (name: string): Model => {
  const m = shop();
  return viewModel(
    m,
    must(
      m.views?.find((v) => v.name === name),
      `view ${name}`,
    ),
  );
};
const ids = (m: Model) => ({
  nodes: m.nodes.map((n) => n.id).sort(),
  groups: m.groups.map((g) => g.id).sort(),
});
const ends = (m: Model) => m.edges.map((e) => `${e.from}->${e.to}`);

describe("viewsOf", () => {
  it("draws the whole diagram alone when no view is asked for", () => {
    const m = shop();
    expect(viewsOf(m)).toEqual([{ model: m }]);
    expect(viewsOf(m, false)).toEqual([{ model: m }]);
  });

  it("draws one view by name, and the whole diagram plus every view for all", () => {
    const m = shop();
    expect(viewsOf(m, "request").map((v) => v.name)).toEqual(["request"]);
    const all = viewsOf(m, "all");
    expect(all[0]).toEqual({ model: m });
    expect(all.slice(1).map((v) => v.name)).toEqual(m.views?.map((v) => v.name));
  });
});

describe("view rules", () => {
  it("keeps the named nodes, every group around them and the edges between them", () => {
    const m = view("request");
    expect(ids(m)).toEqual({
      nodes: ["api", "db", "users"],
      groups: ["cloud", "private", "region", "vpc", "zone"],
    });
    expect(ends(m)).toEqual(["users->api", "api->db"]);
    // The overlay is drawn around the members the view keeps.
    expect(m.groups.find((g) => g.id === "zone")?.around).toEqual(["api"]);
  });

  it("takes the view's title and subtitle, else the spec title plus the view name", () => {
    expect(view("request")).toMatchObject({
      title: "Request path",
      subtitle: "The synchronous hop",
    });
    expect(view("payments")).toMatchObject({
      title: "Shop: payments",
      subtitle: "Every figure from one spec",
    });
    expect(view("payments").views).toBeUndefined();
  });

  it("reads group:<id> and a bare group id as the group and everything in it", () => {
    for (const name of ["subnet", "bare"]) {
      expect(ids(view(name)).nodes).toEqual(["api", "db", "worker"]);
      expect(ids(view(name)).groups).toEqual(["cloud", "private", "region", "vpc", "zone"]);
    }
  });

  it("reads tag:<name> as the tagged nodes and groups, and both ends of a tagged edge", () => {
    expect(ids(view("payments")).nodes).toEqual(["api", "db"]);
    const jobs = view("jobs");
    expect(ids(jobs).nodes).toEqual(["api", "queue", "worker"]);
    expect(ends(jobs)).toEqual(["api->queue", "queue->worker"]);
  });

  it("drops excluded tags and groups with their contents, and any group left empty", () => {
    const m = view("quiet");
    expect(ids(m)).toEqual({ nodes: ["bucket", "queue", "users"], groups: ["cloud", "region"] });
    // vpc held only the excluded subnet, so it goes too; its edge to bucket with it.
    expect(ends(m)).toEqual([]);
  });

  it("explains only what the view draws in its legend", () => {
    expect(view("request").legend).toEqual([
      { line: "solid", label: "Card data", color: "#c7243a", chip: true, tag: "pci" },
    ]);
    expect(view("jobs").legend?.map((l) => l.label)).toEqual(["Card data", "Asynchronous"]);
    expect(view("quiet").legend).toBeUndefined();
  });
});

describe("view depth", () => {
  it("folds groups below the depth into one node that stands for each", () => {
    const m = view("overview");
    expect(ids(m)).toEqual({ nodes: ["region", "users"], groups: ["cloud"] });
    const region = must(
      m.nodes.find((n) => n.id === "region"),
      "region node",
    );
    expect(region).toMatchObject({ label: "Region", icon: "aws:group-region", parent: "cloud" });
    expect(region.look).toBe("icon");
    expect(ends(m)).toEqual(["users->region"]);
  });

  it("re-points edges at the folded group and keeps one per pair of ends", () => {
    const m = view("regional");
    expect(ids(m)).toEqual({
      nodes: ["bucket", "queue", "users", "vpc"],
      groups: ["cloud", "region"],
    });
    expect(ends(m)).toEqual(["users->vpc", "vpc->queue", "queue->vpc", "vpc->bucket"]);
    // worker -> bucket and vpc ..> bucket merge; both said "put", so the label stays.
    expect(m.edges.find((e) => e.to === "bucket")).toMatchObject({ label: "put", line: "solid" });
    // The zone outlined nodes that are now inside the folded vpc, so it is not drawn.
    expect(m.groups.some((g) => g.id === "zone")).toBe(false);
  });

  it("drops a merged label the merged edges disagree on", () => {
    const m = model(`nodes: { a: A, b: { in: g }, c: { in: g } }
groups: { g: { label: G } }
edges: [ "a -> b: one", "a -> c: two" ]
views: { flat: { depth: 0 } }
`);
    const flat = viewModel(m, must(m.views?.[0], "view"));
    expect(flat.edges).toHaveLength(1);
    expect(flat.edges[0]).toMatchObject({ from: "a", to: "g", label: undefined });
    expect(flat.nodes.find((n) => n.id === "g")).toMatchObject({ look: "shape", label: "G" });
  });
});

describe("classes", () => {
  it("applies a class's keys before the item's own, later classes over earlier", () => {
    const m = model(`classes:
  svc: { look: card, color: "#2563eb", note: shared }
  hot: { color: "#dc2626" }
  store: { shape: cylinder, in: data }
groups: { data: { label: Data }, other: { label: Other } }
nodes:
  api: { icon: aws:ecs, class: svc }
  job: { icon: aws:lambda, class: [svc, hot] }
  own: { icon: aws:ecs, class: svc, color: "#16a34a" }
  db: { class: store, group: other }
edges:
  - api -> job: { class: hot }
  - { from: job, to: db, class: hot, color: "#000000" }
`);
    const node = (id: string) =>
      must(
        m.nodes.find((n) => n.id === id),
        id,
      );
    expect(node("api")).toMatchObject({ look: "card", color: "#2563eb", note: "shared" });
    expect(node("job").color).toBe("#dc2626");
    expect(node("own").color).toBe("#16a34a");
    // The node's own `group:` (a synonym of in) wins over the class's `in:`.
    expect(node("db")).toMatchObject({ shape: "cylinder", parent: "other" });
    expect(m.edges.map((e) => e.color)).toEqual(["#dc2626", "#000000"]);
  });

  it("reports an unknown class as DG121 with the nearest name", () => {
    const r = parseSpec("classes: { service: { look: card } }\nnodes: { a: { class: servce } }\n");
    const d = must(
      r.diagnostics.find((x) => x.code === "DG121"),
      `DG121 in ${listDiagnostics(r.diagnostics)}`,
    );
    expect(d.severity).toBe("error");
    expect(d.fixes?.[0]).toContain('"service"');
  });

  it("still validates what a class brings in", () => {
    const r = parseSpec("classes: { bad: { shape: blob } }\nnodes: { a: { class: bad } }\n");
    expect(r.diagnostics.map((d) => d.code)).toContain("DG107");
  });
});

describe("include", () => {
  let dir = "";
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "orrery-views-"));
    mkdirSync(join(dir, "shared"));
    writeFileSync(
      join(dir, "shared", "frame.yaml"),
      `groups:
  cloud: { type: aws:cloud }
  region: { type: aws:region, in: cloud }
classes: { svc: { look: card } }
tags: { pci: { color: "#c7243a", label: Card data } }
nodes:
  users: { icon: aws:users }
  api: { label: Placeholder, in: region }
edges: [users -> api]
`,
    );
    writeFileSync(join(dir, "a.yaml"), "include: b.yaml\nnodes: { a: A }\n");
    writeFileSync(join(dir, "b.yaml"), "include: [a.yaml]\nnodes: { b: B }\n");
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("merges the included groups, nodes, edges, classes and tags; this spec's own win", () => {
    const r = parseSpec(
      `include: [shared/frame.yaml]
nodes:
  api: { icon: aws:ecs, label: API, in: region, class: svc, tags: [pci] }
  db: { shape: cylinder, in: region }
edges: [api -> db]
`,
      join(dir, "main.yaml"),
    );
    const m = must(r.model, listDiagnostics(r.diagnostics));
    expect(m.groups.map((g) => g.id)).toEqual(["cloud", "region"]);
    expect(m.nodes.map((n) => `${n.id}:${n.label}`)).toEqual(["users:Users", "api:API", "db:db"]);
    expect(m.nodes[1]).toMatchObject({ look: "card", color: "#c7243a" });
    expect(ends(m)).toEqual(["users->api", "api->db"]);
    const clash = r.diagnostics.filter((d) => d.code === "DG122");
    expect(clash).toHaveLength(1);
    expect(clash[0]).toMatchObject({ severity: "warning" });
    expect(clash[0]?.message).toContain("shared/frame.yaml");
  });

  it("reports a missing file and a cycle as DG122 errors", () => {
    const missing = parseSpec("include: nope.yaml\nnodes: { a: A }\n", join(dir, "x.yaml"));
    expect(missing.diagnostics).toMatchObject([{ code: "DG122", severity: "error" }]);
    const cycle = parseSpec("include: b.yaml\nnodes: { a: A }\n", join(dir, "a.yaml"));
    const d = must(
      cycle.diagnostics.find((x) => x.code === "DG122" && x.severity === "error"),
      listDiagnostics(cycle.diagnostics),
    );
    expect(d.message).toBe("include cycle: a.yaml -> b.yaml -> a.yaml");
  });
});

describe("tag styles", () => {
  it("colors tagged items that set no color, and gives solid edges the tag's line", () => {
    const m = model(`tags:
  pci: { color: "#c7243a" }
  async: { line: dashed, color: "#7c3aed" }
nodes:
  a: { tags: [pci] }
  b: { tags: [pci], color: "#16a34a" }
  c: C
edges:
  - a -> c: { tags: [async] }
  - a ..> b: { tags: [async] }
  - b -> c: { tags: [async], line: solid }
`);
    expect(m.nodes.map((n) => n.color)).toEqual(["#c7243a", "#16a34a", undefined]);
    expect(m.edges.map((e) => [e.line, e.color])).toEqual([
      ["dashed", "#7c3aed"],
      ["dotted", "#7c3aed"],
      ["solid", "#7c3aed"],
    ]);
  });

  it("adds a legend row per labeled tag in use, after the line-style rows", () => {
    expect(shop().legend).toEqual([
      { line: "dotted", label: "Private endpoint" },
      { line: "solid", label: "Card data", color: "#c7243a", chip: true, tag: "pci" },
      { line: "dashed", label: "Asynchronous", color: "#7c3aed", tag: "async" },
    ]);
    const unused = model(
      `tags: { pci: { color: "#c7243a", label: Card data } }\nnodes: { a: A }\n`,
    );
    expect(unused.legend).toBeUndefined();
  });

  it("draws a tag row as a color chip or a sample line in the tag's color", async () => {
    const m = shop();
    /** The scene with each legend row's color and chip, which the renderers read. */
    const laid = async (skin: Model["skin"]): Promise<Scene> => {
      const scene = await layout({ ...m, skin }, { theme: "light" });
      const legend = must(scene.legend, "legend");
      legend.items = legend.items.map((item, i) => {
        const { color, chip } = m.legend?.[i] ?? {};
        return { ...item, ...(color ? { color } : {}), ...(chip ? { chip } : {}) };
      });
      return scene;
    };
    const key = (svg: string) => must(/<g id="legend">.*?<\/g>/s.exec(svg)?.[0], "legend group");
    const classic = await laid("classic");
    const flat = key(renderSvg(classic));
    expect(flat).toMatch(/<rect [^>]*fill="#c7243a"\/>/);
    expect(flat).toMatch(/<path [^>]*stroke="#7c3aed"[^>]*stroke-dasharray="6 4"/);
    const stage = key(renderSvg(await laid("stage")));
    expect(stage).toMatch(/<rect [^>]*fill="#c7243a"/);
    expect(stage).toMatch(/<path [^>]*stroke="#7c3aed"/);
    const drawio = renderDrawio(classic);
    expect(drawio).toMatch(/id="legend:1:chip"[^>]*fillColor=#c7243a/);
    expect(drawio).toMatch(/id="legend:2:line"[^>]*strokeColor=#7c3aed/);
  });
});

describe("spec keys for views", () => {
  it("reserves the view name all for --view all", () => {
    const r = parseSpec("nodes: { a: A }\nviews: { all: { include: [a] } }\n");
    expect(r.diagnostics).toMatchObject([{ code: "DG118", severity: "error" }]);
  });

  it("reads embed as true or false", () => {
    expect(parseSpec("embed: false\nnodes: { a: A }\n").diagnostics).toEqual([]);
    const r = parseSpec("embed: sometimes\nnodes: { a: A }\n");
    expect(r.diagnostics).toMatchObject([{ code: "DG107", severity: "error" }]);
  });
});

describe("render --view", () => {
  let dir = "";
  const run = (...args: string[]) =>
    promisify(execFile)(process.execPath, [join(ROOT, "src", "main.ts"), ...args], { cwd: dir });
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "orrery-view-cli-"));
    writeFileSync(join(dir, "shop.yaml"), SHOP);
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("writes the whole diagram and <base>.<view>.<format> for every view", async () => {
    await run("render", "shop.yaml", "-o", "out/shop", "-f", "svg", "--view", "all");
    for (const name of ["shop", ...must(shop().views, "views").map((v) => `shop.${v.name}`)])
      expect(existsSync(join(dir, "out", `${name}.svg`)), name).toBe(true);
  }, 60_000);

  it("rejects an unknown view with the names it has", async () => {
    const r = await run("render", "shop.yaml", "-o", "out/x", "--view", "nope").catch(
      (e: { code: number; stderr: string }) => e,
    );
    expect(r).toMatchObject({ code: 2 });
    expect((r as { stderr: string }).stderr).toContain("request, payments, jobs");
  });
});

describe("views of a sequence", () => {
  const spec = `title: Checkout
kind: sequence
nodes:
  user: { label: User, tags: [front] }
  web: { label: Web app, tags: [front] }
  api: { label: API }
  db: { label: Database }
edges:
  - user -> web: open cart
  - web -> api: GET /cart
  - api -> db: select items
  - db --> api: rows
  - api --> web: cart
  - web -> web: render
  - user -> web: pay
  - web -> api: POST /orders
  - api --> web: order id
fragments:
  - { type: alt, label: cart cached, from: 2, to: 5, else: [{ at: 3, label: miss }] }
  - { type: opt, label: pay now, from: 7, to: 9 }
views:
  front: { include: [tag:front] }
`;
  const m = model(spec);
  const front = viewModel(
    m,
    must(
      m.views?.find((v) => v.name === "front"),
      "view",
    ),
  );

  it("keeps every message in order, never merges repeats and keeps self messages", () => {
    expect(front.edges.map((e) => `${e.from}>${e.to}:${e.label}`)).toEqual([
      "user>web:open cart",
      "web>web:render",
      "user>web:pay",
    ]);
  });

  it("renumbers fragments to the kept messages and drops the ones left empty", () => {
    expect(front.fragments).toEqual([{ type: "opt", label: "pay now", from: 3, to: 3 }]);
  });

  const branched = model(`kind: sequence
nodes:
  user: { label: User }
  api: { label: API }
  db: { label: DB }
  cache: { label: Cache }
edges:
  - user -> api: POST /orders
  - api -> db: read stock
  - api -> cache: read cached price
  - api -> db: reserve
  - api --> user: 201 Created
fragments:
  - { type: alt, label: in stock, from: 2, to: 4, else: [{ at: 3, label: cached }, { at: 4, label: reserve only }] }
views:
  nocache: { exclude: [cache] }
  nodb: { exclude: [db] }
`);
  const fragmentsIn = (name: string) =>
    viewModel(
      branched,
      must(
        branched.views?.find((v) => v.name === name),
        "view",
      ),
    ).fragments;

  it("keeps each kept message under its own branch and drops a branch left empty", () => {
    expect(fragmentsIn("nocache")).toEqual([
      { type: "alt", label: "in stock", from: 2, to: 3, else: [{ at: 3, label: "reserve only" }] },
    ]);
  });

  it("labels the fragment with the first branch left when its own guard keeps nothing", () => {
    expect(fragmentsIn("nodb")).toEqual([{ type: "alt", label: "cached", from: 2, to: 2 }]);
  });
});
