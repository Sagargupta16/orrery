// orrery patch: the review loop's spec ops applied to the YAML text, and candidate sets that are
// kept only when the measured review improves.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyPatches, PatchError, type PatchOp, tryCandidates } from "../src/patch.ts";
import { parseSpec } from "../src/spec.ts";
import type { Model } from "../src/types.ts";
import { EXAMPLES_DIR, model, must, ROOT } from "./helpers.ts";

const SPEC = `# Orders platform, a small sample for the patch tests
direction: right
legend: { dashed: Asynchronous }
nodes:
  # The people who place orders
  users: { icon: aws:users, label: Users }
  api: { icon: aws:lambda, label: Orders API, color: "#2563eb" }
  db: aws:dynamodb # primary store
  queue: { icon: aws:sqs, label: Jobs }
edges:
  # The request path
  - users -> api: HTTPS
  - api -> db: { label: write, step: 1 }
  - api --> queue: enqueue
`;

const COMMENTS = SPEC.split("\n").flatMap((l) =>
  l.trim().startsWith("#") || / # /.test(l) ? [l.slice(l.indexOf("# "))] : [],
);

const ids = (m: Model) => m.nodes.map((n) => n.id);
const node = (m: Model, id: string) =>
  must(
    m.nodes.find((n) => n.id === id),
    `node ${id}`,
  );
const edge = (m: Model, from: string, to: string) =>
  must(
    m.edges.find((e) => e.from === from && e.to === to),
    `edge ${from} -> ${to}`,
  );

