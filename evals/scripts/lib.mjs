// Shared helpers for the eval grader scripts: argument parsing, running the bundled orrery CLI
// and reading its JSON, and printing a verdict with a CI-friendly exit code.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const evalsDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(evalsDir, "..");
export const defaultCli = join(repoRoot, "skills/orrery/scripts/orrery.mjs");

/** Splits argv into positionals and --flags; a flag takes the next word unless it is a boolean. */
export function parseArgs(argv, booleans = []) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const [key, value] = arg.slice(2).split(/=(.*)/s);
    if (value !== undefined) flags[key] = value;
    else if (booleans.includes(key) || i + 1 >= argv.length) flags[key] = true;
    else flags[key] = argv[++i];
  }
  return { positionals, flags };
}

/** Runs the CLI with node and parses stdout as JSON; json is null when stdout is not JSON. */
export function runCli(cli, args) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {}
  return { status: r.status, json, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Measures a spec at a width, writing the review files to a throwaway directory. */
export function review(cli, spec, width) {
  const dir = mkdtempSync(join(tmpdir(), "orrery-eval-"));
  try {
    return runCli(cli, ["review", spec, "--width", String(width), "--json", "-o", join(dir, "r")]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The numbers the graders compare from one review JSON. */
export function summarize(report) {
  const blocking = report.findings.filter((f) => f.severity !== "minor").length;
  const nodes = report.elements.filter((e) => e.kind === "node").map((e) => e.id);
  return {
    width: report.width,
    score: report.score,
    pass: report.pass,
    blocking,
    hard: report.hard,
    nodes,
  };
}

/** Prints the verdict as JSON and exits 0 when it passes, 1 when it does not. */
export function finish(verdict) {
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
  process.exit(verdict.pass ? 0 : 1);
}

export function usage(text) {
  process.stderr.write(`usage: ${text}\n`);
  process.exit(2);
}
