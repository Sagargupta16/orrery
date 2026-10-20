#!/usr/bin/env node
// The orrery GitHub Action (action.yml at the repo root) in two phases.
//
//   check   validate, render (SVG and PNG), review at the display width and, for specs the pull
//           request changed, diff against its base; everything lands in ORRERY_OUT with a
//           results.json, which the next step uploads as the artifact.
//   report  one pull request comment (created once, then updated in place through a marker),
//           the job summary, an annotation per failing spec, and the exit code `fail-on` asks for.
//
// Settings come from the environment the action sets: ORRERY_SPECS (globs, one per line),
// ORRERY_WIDTH, ORRERY_VERSION, ORRERY_OUT, ORRERY_COMMENT, ORRERY_FAIL_ON, ORRERY_ARTIFACT_URL,
// GH_TOKEN. ORRERY_CLI swaps the npx package for a local command (a JSON array or a plain
// command line) and ORRERY_DRY_RUN=1 prints the comment instead of posting it.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "<!-- orrery-action -->";
const DEFAULT_SPECS = "**/*.orrery.yaml\ndocs/**/*.yaml";
const FAIL_ON = ["error", "warning", "review"];
const env = process.env;
const out = env.ORRERY_OUT || join(tmpdir(), "orrery-action");
const resultsFile = join(out, "results.json");

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    // npx is a .cmd shim on Windows runners.
    shell: process.platform === "win32" && cmd === "npx",
  });
  return {
    code: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr || r.error?.message || "",
  };
}

const git = (...args) => run("git", args);

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The orrery command: ORRERY_CLI, else the npm package at this action's version. */
function cli() {
  const custom = env.ORRERY_CLI?.trim();
  if (custom) return custom.startsWith("[") ? JSON.parse(custom) : custom.split(/\s+/);
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8"));
  return ["npx", "-y", `@sagargupta1610/orrery@${env.ORRERY_VERSION?.trim() || pkg.version}`];
}

const [cliCmd, ...cliArgs] = cli();
const orrery = (...args) => run(cliCmd, [...cliArgs, ...args]);
const firstLine = (s) =>
  s
    .split(/\r?\n/)
    .find((l) => l.trim())
    ?.trim() ?? "";