describe("applyPatches", () => {
  const cases: [string, PatchOp[], (m: Model, text: string) => void][] = [
    [
      "set a top-level key",
      [{ op: "set", path: "direction", value: "down" }],
      (m, text) => {
        expect(m.direction).toBe("down");
        expect(text).toContain("\ndirection: down\n");
      },
    ],
    [
      "set a new top-level key above the sections",
      [{ op: "set", path: "title", value: "Orders platform" }],
      (m, text) => {
        expect(m.title).toBe("Orders platform");
        expect(text.indexOf("title:")).toBeLessThan(text.indexOf("nodes:"));
      },
    ],
    [
      "set a nested key that does not exist yet",
      [{ op: "set", path: "layout.aspect", value: "4:3" }],
      (m) => expect(m.aspect).toBeCloseTo(4 / 3),
    ],
    [
      "unset a node key",
      [{ op: "unset", path: "nodes.api.color" }],
      (m, text) => {
        expect(node(m, "api").color).toBeUndefined();
        expect(text).toContain("  api: { icon: aws:lambda, label: Orders API }\n");
      },
    ],
    [
      "add a node",
      [{ op: "add", path: "nodes.cache", value: { icon: "aws:elasticache", label: "Cache" } }],
      (m) => expect(ids(m)).toEqual(["users", "api", "db", "queue", "cache"]),
    ],
    [
      "add a group and put a node in it",
      [
        { op: "add", path: "groups.vpc", value: { type: "aws:vpc" } },
        { op: "set", path: "nodes.api.in", value: "vpc" },
      ],
      (m) => {
        expect(m.groups.map((g) => g.id)).toEqual(["vpc"]);
        expect(node(m, "api").parent).toBe("vpc");
      },
    ],
    [
      "move a node before another, with its comment",
      [{ op: "move", path: "nodes.users", after: "queue" }],
      (m, text) => {
        expect(ids(m)).toEqual(["api", "db", "queue", "users"]);
        expect(text).toContain("  # The people who place orders\n  users:");
      },
    ],
    [
      "move a node to the front",
      [{ op: "move", path: "nodes.db", before: "nodes.users" }],
      (m) => expect(ids(m)).toEqual(["db", "users", "api", "queue"]),
    ],
    [
      "replace an edge",
      [{ op: "edge", match: "api -> db", value: "api -> db: Reads orders [SQL]" }],
      (m, text) => {
        expect(edge(m, "api", "db").label).toBe("Reads orders [SQL]");
        expect(text).toContain("  - api -> db: Reads orders [SQL]\n");
      },
    ],
    [
      "append an edge",
      [{ op: "edge", match: null, value: "queue -> db: drain" }],
      (m, text) => {
        expect(edge(m, "queue", "db").label).toBe("drain");
        expect(text.endsWith("  - api --> queue: enqueue\n  - queue -> db: drain\n")).toBe(true);
      },
    ],
    [
      "remove an edge",
      [{ op: "edge", match: "users -> api", value: null }],
      (m) => expect(m.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["api>db", "api>queue"]),
    ],
  ];

  it.each(cases)("%s and keeps every comment", (_name, ops, check) => {
    const text = applyPatches(SPEC, ops);
    for (const c of COMMENTS) expect(text).toContain(c);
    check(model(text), text);
  });

  it("changes nothing without ops and keeps CRLF line ends", () => {
    expect(applyPatches(SPEC, [])).toBe(SPEC);
    const ops: PatchOp[] = [
      { op: "move", path: "nodes.users", after: "queue" },
      { op: "edge", match: null, value: "queue -> db" },
    ];
    const crlf = SPEC.replace(/\n/g, "\r\n");
    expect(applyPatches(crlf, ops)).toBe(applyPatches(SPEC, ops).replace(/\n/g, "\r\n"));
  });

  it("expands a short-form node or group into its mapping first", () => {
    const icon = applyPatches(SPEC, [{ op: "set", path: "nodes.db.note", value: "Sharp, 512 MB" }]);
    expect(icon).toContain('  db: { icon: aws:dynamodb, note: "Sharp, 512 MB" } # primary store\n');
    expect(node(model(icon), "db")).toMatchObject({ note: "Sharp, 512 MB", look: "icon" });

    const label = applyPatches("nodes:\n  cache: Redis\n", [
      { op: "set", path: "nodes.cache.shape", value: "cylinder" },
    ]);
    expect(label).toBe("nodes:\n  cache: { label: Redis, shape: cylinder }\n");

    const group = applyPatches("groups:\n  vpc: aws:vpc\nnodes:\n  a: { in: vpc }\n", [
      { op: "set", path: "groups.vpc.label", value: "Production VPC" },
    ]);
    expect(model(group).groups[0]).toMatchObject({ type: "aws:vpc", label: "Production VPC" });
  });

  it("matches an edge by its endpoints and arrow, and by its label only when the match has one", () => {
    const remove = (match: string) => applyPatches(SPEC, [{ op: "edge", match, value: null }]);
    const edgesOf = (text: string) => model(text).edges.map((e) => `${e.from}>${e.to}`);
    // No label in the match: the labelled mapping form still matches.
    expect(edgesOf(remove("api -> db"))).toEqual(["users>api", "api>queue"]);
    // With a label it must be the same label; written backwards it is the same drawn edge.
    expect(edgesOf(remove("db <- api: write"))).toEqual(["users>api", "api>queue"]);
    expect(() => remove("api -> db: read")).toThrow(/no edge matches "api -> db: read"/);
    // Another arrow is another edge; the error names the edges between the same nodes.
    expect(() => remove("api --> db")).toThrow(/edges between the same nodes: "api -> db: \{/);

    const two =
      "nodes: { a: A, b: B, c: C }\nedges:\n  - a -> b: one\n  - a -> b: two\n  - { from: c, to: a, arrow: start }\n  - b -> c: { flow: message }\n";
    const drop = (match: string) => applyPatches(two, [{ op: "edge", match, value: null }]);
    expect(() => drop("a -> b")).toThrow(/matches 2 edges.*add the label/);
    expect(drop("a -> b: two")).not.toContain("two");
    // A mapping matches as it is written (c -> a) and as it is drawn (head at the start: a -> c).
    expect(drop("c -> a")).not.toContain("from: c");
    expect(drop("a -> c")).not.toContain("from: c");
    // A message flow is written solid and drawn dashed.
    expect(drop("b -> c")).not.toContain("flow: message");
    expect(drop("b --> c")).not.toContain("flow: message");
  });

  it("throws PatchError naming the op that failed", () => {
    const fails = (ops: unknown[], message: RegExp) => {
      expect(() => applyPatches(SPEC, ops as PatchOp[])).toThrow(PatchError);
      expect(() => applyPatches(SPEC, ops as PatchOp[])).toThrow(message);
    };
    const ok: PatchOp = { op: "set", path: "direction", value: "down" };
    fails(
      [ok, { op: "set", path: "nodes.dbb.label", value: "DB" }],
      /^op 2 \(set nodes\.dbb\.label DB\): no node "dbb" \(did you mean "db"\?\)$/,
    );
    fails(
      [{ op: "unset", path: "nodes.api.note" }],
      /^op 1 \(unset nodes\.api\.note\): nodes\.api\.note is not set/,
    );
    fails(
      [{ op: "move", path: "nodes.db", after: "cache" }],
      /^op 1 \(move nodes\.db after cache\): no node "cache" to move after/,
    );
    fails(
      [{ op: "edge", match: "users -> db", value: null }],
      /^op 1 \(edge remove users -> db\): no edge matches/,
    );
    fails([{ op: "add", path: "nodes.api", value: {} }], /already exists; use set/);
    fails(
      [{ op: "set", path: "direction.down", value: true }],
      /direction is not a mapping, so it has no down/,
    );
    fails([{ op: "rename", path: "nodes.api" }], /unknown op "rename"/);
    fails([{ op: "move", path: "nodes.api" }], /move needs one of after or before/);
  });

  it("changes one line of every example and nothing else", () => {
    const files = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".yaml"));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const path = join(EXAMPLES_DIR, f);
      const source = readFileSync(path, "utf8");
      const text = applyPatches(source, [{ op: "set", path: "title", value: "Patched title" }]);
      const before = new Set(source.split("\n"));
      const after = new Set(text.split("\n"));
      expect(
        [...after].filter((l) => !before.has(l)),
        f,
      ).toEqual(["title: Patched title"]);
      expect([...before].filter((l) => !after.has(l)).length, f).toBeLessThanOrEqual(1);
      expect(parseSpec(text, path).model?.title, f).toBe("Patched title");
    }
  });
});

