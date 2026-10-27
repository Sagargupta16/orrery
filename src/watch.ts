// Re-renders a spec (and its local icon files) every time one is saved.
//
// Each watched file has its own fs.watch handle, so writes to the outputs (even next to the spec)
// never trigger a run. Editors that save by renaming a temp file over the original replace the
// watched file and kill its handle, so a rename re-arms the watch.
import { existsSync, type FSWatcher, statSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Args } from "./cli/args.ts";
import {
  fontFiles,
  printDiagnostics,
  readSpec,
  renderFailure,
  usage,
  writeAtomic,
} from "./cli/io.ts";
import { shownPath } from "./icons/local/index.ts";
import { FORMATS, type Format, formatOf, renderModel } from "./render/index.ts";
import { DEFAULT_REVIEW_WIDTH, formatReview, reviewModel } from "./review/index.ts";
import { parseSpec } from "./spec/index.ts";
import { includedFiles } from "./spec/reuse.ts";
import { isObj, parseText, readText } from "./spec/values.ts";
import type { AnimateMode, Diagnostic, Skin, ThemeName } from "./types.ts";

const DEBOUNCE_MS = 120;
const REARM_MS = 50;
/** Re-arm attempts while a rename-style save has the path missing for a moment. */
const RETRIES = 20;

interface WatchOptions {
  spec: ReturnType<typeof readSpec>;
  /** light, dark or both; undefined renders the spec's own theme. */
  theme?: string;
  fonts: string[];
  formats: Format[];
  /** Output path without extension, as render names it. */
  base: string;
  scale: number;
  animate?: AnimateMode;
  skin?: Skin;
  width: number;
  review: boolean;
}

/** The command line, checked in order; a bad flag exits with usage before anything is watched. */
function watchOptions(args: Args): WatchOptions {
  const [specPath] = args._;
  if (!specPath) usage("watch needs a spec file");
  if (specPath === "-") usage("watch needs a spec file it can watch, not stdin");
  const spec = readSpec(specPath);
  const themeFlag = args.flags.theme === undefined ? undefined : String(args.flags.theme);
  if (themeFlag !== undefined && !["light", "dark", "both"].includes(themeFlag))
    usage("--theme must be light, dark or both");
  const fonts = fontFiles(args);

  // Output path and formats, as render names them.
  const outFlag = typeof args.flags.out === "string" ? args.flags.out : undefined;
  const fmtFlag = typeof args.flags.format === "string" ? args.flags.format : undefined;
  const outFormat = outFlag ? formatOf(outFlag) : undefined;
  let formats: Format[] = outFormat ? [outFormat] : ["svg", "png"];
  if (fmtFlag) {
    formats =
      fmtFlag === "all" ? [...FORMATS] : (fmtFlag.split(",").map((f) => f.trim()) as Format[]);
    for (const f of formats)
      if (!FORMATS.includes(f)) usage(`unknown format "${f}" (use ${FORMATS.join(", ")} or all)`);
  }
  let base: string;
  if (!outFlag) base = spec.path.replace(/\.(ya?ml|json)$/i, "");
  else if (/[/\\]$/.test(outFlag) || (existsSync(outFlag) && statSync(outFlag).isDirectory()))
    base = join(resolve(outFlag), spec.name);
  else base = resolve(outFormat ? outFlag.slice(0, -(outFormat.length + 1)) : outFlag);

  const scale = args.flags.scale !== undefined ? Number(args.flags.scale) : 3;
  if (!(scale > 0 && scale <= 8)) usage("--scale must be between 0 and 8");
  const animate = (
    args.flags.static === true
      ? "none"
      : args.flags.animate === true
        ? "packets"
        : args.flags.animate
  ) as AnimateMode | undefined;
  const skin = args.flags.skin as Skin | undefined;
  const width = args.flags.width === undefined ? DEFAULT_REVIEW_WIDTH : Number(args.flags.width);
  if (!(width >= 1)) usage("--width must be a number of px, at least 1");
  const review = args.flags.review === true;
  return { spec, theme: themeFlag, fonts, formats, base, scale, animate, skin, width, review };
}

/** What one run found and wrote. */
interface Run {
  diagnostics: Diagnostic[];
  outputs: { path: string; bytes: number }[];
  /** The score and pass line of `orrery review`, with --review. */
  score?: string;
}

