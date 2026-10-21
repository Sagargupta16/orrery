// orrery diff: nodes, groups and edges added, removed, changed and renamed between two specs, as
// text and JSON, and the after diagram drawn with the changes tinted and the removals as ghosts.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cmdDiff,
  DIFF_INK,
  diffModels,
  diffPicture,
  formatDiff,
  readSide,
  type SpecDiff,
  withKey,
} from "../src/diff.ts";
import { renderModel } from "../src/render/index.ts";
import { model, must, xmlProblems } from "./helpers.ts";

const BEFORE = `title: Orders platform
skin: classic
groups:
  vpc: { type: aws:vpc }
  private: { type: aws:private-subnet, in: vpc }
  legacy-zone: { type: zone, label: Legacy }
nodes:
  users: { icon: aws:users, label: Users }
  api: { icon: aws:lambda, label: Orders API, in: private }
  db: { icon: aws:dynamodb, label: Orders table, in: private }
  queue: { icon: aws:sqs, label: Jobs }
  mainframe: { shape: box, label: Mainframe, in: legacy-zone }
edges:
  - users -> api: HTTPS
  - api -> db: { label: write, step: 1 }
  - api --> queue: enqueue
  - queue -> mainframe: sync
`;

const AFTER = `title: Orders platform
skin: classic
groups:
  vpc: { type: aws:vpc }
  private: { type: aws:private-subnet, in: vpc }
nodes:
  users: { icon: aws:users, label: Users }
  api: { icon: aws:lambda, label: Orders service, note: Node 22, in: private }
  orders-db: { icon: aws:dynamodb, label: Orders table, in: private }
  queue: { icon: aws:sqs, label: Jobs, in: vpc }
  cache: { icon: aws:elasticache, label: Cache, in: private }
  audit: { shape: cylinder, label: Audit log }
edges:
  - users -> api: HTTPS
  - api -> orders-db: { label: write, step: 2 }
  - api ..> queue: enqueue
  - api -> cache: read
  - queue -> audit
`;

