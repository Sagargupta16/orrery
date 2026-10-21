// orrery verify: every evidence form, found and broken, and --link's commit-pinned permalinks
// written back into the spec with its comments kept.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cmdVerify, linkText, parseRemote, type VerifyReport, verifyModel } from "../src/verify.ts";
import { model } from "./helpers.ts";

let repo = "";
let head = "";
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

const FILES: Record<string, string> = {
  "src/api.ts": [
    'import { ok } from "./http";',
    "export function handler(event) {",
    "  return ok(event);",
    "}",
    "export const other = 1;",
  ].join("\n"),
  "infra/main.tf": [
    'resource "aws_lambda_function" "api" {',
    '  function_name = "api"',
    "}",
    "",
    'module "vpc" {',
    '  source = "./vpc"',
    "}",
    "",
    'data "aws_iam_policy_document" "assume" {',
    "}",
  ].join("\n"),
  "infra/vpc/main.tf": 'resource "aws_subnet" "private" {\n  cidr_block = "10.0.1.0/24"\n}\n',
  "k8s/deploy.yaml": [
    "apiVersion: apps/v1",
    "kind: Deployment",
    "metadata:",
    "  name: orders",
    "---",
    "apiVersion: v1",
    "kind: Service",
    "metadata:",
    "  name: orders-svc",
  ].join("\n"),
  "src/worker.ts": "export function drain() {}",
  "docs/notes.md": "# Notes\n",
};

const spec = (name: string) => join(repo, "docs", name);

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "orrery-verify-"));
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), `${text}\n`);
  }
  git("init", "-q", "-b", "main");
  git("remote", "add", "origin", "https://github.com/acme/shop.git");
  git("add", "-A");
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
  head = git("rev-parse", "HEAD");
});

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

/** Verifies one node per evidence entry; results come back in the same order. */
function check(evidence: string[], file = "arch.yaml"): VerifyReport {
  const nodes = evidence.map((e, i) => `  n${i}: { label: N${i}, evidence: ${JSON.stringify(e)} }`);
  const text = `nodes:\n${nodes.join("\n")}\n`;
  writeFileSync(spec(file), text);
  return verifyModel(model(text, spec(file)), spec(file));
}

describe("verify: evidence that is still there", () => {
  const cases: [string, string, Record<string, unknown>][] = [
    ["path:line, from the spec's folder", "../src/api.ts:2", { file: "src/api.ts", line: 2 }],
    ["path:line, from the repo root", "src/api.ts:2", { file: "src/api.ts", line: 2 }],
    ["path:line-line", "src/api.ts:2-4", { file: "src/api.ts", line: 2, end: 4 }],
    ["path:line#name", "src/api.ts:2#handler", { file: "src/api.ts", line: 2 }],
    ["path:line-line#name", "src/api.ts:1-4#ok", { file: "src/api.ts", line: 1, end: 4 }],
    ["path#name", "src/api.ts#other", { file: "src/api.ts", line: 5 }],
    ["a bare path", "docs/notes.md", { file: "docs/notes.md" }],
    ["a Terraform resource", "aws_lambda_function.api", { file: "infra/main.tf", line: 1 }],
    ["a Terraform module", "module.vpc", { file: "infra/main.tf", line: 5 }],
    ["a data source", "data.aws_iam_policy_document.assume", { file: "infra/main.tf", line: 9 }],
    [
      "a resource inside a module, with an index",
      "module.vpc.aws_subnet.private[0]",
      { file: "infra/vpc/main.tf", line: 1 },
    ],
    ["a Kubernetes object", "Deployment/orders", { file: "k8s/deploy.yaml", line: 4 }],
    ["a later YAML document", "Service/orders-svc", { file: "k8s/deploy.yaml", line: 9 }],
  ];
  it.each(cases)("%s", (_name, evidence, where) => {
    const r = check([evidence]);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.results[0]).toMatchObject({ ok: true, evidence, ...where });
  });
});

