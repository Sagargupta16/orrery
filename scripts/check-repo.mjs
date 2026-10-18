#!/usr/bin/env node
// Repo gate (CI runs it first): dashes, home paths, secrets, manifests, changelog, skill
// frontmatter, links, counts quoted in docs, every YAML snippet in the docs, and a gallery that
// matches what the current renderer produces.
//
//   node scripts/check-repo.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "skills/stackdraw/scripts/stackdraw.mjs");
const problems = [];
const fail = (file, msg) => problems.push(`${file}: ${msg}`);

function tracked() {
  try {
    const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  } catch {
    const walk = (dir) =>
      readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) => {
        const rel = dir ? `${dir}/${d.name}` : d.name;
        if (["node_modules", ".git", ".cache", ".scratch"].includes(d.name)) return [];
        return d.isDirectory() ? walk(rel) : [rel];
      });
    return walk("");
  }
}

const TEXT = new Set([
  ".md",
  ".mjs",
  ".js",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".yaml",
  ".yml",
  ".svg",
  ".html",
  ".txt",
  ".drawio",
  "",
]);
const files = tracked().filter((f) => existsSync(join(root, f)));

for (const f of files) {
  if (
    !TEXT.has(extname(f)) ||
    f.startsWith("skills/stackdraw/scripts/vendor/") ||
    f === "pnpm-lock.yaml"
  )
    continue;
  const text = readFileSync(join(root, f), "utf8");
  // 1. No en or em dashes anywhere (vendor data included; sync-icons normalizes it).
  const dash = text.search(/[\u2013\u2014]/);
  if (dash >= 0)
    fail(f, `en/em dash at offset ${dash}: "${text.slice(Math.max(0, dash - 20), dash + 20)}"`);
  if (f.startsWith("skills/stackdraw/assets/")) continue;
  // 2. No machine-specific paths.
  const home = text.match(/[A-Za-z]:\\Users\\|\/Users\/[a-z]|\/home\/[a-z]|C:\/Users\//);
  if (home) fail(f, `absolute home path "${home[0]}"`);
  // 3. No secrets.
  const secret = text.match(
    /AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9]{32,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  );
  if (secret) fail(f, "looks like a secret");
}

// 4. Manifests, versions, changelog.
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const f of files.filter(
  (f) => f.endsWith(".json") && !f.startsWith("skills/stackdraw/assets/icons/"),
)) {
  try {
    JSON.parse(readFileSync(join(root, f), "utf8"));
  } catch (e) {
    fail(f, `invalid JSON: ${e.message}`);
  }
}
const plugin = JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"));
const market = JSON.parse(readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8"));
if (plugin.version !== pkg.version)
  fail(".claude-plugin/plugin.json", `version ${plugin.version} != package.json ${pkg.version}`);
for (const p of market.plugins ?? []) {
  if (p.version !== pkg.version)
    fail(".claude-plugin/marketplace.json", `version ${p.version} != package.json ${pkg.version}`);
}
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const top = changelog.match(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})/m);
if (!top) fail("CHANGELOG.md", 'top entry must be "## [x.y.z] - YYYY-MM-DD"');
else if (top[1] !== pkg.version)
  fail("CHANGELOG.md", `top entry ${top[1]} != package.json ${pkg.version}`);
if (/unreleased/i.test(changelog))
  fail("CHANGELOG.md", 'no "Unreleased" sections; use a concrete version');
const skill = readFileSync(join(root, "skills/stackdraw/SKILL.md"), "utf8");
const skillVersion = skill.match(/^\s+version: "([^"]+)"/m)?.[1];
if (skillVersion !== pkg.version)
  fail("skills/stackdraw/SKILL.md", `metadata.version ${skillVersion} != ${pkg.version}`);

// 5. Skill frontmatter.
const fm = skill.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
if (!/^name: stackdraw$/m.test(fm))
  fail("skills/stackdraw/SKILL.md", "name must equal the folder name");
if (!/^description: >-$/m.test(fm))
  fail("skills/stackdraw/SKILL.md", "description must be a >- folded block");
const desc = fm.split(/^description: >-$/m)[1]?.split(/^\S/m)[0] ?? "";
if (/:\s/.test(desc)) fail("skills/stackdraw/SKILL.md", 'description must not contain ": "');
if (skill.split("\n").length > 500)
  fail("skills/stackdraw/SKILL.md", "over 500 lines; move detail to references/");