const diff = (a = BEFORE, b = AFTER): SpecDiff =>
  diffModels(model(a), model(b), { before: "before.yaml", after: "after.yaml" });

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("diffModels", () => {
  const d = diff();

  it("finds added nodes, groups and edges", () => {
    expect(d.nodes.added).toEqual([
      { id: "cache", label: "Cache" },
      { id: "audit", label: "Audit log" },
    ]);
    expect(d.edges.added).toEqual([
      { id: "api -> cache", label: "read" },
      { id: "queue -> audit" },
    ]);
    expect(d.groups.added).toEqual([]);
  });

  it("finds removed ones", () => {
    expect(d.nodes.removed).toEqual([{ id: "mainframe", label: "Mainframe" }]);
    expect(d.groups.removed).toEqual([{ id: "legacy-zone", label: "Legacy" }]);
    expect(d.edges.removed).toEqual([{ id: "queue -> mainframe", label: "sync" }]);
  });

  it("lists what changed field by field", () => {
    expect(d.nodes.changed).toEqual([
      {
        id: "api",
        changes: [
          { field: "label", before: "Orders API", after: "Orders service" },
          { field: "note", before: null, after: "Node 22" },
        ],
      },
      { id: "queue", changes: [{ field: "group", before: null, after: "vpc" }] },
    ]);
    expect(d.edges.changed).toEqual([
      { id: "api -> orders-db", changes: [{ field: "step", before: 1, after: 2 }] },
      { id: "api -> queue", changes: [{ field: "line", before: "dashed", after: "dotted" }] },
    ]);
  });

  it("calls a new id with the same label and icon a rename, and follows it in edges", () => {
    expect(d.nodes.renamed).toEqual([{ from: "db", to: "orders-db" }]);
    // api -> db and api -> orders-db are one edge whose end was renamed.
    expect(d.edges.removed.map((e) => e.id)).not.toContain("api -> db");
    expect(d.edges.added.map((e) => e.id)).not.toContain("api -> orders-db");
    expect(d.counts).toEqual({ added: 4, removed: 3, changed: 4, renamed: 1 });
  });

  it("renames groups too, and keeps their members' group field quiet", () => {
    const r = diff(
      "groups:\n  web: { type: zone, label: Web tier }\nnodes:\n  a: { label: A, in: web }\n",
      "groups:\n  frontend: { type: zone, label: Web tier }\nnodes:\n  a: { label: A, in: frontend }\n",
    );
    expect(r.groups.renamed).toEqual([{ from: "web", to: "frontend" }]);
    expect(r.nodes.changed).toEqual([]);
  });

  it("does not guess a rename between look-alikes", () => {
    const r = diff(
      "nodes:\n  w1: { icon: aws:lambda, label: Worker }\n  w2: { icon: aws:lambda, label: Worker }\n",
      "nodes:\n  w3: { icon: aws:lambda, label: Worker }\n  w4: { icon: aws:lambda, label: Worker }\n",
    );
    expect(r.nodes.renamed).toEqual([]);
    expect(r.counts).toMatchObject({ added: 2, removed: 2, renamed: 0 });
  });

  it("matches undirected edges either way round and repeated ends in order", () => {
    const r = diff(
      "nodes: { a: A, b: B }\nedges:\n  - a -- b: one\n  - a -> b: x\n  - a -> b: y\n",
      "nodes: { a: A, b: B }\nedges:\n  - b -- a: one\n  - a -> b: x\n  - a -> b: z\n",
    );
    expect(r.edges.added).toEqual([]);
    expect(r.edges.removed).toEqual([]);
    expect(r.edges.changed).toEqual([
      { id: "a -> b", changes: [{ field: "label", before: "y", after: "z" }] },
    ]);
  });

  it("says when nothing changed", () => {
    const same = diff(BEFORE, BEFORE);
    expect(same.counts).toEqual({ added: 0, removed: 0, changed: 0, renamed: 0 });
    expect(formatDiff(same)).toBe("diff before.yaml -> after.yaml: no changes");
  });
});

describe("formatDiff", () => {
  it("prints one line per change, groups first", () => {
    expect(formatDiff(diff()).split("\n")).toEqual([
      "diff before.yaml -> after.yaml: 4 added, 3 removed, 4 changed, 1 renamed",
      '- group legacy-zone "Legacy"',
      "> node db renamed to orders-db",
      '+ node cache "Cache"',
      '+ node audit "Audit log"',
      '- node mainframe "Mainframe"',
      '~ node api: label "Orders API" -> "Orders service", note (none) -> "Node 22"',
      "~ node queue: group (none) -> vpc",
      '+ edge api -> cache "read"',
      "+ edge queue -> audit",
      '- edge queue -> mainframe "sync"',
      "~ edge api -> orders-db: step 1 -> 2",
      "~ edge api -> queue: line dashed -> dotted",
    ]);
  });
});

