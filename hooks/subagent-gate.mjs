#!/usr/bin/env node
// Gate for the orrery agents that write a spec (diagram-author, image-importer). Their report ends
// with a line `spec: <path>`; before the agent may finish, this hook runs `validate --strict` on
// that spec and, for diagram-author, the measured review, and sends the agent back to work with the
// findings when either fails. It fires on SubagentStop (the report is the agent's last message) and
// on PreToolUse for SubagentHandback (auto mode, where the report goes through that tool and the
// last message is only closing text). It gates at most RETRIES times per agent and allows the stop
// on anything unexpected: no spec line, a missing file, a CLI error or a timeout.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX = 9000;
const RETRIES = 2;
const AGENTS = /^orrery:(diagram-author|image-importer)$/;
const cli = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "skills",
  "orrery",
  "scripts",
  "orrery.mjs",
);

const allow = () => process.exit(0);

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8") || "null");
} catch {
  allow();
}
const event = input?.hook_event_name;
if (typeof input?.agent_type !== "string" || !AGENTS.test(input.agent_type)) allow();
const report =
  event === "SubagentStop"
    ? input.last_assistant_message
    : event === "PreToolUse" && input.tool_name === "SubagentHandback"
      ? input.tool_input?.message
      : undefined;
if (typeof report !== "string") allow();

// The last `spec: <path>` line wins; quotes or backticks around the path are dropped.
const named = [...report.matchAll(/^[ \t]*spec:[ \t]*(.+?)[ \t]*$/gim)].at(-1)?.[1];
const path = named?.replace(/^[`'"]+|[`'"]+$/g, "");
if (!path || !/\.ya?ml$/i.test(path) || !existsSync(cli)) allow();
const spec = resolve(typeof input.cwd === "string" ? input.cwd : process.cwd(), path);
if (!statSync(spec, { throwIfNoEntry: false })?.isFile()) allow();

// One counter file per agent, so a spec that cannot be fixed never loops. When the counter cannot
// be kept, a stop that a stop hook already continued is allowed.
const state = join(
  tmpdir(),
  `orrery-gate-${String(input.agent_id ?? "agent").replace(/[^\w-]/g, "_")}.json`,
);
let tries;
try {
  tries = JSON.parse(readFileSync(state, "utf8")).tries;
} catch {}
if (tries === undefined && input.stop_hook_active === true) allow();
if ((tries ?? 0) >= RETRIES) allow();

const run = (args, timeout) => {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout });
  if (r.error) allow();
  try {
    return JSON.parse(r.stdout);
  } catch {
    allow();
  }
};
const cap = (s) => (s.length > MAX ? `${s.slice(0, MAX)}\n...` : s);
const lines = (list) =>
  list
    .map((d) => [`- ${d.head}`, ...(d.fixes ?? []).map((f) => `  fix: ${f}`)].join("\n"))
    .join("\n");

let problem;
const checked = run(["validate", spec, "--strict", "--json"], 25_000);
const diagnostics = checked?.diagnostics ?? [];
if (checked?.ok === false) {
  const listed = diagnostics.map((d) => ({
    head: `${d.severity} ${d.code} ${d.message}`,
    fixes: d.fixes,
  }));
  problem = `orrery validate --strict ${path} fails with ${diagnostics.length} diagnostic(s):\n${lines(listed)}`;
} else if (input.agent_type === "orrery:diagram-author") {
  // Review at the width the author reviewed at (its <base>.review.json), else a README column.
  const base = spec.replace(/\.ya?ml$/i, "");
  let width = 880;
  try {
    width = JSON.parse(readFileSync(`${base}.review.json`, "utf8")).width || 880;
  } catch {}
  const review = run(["review", spec, "--width", String(width), "--json", "-o", base], 60_000);
  if (review?.pass === false) {
    const rank = { blocker: 0, major: 1, minor: 2 };
    const findings = [...(review.findings ?? [])]
      .sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3))
      .slice(0, 12)
      .map((f) => ({ head: `${f.severity} ${f.id}: ${f.claim}`, fixes: f.fixes }));
    problem = `orrery review ${path} at ${width} px does not pass: score ${review.score} (pass needs 85 and no blocker or major finding). Top findings:\n${lines(findings)}`;
  }
}

if (!problem) {
  rmSync(state, { force: true });
  allow();
}
try {
  writeFileSync(state, JSON.stringify({ tries: (tries ?? 0) + 1 }));
} catch {}
const reason = cap(
  `${problem}\nFix the spec (change the layout or the wording, never drop what the figure lists), run validate and review again, then end your report with the line spec: ${path}. Attempt ${(tries ?? 0) + 1} of ${RETRIES}; after that you may stop and list what is left.`,
);
process.stdout.write(
  JSON.stringify(
    event === "SubagentStop"
      ? { decision: "block", reason }
      : {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: reason,
          },
        },
  ),
);
process.exit(0);
