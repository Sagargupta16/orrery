#!/usr/bin/env node
// Self-test for the eval suite. Makes no model calls and needs no Claude Code.
//   1. lint     every case under evals/ against the case format of `claude plugin eval`
//               (https://code.claude.com/docs/en/plugin-evals.md): keys, grader types and options,
//               regexes, limits, scaffold paths. The command has no validate or dry-run mode.
//   2. graders  each case's own graders, evaluated as the docs define them, over hand-made good and
//               bad workspaces. Where a grader reads CLI output (review JSON, rendered files), the
//               workspace is built with the real bundled CLI. A good workspace must pass every
//               grader and a bad one must fail exactly the graders listed for it.
//   3. scripts  check-spec, plan-recall and review-delta on good and bad inputs, by exit code.
//
//   node evals/scripts/selftest.mjs
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import { defaultCli, evalsDir, runCli } from "./lib.mjs";

const PROMPT_KEYS = [
  "schema_version",
  "name",
  "description",
  "tags",
  "plugins",
  "runs",
  "expected_outcome",
  "model",
  "max_turns",
  "timeout_seconds",
  "allowed_tools",
  "append_system_prompt",
  "env",
];
const CASE_KEYS = [
  "schema_version",
  "name",
  "description",
  "tags",
  "plugins",
  "runs",
  "expected_outcome",
  "context",
  "execution",
  "graders",
];
const CONTEXT_KEYS = ["scaffold_script", "history_file", "add_dirs"];
const EXECUTION_KEYS = [
  "prompt",
  "model",
  "max_turns",
  "timeout_seconds",
  "allowed_tools",
  "append_system_prompt",
  "env",
];
const GRADER_TYPES = {
  regex: ["pattern", "flags", "match", "target"],
  tool_used: ["tool", "input_match", "min", "max"],
  tool_order: ["before", "after"],
  file_exists: ["path", "exists"],
  llm: ["criteria", "focus"],
  baseline: ["baseline_file", "criteria"],
};
const TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "NotebookRead",
  "Skill",
  "AskUserQuestion",
  "Agent",
  "TodoWrite",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskUpdate",
  "TaskStop",
  "Bash",
  "PowerShell",
  "Write",
  "Edit",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
]);
const TARGETS = new Set(["last_message", "trace", "files", "mock_calls"]);
const ORRERY = 'node "/plugins/orrery/skills/orrery/scripts/orrery.mjs"';
const BAD_SPEC = join(evalsDir, "fixtures/bad-spec/repo/docs/architecture.yaml");
const BAD_SPEC_SCORE = 70.9;
const CONFIRM = [
  "Services: Orders HTTP API, Create order (Lambda), Orders table, Order events (SQS), Send receipt (Lambda), Receipts bucket",
  "Boundaries: AWS Cloud > us-east-1",
  "Flows: Customers -> Orders HTTP API -> Create order -> Orders table; Create order -> Order events; Order events -> Send receipt (polls); Send receipt -> Receipts bucket",
  "Left out: IAM roles (edges), log groups, routes and stage",
].join("\n");

const results = [];
const check = (label, ok, detail = "") => results.push({ label, ok: Boolean(ok), detail });
const temp = mkdtempSync(join(tmpdir(), "orrery-selftest-"));

