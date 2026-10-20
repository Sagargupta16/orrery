// doctor and demo: check the install end to end, and render every template as a smoke test.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { packInfo } from "../icons.ts";
import { LibraryError, librarySource } from "../libraries.ts";
import { examplesDir, skillRoot } from "../paths.ts";
import { renderModel } from "../render/index.ts";
import { parseSpec } from "../spec.ts";
import type { Args } from "./args.ts";
import { renderFailure, writeAtomic } from "./io.ts";
import { templates } from "./templates.ts";

export async function cmdDoctor() {
  const checks: [string, boolean, string][] = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push(["node >= 22", major >= 22, process.versions.node]);
  const packs = packInfo();
  const total = Object.values(packs).reduce((s, p) => s + p.count, 0);
  checks.push([
    "icon catalogs",
    total > 1000,
    `${total} icons in ${Object.keys(packs).length} packs`,
  ]);
  const missing = Object.keys(packs).filter(
    (p) => !packs[p]?.lib && !existsSync(join(skillRoot, "assets", "icons", `${p}.json`)),
  );
  checks.push([
    "bundled icon packs",
    !missing.length,
    missing.length ? `missing ${missing.join(", ")}` : "all present",
  ]);
  const libs = Object.values(packs).flatMap((p) => (p.lib ? [p.lib] : []));
  const ready = libs.filter((lib) => librarySource(lib)).length;
  checks.push([
    "icon libraries",
    true,
    `${ready}/${libs.length} available offline${ready < libs.length ? "; the rest download on first use (icons fetch)" : ""}`,
  ]);
  try {
    const parsed = parseSpec(
      "nodes:\n  a: { icon: aws:lambda }\n  b: { icon: generic:database }\nedges:\n  - a -> b\n",
      "doctor.yaml",
    );
    if (!parsed.model) throw new Error(parsed.diagnostics.map((d) => d.message).join("; "));
    const r = await renderModel({
      model: parsed.model,
      formats: ["svg", "png"],
      themes: ["light"],
      name: "doctor",
    });
    const png = r.artifacts.find((a) => a.format === "png");
    checks.push(["layout (ELK)", true, `${r.scenes.light?.width}x${r.scenes.light?.height}`]);
    checks.push([
      "PNG (resvg wasm + Inter)",
      !!png && png.data.length > 1000,
      `${png?.data.length ?? 0} bytes`,
    ]);
  } catch (e) {
    checks.push(["render", false, (e as Error).message]);
  }
  for (const [name, pass, detail] of checks)
    process.stdout.write(`${pass ? "ok  " : "FAIL"} ${name.padEnd(26)} ${detail}\n`);
  process.exitCode = checks.every(([, p]) => p) ? 0 : 1;
}

export async function cmdDemo(args: Args) {
  const dir = resolve(args._[0] ?? "orrery-demo");
  let failed = 0;
  let libraryFixes: string[] | undefined;
  for (const t of templates()) {
    const file = join(examplesDir, `${t}.yaml`);
    // The full path: a template's icons: files resolve against its folder.
    const parsed = parseSpec(readFileSync(file, "utf8"), file);
    if (!parsed.model) {
      failed += 1;
      process.stderr.write(`${t}: ${parsed.diagnostics.map((d) => d.message).join("; ")}\n`);
      continue;
    }
    let r: Awaited<ReturnType<typeof renderModel>>;
    try {
      r = await renderModel({
        model: parsed.model,
        formats: ["svg", "png"],
        themes: [parsed.model.theme],
        name: t,
      });
    } catch (e) {
      // Offline, a template that needs an npm icon library fails alone; the rest still render.
      const failure = renderFailure(e);
      if (!failure) throw e;
      failed += 1;
      if (e instanceof LibraryError) libraryFixes ??= e.fixes;
      process.stderr.write(`${t}: error ${failure.code} ${failure.message}\n`);
      continue;
    }
    for (const a of r.artifacts) writeAtomic(join(dir, `${t}.${a.format}`), a.data);
    const scene = r.scenes[parsed.model.theme];
    process.stdout.write(`${t}: ${scene?.width}x${scene?.height}\n`);
  }
  for (const fix of libraryFixes ?? []) process.stderr.write(`      fix: ${fix}\n`);
  process.stdout.write(`wrote ${dir}\n`);
  process.exitCode = failed ? 1 : 0;
}
