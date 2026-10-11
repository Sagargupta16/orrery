import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, mixHex } from "./color.ts";
import {
  allDark,
  type LibrarySource,
  libraryIcon,
  loadedLibrary,
  loadLibrary,
} from "./libraries.ts";
import { iconsDir } from "./paths.ts";
import type { ThemeName } from "./types.ts";

export interface PackInfo {
  title: string;
  version: string;
  source: string;
  license: string;
  count: number;
  /** Set for packs loaded from their npm library at render time instead of bundled. */
  lib?: LibrarySource;
}

interface Index {
  packs: Record<string, PackInfo>;
  /** [id, name, category, type, keywords] */
  icons: [string, string, string, string, string][];
  aliases: Record<string, string>;
  /** Brand colors of library icons, by id (Simple Icons). */
  colors: Record<string, string>;
  /** Library icon names that differ from slug + suffix, by id. */
  names: Record<string, string>;
}

interface PackEntry {
  v: string;
  b: string;
  d?: string;
  m?: 1;
  col?: string;
  k?: 1;
  /** Uses another entry's artwork (Google gives most products their category's icon). */
  r?: string;
}

interface PackFile {
  pack: string;
  icons: Record<string, PackEntry>;
}

export interface IconInfo {
  id: string;
  pack: string;
  slug: string;
  name: string;
  category: string;
  type: string;
  keywords: string;
}

/** Official vendor packs rank above logo and glyph sets in search and suggestions. */
export const PACK_ORDER = ["aws", "azure", "gcp", "k8s", "github", "ibm", "logos", "si", "tabler"];

let index: Index | undefined;
let infoById: Map<string, IconInfo> | undefined;
const packs = new Map<string, PackFile>();

function loadIndex(): Index {
  if (!index) index = JSON.parse(readFileSync(join(iconsDir, "index.json"), "utf8")) as Index;
  return index;
}

function infos(): Map<string, IconInfo> {
  if (infoById) return infoById;
  infoById = new Map();
  for (const [id, name, category, type, keywords] of loadIndex().icons) {
    const [pack = "", slug = ""] = id.split(":");
    infoById.set(id, { id, pack, slug, name, category, type, keywords });
  }
  return infoById;
}

function loadPack(pack: string): PackFile {
  let file = packs.get(pack);
  if (!file) {
    file = JSON.parse(readFileSync(join(iconsDir, `${pack}.json`), "utf8")) as PackFile;
    packs.set(pack, file);
  }
  return file;
}

export function packInfo(): Record<string, PackInfo> {
  return loadIndex().packs;
}

export function aliases(): Record<string, string> {
  return loadIndex().aliases;
}

function clean(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^([a-z0-9]+)[/.]/, "$1:");
}

/** Canonical icon id for an id or alias, or undefined when nothing matches exactly. */
export function resolveIcon(id: string): string | undefined {
  let current = clean(id);
  const table = loadIndex().aliases;
  for (let hops = 0; hops < 4; hops++) {
    if (infos().has(current)) return current;
    const next = table[current];
    if (!next) return undefined;
    current = next;
  }
  return undefined;
}

export function iconInfo(id: string): IconInfo | undefined {
  const resolved = resolveIcon(id);
  return resolved ? infos().get(resolved) : undefined;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length] ?? 0;
}

const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

export interface SearchOptions {
  pack?: string;
  type?: string;
  limit?: number;
}

const collapse = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const VENDOR_PREFIX = /^(aws|amazon|azure|microsoft|google|cloud)\s+/i;
const VENDOR_SLUG = /^(aws|amazon|azure|microsoft|google|gcp)/;
const OFFICIAL = new Set(["aws", "azure", "gcp", "k8s", "github"]);
const PACK_WEIGHT: Record<string, number> = {
  aws: 10,
  azure: 10,
  gcp: 10,
  k8s: 10,
  github: 5,
  ibm: 4,
  logos: 6,
  si: 3,
  tabler: 0,
};
const TYPE_WEIGHT: Record<string, number> = {
  service: 4,
  logo: 3,
  resource: 1,
  glyph: 0,
  category: -6,
  group: -6,
};

let brands: string[] | undefined;
/** Collapsed names of every third-party logo, to tell "redis" (a product) from "s3" (a service). */
function brandNames(): string[] {
  brands ??= [...infos().values()]
    .filter((i) => i.pack === "logos" || i.pack === "si")
    .flatMap((i) => [collapse(i.slug), collapse(i.name)]);
  return brands;
}