try {
  const cases = discover();
  lint(cases);
  graders(cases);
  scripts();
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
for (const r of results)
  console.log(
    `${r.ok ? "ok  " : "FAIL"}  ${r.label}${r.ok || !r.detail ? "" : `\n      ${r.detail}`}`,
  );
console.log(`\n${results.length} checks, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);

// 1. Lint ------------------------------------------------------------------------------------

function discover() {
  const found = [];
  const walk = (dir) => {
    const names = readdirSync(dir);
    if (names.includes("prompt.md") || names.includes("case.yaml")) found.push(loadCase(dir));
    else
      for (const entry of readdirSync(dir, { withFileTypes: true }))
        if (entry.isDirectory() && !["results", "node_modules"].includes(entry.name))
          walk(join(dir, entry.name));
  };
  walk(evalsDir);
  return found;
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return m ? { data: parse(m[1]) ?? {}, body: m[2] } : { data: {}, body: text };
}

function loadCase(dir) {
  const promptFile = join(dir, "prompt.md");
  const caseFile = join(dir, "case.yaml");
  const prompt = existsSync(promptFile) ? frontmatter(readFileSync(promptFile, "utf8")) : null;
  const spec = existsSync(caseFile) ? (parse(readFileSync(caseFile, "utf8")) ?? {}) : null;
  const list = (spec?.graders ?? []).map((g) => ({ ...g, from: "case.yaml" }));
  const graderDir = join(dir, "graders");
  if (existsSync(graderDir))
    for (const file of readdirSync(graderDir)
      .filter((f) => f.endsWith(".md"))
      .sort()) {
      const { data, body } = frontmatter(readFileSync(join(graderDir, file), "utf8"));
      list.push({ ...data, name: basename(file, ".md"), body, from: `graders/${file}` });
    }
  const rel = relative(evalsDir, dir).replaceAll("\\", "/");
  return {
    dir,
    rel,
    name: prompt?.data.name ?? spec?.name ?? basename(dir),
    prompt,
    spec,
    graders: list,
  };
}

function lint(cases) {
  check(`lint: found ${cases.length} cases`, cases.length > 0);
  const names = new Map();
  for (const c of cases) {
    const problems = [];
    const unknown = (obj, allowed, where) => {
      for (const key of Object.keys(obj ?? {}))
        if (!allowed.includes(key)) problems.push(`unknown key ${where}${key}`);
    };
    if (/^(fixtures|selftest|scripts)\//.test(c.rel))
      problems.push("a case inside a support folder");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(c.name)) problems.push(`bad case name "${c.name}"`);
    names.set(c.name, [...(names.get(c.name) ?? []), c.rel]);
    unknown(c.prompt?.data, PROMPT_KEYS, "prompt.md ");
    if (c.spec) {
      unknown(c.spec, CASE_KEYS, "case.yaml ");
      unknown(c.spec.context, CONTEXT_KEYS, "context.");
      unknown(c.spec.execution, EXECUTION_KEYS, "execution.");
      if (c.spec.schema_version !== "1.1") problems.push('case.yaml needs schema_version: "1.1"');
      if (c.spec.name !== basename(c.dir))
        problems.push(`case.yaml name "${c.spec.name}" is not the folder name`);
      const script = c.spec.context?.scaffold_script;
      if (script) {
        const path = join(c.dir, script);
        if (!existsSync(path)) problems.push(`scaffold_script ${script} missing`);
        else
          for (const m of readFileSync(path, "utf8").matchAll(/(?:\.\.\/)+fixtures\/[\w./-]+/g))
            if (!existsSync(resolve(c.dir, m[0]))) problems.push(`scaffold copies missing ${m[0]}`);
      }
    }
    const run = { ...(c.spec?.execution ?? {}), ...(c.spec ?? {}), ...(c.prompt?.data ?? {}) };
    const body = c.prompt?.body.trim() || c.spec?.execution?.prompt;
    if (!body) problems.push("no prompt");
    const intIn = (key, lo, hi) => {
      const v = run[key];
      if (v !== undefined && !(Number.isInteger(v) && v >= lo && v <= hi))
        problems.push(`${key} ${v} not in ${lo}..${hi}`);
    };
    intIn("runs", 1, 50);
    intIn("max_turns", 1, 200);
    intIn("timeout_seconds", 1, 3600);
    for (const tool of run.allowed_tools ?? [])
      if (!TOOLS.has(tool)) problems.push(`unknown tool ${tool}`);
    for (const key of Object.keys(run.env ?? {}))
      if (!/^EVAL_[A-Z0-9_]*$/.test(key)) problems.push(`env ${key}`);
    if (
      run.tags !== undefined &&
      !(Array.isArray(run.tags) && run.tags.every((t) => typeof t === "string"))
    )
      problems.push("tags must be a list of strings");
    if (!c.graders.length) problems.push("no graders");
    for (const g of c.graders)
      problems.push(...lintGrader(g).map((p) => `${g.from} ${g.name}: ${p}`));
    check(`lint: ${c.rel}`, !problems.length, problems.join("; "));
  }
  for (const [name, where] of names)
    if (where.length > 1) check(`lint: case name ${name} is unique`, false, where.join(", "));
}

function lintGrader(g) {
  const problems = [];
  const options = GRADER_TYPES[g.type];
  if (!options) return [`unknown type ${g.type}`];
  const allowed = ["type", "weight", "arm", "name", "from", "body", ...options];
  for (const key of Object.keys(g))
    if (!allowed.includes(key)) problems.push(`unknown option ${key}`);
  if (g.from === "case.yaml" && !g.name) problems.push("case.yaml graders need a name");
  if (g.weight !== undefined && !(typeof g.weight === "number" && g.weight > 0))
    problems.push("weight must be > 0");
  if (g.arm !== undefined && !["with-only", "both"].includes(g.arm)) problems.push(`arm ${g.arm}`);
  const compiles = (source, flags = "") => {
    if (/\(\?[a-z]+\)/.test(source)) return "inline flags such as (?i) are not supported";
    if (!/^[dgimsuyv]*$/.test(flags)) return `bad flags ${flags}`;
    try {
      new RegExp(source, flags);
      return null;
    } catch (e) {
      return e.message;
    }
  };
  if (g.type === "regex") {
    if (typeof g.pattern !== "string") problems.push("pattern missing");
    else if (compiles(g.pattern, g.flags)) problems.push(compiles(g.pattern, g.flags));
    if (g.match !== undefined && !/^(contains|not_contains|count:\d+)$/.test(g.match))
      problems.push(`match ${g.match}`);
    const t = g.target;
    if (t !== undefined && !TARGETS.has(t) && !(t?.source === "file" && typeof t.path === "string"))
      problems.push(`target ${JSON.stringify(t)}`);
  }
  if (g.type === "tool_used") {
    if (typeof g.tool !== "string") problems.push("tool missing");
    if (g.input_match !== undefined && compiles(g.input_match))
      problems.push(compiles(g.input_match));
    for (const k of ["min", "max"])
      if (g[k] !== undefined && !(Number.isInteger(g[k]) && g[k] >= 0))
        problems.push(`${k} must be a whole number`);
    if ((g.min ?? 1) > (g.max ?? Number.POSITIVE_INFINITY)) problems.push("min > max");
  }
  if (g.type === "file_exists" && typeof g.path !== "string") problems.push("path missing");
  if (g.type === "llm" && !(g.criteria || g.body?.trim())) problems.push("criteria missing");
  return problems;
}

// 2. Graders -----------------------------------------------------------------------------------

/** One grader verdict over a workspace, per the grader types table in the docs. */
function grade(g, ws) {
  if (g.type === "regex") {
    const text = targetText(g.target ?? "last_message", ws);
    if (text === null) return false;
    const flags = g.flags ?? "";
    const match = g.match ?? "contains";
    if (match === "not_contains") return !new RegExp(g.pattern, flags).test(text);
    if (match.startsWith("count:"))
      return (
        (text.match(new RegExp(g.pattern, `${flags.replace("g", "")}g`)) ?? []).length ===
        Number(match.slice(6))
      );
    return new RegExp(g.pattern, flags).test(text);
  }
  if (g.type === "file_exists")
    return ws.created.some((p) => globRe(g.path).test(p)) === (g.exists ?? true);
  if (g.type === "tool_used") {
    const re = g.input_match ? new RegExp(g.input_match) : null;
    const n = ws.calls.filter(
      (c) => c.tool === g.tool && (!re || re.test(JSON.stringify(c.input))),
    ).length;
    return n >= (g.min ?? 1) && n <= (g.max ?? Number.POSITIVE_INFINITY);
  }
  throw new Error(`selftest cannot run a ${g.type} grader`);
}

// A missing file fails the grader here, the conservative reading: the docs do not say how a
// not_contains grader treats a file the run never wrote.
function targetText(target, ws) {
  if (target === "last_message") return ws.lastMessage;
  if (target === "files") return ws.created.join("\n");
  if (target?.source === "file") {
    const path = join(ws.dir, target.path);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  }
  throw new Error(`selftest cannot read target ${JSON.stringify(target)}`);
}

function globRe(glob) {
  const body = glob
    .split("**")
    .map((part) =>
      part
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]"),
    )
    .join(".*");
  return new RegExp(`^${body}$`);
}

function skill(name) {
  return { tool: "Skill", input: { skill: name, args: "draw it" } };
}
function bash(command) {
  return { tool: "Bash", input: { command, description: "Run orrery" } };
}
function agent(type) {
  return {
    tool: "Agent",
    input: { subagent_type: type, description: "Plan the figures", prompt: "..." },
  };
}

function workspace(files = {}) {
  const dir = mkdtempSync(join(temp, "ws-"));
  for (const [rel, from] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    cpSync(from, join(dir, rel));
  }
  return dir;
}

function listFiles(dir, rel = "") {
  return readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const path = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? listFiles(dir, path) : [path];
  });
}

function drawWorkspace(spec, { width = 880, calls } = {}) {
  const dir = workspace({ "docs/architecture.yaml": spec });
  const path = join(dir, "docs/architecture.yaml");
  const base = join(dir, "docs/architecture");
  runCli(defaultCli, ["review", path, "--width", String(width), "--json", "-o", base]);
  runCli(defaultCli, ["render", path, "-o", base, "-f", "svg,png"]);
  return {
    dir,
    created: listFiles(dir),
    lastMessage: "Wrote docs/architecture.yaml, docs/architecture.svg and docs/architecture.png.",
    calls: calls ?? [
      skill("orrery:orrery"),
      bash(`${ORRERY} validate docs/architecture.yaml --strict`),
      bash(`${ORRERY} review docs/architecture.yaml --width ${width} --json -o docs/architecture`),
      bash(`${ORRERY} render docs/architecture.yaml -o docs/architecture -f svg,png`),
    ],
  };
}

function planWorkspace(plan, lastMessage = CONFIRM, calls = [agent("orrery:planner")]) {
  const from = plan && (isAbsolute(plan) ? plan : join(evalsDir, "selftest/plans", plan));
  const dir = from ? workspace({ "plan.json": from }) : workspace();
  return { dir, created: listFiles(dir), lastMessage, calls };
}

/** The good compose plan with the worker drawn as the consumer: worker -> cache instead of cache -> worker. */
function workerPullsPlan() {
  const path = join(temp, "compose-worker-pulls.json");
  const text = readFileSync(join(evalsDir, "selftest/plans/compose-good.json"), "utf8");
  const flipped = text.replace(
    '"from": "cache", "to": "worker"',
    '"from": "worker", "to": "cache"',
  );
  if (flipped === text) throw new Error("compose-good.json no longer has the cache -> worker edge");
  writeFileSync(path, flipped);
  return path;
}

function reviewWorkspace(variant) {
  const dir = workspace({ "docs/architecture.yaml": BAD_SPEC });
  const spec = join(dir, "docs/architecture.yaml");
  const calls = [
    skill("orrery:orrery"),
    bash(`${ORRERY} review docs/architecture.yaml --width 880 --json -o docs/architecture`),
  ];
  if (variant === "patched") {
    const candidates = join(dir, "candidates.json");
    writeFileSync(candidates, JSON.stringify([[{ op: "set", path: "direction", value: "down" }]]));
    runCli(defaultCli, ["patch", spec, candidates, "--width", "880", "-o", spec]);
    calls.push(
      bash(
        `${ORRERY} patch docs/architecture.yaml candidates.json --width 880 -o docs/architecture.yaml`,
      ),
    );
  }
  if (variant === "dropped-node") {
    const kept = readFileSync(spec, "utf8")
      .split("\n")
      .filter((line) => !/\bkeys\b/.test(line));
    writeFileSync(spec, kept.join("\n"));
  }
  runCli(defaultCli, ["review", spec, "--width", "880", "--json", "-o", join(dir, "out/final")]);
  calls.push(bash(`${ORRERY} review docs/architecture.yaml --width 880 --json -o out/final`));
  return { dir, created: listFiles(dir), lastMessage: "Score went up.", calls };
}

function scenarios(c) {
  const names = c.graders.map((g) => g.name);
  if (names.includes("skill-fired") && c.rel.startsWith("trigger/"))
    return [
      ["fires as orrery:orrery", { calls: [skill("orrery:orrery")] }, []],
      ["fires as orrery", { calls: [skill("orrery")] }, []],
      ["another skill fires", { calls: [skill("dataviz")] }, ["skill-fired"]],
      ["no skill fires", { calls: [] }, ["skill-fired"]],
    ];
  if (names.includes("skill-not-fired"))
    return [
      ["no skill fires", { calls: [] }, []],
      ["another skill fires", { calls: [skill("dataviz")] }, []],
      ["orrery fires", { calls: [skill("orrery:orrery")] }, ["skill-not-fired"]],
      ["an orrery command fires", { calls: [skill("orrery:draw")] }, ["skill-not-fired"]],
    ];
  if (c.rel.startsWith("draw/"))
    return [
      ["good spec", drawWorkspace(join(evalsDir, "selftest/specs/good.yaml")), []],
      ["spec that fails the review", drawWorkspace(BAD_SPEC), ["review-passes-at-880"]],
      [
        "spec with errors",
        drawWorkspace(join(evalsDir, "selftest/specs/invalid.yaml")),
        ["rendered-png", "rendered-svg", "review-passes-at-880"],
      ],
      [
        "good spec reviewed at 1280",
        drawWorkspace(join(evalsDir, "selftest/specs/good.yaml"), { width: 1280 }),
        ["review-passes-at-880"],
      ],
      [
        "good spec, validate never run",
        drawWorkspace(join(evalsDir, "selftest/specs/good.yaml"), {
          calls: [skill("orrery:orrery")],
        }),
        ["validated"],
      ],
    ];
  if (c.name === "plan-serverless-terraform")
    return [
      ["good plan", planWorkspace("serverless-good.json"), []],
      [
        "plan with free-form ids (plan-recall still passes it)",
        planWorkspace("serverless-freeform.json"),
        [
          "edge-api-to-create-order",
          "edge-create-order-to-queue",
          "edge-create-order-to-table",
          "edge-queue-to-send-receipt",
          "edge-send-receipt-to-bucket",
          "node-create-order",
        ],
      ],
      [
        "plan with the usual mistakes",
        planWorkspace("serverless-bad.json", "Saved the plan to plan.json."),
        [
          "confirm-list-shown",
          "edge-queue-to-send-receipt",
          "edge-send-receipt-to-bucket",
          "no-flow-from-depends-on",
          "no-iam-nodes",
          "no-invented-services",
          "node-receipts-bucket",
        ],
      ],
      ["no planner, no plan", planWorkspace(null, "", []), names],
    ];
  if (c.name === "plan-compose-app")
    return [
      ["good plan", planWorkspace("compose-good.json"), []],
      ["good plan with the worker drawn as the consumer", planWorkspace(workerPullsPlan()), []],
      [
        "plan with the usual mistakes",
        planWorkspace("compose-bad.json"),
        [
          "edge-cache-and-worker",
          "edge-worker-to-db",
          "no-flow-from-depends-on",
          "no-invented-services",
        ],
      ],
      ["no planner, no plan", planWorkspace(null, "", []), names],
    ];
  if (c.name === "review-raises-score")
    return [
      ["patched by orrery patch", reviewWorkspace("patched"), []],
      ["left unchanged", reviewWorkspace("unchanged"), ["patch-tried", "score-raised"]],
      [
        "score raised by deleting a node",
        reviewWorkspace("dropped-node"),
        ["nodes-kept", "patch-tried"],
      ],
    ];
  return [];
}

function graders(cases) {
  for (const c of cases) {
    const list = scenarios(c);
    check(`graders: ${c.rel} has selftest scenarios`, list.length > 0);
    for (const [label, ws, expected] of list) {
      const failing = c.graders
        .filter(
          (g) =>
            !grade(g, {
              dir: ws.dir ?? temp,
              created: ws.created ?? [],
              lastMessage: ws.lastMessage ?? "",
              calls: ws.calls,
            }),
        )
        .map((g) => g.name)
        .sort();
      const want = [...expected].sort();
      check(
        `graders: ${c.name} / ${label}`,
        failing.join() === want.join(),
        `failing [${failing.join(", ")}], expected [${want.join(", ")}]`,
      );
    }
  }
}

// 3. Scripts -----------------------------------------------------------------------------------

function scripts() {
  const run = (script, args) => {
    const r = spawnSync(process.execPath, [join(evalsDir, "scripts", script), ...args], {
      encoding: "utf8",
    });
    let verdict = null;
    try {
      verdict = JSON.parse(r.stdout);
    } catch {}
    return { status: r.status, verdict };
  };
  const spec = (name) => join(evalsDir, "selftest/specs", name);
  const plan = (name) => join(evalsDir, "selftest/plans", name);
  const key = (fixture) => join(evalsDir, "fixtures", fixture, "expected.json");

  const baseline = runCli(defaultCli, [
    "review",
    BAD_SPEC,
    "--width",
    "880",
    "--json",
    "-o",
    join(temp, "baseline"),
  ]);
  check(
    `baseline: bad-spec fixture scores ${BAD_SPEC_SCORE} at 880 and fails`,
    baseline.json?.score === BAD_SPEC_SCORE && baseline.json?.pass === false,
    `measured ${baseline.json?.score} (pass ${baseline.json?.pass}); update score-raised in review-loop/review-raises-score/case.yaml, BAD_SPEC_SCORE here and evals/README.md`,
  );

  const expect = (label, r, status, extra = () => true) =>
    check(
      `script: ${label}`,
      r.status === status && extra(r.verdict),
      `exit ${r.status}: ${JSON.stringify(r.verdict?.reasons ?? r.verdict)}`,
    );

  expect("check-spec passes the good spec", run("check-spec.mjs", [spec("good.yaml")]), 0);
  expect(
    "check-spec fails the spec that validates but fails the review",
    run("check-spec.mjs", [BAD_SPEC]),
    1,
    (v) => v.validate.errors.length === 0 && v.review.pass === false,
  );
  expect(
    "check-spec fails the spec with errors",
    run("check-spec.mjs", [spec("invalid.yaml")]),
    1,
    (v) => v.validate.errors.length === 2 && v.review === null,
  );
  expect("check-spec fails a missing spec", run("check-spec.mjs", [spec("missing.yaml")]), 1);

  expect(
    "plan-recall passes the good serverless plan",
    run("plan-recall.mjs", [plan("serverless-good.json"), "--expected", key("serverless-api")]),
    0,
    (v) => v.nodes.recall === 1 && v.edges.recall === 1 && v.actors.length === 1,
  );
  expect(
    "plan-recall passes free-form ids by resolving their evidence",
    run("plan-recall.mjs", [plan("serverless-freeform.json"), "--expected", key("serverless-api")]),
    0,
    (v) => v.nodes.recall === 1 && v.edges.recall === 1,
  );
  expect(
    "plan-recall fails the bad serverless plan on every count",
    run("plan-recall.mjs", [plan("serverless-bad.json"), "--expected", key("serverless-api")]),
    1,
    (v) =>
      v.nodes.recall === 0.83 &&
      v.edges.recall === 0.6 &&
      v.edges.reversed.length === 1 &&
      v.invented.length === 1 &&
      v.inventedGroups.length === 1 &&
      v.glue.length === 1 &&
      v.forbidden.length === 1,
  );
  expect(
    "plan-recall passes the good compose plan",
    run("plan-recall.mjs", [plan("compose-good.json"), "--expected", key("compose-app")]),
    0,
    (v) => v.nodes.recall === 1 && v.edges.recall === 1,
  );
  expect(
    "plan-recall accepts either direction for the cache and worker pull",
    run("plan-recall.mjs", [workerPullsPlan(), "--expected", key("compose-app")]),
    0,
    (v) => v.edges.recall === 1 && v.edges.reversed.length === 0,
  );
  expect(
    "plan-recall fails the bad compose plan",
    run("plan-recall.mjs", [plan("compose-bad.json"), "--expected", key("compose-app")]),
    1,
    (v) => v.edges.recall === 0.6 && v.invented.length === 1 && v.forbidden.length === 1,
  );

  const patched = join(temp, "patched.yaml");
  const candidates = join(temp, "candidates.json");
  cpSync(BAD_SPEC, patched);
  writeFileSync(candidates, JSON.stringify([[{ op: "set", path: "direction", value: "down" }]]));
  runCli(defaultCli, ["patch", patched, candidates, "--width", "880", "-o", patched]);
  const dropped = join(temp, "dropped.yaml");
  writeFileSync(
    dropped,
    readFileSync(BAD_SPEC, "utf8")
      .split("\n")
      .filter((l) => !/\bkeys\b/.test(l))
      .join("\n"),
  );
  expect(
    "review-delta passes a spec orrery patch improved",
    run("review-delta.mjs", [BAD_SPEC, patched]),
    0,
    (v) => v.delta > 0,
  );
  expect("review-delta fails an unchanged spec", run("review-delta.mjs", [BAD_SPEC, BAD_SPEC]), 1);
  expect(
    "review-delta fails a higher score bought by deleting a node",
    run("review-delta.mjs", [BAD_SPEC, dropped]),
    1,
    (v) => v.delta > 0 && v.reasons.some((r) => r.startsWith("node(s) removed")),
  );
}
