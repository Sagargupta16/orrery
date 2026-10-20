// review: the measured review of a spec at the width readers see it.
import { resolve } from "node:path";
import { DEFAULT_REVIEW_WIDTH, formatReview, reviewModel } from "../review.ts";
import { parseSpec } from "../spec.ts";
import type { Skin } from "../types.ts";
import type { Args } from "./args.ts";
import { fontFiles, printDiagnostics, readSpec, renderFailure, usage, writeAtomic } from "./io.ts";

/** Measures the diagram at the width readers see it and writes <out>.review.json and .review.png. */
export async function cmdReview(args: Args) {
  const [specPath] = args._;
  if (!specPath) usage("review needs a spec file");
  const width = args.flags.width === undefined ? DEFAULT_REVIEW_WIDTH : Number(args.flags.width);
  if (!(width > 0)) usage("--width must be a positive number of px");
  const spec = readSpec(specPath);
  const parsed = parseSpec(spec.text, spec.path);
  if (!parsed.model) {
    printDiagnostics(parsed.diagnostics, false);
    process.exitCode = 1;
    return;
  }
  const theme = args.flags.theme ?? parsed.model.theme;
  if (theme !== "light" && theme !== "dark") usage("--theme must be light or dark");
  const fonts = fontFiles(args);
  const outFlag = typeof args.flags.out === "string" ? args.flags.out : undefined;
  const base = outFlag
    ? resolve(outFlag)
    : spec.path === "stdin.yaml"
      ? resolve("diagram")
      : spec.path.replace(/\.(ya?ml|json)$/i, "");
  const skin = args.flags.skin as Skin | undefined;
  let run: Awaited<ReturnType<typeof reviewModel>>;
  try {
    run = await reviewModel({
      model: skin ? { ...parsed.model, skin } : parsed.model,
      name: spec.name,
      width,
      theme,
      fonts,
      diagnostics: parsed.diagnostics,
    });
  } catch (e) {
    const failure = renderFailure(e);
    if (!failure) throw e;
    printDiagnostics([failure], false);
    process.exitCode = 1;
    return;
  }
  writeAtomic(`${base}.review.json`, `${JSON.stringify(run.report, null, 2)}\n`);
  if (run.png) writeAtomic(`${base}.review.png`, run.png);
  // A display PNG over 1568 px a side also gets a copy that fits, for reviewers that view images.
  if (run.look) writeAtomic(`${base}.review.look.png`, run.look);
  const pngs = [run.png && `${base}.review.png`, run.look && `${base}.review.look.png`].filter(
    Boolean,
  );
  if (args.flags.json === true) process.stdout.write(`${JSON.stringify(run.report, null, 2)}\n`);
  else
    process.stdout.write(
      `${formatReview(run.report)}\n\nwrote ${[`${base}.review.json`, ...pngs].join(", ")}\n`,
    );
  // The report carries the verdict; --strict turns a failing review into a failing exit code.
  process.exitCode = args.flags.strict === true && !run.report.pass ? 1 : 0;
}