function setOutput(name, value) {
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function event() {
  const path = env.GITHUB_EVENT_PATH;
  return (path && existsSync(path) && parse(readFileSync(path, "utf8"))) || {};
}

/** Tracked and new files the globs match that are diagram specs (a top-level `nodes:`). */
function findSpecs() {
  const globs = (env.ORRERY_SPECS?.trim() || DEFAULT_SPECS)
    .split(/\r?\n/)
    .map((g) => g.trim())
    .filter(Boolean);
  const listed = git(
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...globs.map((g) => `:(glob)${g}`),
  );
  if (listed.code) throw new Error(`git ls-files failed: ${firstLine(listed.stderr)}`);
  return [...new Set(listed.stdout.split("\0").filter(Boolean))]
    .filter((f) => /\.(ya?ml|json)$/i.test(f) && existsSync(f))
    .filter((f) => /^nodes\s*:|"nodes"\s*:/m.test(readFileSync(f, "utf8")))
    .sort();
}

/** Files the pull request changed, fetching its base commit when the checkout is shallow. */
function changedFiles(base) {
  if (!base) return undefined;
  if (git("cat-file", "-e", `${base}^{commit}`).code)
    git("fetch", "--no-tags", "--depth=1", "origin", base);
  const d = git("diff", "--name-only", "--no-renames", base, "HEAD");
  if (d.code) {
    console.log(`::warning::cannot diff against the base ${base}: ${firstLine(d.stderr)}`);
    return undefined;
  }
  return new Set(d.stdout.split(/\r?\n/).filter(Boolean));
}

const slugOf = (spec) => spec.replace(/\.(ya?ml|json)$/i, "").replace(/[^A-Za-z0-9._-]+/g, "__");

function checkSpec(spec, { width, base, changed }) {
  const slug = slugOf(spec);
  const at = join(out, slug);
  const r = { spec, slug, errors: 0, warnings: 0, files: [] };
  const v = orrery("validate", spec, "--json");
  const receipt = parse(v.stdout);
  if (!receipt) {
    r.errors = 1;
    r.problem = firstLine(v.stderr) || `validate exited with ${v.code}`;
    return r;
  }
  const diags = receipt.diagnostics ?? [];
  r.errors = diags.filter((d) => d.severity === "error").length;
  r.warnings = diags.length - r.errors;
  r.diagnostics = diags.slice(0, 20).map((d) => `${d.severity} ${d.code} ${d.message}`);
  if (r.errors) return r;
  const rendered = parse(orrery("render", spec, "-o", at, "-f", "svg,png", "--json").stdout);
  r.files.push(...(rendered?.outputs ?? []).map((o) => basename(o.path)));
  const reviewed = orrery("review", spec, "-o", at, "--width", width, "--json");
  const report = parse(reviewed.stdout);
  if (report) {
    r.score = report.score;
    r.pass = report.pass;
    r.findings = report.findings?.length ?? 0;
    r.files.push(`${slug}.review.png`);
  } else r.problem = firstLine(reviewed.stderr) || "review failed";
  if (changed?.has(spec)) {
    if (git("cat-file", "-e", `${base}:${spec}`).code) r.diff = "new";
    else {
      const d = parse(
        orrery("diff", `git:${base}:${spec}`, spec, "-o", `${at}.diff.svg`, "--json").stdout,
      );
      r.diff = d?.counts ?? "failed";
      if (d) r.files.push(`${slug}.diff.svg`);
    }
  }
  return r;
}

function check() {
  mkdirSync(out, { recursive: true });
  const width = env.ORRERY_WIDTH?.trim() || "880";
  if (!(Number(width) > 0))
    throw new Error(`width must be a positive number of px (got "${width}")`);
  const base = event().pull_request?.base?.sha;
  const changed = changedFiles(base);
  const specs = findSpecs();
  const results = [];
  for (const spec of specs) {
    const r = checkSpec(spec, { width, base, changed });
    console.log(
      `${spec}: ${r.errors} error(s), ${r.warnings} warning(s)${r.score !== undefined ? `, score ${r.score}, ${r.pass ? "pass" : "fail"}` : ""}${r.problem ? `, ${r.problem}` : ""}`,
    );
    results.push(r);
  }
  writeFileSync(resultsFile, `${JSON.stringify({ width, base, results }, null, 2)}\n`);
  setOutput("count", results.length);
  console.log(`checked ${results.length} spec(s); results in ${resultsFile}`);
}

// ---------------------------------------------------------------- report

/** Why a spec fails under fail-on, or undefined when it passes. */
function failure(r, failOn) {
  if (r.errors) return `${r.errors} error(s)${r.problem ? `: ${r.problem}` : ""}`;
  if (r.problem) return r.problem;
  if (failOn !== "error" && r.warnings) return `${r.warnings} warning(s)`;
  if (failOn === "review" && r.pass === false) return `review did not pass (score ${r.score})`;
  return undefined;
}

// Backslashes first, so the escape added for a pipe cannot be read as an escape of its own.
const cell = (s) => String(s).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function changes(d) {
  if (d === undefined) return "-";
  if (d === "new") return "new spec";
  if (d === "failed") return "diff failed";
  const changedCount = d.changed + d.renamed;
  if (!d.added && !d.removed && !changedCount) return "no changes";
  return `+${d.added} -${d.removed} ~${changedCount}`;
}

function commentBody({ width, results }, failOn, artifactUrl) {
  const failing = results.filter((r) => failure(r, failOn));
  const lines = [
    MARKER,
    "### orrery diagrams",
    "",
    `**${results.length} spec(s) checked, ${failing.length ? `${failing.length} failing` : "all passing"}** (fail-on: ${failOn}; reviewed at ${width} px)`,
    "",
    "| Spec | Score | Pass | Findings | Checks | Changes |",
    "| --- | ---: | :---: | ---: | --- | --- |",
  ];
  for (const r of results) {
    const checks = r.problem
      ? cell(r.problem)
      : `${r.errors} error${r.errors === 1 ? "" : "s"}, ${r.warnings} warning${r.warnings === 1 ? "" : "s"}`;
    lines.push(
      `| \`${cell(r.spec)}\` | ${r.score ?? "-"} | ${r.pass === undefined ? "-" : r.pass ? "yes" : "no"} | ${r.findings ?? "-"} | ${checks} | ${changes(r.diff)} |`,
    );
  }
  lines.push("");
  if (artifactUrl)
    lines.push(
      `Rendered SVG and PNG, review images and change pictures (green added, amber changed, gray dashed removed): [download the artifact](${artifactUrl}).`,
    );
  return `${lines.join("\n")}\n`;
}

/** Creates the comment, or edits the one an earlier run left (found by its marker). */
function upsertComment(repo, number, body) {
  const found = run("gh", [
    "api",
    "--paginate",
    `repos/${repo}/issues/${number}/comments?per_page=100`,
    "--jq",
    `.[] | select(.user.type == "Bot" and (.body | contains("${MARKER}"))) | .id`,
  ]);
  if (found.code) throw new Error(firstLine(found.stderr) || "cannot list the comments");
  const id = found.stdout.split(/\s+/).find(Boolean);
  const payload = join(env.RUNNER_TEMP || tmpdir(), "orrery-comment.json");
  writeFileSync(payload, JSON.stringify({ body }));
  const sent = id
    ? run("gh", ["api", "-X", "PATCH", `repos/${repo}/issues/comments/${id}`, "--input", payload])
    : run("gh", [
        "api",
        "-X",
        "POST",
        `repos/${repo}/issues/${number}/comments`,
        "--input",
        payload,
      ]);
  if (sent.code) throw new Error(firstLine(sent.stderr) || "the comment was not saved");
  return id ? `updated comment ${id}` : "posted a comment";
}

function report() {
  const failOn = env.ORRERY_FAIL_ON?.trim() || "error";
  if (!FAIL_ON.includes(failOn))
    throw new Error(`fail-on must be ${FAIL_ON.join(", ")} (got "${failOn}")`);
  const state = parse(readFileSync(resultsFile, "utf8"));
  if (!state) throw new Error(`cannot read ${resultsFile}; did the check step run?`);
  const runUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : "";
  const failing = state.results.filter((r) => failure(r, failOn));
  setOutput("passed", failing.length ? "false" : "true");
  if (!state.results.length) {
    console.log("no orrery specs matched; nothing to report");
    return;
  }
  const body = commentBody(state, failOn, env.ORRERY_ARTIFACT_URL?.trim() || runUrl);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, body);
  const ev = event();
  const number = ev.pull_request?.number ?? ev.number;
  const repo = env.GITHUB_REPOSITORY;
  if (env.ORRERY_COMMENT?.trim() === "false") console.log("comment: off");
  else if (!number || !repo) console.log("comment: not a pull request, so the job summary only");
  else if (/^(1|true)$/i.test(env.ORRERY_DRY_RUN ?? ""))
    console.log(`--- comment for ${repo}#${number} (dry run, not posted) ---\n${body}`);
  else {
    try {
      console.log(`comment: ${upsertComment(repo, number, body)} on ${repo}#${number}`);
    } catch (e) {
      // Pull requests from forks get a read-only token; the summary still has the table.
      console.log(`::warning::could not post the pull request comment: ${e.message}`);
    }
  }
  for (const r of failing) console.log(`::error file=${r.spec}::orrery: ${failure(r, failOn)}`);
  if (failing.length) process.exitCode = 1;
}

const phase = process.argv[2];
try {
  if (phase === "check") check();
  else if (phase === "report") report();
  else throw new Error(`usage: run.mjs check|report (got "${phase ?? ""}")`);
} catch (e) {
  console.log(`::error::orrery action: ${e.message}`);
  process.exitCode = 1;
}
