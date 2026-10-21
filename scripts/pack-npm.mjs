#!/usr/bin/env node
// Stages the npm package @sagargupta1610/orrery in out/npm: the skill folder as it ships (the
// bundled CLI finds its assets by walking up from scripts/, so the layout must stay the same), the
// README, license and notices, and a package.json whose version is the repo's.
//
//   node scripts/pack-npm.mjs    then: npm publish ./out/npm --access public (CI does it on release)
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "out/npm");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

rmSync(out, { recursive: true, force: true });
cpSync(join(root, "skills/orrery"), out, { recursive: true });
for (const f of ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"])
  cpSync(join(root, f), join(out, f));

const manifest = {
  name: "@sagargupta1610/orrery",
  version: pkg.version,
  // The MCP Registry ties io.github.Sagargupta16/orrery to this package; the case must match.
  mcpName: "io.github.Sagargupta16/orrery",
  description: pkg.description,
  license: pkg.license,
  author: pkg.author,
  homepage: "https://sagargupta.online/orrery/",
  repository: pkg.repository,
  bugs: "https://github.com/Sagargupta16/orrery/issues",
  keywords: [
    "architecture-diagrams",
    "diagrams-as-code",
    "system-design",
    "aws",
    "azure",
    "gcp",
    "kubernetes",
    "svg",
    "drawio",
    "agent-skills",
    "claude-code",
  ],
  bin: { orrery: "scripts/orrery.mjs" },
  engines: pkg.engines,
};
writeFileSync(join(out, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`staged ${manifest.name}@${manifest.version} in out/npm`);
