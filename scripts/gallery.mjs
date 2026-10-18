#!/usr/bin/env node
// Every rendered file the repo commits comes from here: the examples gallery (examples/) and the
// README art (docs/). SVGs are animated (the default); PNGs are still frames. `--check` renders into a temporary folder and fails when a committed file
// differs, so the pictures always match the current renderer.
//
//   node scripts/gallery.mjs           re-render everything
//   node scripts/gallery.mjs --check   verify (CI, scripts/check-repo.mjs)
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "skills/orrery/scripts/orrery.mjs");
const examplesDir = join(root, "skills/orrery/examples");
const check = process.argv.includes("--check");

/** [spec, output base relative to the root, extra CLI args, files the render writes] */
function jobs() {
  const list = [];
  for (const f of readdirSync(examplesDir)
    .filter((x) => /\.ya?ml$/.test(x))
    .sort()) {
    const name = f.replace(/\.ya?ml$/, "");
    const theme = /^theme: dark/m.test(readFileSync(join(examplesDir, f), "utf8"))
      ? "dark"
      : "light";
    list.push({
      spec: join(examplesDir, f),
      base: `examples/${name}`,
      args: ["-f", "svg,png", "--theme", theme, "--scale", "2"],
      files: [`examples/${name}.svg`, `examples/${name}.png`],
    });
  }
  list.push({
    spec: join(root, "docs/hero.yaml"),
    base: "docs/hero",
    args: ["-f", "svg", "--theme", "both"],
    files: ["docs/hero-light.svg", "docs/hero-dark.svg"],
  });
  list.push({
    spec: join(root, "docs/how-it-works.yaml"),
    base: "docs/how-it-works",
    args: ["-f", "svg", "--theme", "both"],
    files: ["docs/how-it-works-light.svg", "docs/how-it-works-dark.svg"],
  });
  return list;
}

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const tmp = check ? mkdtempSync(join(tmpdir(), "sdw-gallery-")) : undefined;
const problems = [];

for (const job of jobs()) {
  const base = tmp ? join(tmp, job.base) : join(root, job.base);
  const r = spawnSync(process.execPath, [cli, "render", job.spec, "-o", base, ...job.args], {
    encoding: "utf8",
  });
  const label = relative(root, job.spec).replaceAll("\\", "/");
  if (r.status !== 0) {
    problems.push(`${label}: does not render: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
    continue;
  }
  if (!check) {
    console.log(`${label.padEnd(56)} ${r.stdout.trim().split("\n").pop()}`);
    continue;
  }
  for (const file of job.files) {
    const committed = join(root, file);
    const fresh = join(tmp, file);
    if (!existsSync(committed)) problems.push(`${file}: missing; run pnpm gallery`);
    else if (!existsSync(fresh)) problems.push(`${file}: render wrote no such file`);
    else if (sha(committed) !== sha(fresh)) problems.push(`${file}: stale; run pnpm gallery`);
  }
}
if (tmp) rmSync(tmp, { recursive: true, force: true });
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
if (check) console.log(`gallery current (${jobs().length} renders)`);