/** Parses the spec as saved now, writes every output, and reviews it when asked. */
async function renderSpec(
  opts: WatchOptions,
  run: Run,
  written: Set<string>,
  follow: (files: string[]) => void,
): Promise<void> {
  const { spec, formats, base, scale, fonts, animate, skin, width } = opts;
  const text = readText(spec.path);
  const parsed = parseSpec(text, spec.path);
  run.diagnostics.push(...parsed.diagnostics);
  // The spec, its local icons and every spec it includes: a save to any of them re-renders. Also
  // after a failed run, whose fix may be in one of them; text that does not parse keeps the set.
  let raw: unknown;
  try {
    raw = parseText(text, spec.path);
  } catch {
    raw = undefined;
  }
  if (isObj(raw)) {
    const icons = isObj(raw.icons) ? Object.values(raw.icons) : [];
    const iconFiles = icons.flatMap((v) =>
      typeof v === "string" ? [resolve(dirname(spec.path), v.trim())] : [],
    );
    follow([spec.path, ...iconFiles.filter(existsSync), ...includedFiles(raw, spec.path)]);
  }
  if (!parsed.model || run.diagnostics.some((d) => d.severity === "error")) return;
  const theme = opts.theme ?? parsed.model.theme;
  const themes: ThemeName[] = theme === "both" ? ["light", "dark"] : [theme as ThemeName];
  const result = await renderModel({
    model: parsed.model,
    formats,
    themes,
    name: spec.name,
    scale,
    fonts,
    animate,
    skin,
    source: text,
  });
  run.diagnostics.push(...result.diagnostics);
  for (const a of result.artifacts) {
    const suffix = themes.length > 1 && a.format !== "html" ? `-${a.theme}` : "";
    const path = `${base}${suffix}.${a.format}`;
    written.add(path);
    writeAtomic(path, a.data);
    run.outputs.push({
      path,
      bytes: typeof a.data === "string" ? Buffer.byteLength(a.data) : a.data.length,
    });
  }
  if (opts.review) {
    const reviewed = await reviewModel({
      model: skin ? { ...parsed.model, skin } : parsed.model,
      name: spec.name,
      width,
      theme: themes[0],
      fonts,
      diagnostics: parsed.diagnostics,
      png: false,
    });
    // The score and pass line of `orrery review`.
    run.score = formatReview(reviewed.report).split("\n")[1];
  }
}

/** One run, reported in one line; a broken spec is reported and the watch goes on. */
async function renderOnce(
  opts: WatchOptions,
  written: Set<string>,
  follow: (files: string[]) => void,
): Promise<void> {
  const started = performance.now();
  const run: Run = { diagnostics: [], outputs: [] };
  let crashed = false;
  try {
    await renderSpec(opts, run, written, follow);
  } catch (e) {
    const failure = renderFailure(e);
    if (failure) run.diagnostics.push(failure);
    else {
      crashed = true;
      process.stderr.write(`error ${(e as Error)?.message ?? e}\n`);
    }
  }
  const { diagnostics, outputs, score } = run;
  printDiagnostics(diagnostics, false);
  const errors = diagnostics.filter((d) => d.severity === "error").length + (crashed ? 1 : 0);
  const warnings = diagnostics.filter((d) => d.severity !== "error").length;
  const counts = `${errors} error(s), ${warnings} warning(s)`;
  const ms = Math.round(performance.now() - started);
  const bytes = outputs.reduce((s, o) => s + o.bytes, 0);
  const time = new Date().toTimeString().slice(0, 8);
  process.stdout.write(
    outputs.length
      ? `${time} wrote ${outputs.map((o) => shownPath(o.path)).join(", ")} (${(bytes / 1024).toFixed(1)} KB) in ${ms} ms; ${counts}\n`
      : `${time} failed in ${ms} ms: ${counts}; still watching\n`,
  );
  if (score) process.stdout.write(`         ${score}\n`);
}

/** `job` one at a time; calls that land while it runs queue exactly one more run. */
function serialized(job: () => Promise<void>): () => Promise<void> {
  let busy = false;
  let again = false;
  const rerender = async (): Promise<void> => {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    await job();
    busy = false;
    if (again) {
      again = false;
      await rerender();
    }
  };
  return rerender;
}

/** One fs.watch handle per followed file; a change to a file this watch wrote is ignored. */
function fileWatcher(written: Set<string>, changed: () => void) {
  /** The watched files; a file's handle is undefined while it is being re-armed. */
  const watched = new Map<string, FSWatcher | undefined>();
  const arm = (file: string, retries = RETRIES): void => {
    if (!watched.has(file)) return;
    let watcher: FSWatcher;
    try {
      watcher = watch(file);
    } catch {
      if (retries > 0) setTimeout(() => arm(file, retries - 1), REARM_MS);
      else {
        watched.delete(file);
        process.stderr.write(`stopped watching ${shownPath(file)}: it no longer exists\n`);
      }
      return;
    }
    watched.set(file, watcher);
    const rearm = (left: number) => {
      watcher.close();
      if (watched.get(file) !== watcher) return;
      watched.set(file, undefined);
      setTimeout(() => arm(file, left), REARM_MS);
    };
    watcher.on("change", (event) => {
      if (!written.has(file)) changed();
      if (event === "rename") rearm(RETRIES);
    });
    watcher.on("error", () => rearm(retries - 1));
  };
  /** Watches exactly these files: the spec and the icon files its last good parse names. */
  const follow = (files: string[]) => {
    const next = new Set(files);
    for (const [file, watcher] of watched) {
      if (next.has(file)) continue;
      watcher?.close();
      watched.delete(file);
    }
    for (const file of next) {
      if (watched.has(file)) continue;
      watched.set(file, undefined);
      arm(file);
    }
  };
  const close = () => {
    for (const watcher of watched.values()) watcher?.close();
  };
  return { follow, close };
}

export async function cmdWatch(args: Args): Promise<void> {
  const opts = watchOptions(args);
  /** Every file this watch has written; a change to one of them is never a reason to render. */
  const written = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(rerender, DEBOUNCE_MS);
  };
  const files = fileWatcher(written, changed);
  // One render at a time; saves that land during a render queue exactly one more.
  const rerender = serialized(() => renderOnce(opts, written, files.follow));

  const stop = () => {
    files.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  process.stdout.write(`watching ${shownPath(opts.spec.path)}; Ctrl-C to stop\n`);
  files.follow([opts.spec.path]);
  await rerender();
}
