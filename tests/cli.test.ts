// Runs the bundled CLI (skills/orrery/scripts/orrery.mjs), which is what ships in the
// skill. `node scripts/build.mjs --check` in CI keeps it in step with src/.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_BUNDLE, ROOT, runCli, SAMPLE } from "./helpers.ts";

interface Output {
  path: string;
  format: string;
  theme: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
}

interface Receipt {
  ok: boolean;
  spec: { path: string; sha256: string };
  outputs: Output[];
  diagnostics: { code: string; severity: string; message: string; fixes?: string[] }[];
  stats?: { nodes: number; groups: number; edges: number };
}

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };

let dir = "";
const cli = (...args: string[]) => runCli(args, dir);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "orrery-cli-"));
  writeFileSync(join(dir, "good.yaml"), SAMPLE);
  writeFileSync(join(dir, "bad.yaml"), "nodes:\n  f: { icon: aws:lamda }\n");
  writeFileSync(join(dir, "lonely.yaml"), "nodes: { a: A, b: B, c: C }\nedges:\n  - a -> b\n");
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("CLI", () => {
  it("is built", () => {
    expect(existsSync(CLI_BUNDLE)).toBe(true);
  });

  it("prints the package version", async () => {
    const r = await cli("--version");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
  });

  it("passes doctor", async () => {
    const r = await cli("doctor");
    expect(r.code).toBe(0);
    const lines = r.stdout.split("\n").filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.filter((l) => !l.startsWith("ok "))).toEqual([]);
    expect(r.stdout).toMatch(/layout/i);
    expect(r.stdout).toMatch(/png/i);
  });

  it("validates a good spec with exit code 0", async () => {
    const text = await cli("validate", "good.yaml");
    expect(text.code).toBe(0);
    expect(text.stdout).toContain("ok: 0 error(s), 0 warning(s)");

    const json = await cli("validate", "good.yaml", "--json");
    expect(json.code).toBe(0);
    const receipt = JSON.parse(json.stdout) as Receipt;
    expect(receipt).toMatchObject({ ok: true, diagnostics: [], outputs: [] });
    expect(receipt.stats).toMatchObject({ nodes: 7, groups: 5, edges: 7 });
  });

  it("rejects a bad spec with exit code 1 and prints the fix", async () => {
    const text = await cli("validate", "bad.yaml");
    expect(text.code).toBe(1);
    expect(text.stderr).toMatch(/^error\s+DG101 .*"aws:lamda"/m);
    expect(text.stderr).toMatch(/^\s+fix: use icon "aws:lambda"$/m);

    const json = await cli("validate", "bad.yaml", "--json");
    expect(json.code).toBe(1);
    const receipt = JSON.parse(json.stdout) as Receipt;
    expect(receipt.ok).toBe(false);
    expect(receipt.diagnostics).toEqual([
      expect.objectContaining({ code: "DG101", severity: "error", fixes: expect.any(Array) }),
    ]);
  });

  it("fails on warnings only with --strict", async () => {
    expect((await cli("validate", "lonely.yaml")).code).toBe(0);
    const strict = await cli("validate", "lonely.yaml", "--strict", "--json");
    expect(strict.code).toBe(1);
    expect((JSON.parse(strict.stdout) as Receipt).diagnostics.map((d) => d.code)).toEqual([
      "DG208",
    ]);
  });

  it("renders every format in both themes and lists each file in the receipt", async () => {
    const out = join(dir, "all");
    const r = await cli(
      "render",
      "good.yaml",
      "-f",
      "all",
      "--theme",
      "both",
      "--json",
      "-o",
      `${out}/`,
    );
    // With --json the findings live in the receipt; stderr stays free of them.
    expect(r.stderr).not.toMatch(/DG\d{3}|error/i);
    expect(r.code).toBe(0);
    const receipt = JSON.parse(r.stdout) as Receipt;
    expect(receipt.ok).toBe(true);
    expect(receipt.spec.sha256).toBe(sha256(readFileSync(join(dir, "good.yaml"))));
    expect(receipt.outputs.map((o) => `${o.format}:${o.theme}`).sort()).toEqual([
      "drawio.svg:dark",
      "drawio.svg:light",
      "drawio:dark",
      "drawio:light",
      "html:light+dark",
      "mmd:dark",
      "mmd:light",
      "png:dark",
      "png:light",
      "sequence.svg:dark",
      "sequence.svg:light",
      "svg:dark",
      "svg:light",
      "tsx:dark",
      "tsx:light",
    ]);
    for (const o of receipt.outputs) {
      expect(existsSync(o.path)).toBe(true);
      const data = readFileSync(o.path);
      expect(statSync(o.path).size).toBe(o.bytes);
      expect(sha256(data)).toBe(o.sha256);
      expect(o.width).toBeGreaterThan(0);
      expect(o.height).toBeGreaterThan(0);
    }
    const names = receipt.outputs.map((o) => o.path.slice(out.length + 1)).sort();
    expect(names).toEqual([
      "good-dark.drawio",
      "good-dark.drawio.svg",
      "good-dark.mmd",
      "good-dark.png",
      "good-dark.sequence.svg",
      "good-dark.svg",
      "good-dark.tsx",
      "good-light.drawio",
      "good-light.drawio.svg",
      "good-light.mmd",
      "good-light.png",
      "good-light.sequence.svg",
      "good-light.svg",
      "good-light.tsx",
      "good.html",
    ]);
  });

  it("writes byte-identical files from a fresh process", async () => {
    const run = async (name: string) => {
      const r = await cli(
        "render",
        "good.yaml",
        "-f",
        "svg,png,drawio",
        "--json",
        "-o",
        join(dir, name),
      );
      expect(r.code).toBe(0);
      return (JSON.parse(r.stdout) as Receipt).outputs.map((o) => [o.format, o.sha256]);
    };
    const [first, second] = [await run("one"), await run("two")];
    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
  });

  it("searches icons as JSON", async () => {
    const r = await cli("icons", "search", "lambda", "--json");
    expect(r.code).toBe(0);
    const results = JSON.parse(r.stdout) as { id: string; name: string; pack: string }[];
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(15);
    expect(results.map((i) => i.id)).toContain("aws:lambda");
    expect(results.find((i) => i.id === "aws:lambda")).toMatchObject({
      name: "AWS Lambda",
      pack: "aws",
    });
  });

  it.each([
    ["no command arguments for render", ["render"]],
    ["an unknown command", ["frobnicate"]],
    ["a missing spec file", ["validate", "missing.yaml"]],
    ["an unknown theme", ["render", "good.yaml", "--theme", "purple"]],
    ["an unknown format", ["render", "good.yaml", "-f", "jpeg"]],
    ["a flag without its value", ["render", "good.yaml", "-o"]],
    ["a scale out of range", ["render", "good.yaml", "--scale", "0"]],
    ["an unknown icons subcommand", ["icons", "fly"]],
  ])("exits 2 for %s", async (_what, args) => {
    const r = await cli(...args);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^orrery: /);
  });
});