// 6. Relative links in Markdown resolve.
for (const f of files.filter((f) => f.endsWith(".md"))) {
  // Code (fenced and inline) shows example paths, not links.
  const text = readFileSync(join(root, f), "utf8")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
  for (const m of text.matchAll(/\]\(([^)\s]+)\)|(?:src|srcset|href)="([^"]+)"/g)) {
    const link = (m[1] ?? m[2] ?? "").split("#")[0];
    if (!link || /^(https?:|mailto:|data:)/.test(link)) continue;
    const target = join(dirname(join(root, f)), decodeURIComponent(link));
    // CLAUDE.md's stacking preamble points at the maintainer's workspace, outside the repo.
    if (relative(root, target).startsWith("..")) continue;
    if (!existsSync(target)) fail(f, `broken link ${link}`);
  }
}

// 7. Counts quoted in the docs match the catalogs.
const index = JSON.parse(
  readFileSync(join(root, "skills/stackdraw/assets/icons/index.json"), "utf8"),
);
const total = index.icons.length.toLocaleString("en-US");
const aliasCount = String(Object.keys(index.aliases).length);
for (const f of [
  "README.md",
  "skills/stackdraw/SKILL.md",
  "skills/stackdraw/references/icons.md",
]) {
  const text = readFileSync(join(root, f), "utf8");
  for (const m of text.matchAll(/(\d{1,2},\d{3}) icons/g))
    if (m[1] !== total) fail(f, `says ${m[1]} icons, catalogs have ${total}`);
  // Shields badges spell the comma as %2C.
  for (const m of text.matchAll(/official_icons-(\d{1,2})%2C(\d{3})-/g))
    if (`${m[1]},${m[2]}` !== total)
      fail(f, `icons badge says ${m[1]},${m[2]}, catalogs have ${total}`);
  for (const m of text.matchAll(/badge\/version-([\d.]+)-/g))
    if (m[1] !== pkg.version)
      fail(f, `version badge says ${m[1]}, package.json has ${pkg.version}`);
  for (const m of text.matchAll(/(\d{3}) (?:short names|aliases)/g))
    if (m[1] !== aliasCount) fail(f, `says ${m[1]} aliases, catalogs have ${aliasCount}`);
  for (const [pack, info] of Object.entries(index.packs)) {
    const re = new RegExp(`\\| \`${pack}\` \\| ([\\d,]+) \\|`);
    const m = text.match(re);
    if (m && m[1].replace(/,/g, "") !== String(info.count))
      fail(f, `table says ${pack} has ${m[1]}, catalog has ${info.count}`);
  }
}

// The README art quotes counts too: the whole catalog, or the sets that load from npm.
const libTotal = Object.values(index.packs)
  .filter((p) => p.lib)
  .reduce((n, p) => n + p.count, 0)
  .toLocaleString("en-US");
for (const f of files.filter((f) => /^docs\/.*\.ya?ml$/.test(f))) {
  const text = readFileSync(join(root, f), "utf8");
  for (const m of text.matchAll(/(\d{1,2},\d{3}) (?:icons|more)/g))
    if (m[1] !== total && m[1] !== libTotal)
      fail(f, `says ${m[1]}, catalogs have ${total} (${libTotal} from npm libraries)`);
}

// 8. Every YAML snippet with nodes in the docs is a valid spec.
const tmp = mkdtempSync(join(tmpdir(), "sdw-check-"));
const validate = (yaml, label) => {
  const file = join(tmp, "snippet.yaml");
  writeFileSync(file, yaml);
  const r = spawnSync(process.execPath, [cli, "validate", file, "--json"], { encoding: "utf8" });
  if (r.status !== 0) {
    let detail = r.stderr || r.stdout;
    try {
      detail = JSON.parse(r.stdout)
        .diagnostics.filter((d) => d.severity === "error")
        .map((d) => d.message)
        .join("; ");
    } catch {}
    fail(label, `spec snippet does not validate: ${detail.trim().slice(0, 300)}`);
  }
};
for (const f of files.filter((f) => f.endsWith(".md"))) {
  const text = readFileSync(join(root, f), "utf8");
  let i = 0;
  for (const m of text.matchAll(/```ya?ml\n([\s\S]*?)```/g)) {
    i += 1;
    if (/^nodes:/m.test(m[1])) validate(m[1], `${f} (yaml block ${i})`);
  }
}

// 9. Every committed render matches the current renderer (examples/ and docs/).
const gallery = spawnSync(process.execPath, [join(root, "scripts/gallery.mjs"), "--check"], {
  encoding: "utf8",
});
if (gallery.status !== 0) {
  for (const line of (gallery.stderr || gallery.stdout).trim().split("\n")) fail("gallery", line);
}
const examples = readdirSync(join(root, "skills/stackdraw/examples")).filter((f) =>
  /\.ya?ml$/.test(f),
);
rmSync(tmp, { recursive: true, force: true });

if (problems.length) {
  console.error(`${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`repo checks passed (${files.length} files, ${examples.length} examples)`);
