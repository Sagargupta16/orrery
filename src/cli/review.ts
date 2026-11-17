// review: the measured review of a spec at the width readers see it.
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_REVIEW_WIDTH,
  formatReview,
  type ReviewReport,
  reviewModel,
} from "../review/index.ts";
import { parseSpec } from "../spec/index.ts";
import type { Skin } from "../types.ts";
import { viewsOf } from "../views.ts";
import type { Args } from "./args.ts";
import {
  fontFiles,
  inFolder,
  printDiagnostics,
  readSpec,
  renderFailure,
  sha,
  usage,
  writeAtomic,
} from "./io.ts";

/** The narrowest display width worth reviewing; the MCP review tool takes the same floor. */
const MIN_WIDTH = 200;

/** Measures the diagram at the width readers see it, writing <out>.review.json and .review.png. */
export async function cmdReview(args: Args) {
  const [specPath, ...extra] = args._;
  if (!specPath) usage("review needs a spec file");
  if (extra.length) usage("review takes one spec file at a time");
  const width = args.flags.width === undefined ? DEFAULT_REVIEW_WIDTH : Number(args.flags.width);
  // The display PNG is drawn at this width, and resvg refuses one that rounds to under 1 px.
  if (!(width >= MIN_WIDTH)) usage(`--width must be a number of px, at least ${MIN_WIDTH}`);
  const json = args.flags.json === true;
  const spec = readSpec(specPath);
  const parsed = parseSpec(spec.text, spec.path);
  if (!parsed.model) {
    printDiagnostics(parsed.diagnostics, json);
    if (json) {
      const failed = { ok: false, spec: { path: spec.path, sha256: sha(spec.text) } };
      process.stdout.write(
        `${JSON.stringify({ ...failed, diagnostics: parsed.diagnostics }, null, 2)}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }
  const theme = args.flags.theme ?? parsed.model.theme;
  if (theme !== "light" && theme !== "dark") usage("--theme must be light or dark");
  const fonts = fontFiles(args);
  const outFlag = typeof args.flags.out === "string" ? args.flags.out : undefined;
  const base = outFlag
    ? (inFolder(outFlag, spec.name) ?? resolve(outFlag))
    : spec.path === "stdin.yaml"
      ? resolve("diagram")
      : spec.path.replace(/\.(ya?ml|json)$/i, "");
  const skin = args.flags.skin as Skin | undefined;
  // The whole diagram, or with --view one named view (or every view with all), as render does.
  const views = viewsOf(parsed.model, args.flags.view);
  const reports: ReviewReport[] = [];
  const texts: string[] = [];
  for (const view of views) {
    const viewBase = view.name ? `${base}.${view.name}` : base;
    let run: Awaited<ReturnType<typeof reviewModel>>;
    try {
      run = await reviewModel({
        model: skin ? { ...view.model, skin } : view.model,
        name: view.name ? `${spec.name}.${view.name}` : spec.name,
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
    writeAtomic(`${viewBase}.review.json`, `${JSON.stringify(run.report, null, 2)}\n`);
    if (run.png) writeAtomic(`${viewBase}.review.png`, run.png);
    // A display PNG over 1568 px a side also gets a copy that fits, for reviewers that view
    // images; without one, an earlier review's copy goes, so nobody looks at the old picture.
    if (run.look) writeAtomic(`${viewBase}.review.look.png`, run.look);
    else rmSync(`${viewBase}.review.look.png`, { force: true });
    const pngs = [run.png && `${viewBase}.review.png`, run.look && `${viewBase}.review.look.png`];
    reports.push(run.report);
    texts.push(
      `${view.name ? `view ${view.name}\n` : ""}${formatReview(run.report)}\n\nwrote ${[`${viewBase}.review.json`, ...pngs.filter(Boolean)].join(", ")}\n`,
    );
  }
  if (json)
    process.stdout.write(`${JSON.stringify(reports.length > 1 ? reports : reports[0], null, 2)}\n`);
  else process.stdout.write(texts.join("\n"));
  // The report carries the verdict; --strict turns a failing review into a failing exit code.
  process.exitCode = args.flags.strict === true && reports.some((r) => !r.pass) ? 1 : 0;
}