let aliasTargets: Map<string, string[]> | undefined;
function aliasesByTarget(): Map<string, string[]> {
  if (aliasTargets) return aliasTargets;
  aliasTargets = new Map();
  for (const [alias, target] of Object.entries(loadIndex().aliases)) {
    const list = aliasTargets.get(target) ?? [];
    list.push(alias.split(":")[1] ?? alias);
    aliasTargets.set(target, list);
  }
  return aliasTargets;
}

/** Ranked icon search over ids, aliases, official names, categories and keywords. */
export function searchIcons(query: string, opts: SearchOptions = {}): IconInfo[] {
  const q = clean(query);
  const [maybePack, rest] = q.includes(":") ? q.split(":", 2) : [undefined, q];
  const pack = opts.pack ?? (maybePack && PACK_ORDER.includes(maybePack) ? maybePack : undefined);
  const text = (rest ?? q).replace(/-/g, " ");
  const qTokens = tokens(text);
  if (!qTokens.length) return [];
  const joined = qTokens.join("-");
  const collapsedQ = qTokens.join("");
  // A product name ("redis", "postgres") should surface the product's logo before a cloud
  // service that has it as an alias. A vendor's own name for its service ("sqs", "vpc",
  // "kubernetes") should surface the official icon before the logo packs' unofficial copies.
  const productNamed = brandNames().some((b) => b.startsWith(collapsedQ));
  const officialHit = [...infos().values()].some((i) => {
    if (!OFFICIAL.has(i.pack)) return false;
    if (
      collapse(i.slug) === collapsedQ ||
      collapse(i.name.replace(VENDOR_PREFIX, "")) === collapsedQ
    )
      return true;
    return !productNamed && (aliasesByTarget().get(i.id) ?? []).includes(joined);
  });
  const brandish = !pack && collapsedQ.length >= 3 && productNamed && !officialHit;
  const scored: [number, IconInfo][] = [];
  for (const info of infos().values()) {
    if (pack && info.pack !== pack) continue;
    if (opts.type && info.type !== opts.type) continue;
    const alias = aliasesByTarget().get(info.id) ?? [];
    const keywordList = info.keywords.split(/\s+/).filter(Boolean);
    const hayTokens = new Set([
      ...tokens(info.slug),
      ...tokens(info.name),
      ...tokens(info.keywords),
      ...alias.flatMap(tokens),
    ]);
    let score = 0;
    let matched = 0;
    for (const t of qTokens) {
      if (hayTokens.has(t)) {
        matched += 1;
        score += 10;
      } else if (t.length >= 2 && [...hayTokens].some((h) => h.startsWith(t))) {
        matched += 1;
        score += 6;
      }
    }
    // "drawio" vs "draw.io", "dynamo db" vs "DynamoDB", "postgres" vs "PostgreSQL".
    const names = [info.slug, info.name, info.name.replace(VENDOR_PREFIX, ""), ...keywordList].map(
      collapse,
    );
    const isLogo = info.pack === "logos" || info.pack === "si";
    if (collapsedQ.length >= 3) {
      if (names.includes(collapsedQ)) {
        matched = qTokens.length;
        score = Math.max(score, 10 * qTokens.length) + 30 + (brandish && isLogo ? 20 : 0);
      } else if (names.some((n) => n.startsWith(collapsedQ))) {
        matched = qTokens.length;
        score = Math.max(score, 10 * qTokens.length) + 10 + (brandish && isLogo ? 20 : 0);
      }
    }
    if (!matched) continue;
    if (matched < qTokens.length) score -= 8 * (qTokens.length - matched);
    const slugBase = info.pack === "logos" ? info.slug.replace(/-icon$/, "") : info.slug;
    if (slugBase === joined) score += 40;
    if (alias.includes(joined)) score += brandish ? 8 : 40;
    const plainName = tokens(info.name.replace(VENDOR_PREFIX, "")).join("-");
    if (plainName === joined || tokens(info.name).join("-") === joined) score += 30;
    if (slugBase.startsWith(joined)) score += 6;
    score -= Math.min(10, hayTokens.size * 0.3);
    score += (TYPE_WEIGHT[info.type] ?? 0) + (PACK_WEIGHT[info.pack] ?? 0);
    // Square marks fit an icon slot; a wide wordmark ("logos:kafka") shrinks to a sliver.
    if (info.pack === "logos" && info.slug.endsWith("-icon")) score += 4;
    // Logo-pack copies of cloud icons ("logos:aws-sqs") never outrank the vendor's own.
    if (officialHit && !OFFICIAL.has(info.pack) && VENDOR_SLUG.test(info.slug)) score -= 25;
    scored.push([score, info]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].id.localeCompare(b[1].id));
  return scored.slice(0, opts.limit ?? 15).map(([, info]) => info);
}

