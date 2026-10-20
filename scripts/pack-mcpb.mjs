#!/usr/bin/env node
// Builds the MCP Bundle out/orrery-<version>.mcpb that Claude Desktop and other MCPB hosts install
// in one click: the skill folder as it ships (the bundled CLI finds its assets by walking up from
// scripts/, as in the npm package), mcpb/manifest.json, an icon rendered from the site favicon,
// and the license and notices. Entries carry a fixed timestamp, so one tree always zips to the
// same bytes and a re-run release uploads the same file.
//
// It also writes out/server.json: the MCP Registry entry with the bundle added as a second
// package (its release download URL and sha256), which publish.yml sends with mcp-publisher.
//
//   node scripts/pack-mcpb.mjs    then: npx -y @anthropic-ai/mcpb validate out/mcpb
import { createHash } from "node:crypto";
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "out");
const stage = join(out, "mcpb");
const read = (f) => JSON.parse(readFileSync(join(root, f), "utf8"));
const pkg = read("package.json");
const manifest = read("mcpb/manifest.json");
const server = read("server.json");

const stale = [
  ["mcpb/manifest.json", manifest.version],
  ["server.json", server.version],
  ["server.json packages[0]", server.packages?.[0]?.version],
].filter(([, v]) => v !== pkg.version);
if (stale.length) {
  for (const [f, v] of stale) console.error(`${f} has version ${v}, package.json ${pkg.version}`);
  process.exit(1);
}

rmSync(stage, { recursive: true, force: true });
cpSync(join(root, "skills/orrery"), stage, { recursive: true });
for (const f of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) cpSync(join(root, f), join(stage, f));
writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

// MCPB icons are PNG; the vendored resvg draws the favicon at 512 px.
const resvgDir = join(root, "skills/orrery/scripts/vendor/resvg");
const resvg = await import(pathToFileURL(join(resvgDir, "index.mjs")).href);
await resvg.initWasm(readFileSync(join(resvgDir, "index_bg.wasm")));
const favicon = readFileSync(join(root, "site/public/favicon.svg"), "utf8");
const icon = new resvg.Resvg(favicon, { fitTo: { mode: "width", value: 512 } }).render().asPng();
writeFileSync(join(stage, manifest.icon), icon);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
const files = {};
for (const file of walk(stage).sort())
  files[relative(stage, file).replaceAll("\\", "/")] = readFileSync(file);
// A local-time date, so the DOS timestamp fields are the same in every time zone.
const bundle = zipSync(files, { level: 9, mtime: new Date(1980, 0, 1) });
const name = `orrery-${pkg.version}.mcpb`;
writeFileSync(join(out, name), bundle);
const sha256 = createHash("sha256").update(bundle).digest("hex");

const repo = server.repository.url.replace(/\/$/, "");
server.packages.push({
  registryType: "mcpb",
  identifier: `${repo}/releases/download/v${pkg.version}/${name}`,
  fileSha256: sha256,
  transport: { type: "stdio" },
});
writeFileSync(join(out, "server.json"), `${JSON.stringify(server, null, 2)}\n`);

const mb = (bundle.length / 1024 / 1024).toFixed(1);
console.log(`packed out/${name}: ${Object.keys(files).length} files, ${mb} MB, sha256 ${sha256}`);
console.log("wrote out/server.json with the bundle as a second package");
