#!/usr/bin/env node
// Builds the icon catalogs the skill ships, from the vendors' own downloads.
//
//   node scripts/sync-icons.mjs            rebuild from the pinned sources (checksums must match)
//   node scripts/sync-icons.mjs --latest   find the newest official packages, re-pin, rebuild
//
// Output: skills/orrery/assets/icons/<pack>.json (bodies) and index.json (names, search, aliases).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { optimize } from "svgo";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcesPath = join(root, "scripts/icon-sources.json");
const aliasesPath = join(root, "scripts/icon-aliases.json");
const outDir = join(root, "skills/orrery/assets/icons");
const cacheDir = join(root, ".cache/icons");
const nodeModules = join(root, "node_modules");
const latest = process.argv.includes("--latest");

const sources = JSON.parse(readFileSync(sourcesPath, "utf8"));

// ---------------------------------------------------------------- downloads

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function download(url, expected) {
  mkdirSync(cacheDir, { recursive: true });
  const cached = join(cacheDir, `${sha256(Buffer.from(url)).slice(0, 16)}.bin`);
  let buf;
  // --latest always downloads: Google's zips keep one URL across releases, so a cached copy
  // would re-pin an old package.
  if (existsSync(cached) && !latest) {
    buf = readFileSync(cached);
  } else {
    const res = await fetch(url, {
      headers: { "user-agent": "orrery-sync-icons" },
    });
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(cached, buf);
  }
  const actual = sha256(buf);
  if (expected && actual !== expected && !latest) {
    throw new Error(
      `checksum mismatch for ${url}\n  pinned ${expected}\n  actual ${actual}\nRe-run with --latest to re-pin.`,
    );
  }
  return { buf, sha: actual };
}

async function pageText(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 orrery-sync-icons" },
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

// Finds the current official package links on the vendor pages.
async function refreshPins() {
  const aws = await pageText(sources.aws.page);
  const awsZip = aws.match(
    /https:\/\/d1\.awsstatic\.com\/[^"'\s]*Icon-package_(\d{8})[^"'\s]*\.zip/,
  );
  if (awsZip) {
    sources.aws.url = awsZip[0];
    const d = awsZip[1];
    sources.aws.version = `${d.slice(4)}-${d.slice(0, 2)}-${d.slice(2, 4)}`;
  }
  const azure = await pageText(sources.azure.page);
  const azureZip = azure.match(
    /https:\/\/arch-center\.azureedge\.net\/icons\/Azure_Public_Service_Icons_(V\d+)\.zip/,
  );
  if (azureZip) {
    sources.azure.url = azureZip[0];
    sources.azure.version = azureZip[1];
  }
  const gcp = await pageText(sources.gcp.page);
  for (const [part, name] of [
    ["core", "core-products-icons"],
    ["category", "category-icons"],
  ]) {
    const m = gcp.match(new RegExp(`https://services\\.google\\.com/fh/files/misc/${name}\\.zip`));
    if (m) sources.gcp.parts[part].url = m[0];
  }
  // The Kubernetes icons and logo are pinned to commits: move to the newest that touched them.
  const k8s = sources.k8s;
  const icons = await newestCommit("kubernetes/community", "icons");
  k8s.base = `https://raw.githubusercontent.com/kubernetes/community/${icons}/icons/svg`;
  k8s.version = `kubernetes/community@${icons.slice(0, 7)}`;
  const logo = await newestCommit("kubernetes/kubernetes", "logo/logo.svg");
  k8s.logo = `https://raw.githubusercontent.com/kubernetes/kubernetes/${logo}/logo/logo.svg`;
}

async function newestCommit(repo, path) {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${repo}/commits?path=${path}&per_page=1`, {
    headers: {
      "user-agent": "orrery-sync-icons",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GET commits of ${repo}/${path} -> HTTP ${res.status}`);
  return (await res.json())[0].sha;
}

// ---------------------------------------------------------------- normalizing

// Every id an icon defines is rewritten to start with this token; the renderer swaps it for a
// per-instance prefix so two copies of one icon (or two icons from the same export tool) never clash.
const ID_TOKEN = "sdwid";

const ROOT_PAINT = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "fill-rule",
  "clip-rule",
  "opacity",
];