describe("tryCandidates", () => {
  it("keeps a candidate that improves the review and drops the rest with a reason", async () => {
    const run = await tryCandidates({
      source: SPEC,
      filename: "orders.yaml",
      candidates: [
        // The missing title is a measured finding; adding one only removes it.
        [{ op: "set", path: "title", value: "Orders platform" }],
        // A dashed line with no legend entry is a major finding.
        [{ op: "unset", path: "legend.dashed" }],
        [{ op: "set", path: "nodes.nope.label", value: "x" }],
        [{ op: "edge", match: "users -> api", value: "users -> nope" }],
      ],
    });
    const [better, worse, failed, broken] = run.results.map((r) => r);
    expect(run.before.findings.map((f) => f.id)).toContain("conventions.title-missing");
    expect(better).toMatchObject({ index: 0, kept: true });
    expect(must(better?.report, "report").score).toBeGreaterThan(run.before.score);
    expect(better?.source).toContain("title: Orders platform");
    expect(worse).toMatchObject({ kept: false, reason: "blockers plus majors went up: 0 -> 1" });
    expect(failed).toMatchObject({
      kept: false,
      reason: expect.stringMatching(/^op 1 \(set nodes\.nope\.label x\): no node "nope"/),
    });
    expect(failed?.source).toBeUndefined();
    expect(broken).toMatchObject({ kept: false, reason: expect.stringContaining("DG106") });
    expect(run.best?.index).toBe(0);
  });
});

describe("orrery patch", () => {
  let dir = "";
  const patch = (...args: string[]) =>
    new Promise<{ code: number | null; stdout: string }>((done, reject) => {
      const child = spawn(process.execPath, [join(ROOT, "src", "main.ts"), "patch", ...args], {
        cwd: dir,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => done({ code, stdout }));
    });

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "orrery-patch-"));
    writeFileSync(join(dir, "orders.yaml"), SPEC);
    writeFileSync(
      join(dir, "better.json"),
      JSON.stringify([
        [{ op: "set", path: "title", value: "Orders platform" }],
        [{ op: "unset", path: "legend.dashed" }],
      ]),
    );
    writeFileSync(
      join(dir, "worse.json"),
      JSON.stringify([{ op: "unset", path: "legend.dashed" }]),
    );
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("exits 0 and writes the best spec when a candidate is kept", async () => {
    const r = await patch("orders.yaml", "better.json", "-o", "best.yaml");
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^1 +kept /m);
    expect(r.stdout).toMatch(/^2 +dropped /m);
    expect(r.stdout).toContain("best: candidate 1");
    expect(readFileSync(join(dir, "best.yaml"), "utf8")).toContain("title: Orders platform");
    expect(readFileSync(join(dir, "orders.yaml"), "utf8")).toBe(SPEC);
  });

  it("exits 1 and writes nothing when no candidate improves", async () => {
    const r = await patch("orders.yaml", "worse.json", "-o", "none.yaml", "--json");
    expect(r.code).toBe(1);
    const run = JSON.parse(r.stdout) as { results: { kept: boolean }[]; best?: unknown };
    expect(run.results.map((x) => x.kept)).toEqual([false]);
    expect(run.best).toBeUndefined();
    expect(existsSync(join(dir, "none.yaml"))).toBe(false);
  });

  it("exits 2 for a bad command line", async () => {
    expect((await patch("orders.yaml")).code).toBe(2);
    expect((await patch("orders.yaml", "missing.json")).code).toBe(2);
  });
});
