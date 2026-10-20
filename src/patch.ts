// Spec patches (the review loop's ops) applied to the YAML text, and candidate sets tried in
// parallel: each candidate is reviewed on its own copy, and only the ones that improve are kept.
// Ops edit the source text in place, so comments, key order, quoting and the spacing of every
// line a patch does not touch stay byte for byte; yaml's parser only says where things are.
// Contract: skills/orrery/references/review/loop.md, "Patches".
//
// patch/text.ts splices the text, patch/ops.ts and patch/edges.ts turn ops into edits,
// patch/apply.ts runs a list of them, patch/candidates.ts reviews candidate sets; this file is
// the `orrery patch` command.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Args, printDiagnostics, readSpec, renderFailure, usage, writeAtomic } from "./cli.ts";
import { applyPatches, describeOp } from "./patch/apply.ts";
import {
  type CandidateRequest,
  type CandidateResult,
  type CandidateRun,
  HARD,
  HARD_KEYS,
  serious,
  tryCandidates,
} from "./patch/candidates.ts";
import { PatchError, type PatchOp } from "./patch/types.ts";
import { DEFAULT_REVIEW_WIDTH } from "./review.ts";
import { parseSpec } from "./spec.ts";
import type { Skin } from "./types.ts";

export {
  applyPatches,
  type CandidateRequest,
  type CandidateResult,
  type CandidateRun,
  describeOp,
  PatchError,
  type PatchOp,
  tryCandidates,
};

function readCandidates(path: string): PatchOp[][] {
  if (path !== "-" && !existsSync(path)) usage(`no such candidates file: ${path}`);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path === "-" ? 0 : path, "utf8"));
  } catch (e) {
    usage(`cannot read ${path === "-" ? "stdin" : path} as JSON: ${(e as Error).message}`);
  }
  const shape =
    "candidates must be a JSON array of ops, or an array of candidate sets (arrays of ops)";
  if (!Array.isArray(data) || !data.length) usage(shape);
  if (data.every(Array.isArray)) return data as PatchOp[][];
  if (data.every((x) => !Array.isArray(x))) return [data as PatchOp[]];
  usage(`${shape}; this one mixes both`);
}

function formatRun(run: CandidateRun, name: string): string {
  const b = run.before;
  const rows = run.results.map((r) => {
    const a = r.report;
    const hard = a
      ? HARD_KEYS.filter((k) => a.hard[k] !== b.hard[k])
          .map((k) => `${HARD[k]} ${b.hard[k]} -> ${a.hard[k]}`)
          .join(", ") || "none"
      : "-";
    return {
      r,
      cells: [
        String(r.index + 1),
        r.kept ? "kept" : "dropped",
        a ? `${b.score} -> ${a.score}` : "-",
        a ? `${serious(b)} -> ${serious(a)}` : "-",
        hard,
        r.ops.map(describeOp).join("; ") || "(no ops)",
      ],
    };
  });
  const head = ["#", "result", "score", "blk+maj", "hard changed", "ops"];
  const widths = head.map((h, i) =>
    Math.max(h.length, ...rows.map((x) => x.cells[i]?.length ?? 0)),
  );
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i] ?? 0)))
      .join("  ")
      .trimEnd();
  const lines = [
    `patch ${name}: ${run.results.length} candidate(s) at ${b.width}px (${b.theme}); before: score ${b.score}, ${serious(b)} blocker(s) plus major(s)`,
    "",
    line(head),
  ];
  for (const { r, cells } of rows) {
    lines.push(line(cells));
    if (!r.kept) lines.push(`${" ".repeat((widths[0] ?? 1) + 2)}${r.reason}`);
  }
  lines.push("");
  const best = run.best;
  lines.push(
    best
      ? `best: candidate ${best.index + 1}, ${best.reason} (${best.ops.map(describeOp).join("; ")})`
      : "best: none; no candidate improved the diagram",
  );
  return lines.join("\n");
}

/** `orrery patch <spec> <candidates.json|->`: tries every candidate and keeps the best. */
export async function cmdPatch(args: Args): Promise<void> {
  const [specPath, candidatesPath] = args._;
  if (!specPath || !candidatesPath)
    usage("patch needs a spec file and a candidates file (JSON, or - for stdin)");
  if (specPath === "-" && candidatesPath === "-")
    usage("only one of the spec and the candidates can come from stdin");
  const width = args.flags.width === undefined ? DEFAULT_REVIEW_WIDTH : Number(args.flags.width);
  if (!(width > 0)) usage("--width must be a positive number of px");
  const spec = readSpec(specPath);
  const candidates = readCandidates(candidatesPath);
  const parsed = parseSpec(spec.text, spec.path);
  if (!parsed.model) {
    printDiagnostics(parsed.diagnostics, false);
    process.exitCode = 1;
    return;
  }
  const theme = args.flags.theme ?? parsed.model.theme;
  if (theme !== "light" && theme !== "dark") usage("--theme must be light or dark");
  const fonts = typeof args.flags.font === "string" ? args.flags.font.split(",") : [];
  for (const f of fonts) if (!existsSync(f)) usage(`no such file: ${f} (from --font)`);
  const out = typeof args.flags.out === "string" ? resolve(args.flags.out) : undefined;
  let run: CandidateRun;
  try {
    run = await tryCandidates({
      source: spec.text,
      filename: spec.path,
      candidates,
      width,
      theme,
      skin: args.flags.skin as Skin | undefined,
      fonts,
    });
  } catch (e) {
    const failure = renderFailure(e);
    if (!failure) throw e;
    printDiagnostics([failure], false);
    process.exitCode = 1;
    return;
  }
  const best = run.best;
  if (out && best?.source !== undefined) writeAtomic(out, best.source);
  if (args.flags.json === true) process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
  else {
    const wrote = out
      ? best
        ? `\nwrote ${out}`
        : `\nnothing written to ${out}`
      : best
        ? "\nadd -o <file> to write the best patched spec"
        : "";
    process.stdout.write(`${formatRun(run, spec.name)}\n${wrote}\n`);
  }
  process.exitCode = best ? 0 : 1;
}
