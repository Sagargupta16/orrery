#!/usr/bin/env node
// Bundles src/ into the skill's zero-install CLI and vendors the two runtime engines next to it:
//   skills/stackdraw/scripts/stackdraw.mjs        our code + yaml (MIT/ISC), one file
//   skills/stackdraw/scripts/vendor/elk.bundled.cjs ELK layout (EPL-2.0), unmodified
//   skills/stackdraw/scripts/vendor/resvg/          resvg wasm (MPL-2.0), unmodified
//
//   node scripts/build.mjs           build
//   node scripts/build.mjs --check   fail if the committed bundle is stale (CI)
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = join(root, "skills/stackdraw/scripts");
const vendorDir = join(scriptsDir, "vendor");
const outFile = join(scriptsDir, "stackdraw.mjs");
const check = process.argv.includes("--check");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const result = await build({
  entryPoints: [join(root, "src/main.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  minify: false,
  legalComments: "eof",
  external: ["elkjs", "elkjs/*", "@resvg/resvg-wasm"],
  define: { __VERSION__: JSON.stringify(pkg.version) },
  banner: {
    js: [
      "#!/usr/bin/env node",
      `// stackdraw ${pkg.version} (MIT). Generated from src/ by scripts/build.mjs; do not edit.`,
      "// Bundles yaml (ISC, Eemeli Aro). ELK (EPL-2.0) and resvg (MPL-2.0) load from ./vendor.",
      // CommonJS dependencies inside an ESM bundle need a real require for node builtins.
      'import { createRequire as __sdwRequire } from "node:module";',
      "const require = __sdwRequire(import.meta.url);",
    ].join("\n"),
  },
});
const code = result.outputFiles[0].text;

const vendored = [
  ["node_modules/elkjs/lib/elk.bundled.js", "elk.bundled.cjs"],
  ["node_modules/elkjs/LICENSE.md", "elk.LICENSE.md"],
  ["node_modules/@resvg/resvg-wasm/index.mjs", "resvg/index.mjs"],
  ["node_modules/@resvg/resvg-wasm/index_bg.wasm", "resvg/index_bg.wasm"],
];

if (check) {
  const stale = [];
  if (!existsSync(outFile) || readFileSync(outFile, "utf8") !== code) stale.push("stackdraw.mjs");
  for (const [from, to] of vendored) {
    const src = join(root, from);
    const dst = join(vendorDir, to);
    if (existsSync(src) && (!existsSync(dst) || !readFileSync(src).equals(readFileSync(dst))))
      stale.push(`vendor/${to}`);
  }
  if (stale.length) {
    console.error(`stale build output: ${stale.join(", ")}\nrun: pnpm build`);
    process.exit(1);
  }
  console.log("build output is current");
} else {
  mkdirSync(join(vendorDir, "resvg"), { recursive: true });
  writeFileSync(outFile, code);
  for (const [from, to] of vendored) {
    const src = join(root, from);
    if (!existsSync(src)) {
      // elkjs ships its license as LICENSE.md in some versions and not at all in others.
      if (to.endsWith(".md")) continue;
      throw new Error(`missing ${from}; run pnpm install`);
    }
    copyFileSync(src, join(vendorDir, to));
  }
  writeFileSync(
    join(vendorDir, "README.md"),
    [
      "# Vendored runtime engines",
      "",
      "Copied unmodified from npm by `scripts/build.mjs` so the skill runs with no install step.",
      "",
      "| File | Package | License |",
      "| --- | --- | --- |",
      `| \`elk.bundled.js\` | [elkjs](https://github.com/kieler/elkjs) ${JSON.parse(readFileSync(join(root, "node_modules/elkjs/package.json"), "utf8")).version} | EPL-2.0 (source: https://github.com/kieler/elkjs) |`,
      `| \`resvg/index.mjs\`, \`resvg/index_bg.wasm\` | [@resvg/resvg-wasm](https://github.com/thx/resvg-js) ${JSON.parse(readFileSync(join(root, "node_modules/@resvg/resvg-wasm/package.json"), "utf8")).version} | MPL-2.0 (source: https://github.com/thx/resvg-js) |`,
      "",
    ].join("\n"),
  );
  rmSync(join(vendorDir, ".gitkeep"), { force: true });
  console.log(`wrote ${outFile} (${(code.length / 1024).toFixed(0)} KB) and vendor/`);
}
