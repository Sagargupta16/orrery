#!/usr/bin/env node
// Grader for the draw suite: a drawn spec passes when `orrery validate` reports no errors (and no
// warnings with --strict) and `orrery review` at the display width passes (score >= 85 with no
// blocker or major finding). Runs the bundled CLI, so the verdict never trusts the agent's report.
//
//   node evals/scripts/check-spec.mjs <spec.yaml> [--width 880] [--strict] [--cli <orrery.mjs>]
//
// Prints a JSON verdict; exit 0 pass, 1 fail, 2 usage.
import { existsSync } from "node:fs";
import { defaultCli, finish, parseArgs, review, runCli, summarize, usage } from "./lib.mjs";

const { positionals, flags } = parseArgs(process.argv.slice(2), ["strict"]);
const [spec] = positionals;
if (!spec) usage("check-spec.mjs <spec.yaml> [--width 880] [--strict] [--cli <orrery.mjs>]");
const width = Number(flags.width ?? 880);
const cli = flags.cli ?? defaultCli;
const reasons = [];
if (!existsSync(spec)) finish({ spec, pass: false, reasons: [`no spec at ${spec}`] });

const v = runCli(cli, ["validate", spec, "--json"]);
const diagnostics = v.json?.diagnostics ?? [];
const errors = diagnostics.filter((d) => d.severity === "error");
const warnings = diagnostics.filter((d) => d.severity !== "error");
if (!v.json)
  reasons.push(`validate printed no JSON (exit ${v.status}): ${v.stderr.trim().slice(0, 300)}`);
if (errors.length)
  reasons.push(`${errors.length} validate error(s): ${errors.map((d) => d.code).join(", ")}`);
if (flags.strict && warnings.length)
  reasons.push(
    `${warnings.length} validate warning(s) under --strict: ${warnings.map((d) => d.code).join(", ")}`,
  );

let measured = null;
if (v.json && !errors.length) {
  const r = review(cli, spec, width);
  if (!r.json)
    reasons.push(`review printed no JSON (exit ${r.status}): ${r.stderr.trim().slice(0, 300)}`);
  else {
    measured = summarize(r.json);
    if (!measured.pass)
      reasons.push(
        `review fails at ${width}px: score ${measured.score}, ${measured.blocking} blocker or major finding(s)`,
      );
  }
}

finish({
  spec,
  width,
  validate: { errors: errors.map((d) => `${d.code} ${d.message}`), warnings: warnings.length },
  review: measured && {
    score: measured.score,
    pass: measured.pass,
    blocking: measured.blocking,
    hard: measured.hard,
  },
  pass: reasons.length === 0,
  reasons,
});