// Editor-private declarations (-inkscape-font-specification in the Kubernetes icons) do nothing in
// a browser and are not CSS properties a typed React style object accepts.
const removeVendorStyles = {
  name: "removeVendorStyles",
  fn: () => ({
    element: {
      enter: (node) => {
        const style = node.attributes.style;
        if (style === undefined) return;
        const kept = style
          .split(";")
          .filter((d) => d.trim() && !d.trim().startsWith("-"))
          .join(";");
        if (kept) node.attributes.style = kept;
        else delete node.attributes.style;
      },
    },
  }),
};

let idCounter = 0;
function normalize(svg) {
  idCounter += 1;
  const { data } = optimize(svg, {
    multipass: true,
    plugins: [
      removeVendorStyles,
      {
        name: "preset-default",
        params: {
          overrides: {
            inlineStyles: { onlyMatchedOnce: false },
            convertShapeToPath: false,
          },
        },
      },
      "convertStyleToAttrs",
      "removeDimensions",
      "removeTitle",
      "removeDesc",
      {
        name: "prefixIds",
        params: { prefix: `${ID_TOKEN}${idCounter.toString(36)}`, delim: "_" },
      },
    ],
  });
  const open = data.match(/^<svg\b([^>]*)>/);
  if (!open) throw new Error("not an svg");
  const attrs = Object.fromEntries(
    [...open[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
  let body = data.slice(open[0].length).replace(/<\/svg>\s*$/, "");
  const viewBox = attrs.viewBox ?? "0 0 24 24";
  const paint = ROOT_PAINT.filter((k) => attrs[k] !== undefined).map((k) => `${k}="${attrs[k]}"`);
  if (paint.length) body = `<g ${paint.join(" ")}>${body}</g>`;
  return { v: viewBox, b: body };
}

// True when every painted color in an icon is near black, so a dark theme must recolor it. An icon
// with no paint at all counts: unpainted shapes fill black. Same rule as src/libraries.ts.
function allDark(body) {
  if (/Gradient|<image|style="[^"]*(?:fill|stroke)\s*:/.test(body)) return false;
  const colors = [...body.matchAll(/(?:fill|stroke|stop-color)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((c) => c !== "none");
  return colors.every(
    (c) => c === "black" || (/^#[0-9a-fA-F]{3,6}$/.test(c) && luminance(c) < 0.06),
  );
}

function luminance(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((x) => x + x).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---------------------------------------------------------------- naming

const ACRONYMS = new Set([
  "ai",
  "ibm",
  "api",
  "apis",
  "bi",
  "cdn",
  "cpu",
  "dlp",
  "dns",
  "gke",
  "gpu",
  "hsm",
  "http",
  "https",
  "iam",
  "iot",
  "kms",
  "ml",
  "nat",
  "sdk",
  "sql",
  "ssh",
  "tpu",
  "vm",
  "vpc",
  "vpn",
  "gcs",
  "cli",
  "ids",
  "ssl",
  "tls",
  "url",
  "os",
  "ha",
  "ci",
  "cd",
]);

function slugify(s) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SMALL = new Set(["and", "for", "on", "to", "of", "in", "with", "the", "a", "by"]);
const SPECIAL = {
  apis: "APIs",
  vmware: "VMware",
  powershell: "PowerShell",
  bigquery: "BigQuery",
  watsonx: "watsonx",
};

function titleCase(words) {
  return words
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (SPECIAL[lower]) return SPECIAL[lower];
      if (ACRONYMS.has(lower)) return w.toUpperCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// File names lose the punctuation of a few official AWS names.
const AWS_NAME_FIXES = [
  [/\bSite to Site\b/g, "Site-to-Site"],
  [/\bX Ray\b/g, "X-Ray"],
  [/\bWell Architected\b/g, "Well-Architected"],
];
const awsName = (n) => AWS_NAME_FIXES.reduce((acc, [re, to]) => acc.replace(re, to), n);

// Vendor typos in file names.
const NAME_TYPOS = [[/\bPrivleged\b/g, "Privileged"]];
const fixTypos = (n) => NAME_TYPOS.reduce((acc, [re, to]) => acc.replace(re, to), n);

class Pack {
  constructor(key, meta) {
    this.key = key;
    this.meta = meta;
    this.icons = new Map();
  }
  // A clash keeps the first icon on the plain slug; the later one gets `suffix` (or a counter).
  add(slug, entry, suffix) {
    let s = slug;
    if (this.icons.has(s)) {
      s = suffix ? `${slug}-${suffix}` : slug;
      let n = 2;
      while (this.icons.has(s)) {
        s = `${slug}-${suffix ? `${suffix}-` : ""}${n}`;
        n += 1;
      }
    }
    this.icons.set(s, entry);
    return s;
  }
}

const files = (zip, re) =>
  Object.keys(zip)
    .filter((p) => re.test(p) && !p.includes("__MACOSX") && !p.split("/").pop().startsWith("._"))
    .sort();
const text = (zip, p) => strFromU8(zip[p]);

// ---------------------------------------------------------------- AWS

const AWS_CATEGORIES = {
  "Front End Web Mobile": "Front-End Web & Mobile",
  "Networking Content Delivery": "Networking & Content Delivery",
  "Migration Modernization": "Migration & Modernization",
  "Security Identity": "Security, Identity & Compliance",
  "Security Identity Compliance": "Security, Identity & Compliance",
  "Management Governance": "Management & Governance",
  "Management Tools": "Management & Governance",
  "Internet Of Things": "Internet of Things",
  IOT: "Internet of Things",
  "General Icons": "General",
};
const awsCategory = (c) => AWS_CATEGORIES[c] ?? c;

async function buildAws() {
  const s = sources.aws;
  const { buf, sha } = await download(s.url, s.sha256);
  s.sha256 = sha;
  const zip = unzipSync(new Uint8Array(buf));
  const pack = new Pack("aws", s);
  const strip = (name) => name.replace(/^(AWS|Amazon)[- ]/, "");

  for (const p of files(
    zip,
    /Architecture-Service-Icons_[^/]+\/Arch_[^/]+\/64\/Arch_.+_64\.svg$/,
  )) {
    const raw = p
      .split("/")
      .pop()
      .replace(/^Arch_/, "")
      .replace(/_64\.svg$/, "");
    const category = awsCategory(
      titleCase(
        p
          .split("/")
          .at(-3)
          .replace(/^Arch_/, ""),
      ),
    );
    const name = awsName(raw.replace(/-/g, " "));
    pack.add(slugify(strip(raw)), {
      n: name,
      c: category,
      t: "service",
      ...normalize(text(zip, p)),
    });
  }

  const res = files(zip, /Resource-Icons_[^/]+\/.+\.svg$/);
  const byBase = new Map();
  for (const p of res) {
    const file = p.split("/").pop();
    const m = file.match(/^Res_(.+?)_48(?:_(Light|Dark))?\.svg$/);
    if (!m) continue;
    const base = m[1];
    const variant = m[2] ?? "Light";
    const category = awsCategory(
      titleCase(
        p
          .split("/")
          .find((d) => d.startsWith("Res_") && !d.endsWith(".svg") && !/^Res_48/.test(d))
          ?.replace(/^Res_/, "") ?? "General",
      ),
    );
    const entry = byBase.get(base) ?? { category };
    entry[variant] = p;
    byBase.set(base, entry);
  }
  for (const [base, entry] of [...byBase].sort(([a], [b]) => a.localeCompare(b))) {
    const parts = base.split("_");
    const name = awsName(parts.map((x) => x.replace(/-/g, " ")).join(" "));
    const slug = slugify(parts.map(strip).join("-"));
    const light = normalize(text(zip, entry.Light ?? entry.Dark));
    const icon = { n: name, c: entry.category, t: "resource", ...light };
    if (entry.Light && entry.Dark) icon.d = normalize(text(zip, entry.Dark)).b;
    pack.add(slug, icon, "resource");
  }

  const groups = files(zip, /Architecture-Group-Icons_[^/]+\/[^/]+_32(?:_Dark)?\.svg$/);
  for (const p of groups.filter((g) => !g.endsWith("_Dark.svg"))) {
    const raw = p
      .split("/")
      .pop()
      .replace(/_32\.svg$/, "");
    const dark = p.replace(/_32\.svg$/, "_32_Dark.svg");
    const icon = {
      n: raw.replace(/-/g, " "),
      c: "Groups",
      t: "group",
      ...normalize(text(zip, p)),
    };
    if (zip[dark]) icon.d = normalize(text(zip, dark)).b;
    pack.add(`group-${slugify(raw)}`, icon);
  }

  for (const p of files(zip, /Category-Icons_[^/]+\/Arch-Category_64\/Arch-Category_.+_64\.svg$/)) {
    const raw = p
      .split("/")
      .pop()
      .replace(/^Arch-Category_/, "")
      .replace(/_64\.svg$/, "");
    pack.add(`category-${slugify(raw)}`, {
      n: `${raw.replace(/-/g, " ")} category`,
      c: "Categories",
      t: "category",
      ...normalize(text(zip, p)),
    });
  }
  return pack;
}

// ---------------------------------------------------------------- Azure

async function buildAzure() {
  const s = sources.azure;
  const { buf, sha } = await download(s.url, s.sha256);
  s.sha256 = sha;
  const zip = unzipSync(new Uint8Array(buf));
  const pack = new Pack("azure", s);
  const paths = files(zip, /Icons\/[^/]+\/[^/]+\.svg$/);
  // Icons listed under "new icons" or "other" also live in their real category; prefer that one.
  const rank = (p) => (/\/(new icons|other)\//i.test(p) ? 1 : 0);
  paths.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const seen = new Set();
  for (const p of paths) {
    const file = p.split("/").pop();
    const m = file.match(/^\d+-icon-service-(.+)\.svg$/);
    if (!m) continue;
    const raw = m[1];
    const slug = slugify(raw);
    if (seen.has(slug)) continue;
    seen.add(slug);
    const category = titleCase(
      p
        .split("/")
        .at(-2)
        .replace(/\s*\+\s*/g, " and "),
    )
      .replace(/^IOT$/, "IoT")
      .replace(/\bAnd\b/g, "and")
      .replace(/^Devops$/, "DevOps");
    pack.add(slug, {
      n: fixTypos(raw.replace(/-/g, " ")),
      c: category,
      t: "service",
      ...normalize(text(zip, p)),
    });
  }
  return pack;
}

// ---------------------------------------------------------------- Google Cloud

// Google's icon system (cloud.google.com/icons, May 2026): core products carry their own icon and
// every other product uses its category's icon. scripts/gcp-products.json is Google's product list
// from that guide; each product becomes an entry that points at the icon Google assigns it. The
// legacy console icons are not used: Google says they should not be used as of 2026.
const GCP_PRODUCTS = JSON.parse(readFileSync(join(root, "scripts/gcp-products.json"), "utf8"));
// Current official names where the download's folder name is out of date or short.
const GCP_CORE = {
  "cloud-spanner": { n: "Spanner" },
  "distributed-cloud": { n: "Google Distributed Cloud" },
  "security-operations": { n: "Google Security Operations" },
  "threat-intelligence": { n: "Google Threat Intelligence" },
  gke: { k: "Google Kubernetes Engine" },
};
const GCP_CATEGORY_NAMES = { "category-security-identity": "Security and Identity" };
const GCP_SLUGS = { "Pub/Sub": "pubsub" };

async function buildGcp() {
  const s = sources.gcp;
  const pack = new Pack("gcp", s);
  const zips = {};
  for (const [part, info] of Object.entries(s.parts)) {
    const { buf, sha } = await download(info.url, info.sha256);
    info.sha256 = sha;
    zips[part] = unzipSync(new Uint8Array(buf));
  }
  for (const p of files(zips.core, /\/SVG\/[^/]+\.svg$/)) {
    const name = p.split("/").at(-3);
    const slug = slugify(name);
    pack.add(slug, {
      n: name,
      c: "Core products",
      t: "service",
      ...GCP_CORE[slug],
      ...normalize(text(zips.core, p)),
    });
  }
  for (const p of files(zips.category, /\/SVG\/[^/]+\.svg$/)) {
    const folder = p.split("/").at(-3).replace(/ _ /g, " and ");
    const slug = `category-${slugify(folder)}`;
    pack.add(slug, {
      n: `${GCP_CATEGORY_NAMES[slug] ?? folder} category`,
      c: "Categories",
      t: "category",
      ...normalize(text(zips.category, p)),
    });
  }
  const product = (name, target, category) => {
    const slug = GCP_SLUGS[name] ?? slugify(name);
    if (!pack.icons.has(target)) throw new Error(`gcp-products.json: no icon ${target}`);
    if (pack.icons.has(slug)) throw new Error(`gcp-products.json: ${name} clashes with ${slug}`);
    pack.add(slug, { n: name, c: category, t: "service", r: target });
  };
  for (const [name, core] of Object.entries(GCP_PRODUCTS.core))
    product(name, core, "Core products");
  for (const [category, names] of Object.entries(GCP_PRODUCTS.categories)) {
    const label = pack.icons.get(category)?.n.replace(/ category$/, "");
    for (const name of names) product(name, category, label);
  }
  return pack;
}

// ---------------------------------------------------------------- Kubernetes

const K8S_NAMES = {
  "c-role": "ClusterRole",
  cm: "ConfigMap",
  crb: "ClusterRoleBinding",
  crd: "CustomResourceDefinition",
  cronjob: "CronJob",
  deploy: "Deployment",
  ds: "DaemonSet",
  ep: "Endpoints",
  group: "Group",
  hpa: "HorizontalPodAutoscaler",
  ing: "Ingress",
  job: "Job",
  limits: "LimitRange",
  netpol: "NetworkPolicy",
  ns: "Namespace",
  pod: "Pod",
  psp: "PodSecurityPolicy",
  pv: "PersistentVolume",
  pvc: "PersistentVolumeClaim",
  quota: "ResourceQuota",
  rb: "RoleBinding",
  role: "Role",
  rs: "ReplicaSet",
  sa: "ServiceAccount",
  sc: "StorageClass",
  secret: "Secret",
  sts: "StatefulSet",
  svc: "Service",
  user: "User",
  vol: "Volume",
  "control-plane": "Control Plane",
  etcd: "etcd",
  node: "Node",
  api: "kube-apiserver",
  "c-c-m": "cloud-controller-manager",
  "c-m": "kube-controller-manager",
  "k-proxy": "kube-proxy",
  kubelet: "kubelet",
  sched: "kube-scheduler",
};

async function buildK8s() {
  const s = sources.k8s;
  const pack = new Pack("k8s", s);
  const category = {
    "resources/unlabeled": "Resources",
    "infrastructure_components/unlabeled": "Infrastructure",
    "control_plane_components/labeled": "Control plane",
  };
  for (const [dir, list] of Object.entries(s.files)) {
    for (const f of list) {
      const { buf } = await download(`${s.base}/${dir}/${f}.svg`);
      const name = K8S_NAMES[f] ?? f;
      pack.add(slugify(name.replace(/^kube-/, "kube ")), {
        n: name,
        c: category[dir],
        t: "resource",
        short: f,
        ...normalize(buf.toString("utf8")),
      });
    }
  }
  const { buf } = await download(s.logo);
  pack.add("kubernetes", {
    n: "Kubernetes",
    c: "Logo",
    t: "logo",
    ...normalize(buf.toString("utf8")),
  });
  return pack;
}

// ---------------------------------------------------------------- npm-packaged sets

function pkgVersion(name) {
  return JSON.parse(readFileSync(join(nodeModules, name, "package.json"), "utf8")).version;
}

// These packs are not bundled: the renderer loads them from the npm library itself at the pinned
// version (src/libraries.ts). The catalog only records names, search keywords and the pin.
function librarySource(npm, file, extra = {}) {
  const buf = readFileSync(join(nodeModules, npm, file));
  return { npm, version: pkgVersion(npm), file, sha256: sha256(buf), bytes: buf.length, ...extra };
}

const iconifySet = (npm) => JSON.parse(readFileSync(join(nodeModules, npm, "icons.json"), "utf8"));

function buildOcticons() {
  const npm = "@primer/octicons";
  const data = JSON.parse(readFileSync(join(nodeModules, npm, "build/data.json"), "utf8"));
  const pack = new Pack("github", {
    title: "GitHub Octicons",
    version: `${npm} ${pkgVersion(npm)}`,
    page: "https://primer.style/octicons",
    license: "MIT",
  });
  pack.lib = librarySource(npm, "build/data.json", {
    format: "octicons",
    mono: true,
    suffix: "-24",
  });
  for (const name of Object.keys(data).sort()) {
    const icon = data[name];
    const h = icon.heights["24"] ? "24" : Object.keys(icon.heights).sort((a, b) => b - a)[0];
    pack.add(name, {
      n: titleCase(name),
      c: "Octicons",
      t: "glyph",
      k: icon.keywords?.join(" "),
      name: h === "24" ? undefined : `${name}-${h}`,
    });
  }
  return pack;
}

// Simple Icons entries whose own license forbids redistribution here are skipped (see THIRD_PARTY_NOTICES.md).
const SI_ALLOWED = new Set([
  "CC0-1.0",
  "CC-BY-2.5",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "Apache-2.0",
  "MIT",
  "BSD-3-Clause",
  "Unlicense",
]);

// Unofficial redraws of cloud service icons in the logo sets. The vendors' own packs cover every
// one of these, so they are left out; the vendors' brand marks themselves (aws, google-cloud) stay.
const VENDOR_COPIES = {
  logos: /^(aws-.+|amazon-.+|google-cloud-(?!platform$).+)$/,
  si: /^google(bigquery|bigtable|chronicle|cloudcomposer|cloudspanner|cloudstorage|containeroptimizedos|dataflow|dataproc|earthengine|pubsub)$/,
};
// Superseded artwork: the plain name serves the newest dated mark ("google-drive-2020").
const SUPERSEDED = { logos: new Set(["google-2014"]) };

function buildSimpleIcons() {
  const npm = "@iconify-json/simple-icons";
  const data = JSON.parse(
    readFileSync(join(nodeModules, "simple-icons/data/simple-icons.json"), "utf8"),
  );
  const set = iconifySet(npm);
  const pack = new Pack("si", {
    title: "Simple Icons",
    version: `simple-icons ${pkgVersion("simple-icons")}`,
    page: "https://simpleicons.org",
    license: "CC0-1.0 (collection); individual marks remain trademarks of their owners",
  });
  pack.lib = librarySource(npm, "icons.json", { mono: true });
  const skipped = [];
  const attributed = [];
  for (const icon of data) {
    const slug = icon.slug ?? slugify(icon.title);
    const lic = icon.license?.type;
    if (lic && !SI_ALLOWED.has(lic)) {
      skipped.push({ slug, title: icon.title, license: lic });
      continue;
    }
    // Iconify names allow no underscores: "backstage_casting" is "backstage-casting" there.
    const name = slug.replace(/_/g, "-");
    if (VENDOR_COPIES.si.test(slug) || !set.icons[name]) continue;
    if (lic && lic !== "CC0-1.0")
      attributed.push({
        slug,
        title: icon.title,
        license: lic,
        source: icon.source,
      });
    const aka = [...(icon.aliases?.aka ?? []), ...Object.values(icon.aliases?.loc ?? {})];
    pack.add(slug, {
      n: icon.title,
      c: "Brands",
      t: "logo",
      k: aka.join(" ") || undefined,
      col: `#${icon.hex}`,
      name: name === slug ? undefined : name,
    });
  }
  pack.skipped = skipped;
  pack.attributed = attributed;
  return pack;
}

let titles;
/** Brand titles from Simple Icons ("PostgreSQL", "GitHub Actions"), keyed by collapsed slug and title. */
function officialTitles() {
  if (titles) return titles;
  titles = new Map();
  const data = JSON.parse(
    readFileSync(join(nodeModules, "simple-icons/data/simple-icons.json"), "utf8"),
  );
  for (const icon of data) {
    const key = (icon.slug ?? "").replace(/[^a-z0-9]/g, "");
    if (key) titles.set(key, icon.title);
    titles.set(icon.title.toLowerCase().replace(/[^a-z0-9]/g, ""), icon.title);
  }
  return titles;
}

function buildIconify(
  pkg,
  key,
  title,
  page,
  license,
  { mono = false, category = "Logos", type = "logo", kind } = {},
) {
  const data = iconifySet(pkg);
  const info = JSON.parse(readFileSync(join(nodeModules, pkg, "info.json"), "utf8"));
  const pack = new Pack(key, {
    title,
    version: `${pkg} ${pkgVersion(pkg)}${info.version ? ` (${info.name} ${info.version})` : ""}`,
    page,
    license,
  });
  pack.lib = librarySource(pkg, "icons.json", mono ? { mono: true } : {});
  const names = Object.keys(data.icons).sort();
  const dated = new Map();
  for (const name of names) {
    const m = name.match(/^(.+)-(20\d\d)$/);
    if (m && data.icons[m[1]]) dated.set(m[1], name);
  }
  for (const name of names) {
    if (VENDOR_COPIES[key]?.test(name) || SUPERSEDED[key]?.has(name)) continue;
    if ([...dated.values()].includes(name)) continue;
    const base = name.replace(/-icon$/, "");
    const n = officialTitles().get(base.replace(/[^a-z0-9]/g, "")) ?? titleCase(base);
    pack.add(name, { n, c: category, t: type, ...kind?.(name), name: dated.get(name) });
  }
  return pack;
}

// ---------------------------------------------------------------- docs

// The docs quote pack counts and versions. A sync rewrites every quote of a value it changed, so
// the monthly pull request leaves the docs true; check-repo.mjs verifies the totals and tables.
const DOC_FILES = [
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "skills/orrery/SKILL.md",
  "skills/orrery/references/icons.md",
  "docs/how-it-works.yaml",
];
const PROSE_LABELS = {
  aws: "AWS",
  azure: "Azure",
  gcp: "Google Cloud",
  k8s: "Kubernetes",
  github: "GitHub Octicons",
  ibm: "IBM Carbon",
};
const VERSION_TOKENS = /\d{4}-\d{2}-\d{2}|\bV\d+\b|\b[0-9a-f]{7}\b|\d+\.\d+\.\d+/g;
const fmt = (n) => n.toLocaleString("en-US");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What a pack's table rows quote: its count, its count per icon type, its version numbers. */
function quoted(index, key) {
  const pack = index.packs[key];
  const counts = { count: pack.count };
  for (const [id, , , type] of index.icons)
    if (id.startsWith(`${key}:`)) counts[type] = (counts[type] ?? 0) + 1;
  const values = Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, fmt(n)]));
  const versions = `${pack.version} ${pack.lib?.version ?? ""}`.match(VERSION_TOKENS) ?? [];
  versions.forEach((v, i) => {
    values[`v${i}`] = v;
  });
  return values;
}

// Replaces old values with new ones in one pass. A value two keys share but that moves to two
// different values is left alone (check-repo.mjs reports it if it matters).
function swap(text, pairs, bounded) {
  const to = new Map();
  for (const [from, next] of pairs)
    to.set(from, to.has(from) && to.get(from) !== next ? null : next);
  const moved = [...to.keys()].filter((from) => to.get(from) !== null && to.get(from) !== from);
  if (!moved.length) return text;
  moved.sort((a, b) => b.length - a.length);
  const after = bounded ? "(?![\\w-]|[.,]\\d)" : "";
  const re = new RegExp(`(?<![\\w.,-])(?:${moved.map(escapeRe).join("|")})${after}`, "g");
  return text.replace(re, (m) => to.get(m));
}

function updateDocs(before, after) {
  const total = (ix) => fmt(ix.icons.length);
  const sum = (ix, keys) => fmt(keys.reduce((n, k) => n + (ix.packs[k]?.count ?? 0), 0));
  const libs = (ix) => Object.keys(ix.packs).filter((k) => ix.packs[k].lib);
  const phrases = [
    [`${total(before)} icons`, `${total(after)} icons`],
    [`${sum(before, libs(before))} icons`, `${sum(after, libs(after))} icons`],
    [
      `official_icons-${total(before).replace(",", "%2C")}`,
      `official_icons-${total(after).replace(",", "%2C")}`,
    ],
    [`${sum(before, ["logos", "si"])} tech logos`, `${sum(after, ["logos", "si"])} tech logos`],
    [`${sum(before, ["tabler"])} neutral symbols`, `${sum(after, ["tabler"])} neutral symbols`],
    ...Object.entries(PROSE_LABELS)
      .filter(([k]) => before.packs[k] && after.packs[k])
      .map(([k, label]) => [`${label} (${sum(before, [k])})`, `${label} (${sum(after, [k])})`]),
  ];
  for (const f of DOC_FILES) {
    const file = join(root, f);
    const old = readFileSync(file, "utf8");
    const rows = old.split("\n").map((line) => {
      // Pack table rows (| `aws` | ...) and pack nodes in the README art (  aws: { ... }).
      const key = line.match(/^\| `(\w+)` \|/)?.[1] ?? line.match(/^ {2}(\w+): \{/)?.[1];
      if (!key || !before.packs[key] || !after.packs[key]) return line;
      const a = quoted(before, key);
      const b = quoted(after, key);
      const pairs = Object.keys(a)
        .filter((k) => k in b)
        .map((k) => [a[k], b[k]]);
      return swap(line, pairs, true);
    });
    const text = swap(rows.join("\n"), phrases, false);
    if (text !== old) {
      writeFileSync(file, text);
      console.log(`updated the counts and versions quoted in ${f}`);
    }
  }
}

// ---------------------------------------------------------------- write

function writePack(pack) {
  const file = join(outDir, `${pack.key}.json`);
  if (pack.lib) {
    // Library packs load from npm at render time; drop a bundled copy from an older sync.
    if (existsSync(file)) rmSync(file);
    return;
  }
  const icons = {};
  for (const slug of [...pack.icons.keys()].sort()) {
    const entry = pack.icons.get(slug);
    if (entry.r) {
      icons[slug] = { r: entry.r };
      continue;
    }
    const out = { v: entry.v, b: entry.b };
    if (entry.d) out.d = entry.d;
    if (allDark(entry.b)) out.k = 1;
    icons[slug] = out;
  }
  const data = {
    pack: pack.key,
    title: pack.meta.title,
    version: pack.meta.version,
    source: pack.meta.page,
    icons,
  };
  writeFileSync(file, `${JSON.stringify(data)}\n`);
}

function indexRows(pack) {
  const rows = [];
  for (const slug of [...pack.icons.keys()].sort()) {
    const e = pack.icons.get(slug);
    const kw = [e.k, e.short].filter(Boolean).join(" ");
    rows.push([`${pack.key}:${slug}`, e.n, e.c, e.t, kw]);
  }
  return rows;
}

async function main() {
  if (latest) await refreshPins();
  mkdirSync(outDir, { recursive: true });
  const indexPath = join(outDir, "index.json");
  const before = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : undefined;
  const packs = [
    await buildAws(),
    await buildAzure(),
    await buildGcp(),
    await buildK8s(),
    buildOcticons(),
    // IBM's technical diagram guide puts Carbon UI icons in diagram nodes; the ibm-* ones are
    // IBM's product glyphs.
    buildIconify(
      "@iconify-json/carbon",
      "ibm",
      "IBM Carbon icons",
      "https://carbondesignsystem.com/elements/icons/library/",
      "Apache-2.0",
      {
        mono: true,
        category: "Carbon",
        type: "glyph",
        kind: (name) =>
          /^(ibm|watson)/.test(name) ? { c: "IBM products", t: "service" } : undefined,
      },
    ),
    buildIconify(
      "@iconify-json/logos",
      "logos",
      "SVG Logos (gilbarbara/logos)",
      "https://github.com/gilbarbara/logos",
      "CC0-1.0 (collection); individual marks remain trademarks of their owners",
    ),
    buildSimpleIcons(),
    buildIconify(
      "@iconify-json/tabler",
      "tabler",
      "Tabler Icons",
      "https://tabler.io/icons",
      "MIT",
      { mono: true, category: "Generic", type: "glyph" },
    ),
  ];

  const aliasTable = existsSync(aliasesPath) ? JSON.parse(readFileSync(aliasesPath, "utf8")) : {};
  const all = new Set(packs.flatMap((p) => [...p.icons.keys()].map((s) => `${p.key}:${s}`)));
  const aliases = {};
  const broken = [];
  for (const [alias, target] of Object.entries(aliasTable).sort(([a], [b]) => a.localeCompare(b))) {
    if (alias.startsWith("//")) continue;
    if (!all.has(target)) broken.push(`${alias} -> ${target}`);
    else if (all.has(alias)) broken.push(`${alias} shadows a real icon`);
    else aliases[alias] = target;
  }

  const index = { packs: {}, icons: [], aliases, colors: {}, names: {} };
  for (const pack of packs) {
    writePack(pack);
    index.packs[pack.key] = {
      title: pack.meta.title,
      version: pack.meta.version,
      source: pack.meta.page,
      license: pack.meta.license ?? pack.meta.terms,
      count: pack.icons.size,
      ...(pack.lib ? { lib: pack.lib } : {}),
    };
    index.icons.push(...indexRows(pack));
    for (const [slug, e] of [...pack.icons].sort(([a], [b]) => a.localeCompare(b))) {
      if (e.col) index.colors[`${pack.key}:${slug}`] = e.col;
      if (e.name) index.names[`${pack.key}:${slug}`] = e.name;
    }
  }
  writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
  if (before) updateDocs(before, index);

  const si = packs.find((p) => p.key === "si");
  writeFileSync(
    join(outDir, "simple-icons-licenses.json"),
    `${JSON.stringify({ attributed: si.attributed, skipped: si.skipped }, null, 2)}\n`,
  );
  writeFileSync(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`);

  for (const p of packs)
    console.log(
      `${p.key.padEnd(7)} ${String(p.icons.size).padStart(5)} icons  ${p.meta.version}${p.lib ? `  (npm ${p.lib.npm}@${p.lib.version}, loaded at render time)` : ""}`,
    );
  console.log(
    `total   ${String(all.size).padStart(5)} icons, ${Object.keys(aliases).length} aliases`,
  );
  if (broken.length) {
    console.error(`\n${broken.length} alias problem(s):\n  ${broken.join("\n  ")}`);
    process.exitCode = 1;
  }
}

await main();