describe("verify: evidence that broke", () => {
  const cases: [string, string, RegExp, RegExp][] = [
    [
      "a line past the end",
      "src/api.ts:99",
      /line 99 is past the end of src\/api.ts \(5 lines\)/,
      /point at a line from 1 to 5/,
    ],
    ["a range past the end", "src/api.ts:4-40", /line 40 is past the end/, /from 1 to 5/],
    ["a range that runs backwards", "src/api.ts:4-2", /runs backwards/, /write src\/api.ts:2-4/],
    ["line 0", "src/api.ts:0", /start at 1/, /src\/api.ts:1/],
    [
      "a name that moved",
      "src/api.ts:3#handler",
      /"handler" is not on line 3/,
      /it is on line 2: write src\/api.ts:2#handler/,
    ],
    ["a name outside its range", "src/api.ts:1-2#other", /not in lines 1-2/, /line 5/],
    [
      "a name that is gone",
      "src/api.ts:2#vanished",
      /"vanished" is not in src\/api.ts at all/,
      /replaced it/,
    ],
    [
      "a name that moved files",
      "src/api.ts#drain",
      /does not appear in src\/api.ts/,
      /^it is in src\/worker.ts:1: write src\/worker.ts#drain$/,
    ],
    ["an empty name", "src/api.ts:2#", /nothing follows the #/, /src\/api.ts:2#<name>/],
    ["a missing file", "src/gone.ts:1", /no such file src\/gone.ts/, /fix the path/],
    [
      "a file that moved",
      "lib/api.ts:2#handler",
      /no such file lib\/api.ts/,
      /it may have moved: write src\/api.ts:2#handler/,
    ],
    ["a folder", "src:1", /src is a folder/, /a file inside src/],
    [
      "a Terraform resource that is gone",
      "aws_lambda_function.worker",
      /no resource "aws_lambda_function" "worker" block/,
      /did you mean aws_lambda_function.api\?/,
    ],
    ["a module that is gone", "module.network", /no module "network" block/, /module.vpc/],
    [
      "a Kubernetes object that is gone",
      "Deployment/payments",
      /no Deployment named "payments"/,
      /did you mean Deployment\/orders\?/,
    ],
    [
      "any other address",
      "orders-queue",
      /"orders-queue" is not in the repo's .tf, .yaml, .yml or .json files/,
      /file and line/,
    ],
  ];
  it.each(cases)("%s", (_name, evidence, problem, fix) => {
    const r = check([evidence]);
    expect(r.ok).toBe(false);
    const p = r.problems[0];
    expect(p?.evidence).toBe(evidence);
    expect(p?.subject).toEqual({ kind: "node", id: "n0" });
    expect(p?.problem).toMatch(problem);
    expect(p?.fix).toMatch(fix);
  });

  it("names the group or edge a problem is about", () => {
    const text = [
      "groups:",
      '  vpc: { type: aws:vpc, evidence: "module.vpc" }',
      '  old: { type: zone, evidence: "infra/gone.tf:1" }',
      "nodes:",
      "  api: { label: API }",
      "  db: { label: DB }",
      "edges:",
      '  - api -> db: { evidence: "src/api.ts:30" }',
    ].join("\n");
    writeFileSync(spec("subjects.yaml"), text);
    const r = verifyModel(model(text, spec("subjects.yaml")), spec("subjects.yaml"));
    expect(r.checked).toBe(3);
    expect(r.problems.map((p) => p.subject)).toEqual([
      { kind: "group", id: "old" },
      { kind: "edge", id: "api -> db" },
    ]);
  });
});

describe("verify --link", () => {
  it("reads owner and repo from https, ssh and scp-style remotes", () => {
    const want = { host: "github.com", owner: "acme", repo: "shop" };
    expect(parseRemote("https://github.com/acme/shop.git")).toEqual(want);
    expect(parseRemote("https://github.com/acme/shop")).toEqual(want);
    expect(parseRemote("git@github.com:acme/shop.git")).toEqual(want);
    expect(parseRemote("ssh://git@github.com/acme/shop.git")).toEqual(want);
    expect(parseRemote("not a remote")).toBeUndefined();
  });

  const LINKED = `# Shop: what runs where
nodes:
  # The API
  api: { label: Orders API, evidence: "../src/api.ts:2#handler" }
  fn: { label: Fn, evidence: aws_lambda_function.api } # the Lambda
  range: { label: Range, evidence: "src/api.ts:2-4" }
  docs: { label: Docs, url: "https://docs.example.com/api", evidence: "src/api.ts:5" }
  broken: { label: Broken, evidence: "src/api.ts:99" }
  plain: { label: No evidence }
`;

  it("pins each node to the commit and keeps a url of the node's own", () => {
    writeFileSync(spec("linked.yaml"), LINKED);
    const r = verifyModel(model(LINKED, spec("linked.yaml")), spec("linked.yaml"), { link: true });
    expect(r.commit).toBe(head);
    const base = `https://github.com/acme/shop/blob/${head}`;
    expect(r.links).toEqual([
      { node: "api", evidence: "../src/api.ts:2#handler", url: `${base}/src/api.ts#L2` },
      { node: "fn", evidence: "aws_lambda_function.api", url: `${base}/infra/main.tf#L1` },
      { node: "range", evidence: "src/api.ts:2-4", url: `${base}/src/api.ts#L2-L4` },
      { node: "docs", evidence: "src/api.ts:5", url: "https://docs.example.com/api", kept: true },
    ]);
  });

  it("writes the urls into the spec with its comments and layout kept", () => {
    writeFileSync(spec("linked.yaml"), LINKED);
    const r = verifyModel(model(LINKED, spec("linked.yaml")), spec("linked.yaml"), {
      link: true,
      commit: "0123456789abcdef0123456789abcdef01234567",
    });
    const out = linkText(LINKED, r.links ?? []);
    for (const comment of ["# Shop: what runs where", "# The API", "# the Lambda"])
      expect(out).toContain(comment);
    const m = model(out, spec("linked.yaml"));
    const url = (id: string) => m.nodes.find((n) => n.id === id)?.url;
    expect(url("api")).toBe(
      "https://github.com/acme/shop/blob/0123456789abcdef0123456789abcdef01234567/src/api.ts#L2",
    );
    expect(url("docs")).toBe("https://docs.example.com/api");
    expect(url("broken")).toBeUndefined();
    expect(url("plain")).toBeUndefined();
    // Lines without a link are untouched.
    expect(out).toContain('  broken: { label: Broken, evidence: "src/api.ts:99" }\n');
  });

  it("writes urls into nodes written as a list", () => {
    const text =
      'nodes:\n  - { id: api, label: API, evidence: "src/api.ts:2" }\n  - fn: { label: Fn, evidence: module.vpc }\n';
    writeFileSync(spec("list.yaml"), text);
    const r = verifyModel(model(text, spec("list.yaml")), spec("list.yaml"), { link: true });
    const m = model(linkText(text, r.links ?? []), spec("list.yaml"));
    expect(m.nodes.map((n) => n.url)).toEqual([
      `https://github.com/acme/shop/blob/${head}/src/api.ts#L2`,
      `https://github.com/acme/shop/blob/${head}/infra/main.tf#L5`,
    ]);
  });

  it("rewrites the file and exits 1 while a problem is left (the command)", async () => {
    writeFileSync(spec("cmd.yaml"), LINKED);
    let printed = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      printed += String(chunk);
      return true;
    });
    await cmdVerify({ _: [spec("cmd.yaml")], flags: { link: true, commit: head } });
    expect(process.exitCode).toBe(1);
    expect(printed).toMatch(/1 problem\(s\)/);
    expect(printed).toMatch(/node broken: src\/api.ts:99: line 99 is past the end/);
    expect(printed).toMatch(/linked 3 node\(s\) at [0-9a-f]{12}; wrote/);
    const written = readFileSync(spec("cmd.yaml"), "utf8");
    expect(written).toContain(`url: https://github.com/acme/shop/blob/${head}/infra/main.tf#L1 }`);
  });

  it("prints JSON and exits 0 when everything is found", async () => {
    writeFileSync(
      spec("ok.yaml"),
      'nodes:\n  api: { label: API, evidence: "src/api.ts:2#handler" }\n',
    );
    let printed = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      printed += String(chunk);
      return true;
    });
    await cmdVerify({ _: [spec("ok.yaml")], flags: { json: true } });
    expect(process.exitCode).toBe(0);
    const report = JSON.parse(printed) as VerifyReport;
    expect(report).toMatchObject({ ok: true, checked: 1, problems: [] });
  });
});
