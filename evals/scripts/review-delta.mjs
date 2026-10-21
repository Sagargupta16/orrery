#!/usr/bin/env node
// Grader for the review-loop suite: the loop's output passes when, measured at the same width,
// the score went up, no hard count went up, blockers plus majors did not go up and no node was
// removed. That is the ratchet in skills/orrery/references/review/loop.md, checked from outside.
//
//   node evals/scripts/review-delta.mjs <before.yaml> <after.yaml> [--width 880] [--cli <orrery.mjs>]
//
// Prints a JSON verdict; exit 0 pass, 1 fail, 2 usage.
import { defaultCli, finish, parseArgs, review, summarize, usage } from "./lib.mjs";

const { positionals, flags } = parseArgs(process.argv.slice(2));
const [beforePath, afterPath] = positionals;
if (!beforePath || !afterPath)
  usage("review-delta.mjs <before.yaml> <after.yaml> [--width 880] [--cli <orrery.mjs>]");
const width = Number(flags.width ?? 880);
const cli = flags.cli ?? defaultCli;

const measure = (path) => {
  const r = review(cli, path, width);
  return r.json ? summarize(r.json) : { error: `review printed no JSON (exit ${r.status})` };
};
const before = measure(beforePath);
const after = measure(afterPath);
const reasons = [];
if (before.error) reasons.push(`before: ${before.error}`);
if (after.error) reasons.push(`after: ${after.error}`);
if (!before.error && !after.error) {
  if (!(after.score > before.score))
    reasons.push(`score did not go up: ${before.score} -> ${after.score}`);
  for (const [key, value] of Object.entries(after.hard))
    if (value > (before.hard[key] ?? 0))
      reasons.push(`hard count ${key} went up: ${before.hard[key]} -> ${value}`);
  if (after.blocking > before.blocking)
    reasons.push(`blockers plus majors went up: ${before.blocking} -> ${after.blocking}`);
  const removed = before.nodes.filter((id) => !after.nodes.includes(id));
  if (removed.length) reasons.push(`node(s) removed: ${removed.join(", ")}`);
}

const brief = (m) =>
  m.error ? m : { score: m.score, pass: m.pass, blocking: m.blocking, hard: m.hard };
finish({
  width,
  before: { spec: beforePath, ...brief(before) },
  after: { spec: afterPath, ...brief(after) },
  delta: before.error || after.error ? null : Math.round((after.score - before.score) * 10) / 10,
  pass: reasons.length === 0,
  reasons,
});
