#!/usr/bin/env node
// Builds everything the site shows from the repository itself, so the site never drifts from the
// renderer: every example in both themes and every format (and in the classic skin as SVG), the README art, the gallery captions
// from examples/README.md and the catalog numbers from the icon index. Output goes to
// public/gallery, public/art and src/data/generated, all git-ignored.
//
//   node scripts/prepare.mjs   (pnpm build and pnpm dev run it first)
import { execFile } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse } from "yaml";

const run = promisify(execFile);
const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(site, "..");
const cli = join(repo, "skills/orrery/scripts/orrery.mjs");
const examplesDir = join(repo, "skills/orrery/examples");
const galleryOut = join(site, "public/gallery");
const artOut = join(site, "public/art");
const dataOut = join(site, "src/data/generated");

for (const dir of [galleryOut, artOut, dataOut]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

// Category chips on the gallery. An example can sit in several.
const CATEGORIES = [
  ["aws", "AWS", (n, packs) => n.startsWith("aws-") || (packs.includes("aws") && n !== "multi-cloud")],
  ["azure", "Azure", (n) => n.startsWith("azure-")],
  ["gcp", "Google Cloud", (n) => n.startsWith("gcp-")],
  ["ibm", "IBM Cloud", (n) => n.startsWith("ibm-")],
  ["kubernetes", "Kubernetes", (n, packs) => packs.includes("k8s") || /k8s|kubernetes|aks|gke|eks/.test(n)],
  ["ai", "AI and ML", (n) => /rag|ml|genai|vertex|agent|openai|llm|sagemaker|multitenant/.test(n)],
  ["data", "Data", (n) => /data|lake|streaming-analytics|iot-analytics/.test(n)],
  [
    "security",
    "Security and resilience",
    (n) => /threat|central-logging|backup|multi-region-dr|network-inspection|org-ou-tree/.test(n),
  ],
  ["network", "Networking", (n) => /network|hub-spoke|landing-zone/.test(n)],
  ["devops", "CI/CD and ops", (n) => /cicd|gitops|observability/.test(n)],
  ["system-design", "System design", (n) => n.startsWith("system-design-") || n === "c4-container"],
  [
    "flows",
    "Business flows",
    (n) => /^(flowchart|process|swimlane|state|tree|mindmap|journey|local-icons)-/.test(n),
  ],
  ["multi-cloud", "Multi-cloud", (n) => n === "multi-cloud"],
  ["web", "Web apps", (n) => /web|three-tier|serverless|starter|modern|ecommerce|media/.test(n)],
];

// Captions and alt text come from examples/README.md, which already describes every example.
const examplesReadme = readFileSync(join(repo, "examples/README.md"), "utf8");
const captions = new Map();
for (const m of examplesReadme.matchAll(
  /\[`([\w-]+)`\]\([^)]*\): (.+)\n\n<a href="[^"]+"><img src="[^"]+" alt="([^"]+)"/g,
))
  captions.set(m[1], { caption: m[2].trim(), alt: m[3] });

const prefixOf = (id) => (typeof id === "string" && id.includes(":") ? id.split(":")[0] : undefined);

async function renderExample(file) {
  const name = file.replace(/\.ya?ml$/, "");
  const specPath = join(examplesDir, file);
  const text = readFileSync(specPath, "utf8");
  const spec = parse(text);
  const dir = join(galleryOut, name);
  mkdirSync(dir, { recursive: true });
  await run(process.execPath, [cli, "render", specPath, "-o", join(dir, name), "-f", "all", "--theme", "both"]);
  // The same diagram in the classic skin (same layout), for the gallery's Stage / Classic switch.
  await run(process.execPath, [
    cli,
    "render",
    specPath,
    "-o",
    join(dir, `${name}-classic`),
    "-f",
    "svg",
    "--theme",
    "both",
    "--skin",
    "classic",
  ]);
  copyFileSync(specPath, join(dir, `${name}.yaml`));

  const nodes = Object.values(spec.nodes ?? {});
  const groups = Object.values(spec.groups ?? {});
  const packs = [
    ...new Set(
      [...nodes.map((n) => prefixOf(n?.icon)), ...groups.map((g) => prefixOf(g?.type))].filter(Boolean),
    ),
  ].sort();
  const info = captions.get(name);
  // The rendered size, so the gallery keeps each diagram's shape and reserves its space.
  const svg = readFileSync(join(dir, `${name}-light.svg`), "utf8");
  const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) ?? [];
  return {
    name,
    title: spec.title ?? name,
    subtitle: spec.subtitle ?? "",
    caption: info?.caption ?? spec.subtitle ?? "",
    alt: info?.alt ?? spec.title ?? name,
    theme: spec.theme === "light" ? "light" : "dark",
    width: Math.round(Number(w) || 1200),
    height: Math.round(Number(h) || 800),
    packs,
    categories: CATEGORIES.filter(([, , test]) => test(name, packs)).map(([id]) => id),
    counts: {
      nodes: nodes.length,
      groups: groups.length,
      edges: Array.isArray(spec.edges) ? spec.edges.length : 0,
    },
    spec: text,
  };
}

// Render with a small pool: each render is its own Node process.
const files = readdirSync(examplesDir)
  .filter((f) => /\.ya?ml$/.test(f))
  .sort();
const pool = Math.max(2, Math.min(6, availableParallelism() - 1));
const examples = [];
for (let i = 0; i < files.length; i += pool) {
  examples.push(...(await Promise.all(files.slice(i, i + pool).map(renderExample))));
}

// The README art (hero and how-it-works) in both themes.
for (const f of readdirSync(join(repo, "docs")).filter((f) => f.endsWith(".svg")))
  copyFileSync(join(repo, "docs", f), join(artOut, f));

// Catalog numbers for the icon pack table and the hero stats.
const index = JSON.parse(readFileSync(join(repo, "skills/orrery/assets/icons/index.json"), "utf8"));
const packs = Object.entries(index.packs).map(([key, p]) => ({
  key,
  title: p.title,
  version: p.version,
  source: p.source,
  license: p.license,
  count: p.count,
  ships: p.lib ? `npm ${p.lib.npm}` : "bundled",
}));
const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
const meta = {
  version: pkg.version,
  icons: index.icons.length,
  aliases: Object.keys(index.aliases).length,
  packs: packs.length,
  examples: examples.length,
  categories: CATEGORIES.map(([id, label]) => ({
    id,
    label,
    count: examples.filter((e) => e.categories.includes(id)).length,
  })).filter((c) => c.count > 0),
};

writeFileSync(join(dataOut, "examples.json"), `${JSON.stringify(examples, null, 2)}\n`);
writeFileSync(join(dataOut, "packs.json"), `${JSON.stringify(packs, null, 2)}\n`);
writeFileSync(join(dataOut, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.log(
  `prepared ${examples.length} examples in both themes, ${packs.length} packs, ${meta.icons} icons`,
);
