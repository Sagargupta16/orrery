#!/usr/bin/env node
// PostToolUse hook: after Write or Edit, validates the file when it is an orrery spec. Errors go
// back to Claude on stderr with exit 2 (the write already happened, so this informs, it cannot
// block); warnings come back as additional context; any other file passes through untouched.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX = 9000;
const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "orrery", "scripts", "orrery.mjs");

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}
// The payload can be any JSON value (null included), and a folder can end in .yaml.
const file = input?.tool_input?.file_path;
if (
  typeof file !== "string" ||
  !/\.ya?ml$/i.test(file) ||
  !statSync(file, { throwIfNoEntry: false })?.isFile()
)
  process.exit(0);

// An orrery spec has a top-level nodes: mapping and none of the keys that mark the YAML files a
// repository usually holds (Kubernetes, Compose, workflows, CloudFormation, Helm values).
const text = readFileSync(file, "utf8");
const isSpec =
  /^nodes:/m.test(text) &&
  !/^(apiVersion|kind: (Deployment|Service)|services|on|jobs|Resources|AWSTemplateFormatVersion):/m.test(
    text,
  );
if (!isSpec || !existsSync(cli)) process.exit(0);

const r = spawnSync(process.execPath, [cli, "validate", file, "--json"], {
  encoding: "utf8",
  timeout: 25_000,
});
// A killed validate prints nothing, which would otherwise read as a clean pass.
if (r.error?.code === "ETIMEDOUT") {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `orrery validate timed out after 25 s; run orrery validate ${file}`,
      },
    }),
  );
  process.exit(0);
}
let diagnostics = [];
try {
  const out = JSON.parse(r.stdout || "{}");
  diagnostics = Array.isArray(out) ? out : (out.diagnostics ?? []);
} catch {
  process.exit(0);
}
const line = (d) =>
  [`${d.severity} ${d.code} ${d.message}`, ...(d.fixes ?? []).map((f) => `  fix: ${f}`)].join("\n");
const errors = diagnostics.filter((d) => d.severity === "error");
const warnings = diagnostics.filter((d) => d.severity !== "error");
const cap = (s) => (s.length > MAX ? `${s.slice(0, MAX)}\n...` : s);

if (errors.length) {
  process.stderr.write(
    cap(
      `orrery validate ${file}: ${errors.length} error(s), ${warnings.length} warning(s). Fix them before rendering:\n${[...errors, ...warnings].map(line).join("\n")}\n`,
    ),
  );
  process.exit(2);
}
if (warnings.length) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: cap(
          `orrery validate ${file}: ${warnings.length} warning(s):\n${warnings.map(line).join("\n")}`,
        ),
      },
    }),
  );
}
process.exit(0);