describe("the diff picture", () => {
  const before = model(BEFORE);
  const after = model(AFTER);
  const ink = DIFF_INK.light;
  const m = diffPicture(before, after, "light");
  const node = (id: string) =>
    must(
      m.nodes.find((n) => n.id === id),
      `node ${id}`,
    );
  const group = (id: string) =>
    must(
      m.groups.find((g) => g.id === id),
      `group ${id}`,
    );

  it("tints added and changed items and leaves the rest alone", () => {
    expect(node("audit").color).toBe(ink.added);
    expect(node("api").color).toBe(ink.changed);
    expect(node("orders-db").color).toBe(ink.changed);
    expect(node("users").color).toBeUndefined();
    const edge = (from: string, to: string) => m.edges.find((e) => e.from === from && e.to === to);
    expect(edge("api", "cache")?.color).toBe(ink.added);
    expect(edge("api", "orders-db")?.color).toBe(ink.changed);
    expect(edge("users", "api")?.color).toBeUndefined();
  });

  it("outlines icon nodes, whose vendor artwork keeps its colors", () => {
    expect(group("diff-cache")).toMatchObject({
      around: ["cache"],
      color: ink.added,
      dashed: false,
    });
    expect(m.groups.find((g) => g.around?.includes("audit"))).toBeUndefined();
  });

  it("brings removed items back as gray dashed ghosts where they were", () => {
    expect(node("mainframe")).toMatchObject({
      look: "shape",
      color: ink.removed,
      parent: "legacy-zone",
    });
    expect(group("legacy-zone")).toMatchObject({ dashed: true, color: ink.removed, fill: "none" });
    expect(group("diff-mainframe")).toMatchObject({ dashed: true, around: ["mainframe"] });
    const ghost = m.edges.find((e) => e.from === "queue" && e.to === "mainframe");
    expect(ghost).toMatchObject({ line: "dashed", color: ink.removed, label: "sync" });
    // Beside the node it followed in the before spec.
    expect(m.nodes.map((n) => n.id).indexOf("mainframe")).toBe(
      m.nodes.map((n) => n.id).indexOf("queue") + 1,
    );
    expect(m.animate).toBe("none");
  });

  it("renders well-formed SVG with the tints and a key under the diagram", async () => {
    const result = await renderModel({ model: m, formats: ["svg"], themes: ["light"], name: "t" });
    const plain = String(result.artifacts[0]?.data);
    const svg = withKey(plain, "light", diff().counts);
    expect(xmlProblems(svg)).toEqual([]);
    for (const color of [ink.added, ink.changed, ink.removed])
      expect(svg).toContain(`stroke="${color}"`);
    expect(svg).toContain('<g id="diff-key">');
    expect(svg).toMatch(/>Added \(4\)</);
    expect(svg).toMatch(/>Changed \(5\)</);
    expect(svg).toMatch(/>Removed \(3\)</);
    const height = (s: string) => Number(/<svg\b[^>]*\sheight="([\d.]+)"/.exec(s)?.[1]);
    expect(height(svg)).toBeGreaterThan(height(plain));
    expect(svg).toContain(
      `viewBox="0 0 ${/<svg\b[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1]} ${height(svg)}"`,
    );
  });
});

describe("orrery diff (the command)", () => {
  let dir = "";
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "orrery-diff-"));
    writeFileSync(join(dir, "before.yaml"), BEFORE);
    writeFileSync(join(dir, "after.yaml"), AFTER);
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const capture = () => {
    let printed = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      printed += String(chunk);
      return true;
    });
    return () => printed;
  };

  it("prints JSON and writes the picture", async () => {
    const printed = capture();
    const out = join(dir, "changes.svg");
    await cmdDiff({
      _: [join(dir, "before.yaml"), join(dir, "after.yaml")],
      flags: { json: true, out, theme: "dark" },
    });
    expect(process.exitCode).toBe(0);
    const d = JSON.parse(printed()) as SpecDiff & { output: string };
    expect(d.counts).toEqual({ added: 4, removed: 3, changed: 4, renamed: 1 });
    expect(d.output).toBe(out);
    const svg = readFileSync(out, "utf8");
    expect(xmlProblems(svg)).toEqual([]);
    expect(svg).toContain(`stroke="${DIFF_INK.dark.added}"`);
  });

  it("reads a side from git", () => {
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    git("init", "-q", "-b", "main");
    git("add", "before.yaml");
    git(
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-q",
      "-m",
      "init",
    );
    writeFileSync(join(dir, "before.yaml"), AFTER);
    const side = readSide("git:HEAD:before.yaml", dir);
    expect(side.text).toBe(BEFORE);
    expect(side.name).toBe("before");
    const d = diffModels(model(side.text), model(readFileSync(join(dir, "before.yaml"), "utf8")));
    expect(d.counts.added).toBe(4);
  });
});