/** Closest ids for an unknown icon, for "did you mean" fixes. */
export function suggestIcons(id: string, limit = 3): string[] {
  const q = clean(id);
  const [pack, slug = q] = q.includes(":") ? q.split(":", 2) : [undefined, q];
  const found = searchIcons(slug.replace(/-/g, " "), { limit: 30 });
  const ranked = found
    .map((info) => {
      let score = levenshtein(slug, info.slug);
      if (pack && info.pack !== pack) score += 4;
      return [score, info.id] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  const close: string[] = [];
  // Typos: nearest slugs inside the same pack by edit distance.
  if (pack) {
    const near = [...infos().values()]
      .filter((i) => i.pack === pack)
      .map((i) => [levenshtein(slug, i.slug), i.id] as const)
      .filter(([d]) => d <= Math.max(2, Math.floor(slug.length / 4)))
      .sort((a, b) => a[0] - b[0]);
    for (const [, nid] of near) if (!close.includes(nid)) close.push(nid);
  }
  for (const [, rid] of ranked) if (!close.includes(rid)) close.push(rid);
  return close.slice(0, limit);
}

export interface IconRender {
  viewBox: [number, number, number, number];
  body: string;
}

export interface IconPaint {
  theme: ThemeName;
  /** Background the icon sits on, for contrast fixes. */
  background: string;
  /** Text color of the theme, used for glyph sets. */
  ink: string;
  /** Explicit color from the spec. */
  color?: string;
}

/**
 * The icon's SVG body, ready to inline: ids made unique for this instance and monochrome glyphs
 * painted for the theme.
 */
const libEntries = new Map<string, PackEntry>();

function libraryEntry(info: IconInfo, lib: LibrarySource): PackEntry {
  const done = libEntries.get(info.id);
  if (done) return done;
  const set = loadedLibrary(info.pack);
  if (!set) throw new Error(`icon library ${lib.npm} is not loaded; call loadIconLibraries first`);
  const name = loadIndex().names?.[info.id] ?? `${info.slug}${lib.suffix ?? ""}`;
  const icon = libraryIcon(set, name, lib.mono);
  if (!icon) throw new Error(`icon ${info.id} missing from ${lib.npm}@${lib.version}`);
  const entry: PackEntry = { ...icon };
  if (lib.mono) entry.m = 1;
  const col = loadIndex().colors?.[info.id];
  if (col) entry.col = col;
  if (!lib.mono && allDark(icon.b)) entry.k = 1;
  libEntries.set(info.id, entry);
  return entry;
}

function packEntry(info: IconInfo): PackEntry {
  const lib = loadIndex().packs[info.pack]?.lib;
  if (lib) return libraryEntry(info, lib);
  const icons = loadPack(info.pack).icons;
  const own = icons[info.slug];
  const entry = own?.r ? icons[own.r] : own;
  if (!entry) throw new Error(`icon ${info.id} missing from ${info.pack}.json`);
  return entry;
}

/** Loads the npm libraries behind these icons (bundled packs need nothing). */
export async function loadIconLibraries(ids: Iterable<string>): Promise<void> {
  const packs = new Map<string, LibrarySource>();
  for (const id of ids) {
    const info = iconInfo(id);
    const lib = info ? loadIndex().packs[info.pack]?.lib : undefined;
    if (info && lib) packs.set(info.pack, lib);
  }
  await Promise.all([...packs].map(([pack, lib]) => loadLibrary(pack, lib)));
}

export function renderIcon(id: string, instance: string, paint: IconPaint): IconRender {
  const info = iconInfo(id);
  if (!info) throw new Error(`unknown icon ${id}`);
  const entry = packEntry(info);
  let body = paint.theme === "dark" && entry.d ? entry.d : entry.b;
  body = body.replaceAll("sdwid", `${instance}-`);
  if (entry.m) {
    let color = paint.color ?? entry.col ?? paint.ink;
    // Brand colors that vanish on the background (black marks on dark) fall back to the ink.
    if (contrast(color, paint.background) < 2.2) color = paint.ink;
    body = body.replaceAll("{{c}}", color);
  } else if (entry.k && paint.theme === "dark" && !entry.d) {
    // A black-only logo (and no official dark variant) would vanish; paint it in the ink color.
    const light = paint.color ?? mixHex(paint.ink, paint.background, 0.92);
    body = body.replace(/(fill|stroke|stop-color)="#(?:[0-9a-fA-F]{3}){1,2}"/g, `$1="${light}"`);
  }
  const vb = entry.v.split(/[\s,]+/).map(Number);
  return { viewBox: [vb[0] ?? 0, vb[1] ?? 0, vb[2] ?? 24, vb[3] ?? 24], body };
}

export function allIcons(): IconInfo[] {
  return [...infos().values()];
}
