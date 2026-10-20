// Re-renders a spec (and its local icon files) every time one is saved.
//
// Each watched file has its own fs.watch handle, so writes to the outputs (even next to the spec)
// never trigger a run. Editors that save by renaming a temp file over the original replace the
// watched file and kill its handle, so a rename re-arms the watch.
import { existsSync, type FSWatcher, readFileSync, statSync, watch } from "node:fs";
import { join, resolve } from "node:path";
import { type Args, printDiagnostics, readSpec, renderFailure, usage, writeAtomic } from "./cli.ts";
import { shownPath } from "./local-icons.ts";
import { FORMATS, type Format, formatOf, renderModel } from "./render/index.ts";
import { DEFAULT_REVIEW_WIDTH, formatReview, reviewModel } from "./review.ts";
import { parseSpec } from "./spec.ts";
import type { AnimateMode, Diagnostic, Skin, ThemeName } from "./types.ts";

const DEBOUNCE_MS = 120;
const REARM_MS = 50;
/** Re-arm attempts while a rename-style save has the path missing for a moment. */
const RETRIES = 20;

export async function cmdWatch(args: Args): Promise<void> {
  const [specPath] = args._;
  if (!specPath) usage("watch needs a spec file");
  if (specPath === "-") usage("watch needs a spec file it can watch, not stdin");
  const spec = readSpec(specPath);
  const themeFlag = args.flags.theme === undefined ? undefined : String(args.flags.theme);
  if (themeFlag !== undefined && !["light", "dark", "both"].includes(themeFlag))
    usage("--theme must be light, dark or both");
  const fonts = typeof args.flags.font === "string" ? args.flags.font.split(",") : [];
  for (const f of fonts) if (!existsSync(f)) usage(`no such file: ${f} (from --font)`);

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
  if (!(width > 0)) usage("--width must be a positive number of px");
  const review = args.flags.review === true;

  /** Every file this watch has written; a change to one of them is never a reason to render. */
  const written = new Set<string>();

  async function renderOnce(): Promise<void> {
    const started = performance.now();
    const diagnostics: Diagnostic[] = [];
    const outputs: { path: string; bytes: number }[] = [];
    let crashed = false;
    let score: string | undefined;
    try {
      const parsed = parseSpec(readFileSync(spec.path, "utf8"), spec.path);
      diagnostics.push(...parsed.diagnostics);
      if (parsed.model && !diagnostics.some((d) => d.severity === "error")) {
        follow([spec.path, ...(parsed.model.icons ?? []).map((i) => i.path)]);
        const theme = themeFlag ?? parsed.model.theme;
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
        });
        diagnostics.push(...result.diagnostics);
        for (const a of result.artifacts) {
          const suffix = themes.length > 1 && a.format !== "html" ? `-${a.theme}` : "";
          const path = `${base}${suffix}.${a.format}`;
          written.add(path);
          writeAtomic(path, a.data);
          outputs.push({
            path,
            bytes: typeof a.data === "string" ? Buffer.byteLength(a.data) : a.data.length,
          });
        }
        if (review) {
          const run = await reviewModel({
            model: skin ? { ...parsed.model, skin } : parsed.model,
            name: spec.name,
            width,
            theme: themes[0],
            fonts,
            diagnostics: parsed.diagnostics,
            png: false,
          });
          // The score and pass line of `orrery review`.
          score = formatReview(run.report).split("\n")[1];
        }
      }
    } catch (e) {
      const failure = renderFailure(e);
      if (failure) diagnostics.push(failure);
      else {
        crashed = true;
        process.stderr.write(`error ${(e as Error)?.message ?? e}\n`);
      }
    }
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

  // One render at a time; saves that land during a render queue exactly one more.
  let busy = false;
  let again = false;
  const rerender = async (): Promise<void> => {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    await renderOnce();
    busy = false;
    if (again) {
      again = false;
      await rerender();
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(rerender, DEBOUNCE_MS);
  };

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

  const stop = () => {
    for (const watcher of watched.values()) watcher?.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  process.stdout.write(`watching ${shownPath(spec.path)}; Ctrl-C to stop\n`);
  follow([spec.path]);
  await rerender();
}
